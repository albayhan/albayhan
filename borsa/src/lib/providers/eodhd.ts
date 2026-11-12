import { httpJson } from "../http";
import { istDate } from "../time";
import type { Bar, Quote } from "./types";

/** EODHD — lisanslı, anahtarlı API. PRICE_PROVIDER=eodhd ve EODHD_API_KEY ile etkinleşir. */
const BASE = () => process.env.EODHD_BASE_URL || "https://eodhd.com";
export const EODHD_SOURCE = "EODHD";
export const eodhdEnabled = () => process.env.PRICE_PROVIDER === "eodhd" && !!process.env.EODHD_API_KEY;
const ticker = (symbol: string) => (symbol.includes(".") ? symbol : `${symbol}.${process.env.EODHD_EXCHANGE ?? "IS"}`);

export async function eodhdHistory(symbol: string, from: string, to: string): Promise<Bar[]> {
  const arr = await httpJson<any[]>(
    `${BASE()}/api/eod/${ticker(symbol)}?api_token=${process.env.EODHD_API_KEY}&fmt=json&from=${from}&to=${to}`,
    { timeoutMs: 40000 },
  );
  if (!Array.isArray(arr)) throw new Error("EODHD: günlük seri okunamadı");
  return arr
    .filter((r) => r.close > 0)
    .map((r): Bar => {
      // Düzeltme katsayısı kapanıştan türetilir; mum gövdesi de aynı oranda düzeltilir.
      const f = r.adjusted_close && r.close ? r.adjusted_close / r.close : 1;
      return {
        date: r.date, open: r.open ? r.open * f : null, high: r.high * f, low: r.low * f,
        close: r.close * f, rawClose: r.close, volume: r.volume ?? null, source: EODHD_SOURCE,
      };
    });
}

export async function eodhdQuote(symbol: string): Promise<Quote> {
  const r = await httpJson<any>(`${BASE()}/api/real-time/${ticker(symbol)}?api_token=${process.env.EODHD_API_KEY}&fmt=json`);
  if (typeof r?.close !== "number" || !r.timestamp) throw new Error(`EODHD: ${symbol} için fiyat bulunamadı`);
  const asOf = new Date(r.timestamp * 1000);
  return {
    symbol, price: r.close, prevClose: r.previousClose ?? null, open: r.open || null, high: r.high || null, low: r.low || null,
    volume: null, marketCap: null, asOf: asOf.toISOString(),
    kind: istDate(asOf) === istDate() && Date.now() - asOf.getTime() < 40 * 60000 ? "delayed" : "close",
    source: EODHD_SOURCE,
  };
}
