(() => {
  "use strict";

  const endpoint = "/api/v1/events/batch";
  const startedAt = Date.now();

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function visitorId() {
    let id = localStorage.getItem("nike-visitor");
    if (!id) {
      id = uuid();
      localStorage.setItem("nike-visitor", id);
    }
    return id;
  }

  function sessionId() {
    let id = sessionStorage.getItem("nike-session");
    if (!id) {
      id = uuid();
      sessionStorage.setItem("nike-session", id);
    }
    try {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `nike_session=${encodeURIComponent(id)}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
    } catch {}
    return id;
  }

  function deviceType() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const touch = navigator.maxTouchPoints || 0;
    if (/ipad|tablet|playbook|silk/i.test(ua) || (platform === "MacIntel" && touch > 1)) return "tablet";
    if (/mobile|iphone|ipod|android.*mobile|windows phone|micromessenger|wxwork/i.test(ua)) return "mobile";
    if (/android/i.test(ua) && touch > 1) return "tablet";
    if (/windows|macintosh|linux|x11/i.test(ua)) return "desktop";
    return "unknown";
  }

  function classifyReferrer() {
    const direct = { source_type: "direct", source_domain: "", referrer_host: "" };
    if (!document.referrer) return direct;
    let referrer;
    try { referrer = new URL(document.referrer); } catch { return { ...direct, source_type: "unknown" }; }
    const host = referrer.hostname.replace(/^www\./i, "").toLowerCase();
    const ownHost = location.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host) return { ...direct, source_type: "unknown" };
    if (host === ownHost) return { source_type: "internal", source_domain: host, referrer_host: host };
    if (/(^|\.)weixin\.qq\.com$|(^|\.)wechat\.com$|(^|\.)qq\.com$/i.test(host) || /micromessenger|wxwork/i.test(navigator.userAgent || "")) {
      return { source_type: "wechat", source_domain: host, referrer_host: host };
    }
    if (/(^|\.)baidu\.com$|(^|\.)bing\.com$|(^|\.)google\.[a-z.]+$|(^|\.)sogou\.com$|(^|\.)so\.com$|(^|\.)360\.cn$|(^|\.)sm\.cn$|(^|\.)yahoo\.com$|(^|\.)duckduckgo\.com$/i.test(host)) {
      return { source_type: "search", source_domain: host, referrer_host: host };
    }
    return { source_type: "website", source_domain: host, referrer_host: host };
  }

  function attribution() {
    const key = "nike-session-attribution";
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || "null");
      if (cached && cached.source_type) return cached;
    } catch {}
    const value = classifyReferrer();
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
    return value;
  }

  function pageType() {
    if (location.pathname.startsWith("/tools/")) return "tool_detail";
    if (location.pathname.startsWith("/guides/")) return "guide_detail";
    if (location.pathname === "/guides") return "guides";
    if (location.pathname.startsWith("/compare/")) return "compare_detail";
    if (location.pathname === "/compare") return "compare";
    return "seo_page";
  }

  function send(eventName, properties = {}, useBeacon = false) {
    const payload = {
      visitorId: visitorId(),
      sessionId: sessionId(),
      events: [{
        eventId: uuid(),
        eventName,
        clientTime: new Date().toISOString(),
        pageType: pageType(),
        path: `${location.pathname}${location.search}${location.hash}`,
        properties: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          device_type: deviceType(),
          ...attribution(),
          ...properties
        }
      }]
    };
    const body = JSON.stringify(payload);
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }

  send("page_view", { page_id: pageType() });
  window.addEventListener("pagehide", () => {
    const durationMs = Math.max(0, Math.round(Date.now() - startedAt));
    if (durationMs >= 1000) send("page_engagement", { page_id: pageType(), duration_ms: Math.min(durationMs, 30 * 60 * 1000) }, true);
  });
})();
