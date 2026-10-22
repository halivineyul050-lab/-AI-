import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export function newsletterUnsubscribeToken(id, env = process.env) {
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return "";
  return createHmac("sha256",key).update("newsletter-unsubscribe:" + id).digest("hex");
}

export function verifyNewsletterUnsubscribeToken(id, token, env = process.env) {
  const expected = newsletterUnsubscribeToken(id,env);
  return Boolean(expected && /^[a-f0-9]{64}$/.test(token || "") && timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(token,"hex")));
}

const escapeHtml = value => String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

export function digestKey(date = new Date()) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - first) / 86400000) + first.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function runWeeklyDigest({ db, env = process.env, dryRun = false, recipient = "", fetchImpl = fetch, logger = console, now = new Date() }) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const from = String(env.WEEKLY_EMAIL_FROM || env.FEEDBACK_EMAIL_FROM || env.AUTH_EMAIL_FROM || "").trim();
  const baseUrl = String(env.PUBLIC_BASE_URL || "https://ontimo.cn").replace(/\/$/, "");
  const key = digestKey(now);
  if (!dryRun && (!apiKey || !from)) return { skipped:true, reason:"email_not_configured", failed:1, sent:0 };
  const tools = db.prepare(`SELECT id, slug, name, summary FROM tools WHERE status = 'published' AND is_sponsored = 0
    AND content_updated_date >= date('now', '-6 days') ORDER BY editor_score DESC, content_updated_date DESC, id LIMIT 12`).all();
  const newTools = db.prepare(`SELECT id, slug, name, summary FROM tools WHERE status = 'published' AND is_sponsored = 0
    AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') ORDER BY created_at DESC, id LIMIT 12`).all();
  const subscriptions = db.prepare(`SELECT subscriptions.id, subscriptions.email, subscriptions.user_id,
      COALESCE(preferences.weekly_digest, 1) AS weekly_digest,
      COALESCE(preferences.new_tool_alerts, 1) AS new_tool_alerts,
      COALESCE(preferences.favorite_update_alerts, 1) AS favorite_update_alerts
    FROM newsletter_subscriptions subscriptions
    LEFT JOIN user_notification_preferences preferences ON preferences.user_id = subscriptions.user_id
    LEFT JOIN users ON users.id = subscriptions.user_id
    WHERE subscriptions.status = 'active' AND (subscriptions.user_id IS NULL OR users.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM email_delivery_log logs WHERE logs.subscription_id = subscriptions.id AND logs.digest_key = ?)
    ORDER BY subscriptions.updated_at ASC`).all(key).filter(s => !recipient || s.email.toLowerCase() === recipient.toLowerCase());
  let sent = 0, failed = 0;
  const url = tool => `${baseUrl}/tools/${encodeURIComponent(tool.slug || tool.id)}`;
  for (const sub of subscriptions) {
    if (!sub.weekly_digest && !sub.new_tool_alerts && !sub.favorite_update_alerts) continue;
    const sections = [];
    if (sub.weekly_digest) sections.push({heading:"每周精选",items:tools});
    if (sub.new_tool_alerts) sections.push({heading:"新工具速递",items:newTools});
    if (sub.favorite_update_alerts && sub.user_id) {
      const favorites = db.prepare(`SELECT tools.id, tools.slug, tools.name, tools.summary FROM user_favorites favorites
        JOIN tools ON tools.id = favorites.tool_id WHERE favorites.user_id = ? AND tools.status = 'published'
          AND tools.updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') ORDER BY tools.updated_at DESC LIMIT 10`).all(sub.user_id);
      sections.push({heading:"你收藏的工具动态",items:favorites});
    }
    if (!sections.length) continue;
    const unsubscribeUrl = baseUrl + "/newsletter/unsubscribe?id=" + encodeURIComponent(sub.id) + "&token=" + newsletterUnsubscribeToken(sub.id,env);
    const html = `<main><h1>泥壳AI工具周报</h1><p>本周值得关注的工具变化已经整理完成。</p>${sections.map(s=>`<h2>${s.heading}</h2>${s.items.length ? `<ul>${s.items.map(t=>`<li><a href="${escapeHtml(url(t))}">${escapeHtml(t.name)}</a>：${escapeHtml(t.summary)}</li>`).join("")}</ul>` : "<p>本周暂无需要提醒的工具更新。</p>"}`).join("")}<p>你收到此邮件是因为订阅了泥壳AI周报。<a href="${escapeHtml(baseUrl)}/auth.html">管理通知设置</a> · <a href="${escapeHtml(unsubscribeUrl)}">取消周报订阅</a></p></main>`;
    const text = ["泥壳AI工具周报",...sections.flatMap(s=>[s.heading,...(s.items.length?s.items.map(t=>`${t.name}：${t.summary} ${url(t)}`):["本周暂无需要提醒的工具更新。"])]),`管理通知设置：${baseUrl}/auth.html\n取消周报订阅：${unsubscribeUrl}`].join("\n\n");
    try {
      if (!dryRun) {
        const response = await fetchImpl("https://api.resend.com/emails", {
          method:"POST", signal:AbortSignal.timeout(15000),
          headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`weekly-${key}-${createHash("sha256").update(sub.id).digest("hex")}`},
          body:JSON.stringify({from,to:[sub.email],subject:"泥壳AI工具周报｜本周精选与工具动态",html,text})
        });
        if (!response.ok) throw Error(`Email provider returned ${response.status}`);
        const receipt = await response.json();
        if (typeof receipt?.id !== "string" || !receipt.id) throw Error("Email receipt missing");
        db.prepare("INSERT INTO email_delivery_log (id, subscription_id, digest_key, provider_message_id) VALUES (?, ?, ?, ?)").run(randomUUID(),sub.id,key,receipt.id);
        logger.info?.(`[weekly-digest] sent ${sub.id} message ${receipt.id}`);
      }
      sent++;
    } catch {
      failed++;
      logger.error?.(`[weekly-digest] failed subscription ${sub.id}`);
    }
  }
  return {dryRun,digestKey:key,recipients:subscriptions.length,sent,failed,newTools:newTools.length};
}
