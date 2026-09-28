import {assertImageDimensions} from './image-input.mjs';
const $ = id => document.getElementById(id);
const mode = document.body.dataset.imageTool;
const enhance = mode === 'enhance';
let source, work, baseline, result, busy = false, ready = false, showingResult = false, controller, originalWidth=0, originalHeight=0;
const canvas = $('canvas');
const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));
function surface(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function controls() {
  $('process').disabled = busy || !work || !ready;
  $('fields').disabled = busy || !result;
  $('file').disabled = busy; $('replace').disabled = busy; $('retry-status').disabled = busy;
  $('before').disabled = busy; $('after').disabled = busy || !result;
  $('download').hidden = !result; $('download').disabled = busy;
  $('cancel').hidden = !controller;
}
async function checkStatus() {
  ready = false; controls(); $('service').textContent = '正在检查服务…';
  try { const response = await fetch('/api/utilities/image-tools/status'); if (!response.ok) throw Error(); const body = await response.json(); ready = body.data?.[mode] === true; $('service').textContent = ready ? '模型服务已就绪' : '模型服务暂不可用，请稍后重新检查。'; }
  catch { $('service').textContent = '无法连接模型服务，请重新检查。'; }
  controls();
}
function preview() {
  const image = showingResult && result ? result : source;
  if (!image) return;
  // Both views share the same CSS footprint, independent of their pixel dimensions.
  canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
  $('before').setAttribute('aria-pressed', String(!showingResult));
  $('after').setAttribute('aria-pressed', String(showingResult));
  $('view-label').textContent = showingResult ? `处理结果 · ${result.width} × ${result.height}` : `原图 · ${originalWidth} × ${originalHeight}`;
}
function recognized(b) {
  return (b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71 && b[4]===13 && b[5]===10 && b[6]===26 && b[7]===10) ||
    (b[0]===255 && b[1]===216 && b[2]===255) || (b[0]===66 && b[1]===77) ||
    (String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP');
}
async function select(file) {
  if (!file || busy) return;
  busy = true; controls(); message('正在读取图片…');
  // A newly selected file invalidates the previous output, including invalid selections.
  source?.close?.(); source = work = baseline = result = undefined; showingResult = false;
  $('editor').hidden = true; $('drop').hidden = false; $('estimate').textContent = '选择图片后显示实际处理与导出尺寸。';
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('图片不能超过 20MB。');
    if (!recognized(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) throw Error('请选择 PNG、JPEG、WebP 或 BMP 图片。');
    await assertImageDimensions(file);
    source = await createImageBitmap(file, {imageOrientation:'from-image'});
    originalWidth=source.width; originalHeight=source.height;
    const scale = Math.min(1, (enhance ? 512 : 2048) / Math.max(source.width, source.height), Math.sqrt(4 * 1024 * 1024 / (source.width * source.height)));
    const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
    if (Math.min(w,h) < 16) throw Error('工作图短边至少需要 16px，请选择比例更常规或尺寸更大的图片。');
    work = surface(w,h); work.getContext('2d').drawImage(source,0,0,w,h);
    $('filename').textContent = file.name; $('dimensions').textContent = `原图 ${source.width} × ${source.height} px · 工作图 ${w} × ${h} px`;
    $('estimate').textContent = `原图 ${source.width} × ${source.height} → 输入 ${w} × ${h} → 输出 ${w * (enhance ? 3 : 1)} × ${h * (enhance ? 3 : 1)} px${scale < 1 ? '。原图已等比缩小后送入模型。' : '。'}`;
    if (enhance) { $('sharpness').value = 0; $('sharpness-value').textContent = '0%'; }
    const previewScale=Math.min(1,2048/Math.max(source.width,source.height));
    const bounded=surface(Math.max(1,Math.round(source.width*previewScale)),Math.max(1,Math.round(source.height*previewScale)));
    bounded.getContext('2d').drawImage(source,0,0,bounded.width,bounded.height); source.close(); source=bounded;
    $('editor').hidden = false; $('drop').hidden = true; preview(); message('图片已就绪，可以开始处理。');
  } catch (error) { source?.close?.(); source = work = undefined; message(error.message || '无法读取这张图片。', true); }
  finally { $('file').value = ''; busy = false; controls(); }
}
function composite() {
  const out = surface(baseline.width, baseline.height), ctx = out.getContext('2d');
  const value = $('background').value;
  if (value !== 'transparent') { ctx.fillStyle = value === 'custom' ? $('color').value : value; ctx.fillRect(0,0,out.width,out.height); }
  ctx.drawImage(baseline,0,0); result = out;
}
async function sharpen() {
  if (!baseline || busy) return;
  busy = true; controls(); message('正在调整清晰度…');
  try {
    const amount = Number($('sharpness').value) / 100 * 0.65;
    $('sharpness-value').textContent = `${$('sharpness').value}%`;
    const out = surface(baseline.width,baseline.height), ctx = out.getContext('2d'); ctx.drawImage(baseline,0,0);
    if (amount) {
      const original = baseline.getContext('2d').getImageData(0,0,out.width,out.height).data;
      const pixels = ctx.getImageData(0,0,out.width,out.height), d = pixels.data, w = out.width, h = out.height;
      for (let y=1;y<h-1;y++) {
        for (let x=1;x<w-1;x++) { const i=(y*w+x)*4; for(let c=0;c<3;c++) { const blur=(original[i+c]*4+original[i-4+c]+original[i+4+c]+original[i-w*4+c]+original[i+w*4+c])/8; d[i+c]=original[i+c]+amount*(original[i+c]-blur); } }
        if (y % 96 === 0) await nextFrame();
      }
      ctx.putImageData(pixels,0,0);
    }
    result = out; showingResult = true; preview(); message('清晰度已更新，可下载 PNG。');
  } catch { message('调整失败，已保留之前的处理结果。',true); }
  finally { busy = false; controls(); }
}
async function process() {
  if (busy || !work || !ready) return;
  busy = true; controller = new AbortController(); controls(); message('模型正在处理，请稍候…');
  const signal = controller.signal;
  try {
    const response = await fetch(`/api/utilities/image-tools/${mode}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({image:work.toDataURL('image/png')}), signal});
    if (!response.ok) { const error = await response.json().catch(()=>({})); throw Error(error.title || `处理失败（${response.status}），请重试。`); }
    const image = await createImageBitmap(await response.blob());
    if (signal.aborted) { image.close(); throw new DOMException('Canceled','AbortError'); }
    const multiplier = enhance ? 3 : 1;
    if (image.width !== work.width*multiplier || image.height !== work.height*multiplier) { image.close(); throw Error('服务返回的图片尺寸不符合预期，请重试。'); }
    baseline = surface(image.width,image.height); baseline.getContext('2d').drawImage(image,0,0); image.close();
    if (enhance) { result = baseline; $('sharpness').value = 0; $('sharpness-value').textContent='0%'; } else composite();
    showingResult = true; preview(); message('处理完成。可切换原图对比，或调整后下载 PNG。');
  } catch (error) { message(error.name === 'AbortError' ? '已取消处理。' : error.message || '处理失败，请重试。', error.name !== 'AbortError'); }
  finally { controller = undefined; busy = false; controls(); }
}
$('file').addEventListener('change', event => select(event.target.files[0]));
$('replace').addEventListener('click', () => $('file').click());
$('drop').addEventListener('dragover', event => {event.preventDefault(); if (!busy) $('drop').classList.add('dragging');});
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('dragging'));
$('drop').addEventListener('drop', event => {event.preventDefault(); $('drop').classList.remove('dragging'); select(event.dataTransfer.files[0]);});
$('before').addEventListener('click', () => {showingResult=false;preview();});
$('after').addEventListener('click', () => {showingResult=true;preview();});
$('process').addEventListener('click', process);
$('cancel').addEventListener('click', () => controller?.abort());
$('retry-status').addEventListener('click', checkStatus);
if (enhance) $('sharpness').addEventListener('change', sharpen);
else for (const id of ['background','color']) $(id).addEventListener('input', () => {if(baseline && !busy) {composite();showingResult=true;preview();}});
$('download').addEventListener('click', async () => {
  if (!result || busy) return;
  busy = true; controls();
  try { const blob = await new Promise(resolve => result.toBlob(resolve,'image/png')); if (!blob) throw Error(); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`image-${mode}.png`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); message(`PNG 已生成 · ${result.width} × ${result.height} px`); }
  catch {message('生成下载文件失败，请重试。',true);}
  finally {busy=false;controls();}
});
checkStatus();
