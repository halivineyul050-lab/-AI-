const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const makeCanvas = () => document.createElement('canvas');
const current = makeCanvas(), original = makeCanvas(), mask = makeCanvas(), overlay = makeCanvas(), before = makeCanvas();
const mc = mask.getContext('2d', { willReadFrequently: true });
let ready = false, enabled = false, busy = false, loading = false, comparing = false, hasResult = false;
let tool = 'brush', gesture = null, undo = [], redo = [], selected = 0, downloadURL = '', controller = null, loadVersion = 0;
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function update() {
  $('fields').disabled = !ready || busy || loading || comparing;
  $('process').disabled = !ready || !enabled || busy || loading || !selected || selected >= mask.width * mask.height * 0.85;
  $('undo').disabled = !undo.length; $('redo').disabled = !redo.length; $('clear').disabled = !selected;
  $('reset').disabled = !ready || busy || loading; $('replace').disabled = busy || loading; $('file').disabled = busy || loading;
  $('compare').disabled = !hasResult || busy || loading; $('cancel').hidden = !busy;
  $('process').textContent = busy ? '正在补全背景…' : '消除选中内容 →';
  $('viewport').classList.toggle('busy', busy);
  $('selection').textContent = ready ? selected >= mask.width * mask.height * 0.85 ? '选区过大：请将选区缩小至图片的 85% 以下，保留更多背景。' : `选中 ${(selected / (mask.width * mask.height) * 100).toFixed(1)}% · 保留的背景越多，越容易补全。` : '选择图片后，涂抹需要消除的区域。';
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(comparing ? before : current, 0, 0);
  if (!comparing) {
    const oc = overlay.getContext('2d'); oc.clearRect(0, 0, overlay.width, overlay.height);
    oc.globalCompositeOperation = 'source-over'; oc.drawImage(mask, 0, 0);
    oc.globalCompositeOperation = 'source-in'; oc.fillStyle = '#f0446280'; oc.fillRect(0, 0, overlay.width, overlay.height);
    oc.globalCompositeOperation = 'source-over'; ctx.drawImage(overlay, 0, 0);
  }
}
function recount() { const d = mc.getImageData(0, 0, mask.width, mask.height).data; selected = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) selected++; update(); }
function snapshot() { const rgba = mc.getImageData(0, 0, mask.width, mask.height).data; const alpha = new Uint8Array(mask.width * mask.height); for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]; return alpha; }
function restore(alpha) { const data = mc.createImageData(mask.width, mask.height); for (let i = 0; i < alpha.length; i++) { const p = i * 4; data.data[p] = 255; data.data[p + 1] = 255; data.data[p + 2] = 255; data.data[p + 3] = alpha[i]; } mc.putImageData(data, 0, 0); }
function remember(data) { undo.push(data); if (undo.length > 12) undo.shift(); redo = []; }
function cancelGesture() { if (!gesture) return; restore(gesture.previous); const id = gesture.id; gesture = null; if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); render(); }
function clearMask() { mc.clearRect(0, 0, mask.width, mask.height); undo = []; redo = []; recount(); render(); }
function setCompare(value) { cancelGesture(); comparing = value; $('compare').textContent = value ? '返回处理后' : '查看处理前'; $('compare').setAttribute('aria-pressed', String(value)); $('view-label').textContent = value ? '本次处理前的画面' : '红色区域将被消除'; render(); update(); }
function sizeView() { if (!ready) return; cancelGesture(); const factor = Math.min(($('viewport').clientWidth - 2) / canvas.width, ($('viewport').clientHeight - 2) / canvas.height, 1) * Number($('zoom').value) / 100; canvas.style.width = `${canvas.width * factor}px`; canvas.style.height = `${canvas.height * factor}px`; $('zoom-value').textContent = `${$('zoom').value}%`; }
function point(e) { const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(mask.width, (e.clientX - r.left) * mask.width / r.width)), y: Math.max(0, Math.min(mask.height, (e.clientY - r.top) * mask.height / r.height)) }; }
function stroke(a, b) { mc.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; mc.strokeStyle = '#fff'; mc.fillStyle = '#fff'; mc.lineWidth = Number($('brush').value); mc.lineCap = 'round'; mc.lineJoin = 'round'; mc.beginPath(); mc.moveTo(a.x, a.y); mc.lineTo(b.x, b.y); mc.stroke(); mc.beginPath(); mc.arc(b.x, b.y, mc.lineWidth / 2, 0, Math.PI * 2); mc.fill(); mc.globalCompositeOperation = 'source-over'; }
canvas.addEventListener('pointerdown', (e) => { if (!ready || busy || loading || comparing || gesture || (e.pointerType === 'mouse' && e.button !== 0)) return; e.preventDefault(); const p = point(e); gesture = { id: e.pointerId, start: p, last: p, previous: snapshot() }; canvas.setPointerCapture(e.pointerId); if (tool !== 'rectangle') stroke(p, p); render(); });
canvas.addEventListener('pointermove', (e) => { if (!gesture || gesture.id !== e.pointerId) return; e.preventDefault(); const p = point(e); if (tool === 'rectangle') { restore(gesture.previous); mc.fillStyle = '#fff'; mc.fillRect(Math.min(p.x, gesture.start.x), Math.min(p.y, gesture.start.y), Math.abs(p.x - gesture.start.x), Math.abs(p.y - gesture.start.y)); } else stroke(gesture.last, p); gesture.last = p; render(); });
canvas.addEventListener('pointerup', (e) => { if (!gesture || gesture.id !== e.pointerId) return; remember(gesture.previous); gesture = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); recount(); render(); });
canvas.addEventListener('pointercancel', cancelGesture); canvas.addEventListener('lostpointercapture', cancelGesture); window.addEventListener('blur', cancelGesture);
document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => { cancelGesture(); tool = button.dataset.tool; document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b === button))); }));
$('brush').addEventListener('input', () => { cancelGesture(); $('brush-value').textContent = `${$('brush').value} px`; });
$('zoom').addEventListener('input', sizeView); new ResizeObserver(sizeView).observe($('viewport'));
$('undo').addEventListener('click', () => { cancelGesture(); if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); recount(); render(); });
$('redo').addEventListener('click', () => { cancelGesture(); if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); recount(); render(); });
$('clear').addEventListener('click', () => { cancelGesture(); remember(snapshot()); mc.clearRect(0, 0, mask.width, mask.height); recount(); render(); });
$('compare').addEventListener('click', () => setCompare(!comparing));
function removeDownload() { if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = ''; $('download').removeAttribute('href'); $('download').hidden = true; }
$('reset').addEventListener('click', () => { cancelGesture(); current.getContext('2d').clearRect(0, 0, current.width, current.height); current.getContext('2d').drawImage(original, 0, 0); hasResult = false; setCompare(false); clearMask(); removeDownload(); message('已恢复最初上传的工作图。'); });
async function decode(blob) { const url = URL.createObjectURL(blob); try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); } }
async function loadFile(file) {
  if (!file || busy || loading) return; cancelGesture(); loading = true; update(); const version = ++loadVersion;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20MB，请选择较小的图片。');
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const valid = (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) || (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) || (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') || (bytes[0] === 66 && bytes[1] === 77);
    if (!valid) throw new Error('请选择有效的 PNG、JPEG、WebP 或 BMP 图片。');
    const img = await decode(file); if (version !== loadVersion) return;
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) throw new Error('图片尺寸无效。');
    const scale = Math.min(1, 2048 / Math.max(w, h), Math.sqrt(4 * 1024 * 1024 / (w * h)));
    const width = Math.max(1, Math.floor(w * scale)), height = Math.max(1, Math.floor(h * scale));
    if (width < 16 || height < 16) throw new Error(`图片缩放后的尺寸为 ${width} × ${height} px，宽和高都需要至少 16px。请换一张图片。`);
    for (const c of [canvas, current, original, mask, overlay, before]) { c.width = width; c.height = height; }
    current.getContext('2d').drawImage(img, 0, 0, width, height); original.getContext('2d').drawImage(current, 0, 0);
    ready = true; hasResult = false; removeDownload(); $('filename').textContent = file.name; $('download').download = `${file.name.replace(/\.[^.]+$/, '')}-erased.png`;
    $('dimensions').textContent = `输出 ${width} × ${height} px${scale < 1 ? ` · 已从 ${w} × ${h} px 等比缩小` : ' · 保持原尺寸'} · PNG`;
    $('editor').hidden = false; $('drop').hidden = true; $('zoom').value = '100'; setCompare(false); clearMask(); sizeView(); message('图片已准备好，请涂抹要消除的区域。');
  } catch (error) { message(error.message || '图片读取失败，请换一张图片重试。', true); }
  finally { loading = false; $('file').value = ''; update(); }
}
$('file').addEventListener('change', (e) => loadFile(e.target.files[0])); $('replace').addEventListener('click', () => $('file').click());
for (const type of ['dragenter', 'dragover']) $('main').addEventListener(type, (e) => { e.preventDefault(); $('drop').classList.add('dragging'); });
$('main').addEventListener('dragleave', () => $('drop').classList.remove('dragging'));
$('main').addEventListener('drop', (e) => { e.preventDefault(); $('drop').classList.remove('dragging'); loadFile(e.dataTransfer.files[0]); });
async function checkService() { $('retry-status').disabled = true; try { const response = await fetch('/api/utilities/image-erase/status', { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(); const body = await response.json(); enabled = body.data?.enabled === true; $('service').textContent = enabled ? '消除服务已就绪 · 图片由本站服务处理' : '消除服务尚未就绪，可先上传图片、绘制选区。'; } catch { enabled = false; $('service').textContent = '暂时无法连接消除服务，可先编辑选区，稍后重新检查。'; } finally { $('retry-status').disabled = false; update(); } }
$('retry-status').addEventListener('click', checkService);
$('cancel').addEventListener('click', () => { controller?.abort(); });
$('process').addEventListener('click', async () => {
  if (busy || loading || !ready || !enabled) return; cancelGesture(); recount();
  if (!selected || selected >= mask.width * mask.height * 0.85) { message('请选中要消除的局部区域，选区须小于图片的 85%。', true); return; }
  setCompare(false); busy = true; controller = new AbortController(); const signal = controller.signal; update(); message('正在补全背景，请保持页面打开。可以取消处理。');
  try {
    const binary = makeCanvas(); binary.width = mask.width; binary.height = mask.height; const bc = binary.getContext('2d'); const data = mc.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < data.data.length; i += 4) { const value = data.data[i + 3] > 0 ? 255 : 0; data.data[i] = value; data.data[i + 1] = value; data.data[i + 2] = value; data.data[i + 3] = 255; } bc.putImageData(data, 0, 0);
    const response = await fetch('/api/utilities/image-erase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: current.toDataURL('image/png'), mask: binary.toDataURL('image/png') }), signal });
    if (!response.ok) { const body = await response.json().catch(() => null); const hints = {erase_busy:'正在处理另一张图片，请稍后再试。',erase_timeout:'处理超时，请缩小选区或图片后重试。',erase_unavailable:'消除服务暂不可用，请稍后重试。'}; throw new Error(hints[body?.code] || body?.error?.message || body?.title || `处理失败（${response.status}），请稍后重试。`); }
    if (!response.headers.get('content-type')?.includes('image/png')) throw new Error('服务返回的图片格式异常，请重试。');
    const blob = await response.blob(), img = await decode(blob); if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (img.naturalWidth !== current.width || img.naturalHeight !== current.height) throw new Error('返回图片尺寸不一致，请重试。');
    before.getContext('2d').clearRect(0, 0, before.width, before.height); before.getContext('2d').drawImage(current, 0, 0);
    current.getContext('2d').clearRect(0, 0, current.width, current.height); current.getContext('2d').drawImage(img, 0, 0); hasResult = true;
    removeDownload(); downloadURL = URL.createObjectURL(blob); $('download').href = downloadURL; $('download').hidden = false; clearMask(); message('消除完成。可查看处理前、下载图片，或继续涂抹下一处。');
  } catch (error) { message(error.name === 'AbortError' ? '已取消处理，图片和选区已保留。' : error.message || '处理失败，请稍后重试。', error.name !== 'AbortError'); }
  finally { busy = false; controller = null; update(); render(); }
});
window.addEventListener('pagehide', () => { controller?.abort(); removeDownload(); });
window.addEventListener('pageshow', (event) => { if (!event.persisted || !hasResult) return; const version = loadVersion; current.toBlob((blob) => { if (!blob || !hasResult || version !== loadVersion || downloadURL) return; downloadURL = URL.createObjectURL(blob); $('download').href = downloadURL; $('download').hidden = false; }, 'image/png'); });
checkService(); update();
