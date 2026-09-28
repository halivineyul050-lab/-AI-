import { GIFEncoder, quantize, applyPalette } from './assets/vendor/gifenc/gifenc.js';

export function buildFramePlan({ duration, width, height, start, end, fps, speed, maxEdge }) {
  if (![duration, width, height, start, end, fps, speed, maxEdge].every(Number.isFinite)
      || duration <= 0 || width < 1 || height < 1 || start < 0 || end > duration || end <= start) {
    throw new Error('请填写有效的开始和结束时间，结束时间需晚于开始且不超过视频时长。');
  }
  if (end - start > 30) throw new Error('每次最多转换 30 秒，请缩短截取片段。');
  if (fps < 5 || fps > 20 || speed < 0.5 || speed > 2 || maxEdge < 120 || maxEdge > 720) {
    throw new Error('请使用页面提供的尺寸、帧率和速度范围。');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const outputSeconds = (end - start) / speed;
  const count = Math.max(1, Math.ceil(outputSeconds * fps));
  if (count > 600 || outputWidth * outputHeight * count > 120_000_000) {
    throw new Error('当前设置计算量较大，请缩短片段、减小尺寸或降低帧率。');
  }
  // GIF delays are measured in centiseconds. Distribute rounding across frames.
  const ticks = Math.max(count * 2, Math.round(outputSeconds * 100));
  return {
    width: outputWidth, height: outputHeight,
    times: Array.from({length: count}, (_, i) => start + i * (end - start) / count),
    delays: Array.from({length: count}, (_, i) => (Math.round((i + 1) * ticks / count) - Math.round(i * ticks / count)) * 10)
  };
}

export function createGifSession(width, height) {
  const encoder = GIFEncoder();
  return {
    add(rgba, delay) {
      if (rgba.length !== width * height * 4) throw new Error('视频帧尺寸不匹配。');
      const palette = quantize(rgba, 256);
      encoder.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay, repeat: 0 });
      if (encoder.bytesView().byteLength > 80 * 1024 * 1024) throw new Error('GIF 已超过 80MB，请降低尺寸或缩短片段。');
    },
    finish() { encoder.finish(); return encoder.bytes(); }
  };
}
