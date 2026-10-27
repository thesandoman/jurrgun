/**
 * Every photo a member or organiser uploads passes through here before it is
 * stored (owner decision, 2026-10-26, "Strip all + clean old"):
 *
 * - The type comes from the file's own bytes (JPEG, PNG or WebP). A file
 *   whose bytes don't match the type the browser claimed is refused.
 * - Metadata goes: in JPEG the APP1 (Exif, XMP), APP13 (IPTC) and COM
 *   segments; in PNG the eXIf, tEXt, iTXt and zTXt chunks; in WebP the EXIF
 *   and XMP chunks. GPS, camera, times and names go with them.
 * - Only the orientation is kept, rewritten as a fresh one-tag Exif block, so
 *   phone photos still show the right way up.
 *
 * Pure TypeScript on bytes: no image decoding and no re-encoding, so the
 * picture itself is untouched. Runs the same in the Worker and in tests.
 */

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";
export const PHOTO_TYPES: readonly PhotoType[] = ["image/jpeg", "image/png", "image/webp"];

export type CleanResult = { ok: true; bytes: ArrayBuffer; type: PhotoType; stripped: boolean } | { ok: false; reason: "type" | "corrupt" };

/** The type the bytes really are, or null. */
export function sniffImage(b: Uint8Array): PhotoType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

/**
 * Checks the bytes against the claimed type and strips metadata. `claimed`
 * may be null for files already stored (then the bytes decide).
 */
export function cleanPhoto(input: ArrayBuffer | Uint8Array, claimed: string | null): CleanResult {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const type = sniffImage(b);
  if (!type) return { ok: false, reason: "type" };
  if (claimed !== null && claimed !== type) return { ok: false, reason: "type" };
  try {
    const out = type === "image/jpeg" ? stripJpeg(b) : type === "image/png" ? stripPng(b) : stripWebp(b);
    return { ok: true, bytes: out.slice().buffer as ArrayBuffer, type, stripped: out.length !== b.length || !sameBytes(out, b) };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

// ------------------------------------------------------------------ JPEG --

function stripJpeg(b: Uint8Array): Uint8Array {
  const keep: Uint8Array[] = [b.subarray(0, 2)];
  let orientation: number | null = null;
  let afterApp0 = 1; // where the fresh Exif block goes: after a leading APP0 (JFIF), else right after SOI
  let i = 2;
  for (;;) {
    if (i >= b.length) throw new Error("jpeg: no image data");
    if (b[i] !== 0xff) throw new Error("jpeg: bad marker");
    while (b[i] === 0xff && i < b.length) i++;
    const m = b[i];
    const start = i - 1;
    i++;
    if (m === 0xd9) {
      keep.push(b.subarray(start, i));
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      keep.push(b.subarray(start, i));
      continue;
    }
    if (i + 2 > b.length) throw new Error("jpeg: short segment");
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) throw new Error("jpeg: bad length");
    const end = i + len;
    if (m === 0xda) {
      // Start of scan: the compressed picture follows; copy everything from here.
      keep.push(b.subarray(start));
      break;
    }
    const payload = b.subarray(i + 2, end);
    if (m === 0xe1) {
      if (orientation === null && ascii(payload, 0, 6) === "Exif\0\0") orientation = tiffOrientation(payload.subarray(6));
    } else if (m !== 0xed && m !== 0xfe) {
      keep.push(b.subarray(start, end));
      if (m === 0xe0 && keep.length === 2) afterApp0 = 2;
    }
    i = end;
  }
  if (orientation !== null && orientation !== 1) {
    const tiff = minimalTiff(orientation);
    const seg = new Uint8Array(4 + 6 + tiff.length);
    seg[0] = 0xff;
    seg[1] = 0xe1;
    const len = 2 + 6 + tiff.length;
    seg[2] = len >> 8;
    seg[3] = len & 0xff;
    seg.set(bytesOf("Exif\0\0"), 4);
    seg.set(tiff, 10);
    keep.splice(afterApp0, 0, seg);
  }
  return concat(keep);
}

// ------------------------------------------------------------------- PNG --

const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

function stripPng(b: Uint8Array): Uint8Array {
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  let orientation: number | null = null;
  let i = 8;
  let sawEnd = false;
  let firstIdat = -1;
  while (i < b.length) {
    if (i + 12 > b.length) throw new Error("png: short chunk");
    const len = be32(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (len > b.length || end > b.length) throw new Error("png: bad length");
    if (type === "eXIf") {
      if (orientation === null) orientation = tiffOrientation(b.subarray(i + 8, i + 8 + len));
    } else if (!PNG_DROP.has(type)) {
      if (type === "IDAT" && firstIdat < 0) firstIdat = keep.length;
      keep.push(b.subarray(i, end));
    }
    i = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || firstIdat < 0) throw new Error("png: incomplete");
  if (orientation !== null && orientation !== 1) keep.splice(firstIdat, 0, pngChunk("eXIf", minimalTiff(orientation)));
  return concat(keep);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(bytesOf(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// ------------------------------------------------------------------ WebP --

function stripWebp(b: Uint8Array): Uint8Array {
  const riffEnd = Math.min(b.length, 8 + le32(b, 4));
  const chunks: Uint8Array[] = [];
  let orientation: number | null = null;
  let vp8x = -1;
  let i = 12;
  while (i + 8 <= riffEnd) {
    const fourcc = ascii(b, i, 4);
    const size = le32(b, i + 4);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > b.length) throw new Error("webp: bad chunk");
    if (fourcc === "EXIF") {
      let data = b.subarray(i + 8, i + 8 + size);
      if (ascii(data, 0, 6) === "Exif\0\0") data = data.subarray(6);
      if (orientation === null) orientation = tiffOrientation(data);
    } else if (fourcc !== "XMP ") {
      if (fourcc === "VP8X") vp8x = chunks.length;
      chunks.push(b.slice(i, Math.min(end, b.length)));
    }
    i = end;
  }
  if (chunks.length === 0) throw new Error("webp: no chunks");
  let keepOrientation = false;
  if (vp8x >= 0) {
    const c = chunks[vp8x];
    // VP8X flags: 0x08 Exif, 0x04 XMP. Both cleared; Exif set again if orientation is kept.
    c[8] &= ~0x0c;
    if (orientation !== null && orientation !== 1) {
      c[8] |= 0x08;
      keepOrientation = true;
    }
  }
  if (keepOrientation) {
    const tiff = minimalTiff(orientation!);
    const ch = new Uint8Array(8 + tiff.length + (tiff.length & 1));
    ch.set(bytesOf("EXIF"), 0);
    new DataView(ch.buffer).setUint32(4, tiff.length, true);
    ch.set(tiff, 8);
    chunks.push(ch);
  }
  const body = concat(chunks);
  const out = new Uint8Array(12 + body.length);
  out.set(bytesOf("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(bytesOf("WEBP"), 8);
  out.set(body, 12);
  return out;
}

// ------------------------------------------------------------------ TIFF --

/** The Orientation tag (0x0112) from IFD0 of a TIFF block, or null. */
export function tiffOrientation(t: Uint8Array): number | null {
  if (t.length < 8) return null;
  const order = ascii(t, 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const u16 = (o: number) => (o + 2 <= t.length ? (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]) : -1);
  const u32 = (o: number) => (o + 4 <= t.length ? (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0 : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0) : -1);
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > t.length) return null;
  const n = u16(ifd);
  for (let k = 0; k < n && k < 512; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > t.length) return null;
    if (u16(e) === 0x0112 && u16(e + 2) === 3) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** A little-endian TIFF block holding nothing but the orientation. */
export function minimalTiff(orientation: number): Uint8Array {
  return new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation & 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

// --------------------------------------------------------------- helpers --

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = "";
  for (let k = 0; k < n && at + k < b.length; k++) s += String.fromCharCode(b[at + k]);
  return s;
}
const bytesOf = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(b: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let k = 0; k < b.length; k++) c = CRC_TABLE[(c ^ b[k]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
