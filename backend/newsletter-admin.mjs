import { escapeLikePattern } from './like-pattern.mjs';
import { HttpError } from './validation.mjs';

export function listNewsletterSubscriptions(db, params) {
  const status = params.get('status') || 'all';
  const offset = Number(params.get('offset') || 0);
  const query = (params.get('q') || '').trim();
  if (!['all', 'active', 'unsubscribed', 'suppressed'].includes(status) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || query.length > 254) {
    throw new HttpError(422, 'invalid_newsletter_filter', '订阅筛选或分页参数无效');
  }
  const filters = [], args = [], limit = 20;
  if (status !== 'all') { filters.push('s.status = ?'); args.push(status); }
  if (query) { filters.push("s.normalized_email LIKE ? ESCAPE '!'"); args.push('%' + escapeLikePattern(query.toLowerCase()) + '%'); }
  const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
  const total = Number(db.prepare('SELECT COUNT(*) AS count FROM newsletter_subscriptions s' + where).get(...args).count);
  const items = db.prepare(`SELECT s.id,s.email,s.status,s.source,s.consent_at AS subscribedAt,s.unsubscribed_at AS unsubscribedAt,
    u.display_name AS accountName,
    (SELECT MAX(sent_at) FROM email_delivery_log logs WHERE logs.subscription_id=s.id) AS lastSentAt
    FROM newsletter_subscriptions s LEFT JOIN users u ON u.id=s.user_id${where}
    ORDER BY s.consent_at DESC,s.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const counts = { active: 0, unsubscribed: 0, suppressed: 0 };
  for (const row of db.prepare('SELECT status,COUNT(*) AS count FROM newsletter_subscriptions GROUP BY status').all()) counts[row.status] = Number(row.count);
  return { items, total, counts, limit, offset };
}
