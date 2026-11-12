export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast), es = ema(values, slow);
  const line: (number | null)[] = values.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i]! - es[i]! : null));
  const start = line.findIndex((v) => v !== null);
  const sig: (number | null)[] = new Array(values.length).fill(null);
  if (start >= 0) {
    const s = ema(line.slice(start) as number[], signal);
    s.forEach((v, i) => (sig[start + i] = v));
  }
  const hist = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i]! : null));
  return { line, signal: sig, hist };
}

export interface HLC {
  high: number | null;
  low: number | null;
  close: number;
}

/** Wilder ATR. Yüksek/düşük yoksa kapanış farkı kullanılır. */
export function atr(bars: HLC[], period = 14): number | null {
  if (bars.length <= period) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const pc = bars[i - 1].close;
    const h = bars[i].high ?? bars[i].close, l = bars[i].low ?? bars[i].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return a;
}

export interface Level {
  price: number;
  touches: number;
}

/**
 * Destek/direnç: son `lookback` günde dönüş noktaları (±`wing` gün içindeki en yüksek/en düşük)
 * bulunur, birbirine %`tolPct` yakın olanlar kümelenir. Güncel fiyatın altındakiler destek,
 * üstündekiler dirençtir; yakından uzağa sıralanır.
 */
export function supportResistance(bars: HLC[], price: number, lookback = 180, wing = 5, tolPct = 1.5) {
  const b = bars.slice(-lookback);
  const pivots: number[] = [];
  for (let i = wing; i < b.length - wing; i++) {
    const hi = b[i].high ?? b[i].close, lo = b[i].low ?? b[i].close;
    let isHi = true, isLo = true;
    for (let k = i - wing; k <= i + wing; k++) {
      if (k === i) continue;
      if ((b[k].high ?? b[k].close) > hi) isHi = false;
      if ((b[k].low ?? b[k].close) < lo) isLo = false;
    }
    if (isHi) pivots.push(hi);
    if (isLo) pivots.push(lo);
  }
  pivots.sort((x, y) => x - y);
  const clusters: Level[] = [];
  for (const p of pivots) {
    const last = clusters[clusters.length - 1];
    if (last && (p - last.price) / last.price <= tolPct / 100) {
      last.price = (last.price * last.touches + p) / (last.touches + 1);
      last.touches++;
    } else clusters.push({ price: p, touches: 1 });
  }
  const gap = price * 0.003;
  return {
    supports: clusters.filter((c) => c.price < price - gap).sort((a, b) => b.price - a.price).slice(0, 3),
    resistances: clusters.filter((c) => c.price > price + gap).sort((a, b) => a.price - b.price).slice(0, 3),
  };
}

export const last = <T,>(a: (T | null)[]): T | null => (a.length ? a[a.length - 1] : null);
