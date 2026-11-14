// 그림 데이터(RGB·RGBA·1비트 흑백) → PNG 파일 → data URL. 외부 패키지 없이 zlib 만 쓴다.
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** kind: 1 = 1비트 흑백, 2 = RGB 24비트, 3 = RGBA 32비트 (pdf.js ImageKind 와 같은 값) */
export function encodePng(width: number, height: number, kind: 1 | 2 | 3, data: Uint8Array): Buffer {
  const channels = kind === 3 ? 4 : kind === 2 ? 3 : 1;
  const bitDepth = kind === 1 ? 1 : 8;
  const rowBytes = kind === 1 ? Math.ceil(width / 8) : width * channels;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // 필터 없음
    Buffer.from(data.buffer, data.byteOffset + y * rowBytes, rowBytes).copy(raw, y * (rowBytes + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = kind === 3 ? 6 : kind === 2 ? 2 : 0; // 색 종류: RGBA / RGB / 흑백
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}

export const pngDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;
/** data URL 이 너무 크면(화면·저장 부담) 버린다 */
export const MAX_IMAGE_BYTES = 180_000;
