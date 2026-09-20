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
  window.addEventListener('pagehide', clearReference, { once: true });
}

document.addEventListener('DOMContentLoaded', initImageStudio);
