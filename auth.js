(() => {
  "use strict";

  const tabs = document.getElementById("auth-tabs");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const message = document.getElementById("auth-message");
  const accountPanel = document.getElementById("account-panel");
  const accountName = document.getElementById("account-name");
  const accountEmail = document.getElementById("account-email");
  const logoutButton = document.getElementById("logout-button");

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
    accountPanel.hidden = false;
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
      window.setTimeout(() => { location.href = "/"; }, 500);
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
      consentVersion: "2026-07"
    });
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
      accountPanel.hidden = true;
      tabs.hidden = false;
      setMode("login");
      showMessage("已退出登录。", true);
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      logoutButton.disabled = false;
    }
  });

  async function initialize() {
    refreshIcons();
    try {
      const data = await api("/api/v1/auth/me", { method: "GET", headers: { "Content-Type": "application/json" } });
      showAccount(data.user);
    } catch {
      setMode(location.hash === "#register" ? "register" : "login");
    }
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
