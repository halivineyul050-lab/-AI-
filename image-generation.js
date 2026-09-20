const MAX_REFERENCE_BYTES = 15 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 1000;
const DEMO_ASSETS = {
  square: '/assets/image-generation/demo-square.svg',
  landscape: '/assets/image-generation/demo-landscape.svg',
  portrait: '/assets/image-generation/demo-portrait.svg'
};

let canvasController = null;

function validateReferenceFile(file) {
  if (!file?.type?.startsWith('image/')) return { ok: false, message: '请选择图片文件。' };
  if (file.size > MAX_REFERENCE_BYTES) return { ok: false, message: '图片不能超过 15MB。' };
  return { ok: true, message: '' };
}

function ratioKind(ratio) {
  const [width, height] = ratio.split(':').map(Number);
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
}

function ratioCss(ratio) {
  return ratio.replace(':', '/');
}

function createDemoResults({ count, ratio, prompt }) {
  const src = DEMO_ASSETS[ratioKind(ratio)];
  return Array.from({ length: Number(count) }, (_, index) => ({
    id: `demo-${Date.now()}-${index}`,
    src,
    ratio,
    alt: `演示结果 ${index + 1}：${prompt.slice(0, 48)}`
  }));
}

function setMessage(element, message, tone = '') {
  element.textContent = message;
  element.hidden = !message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function downloadResult(result) {
  const link = document.createElement('a');
  link.href = result.src;
  link.download = `泥壳AI-演示结果-${result.id}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
}

async function sendResultToCanvas(result) {
  if (!canvasController) return;
  await canvasController.addImage(result.src, result.alt, false);
  document.querySelector('#studio-mode-canvas').click();
}

function renderResults(container, results, settings, onRepeat) {
  container.replaceChildren();
  const heading = document.createElement('header');
  heading.className = 'results-heading';
  heading.innerHTML = `<div><h2>创作结果</h2><p>当前为本地演示结果 · ${settings.style} · ${settings.ratio}</p></div>`;
  const repeat = document.createElement('button');
  repeat.type = 'button';
  repeat.className = 'results-repeat';
  repeat.textContent = '再次生成';
  repeat.addEventListener('click', onRepeat);
  heading.append(repeat);
  container.append(heading);

  results.forEach((result) => {
    const card = document.createElement('article');
    card.className = 'result-card';
    const visual = document.createElement('div');
    visual.className = 'result-visual';
    visual.style.setProperty('--result-ratio', ratioCss(result.ratio));
    const image = new Image();
    image.src = result.src;
    image.alt = result.alt;
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = '演示结果';
    visual.append(image, badge);
    const footer = document.createElement('footer');
    const caption = document.createElement('span');
    caption.textContent = settings.prompt;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = '下载';
    download.addEventListener('click', () => downloadResult(result));
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = '送入画布';
    edit.addEventListener('click', () => sendResultToCanvas(result));
    actions.append(download, edit);
    footer.append(caption, actions);
    card.append(visual, footer);
    container.append(card);
  });
  container.hidden = false;
  container.classList.add('has-results');
  container.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function startSimulatedGeneration(elements) {
  const prompt = elements.prompt.value.trim();
  if (!prompt) {
    setMessage(elements.promptError, '请先描述你想创作的画面。', 'error');
    elements.prompt.focus();
    return;
  }
  setMessage(elements.promptError, '');
  const formData = new FormData(elements.form);
  const settings = {
    prompt,
    ratio: formData.get('ratio'),
    style: formData.get('style'),
    count: Number(formData.get('count'))
  };
  elements.form.classList.add('is-busy');
  elements.submit.disabled = true;
  elements.results.hidden = true;
  elements.results.classList.remove('has-results');
  elements.status.hidden = false;
  elements.status.innerHTML = '<strong>正在准备画面…</strong><div class="progress-track"><div class="progress-bar"></div></div>';
  const bar = elements.status.querySelector('.progress-bar');
  const steps = [
    { progress: 24, label: '正在理解提示词…' },
    { progress: 58, label: '正在组合色彩与构图…' },
    { progress: 86, label: '正在完成演示结果…' },
    { progress: 100, label: '演示结果已完成' }
  ];
  let index = 0;
  const advance = () => {
    const step = steps[index];
    elements.status.querySelector('strong').textContent = step.label;
    bar.style.setProperty('--progress', `${step.progress}%`);
    index += 1;
    if (index < steps.length) {
      window.setTimeout(advance, 360);
      return;
    }
    window.setTimeout(() => {
      elements.form.classList.remove('is-busy');
      elements.submit.disabled = false;
      elements.status.hidden = true;
      const results = createDemoResults(settings);
      renderResults(elements.results, results, settings, () => startSimulatedGeneration(elements));
    }, 260);
  };
  window.setTimeout(advance, 80);
}

function createCanvasController(elements) {
  const canvas = elements.stage;
  const context = canvas.getContext('2d');
  const layers = [];
  let selectedId = '';
  let drag = null;

  const selectedLayer = () => layers.find((layer) => layer.id === selectedId) || null;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const updateControls = () => {
    const selected = selectedLayer();
    elements.empty.hidden = layers.length > 0;
    elements.deleteButton.disabled = !selected;
    elements.exportButton.disabled = layers.length === 0;
    elements.scale.disabled = !selected;
    elements.scale.value = String(Math.round((selected?.scale || 1) * 100));
    canvas.classList.toggle('is-selected', Boolean(selected));
  };
  const drawLayer = (layer) => {
    const width = layer.width * layer.scale;
    const height = layer.height * layer.scale;
    context.drawImage(layer.image, layer.x - width / 2, layer.y - height / 2, width, height);
    if (layer.id === selectedId) {
      context.save();
      context.strokeStyle = '#7c66ee';
      context.lineWidth = Math.max(3, canvas.width / 300);
      context.setLineDash([12, 8]);
      context.strokeRect(layer.x - width / 2, layer.y - height / 2, width, height);
      context.restore();
    }
  };
  const render = (includeSelection = true) => {
    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    layers.forEach((layer) => {
      if (!includeSelection && layer.id === selectedId) {
        const prior = selectedId;
        selectedId = '';
        drawLayer(layer);
        selectedId = prior;
      } else drawLayer(layer);
    });
    context.restore();
    updateControls();
  };
  const hitTest = (x, y) => [...layers].reverse().find((layer) => {
    const halfWidth = layer.width * layer.scale / 2;
    const halfHeight = layer.height * layer.scale / 2;
    return x >= layer.x - halfWidth && x <= layer.x + halfWidth && y >= layer.y - halfHeight && y <= layer.y + halfHeight;
  });
  const pointFromEvent = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };

  canvas.addEventListener('pointerdown', (event) => {
    const point = pointFromEvent(event);
    const layer = hitTest(point.x, point.y);
    selectedId = layer?.id || '';
    if (layer) {
      canvas.setPointerCapture(event.pointerId);
      drag = { pointerId: event.pointerId, offsetX: point.x - layer.x, offsetY: point.y - layer.y };
    }
    render();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const layer = selectedLayer();
    if (!layer) return;
    const point = pointFromEvent(event);
    const halfWidth = layer.width * layer.scale / 2;
    const halfHeight = layer.height * layer.scale / 2;
    layer.x = clamp(point.x - drag.offsetX, -halfWidth * .7, canvas.width + halfWidth * .7);
    layer.y = clamp(point.y - drag.offsetY, -halfHeight * .7, canvas.height + halfHeight * .7);
    render();
  });
  const endDrag = (event) => {
    if (drag?.pointerId === event.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  async function addImage(source, alt = '画布图片', ownedUrl = false) {
    const image = new Image();
    image.alt = alt;
    image.src = source;
    try {
      await image.decode();
    } catch {
      if (ownedUrl) URL.revokeObjectURL(source);
      throw new Error('图片无法读取，请换一张图片重试。');
    }
    const fit = Math.min(canvas.width * .72 / image.naturalWidth, canvas.height * .72 / image.naturalHeight, 1);
    const layer = {
      id: `layer-${Date.now()}-${layers.length}`,
      image,
      src: source,
      x: canvas.width / 2,
      y: canvas.height / 2,
      scale: 1,
      width: image.naturalWidth * fit,
      height: image.naturalHeight * fit,
      ownedUrl
    };
    layers.push(layer);
    selectedId = layer.id;
    render();
    setMessage(elements.message, '图片已加入画布，可拖动或缩放。', 'success');
    return layer;
  }
  function removeSelected() {
    const index = layers.findIndex((layer) => layer.id === selectedId);
    if (index < 0) return;
    const [removed] = layers.splice(index, 1);
    if (removed.ownedUrl) URL.revokeObjectURL(removed.src);
    selectedId = layers.at(-1)?.id || '';
    render();
    setMessage(elements.message, '已删除所选图片。');
  }
  function setScale(value) {
    const layer = selectedLayer();
    if (!layer) return;
    layer.scale = clamp(Number(value) / 100, .2, 2.4);
    render();
  }
  function setRatio(ratio) {
    const [width, height] = ratio.split(':').map(Number);
    const longest = 960;
    canvas.width = width >= height ? longest : Math.round(longest * width / height);
    canvas.height = height >= width ? longest : Math.round(longest * height / width);
    layers.forEach((layer) => {
      layer.x = clamp(layer.x, 0, canvas.width);
      layer.y = clamp(layer.y, 0, canvas.height);
    });
    render();
  }
  function exportPng() {
    if (!layers.length) return;
    render(false);
    canvas.toBlob((blob) => {
      render(true);
      if (!blob) {
        setMessage(elements.message, '导出失败，请重试。', 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `泥壳AI-画布-${Date.now()}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(elements.message, '画布已导出为 PNG。', 'success');
    }, 'image/png');
  }
  function destroy() {
    layers.forEach((layer) => {
      if (layer.ownedUrl) URL.revokeObjectURL(layer.src);
    });
  }
  render();
  return { addImage, removeSelected, setScale, setRatio, render, exportPng, destroy };
}

function initImageStudio() {
  const elements = {
    form: document.querySelector('#generation-form'),
    prompt: document.querySelector('#prompt-input'),
    promptCount: document.querySelector('#prompt-count'),
    promptError: document.querySelector('#prompt-error'),
    referenceInput: document.querySelector('#reference-input'),
    referenceTrigger: document.querySelector('#reference-trigger'),
    referencePreview: document.querySelector('#reference-preview'),
    referenceError: document.querySelector('#reference-error'),
    submit: document.querySelector('#generate-submit'),
    status: document.querySelector('#generation-status'),
    results: document.querySelector('#generation-results'),
    composer: document.querySelector('.generation-composer')
  };
  if (!elements.form) return;
  let referenceUrl = '';

  const clearReference = () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    referenceUrl = '';
    elements.referenceInput.value = '';
    elements.referencePreview.replaceChildren();
    elements.referencePreview.hidden = true;
    elements.composer.classList.remove('has-reference');
  };
  elements.referenceTrigger.addEventListener('click', () => elements.referenceInput.click());
  elements.referenceInput.addEventListener('change', () => {
    const file = elements.referenceInput.files?.[0];
    const validation = validateReferenceFile(file);
    if (!validation.ok) {
      clearReference();
      setMessage(elements.referenceError, validation.message, 'error');
      return;
    }
    clearReference();
    setMessage(elements.referenceError, '');
    referenceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = referenceUrl;
    image.alt = '参考图预览';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', '移除参考图');
    remove.textContent = '×';
    remove.addEventListener('click', clearReference);
    elements.referencePreview.append(image, remove);
    elements.referencePreview.hidden = false;
    elements.composer.classList.add('has-reference');
  });
  elements.prompt.addEventListener('input', () => {
    if (elements.prompt.value.length > MAX_PROMPT_LENGTH) elements.prompt.value = elements.prompt.value.slice(0, MAX_PROMPT_LENGTH);
    elements.promptCount.textContent = String(elements.prompt.value.length);
    if (elements.prompt.value.trim()) setMessage(elements.promptError, '');
  });
  document.querySelectorAll('.inspiration-chip').forEach((chip) => chip.addEventListener('click', () => {
    elements.prompt.value = chip.dataset.prompt.slice(0, MAX_PROMPT_LENGTH);
    elements.prompt.dispatchEvent(new Event('input'));
    elements.prompt.focus();
  }));
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!elements.submit.disabled) startSimulatedGeneration(elements);
  });

  const modeButtons = [...document.querySelectorAll('.studio-mode')];
  const panels = [document.querySelector('#generate-panel'), document.querySelector('#canvas-panel')];
  modeButtons.forEach((button, buttonIndex) => button.addEventListener('click', () => {
    modeButtons.forEach((item, index) => {
      const active = index === buttonIndex;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      panels[index].hidden = !active;
    });
  }));
  const canvasElements = {
    stage: document.querySelector('#canvas-stage'),
    empty: document.querySelector('#canvas-empty'),
    upload: document.querySelector('#canvas-upload'),
    ratio: document.querySelector('#canvas-ratio'),
    scale: document.querySelector('#canvas-scale'),
    scaleDown: document.querySelector('#canvas-scale-down'),
    scaleUp: document.querySelector('#canvas-scale-up'),
    deleteButton: document.querySelector('#canvas-delete'),
    exportButton: document.querySelector('#canvas-export'),
    message: document.querySelector('#canvas-message')
  };
  canvasController = createCanvasController(canvasElements);
  canvasElements.upload.addEventListener('change', async () => {
    const file = canvasElements.upload.files?.[0];
    const validation = validateReferenceFile(file);
    if (!validation.ok) {
      setMessage(canvasElements.message, validation.message, 'error');
      canvasElements.upload.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await canvasController.addImage(url, file.name, true);
    } catch (error) {
      setMessage(canvasElements.message, error.message, 'error');
    }
    canvasElements.upload.value = '';
  });
  canvasElements.ratio.addEventListener('change', () => canvasController.setRatio(canvasElements.ratio.value));
  canvasElements.scale.addEventListener('input', () => canvasController.setScale(canvasElements.scale.value));
  canvasElements.scaleDown.addEventListener('click', () => canvasController.setScale(Number(canvasElements.scale.value) - 10));
  canvasElements.scaleUp.addEventListener('click', () => canvasController.setScale(Number(canvasElements.scale.value) + 10));
  canvasElements.deleteButton.addEventListener('click', () => canvasController.removeSelected());
  canvasElements.exportButton.addEventListener('click', () => canvasController.exportPng());
  window.addEventListener('pagehide', () => {
    clearReference();
    canvasController.destroy();
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', initImageStudio);
