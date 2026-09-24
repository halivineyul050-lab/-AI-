export const MAX_IMAGE_PIXELS = 40_000_000;

function dimensions(width, height) {
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error("Invalid image dimensions");
  return { width, height };
}

// These bounded parsers validate structure, not the decoded values of pixels.
export function inspectJpeg(bytes) {
  if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error("Invalid JPEG start");
  let offset = 2, frame, sawScan = false;
  const quantization = new Set(), huffman = new Set();
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("Invalid JPEG marker");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frame || !sawScan || offset !== bytes.length) throw new Error("Incomplete JPEG");
      return frame;
    }
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) throw new Error("Invalid JPEG marker");
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) throw new Error("Truncated JPEG segment");
    const data = bytes.subarray(offset + 2, end);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const count = data[5];
      if (frame || !count || count > 4 || data.length !== 6 + count * 3 || ![8, 12].includes(data[0]) || (marker === 0xc0 && data[0] !== 8)) throw new Error("Invalid JPEG frame");
      frame = { ...dimensions(data.readUInt16BE(3), data.readUInt16BE(1)), progressive: marker === 0xc2, components: new Map() };
      for (let i = 6; i < data.length; i += 3) {
        const id = data[i], horizontal = data[i + 1] >> 4, vertical = data[i + 1] & 15, table = data[i + 2];
        if (frame.components.has(id) || !horizontal || horizontal > 4 || !vertical || vertical > 4 || table > 3) throw new Error("Invalid JPEG component");
        frame.components.set(id, table);
      }
    } else if (marker === 0xdb) {
      let cursor = 0;
      while (cursor < data.length) {
        const descriptor = data[cursor++], precision = descriptor >> 4, table = descriptor & 15;
        if (precision > 1 || table > 3 || cursor + 64 * (precision + 1) > data.length) throw new Error("Invalid JPEG quantization");
        for (let i = 0; i < 64; i++, cursor += precision + 1) {
          if (!(precision ? data.readUInt16BE(cursor) : data[cursor])) throw new Error("Invalid JPEG quantization");
        }
        quantization.add(table);
      }
      if (!data.length) throw new Error("Empty JPEG quantization");
    } else if (marker === 0xc4) {
      let cursor = 0;
      while (cursor < data.length) {
        const table = data[cursor++];
        if ((table >> 4) > 1 || (table & 15) > 3 || cursor + 16 > data.length) throw new Error("Invalid JPEG Huffman table");
        let count = 0, available = 1;
        for (let i = 0; i < 16; i++) {
          const entries = data[cursor++];
          available = available * 2 - entries;
          count += entries;
          if (available < 0) throw new Error("Invalid JPEG Huffman tree");
        }
        if (!count || count > 256 || cursor + count > data.length) throw new Error("Truncated JPEG Huffman table");
        cursor += count;
        huffman.add(table);
      }
      if (!data.length) throw new Error("Empty JPEG Huffman table");
    } else if (marker === 0xda) {
      const count = data[0];
      if (!frame || !count || count > frame.components.size || data.length !== 4 + 2 * count) throw new Error("Invalid JPEG scan");
      const start = data[data.length - 3], finish = data[data.length - 2], approximation = data[data.length - 1];
      if (frame.progressive ? (start > finish || finish > 63 || (start === 0 && finish !== 0) || (start > 0 && count !== 1) || (approximation >> 4) > 13 || (approximation & 15) > 13) : (start !== 0 || finish !== 63 || approximation !== 0)) throw new Error("Invalid JPEG scan parameters");
      const components = new Set();
      for (let i = 1; i <= count * 2; i += 2) {
        const id = data[i], tables = data[i + 1];
        if (components.has(id) || !frame.components.has(id) || !quantization.has(frame.components.get(id)) || (tables >> 4) > 3 || (tables & 15) > 3) throw new Error("Invalid JPEG scan component");
        if ((start === 0 && !huffman.has(tables >> 4)) || (finish > 0 && !huffman.has(0x10 | (tables & 15)))) throw new Error("Missing JPEG Huffman table");
        components.add(id);
      }
      offset = end;
      let entropyBytes = 0;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; entropyBytes++; continue; }
        if (bytes[offset + 1] === 0) { offset += 2; entropyBytes++; continue; }
        const markerStart = offset;
        while (bytes[offset] === 0xff) offset++;
        if (bytes[offset] >= 0xd0 && bytes[offset] <= 0xd7) { offset++; continue; }
        offset = markerStart;
        break;
      }
      if (!entropyBytes) throw new Error("Missing JPEG scan data");
      sawScan = true;
      continue;
    } else if (marker === 0xdd) {
      if (data.length !== 2) throw new Error("Invalid JPEG restart interval");
    } else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      throw new Error("Unsupported JPEG segment");
    }
    offset = end;
  }
  throw new Error("Missing JPEG end");
}

function inspectWebpPayload(type, data) {
  if (type === "VP8 ") {
    if (data.length <= 10 || data[0] & 1 || ((data[0] >> 1) & 7) > 3 || !(data[0] & 16) || !data.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) throw new Error("Invalid WebP key frame");
    const partition = data.readUIntLE(0, 3) >> 5;
    if (!partition || 10 + partition >= data.length) throw new Error("Truncated WebP partition");
    return dimensions(data.readUInt16LE(6) & 0x3fff, data.readUInt16LE(8) & 0x3fff);
  }
  if (data.length <= 5 || data[0] !== 0x2f) throw new Error("Invalid lossless WebP frame");
  const bits = data.readUInt32LE(1);
  if (bits >>> 29) throw new Error("Invalid lossless WebP version");
  return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
}

export function inspectWebp(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error("Invalid WebP container");
  let offset = 12, canvas, image;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("Truncated WebP chunk");
    const type = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length, paddedEnd = end + (length & 1);
    if (paddedEnd > bytes.length || ((length & 1) && bytes[end] !== 0)) throw new Error("Invalid WebP chunk length");
    const data = bytes.subarray(offset + 8, end);
    if (type === "VP8X") {
      // Generated results are still images; an animation requires separate frame validation.
      if (offset !== 12 || length !== 10 || data[0] & 0xc3 || data[1] || data[2] || data[3]) throw new Error("Invalid WebP extended header");
      canvas = dimensions(data.readUIntLE(4, 3) + 1, data.readUIntLE(7, 3) + 1);
    } else if (type === "VP8 " || type === "VP8L") {
      if (image || (!canvas && offset !== 12)) throw new Error("Invalid WebP image order");
      image = inspectWebpPayload(type, data);
      if (canvas && (image.width !== canvas.width || image.height !== canvas.height)) throw new Error("Inconsistent WebP dimensions");
    } else if (!canvas || type === "ANIM" || type === "ANMF") {
      throw new Error("Unsupported WebP chunk");
    }
    offset = paddedEnd;
  }
  if (!image) throw new Error("Missing WebP image data");
  return image;
}
