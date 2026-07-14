(() => {
  "use strict";

  const POLL_INTERVAL_MS = 5_000;
  const REVIEW_POLL_INTERVAL_MS = 15_000;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const WINDOW_HOURS = { "24h": 24, "7d": 168 };

  const state = {
    window: "24h",
    paused: false,
    monitoring: null,
    monitoringController: null,
    monitoringLoading: false,
    monitoringRequestId: 0,
    lastUpdatedAt: null,
    chartResizeFrame: null,
    relativeTimer: null,
    pollTimer: null,
    token: "",
    submissions: [],
    reviewLoading: false,
    lastReviewFetchAt: 0
  };

  const dom = {
    globalError: document.querySelector("#global-error"),
    globalErrorMessage: document.querySelector("#global-error-message"),
    errorRetry: document.querySelector("#error-retry"),
    liveChip: document.querySelector("#live-chip"),
    liveLabel: document.querySelector("#live-label"),
    sidebarStatusDot: document.querySelector("#sidebar-status-dot"),
    sidebarStatus: document.querySelector("#sidebar-status"),
    sidebarUpdated: document.querySelector("#sidebar-updated"),
    pauseButton: document.querySelector("#pause-button"),
    refreshButton: document.querySelector("#refresh-button"),
    kpiGrid: document.querySelector("#kpi-grid"),
    overviewNote: document.querySelector("#overview-note"),
    chart: document.querySelector("#trend-chart"),
    chartWrap: document.querySelector("#trend-chart-wrap"),
    chartEmpty: document.querySelector("#chart-empty"),
    chartTooltip: document.querySelector("#chart-tooltip"),
    funnelList: document.querySelector("#funnel-list"),
    topToolsList: document.querySelector("#top-tools-list"),
    toolsTotal: document.querySelector("#tools-total"),
    topSearchesList: document.querySelector("#top-searches-list"),
    searchesTotal: document.querySelector("#searches-total"),
    eventList: document.querySelector("#event-list"),
    healthBadge: document.querySelector("#health-badge"),
    healthList: document.querySelector("#health-list"),
    reviewNavCount: document.querySelector("#review-nav-count"),
    reviewLock: document.querySelector("#review-lock"),
    reviewWorkspace: document.querySelector("#review-workspace"),
    tokenForm: document.querySelector("#token-form"),
    tokenInput: document.querySelector("#admin-token"),
    tokenError: document.querySelector("#token-error"),
    revealToken: document.querySelector("#reveal-token"),
    reviewRefresh: document.querySelector("#review-refresh"),
    reviewLockButton: document.querySelector("#review-lock-button"),
    reviewCount: document.querySelector("#review-count"),
    reviewSync: document.querySelector("#review-sync"),
    reviewTableBody: document.querySelector("#review-table-body"),
    reviewEmpty: document.querySelector("#review-empty"),
    reviewDialog: document.querySelector("#review-dialog"),
    reviewForm: document.querySelector("#review-form"),
    reviewId: document.querySelector("#review-id"),
    reviewNote: document.querySelector("#review-note"),
    reviewError: document.querySelector("#review-error"),
    reviewSubmit: document.querySelector("#review-submit"),
    dialogTool: document.querySelector("#dialog-tool"),
    dialogClose: document.querySelector("#dialog-close"),
    dialogCancel: document.querySelector("#dialog-cancel"),
    toastRegion: document.querySelector("#toast-region")
  };

  function renderIcons() {
    if (!window.lucide?.createIcons) return;
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function makeIcon(name, className = "") {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", name);
    icon.setAttribute("aria-hidden", "true");
    if (className) icon.className = className;
    return icon;
  }

  function setButtonIcon(button, name) {
    const icon = makeIcon(name);
    button.replaceChildren(icon);
    renderIcons();
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function formatNumber(value) {
    const number = asNumber(value);
    if (Math.abs(number) >= 10_000) {
      return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(number);
    }
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: Number.isInteger(number) ? 0 : 1 }).format(number);
  }

  function formatPercent(value) {
    return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(asNumber(value))}%`;
  }

  function formatBytes(value) {
    let bytes = Math.max(asNumber(value), 0);
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    bytes /= 1024 ** unit;
    return `${bytes.toFixed(unit === 0 ? 0 : bytes >= 10 ? 1 : 2)} ${units[unit]}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(Math.floor(asNumber(seconds)), 0);
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3_600);
    const minutes = Math.floor((total % 3_600) / 60);
    if (days) return `${days} 天 ${hours} 小时`;
    if (hours) return `${hours} 小时 ${minutes} 分`;
    if (minutes) return `${minutes} 分钟`;
    return `${total} 秒`;
  }

  function parseDate(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time) : null;
  }

  function formatDateTime(value, includeSeconds = false) {
    const date = parseDate(value);
    if (!date) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" } : {}),
      hour12: false
    }).format(date);
  }

  function relativeTime(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return "—";
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
    if (abs < 60) return formatter.format(seconds, "second");
    if (abs < 3_600) return formatter.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return formatter.format(Math.round(seconds / 3_600), "hour");
    return formatter.format(Math.round(seconds / 86_400), "day");
  }

  function messageForError(error) {
    if (error?.name === "AbortError") return "";
    if (error?.status === 401) return "管理令牌无效或已失效";
    if (error?.status === 403) return "该只读监控接口仅允许本机访问";
    if (error?.status === 429) return "请求过于频繁，请稍后重试";
    if (error?.status === 503) return error.message || "后台服务暂未就绪";
    if (!navigator.onLine) return "网络已断开，正在等待恢复";
    return error?.message || "请求失败，请稍后重试";
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* The status below remains actionable. */ }
    if (!response.ok) {
      const error = new Error(payload?.title || payload?.message || `服务器返回 ${response.status}`);
      error.status = response.status;
      error.code = payload?.code;
      error.requestId = payload?.requestId;
      error.details = payload?.details;
      throw error;
    }
    return payload?.data ?? payload;
  }

  function setConnection(status, label) {
    dom.sidebarStatusDot.className = "status-dot";
    dom.liveChip.classList.remove("is-offline");
    if (status === "online") {
      dom.sidebarStatusDot.classList.add("is-online");
      dom.sidebarStatus.textContent = "监控已连接";
      if (!state.paused) dom.liveLabel.textContent = "实时更新";
    } else if (status === "offline") {
      dom.sidebarStatusDot.classList.add("is-offline");
      dom.sidebarStatus.textContent = "连接异常";
      dom.liveChip.classList.add("is-offline");
      dom.liveLabel.textContent = "更新中断";
    } else {
      dom.sidebarStatusDot.classList.add("is-connecting");
      dom.sidebarStatus.textContent = label || "正在同步";
    }
  }

  function updateRelativeStatus() {
    if (!state.lastUpdatedAt) {
      dom.sidebarUpdated.textContent = "等待首次同步";
      return;
    }
    dom.sidebarUpdated.textContent = `${relativeTime(state.lastUpdatedAt)}更新`;
  }

  function showGlobalError(error) {
    const message = messageForError(error);
    if (!message) return;
    dom.globalErrorMessage.textContent = message;
    dom.globalError.hidden = false;
    setConnection("offline");
  }

  function hideGlobalError() {
    dom.globalError.hidden = true;
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast${type === "error" ? " is-error" : ""}`;
    item.append(makeIcon(type === "error" ? "circle-alert" : "circle-check"));
    const copy = document.createElement("span");
    copy.textContent = message;
    item.append(copy);
    dom.toastRegion.append(item);
    renderIcons();
    window.setTimeout(() => item.remove(), 3_600);
  }

  function normalizeMonitoring(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const kpis = source.kpis && typeof source.kpis === "object" ? source.kpis : {};
    return {
      generatedAt: source.generatedAt || new Date().toISOString(),
      window: source.window || { hours: WINDOW_HOURS[state.window] },
      kpis: {
        pageViews: asNumber(kpis.pageViews ?? kpis.views),
        uniqueVisitors: asNumber(kpis.uniqueVisitors ?? kpis.visitors),
        activeSessions: asNumber(kpis.activeSessions),
        searches: asNumber(kpis.searches),
        toolCardClicks: asNumber(kpis.toolCardClicks),
        toolDetailViews: asNumber(kpis.toolDetailViews ?? kpis.detailViews),
        officialClicks: asNumber(kpis.officialClicks ?? kpis.outboundClicks),
        adImpressions: asNumber(kpis.adImpressions),
        adClicks: asNumber(kpis.adClicks),
        pendingSubmissions: asNumber(kpis.pendingSubmissions),
        activeSubscribers: asNumber(kpis.activeSubscribers),
        eventsPerMinute: asNumber(kpis.eventsPerMinute),
        conversionRate: asNumber(kpis.conversionRate ?? kpis.clickThroughRate),
        adCtr: asNumber(kpis.adCtr)
      },
      hourlySeries: asArray(source.hourlySeries ?? source.series ?? source.timeline).map((point, index) => ({
        hour: point.hour || point.time || point.bucket || String(index),
        label: point.label || point.hour || point.time || String(index + 1),
        pageViews: asNumber(point.pageViews ?? point.views),
        uniqueVisitors: asNumber(point.uniqueVisitors ?? point.visitors),
        searches: asNumber(point.searches),
        detailViews: asNumber(point.detailViews ?? point.toolDetailViews),
        officialClicks: asNumber(point.officialClicks ?? point.outboundClicks ?? point.clicks)
      })),
      funnel: asArray(source.funnel).map((step) => ({
        key: step.key || "step",
        label: step.label || step.key || "步骤",
        visitors: asNumber(step.visitors ?? step.value ?? step.count),
        conversionFromPrevious: asNumber(step.conversionFromPrevious ?? step.rate),
        conversionFromStart: asNumber(step.conversionFromStart ?? step.totalRate)
      })),
      topTools: asArray(source.topTools ?? source.popularTools),
      topSearches: asArray(source.topSearches ?? source.popularSearches),
      recentEvents: asArray(source.recentEvents ?? source.events),
      submissionStatus: source.submissionStatus || {},
      system: source.system || source.health || {},
      access: source.access || {}
    };
  }

  function renderKpis(data) {
    const metricMap = {
      pageViews: { value: data.kpis.pageViews, type: "number" },
      uniqueVisitors: { value: data.kpis.uniqueVisitors, type: "number" },
      searches: { value: data.kpis.searches, type: "number" },
      outboundClicks: { value: data.kpis.officialClicks, type: "number" },
      clickThroughRate: { value: data.kpis.conversionRate, type: "percent" },
      pendingSubmissions: { value: data.kpis.pendingSubmissions, type: "number" }
    };

    document.querySelectorAll("[data-kpi]").forEach((card) => {
      const metric = metricMap[card.dataset.kpi];
      if (!metric) return;
      card.querySelector(".kpi-value").textContent = metric.type === "percent"
        ? formatPercent(metric.value)
        : formatNumber(metric.value);
      const trend = card.querySelector(".kpi-trend");
      trend.textContent = "实时";
      trend.className = "kpi-trend is-neutral";
    });
    dom.kpiGrid.setAttribute("aria-busy", "false");

    const pending = Math.max(Math.floor(data.kpis.pendingSubmissions), 0);
    dom.reviewNavCount.textContent = formatNumber(pending);
    dom.reviewNavCount.hidden = pending === 0;

    const start = formatDateTime(data.window?.startAt);
    const end = formatDateTime(data.window?.endAt);
    dom.overviewNote.textContent = data.window?.startAt && data.window?.endAt
      ? `${start} — ${end}`
      : `${data.window?.hours || WINDOW_HOURS[state.window]} 小时窗口 · 每 5 秒更新`;
  }

  function svgNode(tag, attributes = {}, text = "") {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function linePath(points) {
    if (!points.length) return "";
    return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  }

  function showChartTooltip(event, point) {
    const wrapRect = dom.chartWrap.getBoundingClientRect();
    const clientX = event.clientX || event.currentTarget.getBoundingClientRect().left;
    const clientY = event.clientY || event.currentTarget.getBoundingClientRect().top;
    dom.chartTooltip.textContent = `${point.label}\n页面浏览  ${formatNumber(point.pageViews)}\n官网点击  ${formatNumber(point.officialClicks)}`;
    dom.chartTooltip.hidden = false;
    const left = Math.min(Math.max(clientX - wrapRect.left + 12, 6), Math.max(wrapRect.width - 145, 6));
    const top = Math.min(Math.max(clientY - wrapRect.top - 34, 6), Math.max(wrapRect.height - 86, 6));
    dom.chartTooltip.style.left = `${left}px`;
    dom.chartTooltip.style.top = `${top}px`;
  }

  function renderTrend(data) {
    const series = data.hourlySeries;
    dom.chart.replaceChildren();
    const title = svgNode("title", { id: "chart-title" }, "页面浏览与官网点击趋势");
    const totalViews = series.reduce((total, point) => total + point.pageViews, 0);
    const totalClicks = series.reduce((total, point) => total + point.officialClicks, 0);
    const desc = svgNode("desc", { id: "chart-desc" }, series.length
      ? `共 ${series.length} 个时间点，页面浏览 ${formatNumber(totalViews)} 次，官网点击 ${formatNumber(totalClicks)} 次。`
      : "当前时间窗口没有趋势数据。");
    dom.chart.append(title, desc);
    dom.chartEmpty.hidden = series.length > 0;
    if (!series.length) return;

    const renderedWidth = dom.chart.clientWidth || 960;
    const renderedHeight = dom.chart.clientHeight || 310;
    const width = Math.max(420, Math.round(renderedWidth / renderedHeight * 310));
    const height = 310;
    dom.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const margin = { top: 18, right: 22, bottom: 35, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxRaw = Math.max(...series.flatMap((point) => [point.pageViews, point.officialClicks]), 1);
    const magnitude = 10 ** Math.floor(Math.log10(maxRaw));
    const maxValue = Math.max(Math.ceil(maxRaw / magnitude / 2) * magnitude * 2, 1);
    const xAt = (index) => margin.left + (series.length === 1 ? plotWidth / 2 : index / (series.length - 1) * plotWidth);
    const yAt = (value) => margin.top + plotHeight - (value / maxValue * plotHeight);

    const defs = svgNode("defs");
    const gradient = svgNode("linearGradient", { id: "area-gradient", x1: "0", y1: "0", x2: "0", y2: "1" });
    gradient.append(
      svgNode("stop", { offset: "0%", "stop-color": "#0f766e", "stop-opacity": ".22" }),
      svgNode("stop", { offset: "100%", "stop-color": "#0f766e", "stop-opacity": ".02" })
    );
    defs.append(gradient);
    dom.chart.append(defs);

    const grid = svgNode("g", { "aria-hidden": "true" });
    for (let index = 0; index <= 4; index += 1) {
      const value = maxValue * (1 - index / 4);
      const y = margin.top + plotHeight * index / 4;
      grid.append(svgNode("line", {
        x1: margin.left, y1: y, x2: width - margin.right, y2: y,
        stroke: "#dde5e2", "stroke-width": 1, "vector-effect": "non-scaling-stroke"
      }));
      grid.append(svgNode("text", {
        x: margin.left - 9, y: y + 4, "text-anchor": "end", fill: "#66736f", "font-size": 10
      }, formatNumber(value)));
    }
    dom.chart.append(grid);

    const viewsPoints = series.map((point, index) => ({ x: xAt(index), y: yAt(point.pageViews) }));
    const clicksPoints = series.map((point, index) => ({ x: xAt(index), y: yAt(point.officialClicks) }));
    const baseline = margin.top + plotHeight;
    const areaPath = `${linePath(viewsPoints)} L${viewsPoints.at(-1).x.toFixed(2)},${baseline} L${viewsPoints[0].x.toFixed(2)},${baseline} Z`;
    dom.chart.append(svgNode("path", { d: areaPath, fill: "url(#area-gradient)", "aria-hidden": "true" }));
    dom.chart.append(svgNode("path", {
      d: linePath(viewsPoints), fill: "none", stroke: "#0f766e", "stroke-width": 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke", "aria-hidden": "true"
    }));
    dom.chart.append(svgNode("path", {
      d: linePath(clicksPoints), fill: "none", stroke: "#c2410c", "stroke-width": 2,
      "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke", "aria-hidden": "true"
    }));

    const desiredLabels = width < 620 ? 4 : 7;
    const labelEvery = Math.max(Math.ceil(series.length / desiredLabels), 1);
    const labels = svgNode("g", { "aria-hidden": "true" });
    series.forEach((point, index) => {
      if (index % labelEvery !== 0 && index !== series.length - 1) return;
      labels.append(svgNode("text", {
        x: xAt(index), y: height - 10, "text-anchor": index === 0 ? "start" : index === series.length - 1 ? "end" : "middle",
        fill: "#66736f", "font-size": 10
      }, String(point.label)));
    });
    dom.chart.append(labels);

    const hitArea = svgNode("g", { "aria-hidden": "true" });
    const sliceWidth = Math.max(plotWidth / Math.max(series.length, 1), 8);
    series.forEach((point, index) => {
      const hit = svgNode("rect", {
        x: Math.max(xAt(index) - sliceWidth / 2, margin.left), y: margin.top,
        width: Math.min(sliceWidth, width - margin.right - Math.max(xAt(index) - sliceWidth / 2, margin.left)),
        height: plotHeight, fill: "transparent"
      });
      hit.addEventListener("pointerenter", (event) => showChartTooltip(event, point));
      hit.addEventListener("pointermove", (event) => showChartTooltip(event, point));
      hit.addEventListener("pointerleave", () => { dom.chartTooltip.hidden = true; });
      hitArea.append(hit);
    });
    dom.chart.append(hitArea);
  }

  function renderFunnel(data) {
    let steps = data.funnel;
    if (!steps.length) {
      steps = [
        { key: "visitor", label: "独立访客", visitors: data.kpis.uniqueVisitors, conversionFromPrevious: 100, conversionFromStart: 100 },
        { key: "detail", label: "工具详情", visitors: data.kpis.toolDetailViews, conversionFromPrevious: 0, conversionFromStart: 0 },
        { key: "official", label: "官网点击", visitors: data.kpis.officialClicks, conversionFromPrevious: 0, conversionFromStart: 0 }
      ];
    }
    dom.funnelList.replaceChildren();
    if (!steps.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "暂无漏斗数据";
      dom.funnelList.append(empty);
      return;
    }
    const start = Math.max(steps[0]?.visitors || 0, 1);
    steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "funnel-row";
      const label = document.createElement("span");
      label.className = "funnel-label";
      label.textContent = step.label;
      label.title = step.label;
      const track = document.createElement("div");
      track.className = "funnel-track";
      const fill = document.createElement("div");
      fill.className = "funnel-fill";
      const width = step.visitors > 0 ? Math.max(step.visitors / start * 100, 3) : 0;
      fill.style.width = `${Math.min(width, 100)}%`;
      fill.title = `${step.label}：${formatNumber(step.visitors)}`;
      if (width >= 22) fill.textContent = `${Math.round(Math.min(width, 100))}%`;
      track.append(fill);
      const metric = document.createElement("span");
      metric.className = "funnel-value";
      metric.textContent = formatNumber(step.visitors);
      const rate = document.createElement("small");
      rate.textContent = index === 0 ? "起点" : `${formatPercent(step.conversionFromPrevious)} 转化`;
      metric.append(rate);
      row.append(label, track, metric);
      dom.funnelList.append(row);
    });
  }

  function renderTopTools(data) {
    const tools = data.topTools.slice(0, 6);
    dom.topToolsList.replaceChildren();
    dom.toolsTotal.textContent = tools.length ? `TOP ${tools.length}` : "—";
    if (!tools.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "尚无工具点击数据";
      dom.topToolsList.append(empty);
      return;
    }
    tools.forEach((tool, index) => {
      const row = document.createElement("div");
      row.className = "rank-row";
      const rank = document.createElement("span");
      rank.className = `rank-number${index < 3 ? " top" : ""}`;
      rank.textContent = String(index + 1).padStart(2, "0");
      const copy = document.createElement("span");
      copy.className = "rank-copy";
      const name = document.createElement("strong");
      name.textContent = tool.name || tool.toolName || "未命名工具";
      const detail = document.createElement("small");
      detail.textContent = `${formatNumber(tool.detailViews)} 次详情查看`;
      copy.append(name, detail);
      const metric = document.createElement("span");
      metric.className = "rank-metric";
      const clicks = document.createElement("strong");
      clicks.textContent = formatNumber(tool.officialClicks ?? tool.clicks);
      const caption = document.createElement("small");
      caption.textContent = `${formatPercent(tool.conversionRate)} 转化`;
      metric.append(clicks, caption);
      row.append(rank, copy, metric);
      dom.topToolsList.append(row);
    });
  }

  function renderTopSearches(data) {
    const searches = data.topSearches.slice(0, 6);
    dom.topSearchesList.replaceChildren();
    const total = searches.reduce((sum, item) => sum + asNumber(item.count), 0);
    dom.searchesTotal.textContent = searches.length ? `${formatNumber(total)} 次` : "—";
    if (!searches.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "尚无搜索数据";
      dom.topSearchesList.append(empty);
      return;
    }
    searches.forEach((search) => {
      const row = document.createElement("div");
      row.className = "search-row";
      const query = document.createElement("span");
      query.className = "search-query";
      query.textContent = search.query || "空搜索";
      query.title = search.query || "空搜索";
      const count = document.createElement("span");
      count.className = "search-count";
      count.textContent = formatNumber(search.count);
      count.title = `${formatNumber(search.uniqueVisitors)} 位访客`;
      row.append(query, count);
      dom.topSearchesList.append(row);
    });
  }

  function eventPresentation(name) {
    const normalized = String(name || "").toLowerCase();
    if (normalized.includes("search")) return { icon: "search", className: "is-search", label: "站内搜索" };
    if (normalized.includes("outbound") || normalized.includes("official")) return { icon: "external-link", className: "is-click", label: "点击官网" };
    if (normalized.includes("detail")) return { icon: "panel-right-open", className: "", label: "查看工具详情" };
    if (normalized.includes("card") || normalized.includes("tool_click")) return { icon: "mouse-pointer-click", className: "is-click", label: "点击工具卡片" };
    if (normalized.includes("ad")) return { icon: "megaphone", className: "is-click", label: "广告互动" };
    if (normalized.includes("page") || normalized.includes("view")) return { icon: "eye", className: "", label: "页面浏览" };
    return { icon: "activity", className: "", label: name || "用户事件" };
  }

  function renderEvents(data) {
    const events = data.recentEvents.slice(0, 12);
    dom.eventList.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "监控窗口内尚无用户事件";
      dom.eventList.append(empty);
      return;
    }
    events.forEach((event) => {
      const presentation = eventPresentation(event.eventName);
      const row = document.createElement("div");
      row.className = "event-row";
      const icon = document.createElement("span");
      icon.className = `event-icon ${presentation.className}`.trim();
      icon.append(makeIcon(presentation.icon));
      const copy = document.createElement("span");
      copy.className = "event-copy";
      const title = document.createElement("strong");
      title.textContent = presentation.label;
      const detail = document.createElement("small");
      const parts = [event.entityLabel, event.pageType, event.visitorShort ? `访客 ${event.visitorShort}` : ""].filter(Boolean);
      detail.textContent = parts.join(" · ") || event.eventName || "—";
      detail.title = detail.textContent;
      copy.append(title, detail);
      const time = document.createElement("time");
      time.className = "event-time";
      time.dateTime = event.receivedAt || "";
      time.textContent = relativeTime(event.receivedAt);
      time.title = formatDateTime(event.receivedAt, true);
      row.append(icon, copy, time);
      dom.eventList.append(row);
    });
    renderIcons();
  }

  function appendHealthRow(label, value, className = "") {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    if (className) description.className = className;
    row.append(term, description);
    dom.healthList.append(row);
  }

  function renderHealth(data) {
    const system = data.system || {};
    const hasSystem = Object.keys(system).length > 0;
    const healthy = hasSystem
      && system.databaseReady !== false
      && system.database !== false
      && !["down", "not_ready", "degraded"].includes(system.status);
    dom.healthBadge.className = `health-badge ${healthy ? "is-healthy" : hasSystem ? "is-degraded" : "is-checking"}`;
    dom.healthBadge.textContent = healthy ? "运行正常" : hasSystem ? "需要关注" : "数据未上报";
    dom.healthList.replaceChildren();
    const serverLabel = system.nodeVersion
      ? `Node ${system.nodeVersion}${system.serverVersion ? ` · v${system.serverVersion}` : ""}`
      : system.backend || "未上报";
    appendHealthRow("应用服务", serverLabel, healthy ? "is-good" : "");
    const schemaVersion = system.schemaVersion ?? system.userVersion;
    const databaseReady = system.databaseReady ?? system.database;
    const databaseLabel = schemaVersion != null
      ? `SQLite ${databaseReady === false ? "异常" : "Ready"} · Schema v${schemaVersion} · ${asNumber(system.migrations)} 迁移`
      : databaseReady === true ? "SQLite Ready" : "未上报";
    appendHealthRow("数据库", databaseLabel, databaseReady === false ? "is-bad" : healthy ? "is-good" : "");
    const requestLabel = system.requestsLast5Minutes != null
      ? `${formatNumber(system.requestsLast5Minutes)} 次 / 5 分钟 · ${asNumber(system.averageResponseMs).toFixed(1)} ms`
      : "—";
    appendHealthRow("请求状态", requestLabel);
    appendHealthRow("服务错误率", system.errorRateLast5Minutes != null ? formatPercent(system.errorRateLast5Minutes) : "—", asNumber(system.errorRateLast5Minutes) > 1 ? "is-bad" : "");
    appendHealthRow("内存占用", system.memoryRssBytes != null ? formatBytes(system.memoryRssBytes) : "—");
    const databaseBytes = system.databaseBytes ?? system.dbSizeBytes;
    const walBytes = system.walBytes ?? system.walSizeBytes;
    const storage = asNumber(databaseBytes) + asNumber(walBytes);
    appendHealthRow("数据存储", databaseBytes != null ? `${formatBytes(storage)} 含 WAL` : "—");
    appendHealthRow("运行时长", system.uptimeSeconds != null ? formatDuration(system.uptimeSeconds) : "—");
    appendHealthRow("最近事件", system.lastEventAt ? `${relativeTime(system.lastEventAt)} · ${formatDateTime(system.lastEventAt, true)}` : "尚无事件");
    appendHealthRow("访问模式", data.access?.mode === "local-readonly" ? "本机只读" : ["token-admin", "admin"].includes(data.access?.mode) ? "令牌管理" : "—");
  }

  function renderMonitoring(raw) {
    const data = normalizeMonitoring(raw);
    state.monitoring = data;
    renderKpis(data);
    renderTrend(data);
    renderFunnel(data);
    renderTopTools(data);
    renderTopSearches(data);
    renderEvents(data);
    renderHealth(data);
    renderIcons();
  }

  async function loadMonitoring({ manual = false } = {}) {
    if (state.paused && !manual) return;
    if (state.monitoringLoading && !manual) return;
    const requestId = ++state.monitoringRequestId;
    if (state.monitoringLoading) state.monitoringController?.abort();
    state.monitoringController = new AbortController();
    state.monitoringLoading = true;
    if (manual) dom.refreshButton.classList.add("is-loading");
    if (!state.monitoring) setConnection("connecting", "正在同步");

    try {
      const hours = WINDOW_HOURS[state.window];
      const data = await fetchJson(`/api/admin/v1/monitoring?hours=${hours}`, {
        signal: state.monitoringController.signal,
        ...(state.token ? { headers: { Authorization: `Bearer ${state.token}` } } : {})
      });
      if (requestId !== state.monitoringRequestId) return;
      renderMonitoring(data);
      state.lastUpdatedAt = parseDate(data?.generatedAt) || new Date();
      updateRelativeStatus();
      hideGlobalError();
      setConnection("online");

      if (state.token && Date.now() - state.lastReviewFetchAt >= REVIEW_POLL_INTERVAL_MS) {
        void loadSubmissions({ quiet: true });
      }
    } catch (error) {
      if (error.status === 401 && state.token) {
        lockReviews(false);
        window.setTimeout(() => void loadMonitoring({ manual: true }), 0);
      }
      if (error.name !== "AbortError" && requestId === state.monitoringRequestId) showGlobalError(error);
    } finally {
      if (requestId === state.monitoringRequestId) {
        dom.refreshButton.classList.remove("is-loading");
        state.monitoringLoading = false;
        state.monitoringController = null;
      }
    }
  }

  function updateWindow(nextWindow) {
    if (!WINDOW_HOURS[nextWindow] || state.window === nextWindow) return;
    state.window = nextWindow;
    document.querySelectorAll("[data-window]").forEach((button) => {
      const active = button.dataset.window === nextWindow;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    dom.kpiGrid.setAttribute("aria-busy", "true");
    void loadMonitoring({ manual: true });
  }

  function togglePause() {
    state.paused = !state.paused;
    dom.liveChip.classList.toggle("is-paused", state.paused);
    dom.liveLabel.textContent = state.paused ? "已暂停更新" : "实时更新";
    dom.pauseButton.setAttribute("aria-label", state.paused ? "恢复自动更新" : "暂停自动更新");
    dom.pauseButton.title = state.paused ? "恢复自动更新" : "暂停自动更新";
    setButtonIcon(dom.pauseButton, state.paused ? "play" : "pause");
    if (!state.paused) void loadMonitoring({ manual: true });
  }

  function submissionArray(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  }

  async function loadSubmissions({ token = state.token, quiet = false } = {}) {
    if (!token || state.reviewLoading) return false;
    state.reviewLoading = true;
    dom.reviewRefresh.classList.add("is-loading");
    dom.reviewRefresh.disabled = true;
    if (!quiet) {
      dom.tokenError.hidden = true;
      const submit = dom.tokenForm.querySelector("button[type='submit']");
      submit.disabled = true;
    }
    try {
      const data = await fetchJson("/api/admin/v1/submissions?status=pending", {
        headers: { Authorization: `Bearer ${token}` }
      });
      state.token = token;
      state.submissions = submissionArray(data);
      state.lastReviewFetchAt = Date.now();
      renderSubmissions();
      dom.reviewLock.hidden = true;
      dom.reviewWorkspace.hidden = false;
      dom.tokenInput.value = "";
      dom.tokenError.hidden = true;
      void loadMonitoring({ manual: true });
      return true;
    } catch (error) {
      if (error.status === 401) {
        state.token = "";
        state.submissions = [];
        dom.reviewWorkspace.hidden = true;
        dom.reviewLock.hidden = false;
      }
      if (quiet) {
        toast(messageForError(error), "error");
      } else {
        dom.tokenError.textContent = messageForError(error);
        dom.tokenError.hidden = false;
      }
      return false;
    } finally {
      state.reviewLoading = false;
      dom.reviewRefresh.classList.remove("is-loading");
      dom.reviewRefresh.disabled = false;
      const submit = dom.tokenForm.querySelector("button[type='submit']");
      submit.disabled = false;
    }
  }

  function renderSubmissions() {
    dom.reviewTableBody.replaceChildren();
    dom.reviewCount.textContent = `${formatNumber(state.submissions.length)} 条待审`;
    dom.reviewSync.textContent = `${formatDateTime(new Date().toISOString(), true)} 同步`;
    dom.reviewEmpty.hidden = state.submissions.length > 0;
    if (!state.submissions.length) return;

    state.submissions.forEach((submission) => {
      const row = document.createElement("tr");

      const toolCell = document.createElement("td");
      const tool = document.createElement("span");
      tool.className = "tool-cell";
      const name = document.createElement("strong");
      name.textContent = submission.name || "未命名工具";
      const website = document.createElement("a");
      website.href = submission.websiteUrl || "#";
      website.target = "_blank";
      website.rel = "noopener noreferrer";
      website.referrerPolicy = "no-referrer";
      website.textContent = submission.websiteUrl || "未提供官网";
      if (!submission.websiteUrl) website.removeAttribute("href");
      tool.append(name, website);
      toolCell.append(tool);

      const contactCell = document.createElement("td");
      const contact = document.createElement("span");
      contact.className = "contact-cell";
      const email = document.createElement("span");
      email.textContent = submission.contactEmail || "未提供";
      const code = document.createElement("small");
      code.textContent = submission.trackingCode || "—";
      contact.append(email, code);
      contactCell.append(contact);

      const submittedCell = document.createElement("td");
      const submitted = document.createElement("span");
      submitted.className = "date-cell";
      const date = document.createElement("span");
      date.textContent = formatDateTime(submission.submittedAt);
      const ago = document.createElement("small");
      ago.textContent = relativeTime(submission.submittedAt);
      submitted.append(date, document.createElement("br"), ago);
      submittedCell.append(submitted);

      const sourceCell = document.createElement("td");
      const source = document.createElement("span");
      source.className = "source-chip";
      source.textContent = submission.source || "website";
      sourceCell.append(source);

      const actionCell = document.createElement("td");
      const action = document.createElement("button");
      action.className = "review-action";
      action.type = "button";
      action.dataset.reviewId = submission.id;
      action.textContent = "审核";
      actionCell.append(action);

      row.append(toolCell, contactCell, submittedCell, sourceCell, actionCell);
      dom.reviewTableBody.append(row);
    });
  }

  function openReviewDialog(id) {
    const submission = state.submissions.find((item) => item.id === id);
    if (!submission) return;
    dom.reviewId.value = submission.id;
    dom.reviewNote.value = "";
    dom.reviewError.hidden = true;
    const approved = dom.reviewForm.querySelector("input[value='approved']");
    approved.checked = true;
    dom.dialogTool.replaceChildren();
    const name = document.createElement("strong");
    name.textContent = submission.name || "未命名工具";
    const summary = document.createElement("span");
    summary.textContent = submission.summary || submission.websiteUrl || "未填写工具简介";
    dom.dialogTool.append(name, summary);
    if (typeof dom.reviewDialog.showModal === "function") dom.reviewDialog.showModal();
    else dom.reviewDialog.setAttribute("open", "");
  }

  function closeReviewDialog() {
    if (dom.reviewDialog.open && typeof dom.reviewDialog.close === "function") dom.reviewDialog.close();
    else dom.reviewDialog.removeAttribute("open");
  }

  function lockReviews(refreshMonitoring = true) {
    state.token = "";
    state.submissions = [];
    state.lastReviewFetchAt = 0;
    dom.tokenInput.value = "";
    dom.tokenInput.type = "password";
    dom.reviewTableBody.replaceChildren();
    dom.reviewWorkspace.hidden = true;
    dom.reviewLock.hidden = false;
    closeReviewDialog();
    if (refreshMonitoring) void loadMonitoring({ manual: true });
    toast("审核队列已锁定，令牌已从页面内存中清除");
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!state.token) {
      closeReviewDialog();
      lockReviews();
      return;
    }
    const id = dom.reviewId.value;
    const status = new FormData(dom.reviewForm).get("review-status");
    const reviewNote = dom.reviewNote.value.trim();
    dom.reviewError.hidden = true;
    dom.reviewSubmit.disabled = true;
    try {
      await fetchJson(`/api/admin/v1/submissions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ status, reviewNote })
      });
      const labels = { approved: "已通过", rejected: "已驳回", duplicate: "已标记重复" };
      state.submissions = state.submissions.filter((item) => item.id !== id);
      renderSubmissions();
      closeReviewDialog();
      toast(`投稿${labels[status] || "已处理"}`);
      state.lastReviewFetchAt = 0;
      void loadMonitoring({ manual: true });
    } catch (error) {
      if (error.status === 401) {
        closeReviewDialog();
        lockReviews();
        toast("管理令牌已失效，请重新解锁", "error");
        return;
      }
      if (error.status === 409) {
        closeReviewDialog();
        toast("该投稿已被其他管理员处理，队列已刷新", "error");
        state.lastReviewFetchAt = 0;
        void loadSubmissions({ quiet: true });
        return;
      }
      dom.reviewError.textContent = messageForError(error);
      dom.reviewError.hidden = false;
    } finally {
      dom.reviewSubmit.disabled = false;
    }
  }

  function setupNavigationObserver() {
    if (!("IntersectionObserver" in window)) return;
    const links = [...document.querySelectorAll(".side-nav-item[href^='#']")];
    const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        const active = link.getAttribute("href") === `#${visible.target.id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-20% 0px -65%", threshold: [0, 0.2, 0.5] });
    sections.forEach((section) => observer.observe(section));
  }

  function setupChartResizeObserver() {
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(() => {
      if (!state.monitoring) return;
      window.cancelAnimationFrame(state.chartResizeFrame);
      state.chartResizeFrame = window.requestAnimationFrame(() => renderTrend(state.monitoring));
    });
    observer.observe(dom.chartWrap);
  }

  function bindEvents() {
    document.querySelectorAll("[data-window]").forEach((button) => {
      button.addEventListener("click", () => updateWindow(button.dataset.window));
    });
    dom.pauseButton.addEventListener("click", togglePause);
    dom.refreshButton.addEventListener("click", () => void loadMonitoring({ manual: true }));
    dom.errorRetry.addEventListener("click", () => void loadMonitoring({ manual: true }));

    dom.tokenForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const token = dom.tokenInput.value.trim();
      if (!token) return;
      void loadSubmissions({ token });
    });
    dom.revealToken.addEventListener("click", () => {
      const reveal = dom.tokenInput.type === "password";
      dom.tokenInput.type = reveal ? "text" : "password";
      dom.revealToken.setAttribute("aria-label", reveal ? "隐藏令牌" : "显示令牌");
      dom.revealToken.title = reveal ? "隐藏令牌" : "显示令牌";
      setButtonIcon(dom.revealToken, reveal ? "eye-off" : "eye");
    });
    dom.reviewRefresh.addEventListener("click", () => {
      state.lastReviewFetchAt = 0;
      void loadSubmissions();
    });
    dom.reviewLockButton.addEventListener("click", lockReviews);
    dom.reviewTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-review-id]");
      if (button) openReviewDialog(button.dataset.reviewId);
    });
    dom.dialogClose.addEventListener("click", closeReviewDialog);
    dom.dialogCancel.addEventListener("click", closeReviewDialog);
    dom.reviewForm.addEventListener("submit", submitReview);
    dom.reviewDialog.addEventListener("click", (event) => {
      if (event.target === dom.reviewDialog) closeReviewDialog();
    });

    window.addEventListener("online", () => void loadMonitoring({ manual: true }));
    window.addEventListener("offline", () => showGlobalError(new Error("网络已断开，正在等待恢复")));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !state.paused) void loadMonitoring({ manual: true });
    });
  }

  function init() {
    renderIcons();
    bindEvents();
    setupNavigationObserver();
    setupChartResizeObserver();
    state.pollTimer = window.setInterval(() => void loadMonitoring(), POLL_INTERVAL_MS);
    state.relativeTimer = window.setInterval(updateRelativeStatus, 1_000);
    void loadMonitoring({ manual: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
