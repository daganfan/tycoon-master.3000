import Decimal from 'break_eternity.js';

/** Big number used for Cash and other values that can grow without bound. */
export type Num = Decimal;
export type NumLike = Num | number | string;

export const num = (v: NumLike): Num => new Decimal(v);
export const ZERO: Num = new Decimal(0);

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Human-friendly formatting: 1234 -> "1.23K", huge values -> scientific. */
export function formatNum(v: NumLike, decimals = 2): string {
  const d = num(v);
  if (d.lt(0)) return '-' + formatNum(d.neg(), decimals);
  if (d.lt(1000)) {
    const n = d.toNumber();
    return Number.isInteger(n) ? String(n) : n.toFixed(Math.min(decimals, 2));
  }
  const exp = Math.floor(d.log10().toNumber());
  const tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    const scaled = d.div(Decimal.pow(10, tier * 3)).toNumber();
    return scaled.toFixed(decimals) + SUFFIXES[tier];
  }
  const mantissa = d.div(Decimal.pow(10, exp)).toNumber();
  return `${mantissa.toFixed(decimals)}e${exp}`;
}

export const formatCash = (v: NumLike): string => '$' + formatNum(v);
