// Streaming PNG encoder: rows go in strip by strip, so images far larger than
// any single canvas can be written. Uses the platform's CompressionStream.

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** iTXt chunk body: UTF-8 text under a Latin-1 keyword, uncompressed. */
function itxt(keyword: string, text: string): Uint8Array {
  const k = new TextEncoder().encode(keyword);
  const t = new TextEncoder().encode(text);
  const out = new Uint8Array(k.length + 5 + t.length);
  out.set(k, 0); // followed by: null, compression flag, method, empty language, empty translated keyword
  out.set(t, k.length + 5);
  return out;
}

function paethRow(cur: Uint8Array, prev: Uint8Array, out: Uint8Array, at: number) {
  out[at] = 4; // filter type: Paeth
  for (let i = 0; i < cur.length; i++) {
    const a = i >= 3 ? cur[i - 3] : 0;
    const b = prev[i];
    const c = i >= 3 ? prev[i - 3] : 0;
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    out[at + 1 + i] = (cur[i] - pred) & 255;
  }
}

export interface PngWriter {
  /** Append `rows` rows of RGBA pixels (alpha is dropped). */
  writeRows(rgba: Uint8ClampedArray, rows: number): Promise<void>;
  finish(): Promise<Blob>;
}

/** 8-bit RGB PNG, with optional text metadata (e.g. params for reproducibility). */
export function createPngWriter(width: number, height: number, text: Record<string, string> = {}): PngWriter {
  const compressor = new CompressionStream('deflate');
  const writer = compressor.writable.getWriter();
  const compressed: Uint8Array[] = [];
  const reading = (async () => {
    const reader = compressor.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      compressed.push(value);
    }
  })();

  const stride = width * 3;
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  let written = 0;

  return {
    async writeRows(rgba, rows) {
      const buf = new Uint8Array(rows * (stride + 1));
      for (let r = 0; r < rows; r++) {
        const src = r * width * 4;
        for (let x = 0; x < width; x++) {
          cur[x * 3] = rgba[src + x * 4];
          cur[x * 3 + 1] = rgba[src + x * 4 + 1];
          cur[x * 3 + 2] = rgba[src + x * 4 + 2];
        }
        paethRow(cur, prev, buf, r * (stride + 1));
        [prev, cur] = [cur, prev];
      }
      written += rows;
      await writer.write(buf);
    },

    async finish() {
      if (written !== height) throw new Error(`PNG expected ${height} rows, got ${written}`);
      await writer.close();
      await reading;

      const ihdr = new Uint8Array(13);
      const view = new DataView(ihdr.buffer);
      view.setUint32(0, width);
      view.setUint32(4, height);
      ihdr.set([8, 2, 0, 0, 0], 8); // bit depth 8, RGB, deflate, no filter method, no interlace

      const parts: Uint8Array<ArrayBuffer>[] = [SIGNATURE, chunk('IHDR', ihdr)];
      for (const [k, v] of Object.entries(text)) parts.push(chunk('iTXt', itxt(k, v)));
      for (const data of compressed) parts.push(chunk('IDAT', data));
      parts.push(chunk('IEND', new Uint8Array(0)));
      return new Blob(parts, { type: 'image/png' });
    },
  };
}
