import { buildFramePlan } from './video-gif-core.js?v=20260915-limit-1';
import { validateVideoFile } from './video-input-limits.js';

const $ = (id) => document.getElementById(id);
const video = $('source-video');
const fileInput = $('video-file');
const fields = $('settings-fields');
let file, sourceUrl, resultUrl, worker, task, loader, busy = false, previewEnd = null;
const sizeLabel = (bytes) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const abortError = () => new DOMException('已取消', 'AbortError');

function status(message = '', error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function plan() {
  return buildFramePlan({ duration: video.duration, width: video.videoWidth, height: video.videoHeight,
    start: Number($('clip-start').value), end: Number($('clip-end').value),
    fps: Number($('frame-rate').value), speed: Number($('playback-speed').value), maxEdge: Number($('max-edge').value) });
}

function updateEstimate() {
  if (!file || busy) return;
  try {
    const p = plan();
    $('estimate').textContent = `${p.width} × ${p.height} px · ${(p.delays.reduce((a,b) => a+b,0)/1000).toFixed(2)} 秒 · ${p.times.length} 帧`;
    $('convert').disabled = false;
    status();
  } catch (error) { $('estimate').textContent = error.message; $('convert').disabled = true; }
}

function waitMedia(event, action, signal, ready = () => false) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const cleanup = () => {
      clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('浏览器无法读取这个视频，请尝试 MP4（H.264）或 WebM 格式。')); };
    const aborted = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('读取视频超时，请尝试较小的视频或更换格式。')); }, 20000);
    video.addEventListener(event, done, {once: true}); video.addEventListener('error', failed, {once: true});
    signal?.addEventListener('abort', aborted, {once:true});
    try { action(); if (ready()) done(); } catch (error) { cleanup(); reject(error); }
  });
}

async function seek(time, signal) {
  if (signal.aborted) throw abortError();
  const sameTime = Math.abs(video.currentTime - time) < 0.00001;
  if (sameTime && !video.seeking && video.readyState >= 2) return;
  await waitMedia('seeked', () => {
    if (!sameTime || !video.seeking) video.currentTime = time;
  }, signal);
  if (video.readyState < 2) await waitMedia('loadeddata', () => {}, signal, () => video.readyState >= 2);
}

function clearResult() {
  $('result').hidden = true;
  $('gif-preview').removeAttribute('src'); $('download').removeAttribute('href');
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
}

async function loadFile(candidate) {
  if (!candidate || busy) return;
  loader?.abort(); loader = new AbortController();
  const signal = loader.signal;
  file = null; fields.disabled = true; $('convert').disabled = true;
  previewEnd = null; video.pause(); clearResult(); status();
  $('progress-area').hidden = true;
  $('source-preview').hidden = true; $('dropzone').hidden = false;
  video.removeAttribute('src'); video.load();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = null;
  $('estimate').textContent = '选择视频后即可调整参数';
  try { validateVideoFile(candidate); } catch (error) { status(error.message, true); return; }
  if (!candidate.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(candidate.name)) {
    status('请选择视频文件，例如 MP4、WebM 或 MOV。', true); return;
  }
  sourceUrl = URL.createObjectURL(candidate);
  status('正在读取本地视频…');
  try {
    await waitMedia('loadeddata', () => { video.src = sourceUrl; video.load(); }, signal, () => video.readyState >= 2);
    if (signal.aborted) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('无法确定视频时长或尺寸，请换一个视频。');
    file = candidate;
    $('file-name').textContent = file.name;
    $('file-meta').textContent = `${sizeLabel(file.size)} · ${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(2)} 秒`;
    $('clip-start').value = '0';
    // Keep the rounded form value inside the actual duration.
    $('clip-end').value = String(Math.floor(Math.min(5, video.duration) * 100) / 100);
    $('clip-start').max = String(video.duration); $('clip-end').max = String(video.duration);
    fields.disabled = false; $('source-preview').hidden = false; $('dropzone').hidden = true;
    updateEstimate();
  } catch (error) {
    if (signal.aborted) return;
    status(error.message, true);
    video.removeAttribute('src'); video.load();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
  }
}

function sendWorker(message, signal, transfer = []) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const current = worker;
    const cleanup = () => { clearTimeout(timer); current.removeEventListener('message', received); current.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
    const received = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data); };
    const failed = () => { cleanup(); reject(new Error('转换模块加载或运行失败，请刷新页面后重试。')); };
    const aborted = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('编码耗时过长，请缩小尺寸或缩短片段后重试。')); }, 30000);
    current.addEventListener('message', received); current.addEventListener('error', failed); signal.addEventListener('abort', aborted, {once:true});
    try { current.postMessage(message, transfer); } catch (error) { cleanup(); reject(error); }
  });
}

function lock(value) {
  busy = value; fields.disabled = value; fileInput.disabled = value;
  $('replace-file').disabled = value; $('convert').disabled = value; $('cancel').hidden = !value;
  video.controls = !value;
}

$('convert-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !file) return;
  let p;
  try { p = plan(); } catch (error) { status(error.message, true); return; }
  clearResult(); previewEnd = null; video.pause();
  task?.abort(); task = new AbortController(); const signal = task.signal;
  lock(true); status('正在本地转换，请保持页面打开。');
  $('progress-area').hidden = false; $('convert-progress').value = 0; $('progress-percent').textContent = '0%';
  $('progress-label').textContent = '正在准备…';
  const canvas = document.createElement('canvas'); canvas.width = p.width; canvas.height = p.height;
  try {
    worker = new Worker('/video-gif-worker.js', {type:'module'});
    await sendWorker({type:'start', width:p.width, height:p.height}, signal);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if (!context) throw new Error('当前浏览器无法创建画布，请更换浏览器。');
    for (let i = 0; i < p.times.length; i++) {
      await seek(p.times[i], signal);
      context.drawImage(video, 0, 0, p.width, p.height);
      const rgba = context.getImageData(0,0,p.width,p.height).data.buffer;
      await sendWorker({type:'frame', rgba, delay:p.delays[i]}, signal, [rgba]);
      const percent = Math.round((i+1) / p.times.length * 99);
      $('convert-progress').value = percent; $('progress-percent').textContent = `${percent}%`;
      $('progress-label').textContent = `已处理 ${i+1} / ${p.times.length} 帧`;
    }
    const { bytes } = await sendWorker({type:'finish'}, signal);
    if (signal.aborted) throw abortError();
    const blob = new Blob([bytes], {type:'image/gif'});
    resultUrl = URL.createObjectURL(blob);
    $('gif-preview').src = resultUrl; $('download').href = resultUrl;
    $('download').download = `${file.name.replace(/\.[^.]+$/, '') || 'video'}.gif`;
    $('result-meta').textContent = `${p.width} × ${p.height} px · ${sizeLabel(blob.size)}`;
    $('result').hidden = false;
    $('convert-progress').value = 100; $('progress-percent').textContent = '100%'; $('progress-label').textContent = '转换完成';
    status('转换完成，可以预览并下载 GIF。');
    $('download').focus({preventScroll:true});
    $('result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth', block:'nearest'});
  } catch (error) {
    $('progress-area').hidden = true;
    status(error.name === 'AbortError' ? '已取消转换，你可以调整参数后重新开始。' : error.message, error.name !== 'AbortError');
  } finally {
    worker?.terminate(); worker = null; task = null;
    canvas.width = canvas.height = 0; lock(false);
  }
});

fileInput.addEventListener('change', () => { const selected = fileInput.files[0]; fileInput.value = ''; void loadFile(selected); });
$('replace-file').addEventListener('click', () => fileInput.click());
for (const name of ['dragenter','dragover']) $('dropzone').addEventListener(name, (event) => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const name of ['dragleave','drop']) $('dropzone').addEventListener(name, (event) => { event.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', (event) => { if (event.dataTransfer.files.length !== 1) { status('每次请选择一个视频。', true); return; } void loadFile(event.dataTransfer.files[0]); });
// Avoid navigating away if a file is accidentally dropped outside the target.
for (const name of ['dragover','drop']) document.addEventListener(name, (event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
fields.addEventListener('input', () => { previewEnd = null; video.pause(); updateEstimate(); });
$('cancel').addEventListener('click', () => { task?.abort(); worker?.terminate(); video.pause(); });
$('preview-clip').addEventListener('click', async () => {
  try {
    plan(); video.pause(); video.currentTime = Number($('clip-start').value);
    previewEnd = Number($('clip-end').value); video.playbackRate = Number($('playback-speed').value);
    await video.play();
  } catch (error) { status(error.message || '无法预览视频。', true); }
});
video.addEventListener('timeupdate', () => { if (previewEnd !== null && video.currentTime >= previewEnd) { video.pause(); previewEnd = null; } });
window.addEventListener('pagehide', () => {
  loader?.abort(); task?.abort(); worker?.terminate(); video.pause();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  clearResult();
});
window.addEventListener('pageshow', (event) => { if (event.persisted && file) void loadFile(file); });
