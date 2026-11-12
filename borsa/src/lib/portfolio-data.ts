import { q } from "./db";
import { getBars, getQuotes, isStale, listInstruments, refreshBars, refreshQuote, type QuoteRow, type RefreshResult } from "./data";
import { computeLedger, computePerformance, sortTxs, type Ledger, type PerfPoint, type Tx } from "./portfolio";
import { istDate } from "./time";

export async function loadTxs(): Promise<Tx[]> {
  const rows = await q("SELECT id, date, type, symbol, quantity, price, fee, amount, note FROM transactions ORDER BY date, id");
  return rows as Tx[];
}

export interface PositionRow {
  symbol: string;
  name: string;
  type: string;
  qty: number;
  avgCost: number;
  cost: number;
  price: number | null;
  quote: QuoteRow | null;
  stale: boolean;
  value: number;
  dayChange: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  dividends: number;
  weightPct: number;
}
export interface Portfolio {
  hasTx: boolean;
  rows: PositionRow[];
  closed: { symbol: string; realized: number; dividends: number }[];
  cash: number;
  positionsValue: number;
  totalValue: number;
  dayChange: number;
  dayChangePct: number | null;
  unrealized: number;
  realized: number;
  dividends: number;
  totalPL: number;
  netDeposits: number;
  implicitDeposits: number;
  warnings: string[];
  errors: RefreshResult[];
  ledger: Ledger;
}

export async function getPortfolio(opts: { refresh?: boolean } = { refresh: true }): Promise<Portfolio> {
  const txs = await loadTxs();
  const ledger = computeLedger(txs);
  const insts = new Map((await listInstruments()).map((i) => [i.symbol, i]));
  const held = [...ledger.positions.values()].filter((p) => p.qty > 0);
  const errors: RefreshResult[] = [];
  const refreshed = new Map<string, RefreshResult>();
  if (opts.refresh !== false) {
    await Promise.all(
      held.map(async (p) => {
        const inst = insts.get(p.symbol);
        if (!inst) return;
        const r = await refreshQuote(inst);
        refreshed.set(p.symbol, r);
        if (!r.ok) errors.push(r);
      }),
    );
  }
  const quotes = await getQuotes(held.map((p) => p.symbol));
  const today = istDate();
  const rows: PositionRow[] = held.map((p) => {
    const quote = quotes.get(p.symbol) ?? null;
    const price = quote?.price ?? null;
    // Fiyat yoksa pozisyon maliyet değeriyle gösterilir (kâr/zarar hesaplanmaz).
    const value = p.qty * (price ?? p.avgCost);
    const isToday = quote ? istDate(new Date(quote.as_of)) === today : false;
    return {
      symbol: p.symbol, name: insts.get(p.symbol)?.name ?? p.symbol, type: insts.get(p.symbol)?.type ?? "stock",
      qty: p.qty, avgCost: p.avgCost, cost: p.cost, price, quote, stale: isStale(quote, refreshed.get(p.symbol)),
      value, dayChange: quote && quote.prev_close && isToday ? p.qty * (quote.price - quote.prev_close) : 0,
      unrealized: price !== null ? value - p.cost : 0, unrealizedPct: price !== null && p.cost > 0 ? (value / p.cost - 1) * 100 : null,
      realized: p.realized, dividends: p.dividends, weightPct: 0,
    };
  });
  const positionsValue = rows.reduce((s, r) => s + r.value, 0);
  const totalValue = positionsValue + ledger.cash;
  for (const r of rows) r.weightPct = totalValue > 0 ? (r.value / totalValue) * 100 : 0;
  rows.sort((a, b) => b.value - a.value);
  const dayChange = rows.reduce((s, r) => s + r.dayChange, 0);
  const unrealized = rows.reduce((s, r) => s + r.unrealized, 0);
  return {
    hasTx: txs.length > 0, rows,
    closed: [...ledger.positions.values()].filter((p) => p.qty === 0 && (p.realized !== 0 || p.dividends !== 0)).map((p) => ({ symbol: p.symbol, realized: p.realized, dividends: p.dividends })),
    cash: ledger.cash, positionsValue, totalValue, dayChange,
    dayChangePct: totalValue - dayChange > 0 ? (dayChange / (totalValue - dayChange)) * 100 : null,
    unrealized, realized: ledger.realized, dividends: ledger.dividends, totalPL: unrealized + ledger.realized + ledger.dividends,
    netDeposits: ledger.deposits + ledger.implicitDeposits, implicitDeposits: ledger.implicitDeposits,
    warnings: ledger.warnings, errors, ledger,
  };
}

export interface Performance {
  points: PerfPoint[];
  twrPct: number | null;
  benchPct: number | null;
  from: string | null;
  to: string | null;
  benchSource: string | null;
}

export async function getPerformance(): Promise<Performance> {
  const txs = sortTxs(await loadTxs());
  if (!txs.length) return { points: [], twrPct: null, benchPct: null, from: null, to: null, benchSource: null };
  const start = txs[0].date;
  const symbols = [...new Set(txs.map((t) => t.symbol).filter((s): s is string => !!s))];
  const insts = new Map((await listInstruments()).map((i) => [i.symbol, i]));
  await Promise.all([
    refreshBars({ symbol: "XU100", type: "index" }), refreshQuote({ symbol: "XU100", type: "index" }),
    ...symbols.filter((s) => insts.has(s)).map((s) => refreshBars(insts.get(s)!)),
  ]);
  const from = new Date(Date.parse(start + "T12:00:00Z") - 10 * 86400_000).toISOString().slice(0, 10);
  const priceMaps = new Map<string, Map<string, number>>();
  for (const s of symbols) {
    const bars = await getBars(s, from);
    priceMaps.set(s, new Map(bars.map((b) => [b.date, b.raw_close ?? b.close])));
  }
  const bench = await getBars("XU100", from);
  const benchMap = new Map(bench.map((b) => [b.date, b.close]));
  const quotes = await getQuotes([...symbols, "XU100"]);
  const dateSet = new Set(bench.map((b) => b.date).filter((d) => d >= start));
  for (const [s, qt] of quotes) {
    const d = istDate(new Date(qt.as_of));
    if (d < start) continue;
    if (s === "XU100") { benchMap.set(d, qt.price); dateSet.add(d); }
    else if (priceMaps.get(s) && !priceMaps.get(s)!.has(d)) priceMaps.get(s)!.set(d, qt.price);
  }
  dateSet.add(start);
  const dates = [...dateSet].sort();
  // Fiyatı olmayan günlerde son bilinen fiyat taşınır.
  const carry = new Map<string, number>();
  let lastBench: number | null = bench.filter((b) => b.date < start).pop()?.close ?? null;
  const priceOn = (symbol: string, d: string) => {
    const v = priceMaps.get(symbol)?.get(d);
    if (v !== undefined) carry.set(symbol, v);
    return v ?? carry.get(symbol) ?? null;
  };
  const benchOn = (d: string) => {
    const v = benchMap.get(d);
    if (v !== undefined) lastBench = v;
    return lastBench;
  };
  const points = computePerformance(txs, dates, priceOn, benchOn);
  const lastPt = points[points.length - 1];
  return {
    points, twrPct: lastPt ? lastPt.twr - 100 : null, benchPct: lastPt?.bench != null ? lastPt.bench - 100 : null,
    from: points[0]?.date ?? null, to: lastPt?.date ?? null, benchSource: bench[0]?.source ?? null,
  };
}
