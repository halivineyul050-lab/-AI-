export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const VIDEO_MAX_DURATION = 30 * 60;
export const VIDEO_MAX_EDGE = 3840;
export const VIDEO_EXPORT_TIMEOUT_MS = 30 * 60 * 1000;

export function validateVideoFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > VIDEO_MAX_BYTES) {
    throw new Error('请选择非空且不超过 500MB 的视频。');
  }
  return file;
}

export function validateFullVideoMetadata({ duration, width, height }) {
  if (![duration, width, height].every(Number.isFinite) || duration <= 0 || width < 2 || height < 2) {
    throw new Error('无法确定视频时长或尺寸，请换一个视频。');
  }
  if (duration > VIDEO_MAX_DURATION) throw new Error('请选择时长不超过 30 分钟的视频。');
  if (width > VIDEO_MAX_EDGE || height > VIDEO_MAX_EDGE) throw new Error('请选择最长边不超过 3840px 的视频。');
  return { duration, width, height };
}
