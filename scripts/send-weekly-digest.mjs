import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { openDatabase } from "../backend/database.mjs";

const dryRun = process.argv.includes("--dry-run");
const dbPath = resolve(process.env.NIKE_DB_PATH || "./data/nike-ai.db");
const apiKey = String(process.env.RESEND_API_KEY || "").trim();
const from = String(process.env.WEEKLY_EMAIL_FROM || process.env.FEEDBACK_EMAIL_FROM || "").trim();
const baseUrl = String(process.env.PUBLIC_BASE_URL || "http://47.93.245.219").replace(/\/$/, "");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function digestKey(date = new Date()) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - first) / 86_400_000) + first.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toolList(items) {
  if (!items.length) return "<p>本周暂无需要提醒的工具更新。</p>";
  return `<ul>${items.map((tool) => `<li><a href="${baseUrl}/?q=${encodeURIComponent(tool.name)}#tools">${escapeHtml(tool.name)}</a>：${escapeHtml(tool.summary)}</li>`).join("")}</ul>`;
}

async function sendEmail(to, subject, html) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Resend ${response.status}`);
  return body.id || "";
}

const db = openDatabase(dbPath);
try {
  if (!apiKey || !from) {
    console.log(JSON.stringify({ skipped: true, reason: "email_not_configured" }));
    process.exitCode = 0;
  } else {
    const key = digestKey();
    const newTools = db.prepare(`SELECT id, name, summary FROM tools WHERE status = 'published' AND is_sponsored = 0
      AND content_updated_date >= date('now', '-6 days') ORDER BY content_updated_date DESC LIMIT 12`).all();
    const subscriptions = db.prepare(`SELECT subscriptions.id, subscriptions.email, subscriptions.user_id,
        COALESCE(preferences.weekly_digest, 1) AS weekly_digest,
        COALESCE(preferences.new_tool_alerts, 1) AS new_tool_alerts,
        COALESCE(preferences.favorite_update_alerts, 1) AS favorite_update_alerts
      FROM newsletter_subscriptions subscriptions
      LEFT JOIN user_notification_preferences preferences ON preferences.user_id = subscriptions.user_id
      WHERE subscriptions.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM email_delivery_log logs WHERE logs.subscription_id = subscriptions.id AND logs.digest_key = ?)
      ORDER BY subscriptions.updated_at ASC`).all(key);
    let sent = 0;
    for (const subscription of subscriptions) {
      if (!subscription.weekly_digest && !subscription.new_tool_alerts && !subscription.favorite_update_alerts) continue;
      const favoriteUpdates = subscription.user_id && subscription.favorite_update_alerts
        ? db.prepare(`SELECT tools.id, tools.name, tools.summary FROM user_favorites favorites
            JOIN tools ON tools.id = favorites.tool_id WHERE favorites.user_id = ? AND tools.status = 'published'
              AND tools.updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') ORDER BY tools.updated_at DESC LIMIT 10`).all(subscription.user_id)
        : [];
      const sections = [];
      if (subscription.new_tool_alerts || subscription.weekly_digest) sections.push(`<h2>本周新增与更新</h2>${toolList(newTools)}`);
      if (subscription.favorite_update_alerts && subscription.user_id) sections.push(`<h2>你收藏的工具动态</h2>${toolList(favoriteUpdates)}`);
      const html = `<main><h1>泥壳AI工具周报</h1><p>本周值得关注的工具变化已经整理完成。</p>${sections.join("")}<p><a href="${baseUrl}/auth.html">管理订阅与提醒</a></p></main>`;
      const providerId = dryRun ? `dry-${createHash("sha256").update(subscription.email).digest("hex").slice(0, 10)}` : await sendEmail(subscription.email, "泥壳AI工具周报｜本周新增与收藏更新", html);
      if (!dryRun) db.prepare("INSERT INTO email_delivery_log (id, subscription_id, digest_key, provider_message_id) VALUES (?, ?, ?, ?)").run(randomUUID(), subscription.id, key, providerId);
      sent += 1;
    }
    console.log(JSON.stringify({ dryRun, digestKey: key, recipients: subscriptions.length, sent, newTools: newTools.length }));
  }
} finally {
  db.close();
}
