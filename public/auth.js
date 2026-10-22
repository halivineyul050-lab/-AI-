import { resolveAuthNextPath } from "./auth-redirect.mjs";
const safeSessionStorage = window.nikaiStorage.session;

(() => {
  "use strict";

  const tabs = document.getElementById("auth-tabs");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const resetForm = document.getElementById("reset-form");
  const verifyEmailForm = document.getElementById("verify-email-form");
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
  const adminAccountForm = document.getElementById("admin-account-form");
  const adminAuthForm = document.getElementById("admin-auth-form");
  const nextPath = (() => {
    return resolveAuthNextPath(new URLSearchParams(location.search).get("next"), location.origin);
  })();
  const adminMode = new URLSearchParams(location.search).get("mode") === "admin";
  let accountActivity = null;
  let activeAccountSection = "favorites";
  let accountImages = null;
  let imageHistoryLoading = false;
  let imageHistoryError = "";
  let imageHistoryVersion = 0;
  const accountAvatar = document.getElementById("account-avatar");
  const avatarForm = document.getElementById("avatar-form");
  const avatarFile = document.getElementById("avatar-file");
  const avatarSave = document.getElementById("avatar-save");
  const avatarCancel = document.getElementById("avatar-cancel");
  const avatarReset = document.getElementById("avatar-reset");
  const avatarMessage = document.getElementById("avatar-message");
  let accountUser = null;
  let avatarPreview = "";
  let selectedAvatar = null;
  let avatarVersion = 0;

  function avatarStatus(text) {
    avatarMessage.textContent = text;
    avatarMessage.hidden = !text;
  }

  function renderAvatar(user, preview = "") {
    const initial = Array.from(user?.displayName?.trim() || "用户")[0].toLocaleUpperCase();
    accountAvatar.textContent = initial;
    const url = preview || (/^\/api\/v1\/account\/avatar\?v=[a-f0-9-]{36}$/.test(user?.avatarUrl || "") ? user.avatarUrl : "");
    if (url) {
      const image = document.createElement("img");
      image.alt = "我的头像";
      image.addEventListener("error", () => {
        if (accountAvatar.children[0] === image) {
          accountAvatar.textContent = initial;
          if (preview) { selectedAvatar = null; avatarSave.hidden = true; avatarStatus("图片无法预览，请重新选择"); }
        }
      }, { once: true });
      image.src = url;
      accountAvatar.replaceChildren(image);
    }
    avatarReset.hidden = !user?.avatarUrl || Boolean(preview);
  }

  function clearAvatarSelection() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    avatarPreview = "";
    selectedAvatar = null;
    avatarFile.value = "";
    avatarSave.hidden = true;
    avatarCancel.hidden = true;
  }

  function setAvatarBusy(busy) {
    for (const control of [avatarFile, avatarSave, avatarCancel, avatarReset]) control.disabled = busy;
  }

  avatarFile.addEventListener("change", () => {
    const file = avatarFile.files?.[0];
    clearAvatarSelection();
    renderAvatar(accountUser);
    avatarStatus("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { avatarStatus("请选择 JPG、PNG 或 WebP 图片"); return; }
    if (!file.size || file.size > 2 * 1024 * 1024) { avatarStatus("头像图片不能超过 2MB，请选择较小的图片"); return; }
    selectedAvatar = file;
    avatarPreview = URL.createObjectURL(file);
    renderAvatar(accountUser, avatarPreview);
    avatarSave.hidden = false;
    avatarCancel.hidden = false;
    avatarStatus("这是预览，点击“保存头像”后生效");
  });

  avatarCancel.addEventListener("click", () => {
    clearAvatarSelection(); renderAvatar(accountUser); avatarStatus("");
  });

  async function saveAvatar(reset = false) {
    if (!accountUser || (!reset && !selectedAvatar) || avatarSave.disabled) return;
    const version = ++avatarVersion;
    const userId = accountUser.id;
    setAvatarBusy(true);
    avatarStatus(reset ? "正在恢复默认头像…" : "正在保存头像…");
    try {
      const result = await api("/api/v1/account/avatar", reset
        ? { method: "DELETE" }
        : { method: "PUT", headers: { "Content-Type": selectedAvatar.type }, body: selectedAvatar });
      if (version !== avatarVersion || accountUser?.id !== userId) return;
      accountUser = result.user;
      clearAvatarSelection(); renderAvatar(accountUser);
      avatarStatus(reset ? "已恢复默认头像" : "头像已保存，首页会同步显示");
    } catch (error) {
      if (version !== avatarVersion || accountUser?.id !== userId) return;
      if (error.status === 401) { clearAvatarSelection(); accountUser = null; accountAvatar.replaceChildren(); }
      avatarStatus(error.message || "头像保存失败，请重试");
    } finally {
      if (version === avatarVersion) setAvatarBusy(false);
    }
  }

  avatarForm.addEventListener("submit", (event) => { event.preventDefault(); void saveAvatar(); });
  avatarReset.addEventListener("click", () => { void saveAvatar(true); });
  window.addEventListener("pagehide", () => {
    clearAvatarSelection();
    if (accountUser) renderAvatar(accountUser);
  });

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
    loginForm.hidden = mode !== "login";
    registerForm.hidden = !register;
    resetForm.hidden = mode !== "reset";
    tabs.querySelectorAll("button").forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    showMessage("");
    history.replaceState(null, "", mode === "reset" ? "#reset" : register ? "#register" : "#login");
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(20000),
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
    accountUser = user;
    resetForm.hidden = true;
    const exemptFromEmailVerification = user.isSuperAdmin === true;
    document.getElementById("account-email-security").hidden = exemptFromEmailVerification || Boolean(user.emailVerified);
    verifyEmailForm.hidden = exemptFromEmailVerification || Boolean(user.emailVerified);
    document.getElementById("email-security-status").textContent = user.emailVerified ? "邮箱已验证，可用于找回密码。" : "邮箱尚未验证，完成验证后可用邮箱找回密码。";
    renderAvatar(user);
    tabs.hidden = true;
    loginForm.hidden = true;
    registerForm.hidden = true;
    showMessage("");
    accountName.textContent = user.displayName;
    accountEmail.textContent = user.email;
    adminEntry.hidden = user.role !== "admin";
    if (user.role !== "admin") adminEntry.remove();
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
    if (activeAccountSection === "images") {
      renderImageHistory();
      return;
    }
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

  function imageHistoryButton(label, action) {
    const button = document.createElement("button");
    button.className = "account-text-button";
    button.type = "button";
    button.dataset.accountAction = action;
    button.textContent = label;
    button.disabled = imageHistoryLoading;
    return button;
  }

  function renderImageHistory() {
    accountActivityList.replaceChildren();
    const items = accountImages?.items || [];
    if (imageHistoryError) {
      emptyState(imageHistoryError);
      accountActivityList.append(imageHistoryButton("重新加载", "retry-images"));
    } else if (!accountImages) {
      emptyState("正在加载生图记录…");
    } else if (!items.length) {
      emptyState("还没有生图记录，登录后生成并保存的图片会显示在这里。");
    }
    if (items.length) {
      const total = document.createElement("p");
      total.className = "account-image-history-total";
      total.textContent = `共 ${accountImages.total} 张 · 已显示 ${items.length} 张`;
      const grid = document.createElement("div");
      grid.className = "account-image-history-grid";
      items.forEach((record) => {
        const url = `/api/v1/image-history/${record.id}/image`;
        const card = document.createElement("article");
        card.className = "account-image-card";
        const preview = document.createElement("a");
        preview.href = url;
        preview.target = "_blank";
        preview.rel = "noopener";
        preview.setAttribute("aria-label", `查看原图：${record.prompt || "未命名作品"}`);
        const image = document.createElement("img");
        image.src = url;
        image.alt = record.prompt || "生成的图片";
        image.loading = "lazy";
        preview.append(image);
        const title = document.createElement("strong");
        title.textContent = record.prompt || "未命名作品";
        const meta = document.createElement("small");
        meta.textContent = `${record.modelName} · ${record.ratio} · ${new Date(record.createdAt).toLocaleString("zh-CN")}`;
        const download = document.createElement("a");
        download.className = "account-text-button";
        download.href = url;
        const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[record.mimeType] || "png";
        download.download = `nikai-${record.id}.${extension}`;
        download.textContent = "下载图片";
        card.append(preview, title, meta, download);
        grid.append(card);
      });
      accountActivityList.append(total, grid);
      if (accountImages.nextCursor && !imageHistoryError) {
        accountActivityList.append(imageHistoryButton(imageHistoryLoading ? "正在加载…" : "加载更多", "more-images"));
      }
    }
    const studio = document.createElement("a");
    studio.className = "account-studio-link";
    studio.href = "/image-generation";
    studio.textContent = "前往生图工作台";
    accountActivityList.append(studio);
  }

  async function loadImageHistory(more = false) {
    if (imageHistoryLoading) return;
    const version = imageHistoryVersion;
    const cursor = more ? accountImages?.nextCursor : null;
    imageHistoryLoading = true;
    imageHistoryError = "";
    if (activeAccountSection === "images") renderImageHistory();
    try {
      const data = await api(`/api/v1/image-history?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
      if (version !== imageHistoryVersion) return;
      if (!Array.isArray(data.items) || data.items.some((item) => !/^[0-9a-f-]{36}$/.test(item.id))) throw new Error("生图记录格式异常，请重新加载。");
      accountImages = { ...data, items: cursor ? [...accountImages.items, ...data.items] : data.items };
    } catch (error) {
      if (version !== imageHistoryVersion) return;
      if (error.status === 401) accountImages = null;
      imageHistoryError = errorMessage(error);
    } finally {
      if (version === imageHistoryVersion) {
        imageHistoryLoading = false;
        if (activeAccountSection === "images") renderImageHistory();
      }
    }
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
    document.body.classList.add("is-admin-auth");
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
      code: String(data.get("code") || ""),
      displayName: String(data.get("displayName") || ""),
      email: String(data.get("email") || ""),
      password,
      consentAccepted: data.get("consentAccepted") === "on",
      termsAccepted: data.get("consentAccepted") === "on",
      consentVersion: "2026-07"
    });
  });

  document.getElementById("forgot-password").addEventListener("click",()=>{resetForm.elements.email.value=loginForm.elements.email.value;setMode("reset");});
  document.getElementById("reset-back").addEventListener("click",()=>setMode("login"));
  for(const button of document.querySelectorAll("[data-email-code]")){
    button.addEventListener("click",async()=>{
      const purpose=button.dataset.emailCode;
      const form=purpose==="verify"?verifyEmailForm:purpose==="reset"?resetForm:registerForm;
      const field=purpose==="verify"?form.elements.password:form.elements.email;
      if(!field.reportValidity())return;
      button.disabled=true;button.textContent="发送中…";showMessage("");
      try{
        const data=await api(purpose==="verify"?"/api/v1/account/verify-email/send":"/api/v1/auth/email-code",{method:"POST",body:JSON.stringify(purpose==="verify"?{password:field.value}:{email:field.value,purpose})});
        showMessage(data.message,true);
        const until=Date.now()+60000;
        const tick=()=>{const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));button.textContent=seconds?`${seconds}秒后重发`:"重新获取";button.disabled=seconds>0;return seconds;};
        tick();const timer=setInterval(()=>{if(!tick())clearInterval(timer);},1000);
      }catch(error){showMessage(error.name==="TimeoutError"?"发送超时，请稍后重试。":errorMessage(error));button.disabled=false;button.textContent="重新获取";}
    });
  }
  resetForm.addEventListener("submit",async(event)=>{
    event.preventDefault();const data=new FormData(resetForm);
    if(data.get("password")!==data.get("confirmPassword")){showMessage("两次输入的密码不一致。");return;}
    const button=resetForm.querySelector('[type="submit"]');button.disabled=true;
    try{await api("/api/v1/auth/reset-password",{method:"POST",body:JSON.stringify({email:data.get("email"),code:data.get("code"),password:data.get("password")})});resetForm.reset();loginForm.elements.email.value=data.get("email");loginForm.elements.password.value="";setMode("login");showMessage("密码已重设，旧登录已退出，请使用新密码登录。",true);}
    catch(error){showMessage(errorMessage(error));}finally{button.disabled=false;}
  });
  verifyEmailForm.addEventListener("submit",async(event)=>{
    event.preventDefault();const data=new FormData(verifyEmailForm);const button=verifyEmailForm.querySelector('[type="submit"]');button.disabled=true;
    try{const result=await api("/api/v1/account/verify-email",{method:"POST",body:JSON.stringify({password:data.get("password"),code:data.get("code")})});verifyEmailForm.reset();showAccount(result.user);showMessage("邮箱验证成功。",true);}
    catch(error){showMessage(errorMessage(error));}finally{button.disabled=false;}
  });
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
      imageHistoryVersion += 1;
      avatarVersion += 1;
      accountUser = null;
      clearAvatarSelection();
      accountAvatar.replaceChildren();
      avatarStatus("");
      setAvatarBusy(false);
      accountImages = null;
      imageHistoryLoading = false;
      imageHistoryError = "";
      accountActivityList.replaceChildren();
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
    if (activeAccountSection === "images") void loadImageHistory();
  });

  accountActivityList.addEventListener("click", async (event) => {
    const action = event.target.closest("button[data-account-action]")?.dataset.accountAction;
    if (!action) return;
    event.preventDefault();
    if (action === "more-images" || action === "retry-images") {
      void loadImageHistory(Boolean(accountImages?.nextCursor));
      return;
    }
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
    const password = document.getElementById("delete-account-password").value;
    const button = deleteAccountForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("/api/v1/account", { method: "DELETE", body: JSON.stringify({ confirmation, password }) });
      location.href = "/auth#register";
    } catch (error) {
      showMessage(errorMessage(error));
      button.disabled = false;
    }
  });

  adminAccountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = adminAccountForm.querySelector('button[type="submit"]');
    const data = new FormData(adminAccountForm);
    button.disabled = true;
    showMessage("");
    try {
      const result = await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: String(data.get("email") || ""), password: String(data.get("password") || "") })
      });
      if (result.user?.role !== "admin") {
        try { await api("/api/v1/auth/logout", { method: "POST", body: "{}" }); } catch {}
        showMessage("该账号没有运营中心权限，请使用已授权的管理员账号。");
        return;
      }
      showMessage("登录成功，正在进入运营中心。", true);
      location.href = nextPath;
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
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
      safeSessionStorage.setItem("nike-admin-token", token);
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
      setMode(location.hash === "#reset" ? "reset" : location.hash === "#register" ? "register" : "login");
    }
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
