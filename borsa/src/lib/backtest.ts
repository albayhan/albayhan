import { analyzeShort } from "./analysis/short";
import type { BarRow } from "./data";
import type { Settings } from "./settings";

export interface BtTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  exit: "hedef" | "zarar-kes" | "süre" | "açık";
  retPct: number;
  days: number;
}
export interface Backtest {
  ok: boolean;
  from: string | null;
  to: string | null;
  trades: BtTrade[];
  closed: number;
  winRatePct: number | null;
  avgRetPct: number | null;
  totalRetPct: number | null; // işlemler arka arkaya bileşik
  buyHoldPct: number | null;
  bestPct: number | null;
  worstPct: number | null;
  maxHoldDays: number;
  note: string;
}

/**
 * Kısa vade kuralının geçmişte nasıl sonuç verdiğini ölçer.
 * Her gün yalnızca o güne kadarki veriyle analiz yapılır (geleceği görme yok).
 * Giriş: "alım" sinyalinin oluştuğu günün kapanışı. Çıkış: sonraki günlerde düşük zarar-kese değerse zarar-kes,
 * yüksek hedefe değerse hedef (aynı gün ikisi birden olursa temkinli olarak zarar-kes), vade dolarsa kapanış.
 * Komisyon ve kayma dahil değildir.
 */
export function backtestShort(bars: BarRow[], settings: Settings, opts: { years?: number } = {}): Backtest {
  const maxHold = settings.shortMaxWeeks * 5;
  const empty: Backtest = { ok: false, from: null, to: null, trades: [], closed: 0, winRatePct: null, avgRetPct: null, totalRetPct: null, buyHoldPct: null, bestPct: null, worstPct: null, maxHoldDays: maxHold, note: "" };
  const done = bars.filter((b) => !b.provisional);
  if (done.length < 260) return { ...empty, note: "Geçmiş test için en az bir yıllık fiyat gerekir." };
  const startIdx = Math.max(200, done.length - Math.round((opts.years ?? 2) * 250));
  const trades: BtTrade[] = [];
  let i = startIdx;
  while (i < done.length - 1) {
    const s = analyzeShort({ bars: done.slice(0, i + 1), stale: false, disclosures: [], settings, today: done[i].date });
    if (s.ok && s.signal === "alim" && s.stop && s.target) {
      const entry = done[i].close;
      const stop = Math.min(s.stop, entry * 0.999);
      const target = Math.max(s.target, entry * 1.001);
      let j = i + 1, exitPrice = 0, exit: BtTrade["exit"] = "açık";
      for (; j < done.length; j++) {
        const b = done[j];
        const lo = b.low ?? b.close, hi = b.high ?? b.close;
        if (lo <= stop) { exitPrice = Math.min(stop, hi); exit = "zarar-kes"; break; }
        if (hi >= target) { exitPrice = Math.max(target, lo); exit = "hedef"; break; }
        if (j - i >= maxHold) { exitPrice = b.close; exit = "süre"; break; }
      }
      if (j >= done.length) { j = done.length - 1; exitPrice = done[j].close; exit = "açık"; }
      trades.push({ entryDate: done[i].date, entryPrice: entry, exitDate: done[j].date, exitPrice, exit, retPct: (exitPrice / entry - 1) * 100, days: j - i });
      i = j + 1;
    } else i++;
  }
  const closed = trades.filter((t) => t.exit !== "açık");
  const rets = closed.map((t) => t.retPct);
  const from = done[startIdx].date, to = done[done.length - 1].date;
  return {
    ok: true, from, to, trades, closed: closed.length,
    winRatePct: rets.length ? (rets.filter((r) => r > 0).length / rets.length) * 100 : null,
    avgRetPct: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null,
    totalRetPct: rets.length ? (rets.reduce((a, r) => a * (1 + r / 100), 1) - 1) * 100 : null,
    buyHoldPct: (done[done.length - 1].close / done[startIdx].close - 1) * 100,
    bestPct: rets.length ? Math.max(...rets) : null,
    worstPct: rets.length ? Math.min(...rets) : null,
    maxHoldDays: maxHold,
    note: "Sinyal günü kapanışından giriş; komisyon ve kayma dahil değil. Geçmiş sonuç gelecek için garanti değildir.",
  };
}
