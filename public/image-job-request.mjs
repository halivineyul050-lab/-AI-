// Submit only once. A network timeout is not proof that the server cancelled a job.
export async function fetchImageJob(url, options = {}, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const parent = options.signal;
  const cancel = () => controller.abort(parent.reason);
  let timer, onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  timer = setTimeout(() => {
    const error = new Error('请求超时，任务可能仍在生成，请查询原任务或查看云历史，避免重复生成。');
    error.code = 'image_wait_timeout';
    error.requiresConfirmation = true;
    controller.abort(error);
  }, timeoutMs);
  try {
    return await Promise.race([aborted, (async () => {
      if (controller.signal.aborted) throw controller.signal.reason;
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      return { status: response.status, ok: response.ok, json: async () => payload };
    })()]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
