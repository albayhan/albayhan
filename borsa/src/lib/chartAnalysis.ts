import { macd, rsi, sma, atr, supportResistance } from "./indicators";
import type { BarRow } from "./data";

/**
 * Grafik analizi: trend kanalı, formasyonlar, tarihsel benzer durum olasılıkları ve oynaklık konisi.
 * Hepsi yalnızca geçmiş fiyatlardan hesaplanır; tahmin değil, olasılık ve senaryo üretir.
 */

export type Dir = "yukari" | "yatay" | "asagi";
export interface Pattern { key: string; title: string; detail: string; bias: 1 | 0 | -1; date?: string; strength: 1 | 2 | 3 }
export interface Channel { days: number; slopePctMonth: number; r2: number; upper: number; mid: number; lower: number; positionPct: number; line: { time: string; mid: number; upper: number; lower: number }[] }
export interface Odds { horizon: number; n: number; episodes: number; upPct: number | null; medianPct: number | null; p25: number | null; p75: number | null; baseUpPct: number | null; baseMedianPct: number | null; state: string }
export interface Cone { horizon: number; low68: number; high68: number; low95: number; high95: number; sigmaDailyPct: number }
export interface Outlook { horizon: string; dir: Dir; confidence: "zayıf" | "orta" | "güçlü"; score: number; why: string[] }
export interface Scenario { name: string; trigger: string; target: number | null; note: string; bias: 1 | -1 }
export interface ChartAnalysis {
  ok: boolean;
  reason?: string;
  price: number;
  channel: Channel | null;
  patterns: Pattern[];
  odds: Odds[];
  cones: Cone[];
  projection: { time: string; mid: number; high68: number; low68: number }[];
  shortOutlook: Outlook | null;
  midOutlook: Outlook | null;
  scenarios: Scenario[];
  high52: number | null;
  low52: number | null;
}

const f = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pf = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

export function nextBusinessDays(from: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(from + "T12:00:00Z");
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Log fiyat üzerinde doğrusal regresyon kanalı (±2 standart sapma). */
export function regressionChannel(bars: BarRow[], days = 60, extend = 0): Channel | null {
  const b = bars.slice(-days);
  if (b.length < 20) return null;
  const y = b.map((x) => Math.log(x.close));
  const n = y.length, xs = y.map((_, i) => i);
  const mx = (n - 1) / 2, my = y.reduce((a, c) => a + c, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (y[i] - my); sxx += (xs[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const slope = sxy / sxx, icpt = my - slope * mx;
  const res = y.map((v, i) => v - (icpt + slope * i));
  const sd = Math.sqrt(res.reduce((a, c) => a + c * c, 0) / Math.max(1, n - 2));
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  const at = (i: number) => ({ mid: Math.exp(icpt + slope * i), upper: Math.exp(icpt + slope * i + 2 * sd), lower: Math.exp(icpt + slope * i - 2 * sd) });
  const future = extend ? nextBusinessDays(b[n - 1].date, extend) : [];
  const line = [...b.map((x, i) => ({ time: x.date, ...at(i) })), ...future.map((t, k) => ({ time: t, ...at(n + k) }))];
  const last = at(n - 1);
  const price = b[n - 1].close;
  return {
    days: n, slopePctMonth: (Math.exp(slope * 21) - 1) * 100, r2,
    upper: last.upper, mid: last.mid, lower: last.lower,
    positionPct: Math.max(0, Math.min(100, ((Math.log(price) - Math.log(last.lower)) / (Math.log(last.upper) - Math.log(last.lower))) * 100)),
    line,
  };
}

/** Bugünkü teknik durumu kategorilere ayırır; geçmişteki aynı durumların sonraki getirilerini sayar. */
function stateKey(close: number, s50: number | null, s200: number | null, r: number | null, h: number | null): string | null {
  if (s50 === null || r === null || h === null) return null;
  const rb = r < 30 ? 0 : r < 50 ? 1 : r < 70 ? 2 : 3;
  return `${close > s50 ? 1 : 0}${s200 === null ? "x" : s50 > s200 ? 1 : 0}${rb}${h > 0 ? 1 : 0}`;
}
export function describeState(key: string): string {
  const [a, b, rb, m] = key.split("");
  const rsiTxt = ["RSI 30 altı", "RSI 30–50", "RSI 50–70", "RSI 70 üstü"][Number(rb)];
  return [
    a === "1" ? "fiyat 50 günlüğün üstünde" : "fiyat 50 günlüğün altında",
    b === "x" ? null : b === "1" ? "50g > 200g" : "50g < 200g",
    rsiTxt,
    m === "1" ? "MACD pozitif" : "MACD negatif",
  ].filter(Boolean).join(", ");
}

export function analogOdds(bars: BarRow[], horizons = [10, 40]): Odds[] {
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const s50 = sma(closes, 50), s200 = sma(closes, 200), r = rsi(closes, 14), m = macd(closes).hist;
  const keys = closes.map((c, i) => stateKey(c, s50[i], s200[i], r[i], m[i]));
  const now = keys[n - 1];
  return horizons.map((h) => {
    const all: number[] = [], same: number[] = [];
    let episodes = 0, lastSame = -999;
    for (let i = 60; i + h < n; i++) {
      if (!keys[i]) continue;
      const ret = (closes[i + h] / closes[i] - 1) * 100;
      all.push(ret);
      if (keys[i] === now) { same.push(ret); if (i - lastSame > 10) episodes++; lastSame = i; }
    }
    const s = [...same].sort((a, b) => a - b), a = [...all].sort((x, y) => x - y);
    return {
      horizon: h, n: same.length, episodes, state: now ? describeState(now) : "—",
      upPct: same.length ? (same.filter((x) => x > 0).length / same.length) * 100 : null,
      medianPct: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75),
      baseUpPct: all.length ? (all.filter((x) => x > 0).length / all.length) * 100 : null,
      baseMedianPct: quantile(a, 0.5),
    };
  });
}

/** Son 60 günlük oynaklıkla olası fiyat aralığı (%68 ve %95). */
export function volCone(bars: BarRow[], horizons = [5, 20]): { cones: Cone[]; sigma: number } {
  const c = bars.slice(-61).map((b) => b.close);
  const rets = c.slice(1).map((v, i) => Math.log(v / c[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sigma = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const p = c[c.length - 1];
  return {
    sigma,
    cones: horizons.map((h) => ({
      horizon: h, sigmaDailyPct: sigma * 100,
      low68: p * Math.exp(-sigma * Math.sqrt(h)), high68: p * Math.exp(sigma * Math.sqrt(h)),
      low95: p * Math.exp(-1.96 * sigma * Math.sqrt(h)), high95: p * Math.exp(1.96 * sigma * Math.sqrt(h)),
    })),
  };
}

function pivots(bars: BarRow[], wing = 4) {
  const hi: { i: number; v: number }[] = [], lo: { i: number; v: number }[] = [];
  for (let i = wing; i < bars.length - wing; i++) {
    const h = bars[i].high ?? bars[i].close, l = bars[i].low ?? bars[i].close;
    let isH = true, isL = true;
    for (let k = i - wing; k <= i + wing; k++) {
      if (k === i) continue;
      if ((bars[k].high ?? bars[k].close) > h) isH = false;
      if ((bars[k].low ?? bars[k].close) < l) isL = false;
    }
    if (isH) hi.push({ i, v: h });
    if (isL) lo.push({ i, v: l });
  }
  return { hi, lo };
}

export function detectPatterns(bars: BarRow[]): Pattern[] {
  const out: Pattern[] = [];
  const closes = bars.map((b) => b.close);
  const n = closes.length;
  if (n < 60) return out;
  const price = closes[n - 1];
  const s50 = sma(closes, 50), s200 = sma(closes, 200), s20 = sma(closes, 20);
  const r = rsi(closes, 14), m = macd(closes);
  const date = (i: number) => bars[i].date;

  // Altın / ölüm kesişimi (son 30 gün)
  for (let i = n - 1; i > n - 31 && i > 0; i--) {
    if (s50[i] === null || s200[i] === null || s50[i - 1] === null || s200[i - 1] === null) break;
    if (s50[i - 1]! <= s200[i - 1]! && s50[i]! > s200[i]!) { out.push({ key: "golden", title: "Altın kesişim", detail: "50 günlük ortalama 200 günlüğü yukarı kesti; orta vadeli eğilimin yukarı döndüğüne işaret eder.", bias: 1, date: date(i), strength: 3 }); break; }
    if (s50[i - 1]! >= s200[i - 1]! && s50[i]! < s200[i]!) { out.push({ key: "death", title: "Ölüm kesişimi", detail: "50 günlük ortalama 200 günlüğü aşağı kesti; orta vadeli eğilimin aşağı döndüğüne işaret eder.", bias: -1, date: date(i), strength: 3 }); break; }
  }
  // MACD kesişimi (son 7 gün)
  for (let i = n - 1; i > n - 8; i--) {
    const a = m.hist[i], b = m.hist[i - 1];
    if (a === null || b === null) break;
    if (b <= 0 && a > 0) { out.push({ key: "macd-up", title: "MACD al kesişimi", detail: "MACD çizgisi sinyal çizgisini yukarı kesti; kısa vadeli ivme yukarı döndü.", bias: 1, date: date(i), strength: 2 }); break; }
    if (b >= 0 && a < 0) { out.push({ key: "macd-down", title: "MACD sat kesişimi", detail: "MACD çizgisi sinyal çizgisini aşağı kesti; kısa vadeli ivme aşağı döndü.", bias: -1, date: date(i), strength: 2 }); break; }
  }
  // 50 günlük ortalamayı kesme (son 5 gün)
  for (let i = n - 1; i > n - 6; i--) {
    if (s50[i] === null || s50[i - 1] === null) break;
    if (closes[i - 1] <= s50[i - 1]! && closes[i] > s50[i]!) { out.push({ key: "sma50-up", title: "50 günlük ortalamanın üstüne çıktı", detail: `Fiyat ${f(s50[i]!)} seviyesindeki 50 günlük ortalamayı yukarı kırdı.`, bias: 1, date: date(i), strength: 2 }); break; }
    if (closes[i - 1] >= s50[i - 1]! && closes[i] < s50[i]!) { out.push({ key: "sma50-down", title: "50 günlük ortalamanın altına indi", detail: `Fiyat ${f(s50[i]!)} seviyesindeki 50 günlük ortalamanın altına sarktı.`, bias: -1, date: date(i), strength: 2 }); break; }
  }
  // Kırılım: son 5 günde önceki 60 günün zirvesi/dibi aşıldı mı
  const prior = bars.slice(-65, -5);
  if (prior.length >= 40) {
    const top = Math.max(...prior.map((b) => b.high ?? b.close)), bot = Math.min(...prior.map((b) => b.low ?? b.close));
    if (price > top) out.push({ key: "breakout", title: "Yukarı kırılım", detail: `Fiyat son 3 ayın zirvesi olan ${f(top)} seviyesinin üstüne çıktı. Kırılan direnç artık destek görevi görebilir.`, bias: 1, strength: 3 });
    else if (price < bot) out.push({ key: "breakdown", title: "Aşağı kırılım", detail: `Fiyat son 3 ayın dibi olan ${f(bot)} seviyesinin altına indi. Kırılan destek artık direnç görevi görebilir.`, bias: -1, strength: 3 });
  }
  // Yükselen dipler / alçalan tepeler (son 120 gün)
  const pv = pivots(bars.slice(-120));
  const lastH = pv.hi.slice(-3), lastL = pv.lo.slice(-3);
  if (lastH.length >= 2 && lastL.length >= 2) {
    const hh = lastH[lastH.length - 1].v > lastH[lastH.length - 2].v, hl = lastL[lastL.length - 1].v > lastL[lastL.length - 2].v;
    if (hh && hl) out.push({ key: "hhhl", title: "Yükselen tepeler ve dipler", detail: "Son iki tepe ve iki dip bir öncekinin üzerinde; klasik yükseliş trendi yapısı.", bias: 1, strength: 2 });
    else if (!hh && !hl) out.push({ key: "lhll", title: "Alçalan tepeler ve dipler", detail: "Son iki tepe ve iki dip bir öncekinin altında; klasik düşüş trendi yapısı.", bias: -1, strength: 2 });
    else out.push({ key: "range", title: "Kararsız yapı", detail: hh ? "Tepeler yükseliyor ama dipler alçalıyor; genişleyen, oynak bir yapı." : "Tepeler alçalıyor, dipler yükseliyor; sıkışan (üçgen) bir yapı, kırılım yönü izlenmeli.", bias: 0, strength: 1 });
    // RSI uyumsuzluğu: son iki tepe/dip
    const off = n - Math.min(120, n);
    if (lastH.length >= 2) {
      const [a, b] = lastH.slice(-2);
      const ra = r[off + a.i], rb = r[off + b.i];
      if (ra !== null && rb !== null && b.v > a.v && rb < ra - 3 && n - 1 - (off + b.i) < 25) out.push({ key: "bear-div", title: "Negatif uyumsuzluk (RSI)", detail: `Fiyat yeni tepe yaptı (${f(b.v)}) ama RSI daha düşük tepe yaptı (${f(rb)} < ${f(ra)}); yükselişin gücü azalıyor olabilir.`, bias: -1, date: bars[off + b.i].date, strength: 2 });
    }
    if (lastL.length >= 2) {
      const [a, b] = lastL.slice(-2);
      const ra = r[off + a.i], rb = r[off + b.i];
      if (ra !== null && rb !== null && b.v < a.v && rb > ra + 3 && n - 1 - (off + b.i) < 25) out.push({ key: "bull-div", title: "Pozitif uyumsuzluk (RSI)", detail: `Fiyat yeni dip yaptı (${f(b.v)}) ama RSI daha yüksek dip yaptı (${f(rb)} > ${f(ra)}); satış baskısı zayıflıyor olabilir.`, bias: 1, date: bars[off + b.i].date, strength: 2 });
    }
  }
  // Bollinger sıkışması: bant genişliği son 6 ayın en dar %10'unda
  const bw: number[] = [];
  for (let i = Math.max(20, n - 126); i < n; i++) {
    const w = closes.slice(i - 19, i + 1), mu = w.reduce((a, c) => a + c, 0) / 20;
    const sd = Math.sqrt(w.reduce((a, c) => a + (c - mu) ** 2, 0) / 20);
    bw.push((4 * sd) / mu);
  }
  if (bw.length > 60) {
    const sorted = [...bw].sort((a, b) => a - b);
    if (bw[bw.length - 1] <= sorted[Math.floor(sorted.length * 0.1)]) out.push({ key: "squeeze", title: "Bollinger sıkışması", detail: "Fiyat bantları son 6 ayın en dar seviyesinde; sıkışmalar genelde sert bir hareketle çözülür, yönü kırılım belirler.", bias: 0, strength: 2 });
  }
  // RSI aşırı bölgeler
  const rl = r[n - 1];
  if (rl !== null && rl > 75) out.push({ key: "overbought", title: "Aşırı alım", detail: `RSI ${f(rl)}: fiyat kısa sürede çok yükseldi; soluklanma ya da geri çekilme riski yüksek.`, bias: -1, strength: 1 });
  if (rl !== null && rl < 28) out.push({ key: "oversold", title: "Aşırı satım", detail: `RSI ${f(rl)}: fiyat kısa sürede çok düştü; tepki yükselişi gelebilir ama eğilim henüz dönmedi.`, bias: 1, strength: 1 });
  // 52 hafta zirve/dip yakınlığı
  const y = bars.slice(-252);
  const h52 = Math.max(...y.map((b) => b.high ?? b.close)), l52 = Math.min(...y.map((b) => b.low ?? b.close));
  if (price >= h52 * 0.97) out.push({ key: "near-high", title: "52 haftalık zirveye yakın", detail: `Fiyat 1 yıllık zirve ${f(h52)} seviyesinin %3 yakınında; güçlü hisseler zirve yakınında kalma eğilimindedir, ama zirve aynı zamanda direnç.`, bias: 1, strength: 1 });
  if (price <= l52 * 1.03) out.push({ key: "near-low", title: "52 haftalık dibe yakın", detail: `Fiyat 1 yıllık dip ${f(l52)} seviyesinin %3 yakınında; düşen bıçağı tutmamak için dönüş işareti beklenmeli.`, bias: -1, strength: 1 });
  // 20 günlük ortalama eğimi
  if (s20[n - 1] !== null && s20[n - 6] !== null) {
    const sl = (s20[n - 1]! / s20[n - 6]! - 1) * 100;
    if (Math.abs(sl) > 1.5) out.push({ key: sl > 0 ? "s20-up" : "s20-down", title: sl > 0 ? "Kısa vadeli ortalama yükseliyor" : "Kısa vadeli ortalama düşüyor", detail: `20 günlük ortalama son 5 günde ${pf(sl)} değişti.`, bias: sl > 0 ? 1 : -1, strength: 1 });
  }
  return out;
}

function outlook(label: string, parts: { w: number; v: number; why: string }[]): Outlook {
  const score = parts.reduce((a, p) => a + p.w * p.v, 0);
  const max = parts.reduce((a, p) => a + Math.abs(p.w), 0) || 1;
  const norm = score / max; // -1..1
  const dir: Dir = norm > 0.15 ? "yukari" : norm < -0.15 ? "asagi" : "yatay";
  const a = Math.abs(norm);
  const confidence = a > 0.55 ? "güçlü" : a > 0.3 ? "orta" : "zayıf";
  const why = parts.filter((p) => p.v !== 0).sort((x, y) => Math.abs(y.w * y.v) - Math.abs(x.w * x.v)).slice(0, 4).map((p) => `${p.v * p.w > 0 ? "▲" : "▼"} ${p.why}`);
  return { horizon: label, dir, confidence, score: Math.round(norm * 100), why };
}

export function analyzeChart(bars: BarRow[], opts: { projectDays?: number } = {}): ChartAnalysis {
  const proj = opts.projectDays ?? 20;
  const empty: ChartAnalysis = { ok: false, price: bars.length ? bars[bars.length - 1].close : 0, channel: null, patterns: [], odds: [], cones: [], projection: [], shortOutlook: null, midOutlook: null, scenarios: [], high52: null, low52: null };
  if (bars.length < 120) return { ...empty, reason: "Grafik analizi için en az 6 aylık fiyat gerekir." };
  const closes = bars.map((b) => b.close);
  const n = closes.length, price = closes[n - 1];
  const channel = regressionChannel(bars, 60, proj);
  const longCh = regressionChannel(bars, 180, 0);
  const patterns = detectPatterns(bars);
  const odds = analogOdds(bars, [10, 40]);
  const { cones, sigma } = volCone(bars, [5, 20]);
  const s20 = sma(closes, 20)[n - 1]!, s50 = sma(closes, 50)[n - 1]!, s200 = sma(closes, 200)[n - 1];
  const r = rsi(closes, 14)[n - 1], mh = macd(closes).hist[n - 1];
  const a = atr(bars, 14) ?? price * 0.02;
  const sr = supportResistance(bars, price);
  const y = bars.slice(-252);
  const high52 = Math.max(...y.map((b) => b.high ?? b.close)), low52 = Math.min(...y.map((b) => b.low ?? b.close));

  // Projeksiyon: kanal eğimiyle (yarıya indirilmiş, aşırı iyimserliği önlemek için) orta hat + oynaklık aralığı
  const drift = channel ? Math.log(1 + channel.slopePctMonth / 100) / 21 * 0.5 : 0;
  const future = nextBusinessDays(bars[n - 1].date, proj);
  const projection = [{ time: bars[n - 1].date, mid: price, high68: price, low68: price }, ...future.map((t, k) => {
    const h = k + 1, mid = price * Math.exp(drift * h);
    return { time: t, mid, high68: mid * Math.exp(sigma * Math.sqrt(h)), low68: mid * Math.exp(-sigma * Math.sqrt(h)) };
  })];

  const pScore = (keys: string[]) => patterns.filter((p) => keys.includes(p.key)).reduce((s, p) => s + p.bias * p.strength, 0);
  const o10 = odds[0], o40 = odds[1];
  const oddsV = (o: Odds) => (o.n >= 15 && o.episodes >= 5 && o.upPct !== null && o.baseUpPct !== null ? Math.max(-1, Math.min(1, (o.upPct - o.baseUpPct) / 15)) : 0);
  const shortOutlook = outlook("2 hafta", [
    { w: 3, v: channel ? Math.sign(channel.slopePctMonth) * Math.min(1, Math.abs(channel.slopePctMonth) / 6) * (channel.r2 > 0.3 ? 1 : 0.5) : 0, why: channel ? `60 günlük kanal ${channel.slopePctMonth >= 0 ? "yukarı" : "aşağı"} eğimli (aylık ${pf(channel.slopePctMonth)})` : "" },
    { w: 2, v: price > s20 ? 1 : -1, why: `Fiyat 20 günlük ortalamanın ${price > s20 ? "üstünde" : "altında"}` },
    { w: 2, v: mh === null ? 0 : mh > 0 ? 1 : -1, why: `MACD ${mh !== null && mh > 0 ? "pozitif" : "negatif"} (ivme ${mh !== null && mh > 0 ? "yukarı" : "aşağı"})` },
    { w: 1.5, v: r === null ? 0 : r > 75 ? -1 : r < 28 ? 1 : 0, why: r !== null && r > 75 ? "RSI aşırı alımda; soluklanma riski" : "RSI aşırı satımda; tepki ihtimali" },
    { w: 2, v: Math.max(-1, Math.min(1, pScore(["macd-up", "macd-down", "sma50-up", "sma50-down", "breakout", "breakdown", "bull-div", "bear-div", "s20-up", "s20-down"]) / 3)), why: "Yakın tarihli formasyonlar" },
    { w: 2, v: oddsV(o10), why: o10.upPct !== null ? `Geçmişte benzer durumlarda 2 hafta sonra yükselme oranı %${Math.round(o10.upPct)} (hissenin geneli %${Math.round(o10.baseUpPct ?? 0)}, ${o10.episodes} ayrı dönem)` : "" },
  ]);
  const midOutlook = outlook("3 ay", [
    { w: 3, v: s200 === null ? 0 : price > s200 ? 1 : -1, why: s200 !== null ? `Fiyat 200 günlük ortalamanın ${price > s200 ? "üstünde" : "altında"} (${f(s200)})` : "" },
    { w: 2, v: s200 === null ? 0 : s50 > s200 ? 1 : -1, why: s200 !== null ? `50 günlük ortalama 200 günlüğün ${s50 > s200 ? "üstünde" : "altında"}` : "" },
    { w: 2.5, v: longCh ? Math.sign(longCh.slopePctMonth) * Math.min(1, Math.abs(longCh.slopePctMonth) / 4) : 0, why: longCh ? `9 aylık eğilim ${longCh.slopePctMonth >= 0 ? "yukarı" : "aşağı"} (aylık ${pf(longCh.slopePctMonth)})` : "" },
    { w: 2, v: Math.max(-1, Math.min(1, pScore(["golden", "death", "hhhl", "lhll", "near-high", "near-low"]) / 3)), why: "Trend yapısı (tepe/dip dizilimi, kesişimler)" },
    { w: 2, v: oddsV(o40), why: o40.upPct !== null ? `Geçmişte benzer durumlarda 2 ay sonra yükselme oranı %${Math.round(o40.upPct)} (hissenin geneli %${Math.round(o40.baseUpPct ?? 0)}, ${o40.episodes} ayrı dönem)` : "" },
  ]);

  // Senaryolar
  const res1 = sr.resistances[0]?.price ?? price + 2 * a, res2 = sr.resistances[1]?.price ?? null;
  const sup1 = sr.supports[0]?.price ?? price - 2 * a, sup2 = sr.supports[1]?.price ?? null;
  const scenarios: Scenario[] = [
    { name: "Yükseliş senaryosu", bias: 1, trigger: `${f(res1)} direncinin üstünde kapanış`, target: res2 ?? res1 + 2 * a, note: res2 ? `Kırılırsa bir sonraki direnç ${f(res2)}; ${f(res1)} seviyesi bu kez destek olur.` : `Kırılırsa üstte belirgin direnç yok; ATR'ye göre ilk hedef bölgesi ${f(res1 + 2 * a)}.` },
    { name: "Düşüş senaryosu", bias: -1, trigger: `${f(sup1)} desteğinin altında kapanış`, target: sup2 ?? sup1 - 2 * a, note: sup2 ? `Kırılırsa bir sonraki destek ${f(sup2)}; ${f(sup1)} bu kez direnç olur.` : `Kırılırsa altta belirgin destek yok; ATR'ye göre ilk durak ${f(sup1 - 2 * a)}.` },
  ];

  return { ok: true, price, channel, patterns, odds, cones, projection, shortOutlook, midOutlook, scenarios, high52, low52 };
}

export const DIR_LABEL: Record<Dir, string> = { yukari: "Yukarı", yatay: "Yatay", asagi: "Aşağı" };
