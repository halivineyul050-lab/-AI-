import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateFullVideoMetadata, validateVideoFile } from '../video-input-limits.js';

test('video file validation accepts 500MB and rejects larger or empty files', () => {
  assert.doesNotThrow(() => validateVideoFile({ size: 500 * 1024 * 1024 }));
  assert.throws(() => validateVideoFile({ size: 500 * 1024 * 1024 + 1 }), /500MB/);
  for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateVideoFile({ size }), /500MB/);
  }
});

test('full-video validation accepts 30-minute 4K input and rejects larger metadata', () => {
  assert.deepEqual(
    validateFullVideoMetadata({ duration: 1800, width: 3840, height: 2160 }),
    { duration: 1800, width: 3840, height: 2160 },
  );
  assert.throws(() => validateFullVideoMetadata({ duration: 1800.01, width: 3840, height: 2160 }), /30 分钟/);
  assert.throws(() => validateFullVideoMetadata({ duration: 1800, width: 3841, height: 2160 }), /3840px/);
  for (const patch of [{ duration: 0 }, { width: 0 }, { height: Number.NaN }]) {
    assert.throws(() => validateFullVideoMetadata({ duration: 1800, width: 3840, height: 2160, ...patch }));
  }
});
