import { describe, expect, it } from "vitest";
import { computeLedger, computePerformance, validateTx, type Tx } from "@/lib/portfolio";

let id = 0;
const tx = (t: Partial<Tx> & Pick<Tx, "date" | "type">): Tx => ({ id: ++id, symbol: null, quantity: null, price: null, fee: 0, amount: null, ...t });

describe("ortalama maliyet ve kâr/zarar", () => {
  const txs = [
    tx({ date: "2026-01-02", type: "DEPOSIT", amount: 100_000 }),
    tx({ date: "2026-01-05", type: "BUY", symbol: "THYAO", quantity: 100, price: 200, fee: 20 }),
    tx({ date: "2026-02-05", type: "BUY", symbol: "THYAO", quantity: 100, price: 300, fee: 30 }),
    tx({ date: "2026-03-05", type: "SELL", symbol: "THYAO", quantity: 50, price: 320, fee: 16 }),
    tx({ date: "2026-04-01", type: "DIVIDEND", symbol: "THYAO", amount: 450 }),
  ];
  const l = computeLedger(txs);
  const p = l.positions.get("THYAO")!;

  it("alışlarda komisyon maliyete eklenir", () => {
    // (100×200 + 20 + 100×300 + 30) / 200 = 250,25
    expect(p.avgCost).toBeCloseTo(250.25, 6);
  });
  it("satış ortalama maliyeti değiştirmez, gerçekleşen kârı komisyon sonrası hesaplar", () => {
    expect(p.qty).toBe(150);
    expect(p.cost).toBeCloseTo(150 * 250.25, 6);
    // 50×320 − 16 − 50×250,25 = 3.471,50
    expect(p.realized).toBeCloseTo(3471.5, 6);
  });
  it("temettü nakde ve gelire yazılır, maliyeti değiştirmez", () => {
    expect(p.dividends).toBe(450);
    expect(p.avgCost).toBeCloseTo(250.25, 6);
  });
  it("nakit tüm hareketleri izler", () => {
    // 100.000 − 20.020 − 30.030 + 15.984 + 450
    expect(l.cash).toBeCloseTo(66_384, 6);
    expect(l.deposits).toBe(100_000);
    expect(l.implicitDeposits).toBe(0);
  });
});

describe("sermaye işlemleri", () => {
  it("bedelsiz/bölünme adedi çarpar, toplam maliyeti korur", () => {
    const l = computeLedger([
      tx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 100, price: 50 }),
      tx({ date: "2026-02-01", type: "SPLIT", symbol: "X", quantity: 2 }),
    ]);
    const p = l.positions.get("X")!;
    expect(p.qty).toBe(200);
    expect(p.cost).toBe(5000);
    expect(p.avgCost).toBe(25);
  });
  it("bedelli, rüçhan fiyatından alış gibi maliyete girer", () => {
    const l = computeLedger([
      tx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 100, price: 50 }),
      tx({ date: "2026-02-01", type: "RIGHTS", symbol: "X", quantity: 50, price: 10 }),
    ]);
    expect(l.positions.get("X")!.avgCost).toBeCloseTo(5500 / 150, 6);
  });
  it("eldekinden fazla satış uyarı üretir", () => {
    const l = computeLedger([
      tx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 10, price: 5 }),
      tx({ date: "2026-01-06", type: "SELL", symbol: "X", quantity: 11, price: 5 }),
    ]);
    expect(l.warnings).toHaveLength(1);
  });
  it("nakit kaydı yoksa alış örtük para girişi sayılır", () => {
    const l = computeLedger([tx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 10, price: 5, fee: 1 })]);
    expect(l.cash).toBe(0);
    expect(l.implicitDeposits).toBe(51);
  });
});

describe("zaman ağırlıklı getiri", () => {
  const prices: Record<string, number> = { "2026-01-05": 100, "2026-01-06": 110, "2026-01-07": 110, "2026-01-08": 121 };
  const dates = Object.keys(prices);
  const priceOn = (_s: string, d: string) => prices[d] ?? null;
  const benchOn = (d: string) => ({ "2026-01-05": 1000, "2026-01-06": 1050, "2026-01-07": 1050, "2026-01-08": 1100 } as Record<string, number>)[d] ?? null;

  it("para yatırma getiriyi değiştirmez", () => {
    const base = [
      tx({ date: "2026-01-05", type: "DEPOSIT", amount: 1000 }),
      tx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 10, price: 100 }),
    ];
    const a = computePerformance(base, dates, priceOn, benchOn);
    const b = computePerformance([...base, tx({ date: "2026-01-07", type: "DEPOSIT", amount: 50_000 })], dates, priceOn, benchOn);
    // Hisse %21 arttı; ilk durumda portföyün tamamı hissede
    expect(a[a.length - 1].twr).toBeCloseTo(121, 6);
    // İkinci durumda büyük para girişi var: değer sıçrar ama o günkü getiri 0 kalır
    expect(b[2].value).toBeCloseTo(51_100, 6);
    expect(b[2].twr).toBeCloseTo(b[1].twr, 6);
    expect(b[b.length - 1].twr).toBeLessThan(121);
    expect(b[b.length - 1].twr).toBeGreaterThan(110);
  });
  it("para çekme getiriyi değiştirmez ve karşılaştırma endeksi aynı günden başlar", () => {
    const pts = computePerformance([
      tx({ date: "2026-01-05", type: "DEPOSIT", amount: 2000 }),
      tx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 10, price: 100 }),
      tx({ date: "2026-01-07", type: "WITHDRAW", amount: 1000 }),
    ], dates, priceOn, benchOn);
    expect(pts[0].bench).toBe(100);
    expect(pts[pts.length - 1].bench).toBeCloseTo(110, 6);
    // 1. gün 2000 → 2. gün 2100 (+%5) → 3. gün 1100 (çekim, %0) → 4. gün 1210 (+%10)
    expect(pts[pts.length - 1].twr).toBeCloseTo(100 * 1.05 * 1.1, 6);
    expect(pts[2].flow).toBe(-1000);
  });
});

describe("işlem doğrulama", () => {
  it("eksik alanları reddeder", () => {
    expect(validateTx({ date: "2026-01-05", type: "BUY", symbol: "X", quantity: 0, price: 5, fee: 0, amount: null })).toMatch(/Adet/);
    expect(validateTx({ date: "2026-01-05", type: "DEPOSIT", symbol: null, quantity: null, price: null, fee: 0, amount: null })).toMatch(/Tutar/);
    expect(validateTx({ date: "05.01.2026", type: "DEPOSIT", symbol: null, quantity: null, price: null, fee: 0, amount: 5 })).toMatch(/Tarih/);
    expect(validateTx({ date: "2026-01-05", type: "DIVIDEND", symbol: "X", quantity: null, price: null, fee: 0, amount: 5 })).toBeNull();
  });
});
