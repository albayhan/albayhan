import type { ShortAnalysis } from "./short";
import type { LongAnalysis } from "./long";
import { RISK, type Settings } from "../settings";

export type Status = "Alım adayı" | "Tut" | "Azalt" | "Satış adayı" | "Bekle" | "Veri yetersiz";

export interface PositionCtx {
  qty: number;
  avgCost: number;
  weightPct: number;
  plPct: number;
}
export interface Decision {
  status: Status;
  reason: string;
  counter: string;
  changeCondition: string;
  sizeHint: string | null;
}

const f = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function decide(input: {
  hasData: boolean;
  stale: boolean;
  lastVerified: string | null;
  short: ShortAnalysis;
  long: LongAnalysis | null; // fonlarda null
  position: PositionCtx | null;
  cash: number;
  totalValue: number;
  settings: Settings;
}): Decision {
  const { short: s, long: l, position: p, settings } = input;
  const risk = RISK[settings.risk];
  const none = (status: Status, reason: string, counter = "—", changeCondition = "—"): Decision => ({ status, reason, counter, changeCondition, sizeHint: null });

  if (!input.hasData || !s.ok) {
    return none("Veri yetersiz", !input.hasData ? "Bu enstrüman için doğrulanmış fiyat verisi yok." : (s.reasons[0] ?? "Analiz için veri yetersiz."), "—", "Veri sağlayıcı bağlantısı kurulduğunda yeniden değerlendirilir.");
  }
  if (input.stale) {
    return none(
      "Bekle",
      `Fiyat verisi güncel değil${input.lastVerified ? ` (son doğrulanmış değer: ${input.lastVerified})` : ""}; güncelliğe bağlı öneri beklemeye alındı.`,
      "Eski veriyle üretilen sinyal yanıltıcı olabilir.",
      "Sağlayıcı bağlantısı düzelip güncel fiyat alındığında öneri yeniden üretilir.",
    );
  }
  const price = s.price;
  const longView = l?.ok ? l.view : null;
  const longTxt = longView === "olumlu" ? "uzun vade görünümü olumlu" : longView === "olumsuz" ? "uzun vade görünümü olumsuz" : longView === "notr" ? "uzun vade görünümü nötr" : "uzun vade verisi yok";
  const topReason = s.reasons[0] ?? "Belirgin bir olumlu teknik sinyal yok.";
  const topCounter = s.counter[0] ?? l?.counter[0] ?? "Belirgin bir karşı sinyal yok.";
  const lvl = `Zarar-kes ${f(s.stop!)}, hedef ${f(s.target!)}, risk/ödül ${f(s.rr!)}.`;

  // Pozisyon büyüklüğü: işlem başına risk bütçesi / hisse başına risk
  const sizeHint = (): string | null => {
    if (!(input.totalValue > 0) || !s.entryRef || !s.stop) return null;
    const perShare = s.entryRef - s.stop;
    if (perShare <= 0) return null;
    const byRisk = (input.totalValue * risk.riskPerTradePct) / 100 / perShare;
    const room = Math.max(0, (input.totalValue * risk.maxWeightPct) / 100 - (p ? p.qty * price : 0)) / price;
    const byCash = input.cash / price;
    const qty = Math.floor(Math.min(byRisk, room, byCash));
    if (qty < 1) return input.cash < price ? "Nakit yetersiz; alım için nakit ayrılmalı." : "Ağırlık sınırı nedeniyle ek alım için yer yok.";
    return `Risk bütçesine göre en fazla ${qty.toLocaleString("tr-TR")} adet (portföyün %${f(risk.riskPerTradePct)}'i riske edilir, ağırlık sınırı %${risk.maxWeightPct}).`;
  };

  if (p) {
    const pl = `Maliyet ${f(p.avgCost)}, kâr/zarar %${f(p.plPct)}, ağırlık %${f(p.weightPct)}.`;
    if (price <= s.stop! || (s.signal === "zayif" && longView === "olumsuz")) {
      if (longView === "olumlu") {
        return { status: "Azalt", reason: `Kısa vade eğilimi bozuldu (teknik puan ${s.score}); ${longTxt}. ${pl}`, counter: l!.reasons[0] ?? topCounter, changeCondition: `Fiyat 20 günlük ortalamanın (${f(s.ind.sma20!)}) üzerine dönerse Tut.`, sizeHint: null };
      }
      return { status: "Satış adayı", reason: `Kısa vade eğilimi aşağı (teknik puan ${s.score}) ve ${longTxt}. ${pl}`, counter: s.reasons[0] ?? l?.reasons[0] ?? "Aşırı satım sonrası tepki yükselişi olabilir.", changeCondition: `Fiyat 20 günlük ortalamanın (${f(s.ind.sma20!)}) üzerinde kapanırsa karar gözden geçirilir.`, sizeHint: null };
    }
    if (p.weightPct > risk.maxWeightPct) {
      return { status: "Azalt", reason: `Pozisyon ağırlığı %${f(p.weightPct)}, ${risk.label.toLowerCase()} profil için üst sınır %${risk.maxWeightPct}. ${pl}`, counter: topReason, changeCondition: `Ağırlık %${risk.maxWeightPct}'in altına indiğinde Tut.`, sizeHint: null };
    }
    if (s.signal === "zayif") {
      const heavy = p.weightPct > risk.maxWeightPct * 0.6;
      return { status: heavy ? "Azalt" : "Tut", reason: `Kısa vade eğilimi zayıf (teknik puan ${s.score}) ancak ${longTxt}. ${pl}`, counter: heavy ? (l?.reasons[0] ?? topReason) : topCounter, changeCondition: `Fiyat ${f(s.stop!)} altına inerse Satış adayı; 20 günlük ortalamanın (${f(s.ind.sma20!)}) üzerine dönerse eğilim düzelir.`, sizeHint: null };
    }
    if (s.signal === "alim" && longView !== "olumsuz" && p.weightPct < risk.maxWeightPct * 0.8) {
      return { status: "Alım adayı", reason: `Ekleme için koşullar uygun: ${topReason} ${lvl} ${pl}`, counter: topCounter, changeCondition: `Fiyat ${f(s.stop!)} altına inerse ya da risk/ödül ${f(s.minRR)} altına düşerse Tut.`, sizeHint: sizeHint() };
    }
    return { status: "Tut", reason: `${topReason} ${longTxt[0].toUpperCase() + longTxt.slice(1)}. ${pl}`, counter: topCounter, changeCondition: `Fiyat ${f(s.stop!)} altına inerse Azalt/Satış adayı; giriş koşulu sağlanırsa ekleme değerlendirilir.`, sizeHint: null };
  }

  if (s.signal === "alim" && longView !== "olumsuz") {
    return { status: "Alım adayı", reason: `${topReason} ${lvl} ${longTxt[0].toUpperCase() + longTxt.slice(1)}.`, counter: topCounter, changeCondition: `Fiyat ${f(s.stop!)} altına inerse ya da risk/ödül ${f(s.minRR)} altına düşerse Bekle.`, sizeHint: sizeHint() };
  }
  const why = s.signal === "alim" ? `Teknik koşullar uygun ancak ${longTxt}.` : !s.conditionMet ? `Giriş koşulu sağlanmıyor (teknik puan ${s.score}, risk/ödül ${f(s.rr!)}).` : `Teknik puan (${s.score}) alım için yeterli değil.`;
  return none("Bekle", why, s.reasons[0] ?? l?.reasons[0] ?? "—", s.entryCondition);
}
