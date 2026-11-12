import { q } from "./db";
import { getInstrument, listInstruments, refreshCatalog, refreshFx, type Instrument } from "./data";
import { analyzeInstrument, type Analyzed } from "./engine";
import { backtestShort } from "./backtest";
import { getPortfolio } from "./portfolio-data";
import { getSettings, RISK } from "./settings";
import { checkAlerts } from "./alerts";
import { inSession } from "./time";
import { analyzeChart, type Dir } from "./chartAnalysis";

/**
 * Tarama listesi: Borsa İstanbul'un büyük ve likit hisseleri (BIST 30 ağırlıklı).
 * Endeks bileşimi dönemsel değişir; liste sabittir ve izleme listesi ile portföy her zaman eklenir.
 */
export const SCAN_UNIVERSE = [
  "AKBNK", "ALARK", "ARCLK", "ASELS", "ASTOR", "BIMAS", "EKGYO", "ENKAI", "EREGL", "FROTO",
  "GARAN", "HEKTS", "ISCTR", "KCHOL", "KRDMD", "MGROS", "OYAKC", "PETKM", "PGSUS", "SAHOL",
  "SASA", "SISE", "TAVHL", "TCELL", "THYAO", "TOASO", "TTKOM", "TUPRS", "YKBNK", "AEFES",
];

export type Action = "AL" | "SAT" | "AZALT" | "TUT" | "İZLE" | "BEKLE" | "UZAK DUR" | "VERİ YOK";

export interface ScanRow {
  symbol: string;
  name: string;
  held: boolean;
  watch: boolean;
  action: Action;
  status: string;
  rank: number;
  price: number | null;
  changePct: number | null;
  asOf: string | null;
  stale: boolean;
  ret1m: number | null;
  ret3m: number | null;
  ret1y: number | null;
  rsi: number | null;
  score: number;
  longView: string | null;
  longScore: number | null;
  above50: boolean | null;
  above200: boolean | null;
  entryBand: [number, number] | null;
  stop: number | null;
  target: number | null;
  rr: number | null;
  minRR: number;
  conditionMet: boolean;
  reason: string;
  changeCondition: string;
  spark: number[];
  bt: { closed: number; winRatePct: number | null; avgRetPct: number | null; totalRetPct: number | null; buyHoldPct: number | null } | null;
  outlook?: { s: Dir; sConf: string; sScore: number; m: Dir; mConf: string; mScore: number; upPct: number | null; n: number; patterns: string[] } | null;
  error: string | null;
}
export interface ScanResult {
  at: string;
  durationMs: number;
  rows: ScanRow[];
  breadth: { total: number; up: number; down: number; above50: number; above200: number; avgChangePct: number | null; buy: number; sell: number };
}

export const ACTION_ORDER: Action[] = ["AL", "SAT", "AZALT", "İZLE", "TUT", "BEKLE", "UZAK DUR", "VERİ YOK"];

const ret = (closes: number[], n: number) => (closes.length > n ? (closes[closes.length - 1] / closes[closes.length - 1 - n] - 1) * 100 : null);

export function toAction(a: Analyzed): Action {
  const st = a.decision.status;
  if (st === "Veri yetersiz") return "VERİ YOK";
  if (st === "Alım adayı") return "AL";
  if (st === "Satış adayı") return "SAT";
  if (st === "Azalt") return "AZALT";
  if (a.position) return "TUT";
  if (a.stale) return "BEKLE";
  if (a.short.signal === "zayif" || (a.short.score <= -20 && a.long?.view === "olumsuz")) return "UZAK DUR";
  if (a.short.score >= 40 || (a.short.score >= 20 && a.long?.view === "olumlu")) return "İZLE";
  return "BEKLE";
}

export function summarize(a: Analyzed, minRR: number, bt: ScanRow["bt"]): ScanRow {
  const ch = a.bars.length >= 120 ? analyzeChart(a.bars, { projectDays: 0 }) : null;
  const outlook = ch?.ok && ch.shortOutlook && ch.midOutlook ? {
    s: ch.shortOutlook.dir, sConf: ch.shortOutlook.confidence, sScore: ch.shortOutlook.score,
    m: ch.midOutlook.dir, mConf: ch.midOutlook.confidence, mScore: ch.midOutlook.score,
    upPct: ch.odds[0]?.n >= 15 ? ch.odds[0].upPct : null, n: ch.odds[0]?.n ?? 0,
    patterns: ch.patterns.filter((p) => p.strength >= 2).map((p) => `${p.bias > 0 ? "▲" : p.bias < 0 ? "▼" : "◆"} ${p.title}`),
  } : null;
  const s = a.short;
  const closes = a.bars.map((b) => b.close);
  const longScore = a.long?.ok ? a.long.score : null;
  const rank = s.score + (longScore ?? 0) * 8 + (s.conditionMet ? 15 : 0) + (bt?.winRatePct != null && bt.closed >= 3 ? (bt.winRatePct - 50) / 5 : 0);
  return {
    symbol: a.inst.symbol, name: a.inst.name, held: !!a.position, watch: a.inst.in_watchlist,
    action: toAction(a), status: a.decision.status, rank,
    price: a.quote?.price ?? null,
    changePct: a.quote?.prev_close ? (a.quote.price / a.quote.prev_close - 1) * 100 : null,
    asOf: a.quote?.as_of ?? null, stale: a.stale,
    ret1m: ret(closes, 21), ret3m: ret(closes, 63), ret1y: ret(closes, 252),
    rsi: s.ind.rsi, score: s.score,
    longView: a.long?.ok ? a.long.view : null, longScore,
    above50: s.ind.sma50 !== null ? s.price > s.ind.sma50 : null,
    above200: s.ind.sma200 !== null ? s.price > s.ind.sma200 : null,
    entryBand: s.entryBand, stop: s.stop, target: s.target, rr: s.rr, minRR, conditionMet: s.conditionMet,
    reason: a.decision.reason, changeCondition: a.decision.changeCondition,
    spark: closes.slice(-60),
    bt,
    outlook,
    error: a.errors[0] ?? null,
  };
}

async function ensureScanInstruments(): Promise<void> {
  await refreshCatalog();
  for (const s of SCAN_UNIVERSE) {
    if (await getInstrument(s)) continue;
    const [c] = await q("SELECT name, kap_member_oid FROM catalog WHERE symbol=$1", [s]);
    await q("INSERT INTO instruments (symbol, type, name, kap_member_oid, in_watchlist) VALUES ($1,'stock',$2,$3,FALSE) ON CONFLICT DO NOTHING", [s, c?.name ?? "", c?.kap_member_oid ?? null]);
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, onDone: () => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      onDone();
    }
  }));
  return out;
}

const g = globalThis as unknown as { __scan?: { running: boolean; done: number; total: number; startedAt: number; error?: string } };
export const scanProgress = () => g.__scan ?? null;

export async function getLastScan(): Promise<ScanResult | null> {
  const [r] = await q("SELECT value FROM settings WHERE key='scan:last'");
  return r?.value ?? null;
}

/** Tarama sonucu ne kadar eskiyse yenilenmeli (seans içinde 30 dk, dışında 6 saat). */
export function scanIsOld(r: ScanResult | null): boolean {
  if (!r) return true;
  return Date.now() - Date.parse(r.at) > (inSession() ? 30 : 360) * 60_000;
}

/** Taramayı çalıştırır; aynı anda yalnızca bir tarama çalışır. */
export async function runScan(): Promise<ScanResult | null> {
  if (g.__scan?.running) return null;
  const t0 = Date.now();
  g.__scan = { running: true, done: 0, total: 0, startedAt: t0 };
  try {
    await ensureScanInstruments();
    const [settings, portfolio] = await Promise.all([getSettings(), getPortfolio()]);
    await refreshFx();
    const held = new Set(portfolio.rows.map((r) => r.symbol));
    const universe = new Set(SCAN_UNIVERSE);
    const insts: Instrument[] = (await listInstruments("type='stock'")).filter((i) => universe.has(i.symbol) || i.in_watchlist || held.has(i.symbol));
    g.__scan.total = insts.length;
    const minRR = RISK[settings.risk].minRR;
    const rows = await pool(insts, 4, async (inst) => {
      try {
        const a = await analyzeInstrument(inst, { settings, portfolio, deep: true, peers: false });
        const b = a.bars.length >= 260 ? backtestShort(a.bars, settings) : null;
        return summarize(a, minRR, b?.ok ? { closed: b.closed, winRatePct: b.winRatePct, avgRetPct: b.avgRetPct, totalRetPct: b.totalRetPct, buyHoldPct: b.buyHoldPct } : null);
      } catch (e: any) {
        return {
          symbol: inst.symbol, name: inst.name, held: held.has(inst.symbol), watch: inst.in_watchlist, action: "VERİ YOK", status: "Veri yetersiz", rank: -999,
          price: null, changePct: null, asOf: null, stale: true, ret1m: null, ret3m: null, ret1y: null, rsi: null, score: 0, longView: null, longScore: null,
          above50: null, above200: null, entryBand: null, stop: null, target: null, rr: null, minRR, conditionMet: false, reason: "Analiz yapılamadı.", changeCondition: "—",
          spark: [], bt: null, error: String(e?.message ?? e),
        } as ScanRow;
      }
    }, () => { g.__scan!.done++; });
    rows.sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) || b.rank - a.rank);
    const ok = rows.filter((r) => r.price !== null);
    const chg = ok.map((r) => r.changePct).filter((v): v is number => v !== null);
    const result: ScanResult = {
      at: new Date().toISOString(), durationMs: Date.now() - t0, rows,
      breadth: {
        total: ok.length,
        up: chg.filter((c) => c > 0).length, down: chg.filter((c) => c < 0).length,
        above50: ok.filter((r) => r.above50).length, above200: ok.filter((r) => r.above200).length,
        avgChangePct: chg.length ? chg.reduce((a, b) => a + b, 0) / chg.length : null,
        buy: rows.filter((r) => r.action === "AL").length, sell: rows.filter((r) => r.action === "SAT" || r.action === "AZALT").length,
      },
    };
    await q("INSERT INTO settings (key, value) VALUES ('scan:last', $1) ON CONFLICT (key) DO UPDATE SET value=$1", [JSON.stringify(result)]);
    await checkAlerts();
    return result;
  } catch (e: any) {
    g.__scan.error = String(e?.message ?? e);
    return null;
  } finally {
    g.__scan.running = false;
  }
}
