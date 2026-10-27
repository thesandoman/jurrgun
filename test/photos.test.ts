/** Owner decision 2026-10-26: uploads lose their metadata (GPS) and must really be the type they claim. */
import { describe, expect, it } from "vitest";
import { cleanPhoto, sniffImage, tiffOrientation } from "../src/domain/photos";
import { CAMERA_MARK, GPS_MARK, phoneJpeg, phonePng, phoneWebp, plainPng, text } from "./photo-fixtures";

function ok(r: ReturnType<typeof cleanPhoto>) {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return { ...r, b: new Uint8Array(r.bytes) };
}

describe("photo metadata", () => {
  it("JPEG: GPS, XMP, IPTC and comments go; the orientation and the picture stay", () => {
    const src = phoneJpeg(6);
    expect(text(src)).toContain(GPS_MARK);
    const r = ok(cleanPhoto(src, "image/jpeg"));
    const s = text(r.b);
    expect(r.type).toBe("image/jpeg");
    expect(r.stripped).toBe(true);
    for (const leak of [GPS_MARK, CAMERA_MARK, "GPSLatitude", "IPTC", "xmpmeta"]) expect(s).not.toContain(leak);
    expect([r.b[0], r.b[1]]).toEqual([0xff, 0xd8]);
    expect([r.b[r.b.length - 2], r.b[r.b.length - 1]]).toEqual([0xff, 0xd9]);
    // JFIF stays first, then a fresh one-tag Exif block with the orientation.
    expect(s.indexOf("JFIF")).toBeLessThan(s.indexOf("Exif"));
    const exifAt = s.indexOf("Exif\0\0");
    expect(tiffOrientation(r.b.subarray(exifAt + 6))).toBe(6);
    // The scan data is copied byte for byte.
    expect(s.endsWith(text(Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0xff, 0xd9])))).toBe(true);
    // Idempotent: cleaning again changes nothing.
    expect(ok(cleanPhoto(r.b, "image/jpeg")).stripped).toBe(false);
  });

  it("JPEG with the normal orientation keeps no Exif at all", () => {
    const r = ok(cleanPhoto(phoneJpeg(1), "image/jpeg"));
    expect(text(r.b)).not.toContain("Exif");
  });

  it("PNG: eXIf and text chunks go; a fresh eXIf with only the orientation sits before IDAT, with a valid CRC", () => {
    const r = ok(cleanPhoto(phonePng(3), "image/png"));
    const s = text(r.b);
    for (const leak of [GPS_MARK, CAMERA_MARK, "tEXt", "iTXt", "zTXt", "Raw profile"]) expect(s).not.toContain(leak);
    const at = s.indexOf("eXIf");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(s.indexOf("IDAT"));
    const len = new DataView(r.b.buffer, r.b.byteOffset).getUint32(at - 4);
    expect(tiffOrientation(r.b.subarray(at + 4, at + 4 + len))).toBe(3);
    // CRC over type + data.
    let c = 0xffffffff;
    for (const byte of r.b.subarray(at, at + 4 + len)) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    expect(new DataView(r.b.buffer, r.b.byteOffset).getUint32(at + 4 + len)).toBe((c ^ 0xffffffff) >>> 0);
    expect(s.endsWith("IEND\0\0\0\0")).toBe(true);
  });

  it("a PNG with nothing to strip is left exactly as it is", () => {
    const src = plainPng();
    const r = ok(cleanPhoto(src, "image/png"));
    expect(r.stripped).toBe(false);
    expect(Array.from(r.b)).toEqual(Array.from(src));
  });

  it("WebP: EXIF and XMP chunks go, the flags and RIFF size follow, the orientation stays", () => {
    const r = ok(cleanPhoto(phoneWebp(8), "image/webp"));
    const s = text(r.b);
    for (const leak of [GPS_MARK, CAMERA_MARK, "XMP ", "xmpmeta"]) expect(s).not.toContain(leak);
    const dv = new DataView(r.b.buffer, r.b.byteOffset);
    expect(dv.getUint32(4, true)).toBe(r.b.length - 8);
    expect(r.b[20] & 0x04).toBe(0); // no XMP flag
    expect(r.b[20] & 0x08).toBe(0x08); // Exif flag, for the orientation
    const at = s.indexOf("EXIF");
    const len = dv.getUint32(at + 4, true);
    expect(tiffOrientation(r.b.subarray(at + 8, at + 8 + len))).toBe(8);
    expect(s).toContain("VP8 ");
  });

  it("refuses a file whose bytes aren't the type it claims, or aren't an image at all", () => {
    expect(cleanPhoto(phonePng(), "image/jpeg")).toEqual({ ok: false, reason: "type" });
    expect(cleanPhoto(phoneJpeg(), "image/webp")).toEqual({ ok: false, reason: "type" });
    expect(cleanPhoto(new TextEncoder().encode("<script>alert(1)</script>"), "image/png")).toEqual({ ok: false, reason: "type" });
    expect(cleanPhoto(new TextEncoder().encode("GIF89a......"), "image/gif")).toEqual({ ok: false, reason: "type" });
    expect(cleanPhoto(new Uint8Array(100), "image/png")).toEqual({ ok: false, reason: "type" });
    expect(sniffImage(phoneWebp())).toBe("image/webp");
  });

  it("a truncated file is refused as corrupt, never stored half-cleaned", () => {
    const cut = phoneJpeg().subarray(0, 30);
    expect(cleanPhoto(cut, "image/jpeg")).toEqual({ ok: false, reason: "corrupt" });
    const png = phonePng().subarray(0, 40);
    expect(cleanPhoto(png, "image/png")).toEqual({ ok: false, reason: "corrupt" });
  });
});
