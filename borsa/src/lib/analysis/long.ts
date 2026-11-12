import type { Statement } from "../providers/types";
import type { Settings } from "../settings";

export interface Metrics {
  period: string; // "2026/9"
  revenueTTM: number | null;
  revenueGrowthPct: number | null; // kümülatif dönem, önceki yılın aynı dönemine göre
  grossMarginPct: number | null;
  grossMarginPrevPct: number | null;
  ebitdaTTM: number | null;
  ebitdaMarginPct: number | null;
  netIncomeTTM: number | null;
  ocfTTM: number | null;
  fcfTTM: number | null;
  fcfMarginPct: number | null;
  netDebt: number | null; // negatif = net nakit
  netDebtToEbitda: number | null;
  equity: number | null;
  roePct: number | null;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  fcfYieldPct: number | null;
  fxPosition: number | null;
  exportSharePct: number | null;
}

const v = (s: Statement | undefined, code: string): number | null => (s && code in s.items ? s.items[code] : null);

export function computeMetrics(statements: Statement[], marketCap: number | null): Metrics | null {
  const sorted = [...statements].sort((a, b) => b.year - a.year || b.period - a.period);
  const cur = sorted[0];
  if (!cur || v(cur, "3C") === null) return null;
  const prevSame = sorted.find((s) => s.year === cur.year - 1 && s.period === cur.period);
  const prevAnnual = cur.period === 12 ? cur : sorted.find((s) => s.year === cur.year - 1 && s.period === 12);
  /** Son 12 ay: kümülatif dönem + önceki yıl tamamı − önceki yılın aynı dönemi */
  const ttm = (fn: (s: Statement) => number | null): number | null => {
    const c = fn(cur);
    if (c === null) return null;
    if (cur.period === 12) return c;
    if (!prevSame || !prevAnnual) return null;
    const a = fn(prevAnnual), p = fn(prevSame);
    return a === null || p === null ? null : c + a - p;
  };
  const ebitdaOf = (s: Statement) => {
    const gross = v(s, "3D"), dep = v(s, "4B");
    if (gross === null || dep === null) return null;
    return gross + (v(s, "3DA") ?? 0) + (v(s, "3DB") ?? 0) + (v(s, "3DC") ?? 0) + dep;
  };
  const div = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? a / b : null);
  const pct = (x: number | null) => (x === null ? null : x * 100);

  const revenueTTM = ttm((s) => v(s, "3C"));
  const ebitdaTTM = ttm(ebitdaOf);
  const netIncomeTTM = ttm((s) => v(s, "3Z"));
  const ocfTTM = ttm((s) => v(s, "4C"));
  const fcfTTM = ttm((s) => v(s, "4CB"));
  const debt = (v(cur, "2AA") ?? 0) + (v(cur, "2BA") ?? 0);
  const cash = (v(cur, "1AA") ?? 0) + (v(cur, "1AB") ?? 0);
  const netDebt = v(cur, "1AA") === null ? null : debt - cash;
  const equity = v(cur, "2O");
  const ev = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
  const dom = v(cur, "4BC"), exp = v(cur, "4BD");
  return {
    period: `${cur.year}/${cur.period}`,
    revenueTTM,
    revenueGrowthPct: prevSame ? pct(div((v(cur, "3C") ?? 0) - (v(prevSame, "3C") ?? 0), Math.abs(v(prevSame, "3C") ?? 0))) : null,
    grossMarginPct: pct(div(v(cur, "3D"), v(cur, "3C"))),
    grossMarginPrevPct: prevSame ? pct(div(v(prevSame, "3D"), v(prevSame, "3C"))) : null,
    ebitdaTTM,
    ebitdaMarginPct: pct(div(ebitdaTTM, revenueTTM)),
    netIncomeTTM,
    ocfTTM,
    fcfTTM,
    fcfMarginPct: pct(div(fcfTTM, revenueTTM)),
    netDebt,
    netDebtToEbitda: ebitdaTTM !== null && ebitdaTTM > 0 && netDebt !== null ? netDebt / ebitdaTTM : null,
    equity,
    roePct: pct(div(netIncomeTTM, equity)),
    marketCap,
    pe: netIncomeTTM !== null && netIncomeTTM > 0 && marketCap ? marketCap / netIncomeTTM : null,
    pb: equity !== null && equity > 0 && marketCap ? marketCap / equity : null,
    evEbitda: ev !== null && ebitdaTTM !== null && ebitdaTTM > 0 ? ev / ebitdaTTM : null,
    fcfYieldPct: marketCap ? pct(div(fcfTTM, marketCap)) : null,
    fxPosition: v(cur, "4BE"),
    exportSharePct: dom !== null && exp !== null && dom + exp > 0 ? (exp / (dom + exp)) * 100 : null,
  };
}

export interface Pillar {
  name: string;
  score: number; // −2 … +2
  value: string;
  note: string;
}
export interface Scenario {
  name: "Olumlu" | "Baz" | "Olumsuz";
  growthPct: number;
  multiple: number;
  targetPrice: number;
  returnPct: number;
  assumptions: string;
}
export interface PeerRow {
  symbol: string;
  pe: number | null;
  evEbitda: number | null;
  pb: number | null;
  netDebtToEbitda: number | null;
  period: string | null;
}
export interface LongAnalysis {
  ok: boolean;
  view: "olumlu" | "notr" | "olumsuz" | "veri_yetersiz";
  score: number;
  metrics: Metrics | null;
  pillars: Pillar[];
  peers: PeerRow[];
  peerMedian: { pe: number | null; evEbitda: number | null };
  scenarios: Scenario[];
  thesis: string;
  thesisChangers: string[];
  reasons: string[];
  counter: string[];
  horizon: string;
  note: string;
}

const n1 = (x: number) => x.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function analyzeLong(input: { metrics: Metrics | null; price: number | null; peers: PeerRow[]; settings: Settings; extraChangers?: string[] }): LongAnalysis {
  const { metrics: m, price, peers, settings } = input;
  const horizon = `${settings.longMinMonths}–${settings.longMaxMonths} ay`;
  const base: LongAnalysis = {
    ok: false, view: "veri_yetersiz", score: 0, metrics: m, pillars: [], peers, peerMedian: { pe: null, evEbitda: null }, scenarios: [],
    thesis: "", thesisChangers: [], reasons: [], counter: [], horizon,
    note: "Tutarlar KAP'a bildirilen kümülatif finansal tablolardan hesaplanır. Enflasyon muhasebesi (TMS 29) nedeniyle dönemler arası büyüme karşılaştırması yaklaşık kabul edilmelidir. Senaryo fiyatları bugünkü TL değeriyle (enflasyondan arındırılmış) model çıktısıdır; veri değil, varsayımdır.",
  };
  if (!m || m.revenueTTM === null) {
    return { ...base, reasons: ["Finansal tablo verisi yok ya da bu şirketin tablo biçimi (banka/sigorta) desteklenmiyor."] };
  }
  const pillars: Pillar[] = [];
  const g = m.revenueGrowthPct;
  pillars.push({
    name: "Büyüme", score: g === null ? 0 : g > 60 ? 2 : g > 30 ? 1 : g < 0 ? -2 : g < 10 ? -1 : 0,
    value: g === null ? "—" : `Hasılat (yıllık, nominal) %${n1(g)}`,
    note: g === null ? "Önceki yılın aynı dönemi bulunamadı." : g > 30 ? "Hasılat güçlü büyüyor." : g < 10 ? "Hasılat büyümesi zayıf (nominal)." : "Hasılat büyümesi ılımlı.",
  });
  const fm = m.fcfMarginPct;
  pillars.push({
    name: "Nakit akışı", score: m.ocfTTM !== null && m.ocfTTM < 0 ? -2 : fm === null ? 0 : fm > 10 ? 2 : fm > 5 ? 1 : fm < 0 ? -1 : 0,
    value: fm === null ? "—" : `Serbest nakit akışı marjı %${n1(fm)}`,
    note: m.ocfTTM !== null && m.ocfTTM < 0 ? "İşletme faaliyetleri nakit tüketiyor." : fm === null ? "Nakit akışı hesaplanamadı." : fm > 5 ? "Yatırımlar sonrası nakit üretiyor." : fm < 0 ? "Yatırımlar işletme nakdini aşıyor." : "Serbest nakit akışı sınırlı.",
  });
  const nd = m.netDebtToEbitda;
  pillars.push({
    name: "Borçluluk", score: m.netDebt !== null && m.netDebt < 0 ? 2 : nd === null ? 0 : nd < 1 ? 2 : nd < 2 ? 1 : nd < 3.5 ? 0 : nd < 5 ? -1 : -2,
    value: m.netDebt !== null && m.netDebt < 0 ? "Net nakit pozisyonu" : nd === null ? "—" : `Net borç / FAVÖK ${n1(nd)}×`,
    note: m.netDebt !== null && m.netDebt < 0 ? "Finansal borçtan fazla nakdi var." : nd === null ? "FAVÖK pozitif değil; oran hesaplanamadı." : nd < 2 ? "Borç yükü rahat taşınabilir." : nd < 3.5 ? "Borçluluk orta düzeyde." : "Borçluluk yüksek.",
  });
  // Anlamsız uç çarpanlar (zarar, çok düşük FAVÖK) emsal medyanına katılmaz.
  const mp = median(peers.map((p) => p.pe).filter((x): x is number => x !== null && x > 0 && x < 60));
  const me = median(peers.map((p) => p.evEbitda).filter((x): x is number => x !== null && x > 0 && x < 30));
  let val = 0;
  const parts: string[] = [];
  if (m.pe !== null && mp) { const d = m.pe / mp - 1; val += d < -0.2 ? 1 : d > 0.2 ? -1 : 0; parts.push(`F/K ${n1(m.pe)} (emsal ${n1(mp)})`); }
  else if (m.pe !== null) parts.push(`F/K ${n1(m.pe)}`);
  if (m.evEbitda !== null && me) { const d = m.evEbitda / me - 1; val += d < -0.2 ? 1 : d > 0.2 ? -1 : 0; parts.push(`FD/FAVÖK ${n1(m.evEbitda)} (emsal ${n1(me)})`); }
  else if (m.evEbitda !== null) parts.push(`FD/FAVÖK ${n1(m.evEbitda)}`);
  if (m.netIncomeTTM !== null && m.netIncomeTTM <= 0) val -= 1;
  pillars.push({
    name: "Değerleme", score: val, value: parts.join(" · ") || "—",
    note: !mp && !me ? "Emsal verisi yok; değerleme yalnızca kendi çarpanlarıyla gösterilir." : val > 0 ? "Emsallerine göre iskontolu." : val < 0 ? "Emsallerine göre primli ya da zarar ediyor." : "Emsalleriyle benzer çarpanlarda.",
  });

  const score = pillars.reduce((s, p) => s + p.score, 0);
  const view: LongAnalysis["view"] = score >= 3 ? "olumlu" : score <= -2 ? "olumsuz" : "notr";

  // Senaryolar: FAVÖK × çarpan − net borç
  const scenarios: Scenario[] = [];
  const T = settings.longMaxMonths / 12;
  if (m.ebitdaTTM && m.ebitdaTTM > 0 && m.evEbitda && m.marketCap && price && m.netDebt !== null) {
    const shares = m.marketCap / price;
    const mk = (name: Scenario["name"], gr: number, multK: number, why: string): Scenario => {
      const mult = m.evEbitda! * multK;
      const equity = m.ebitdaTTM! * Math.pow(1 + gr / 100, T) * mult - m.netDebt!;
      const tp = Math.max(0, equity / shares);
      return {
        name, growthPct: gr, multiple: mult, targetPrice: tp, returnPct: (tp / price - 1) * 100,
        assumptions: `FAVÖK yılda reel %${n1(gr)} değişir, FD/FAVÖK ${n1(mult)}× (bugünkü ${n1(m.evEbitda!)}×), net borç sabit, vade ${settings.longMaxMonths} ay. ${why}`,
      };
    };
    scenarios.push(
      mk("Olumlu", 8, 1.1, "Talep ve marjlar güçlenir, çarpan %10 genişler."),
      mk("Baz", 2, 1, "Kârlılık reel olarak korunur, çarpan değişmez."),
      mk("Olumsuz", -8, 0.9, "Marjlar daralır, çarpan %10 geriler."),
    );
  }

  const reasons = pillars.filter((p) => p.score > 0).map((p) => `${p.name}: ${p.note} (${p.value})`);
  const counter = pillars.filter((p) => p.score < 0).map((p) => `${p.name}: ${p.note} (${p.value})`);
  const thesis =
    view === "olumlu" ? "Bilanço ve nakit üretimi uzun vadeli pozisyonu destekliyor; değerleme makul."
    : view === "olumsuz" ? "Temel göstergeler zayıf; uzun vadeli pozisyon için iyileşme işareti beklenmeli."
    : "Temel göstergeler dengeli; belirleyici olan büyüme ve marjların yönü olacak.";
  const thesisChangers = [
    nd !== null && nd < 3.5 ? "Net borç / FAVÖK oranının 3,5×'in üzerine çıkması" : "Net borç / FAVÖK oranının 3,5×'in altına inmesi",
    fm !== null && fm >= 0 ? "Serbest nakit akışının negatife dönmesi" : "Serbest nakit akışının pozitife dönmesi",
    m.grossMarginPct !== null ? `Brüt kâr marjının (%${n1(m.grossMarginPct)}) art arda iki dönem 3 puandan fazla değişmesi` : "Brüt kâr marjında belirgin değişim",
    "Yeni finansal raporda hasılat büyümesinin yön değiştirmesi",
    ...(input.extraChangers ?? []),
  ];
  return { ...base, ok: true, view, score, pillars, peerMedian: { pe: mp, evEbitda: me }, scenarios, thesis, thesisChangers, reasons, counter };
}
