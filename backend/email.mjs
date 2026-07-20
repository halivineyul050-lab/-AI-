const categoryLabels = {
  content: "内容不准确",
  bug: "页面或功能问题",
  suggestion: "功能建议",
  cooperation: "合作咨询",
  other: "其他"
};

export async function notifyFeedbackEmail(feedback, env = process.env, logger = console) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const to = String(env.FEEDBACK_EMAIL_TO || "").trim();
  const from = String(env.FEEDBACK_EMAIL_FROM || "onboarding@resend.dev").trim();
  if (!apiKey || !to) return { sent: false, skipped: true, reason: "email_not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
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
      ].join("\\n")
    })
  });
  if (!response.ok) throw new Error(`Resend email returned ${response.status}`);
  logger.info?.(`[feedback-email] sent ${feedback.id}`);
  return { sent: true };
}
