import { q } from "./db";
import { getBars, getQuote, refreshBars, refreshQuote } from "./data";
import { getLastScan, type ScanRow } from "./scan";
import { addDays, istDate } from "./time";

/** Tarama listesindeki hisselerin sektörleri (BIST sektör sınıflamasına yakın, sadeleştirilmiş). */
export const SECTORS: Record<string, string> = {
  AKBNK: "Bankacılık", GARAN: "Bankacılık", ISCTR: "Bankacılık", YKBNK: "Bankacılık",
  KCHOL: "Holding", SAHOL: "Holding", ALARK: "Holding",
  THYAO: "Ulaştırma", PGSUS: "Ulaştırma", TAVHL: "Ulaştırma",
  FROTO: "Otomotiv", TOASO: "Otomotiv",
  TUPRS: "Enerji ve Petrokimya", PETKM: "Enerji ve Petrokimya", ASTOR: "Enerji ve Petrokimya",
  EREGL: "Demir-Çelik", KRDMD: "Demir-Çelik",
  BIMAS: "Perakende ve Gıda", MGROS: "Perakende ve Gıda", AEFES: "Perakende ve Gıda",
  TCELL: "Telekom ve Savunma", TTKOM: "Telekom ve Savunma", ASELS: "Telekom ve Savunma",
  SISE: "Sanayi ve Kimya", SASA: "Sanayi ve Kimya", HEKTS: "Sanayi ve Kimya", ARCLK: "Sanayi ve Kimya", OYAKC: "Sanayi ve Kimya",
  ENKAI: "İnşaat ve GYO", EKGYO: "İnşaat ve GYO",
};
export const sectorOf = (s: string) => SECTORS[s] ?? "Diğer";

export interface Tick { label: string; value: string; changePct: number | null; href?: string }

export interface FxSeries { code: string; value: number; date: string; changePct: number | null; change30d: number | null; spark: number[]; source: string }

export async function fxSeries(codes = ["USD", "EUR", "GBP"]): Promise<FxSeries[]> {
  const out: FxSeries[] = [];
  for (const c of codes) {
    const rows = await q("SELECT date, value, source FROM macro WHERE series=$1 ORDER BY date DESC LIMIT 60", [`${c}TRY`]);
    if (!rows.length) continue;
    const last = rows[0], prev = rows[1];
    const ref = rows.find((r) => r.date <= addDays(last.date, -28));
    out.push({
      code: c, value: last.value, date: last.date, source: last.source,
      changePct: prev ? (last.value / prev.value - 1) * 100 : null,
      change30d: ref ? (last.value / ref.value - 1) * 100 : null,
      spark: rows.map((r) => r.value).reverse(),
    });
  }
  return out;
}

export interface IndexCard { symbol: string; name: string; price: number; changePct: number | null; asOf: string; ret1m: number | null; ret1y: number | null; spark: number[]; source: string }

export async function indexCard(): Promise<IndexCard | null> {
  await Promise.all([refreshQuote({ symbol: "XU100", type: "index" }), refreshBars({ symbol: "XU100", type: "index" })]);
  const [qt, bars] = await Promise.all([getQuote("XU100"), getBars("XU100", addDays(istDate(), -400))]);
  if (!qt) return null;
  const closes = bars.map((b) => b.close);
  const r = (n: number) => (closes.length > n ? (qt.price / closes[closes.length - 1 - n] - 1) * 100 : null);
  return {
    symbol: "XU100", name: "BIST 100", price: qt.price, asOf: qt.as_of, source: qt.source,
    changePct: qt.prev_close ? (qt.price / qt.prev_close - 1) * 100 : null,
    ret1m: r(21), ret1y: r(252), spark: closes.slice(-90),
  };
}

/** Kayan şerit verisi: yalnızca veritabanındaki son değerler (ağ isteği yapmaz). */
export async function tickerItems(): Promise<Tick[]> {
  const items: Tick[] = [];
  const xu = await getQuote("XU100");
  if (xu) items.push({ label: "BIST 100", value: xu.price.toLocaleString("tr-TR", { maximumFractionDigits: 0 }), changePct: xu.prev_close ? (xu.price / xu.prev_close - 1) * 100 : null, href: "/piyasa" });
  for (const f of await fxSeries(["USD", "EUR", "GBP"])) items.push({ label: `${f.code}/TRY`, value: f.value.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }), changePct: f.changePct, href: "/piyasa" });
  const scan = await getLastScan();
  const rows = (scan?.rows ?? []).filter((r) => r.price !== null && r.changePct !== null);
  rows.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  for (const r of rows) items.push({ label: r.symbol, value: r.price!.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), changePct: r.changePct, href: `/hisse/${r.symbol}` });
  return items;
}

export interface FeedItem { id: number; symbol: string; name: string; published_at: string; subject: string | null; title: string }

export async function kapFeed(limit = 25): Promise<FeedItem[]> {
  const rows = await q(
    `SELECT d.id, d.symbol, coalesce(i.name, d.symbol) AS name, d.published_at, d.subject, d.summary
     FROM disclosures d LEFT JOIN instruments i ON i.symbol=d.symbol
     WHERE coalesce(d.class,'') <> 'DKB' AND d.published_at > now() - interval '30 days'
     ORDER BY d.published_at DESC LIMIT $1`, [limit],
  );
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, name: r.name, published_at: r.published_at, subject: r.subject, title: ((r.summary ?? "").split("\n")[0] || r.subject || "KAP bildirimi").trim() }));
}

export type Period = "gun" | "ay" | "3ay" | "yil";
export const PERIODS: { k: Period; label: string; get: (r: ScanRow) => number | null }[] = [
  { k: "gun", label: "Bugün", get: (r) => r.changePct },
  { k: "ay", label: "1 ay", get: (r) => r.ret1m },
  { k: "3ay", label: "3 ay", get: (r) => r.ret3m },
  { k: "yil", label: "1 yıl", get: (r) => r.ret1y },
];

/** Değişim yüzdesini ısı haritası rengine çevirir (kırmızı → gri → yeşil). */
export function heatColor(v: number | null, scale: number): string {
  if (v === null) return "#64748b";
  const t = Math.max(-1, Math.min(1, v / scale));
  const a = Math.abs(t);
  // 0'da nötr gri, uçlarda doygun renk
  const [r0, g0, b0] = [71, 85, 105];
  const [r1, g1, b1] = t >= 0 ? [5, 150, 105] : [220, 38, 38];
  const mix = (x: number, y: number) => Math.round(x + (y - x) * Math.pow(a, 0.7));
  return `rgb(${mix(r0, r1)},${mix(g0, g1)},${mix(b0, b1)})`;
}

export interface CompareSeries { symbol: string; name: string; points: { time: string; value: number }[]; retPct: number | null; volPct: number | null; maxDdPct: number | null; last: number | null }

/** Seçilen dönemde normalize getiri (%), yıllık oynaklık ve en büyük düşüş. */
export function compareStats(symbol: string, name: string, bars: { date: string; close: number }[], from: string): CompareSeries {
  const b = bars.filter((x) => x.date >= from);
  if (b.length < 2) return { symbol, name, points: [], retPct: null, volPct: null, maxDdPct: null, last: null };
  const base = b[0].close;
  const points = b.map((x) => ({ time: x.date, value: (x.close / base - 1) * 100 }));
  const rets = b.slice(1).map((x, i) => Math.log(x.close / b[i].close));
  const mean = rets.reduce((a, c) => a + c, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, c) => a + (c - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  let peak = -Infinity, dd = 0;
  for (const x of b) { peak = Math.max(peak, x.close); dd = Math.min(dd, x.close / peak - 1); }
  return { symbol, name, points, retPct: points[points.length - 1].value, volPct: sd * Math.sqrt(252) * 100, maxDdPct: dd * 100, last: b[b.length - 1].close };
}

/** Hisse kayıtlı değilse KAP listesinden (izleme listesine eklemeden) kaydeder. */
export async function ensureStock(symbol: string): Promise<boolean> {
  const s = symbol.toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(s)) return false;
  const [i] = await q("SELECT symbol FROM instruments WHERE symbol=$1", [s]);
  if (i) return true;
  const { refreshCatalog } = await import("./data");
  await refreshCatalog();
  const [c] = await q("SELECT name, kap_member_oid FROM catalog WHERE symbol=$1", [s]);
  if (!c) return false;
  await q("INSERT INTO instruments (symbol, type, name, kap_member_oid, in_watchlist) VALUES ($1,'stock',$2,$3,FALSE) ON CONFLICT DO NOTHING", [s, c.name, c.kap_member_oid]);
  return true;
}
