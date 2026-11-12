import type { Analyzed } from "./engine";
import type { ChartAnalysis } from "./chartAnalysis";
import type { Backtest } from "./backtest";
import type { Action } from "./scan";

export interface Explanation {
  headline: string;
  summary: string;
  bull: string[];
  bear: string[];
  plan: string[];
  watch: string[];
}

const f = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pf = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

/** Kararı düz Türkçeyle, gerekçeleri iki tarafıyla ve uygulanabilir planla anlatır. */
export function explain(a: Analyzed, ch: ChartAnalysis, bt: Backtest | null, action: Action): Explanation {
  const s = a.short, l = a.long, d = a.decision;
  const price = s.price;
  const bull: string[] = [], bear: string[] = [];

  if (s.ok) {
    for (const c of s.components) {
      if (!c.max) continue;
      if (c.score > 0) bull.push(`${c.name}: ${c.note}`);
      else if (c.score < 0) bear.push(`${c.name}: ${c.note}`);
    }
    if (s.ind.sma20 && price > s.ind.sma20 * 1.08) bear.push(`Fiyat 20 günlük ortalamanın %${Math.round((price / s.ind.sma20 - 1) * 100)} üzerinde; ortalamadan çok uzaklaşan fiyatlar genelde geri çekilir.`);
    if (s.rr !== null && s.rr < s.minRR) bear.push(`Risk/ödül ${f(s.rr)}: zarar-kese uzaklık hedefe göre fazla (gereken en az ${f(s.minRR)}).`);
    if (s.rr !== null && s.rr >= s.minRR) bull.push(`Risk/ödül ${f(s.rr)}: olası kazanç, olası kaybın ${f(s.rr)} katı.`);
  }
  for (const p of ch.patterns) {
    if (p.bias > 0) bull.push(`${p.title}: ${p.detail}`);
    else if (p.bias < 0) bear.push(`${p.title}: ${p.detail}`);
  }
  if (l?.ok) {
    for (const p of l.pillars) {
      if (p.score > 0) bull.push(`Bilanço — ${p.name.toLowerCase()}: ${p.note} (${p.value})`);
      else if (p.score < 0) bear.push(`Bilanço — ${p.name.toLowerCase()}: ${p.note} (${p.value})`);
    }
  }
  const o = ch.odds[0];
  if (o && o.n >= 15 && o.episodes >= 5 && o.upPct !== null && o.baseUpPct !== null) {
    const diff = o.upPct - o.baseUpPct;
    if (diff > 5) bull.push(`Tarihsel benzerlik: bu hissede aynı teknik durum ${o.episodes} ayrı dönemde (${o.n} gün) görülmüş; 2 hafta sonra yükselme oranı %${Math.round(o.upPct)}, hissenin genelinde %${Math.round(o.baseUpPct)}.`);
    else if (diff < -5) bear.push(`Tarihsel benzerlik: bu hissede aynı teknik durum ${o.episodes} ayrı dönemde (${o.n} gün) görülmüş; 2 hafta sonra yükselme oranı yalnızca %${Math.round(o.upPct)}, hissenin genelinde %${Math.round(o.baseUpPct)}.`);
  }
  if (bt?.ok && bt.closed >= 3 && bt.winRatePct !== null) {
    const line = `Bu hissede kuralın geçmiş karnesi: ${bt.closed} işlem, %${Math.round(bt.winRatePct)} isabet, işlem başına ${pf(bt.avgRetPct ?? 0)}.`;
    ((bt.avgRetPct ?? 0) > 0 ? bull : bear).push(line);
  }

  const so = ch.shortOutlook, mo = ch.midOutlook;
  const dirTxt = (x: typeof so) => (x ? `${x.horizon} için ${x.dir === "yukari" ? "yukarı" : x.dir === "asagi" ? "aşağı" : "yatay"} (${x.confidence})` : "");
  const headlines: Record<Action, string> = {
    AL: "AL — giriş koşulları sağlanıyor",
    SAT: "SAT — eğilim bozuldu, pozisyon riskte",
    AZALT: "AZALT — pozisyonu küçültmek mantıklı",
    TUT: "TUT — pozisyonu koru, seviyeleri izle",
    "İZLE": "İZLE — iyi aday ama giriş zamanı değil",
    BEKLE: "BEKLE — net bir avantaj yok",
    "UZAK DUR": "UZAK DUR — eğilim aşağı",
    "VERİ YOK": "VERİ YOK — analiz için veri yetersiz",
  };

  const summary = [
    d.reason,
    so && mo ? `Grafik görünümü ${dirTxt(so)}, ${dirTxt(mo)}.` : "",
    ch.channel ? `Son 60 günde fiyat ${ch.channel.slopePctMonth >= 0 ? "yükselen" : "düşen"} bir kanalda (aylık ${pf(ch.channel.slopePctMonth)}), kanalın ${ch.channel.positionPct > 75 ? "üst bandına yakın" : ch.channel.positionPct < 25 ? "alt bandına yakın" : "ortasında"}.` : "",
  ].filter(Boolean).join(" ");

  const plan: string[] = [];
  const c20 = ch.cones.find((c) => c.horizon === 20);
  if (action === "AL" && s.entryBand) {
    plan.push(`Giriş: ${f(s.entryBand[0])}–${f(s.entryBand[1])} bandı${s.rrBasis === "güncel fiyat" ? ` (fiyat bandın üzerinde; güncel fiyattan da R/Ö ${f(s.rr)})` : ""}.`);
    plan.push(`Zarar-kes: ${f(s.stop)} altında kapanış (giriş fiyatından yaklaşık ${pf(((s.stop ?? price) / price - 1) * 100)}).`);
    plan.push(`Hedef: ${f(s.target)} (${s.targetBasis}); yaklaşık ${pf(((s.target ?? price) / price - 1) * 100)}.`);
    if (d.sizeHint) plan.push(`Büyüklük: ${d.sizeHint}`);
    plan.push(`Hisse sayfasından zarar-kes ve hedef için fiyat alarmı kurun.`);
  } else if (action === "İZLE" && s.entryBand) {
    plan.push(`Geri çekilme bekleyin: ${f(s.entryBand[0])}–${f(s.entryBand[1])} bandına inerse risk/ödül iyileşir.`);
    plan.push(`${f(s.entryBand[1])} için “altına inerse” alarmı kurmak iyi bir takip yöntemi.`);
    if (ch.scenarios[0]) plan.push(`Alternatif: ${ch.scenarios[0].trigger} gelirse kırılımla giriş düşünülebilir (hedef ${f(ch.scenarios[0].target)}).`);
  } else if (action === "SAT" || action === "AZALT") {
    if (a.position) plan.push(`Pozisyon: ${a.position.qty.toLocaleString("tr-TR")} adet, maliyet ${f(a.position.avgCost)}, kâr/zarar ${pf(a.position.plPct)}.`);
    plan.push(action === "SAT" ? "Pozisyonun tamamını ya da büyük kısmını kapatmak değerlendirilebilir." : "Pozisyonu kısmen (ör. üçte bir ya da yarı) küçültmek riski azaltır.");
    if (ch.scenarios[1]) plan.push(`${ch.scenarios[1].trigger} gelirse düşüş hızlanabilir; bir sonraki durak ${f(ch.scenarios[1].target)}.`);
  } else if (action === "TUT") {
    plan.push(`Zarar-kes ${f(s.stop)} altında kapanışa kadar pozisyon korunabilir.`);
    if (ch.scenarios[0]) plan.push(`${ch.scenarios[0].trigger} gelirse ekleme düşünülebilir.`);
  } else if (action === "UZAK DUR") {
    plan.push("Düşüş eğiliminde alım yapmak “düşen bıçağı tutmak” olur; önce dönüş işareti beklenmeli.");
    plan.push(`Dönüş işareti: fiyatın 50 günlük ortalamanın (${f(s.ind.sma50)}) üstüne çıkması ve MACD'nin pozitife dönmesi.`);
  } else {
    plan.push("Belirgin bir avantaj olmadığı için işlem yapmamak da bir karardır.");
    if (ch.scenarios.length) plan.push(`Yön netleşsin diye ${ch.scenarios[0].trigger} ya da ${ch.scenarios[1].trigger} beklenebilir.`);
  }
  if (c20) plan.push(`Olası aralık (oynaklığa göre, %68): 20 işlem günü içinde ${f(c20.low68)} – ${f(c20.high68)}.`);

  const watch = [d.changeCondition, ...ch.scenarios.map((x) => `${x.name}: ${x.trigger} → ${x.note}`)].filter((x) => x && x !== "—");

  return {
    headline: headlines[action],
    summary,
    bull: [...new Set(bull)].slice(0, 8),
    bear: [...new Set(bear)].slice(0, 8),
    plan,
    watch,
  };
}
