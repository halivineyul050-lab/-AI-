import { createGifSession } from './video-gif-core.js';

let session;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'start') session = createGifSession(data.width, data.height);
    else if (data.type === 'frame') session.add(new Uint8ClampedArray(data.rgba), data.delay);
    else if (data.type === 'finish') {
      const bytes = session.finish();
      session = null;
      self.postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
      return;
    } else throw new Error('无法识别转换任务。');
    self.postMessage({ ok: true });
  } catch (error) {
    self.postMessage({ error: error.message || 'GIF 编码失败。' });
  }
};
