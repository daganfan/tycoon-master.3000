/**
 * Compact binary body snapshots. Each record is 20 bytes:
 *   u32 netId · u8 type · u8 reserved · i16×3 position (millimetres) · i16×4 quaternion (×32767)
 * and a whole packet is base64 so it travels through any transport as a string.
 */

export const RECORD_BYTES = 20;
const POS_SCALE = 1000;
const Q_SCALE = 32767;
const POS_MAX = 32.767;

/** Body types on the wire. Coins (0-2 = coin, bills, bag) render as instances on guests. */
export const BODY_PROP = 0;
export const BODY_COIN = 1; // +kind (1, 2, 3)

export interface BodyRec {
  id: number;
  type: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

const q16 = (v: number, scale: number, max: number) => Math.round(Math.max(-max, Math.min(max, v)) * scale);

export function packBodies(recs: readonly BodyRec[]): Uint8Array {
  const buf = new Uint8Array(recs.length * RECORD_BYTES);
  const dv = new DataView(buf.buffer);
  recs.forEach((r, i) => {
    const o = i * RECORD_BYTES;
    dv.setUint32(o, r.id >>> 0, true);
    dv.setUint8(o + 4, r.type & 0xff);
    dv.setInt16(o + 6, q16(r.x, POS_SCALE, POS_MAX), true);
    dv.setInt16(o + 8, q16(r.y, POS_SCALE, POS_MAX), true);
    dv.setInt16(o + 10, q16(r.z, POS_SCALE, POS_MAX), true);
    // Canonical hemisphere (w >= 0) keeps the sign stable between packets.
    const s = r.qw < 0 ? -1 : 1;
    dv.setInt16(o + 12, q16(r.qx * s, Q_SCALE, 1), true);
    dv.setInt16(o + 14, q16(r.qy * s, Q_SCALE, 1), true);
    dv.setInt16(o + 16, q16(r.qz * s, Q_SCALE, 1), true);
    dv.setInt16(o + 18, q16(r.qw * s, Q_SCALE, 1), true);
  });
  return buf;
}

/** Decode a packet; malformed input yields an empty list (never throws). */
export function unpackBodies(buf: Uint8Array, maxRecords = 4096): BodyRec[] {
  if (buf.length % RECORD_BYTES !== 0) return [];
  const n = Math.min(maxRecords, buf.length / RECORD_BYTES);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: BodyRec[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * RECORD_BYTES;
    let qx = dv.getInt16(o + 12, true) / Q_SCALE;
    let qy = dv.getInt16(o + 14, true) / Q_SCALE;
    let qz = dv.getInt16(o + 16, true) / Q_SCALE;
    let qw = dv.getInt16(o + 18, true) / Q_SCALE;
    const l = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= l;
    qy /= l;
    qz /= l;
    qw /= l;
    if (!Number.isFinite(qx + qy + qz + qw)) [qx, qy, qz, qw] = [0, 0, 0, 1];
    out.push({
      id: dv.getUint32(o, true),
      type: dv.getUint8(o + 4),
      x: dv.getInt16(o + 6, true) / POS_SCALE,
      y: dv.getInt16(o + 8, true) / POS_SCALE,
      z: dv.getInt16(o + 10, true) / POS_SCALE,
      qx,
      qy,
      qz,
      qw,
    });
  }
  return out;
}

export function toBase64(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

export const encodeBodies = (recs: readonly BodyRec[]): string => toBase64(packBodies(recs));
export const decodeBodies = (s: string): BodyRec[] => unpackBodies(fromBase64(s));
