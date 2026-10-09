/**
 * QR codes as inline SVG for personal event passes (PRD §9.1).
 */
import qrcode from "qrcode-generator";

export function qrSvg(data: string): string {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/** What the host types when a scan fails: first 6 characters, upper-case. */
export function shortCode(passToken: string): string {
  return passToken.slice(0, 6).toUpperCase();
}
