/**
 * Tiny image files for photo tests, each carrying the kind of metadata a phone
 * adds: an orientation, GPS coordinates and the camera's name. The picture data
 * is a stand-in; nothing here decodes pixels.
 */
const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
export const GPS_MARK = "GPSLatitude 13.7563 N, GPSLongitude 100.5018 E";
export const CAMERA_MARK = "Pixel 9 Pro camera";

function cat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arr = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arr.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of arr) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A little-endian TIFF block: IFD0 with orientation and a GPS pointer, then the GPS text. */
export function phoneTiff(orientation: number): Uint8Array {
  const gps = enc(GPS_MARK + "\0" + CAMERA_MARK + "\0");
  // header(8) + count(2) + 2 entries(24) + next(4) = 38, GPS data after
  return cat(
    [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00],
    [0x02, 0x00],
    [0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00],
    [0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 38, 0x00, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x00],
    gps,
  );
}

const SCAN = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0];

/** JPEG: SOI, APP0 (JFIF), APP1 Exif, APP1 XMP, APP13, COM, SOS with data, EOI. */
export function phoneJpeg(orientation = 6): Uint8Array {
  const seg = (m: number, payload: Uint8Array) => cat([0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 0xff], payload);
  return cat(
    [0xff, 0xd8],
    seg(0xe0, enc("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    seg(0xe1, cat(enc("Exif\0\0"), phoneTiff(orientation))),
    seg(0xe1, enc(`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta exif:GPSLatitude="13.7563"/>`)),
    seg(0xed, enc("Photoshop 3.0\0IPTC city Bangkok")),
    seg(0xfe, enc(`comment ${CAMERA_MARK}`)),
    seg(0xdb, Uint8Array.from({ length: 65 }, (_, i) => i)),
    seg(0xda, Uint8Array.from([1, 1, 0, 0, 63, 0])),
    SCAN,
    [0xff, 0xd9],
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  return cat([len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff], enc(type), data, [0, 0, 0, 0]);
}

/** PNG: signature, IHDR, eXIf, tEXt, iTXt, zTXt, IDAT, IEND. */
export function phonePng(orientation = 3): Uint8Array {
  return cat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    pngChunk("eXIf", phoneTiff(orientation)),
    pngChunk("tEXt", enc(`Comment\0${GPS_MARK}`)),
    pngChunk("iTXt", enc(`XML:com.adobe.xmp\0\0\0\0\0${CAMERA_MARK}`)),
    pngChunk("zTXt", enc("Raw profile\0\0xyz")),
    pngChunk("IDAT", Uint8Array.from(SCAN)),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

/** A plain PNG with nothing to strip. */
export function plainPng(): Uint8Array {
  return cat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    pngChunk("IDAT", Uint8Array.from(SCAN)),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const n = data.length;
  return cat(enc(fourcc), [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24], data, n & 1 ? [0] : []);
}

/** WebP (extended): VP8X with Exif and XMP flags, VP8, EXIF, XMP. */
export function phoneWebp(orientation = 8): Uint8Array {
  const body = cat(
    riffChunk("VP8X", Uint8Array.from([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    riffChunk("VP8 ", Uint8Array.from(SCAN)),
    riffChunk("EXIF", cat(enc("Exif\0\0"), phoneTiff(orientation))),
    riffChunk("XMP ", enc(`<x:xmpmeta exif:GPSLatitude="13.7563"/> ${CAMERA_MARK}`)),
  );
  const n = body.length + 4;
  return cat(enc("RIFF"), [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24], enc("WEBP"), body);
}

export const text = (b: Uint8Array | ArrayBuffer) => String.fromCharCode(...new Uint8Array(b));
