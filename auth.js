(() => {
  "use strict";

  const tabs = document.getElementById("auth-tabs");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const message = document.getElementById("auth-message");
  const accountPanel = document.getElementById("account-panel");
  const accountName = document.getElementById("account-name");
  const accountEmail = document.getElementById("account-email");
  const accountFavorites = document.getElementById("account-favorites");
  const accountRatings = document.getElementById("account-ratings");
  const accountFeedback = document.getElementById("account-feedback");
  const accountSubmissions = document.getElementById("account-submissions");
  const accountHistoryCount = document.getElementById("account-history-count");
  const accountNewsletter = document.getElementById("account-newsletter");
  const accountSectionTabs = document.getElementById("account-section-tabs");
  const accountActivityList = document.getElementById("account-activity-list");
  const accountLoading = document.getElementById("account-loading");
  const deleteAccountToggle = document.getElementById("delete-account-toggle");
  const deleteAccountForm = document.getElementById("delete-account-form");
  const adminEntry = document.getElementById("admin-entry");
  const logoutButton = document.getElementById("logout-button");
  const adminAuthPanel = document.getElementById("admin-auth-panel");
  const adminAuthForm = document.getElementById("admin-auth-form");
  const nextPath = (() => {
    const value = new URLSearchParams(location.search).get("next") || "/";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  })();
  const adminMode = new URLSearchParams(location.search).get("mode") === "admin";
  let accountActivity = null;
  let activeAccountSection = "favorites";

  function refreshIcons() {
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
  }

  function showMessage(text, success = false) {
    message.textContent = text;
    message.classList.toggle("is-success", success);
    message.hidden = !text;
  }

  function setMode(mode) {
    const register = mode === "register";
    loginForm.hidden = register;
    registerForm.hidden = !register;
    tabs.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    showMessage("");
    history.replaceState(null, "", register ? "#register" : "#login");
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.title || "请求失败，请稍后重试");
      error.code = payload.code;
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function showAccount(user) {
    tabs.hidden = true;
    loginForm.hidden = true;
    registerForm.hidden = true;
    showMessage("");
    accountName.textContent = user.displayName;
    accountEmail.textContent = user.email;
    adminEntry.hidden = user.role !== "admin";
    accountPanel.hidden = false;
    document.body.classList.add("is-account");
  }

  async function loadAccountSummary() {
    try {
      const data = await api("/api/v1/account/summary", { method: "GET" });
      accountFavorites.textContent = String(data.favorites || 0);
      accountRatings.textContent = String(data.ratings || 0);
      accountFeedback.textContent = String(data.feedback || 0);
      accountSubmissions.textContent = String(data.submissions || 0);
      accountHistoryCount.textContent = String(data.history || 0);
      accountNewsletter.textContent = data.newsletter ? "已订阅" : "未订阅";
    } catch {}
  }

  const feedbackStatusLabels = {
    pending: "已收到",
    reviewed: "审核中",
    resolved: "已处理",
    replied: "已回复",
    archived: "已归档"
  };

  const submissionStatusLabels = {
    pending: "审核中",
    approved: "已收录",
    rejected: "未通过",
    duplicate: "重复投稿"
  };

  function emptyState(text) {
    const empty = document.createElement("p");
    empty.className = "account-empty";
    empty.textContent = text;
    accountActivityList.append(empty);
  }

  function toolItem(tool, detail = "") {
    const item = document.createElement("a");
    item.className = "account-activity-item";
    item.href = `/?q=${encodeURIComponent(tool.name)}#tools`;
    const title = document.createElement("strong");
    title.textContent = tool.name;
    const meta = document.createElement("span");
    meta.textContent = detail || tool.summary || "查看工具详情";
    item.append(title, meta);
    return item;
  }

  function renderAccountActivity() {
    if (!accountActivity) return;
    accountActivityList.replaceChildren();
    const items = accountActivity[activeAccountSection];
    if (["favorites", "ratings", "history"].includes(activeAccountSection)) {
      if (!items?.length) emptyState(activeAccountSection === "history" ? "还没有浏览记录" : "这里还没有内容");
      items?.forEach((tool) => {
        const detail = activeAccountSection === "ratings"
          ? `你的评分：${tool.rating} 星`
          : activeAccountSection === "history" ? `最近浏览：${new Date(tool.viewedAt).toLocaleString("zh-CN")}` : tool.summary;
        accountActivityList.append(toolItem(tool, detail));
      });
      if (activeAccountSection === "history" && items?.length) {
        const clear = document.createElement("button");
        clear.className = "account-text-button";
        clear.type = "button";
        clear.dataset.accountAction = "clear-history";
        clear.textContent = "清空浏览历史";
        accountActivityList.append(clear);
      }
      return;
    }
    if (activeAccountSection === "feedback") {
      if (!items?.length) emptyState("还没有提交反馈");
      items?.forEach((entry) => {
        const item = document.createElement("article");
        item.className = "account-activity-item";
        const title = document.createElement("strong");
        title.textContent = feedbackStatusLabels[entry.status] || entry.status;
        const text = document.createElement("span");
        text.textContent = entry.message;
        const time = document.createElement("small");
        time.textContent = new Date(entry.submittedAt).toLocaleString("zh-CN");
        item.append(title, text, time);
        accountActivityList.append(item);
      });
      return;
    }
    if (activeAccountSection === "submissions") {
      if (!items?.length) emptyState("还没有提交工具");
      items?.forEach((entry) => {
        const item = document.createElement("article");
        item.className = "account-activity-item";
        const title = document.createElement("strong");
        title.textContent = entry.name;
        const status = document.createElement("span");
        status.textContent = `${submissionStatusLabels[entry.status] || entry.status} · ${entry.trackingCode}`;
        item.append(title, status);
        accountActivityList.append(item);
      });
      return;
    }
    const subscription = accountActivity.newsletter;
    if (!subscription || subscription.status !== "active") {
      emptyState("当前未订阅周报，可在首页输入邮箱订阅");
      return;
    }
    const item = document.createElement("article");
    item.className = "account-activity-item";
    const title = document.createElement("strong");
    title.textContent = "周报订阅已开启";
    const meta = document.createElement("span");
    meta.textContent = `订阅时间：${new Date(subscription.subscribedAt).toLocaleString("zh-CN")}`;
    const unsubscribe = document.createElement("button");
    unsubscribe.className = "account-text-button";
    unsubscribe.type = "button";
    unsubscribe.dataset.accountAction = "unsubscribe";
    unsubscribe.textContent = "取消周报订阅";
    const preferences = document.createElement("div");
    preferences.className = "notification-preferences";
    const settings = [
      ["weeklyDigest", "每周精选周报"],
      ["newToolAlerts", "新工具速递"],
      ["favoriteUpdateAlerts", "收藏工具更新提醒"]
    ];
    settings.forEach(([key, label]) => {
      const row = document.createElement("label");
      const input = document.createElement("input"); input.type = "checkbox"; input.dataset.notificationKey = key; input.checked = Boolean(accountActivity.notifications?.[key]);
      const text = document.createElement("span"); text.textContent = label; row.append(input, text); preferences.append(row);
    });
    const save = document.createElement("button"); save.className = "account-text-button"; save.type = "button"; save.dataset.accountAction = "save-notifications"; save.textContent = "保存通知设置";
    preferences.append(save);
    item.append(title, meta, preferences, unsubscribe);
    accountActivityList.append(item);
  }

  async function loadAccountActivity() {
    accountLoading.hidden = false;
    try {
      accountActivity = await api("/api/v1/account/activity", { method: "GET" });
      renderAccountActivity();
    } catch (error) {
      emptyState(errorMessage(error));
    } finally {
      accountLoading.hidden = true;
    }
  }

  function showAdminAuth() {
    tabs.hidden = true;
    loginForm.hidden = true;
    registerForm.hidden = true;
    accountPanel.hidden = true;
    adminAuthPanel.hidden = false;
  }

  function errorMessage(error) {
    const messages = {
      email_registered: "这个邮箱已经注册，可以直接登录。",
      invalid_credentials: "邮箱或密码不正确。",
      invalid_email: "请输入有效的邮箱地址。",
      invalid_password: "密码需要 10-128 个字符。",
      consent_required: "请先同意隐私政策。",
      rate_limited: "操作过于频繁，请稍后再试。"
    };
    return messages[error.code] || error.message || "请求失败，请稍后重试。";
  }

  async function submitForm(form, path, body) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage("");
    try {
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      showMessage("登录成功，正在返回工具库。", true);
      window.setTimeout(() => { location.href = nextPath; }, 500);
      return data;
    } catch (error) {
      showMessage(errorMessage(error));
      return null;
    } finally {
      button.disabled = false;
    }
  }

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-auth-mode]");
    if (button) setMode(button.dataset.authMode);
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    void submitForm(loginForm, "/api/v1/auth/login", {
      email: String(data.get("email") || ""),
      password: String(data.get("password") || "")
    });
  });

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    const password = String(data.get("password") || "");
    if (password !== String(data.get("confirmPassword") || "")) {
      showMessage("两次输入的密码不一致。");
      return;
    }
    void submitForm(registerForm, "/api/v1/auth/register", {
      displayName: String(data.get("displayName") || ""),
      email: String(data.get("email") || ""),
      password,
      consentAccepted: data.get("consentAccepted") === "on",
      termsAccepted: data.get("consentAccepted") === "on",
      consentVersion: "2026-07"
    });
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
      accountPanel.hidden = true;
      document.body.classList.remove("is-account");
      tabs.hidden = false;
      setMode("login");
      showMessage("已退出登录。", true);
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      logoutButton.disabled = false;
    }
  });

  accountSectionTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-account-section]");
    if (!button) return;
    activeAccountSection = button.dataset.accountSection;
    accountSectionTabs.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    renderAccountActivity();
  });

  accountActivityList.addEventListener("click", async (event) => {
    const action = event.target.closest("button[data-account-action]")?.dataset.accountAction;
    if (!action) return;
    event.preventDefault();
    try {
      if (action === "clear-history") await api("/api/v1/account/history", { method: "DELETE", body: "{}" });
      if (action === "unsubscribe") await api("/api/v1/account/newsletter", { method: "DELETE", body: "{}" });
      if (action === "save-notifications") {
        const values = {};
        accountActivityList.querySelectorAll("[data-notification-key]").forEach((input) => { values[input.dataset.notificationKey] = input.checked; });
        await api("/api/v1/account/notifications", { method: "PATCH", body: JSON.stringify(values) });
      }
      await Promise.all([loadAccountSummary(), loadAccountActivity()]);
      const messages = { "clear-history": "浏览历史已清空。", unsubscribe: "周报订阅已取消。", "save-notifications": "通知设置已保存。" };
      showMessage(messages[action], true);
    } catch (error) {
      showMessage(errorMessage(error));
    }
  });

  deleteAccountToggle.addEventListener("click", () => {
    deleteAccountForm.hidden = !deleteAccountForm.hidden;
    if (!deleteAccountForm.hidden) document.getElementById("delete-account-confirmation").focus();
  });

  deleteAccountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const confirmation = document.getElementById("delete-account-confirmation").value;
    const button = deleteAccountForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("/api/v1/account", { method: "DELETE", body: JSON.stringify({ confirmation }) });
      location.href = "/auth.html#register";
    } catch (error) {
      showMessage(errorMessage(error));
      button.disabled = false;
    }
  });

  adminAuthForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = adminAuthForm.querySelector('button[type="submit"]');
    const token = String(new FormData(adminAuthForm).get("token") || "").trim();
    button.disabled = true;
    showMessage("");
    try {
      const response = await fetch("/api/admin/v1/summary", { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("管理员令牌不正确");
      sessionStorage.setItem("nike-admin-token", token);
      location.href = nextPath;
    } catch (error) {
      showMessage(error.message || "管理员认证失败");
    } finally {
      button.disabled = false;
    }
  });

  async function initialize() {
    refreshIcons();
    if (adminMode) {
      showAdminAuth();
      return;
    }
    try {
      const data = await api("/api/v1/auth/me", { method: "GET", headers: { "Content-Type": "application/json" } });
      showAccount(data.user);
      void Promise.all([loadAccountSummary(), loadAccountActivity()]);
    } catch {
      setMode(location.hash === "#register" ? "register" : "login");
    }
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
