import {
  getBars, getDisclosures, getQuote, getStatements, isStale, listInstruments, refreshFundamentals, refreshFx, refreshEvds, refreshQuote, refreshSymbol,
  withToday, type BarRow, type DisclosureRow, type Instrument, type QuoteRow, type SymbolRefresh,
} from "./data";
import { analyzeShort, type ShortAnalysis } from "./analysis/short";
import { analyzeLong, computeMetrics, type LongAnalysis, type PeerRow } from "./analysis/long";
import { companyView, PEERS, type CompanyView } from "./analysis/company";
import { decide, type Decision, type PositionCtx } from "./analysis/decision";
import { getPortfolio, type Portfolio } from "./portfolio-data";
import { getSettings, type Settings } from "./settings";
import { fmtDateTime } from "./format";
import { istDate } from "./time";

export interface Analyzed {
  inst: Instrument;
  quote: QuoteRow | null;
  bars: BarRow[];
  stale: boolean;
  refresh: SymbolRefresh;
  errors: string[];
  disclosures: DisclosureRow[];
  short: ShortAnalysis;
  long: LongAnalysis | null;
  company: CompanyView | null;
  statementsMeta: { source: string | null; fetchedAt: string | null };
  position: PositionCtx | null;
  decision: Decision;
}

async function peerRows(symbol: string): Promise<PeerRow[]> {
  const peers = PEERS[symbol] ?? [];
  return Promise.all(
    peers.map(async (p) => {
      await Promise.all([refreshFundamentals(p), refreshQuote({ symbol: p, type: "stock" })]);
      const [st, qt] = await Promise.all([getStatements(p), getQuote(p)]);
      const m = computeMetrics(st.statements, qt?.market_cap ?? null);
      return { symbol: p, pe: m?.pe ?? null, evEbitda: m?.evEbitda ?? null, pb: m?.pb ?? null, netDebtToEbitda: m?.netDebtToEbitda ?? null, period: m?.period ?? null };
    }),
  );
}

export async function analyzeInstrument(inst: Instrument, ctx: { settings: Settings; portfolio: Portfolio; deep?: boolean; force?: boolean }): Promise<Analyzed> {
  const refresh = await refreshSymbol(inst, { deep: ctx.deep !== false, force: ctx.force });
  const [quote, rawBars, disclosures, st] = await Promise.all([
    getQuote(inst.symbol), getBars(inst.symbol), getDisclosures(inst.symbol),
    inst.type === "stock" ? getStatements(inst.symbol) : Promise.resolve({ statements: [], source: null, fetchedAt: null }),
  ]);
  const bars = withToday(rawBars, quote);
  const priceRefresh = refresh.quote.ok ? refresh.bars : refresh.quote;
  const stale = isStale(quote, priceRefresh);
  const errors = [...new Set(Object.values(refresh).filter((r) => r && !r.ok).map((r) => `${r!.provider}: ${r!.error}`))];
  const short = analyzeShort({ bars, stale, disclosures, settings: ctx.settings, today: istDate() });

  let long: LongAnalysis | null = null, company: CompanyView | null = null;
  if (inst.type === "stock") {
    const metrics = computeMetrics(st.statements, quote?.market_cap ?? null);
    company = await companyView(inst.symbol, disclosures, metrics);
    const peers = ctx.deep !== false ? await peerRows(inst.symbol) : [];
    long = analyzeLong({ metrics, price: quote?.price ?? null, peers, settings: ctx.settings, extraChangers: company?.changers });
    if (company && long.ok) {
      long.reasons.push(...company.notes);
      long.counter.push(...company.counter);
    }
  }
  const pr = ctx.portfolio.rows.find((r) => r.symbol === inst.symbol);
  const position: PositionCtx | null = pr ? { qty: pr.qty, avgCost: pr.avgCost, weightPct: pr.weightPct, plPct: pr.unrealizedPct ?? 0 } : null;
  const decision = decide({
    hasData: !!quote && bars.length > 0, stale, lastVerified: quote ? `${quote.price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺, ${fmtDateTime(quote.as_of)}` : null,
    short, long, position, cash: ctx.portfolio.cash, totalValue: ctx.portfolio.totalValue, settings: ctx.settings,
  });
  return { inst, quote, bars, stale, refresh, errors, disclosures, short, long, company, statementsMeta: { source: st.source, fetchedAt: st.fetchedAt }, position, decision };
}

export async function analyzeAll(opts: { deep?: boolean; force?: boolean } = {}): Promise<{ items: Analyzed[]; portfolio: Portfolio; settings: Settings }> {
  const [settings, portfolio] = await Promise.all([getSettings(), getPortfolio()]);
  await Promise.all([refreshFx(), refreshEvds()]);
  const held = new Set(portfolio.rows.map((r) => r.symbol));
  const insts = (await listInstruments()).filter((i) => i.type !== "index" && (i.in_watchlist || held.has(i.symbol)));
  const items = await Promise.all(insts.map((i) => analyzeInstrument(i, { settings, portfolio, deep: opts.deep, force: opts.force })));
  // Önce portföydekiler (ağırlığa göre), sonra izleme listesi
  items.sort((a, b) => (b.position?.weightPct ?? -1) - (a.position?.weightPct ?? -1) || a.inst.symbol.localeCompare(b.inst.symbol));
  return { items, portfolio, settings };
}

export const STATUS_ORDER = ["Satış adayı", "Azalt", "Alım adayı", "Bekle", "Tut", "Veri yetersiz"];
