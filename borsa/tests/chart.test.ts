import { describe, expect, it } from "vitest";
import { analogOdds, analyzeChart, detectPatterns, nextBusinessDays, regressionChannel, volCone } from "@/lib/chartAnalysis";
import type { BarRow } from "@/lib/data";

const mk = (closes: number[]): BarRow[] =>
  closes.map((c, i) => ({
    date: new Date(Date.parse("2023-01-02T12:00:00Z") + i * 86400_000).toISOString().slice(0, 10),
    open: null, high: c * 1.01, low: c * 0.99, close: c, raw_close: c, volume: 1000, source: "test",
  }));

describe("grafik analizi", () => {
  it("iş günleri hafta sonunu atlar", () => {
    expect(nextBusinessDays("2026-11-13", 3)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]); // Cuma → Pzt, Sal, Çar
  });

  it("regresyon kanalı üstel büyümenin eğimini bulur", () => {
    const ch = regressionChannel(mk(Array.from({ length: 80 }, (_, i) => 100 * Math.exp(0.01 * i))), 60, 5)!;
    expect(ch.slopePctMonth).toBeCloseTo((Math.exp(0.21) - 1) * 100, 1);
    expect(ch.r2).toBeGreaterThan(0.99);
    expect(ch.line.length).toBe(65);
    expect(ch.lower).toBeLessThanOrEqual(ch.mid);
    expect(ch.upper).toBeGreaterThanOrEqual(ch.mid);
  });

  it("oynaklık konisi fiyatı ortalar, ufuk büyüdükçe genişler", () => {
    const bars = mk(Array.from({ length: 100 }, (_, i) => 100 * (1 + 0.02 * Math.sin(i))));
    const { cones } = volCone(bars, [5, 20]);
    const p = bars[bars.length - 1].close;
    expect(cones[0].low68).toBeLessThan(p);
    expect(cones[0].high68).toBeGreaterThan(p);
    expect(cones[1].high68 - cones[1].low68).toBeGreaterThan(cones[0].high68 - cones[0].low68);
    expect(cones[1].high95).toBeGreaterThan(cones[1].high68);
  });

  it("altın kesişimi yakalar", () => {
    // Uzun düşüş, ardından güçlü yükseliş: 50g, 200g'yi yukarı keser
    const closes = [...Array.from({ length: 260 }, (_, i) => 200 - i * 0.4), ...Array.from({ length: 120 }, (_, i) => 96 + i * 1.6)];
    let found = false;
    for (let end = 300; end <= closes.length; end++) {
      if (detectPatterns(mk(closes.slice(0, end))).some((p) => p.key === "golden")) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it("benzer durum olasılıkları tutarlıdır", () => {
    const closes = Array.from({ length: 700 }, (_, i) => 100 * Math.exp(i * 0.001) * (1 + 0.05 * Math.sin(i / 11)));
    const o = analogOdds(mk(closes), [10, 40]);
    expect(o).toHaveLength(2);
    for (const x of o) {
      expect(x.baseUpPct!).toBeGreaterThanOrEqual(0);
      expect(x.baseUpPct!).toBeLessThanOrEqual(100);
      if (x.upPct !== null) expect(x.p25!).toBeLessThanOrEqual(x.p75!);
    }
  });

  it("istikrarlı yükselişte yön yukarı, düşüşte aşağı", () => {
    const up = analyzeChart(mk(Array.from({ length: 400 }, (_, i) => 100 * Math.exp(i * 0.003) * (1 + 0.01 * Math.sin(i / 3)))));
    const down = analyzeChart(mk(Array.from({ length: 400 }, (_, i) => 100 * Math.exp(-i * 0.003) * (1 + 0.01 * Math.sin(i / 3)))));
    expect(up.midOutlook!.dir).toBe("yukari");
    expect(down.midOutlook!.dir).toBe("asagi");
    expect(up.projection.length).toBe(21);
    expect(up.scenarios).toHaveLength(2);
  });

  it("kısa veride analiz yapmaz", () => {
    expect(analyzeChart(mk(Array.from({ length: 50 }, () => 10))).ok).toBe(false);
  });
});
