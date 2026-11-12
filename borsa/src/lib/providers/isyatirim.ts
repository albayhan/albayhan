import { httpJson } from "../http";
import { istDate, istClock, addDays } from "../time";
import type { Bar, Quote, Statement } from "./types";

const BASE = () => process.env.ISYATIRIM_BASE_URL || "https://www.isyatirim.com.tr";
export const ISY_SOURCE = "İş Yatırım";

const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

export async function isyQuote(symbol: string): Promise<Quote> {
  const arr = await httpJson<any[]>(`${BASE()}/_layouts/15/Isyatirim.Website/Common/Data.aspx/OneEndeks?endeks=${encodeURIComponent(symbol)}`);
  const r = Array.isArray(arr) ? arr[0] : null;
  if (!r || typeof r.last !== "number" || !r.updateDate) throw new Error(`İş Yatırım: ${symbol} için fiyat bulunamadı`);
  // Örn. "2026-11-12T16:28:52.000+03" — saat dilimi dakikasız gelir
  const asOf = new Date(String(r.updateDate).replace(/([+-]\d{2})$/, "$1:00"));
  if (isNaN(asOf.getTime())) throw new Error(`İş Yatırım: ${symbol} fiyat zamanı okunamadı (${r.updateDate})`);
  const now = new Date();
  // Seans içindeyse 15 dk gecikmeli; seans bittiyse veya eski tarihliyse kapanış.
  const sameDay = istDate(asOf) === istDate(now);
  const sessionOver = istClock(now).minutes >= 18 * 60 + 25 || istClock(asOf).minutes >= 18 * 60 + 5;
  const kind = sameDay && !sessionOver ? "delayed" : "close";
  return {
    symbol,
    price: r.last,
    prevClose: num(r.dayClose),
    open: num(r.open) || null,
    high: num(r.high) || null,
    low: num(r.low) || null,
    volume: num(r.volume),
    marketCap: r.capital ? r.capital * r.last : null,
    asOf: asOf.toISOString(),
    kind,
    source: ISY_SOURCE,
  };
}

function num(v: any): number | null {
  const n = typeof v === "number" ? v : v === null || v === undefined || v === "" ? NaN : Number(v);
  return isFinite(n) ? n : null;
}

/** Günlük seri. Kapanış/yüksek/düşük temettü ve bölünmeye göre düzeltilmiştir; açılış bu kaynakta yoktur. */
export async function isyHistory(symbol: string, from: string, to: string): Promise<Bar[]> {
  const j = await httpJson<any>(
    `${BASE()}/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?hisse=${encodeURIComponent(symbol)}&startdate=${dmy(from)}&enddate=${dmy(to)}`,
    { timeoutMs: 40000 },
  );
  if (!j?.ok || !Array.isArray(j.value)) throw new Error(`İş Yatırım: ${symbol} günlük serisi alınamadı`);
  return j.value
    .filter((r: any) => num(r.HGDG_KAPANIS))
    .map((r: any): Bar => {
      const [d, m, y] = String(r.HGDG_TARIH).split("-");
      return {
        date: `${y}-${m}-${d}`,
        open: null,
        high: num(r.HGDG_MAX),
        low: num(r.HGDG_MIN),
        close: r.HGDG_KAPANIS,
        rawClose: num(r.HG_KAPANIS),
        volume: num(r.HGDG_HACIM),
        source: ISY_SOURCE,
      };
    });
}

/** Endeks günlük kapanış serisi (yalnızca kapanış). */
export async function isyIndexHistory(symbol: string, from: string, to: string): Promise<Bar[]> {
  const c = (d: string) => d.replace(/-/g, "");
  const j = await httpJson<any>(
    `${BASE()}/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll?period=1440&from=${c(from)}000000&to=${c(to)}235959&endeks=${encodeURIComponent(symbol)}`,
    { timeoutMs: 40000 },
  );
  if (!Array.isArray(j?.data)) throw new Error(`İş Yatırım: ${symbol} endeks serisi alınamadı`);
  return j.data.map(([ts, v]: [number, number]): Bar => ({
    date: istDate(new Date(ts)), open: null, high: null, low: null, close: v, rawClose: v, volume: null, source: ISY_SOURCE,
  }));
}

/** KAP'a bildirilen finansal tablolar (kümülatif dönemler). En çok 4 dönem. */
export async function isyStatements(symbol: string, periods: { year: number; period: number }[]): Promise<Statement[]> {
  const p = periods.slice(0, 4);
  while (p.length < 4) p.push(p[p.length - 1]);
  const qs = p.map((x, i) => `year${i + 1}=${x.year}&period${i + 1}=${x.period}`).join("&");
  let rows: any[] = [];
  for (const group of ["XI_29", "UFRS_K"]) {
    const j = await httpJson<any>(
      `${BASE()}/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=${encodeURIComponent(symbol)}&exchange=TRY&financialGroup=${group}&${qs}`,
      { timeoutMs: 30000 },
    );
    rows = Array.isArray(j?.value) ? j.value : [];
    if (rows.length) break;
  }
  const out: Statement[] = [];
  periods.slice(0, 4).forEach((x, i) => {
    const items: Record<string, number> = {};
    for (const r of rows) {
      const n = num(r[`value${i + 1}`]);
      if (n !== null) items[r.itemCode] = n;
    }
    // Dönem henüz açıklanmadıysa tüm değerler boş gelir.
    if (Object.keys(items).length > 10 && (items["1BL"] || items["2ODB"])) out.push({ year: x.year, period: x.period, items });
  });
  return out;
}

export function historyStart(years = 3): string {
  return addDays(istDate(), -365 * years);
}
