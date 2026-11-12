export type TxType = "BUY" | "SELL" | "DIVIDEND" | "SPLIT" | "RIGHTS" | "DEPOSIT" | "WITHDRAW";

export interface Tx {
  id: number;
  date: string; // YYYY-AA-GG
  type: TxType;
  symbol: string | null;
  quantity: number | null; // SPLIT için çarpan (ör. %100 bedelsiz → 2)
  price: number | null;
  fee: number;
  amount: number | null; // DIVIDEND / DEPOSIT / WITHDRAW net tutarı
  note?: string | null;
}

export const TX_LABELS: Record<TxType, string> = {
  BUY: "Alış", SELL: "Satış", DIVIDEND: "Temettü", SPLIT: "Bedelsiz / Bölünme", RIGHTS: "Bedelli", DEPOSIT: "Para yatırma", WITHDRAW: "Para çekme",
};

export interface Position {
  symbol: string;
  qty: number;
  cost: number; // toplam maliyet (komisyon dahil)
  avgCost: number;
  realized: number; // satışlardan gerçekleşen K/Z (komisyon sonrası)
  dividends: number;
  fees: number;
}

export interface Ledger {
  positions: Map<string, Position>;
  cash: number;
  deposits: number; // kaydedilen para yatırma − çekme
  implicitDeposits: number; // nakit yetmediğinde varsayılan dış para girişi
  realized: number;
  dividends: number;
  fees: number;
  warnings: string[];
}

export function sortTxs<T extends Pick<Tx, "date" | "id">>(txs: T[]): T[] {
  return [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

export function validateTx(t: Omit<Tx, "id">): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || isNaN(Date.parse(t.date))) return "Tarih geçersiz";
  const pos = (v: number | null) => v !== null && isFinite(v) && v > 0;
  if (!isFinite(t.fee) || t.fee < 0) return "Komisyon negatif olamaz";
  switch (t.type) {
    case "BUY": case "SELL": case "RIGHTS":
      if (!t.symbol) return "Sembol gerekli";
      if (!pos(t.quantity)) return "Adet pozitif olmalı";
      if (!pos(t.price)) return "Fiyat pozitif olmalı";
      return null;
    case "SPLIT":
      if (!t.symbol) return "Sembol gerekli";
      if (!pos(t.quantity)) return "Çarpan pozitif olmalı (ör. %100 bedelsiz için 2)";
      return null;
    case "DIVIDEND":
      if (!t.symbol) return "Sembol gerekli";
      if (!pos(t.amount)) return "Net temettü tutarı pozitif olmalı";
      return null;
    case "DEPOSIT": case "WITHDRAW":
      if (!pos(t.amount)) return "Tutar pozitif olmalı";
      return null;
    default:
      return "İşlem türü geçersiz";
  }
}

function emptyLedger(): Ledger {
  return { positions: new Map(), cash: 0, deposits: 0, implicitDeposits: 0, realized: 0, dividends: 0, fees: 0, warnings: [] };
}

function pos(l: Ledger, symbol: string): Position {
  let p = l.positions.get(symbol);
  if (!p) {
    p = { symbol, qty: 0, cost: 0, avgCost: 0, realized: 0, dividends: 0, fees: 0 };
    l.positions.set(symbol, p);
  }
  return p;
}

/**
 * Tek işlemi deftere uygular (ağırlıklı ortalama maliyet yöntemi).
 * Dönen değer: o işlemin yarattığı dış nakit akışı (para yatırma +, çekme −, örtük giriş +).
 */
export function applyTx(l: Ledger, t: Tx): number {
  let flow = 0;
  const spend = (amt: number) => {
    l.cash -= amt;
    if (l.cash < -1e-9) {
      // Nakit kaydı eksik: alışın dışarıdan finanse edildiği varsayılır, getiri hesabını bozmaz.
      flow += -l.cash;
      l.implicitDeposits += -l.cash;
      l.cash = 0;
    }
  };
  switch (t.type) {
    case "BUY": case "RIGHTS": {
      const p = pos(l, t.symbol!);
      const gross = t.quantity! * t.price! + t.fee;
      p.qty += t.quantity!;
      p.cost += gross;
      p.fees += t.fee;
      l.fees += t.fee;
      spend(gross);
      break;
    }
    case "SELL": {
      const p = pos(l, t.symbol!);
      let qty = t.quantity!;
      if (qty > p.qty + 1e-9) {
        l.warnings.push(`${t.date} ${t.symbol}: satış adedi (${qty}) eldeki adetten (${p.qty}) fazla; eldeki kadar işlendi.`);
        qty = p.qty;
      }
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      const net = qty * t.price! - t.fee;
      const pl = net - avg * qty;
      p.qty -= qty;
      p.cost -= avg * qty;
      if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
      p.realized += pl;
      p.fees += t.fee;
      l.realized += pl;
      l.fees += t.fee;
      l.cash += net;
      break;
    }
    case "DIVIDEND": {
      const p = pos(l, t.symbol!);
      p.dividends += t.amount!;
      l.dividends += t.amount!;
      l.cash += t.amount!;
      break;
    }
    case "SPLIT": {
      const p = pos(l, t.symbol!);
      p.qty *= t.quantity!; // toplam maliyet değişmez, ortalama maliyet düşer
      break;
    }
    case "DEPOSIT":
      l.cash += t.amount!;
      l.deposits += t.amount!;
      flow += t.amount!;
      break;
    case "WITHDRAW": {
      const amt = Math.min(t.amount!, Math.max(l.cash, 0));
      if (amt < t.amount! - 1e-9) l.warnings.push(`${t.date}: çekilen tutar nakitten fazla; nakit kadar işlendi.`);
      l.cash -= amt;
      l.deposits -= amt;
      flow -= amt;
      break;
    }
  }
  for (const p of l.positions.values()) p.avgCost = p.qty > 0 ? p.cost / p.qty : 0;
  return flow;
}

export function computeLedger(txs: Tx[]): Ledger {
  const l = emptyLedger();
  for (const t of sortTxs(txs)) applyTx(l, t);
  return l;
}

export interface PerfPoint {
  date: string;
  value: number; // portföy değeri (pozisyonlar + nakit)
  flow: number; // o günkü dış nakit akışı
  twr: number; // zaman ağırlıklı getiri endeksi (başlangıç 100)
  bench: number | null; // karşılaştırma endeksi (aynı başlangıçta 100)
}

/**
 * Günlük portföy değeri ve zaman ağırlıklı getiri (TWR).
 * Para yatırma/çekme o günün başında yapılmış sayılır: r = V_t / (V_{t-1} + F_t) − 1.
 * Böylece dış nakit akışları getiriyi etkilemez.
 */
export function computePerformance(
  txs: Tx[],
  dates: string[],
  priceOn: (symbol: string, date: string) => number | null,
  benchOn: (date: string) => number | null,
): PerfPoint[] {
  const sorted = sortTxs(txs);
  if (!sorted.length) return [];
  const l = emptyLedger();
  const out: PerfPoint[] = [];
  let i = 0, prevValue = 0, twr = 100, bench0: number | null = null;
  const lastPrice = new Map<string, number>();
  for (const d of dates.filter((x) => x >= sorted[0].date).sort()) {
    let flow = 0;
    while (i < sorted.length && sorted[i].date <= d) {
      const t = sorted[i++];
      if ((t.type === "BUY" || t.type === "RIGHTS") && t.price) lastPrice.set(t.symbol!, lastPrice.get(t.symbol!) ?? t.price);
      flow += applyTx(l, t);
    }
    let value = l.cash;
    for (const p of l.positions.values()) {
      if (p.qty <= 0) continue;
      const px = priceOn(p.symbol, d) ?? lastPrice.get(p.symbol) ?? p.avgCost;
      lastPrice.set(p.symbol, px);
      value += p.qty * px;
    }
    const base = prevValue + flow;
    if (base > 1e-9) twr *= value / base;
    const b = benchOn(d);
    if (bench0 === null && b !== null) bench0 = b;
    out.push({ date: d, value, flow, twr, bench: b !== null && bench0 ? (b / bench0) * 100 : null });
    prevValue = value;
  }
  return out;
}
