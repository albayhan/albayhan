import { atr, last, macd, rsi, sma, supportResistance, type Level } from "../indicators";
import type { BarRow, DisclosureRow } from "../data";
import { RISK, type Settings } from "../settings";

export interface Component {
  name: string;
  value: string;
  score: number;
  max: number;
  note: string;
}
export interface ShortAnalysis {
  ok: boolean;
  signal: "alim" | "bekle" | "zayif" | "veri_yetersiz";
  stale: boolean;
  score: number;
  price: number;
  components: Component[];
  ind: { sma20: number | null; sma50: number | null; sma200: number | null; rsi: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null; atr: number | null; volRatio: number | null };
  supports: Level[];
  resistances: Level[];
  entryBand: [number, number] | null;
  entryCondition: string;
  conditionMet: boolean;
  entryRef: number | null; // R/Ö'nün hesaplandığı giriş fiyatı
  rrBasis: "bant" | "güncel fiyat" | null;
  stop: number | null;
  target: number | null;
  targetBasis: string | null;
  rr: number | null;
  minRR: number;
  catalysts: { date: string; title: string; id?: number; upcoming?: boolean }[];
  reasons: string[];
  counter: string[];
  horizon: string;
}

const f = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Yasal finansal rapor takvimine göre yaklaşan bildirim penceresi (SPK II-14.1; konsolide süreler, uzatmalar olabilir). */
export function upcomingReportWindow(today: string): { date: string; title: string } {
  const y = Number(today.slice(0, 4));
  const windows = [
    { date: `${y}-03-11`, title: `${y - 1} yıllık finansal rapor için yasal son bildirim tarihi` },
    { date: `${y}-05-10`, title: `${y} 1. çeyrek finansal raporu için yasal son bildirim tarihi` },
    { date: `${y}-08-19`, title: `${y} 6 aylık finansal rapor için yasal son bildirim tarihi` },
    { date: `${y}-11-09`, title: `${y} 3. çeyrek finansal raporu için yasal son bildirim tarihi` },
    { date: `${y + 1}-03-11`, title: `${y} yıllık finansal rapor için yasal son bildirim tarihi` },
  ];
  return windows.find((w) => w.date >= today)!;
}

export function analyzeShort(input: {
  bars: BarRow[];
  stale: boolean;
  disclosures: DisclosureRow[];
  settings: Settings;
  today: string;
}): ShortAnalysis {
  const { bars, stale, settings } = input;
  const minRR = RISK[settings.risk].minRR;
  const horizon = `${settings.shortMinWeeks}–${settings.shortMaxWeeks} hafta`;
  const empty: ShortAnalysis = {
    ok: false, signal: "veri_yetersiz", stale, score: 0, price: bars.length ? bars[bars.length - 1].close : 0, components: [],
    ind: { sma20: null, sma50: null, sma200: null, rsi: null, macd: null, macdSignal: null, macdHist: null, atr: null, volRatio: null },
    supports: [], resistances: [], entryBand: null, entryCondition: "", conditionMet: false, entryRef: null, rrBasis: null, stop: null, target: null,
    targetBasis: null, rr: null, minRR, catalysts: [], reasons: [], counter: [], horizon,
  };
  if (bars.length < 60) {
    return { ...empty, reasons: [`Teknik analiz için en az 60 günlük fiyat gerekir (eldeki: ${bars.length}).`] };
  }
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const s20 = last(sma(closes, 20))!, s50 = last(sma(closes, 50))!, s200 = last(sma(closes, 200));
  const s50prev = sma(closes, 50)[closes.length - 11];
  const r = last(rsi(closes, 14));
  const m = macd(closes);
  const mh = last(m.hist), mhPrev = m.hist[m.hist.length - 4];
  const a = atr(bars, 14) ?? price * 0.02;
  // Hacim: yalnızca tamamlanmış günler (gün içi kısmi hacim yanıltır)
  const done = bars.filter((b) => !b.provisional && b.volume !== null);
  const vols = done.map((b) => b.volume!);
  const v5 = vols.slice(-5), v20 = vols.slice(-20);
  const volRatio = v20.length === 20 ? (v5.reduce((x, y) => x + y, 0) / 5) / (v20.reduce((x, y) => x + y, 0) / 20) : null;
  const chg5 = done.length > 5 ? done[done.length - 1].close / done[done.length - 6].close - 1 : 0;

  const comps: Component[] = [];
  let trend = 0;
  trend += price > s20 ? 10 : -10;
  trend += s20 > s50 ? 10 : -10;
  if (s200 !== null) trend += price > s200 ? 10 : -10;
  if (s50prev) trend += s50 > s50prev ? 10 : -10;
  comps.push({
    name: "Trend", value: `Fiyat ${f(price)} · 20g ${f(s20)} · 50g ${f(s50)}${s200 !== null ? ` · 200g ${f(s200)}` : ""}`, score: trend, max: 40,
    note: trend >= 20 ? "Fiyat ortalamaların üzerinde, ortalamalar yukarı dizili." : trend <= -20 ? "Fiyat ortalamaların altında, eğilim aşağı." : "Ortalamalar karışık; net bir eğilim yok.",
  });

  let mom = 0;
  if (r !== null) mom += r >= 50 && r <= 70 ? 10 : r > 75 ? -5 : r < 40 ? -10 : 0;
  if (mh !== null) mom += mh > 0 ? 10 : -10;
  if (mh !== null && mhPrev !== null && mhPrev !== undefined) mom += mh > mhPrev ? 10 : -10;
  comps.push({
    name: "Momentum", value: `RSI(14) ${r !== null ? f(r) : "—"} · MACD histogram ${mh !== null ? f(mh) : "—"}`, score: mom, max: 30,
    note: r !== null && r > 75 ? "RSI aşırı alım bölgesinde; geri çekilme riski yüksek." : r !== null && r < 30 ? "RSI aşırı satım bölgesinde; tepki olabilir ama eğilim zayıf." : mh !== null && mh > 0 ? "MACD sinyal çizgisinin üzerinde." : "MACD sinyal çizgisinin altında.",
  });

  let vol = 0;
  if (volRatio !== null && volRatio > 1.2) vol = chg5 > 0 ? 15 : -15;
  comps.push({
    name: "Hacim", value: volRatio !== null ? `Son 5 gün / 20 gün ortalaması: ${f(volRatio)}×` : "Hacim verisi yok", score: vol, max: 15,
    note: volRatio === null ? "Hacim değerlendirilemedi." : vol > 0 ? "Yükseliş ortalamanın üzerinde hacimle destekleniyor." : vol < 0 ? "Düşüş ortalamanın üzerinde hacimle geliyor." : "Hacim ortalamaya yakın; teyit yok.",
  });

  // Katalizörler: yön yargısı içermez; oynaklık kaynağı olarak listelenir.
  const cutoff = new Date(input.today + "T00:00:00+03:00").getTime() - 21 * 86400_000;
  const recent = input.disclosures
    .filter((d) => d.class !== "DKB" && new Date(d.published_at).getTime() >= cutoff)
    .slice(0, 5)
    .map((d) => ({ date: d.published_at, title: (d.summary?.split("\n")[0] || d.subject || "KAP bildirimi").trim(), id: d.id }));
  const up = upcomingReportWindow(input.today);
  const horizonEnd = new Date(Date.parse(input.today + "T12:00:00Z") + settings.shortMaxWeeks * 7 * 86400_000).toISOString().slice(0, 10);
  const catalysts: ShortAnalysis["catalysts"] = [...(up.date <= horizonEnd ? [{ date: up.date, title: up.title, upcoming: true }] : []), ...recent];
  comps.push({
    name: "Katalizörler", value: `${recent.length} yeni KAP bildirimi${up.date <= horizonEnd ? " · vade içinde finansal rapor bekleniyor" : ""}`, score: 0, max: 0,
    note: "Bildirimler yön puanına katılmaz; vade içindeki rapor tarihi fiyat oynaklığını artırabilir.",
  });

  const score = trend + mom + vol;
  const sr = supportResistance(bars, price);
  const hf = Math.sqrt(settings.shortMaxWeeks / 8);

  // Giriş bandı: 20 günlük ortalamaya geri çekilme bölgesi
  const band: [number, number] = [s20 - 0.5 * a, s20 + 1.0 * a];
  const above = price > band[1];
  const entryRef = above ? price : Math.min(Math.max(price, band[0]), band[1]);
  const below = sr.supports.find((s) => s.price < Math.min(band[0], entryRef) - 0.1 * a);
  let stop = below ? below.price - 0.25 * a : band[0] - 1.5 * a;
  stop = Math.max(stop, entryRef - 3 * a * hf); // en fazla 3 ATR risk
  if (stop >= entryRef) stop = entryRef - 1.5 * a;
  const res = sr.resistances.find((x) => x.price >= entryRef + 1.5 * a * hf);
  const cap = entryRef + 5 * a * hf;
  const target = res ? Math.min(res.price, cap) : entryRef + 4 * a * hf;
  const targetBasis = res ? (res.price <= cap ? `En yakın direnç (${res.touches} temas)` : "ATR üst sınırı (direnç daha uzakta)") : "ATR projeksiyonu (üstte belirgin direnç yok)";
  const rr = (target - entryRef) / (entryRef - stop);

  const trendOk = price > s20 && s20 > s50;
  const rsiOk = r === null || r < 75;
  const rrOk = rr >= minRR;
  const conditionMet = trendOk && rsiOk && rrOk && price >= band[0];
  const entryCondition =
    `Fiyat 20 günlük ortalamanın (${f(s20)}) üzerinde kapanmalı, 20g ortalama 50g ortalamanın (${f(s50)}) üzerinde olmalı, ` +
    `RSI 75'in altında kalmalı ve risk/ödül en az ${f(minRR)} olmalı.`;

  const reasons: string[] = [], counter: string[] = [];
  for (const c of comps) if (c.max > 0) (c.score > 0 ? reasons : c.score < 0 ? counter : []).push(`${c.name}: ${c.note}`);
  if (above) counter.push(`Fiyat giriş bandının (${f(band[0])}–${f(band[1])}) üzerinde; risk/ödül güncel fiyattan hesaplandı (${f(rr)}).`);
  if (!rrOk) counter.push(`Risk/ödül ${f(rr)}, ${RISK[settings.risk].label.toLowerCase()} profil için gereken ${f(minRR)} eşiğinin altında.`);
  if (r !== null && r > 70) counter.push(`RSI ${f(r)}: aşırı alım bölgesine yakın.`);
  if (catalysts.some((c) => c.upcoming)) counter.push("Vade içinde finansal rapor açıklanması bekleniyor; sonuç yönü bilinmiyor.");

  let signal: ShortAnalysis["signal"] = "bekle";
  if (stale) signal = "bekle";
  else if (conditionMet && score >= 20) signal = "alim";
  else if (score <= -30) signal = "zayif";
  if (stale) reasons.unshift("Fiyat verisi güncel değil; kısa vade önerisi beklemeye alındı.");

  return {
    ok: true, signal, stale, score, price, components: comps,
    ind: { sma20: s20, sma50: s50, sma200: s200, rsi: r, macd: last(m.line), macdSignal: last(m.signal), macdHist: mh, atr: a, volRatio },
    supports: sr.supports, resistances: sr.resistances, entryBand: band, entryCondition, conditionMet, entryRef,
    rrBasis: above ? "güncel fiyat" : "bant", stop, target, targetBasis, rr, minRR, catalysts, reasons, counter, horizon,
  };
}
