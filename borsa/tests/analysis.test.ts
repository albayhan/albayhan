import { describe, expect, it } from "vitest";
import { atr, ema, macd, rsi, sma, supportResistance } from "@/lib/indicators";
import { analyzeShort } from "@/lib/analysis/short";
import { analyzeLong, computeMetrics } from "@/lib/analysis/long";
import { decide } from "@/lib/analysis/decision";
import { DEFAULT_SETTINGS, sanitizeSettings } from "@/lib/settings";
import { parseTcmbXml } from "@/lib/providers/tcmb";
import { backoffMs } from "@/lib/providers/status";
import { isStale, withToday, type BarRow, type QuoteRow } from "@/lib/data";

const mkBars = (closes: number[], start = "2026-01-01"): BarRow[] =>
  closes.map((c, i) => {
    const d = new Date(Date.parse(start + "T12:00:00Z") + i * 86400_000).toISOString().slice(0, 10);
    return { date: d, open: null, high: c * 1.01, low: c * 0.99, close: c, raw_close: c, volume: 1000, source: "test" };
  });

describe("göstergeler", () => {
  it("SMA ve EMA", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(ema([2, 4, 6, 8], 2)[3]).toBeCloseTo(7, 6);
  });
  it("RSI: Wilder örnek serisi", () => {
    // Wilder'ın kitabındaki klasik 14 günlük örnek
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
    const r = rsi(c, 14);
    expect(r[14]).toBeCloseTo(70.46, 1);
    expect(r[15]).toBeCloseTo(66.25, 1);
  });
  it("RSI sürekli yükselişte 100, MACD yükselişte pozitif", () => {
    const up = Array.from({ length: 60 }, (_, i) => 100 + i);
    expect(rsi(up).pop()).toBe(100);
    expect(macd(up).line.pop()!).toBeGreaterThan(0);
  });
  it("ATR ve destek/direnç", () => {
    const bars = mkBars(Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 8)));
    expect(atr(bars)!).toBeGreaterThan(0);
    const sr = supportResistance(bars, 100);
    expect(sr.supports[0].price).toBeLessThan(100);
    expect(sr.resistances[0].price).toBeGreaterThan(100);
  });
});

describe("kısa vade", () => {
  const args = { disclosures: [], settings: DEFAULT_SETTINGS, today: "2026-06-01" };
  it("az veride Veri yetersiz", () => {
    expect(analyzeShort({ ...args, bars: mkBars([1, 2, 3]), stale: false }).signal).toBe("veri_yetersiz");
  });
  it("fiyat giriş bandının üstündeyse R/Ö güncel fiyattan hesaplanır ve koşul sağlanmıyorsa Bekle", () => {
    // Yatay seyir, sonra sert sıçrama: fiyat 20 günlük ortalamanın çok üstünde
    const closes = [...Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3)), 104, 108, 112, 116, 120, 124, 128];
    const s = analyzeShort({ ...args, bars: mkBars(closes), stale: false });
    expect(s.price).toBeGreaterThan(s.entryBand![1]);
    expect(s.rrBasis).toBe("güncel fiyat");
    expect(s.entryRef).toBe(s.price);
    expect(s.rr).toBeCloseTo((s.target! - s.price) / (s.price - s.stop!), 9);
    if (s.rr! < s.minRR) {
      expect(s.conditionMet).toBe(false);
      expect(s.signal).toBe("bekle");
    }
  });
  it("düşüş eğiliminde alım sinyali üretmez", () => {
    const s = analyzeShort({ ...args, bars: mkBars(Array.from({ length: 120 }, (_, i) => 200 - i)), stale: false });
    expect(s.score).toBeLessThan(0);
    expect(s.signal).not.toBe("alim");
  });
  it("veri güncel değilse sinyal beklemeye alınır", () => {
    const up = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 2));
    expect(analyzeShort({ ...args, bars: mkBars(up), stale: true }).signal).toBe("bekle");
  });
  it("vade ayarı hedef mesafesini değiştirir", () => {
    const up = Array.from({ length: 260 }, (_, i) => 100 + i * 0.5);
    const a = analyzeShort({ ...args, bars: mkBars(up), stale: false });
    const b = analyzeShort({ ...args, settings: sanitizeSettings({ shortMaxWeeks: 2 }), bars: mkBars(up), stale: false });
    expect(b.target! - b.entryRef!).toBeLessThan(a.target! - a.entryRef!);
    expect(b.horizon).toBe("1–2 hafta");
  });
});

describe("uzun vade", () => {
  const st = (year: number, period: number, k: number) => ({
    year, period,
    items: { "3C": 1000 * k, "3D": 300 * k, "3DA": -50 * k, "3DB": -50 * k, "4B": 40 * k, "3Z": 120 * k, "4C": 200 * k, "4CB": 90 * k, "2AA": 100, "2BA": 200, "1AA": 150, "1AB": 50, "2O": 800, "1BL": 2000 },
  });
  it("son 12 ay = dönem + önceki yıl − önceki yılın aynı dönemi", () => {
    const m = computeMetrics([st(2026, 9, 0.9), st(2025, 9, 0.6), st(2025, 12, 0.8)], 2000)!;
    expect(m.revenueTTM).toBeCloseTo(900 + 800 - 600, 6);
    expect(m.revenueGrowthPct).toBeCloseTo(50, 6);
    expect(m.netDebt).toBe(100);
    expect(m.pe).toBeCloseTo(2000 / (108 + 96 - 72), 6);
  });
  it("üç senaryo üretir ve sıralar; finansal tablo yoksa Veri yetersiz", () => {
    const m = computeMetrics([st(2025, 12, 1)], 2000)!;
    const l = analyzeLong({ metrics: m, price: 20, peers: [], settings: DEFAULT_SETTINGS });
    expect(l.scenarios.map((s) => s.name)).toEqual(["Olumlu", "Baz", "Olumsuz"]);
    expect(l.scenarios[0].targetPrice).toBeGreaterThan(l.scenarios[1].targetPrice);
    expect(l.scenarios[1].targetPrice).toBeGreaterThan(l.scenarios[2].targetPrice);
    expect(l.thesisChangers.length).toBeGreaterThan(2);
    expect(analyzeLong({ metrics: null, price: 20, peers: [], settings: DEFAULT_SETTINGS }).view).toBe("veri_yetersiz");
  });
});

describe("karar", () => {
  const up = Array.from({ length: 260 }, (_, i) => 100 + i * 0.5);
  const short = analyzeShort({ bars: mkBars(up), stale: false, disclosures: [], settings: DEFAULT_SETTINGS, today: "2026-06-01" });
  const base = { short, long: null, cash: 10_000, totalValue: 100_000, settings: DEFAULT_SETTINGS, lastVerified: "100 ₺" };
  it("veri yoksa Veri yetersiz, güncel değilse Bekle", () => {
    expect(decide({ ...base, hasData: false, stale: true, position: null }).status).toBe("Veri yetersiz");
    const d = decide({ ...base, hasData: true, stale: true, position: null });
    expect(d.status).toBe("Bekle");
    expect(d.reason).toMatch(/güncel değil/);
  });
  it("ağırlık sınırı aşılırsa Azalt", () => {
    const d = decide({ ...base, hasData: true, stale: false, position: { qty: 100, avgCost: 100, weightPct: 40, plPct: 10 } });
    expect(d.status).toBe("Azalt");
    expect(d.reason).toMatch(/%25/);
  });
  it("her kararda neden, karşı sinyal ve değişim koşulu bulunur", () => {
    const d = decide({ ...base, hasData: true, stale: false, position: { qty: 10, avgCost: 100, weightPct: 5, plPct: 10 } });
    for (const k of ["reason", "counter", "changeCondition"] as const) expect(d[k].length).toBeGreaterThan(3);
  });
});

describe("sağlayıcı yardımcıları", () => {
  it("TCMB XML: birim başına kur", () => {
    const xml = `<Tarih_Date Tarih="12.11.2026" Date="11/12/2026"><Currency Kod="USD"><Unit>1</Unit><ForexBuying>50.1691</ForexBuying></Currency><Currency Kod="RUB"><Unit>100</Unit><ForexBuying>60.5</ForexBuying></Currency></Tarih_Date>`;
    const d = parseTcmbXml(xml);
    expect(d.date).toBe("2026-11-12");
    expect(d.rates.USD).toBe(50.1691);
    expect(d.rates.RUB).toBeCloseTo(0.605, 9);
    expect(() => parseTcmbXml("<html>hata</html>")).toThrow();
  });
  it("yeniden deneme aralığı 1 dakikadan 30 dakikaya kadar katlanır", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
  it("kesintide son değer güncel sayılmaz; gün içi mum fiyat kaydından eklenir", () => {
    const quote: QuoteRow = { symbol: "X", price: 12, prev_close: 11, open: 11.5, high: 12.5, low: 11, volume: 5, market_cap: null, as_of: new Date().toISOString(), kind: "delayed", source: "test", fetched_at: new Date().toISOString() };
    expect(isStale(quote, { ok: false, provider: "isyatirim", error: "x" })).toBe(true);
    expect(isStale(quote, { ok: true, provider: "isyatirim" })).toBe(false);
    expect(isStale({ ...quote, as_of: new Date(Date.now() - 6 * 86400_000).toISOString() })).toBe(true);
    expect(isStale(null)).toBe(true);
    const bars = withToday(mkBars([10, 11], "2020-01-01"), quote);
    expect(bars).toHaveLength(3);
    expect(bars[2]).toMatchObject({ open: 11.5, close: 12, provisional: true });
  });
});
