(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const icons = {
    "activity": '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
    "arrow-left": '<path d="m15 18-6-6 6-6"/><path d="M9 12h12"/>',
    "badge-check": '<path d="M12 3.5 15 5l3.4.2.6 3.3 1.8 2.8-1.8 2.8-.6 3.3-3.4.2-3 1.5-3-1.5-3.4-.2-.6-3.3-1.8-2.8L5 8.5l.6-3.3L9 5z"/><path d="m9 12 2 2 4-4"/>',
    "chart-no-axes-combined": '<path d="m3 17 5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
    "circle-alert": '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
    "circle-check": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    "circle-check-big": '<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-7"/>',
    "circle-x": '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>',
    "clipboard-check": '<path d="M9 5H6a2 2 0 0 0-2 2v12h16V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 13 2.5 2.5L16 10"/>',
    "copy-x": '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1"/><path d="m11 11 5 5"/><path d="m16 11-5 5"/>',
    "external-link": '<path d="M14 4h6v6"/><path d="m10 14 10-10"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
    "eye": '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.4 10.4 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8"/><path d="M6.2 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5"/>',
    "inbox": '<path d="M4 4h16l2 9v6H2v-6z"/><path d="M2 13h5l2 3h6l2-3h5"/>',
    "key-round": '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9"/><path d="m15 8 3 3"/><path d="m17 6 3 3"/>',
    "layout-dashboard": '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/>',
    "lock": '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    "lock-keyhole": '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/>',
    "megaphone": '<path d="m3 11 14-6v14L3 13z"/><path d="M3 11v2"/><path d="m7 15 1.5 5h3L10 14"/>',
    "mouse-pointer-2": '<path d="m4 3 7 17 2.2-6.8L20 11z"/>',
    "mouse-pointer-click": '<path d="m5 3 6 16 2-6 6-2z"/><path d="M15 3v3"/><path d="m19 5-2 2"/><path d="M12 2v3"/>',
    "panel-right-open": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="m9 9 3 3-3 3"/>',
    "pause": '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    "percent": '<path d="m19 5-14 14"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    "play": '<path d="m7 4 13 8-13 8z"/>',
    "radio": '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M5.5 5.5a9 9 0 0 0 0 13"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    "refresh-cw": '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.5-2L20 9"/><path d="M17.9 16a7 7 0 0 1-11.5 2L4 15"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    "send": '<path d="m3 3 18 9-18 9 4-9z"/><path d="M7 12h14"/>',
    "shield-check": '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    "triangle-alert": '<path d="M12 3 2.5 20h19z"/><path d="M12 9v4"/><path d="M12 16h.01"/>',
    "unlock-keyhole": '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/>',
    "users": '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><circle cx="18" cy="9" r="3"/><path d="M17 15a6 6 0 0 1 5 6"/>',
    "x": '<path d="m5 5 14 14"/><path d="m19 5-14 14"/>'
  };

  function createIcons({ attrs = {} } = {}) {
    document.querySelectorAll("i[data-lucide]").forEach((placeholder) => {
      const name = placeholder.getAttribute("data-lucide") || "activity";
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", attrs["stroke-width"] || "1.8");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      if (placeholder.className) svg.setAttribute("class", placeholder.className);
      svg.innerHTML = icons[name] || icons.activity;
      placeholder.replaceWith(svg);
    });
  }

  window.lucide = Object.freeze({ createIcons });
})();
