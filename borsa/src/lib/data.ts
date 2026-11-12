import { q } from "./db";
import { addDays, inSession, istClock, istDate, isWeekday } from "./time";
import { callProvider, type ProviderId } from "./providers/status";
import { isyHistory, isyIndexHistory, isyQuote, isyStatements, historyStart } from "./providers/isyatirim";
import { kapCompanies, kapDisclosures, KAP_SOURCE } from "./providers/kap";
import { tcmbOn, tcmbToday, TCMB_SOURCE } from "./providers/tcmb";
import { tefasHistory, tefasInfo, TEFAS_SOURCE, type FundInfo } from "./providers/tefas";
import { eodhdEnabled, eodhdHistory, eodhdQuote } from "./providers/eodhd";
import { evdsEnabled, evdsSeries, EVDS_SERIES, EVDS_SOURCE } from "./providers/evds";
import type { Bar, Quote, Statement } from "./providers/types";

export type InstrumentType = "stock" | "fund" | "index";
export interface Instrument {
  symbol: string;
  type: InstrumentType;
  name: string;
  kap_member_oid: string | null;
  in_watchlist: boolean;
}
export interface RefreshResult {
  ok: boolean;
  provider: ProviderId;
  error?: string;
}

const g = globalThis as unknown as { __inflight?: Map<string, Promise<RefreshResult>> };
const inflight = (g.__inflight ??= new Map());

/** Aynı anahtar için eşzamanlı yenilemeleri tekilleştirir; hata fırlatmaz. */
function once(key: string, provider: ProviderId, fn: () => Promise<void>): Promise<RefreshResult> {
  let p = inflight.get(key);
  if (!p) {
    p = fn()
      .then((): RefreshResult => ({ ok: true, provider }))
      .catch((e: any): RefreshResult => ({ ok: false, provider: e?.provider ?? provider, error: String(e?.message ?? e) }))
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

const ageMs = (t: string | Date | null | undefined) => (t ? Date.now() - new Date(t).getTime() : Infinity);
const priceProvider = (): ProviderId => (eodhdEnabled() ? "eodhd" : "isyatirim");

// ---------- Enstrümanlar ----------

export async function getInstrument(symbol: string): Promise<Instrument | null> {
  const [r] = await q<Instrument>("SELECT * FROM instruments WHERE symbol=$1", [symbol]);
  return r ?? null;
}
export async function listInstruments(where = "TRUE"): Promise<Instrument[]> {
  return q<Instrument>(`SELECT * FROM instruments WHERE ${where} ORDER BY type DESC, symbol`);
}

// ---------- Fiyat ----------

async function saveQuote(qt: Quote) {
  await q(
    `INSERT INTO quotes (symbol, price, prev_close, open, high, low, volume, market_cap, as_of, kind, source, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (symbol) DO UPDATE SET price=$2, prev_close=$3, open=$4, high=$5, low=$6, volume=$7, market_cap=$8, as_of=$9, kind=$10, source=$11, fetched_at=now()`,
    [qt.symbol, qt.price, qt.prevClose, qt.open, qt.high, qt.low, qt.volume, qt.marketCap, qt.asOf, qt.kind, qt.source],
  );
}

export function refreshQuote(inst: Pick<Instrument, "symbol" | "type">, force = false): Promise<RefreshResult> {
  if (inst.type === "fund") return refreshFund(inst.symbol, force);
  const provider = priceProvider();
  return once(`quote:${inst.symbol}`, provider, async () => {
    const [cur] = await q("SELECT fetched_at FROM quotes WHERE symbol=$1", [inst.symbol]);
    const ttl = inSession() ? 60_000 : 15 * 60_000;
    if (!force && cur && ageMs(cur.fetched_at) < ttl) return;
    const qt = await callProvider(provider, () => (provider === "eodhd" && inst.type === "stock" ? eodhdQuote(inst.symbol) : isyQuote(inst.symbol)));
    await saveQuote(qt);
  });
}

async function saveBars(symbol: string, bars: Bar[]) {
  if (!bars.length) return;
  for (let i = 0; i < bars.length; i += 400) {
    const chunk = bars.slice(i, i + 400);
    const vals: any[] = [];
    const ph = chunk.map((b, k) => {
      vals.push(symbol, b.date, b.open, b.high, b.low, b.close, b.rawClose, b.volume, b.source);
      const o = k * 9;
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9}, now())`;
    });
    await q(
      `INSERT INTO price_bars (symbol, date, open, high, low, close, raw_close, volume, source, fetched_at) VALUES ${ph.join(",")}
       ON CONFLICT (symbol, date) DO UPDATE SET open=COALESCE(EXCLUDED.open, price_bars.open), high=EXCLUDED.high, low=EXCLUDED.low,
         close=EXCLUDED.close, raw_close=EXCLUDED.raw_close, volume=EXCLUDED.volume, source=EXCLUDED.source, fetched_at=now()`,
      vals,
    );
  }
}

export function refreshBars(inst: Pick<Instrument, "symbol" | "type">, force = false): Promise<RefreshResult> {
  if (inst.type === "fund") return refreshFund(inst.symbol, force);
  const provider = priceProvider();
  return once(`bars:${inst.symbol}`, provider, async () => {
    const [m] = await q("SELECT max(date) AS last, max(fetched_at) AS fetched, count(*)::int AS n FROM price_bars WHERE symbol=$1", [inst.symbol]);
    const today = istDate();
    const fetchedToday = m?.fetched && istDate(new Date(m.fetched)) === today;
    const afterClose = isWeekday() && istClock().minutes >= 18 * 60 + 30;
    const missingToday = afterClose && m?.last !== today && ageMs(m?.fetched) > 20 * 60_000;
    if (!force && m?.n > 0 && fetchedToday && !missingToday && ageMs(m.fetched) < 3 * 3600_000) return;
    // Düzeltilmiş seriler temettü/bölünme sonrası geriye dönük değişir: günde bir kez tüm seri yenilenir.
    const from = !m?.n || !fetchedToday || force ? historyStart(3) : addDays(m.last, -10);
    const bars = await callProvider(provider, () =>
      inst.type === "index" ? isyIndexHistory(inst.symbol, from, today) : provider === "eodhd" ? eodhdHistory(inst.symbol, from, today) : isyHistory(inst.symbol, from, today),
    );
    await saveBars(inst.symbol, bars);
    if (!bars.length && !m?.n) throw new Error(`${inst.symbol} için tarihsel veri yok`);
    await q("UPDATE price_bars SET fetched_at=now() WHERE symbol=$1 AND date=(SELECT max(date) FROM price_bars WHERE symbol=$1)", [inst.symbol]);
  });
}

// ---------- Fon ----------

export function refreshFund(symbol: string, force = false): Promise<RefreshResult> {
  return once(`fund:${symbol}`, "tefas", async () => {
    const [m] = await q("SELECT max(fetched_at) AS fetched FROM price_bars WHERE symbol=$1", [symbol]);
    if (!force && m?.fetched && ageMs(m.fetched) < 3 * 3600_000) return;
    const today = istDate();
    await callProvider("tefas", async () => {
      // TEFAS tek istekte en çok ~3 aylık aralık döndürür: bir yıl dört parçada çekilir.
      let name = symbol;
      for (let i = 3; i >= 0; i--) {
        const h = await tefasHistory(symbol, addDays(today, -(i + 1) * 90), addDays(today, -i * 90));
        name = h.name;
        await saveBars(symbol, h.bars);
      }
      await q("UPDATE instruments SET name=$2 WHERE symbol=$1 AND (name='' OR name=symbol)", [symbol, name]);
      const info = await tefasInfo(symbol, addDays(today, -30), today);
      await q(
        `INSERT INTO fund_info (symbol, data, source, fetched_at) VALUES ($1,$2,$3, now())
         ON CONFLICT (symbol) DO UPDATE SET data=$2, source=$3, fetched_at=now()`,
        [symbol, JSON.stringify(info), TEFAS_SOURCE],
      );
    });
    const rows = await q("SELECT date, close FROM price_bars WHERE symbol=$1 ORDER BY date DESC LIMIT 2", [symbol]);
    if (rows[0]) {
      await saveQuote({
        symbol, price: rows[0].close, prevClose: rows[1]?.close ?? null, open: null, high: null, low: null, volume: null, marketCap: null,
        asOf: new Date(rows[0].date + "T18:00:00+03:00").toISOString(), kind: "close", source: TEFAS_SOURCE,
      });
    }
  });
}

export async function getFundInfo(symbol: string): Promise<{ data: FundInfo; source: string; fetched_at: string } | null> {
  const [r] = await q("SELECT * FROM fund_info WHERE symbol=$1", [symbol]);
  return r ?? null;
}

// ---------- Finansal tablolar ----------

export function refreshFundamentals(symbol: string, force = false): Promise<RefreshResult> {
  return once(`fund:${symbol}:stmt`, "isyatirim", async () => {
    const [m] = await q("SELECT max(fetched_at) AS fetched FROM fundamentals WHERE symbol=$1", [symbol]);
    if (!force && m?.fetched && ageMs(m.fetched) < 24 * 3600_000) return;
    const now = new Date(istDate() + "T12:00:00Z");
    const y = now.getUTCFullYear();
    const mo = now.getUTCMonth() + 1;
    // Açıklanmış olabilecek en yeni dönemden geriye doğru dört aday dönem
    const cands: { year: number; period: number }[] = [];
    let cy = y, cp = mo > 9 ? 9 : mo > 6 ? 6 : mo > 3 ? 3 : 12;
    if (cp === 12) cy = y - 1;
    for (let i = 0; i < 4; i++) {
      cands.push({ year: cy, period: cp });
      cp -= 3;
      if (cp === 0) { cp = 12; cy -= 1; }
    }
    const first = await callProvider("isyatirim", () => isyStatements(symbol, cands));
    const all: Statement[] = [...first];
    if (first.length) {
      const latest = first[0];
      const more = [
        { year: latest.year - 1, period: latest.period },
        { year: latest.year - 1, period: 12 },
        { year: latest.year - 2, period: 12 },
        { year: latest.year - 2, period: latest.period },
      ].filter((p) => !all.some((s) => s.year === p.year && s.period === p.period));
      if (more.length) all.push(...(await callProvider("isyatirim", () => isyStatements(symbol, more))));
    }
    for (const s of all) {
      await q(
        `INSERT INTO fundamentals (symbol, year, period, items, source, fetched_at) VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (symbol, year, period) DO UPDATE SET items=$4, source=$5, fetched_at=now()`,
        [symbol, s.year, s.period, JSON.stringify(s.items), "İş Yatırım (KAP finansal tabloları)"],
      );
    }
    if (!all.length) {
      // Boş yanıt da bir sonuçtur: gün içinde tekrar sorma.
      await q(
        `INSERT INTO fundamentals (symbol, year, period, items, source, fetched_at) VALUES ($1,0,0,'{}','İş Yatırım (KAP finansal tabloları)', now())
         ON CONFLICT (symbol, year, period) DO UPDATE SET fetched_at=now()`,
        [symbol],
      );
    }
  });
}

export async function getStatements(symbol: string): Promise<{ statements: Statement[]; source: string | null; fetchedAt: string | null }> {
  const rows = await q("SELECT * FROM fundamentals WHERE symbol=$1 ORDER BY year DESC, period DESC", [symbol]);
  const real = rows.filter((r) => r.year > 0);
  return {
    statements: real.map((r) => ({ year: r.year, period: r.period, items: r.items })),
    source: rows[0]?.source ?? null,
    fetchedAt: rows[0]?.fetched_at ?? null,
  };
}

// ---------- KAP ----------

export function refreshCatalog(force = false): Promise<RefreshResult> {
  return once("catalog", "kap", async () => {
    const [m] = await q("SELECT max(fetched_at) AS fetched, count(*)::int AS n FROM catalog WHERE type='stock'");
    if (!force && m?.n > 0 && ageMs(m.fetched) < 7 * 86400_000) return;
    const list = await callProvider("kap", kapCompanies);
    for (const c of list) {
      for (const s of c.symbols) {
        await q(
          `INSERT INTO catalog (symbol, type, name, kap_member_oid, source, fetched_at) VALUES ($1,'stock',$2,$3,$4, now())
           ON CONFLICT (symbol) DO UPDATE SET name=$2, kap_member_oid=$3, fetched_at=now()`,
          [s, c.name, c.oid, KAP_SOURCE],
        );
      }
    }
    await q(
      `UPDATE instruments i SET kap_member_oid=c.kap_member_oid, name=CASE WHEN i.name='' THEN c.name ELSE i.name END
       FROM catalog c WHERE c.symbol=i.symbol AND i.type='stock'`,
    );
  });
}

export function refreshDisclosures(symbol: string, force = false): Promise<RefreshResult> {
  return once(`disc:${symbol}`, "kap", async () => {
    const [m] = await q("SELECT value FROM settings WHERE key=$1", [`disc_fetched:${symbol}`]);
    if (!force && m && ageMs(m.value.at) < 30 * 60_000) return;
    let [inst] = await q("SELECT kap_member_oid FROM instruments WHERE symbol=$1", [symbol]);
    if (!inst?.kap_member_oid) {
      const r = await refreshCatalog();
      if (!r.ok) throw Object.assign(new Error(r.error), { provider: "kap" });
      [inst] = await q("SELECT kap_member_oid FROM catalog WHERE symbol=$1", [symbol]);
    }
    if (!inst?.kap_member_oid) throw new Error(`${symbol} KAP şirket listesinde bulunamadı`);
    const today = istDate();
    const list = await callProvider("kap", () => kapDisclosures(inst.kap_member_oid, addDays(today, -180), today));
    for (const d of list) {
      await q(
        `INSERT INTO disclosures (id, symbol, published_at, class, subject, summary, source, fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (id) DO UPDATE SET fetched_at=now()`,
        [d.id, symbol, d.publishedAt, d.class, d.subject, d.summary, KAP_SOURCE],
      );
    }
    await q(
      `INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [`disc_fetched:${symbol}`, JSON.stringify({ at: new Date().toISOString() })],
    );
  });
}

export interface DisclosureRow {
  id: number;
  symbol: string;
  published_at: string;
  class: string | null;
  subject: string | null;
  summary: string | null;
  fetched_at: string;
}
export async function getDisclosures(symbol: string, limit = 60): Promise<DisclosureRow[]> {
  return q<DisclosureRow>("SELECT * FROM disclosures WHERE symbol=$1 ORDER BY published_at DESC LIMIT $2", [symbol, limit]);
}
/** Borsa/MKK'nın rutin işlem duyuruları dışındaki, şirketin kendi açıklamaları */
export function isMaterial(d: Pick<DisclosureRow, "class">): boolean {
  return d.class !== "DKB";
}

// ---------- Makro ----------

async function saveFx(day: { date: string; rates: Record<string, number> }) {
  for (const [code, v] of Object.entries(day.rates)) {
    await q(
      `INSERT INTO macro (series, date, value, source, fetched_at) VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (series, date) DO UPDATE SET value=$3, fetched_at=now()`,
      [`${code}TRY`, day.date, v, TCMB_SOURCE],
    );
  }
}

export function refreshFx(force = false): Promise<RefreshResult> {
  return once("fx", "tcmb", async () => {
    const [m] = await q("SELECT max(fetched_at) AS fetched FROM macro WHERE series='USDTRY'");
    if (!force && m?.fetched && ageMs(m.fetched) < 3600_000) return;
    await saveFx(await callProvider("tcmb", tcmbToday));
  });
}

/** Geçmiş kurları doldurur (arka plan işi). Bülten olmayan günler atlanır. */
export function backfillFx(days = 45): Promise<RefreshResult> {
  return once("fx-backfill", "tcmb", async () => {
    const have = new Set((await q("SELECT date FROM macro WHERE series='USDTRY'")).map((r) => r.date));
    const today = istDate();
    for (let i = 1; i <= days; i++) {
      const d = addDays(today, -i);
      const wd = new Date(d + "T12:00:00Z").getUTCDay();
      if (have.has(d) || wd === 0 || wd === 6) continue;
      const day = await callProvider("tcmb", () => tcmbOn(d));
      if (day) await saveFx(day);
    }
  });
}

export function refreshEvds(force = false): Promise<RefreshResult> {
  return once("evds", "evds", async () => {
    if (!evdsEnabled()) return;
    const [m] = await q("SELECT max(fetched_at) AS fetched FROM macro WHERE series='BRENT'");
    if (!force && m?.fetched && ageMs(m.fetched) < 6 * 3600_000) return;
    const today = istDate();
    for (const [name, code] of Object.entries(EVDS_SERIES)) {
      const rows = await callProvider("evds", () => evdsSeries(code, addDays(today, -90), today));
      for (const r of rows) {
        await q(
          `INSERT INTO macro (series, date, value, source, fetched_at) VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (series, date) DO UPDATE SET value=$3, fetched_at=now()`,
          [name, r.date, r.value, EVDS_SOURCE],
        );
      }
    }
  });
}

export interface MacroPoint {
  series: string;
  date: string;
  value: number;
  source: string;
  fetched_at: string;
  change30d: number | null;
}
export async function getMacro(series: string): Promise<MacroPoint | null> {
  const rows = await q("SELECT * FROM macro WHERE series=$1 ORDER BY date DESC LIMIT 40", [series]);
  if (!rows.length) return null;
  const last = rows[0];
  const ref = rows.find((r) => r.date <= addDays(last.date, -28));
  return { ...last, change30d: ref ? (last.value / ref.value - 1) * 100 : null };
}

// ---------- Okuma ----------

export interface QuoteRow {
  symbol: string;
  price: number;
  prev_close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  market_cap: number | null;
  as_of: string;
  kind: "delayed" | "close";
  source: string;
  fetched_at: string;
}
export async function getQuote(symbol: string): Promise<QuoteRow | null> {
  const [r] = await q<QuoteRow>("SELECT * FROM quotes WHERE symbol=$1", [symbol]);
  return r ?? null;
}
export async function getQuotes(symbols: string[]): Promise<Map<string, QuoteRow>> {
  if (!symbols.length) return new Map();
  const rows = await q<QuoteRow>("SELECT * FROM quotes WHERE symbol = ANY($1)", [symbols]);
  return new Map(rows.map((r) => [r.symbol, r]));
}

export interface BarRow {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  raw_close: number | null;
  volume: number | null;
  source: string;
  provisional?: boolean;
}
export async function getBars(symbol: string, from?: string): Promise<BarRow[]> {
  return q<BarRow>(
    "SELECT date, open, high, low, close, raw_close, volume, source FROM price_bars WHERE symbol=$1 AND date >= $2 ORDER BY date",
    [symbol, from ?? "1900-01-01"],
  );
}

/** Gün içi/henüz seriye girmemiş günü fiyat kaydından ekler. */
export function withToday(bars: BarRow[], quote: QuoteRow | null): BarRow[] {
  if (!quote || !bars.length) return bars;
  const qd = istDate(new Date(quote.as_of));
  const last = bars[bars.length - 1];
  if (qd < last.date) return bars;
  const bar: BarRow = {
    date: qd, open: quote.open, high: quote.high ?? quote.price, low: quote.low ?? quote.price, close: quote.price,
    raw_close: quote.price, volume: quote.volume, source: quote.source, provisional: quote.kind !== "close",
  };
  if (qd === last.date) {
    // Seri kapanışı esas alınır; açılış yalnızca fiyat kaydında varsa tamamlanır.
    return [...bars.slice(0, -1), { ...last, open: last.open ?? quote.open }];
  }
  return [...bars, bar];
}

/**
 * Fiyat güncelliği: son yenileme başarısızsa veya fiyat 4 günden eskiyse
 * güncelliğe bağlı öneriler beklemeye alınır.
 */
export function isStale(quote: QuoteRow | null, refresh?: RefreshResult): boolean {
  if (!quote) return true;
  if (refresh && !refresh.ok) return true;
  return ageMs(quote.as_of) > 4 * 86400_000;
}

export interface SymbolRefresh {
  quote: RefreshResult;
  bars: RefreshResult;
  fundamentals?: RefreshResult;
  disclosures?: RefreshResult;
}

/** Bir enstrümanın tüm verisini (gerekiyorsa) yeniler. */
export async function refreshSymbol(inst: Instrument, opts: { deep?: boolean; force?: boolean } = {}): Promise<SymbolRefresh> {
  if (inst.type === "fund") {
    const r = await refreshFund(inst.symbol, opts.force);
    return { quote: r, bars: r };
  }
  const [quote, bars, fundamentals, disclosures] = await Promise.all([
    refreshQuote(inst, opts.force),
    refreshBars(inst, opts.force),
    opts.deep && inst.type === "stock" ? refreshFundamentals(inst.symbol, opts.force) : undefined,
    opts.deep && inst.type === "stock" ? refreshDisclosures(inst.symbol, opts.force) : undefined,
  ]);
  return { quote, bars, fundamentals, disclosures };
}

export async function providerStatuses() {
  return q("SELECT * FROM provider_status ORDER BY provider");
}
