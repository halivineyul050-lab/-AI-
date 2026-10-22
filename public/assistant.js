(() => {
  'use strict';
  if (/^\/(?:admin(?:[/.]|$)|auth(?:[/.]|$))/.test(location.pathname)) return;
  const mount = () => {
    if (document.getElementById('nikai-assistant')) return;
    const make = (tag, name, text) => { const el = document.createElement(tag); if (name) el.className = `nikai-assistant-${name}`; if (text !== undefined) el.textContent = text; return el; };
    const button = (name, text, label) => { const el = make('button', name, text); el.type = 'button'; if (label) el.setAttribute('aria-label', label); return el; };
    const icon = name => {
      const paths = {send:'m4 4 17 8-17 8 4-8-4-8zm4 8h13',search:'m21 21-4.5-4.5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',image:'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm0 14 5-5 4 4 3-3 5 5M7 7h.01',zap:'m13 2-9 12h7l-1 8 10-12h-8l1-8',reset:'M3 11a9 9 0 1 1 3 7M3 4v7h7',close:'m6 6 12 12M6 18 18 6',arrow:'M4 12h16m-6-6 6 6-6 6'};
      if(!document.createElementNS)return make('span','icon');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',paths[name]);svg.append(path);return svg;
    };
    const avatar = () => { const wrap = make('span', 'avatar'); const img = make('img'); img.src = '/assets/home/assistant-wave.png'; img.alt = ''; img.draggable = false; wrap.append(img); return wrap; };
    const root = make('div', 'root'); root.id = 'nikai-assistant';
    const launcher = button('launcher', undefined, '打开泥壳小助手'); launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'nikai-assistant-panel'); const hint = make('span', 'hint', '有问题？问问泥壳小助手'); launcher.append(hint, avatar());
    const panel = make('section', 'panel'); panel.id = 'nikai-assistant-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '泥壳小助手');
    const head = make('div', 'head'); const title = make('div', 'title'); title.append(make('strong', '', '泥壳小助手'), make('div', 'sub', '你的 AI 工具探索伙伴'));
    const actions = make('div', 'actions'); const reset = button('reset', '', '重新开始对话'), close = button('close', '', '收起聊天'); reset.append(icon('reset'));close.append(icon('close'));actions.append(reset, close); head.append(avatar(), title, actions);
    const messages = make('div', 'messages'); messages.setAttribute('role', 'log'); messages.setAttribute('aria-live', 'polite'); messages.setAttribute('aria-relevant', 'additions text');
    const status = make('div', 'status', '正在检查小助手配置…'); status.setAttribute('role', 'status');
    const form = make('form', 'compose'); const box = make('div', 'inputbox'); const input = make('textarea', 'input'); input.placeholder = '描述你的需求，帮你找到合适的 AI 工具…'; input.maxLength = 2000; input.setAttribute('aria-label', '输入你的问题');
    const foot = make('div', 'inputfoot'); const send = make('button', 'send');send.append(icon('send')); send.type = 'submit'; send.setAttribute('aria-label', '发送消息'); send.disabled = true;
    const stop = button('stop', '', '停止生成'); stop.title = '停止生成'; stop.append(make('span', 'stop-icon')); stop.hidden = true; foot.append(make('span', '', 'Enter 发送 · Shift + Enter 换行'), stop, send); box.append(input, foot); form.append(box, make('div', 'footer', 'Enter 发送 · Shift + Enter 换行 · AI 回答仅供参考')); const mascot=make('img','mascot');mascot.src='/assets/home/assistant-wave.png';mascot.alt='';mascot.draggable=false;mascot.setAttribute('aria-hidden','true');panel.append(mascot,head, messages, status, form); root.append(panel, launcher); document.body.append(root);
    let config = { enabled: false, ready: false }, history = [], request = null, generation = 0;
    const ready = () => config.enabled === true && config.ready === true;
    const scroll = () => { messages.scrollTop = messages.scrollHeight; };
    const update = () => { send.hidden = !!request; send.disabled = !ready() || !!request; input.disabled = !!request; stop.hidden = !request; panel.setAttribute('aria-busy', String(!!request)); };
    const welcome = () => { panel.setAttribute('data-conversation','false');messages.replaceChildren(); const card = make('div', 'welcome'); card.append(make('h2', '', '你好，我是泥壳小助手 👋'), make('p', '', typeof config.welcome === 'string' && config.welcome.trim() ? config.welcome.replace(/^你好[，,]\s*我是泥壳AI助手[。.！!]\s*/, '') : '告诉我你的需求，我可以帮你找到合适的 AI 工具。'));
      const chips = make('div', 'chips'); ['帮我找适合写作的 AI 工具', '有哪些好用的 AI 绘图工具？', '我想提高日常办公效率'].forEach((text,index) => { const chip = button('chip');const mark=make('span','chip-icon');mark.append(icon(['search','image','zap'][index]));chip.append(mark,make('span','chip-label',text),icon('arrow')); chip.addEventListener('click', () => { input.value = text; input.focus(); }); chips.append(chip); }); messages.append(card, chips); };
    const positionKey = 'nikai-assistant-position-v1';
    let drag = null, suppressClick = false, anchor = null, ratios = null;
    const viewport = () => ({ width: window.visualViewport?.width || window.innerWidth, height: window.visualViewport?.height || window.innerHeight, left: window.visualViewport?.offsetLeft || 0, top: window.visualViewport?.offsetTop || 0 });
    const size = () => launcher.offsetWidth || 64;
    const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
    const hideHint = () => { clearTimeout(hintTimer); hint.hidden = true; };
    const hintTimer = setTimeout(() => { hint.hidden = true; }, 4000);
    const positionPanel = () => {
      if (!anchor || panel.hidden) return;
      const { width, height, left, top: viewTop } = viewport(), gap = 12;
      const space = Math.max(anchor.y - viewTop - gap - 8, viewTop + height - anchor.y - size() - gap - 8);
      const panelWidth = Math.min(520, Math.max(1, width - 24)), panelHeight = Math.min(480, Math.max(1, height - 24), space >= 320 ? space : height - 24);
      const above = anchor.y - gap - panelHeight, below = anchor.y + size() + gap;
      const top = above >= viewTop + 8 ? above : below + panelHeight <= viewTop + height - 8 ? below : clamp(above, viewTop + 8, viewTop + height - panelHeight - 8);
      Object.assign(panel.style, { left: `${clamp(anchor.x + size() - panelWidth, left + 8, left + width - panelWidth - 8)}px`, top: `${top}px`, right: 'auto', bottom: 'auto', width: `${panelWidth}px`, height: `${panelHeight}px` });
    };
    const place = (x, y) => {
      const { width, height, left, top } = viewport();
      anchor = { x: Math.round(clamp(x, left + 8, left + width - size() - 8)), y: Math.round(clamp(y, top + 8, top + height - size() - 8)) };
      Object.assign(launcher.style, { left: `${anchor.x}px`, top: `${anchor.y}px`, right: 'auto', bottom: 'auto' });
      launcher.setAttribute('data-hint-side', anchor.x < left + width / 2 ? 'right' : 'left');
      positionPanel();
    };
    const storage = () => window.nikaiStorage?.local || window.localStorage;
    try { const saved = JSON.parse(storage()?.getItem(positionKey) || 'null'); if (saved?.v === 1 && [saved.x, saved.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) ratios = saved; } catch {}
    const remember = () => { const { width, height, left, top } = viewport(); ratios = { v: 1, x: (anchor.x - left) / Math.max(1, width - size()), y: (anchor.y - top) / Math.max(1, height - size()) }; try { storage()?.setItem(positionKey, JSON.stringify(ratios)); } catch {} };
    const initial = launcher.getBoundingClientRect(), view = viewport();
    place(ratios ? view.left + ratios.x * (view.width - size()) : initial.left, ratios ? view.top + ratios.y * (view.height - size()) : initial.top);
    if (!ratios) { const { width, height, left, top } = viewport(); ratios = { v: 1, x: (anchor.x - left) / Math.max(1, width - size()), y: (anchor.y - top) / Math.max(1, height - size()) }; }
    launcher.addEventListener('pointerdown', event => {
      if (event.isPrimary === false || event.button !== 0 || drag) return;
      suppressClick = false; drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: anchor.x, y: anchor.y, moved: false };
      launcher.setPointerCapture?.(event.pointerId);
    });
    launcher.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true; hideHint(); launcher.setAttribute('data-dragging', 'true'); event.preventDefault(); place(drag.x + dx, drag.y + dy);
    });
    const finishDrag = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved, id = drag.id; drag = null; launcher.setAttribute('data-dragging', 'false');
      if (moved) { suppressClick = true; remember(); }
      if (launcher.hasPointerCapture?.(id)) launcher.releasePointerCapture(id);
    };
    launcher.addEventListener('pointerup', finishDrag); launcher.addEventListener('pointercancel', finishDrag); launcher.addEventListener('lostpointercapture', finishDrag);
    const resize = () => { const { width, height, left, top } = viewport(); if (ratios) place(left + ratios.x * (width - size()), top + ratios.y * (height - size())); };
    window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
    const open = value => { hideHint(); panel.hidden = !value; launcher.setAttribute('aria-expanded', String(value)); launcher.setAttribute('aria-label', value ? '收起泥壳小助手' : '打开泥壳小助手'); positionPanel(); (value ? input : launcher).focus({ preventScroll: true }); };
    const cancel = () => { generation++; if (request) request.abort(); request = null; update(); };
    launcher.addEventListener('click', event => { if (suppressClick && event.detail !== 0) { suppressClick = false; event.preventDefault?.(); return; } suppressClick = false; open(panel.hidden); }); close.addEventListener('click', () => open(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) open(false); });
    stop.addEventListener('click', () => { cancel(); status.textContent = '已停止生成，你可以继续提问。'; input.focus(); });
    reset.addEventListener('click', () => { cancel(); history = []; input.value = ''; welcome(); status.textContent = ready() ? '新对话已开始' : '小助手尚未配置或未启用，暂时无法发送。'; input.focus(); });
    const toolCard = tool => {
      if (!tool || typeof tool.url !== 'string' || !/^\/tools\/[^/?#\\]+$/.test(tool.url)) return;
      let url; try { url = new URL(tool.url, location.origin); } catch { return; }
      if (url.origin !== location.origin) return;
      const card = make('div', 'tool'); const info = make('div', 'tool-info'); info.append(make('strong', '', String(tool.name || '查看工具')), make('small', '', String(tool.description || ''))); const link = make('a', '', '查看工具 ↗'); link.href = tool.url; card.append(info, link); messages.append(card);
    };
    const submit = async event => {
      event.preventDefault(); const text = input.value.trim(); if (!text || !ready() || request) return;
      const turn = ++generation; const controller = new AbortController(); request = controller;panel.setAttribute('data-conversation','true'); update(); input.value = ''; messages.append(make('div', 'user', text)); status.replaceChildren(); status.textContent = '正在思考…'; scroll();
      const outgoing = [...history, { role: 'user', content: text }].slice(-12);
      try {
        const response = await fetch('/api/v1/assistant/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: outgoing }), signal: controller.signal });
        if (turn !== generation) return;
        if (!response.ok) {
          let problem = {}; try { problem = await response.json(); } catch {}
          if (turn !== generation) return;
          status.textContent = response.status === 401 ? '请登录后使用小助手。' : response.status === 429 ? (problem.code === 'assistant_daily_limit' ? String(problem.title || '今日次数已用完，请明天再试。') : '请求过于频繁，请稍后再试。') : response.status === 409 ? '上一条回答仍在处理中，请等待完成后再发送。' : response.status === 503 ? '小助手暂时不可用，请稍后再试。' : '模型回答暂时失败，请稍后重试。';
          if (response.status === 401) { const link = make('a', 'login', '去登录'); link.href = '/auth?next=' + encodeURIComponent(location.pathname); status.append(link); }
          return;
        }
        const payload = await response.json(); if (turn !== generation) return;
        const data = payload?.data; if (!data || typeof data.output !== 'string' || !data.output.trim()) throw new Error('Empty response');
        messages.append(make('div', 'reply', data.output)); if (Array.isArray(data.tools)) data.tools.slice(0, 6).forEach(toolCard);
        history = [...outgoing, { role: 'assistant', content: data.output.slice(0, 2000) }].slice(-12); status.textContent = '回答已完成'; scroll();
      } catch (error) { if (turn === generation) status.textContent = error.name === 'AbortError' ? '已停止生成。' : '连接或模型回答失败，请稍后重试。'; }
      finally { if (turn === generation) { request = null; update(); input.focus(); } }
    };
    form.addEventListener('submit', submit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); form.requestSubmit(); } });
    welcome();
    fetch('/api/v1/assistant/config', { credentials: 'same-origin' }).then(response => { if (!response.ok) throw new Error('Config unavailable'); return response.json(); }).then(payload => { config = payload?.data || {}; welcome(); status.textContent = ready() ? '可以开始提问了' : '小助手尚未配置或未启用，暂时无法发送。'; update(); }).catch(() => { status.textContent = '暂时无法读取小助手配置，请稍后刷新重试。'; update(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
