import { HttpError } from './validation.mjs';

const RESULT_TTL_MS = 15 * 60_000;
const TIMING_WINDOW_MS = 7 * 24 * 60 * 60_000;

function settlement(row) {
  if (row.settled_at == null) return { settled: false, charged: null, released: null };
  const charged = Number(row.unit_credits) * Number(row.success_count);
  return { settled: true, charged, released: Number(row.reserved_credits) - charged };
}

function quantile(values, fraction) {
  const position = (values.length - 1) * fraction;
  const lower = Math.floor(position);
  return Math.round((values[lower] + (values[Math.ceil(position)] - values[lower]) * (position - lower)) * 10) / 10;
}

function publicResult(data) {
  const { generationId, historySaved } = data;
  const { balance, frozen, charged, refunded } = data.credits;
  return {
    generationId, historySaved, credits: { balance, frozen, charged, refunded },
    ...(data.warning ? { warning: data.warning } : {}),
    images: data.images.map(({ id, mimeType, expiresAt, url }) => ({ id, mimeType, expiresAt, url }))
  };
}

export function createImageJobStore(db, creditStore) {
  const exactOwner = db.backend === 'mariadb' ? 'BINARY user_id = BINARY ?' : 'user_id = ?';
  const find = id => db.prepare(`SELECT j.*, r.settled_at, r.success_count
    FROM image_generation_jobs j JOIN credit_reservations r ON r.id=j.reservation_id WHERE j.id=?`).get(id);
  const markFailed = (id, error) => {
    const { status, code, message } = error;
    db.prepare("UPDATE image_generation_jobs SET state='failed', error_json=?, completed_at=?, expires_at=? WHERE id=? AND state='pending'")
      .run(JSON.stringify({ status, code, message }), new Date().toISOString(), Date.now() + RESULT_TTL_MS, id);
  };
  const store = {
    summary(userId) {
      const everSucceeded = Boolean(db.prepare(`SELECT 1 FROM credit_reservations WHERE ${exactOwner} AND settled_at IS NOT NULL AND success_count>0 LIMIT 1`).get(userId));
      const jobOwner = db.backend === 'mariadb' ? 'BINARY j.user_id = BINARY ?' : 'j.user_id = ?';
      const pendingJobs = db.prepare(`SELECT j.id, r.model_record_id, j.created_at FROM image_generation_jobs j
        JOIN credit_reservations r ON r.id=j.reservation_id WHERE ${jobOwner} AND j.state='pending' ORDER BY j.created_at,j.id`).all(userId)
        .map(row => ({ id: row.id, modelRecordId: row.model_record_id, createdAt: row.created_at }));
      // Aggregate anonymous service timings across accounts; no content or account identifiers leave this method.
      const rows = db.prepare(`SELECT r.model_record_id,j.created_at,j.completed_at FROM image_generation_jobs j
        JOIN credit_reservations r ON r.id=j.reservation_id WHERE j.state='complete' AND r.success_count>0
        AND r.settled_at IS NOT NULL AND j.completed_at>=? AND r.model_record_id IS NOT NULL`).all(new Date(Date.now() - TIMING_WINDOW_MS).toISOString());
      const samples = new Map();
      for (const row of rows) {
        const seconds = (Date.parse(row.completed_at) - Date.parse(row.created_at)) / 1000;
        if (!Number.isFinite(seconds) || seconds <= 0) continue;
        if (!samples.has(row.model_record_id)) samples.set(row.model_record_id, []);
        samples.get(row.model_record_id).push(seconds);
      }
      const timings = [...samples].filter(([, values]) => values.length >= 20).map(([modelRecordId, values]) => {
        values.sort((a, b) => a - b);
        return { modelRecordId, minSeconds: quantile(values, .2), maxSeconds: quantile(values, .8), sampleCount: values.length };
      }).sort((a, b) => a.modelRecordId.localeCompare(b.modelRecordId));
      return { everSucceeded, pendingJobs, timings };
    },
    assertCapacity(userId) {
      const total = Number(db.prepare("SELECT COUNT(*) AS count FROM image_generation_jobs WHERE state='pending'").get().count);
      const owned = Number(db.prepare(`SELECT COUNT(*) AS count FROM image_generation_jobs WHERE ${exactOwner} AND state='pending'`).get(userId).count);
      if (total >= 200 || owned >= 2) throw new HttpError(429, 'image_jobs_busy', '已有图片正在生成，请等待完成后再试。');
    },
    reserve(userId, input, id) {
      return creditStore.reserve(userId, input, reservation => {
        store.assertCapacity(userId);
        db.prepare('INSERT INTO image_generation_jobs(id,user_id,reservation_id,state,created_at,expires_at) VALUES(?,?,?,?,?,?)')
          .run(id, userId, reservation.id, 'pending', new Date().toISOString(), Date.now() + RESULT_TTL_MS);
      });
    },
    get(id, userId) {
      const jobOwner = db.backend === 'mariadb' ? 'BINARY j.user_id = BINARY ?' : 'j.user_id = ?';
      const row = db.prepare(`SELECT j.*,r.settled_at,r.success_count,r.unit_credits,r.reserved_credits
        FROM image_generation_jobs j JOIN credit_reservations r ON r.id=j.reservation_id WHERE j.id=? AND ${jobOwner}`).get(id, userId);
      if (!row || (row.state !== 'pending' && Number(row.expires_at) <= Date.now())) return null;
      return {
        id: row.id, reservationId: row.reservation_id, state: row.state,
        data: row.response_json ? JSON.parse(row.response_json) : null,
        error: row.error_json ? JSON.parse(row.error_json) : null,
        settlement: settlement(row)
      };
    },
    complete(id, data) {
      db.prepare("UPDATE image_generation_jobs SET state='complete', response_json=?, completed_at=?, expires_at=? WHERE id=? AND state='pending'")
        .run(JSON.stringify(publicResult(data)), new Date().toISOString(), Date.now() + RESULT_TTL_MS, id);
    },
    fail(id, error) {
      const row = find(id);
      if (!row || row.state !== 'pending') return;
      if (row.settled_at === null) creditStore.settle(row.reservation_id, 0, () => markFailed(id, error));
      else markFailed(id, error); // A persisted charge must never be undone by an unrelated response/storage error.
    },
    recover() {
      // Startup only, after the previous single application instance has stopped. Never replay providers.
      const pending = db.prepare("SELECT id FROM image_generation_jobs WHERE state='pending'").all();
      for (const { id } of pending) {
        const row = find(id);
        const charged = row.settled_at !== null && Number(row.success_count) > 0;
        store.fail(id, {
          status: 503, code: 'image_job_interrupted',
          message: charged ? '服务重启，任务响应中断。已记录生成扣费，请先查看账号云历史；若无图片，请联系管理员核对。'
            : '服务重启，生成任务已中断，预留积分已释放，请重新生成。'
        });
      }
      return pending.length;
    },
    isPendingReservation(id) {
      return Boolean(db.prepare("SELECT 1 FROM image_generation_jobs WHERE reservation_id=? AND state='pending'").get(id));
    },
    prune() {
      // Keep only timing metadata beyond the short result TTL, so seven-day timing samples survive polling.
      db.prepare("UPDATE image_generation_jobs SET response_json=NULL,error_json=NULL WHERE state<>'pending' AND expires_at<=? AND (response_json IS NOT NULL OR error_json IS NOT NULL)").run(Date.now());
      db.prepare("DELETE FROM image_generation_jobs WHERE state<>'pending' AND completed_at<?").run(new Date(Date.now() - TIMING_WINDOW_MS).toISOString());
    }
  };
  return store;
}
