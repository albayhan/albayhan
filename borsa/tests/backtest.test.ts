import { describe, expect, it } from "vitest";
import { backtestShort } from "@/lib/backtest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { BarRow } from "@/lib/data";

const mk = (closes: number[]): BarRow[] =>
  closes.map((c, i) => ({
    date: new Date(Date.parse("2023-01-02T12:00:00Z") + i * 86400_000).toISOString().slice(0, 10),
    open: null, high: c * 1.01, low: c * 0.99, close: c, raw_close: c, volume: 1000 + (i % 7) * 50, source: "test",
  }));

describe("geçmiş test", () => {
  it("kısa veride çalışmaz", () => {
    const r = backtestShort(mk(Array.from({ length: 100 }, (_, i) => 100 + i)), DEFAULT_SETTINGS);
    expect(r.ok).toBe(false);
  });

  it("dalgalı yükselişte işlem üretir, sonuçlar tutarlıdır", () => {
    const closes = Array.from({ length: 700 }, (_, i) => 100 * Math.exp(i * 0.002) * (1 + 0.03 * Math.sin(i / 6)));
    const r = backtestShort(mk(closes), { ...DEFAULT_SETTINGS, risk: "atak" });
    expect(r.ok).toBe(true);
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.exitDate >= t.entryDate).toBe(true);
      expect(t.days).toBeLessThanOrEqual(r.maxHoldDays);
      expect(t.retPct).toBeCloseTo((t.exitPrice / t.entryPrice - 1) * 100, 6);
    }
    // İşlemler çakışmaz
    for (let i = 1; i < r.trades.length; i++) expect(r.trades[i].entryDate > r.trades[i - 1].exitDate).toBe(true);
    if (r.winRatePct !== null) {
      expect(r.winRatePct).toBeGreaterThanOrEqual(0);
      expect(r.winRatePct).toBeLessThanOrEqual(100);
    }
  });

  it("sürekli düşüşte AL sinyali vermez", () => {
    const closes = Array.from({ length: 600 }, (_, i) => 200 * Math.exp(-i * 0.002));
    const r = backtestShort(mk(closes), DEFAULT_SETTINGS);
    expect(r.ok).toBe(true);
    expect(r.trades.length).toBe(0);
    expect(r.buyHoldPct!).toBeLessThan(0);
  });
});
