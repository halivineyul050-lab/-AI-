const categoryLabels = {
  content: "内容不准确",
  bug: "页面或功能问题",
  suggestion: "功能建议",
  cooperation: "合作咨询",
  other: "其他"
};

export async function notifyFeedbackEmail(feedback, env = process.env, logger = console, { fetchImpl = fetch } = {}) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const to = String(env.FEEDBACK_EMAIL_TO || "").trim();
  const from = String(env.FEEDBACK_EMAIL_FROM || env.AUTH_EMAIL_FROM || "").trim();
  if (!apiKey || !to || !from) return { sent: false, skipped: true, reason: "email_not_configured" };
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[泥壳AI] 新反馈：${categoryLabels[feedback.category] || feedback.category}`,
      text: [
        `反馈类型：${categoryLabels[feedback.category] || feedback.category}`,
        `提交时间：${feedback.submittedAt}`,
        `提交页面：${feedback.pageUrl || "未提供"}`,
        `联系邮箱：${feedback.contactEmail || "未提供"}`,
        "",
        feedback.message
      ].join("\n")
    })
  });
  if (!response.ok) throw new Error(`Resend email returned ${response.status}`);
  const receipt = await response.json();
  if (typeof receipt?.id !== "string" || !receipt.id) throw new Error("Resend email delivery unconfirmed");
  logger.info?.(`[feedback-email] sent ${feedback.id} message ${receipt.id}`);
  return { sent: true, messageId: receipt.id };
}
