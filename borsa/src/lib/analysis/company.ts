import { q } from "../db";
import { getMacro, type DisclosureRow, type MacroPoint } from "../data";
import { kapLink } from "../providers/kap";
import { evdsEnabled } from "../providers/evds";
import type { Metrics } from "./long";

export const PEERS: Record<string, string[]> = {
  THYAO: ["PGSUS", "TAVHL"],
  PGSUS: ["THYAO", "TAVHL"],
  TAVHL: ["THYAO", "PGSUS"],
  TUPRS: ["PETKM", "AYGAZ"],
  PETKM: ["TUPRS", "SASA"],
  AEFES: ["CCOLA", "TBORG", "ULKER"],
  CCOLA: ["AEFES", "ULKER"],
  ULKER: ["CCOLA", "AEFES"],
  BIMAS: ["MGROS", "SOKM"],
  MGROS: ["BIMAS", "SOKM"],
  SOKM: ["BIMAS", "MGROS"],
  EREGL: ["KRDMD", "ISDMR"],
  KRDMD: ["EREGL", "ISDMR"],
  FROTO: ["TOASO", "DOAS"],
  TOASO: ["FROTO", "DOAS"],
  ARCLK: ["VESTL", "VESBE"],
  TCELL: ["TTKOM"],
  TTKOM: ["TCELL"],
  SISE: ["TRKCM", "ANACM"],
  ASELS: ["OTKAR"],
};

export interface Driver {
  title: string;
  value: string;
  detail: string;
  source: string;
  date: string | null;
  link?: string;
  missing?: boolean;
  effect: string; // tezi nasıl etkiler
}
export interface CompanyView {
  drivers: Driver[];
  notes: string[]; // analize katılan gözlemler
  counter: string[];
  changers: string[];
}

const n2 = (x: number) => x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = (x: number) => x.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = (x: number) => `${n1(x / 1e9)} mlr ₺`;

function fxDriver(title: string, p: MacroPoint | null, effect: string): Driver {
  if (!p) return { title, value: "Veri yetersiz", detail: "TCMB kur bültenine ulaşılamadı.", source: "TCMB", date: null, missing: true, effect };
  return {
    title, value: n2(p.value) + " ₺",
    detail: p.change30d !== null ? `Son 30 günde %${n2(p.change30d)}` : "30 günlük değişim için geçmiş kur birikiyor.",
    source: p.source + " (döviz alış)", date: p.date, effect,
  };
}

function discDriver(title: string, list: DisclosureRow[], re: RegExp, effect: string, missingHint: string): Driver {
  const d = list.find((x) => re.test(`${x.summary ?? ""} ${x.subject ?? ""}`));
  if (!d) return { title, value: "Veri yetersiz", detail: missingHint, source: "KAP", date: null, missing: true, effect };
  return {
    title, value: (d.summary?.split("\n")[0] || d.subject || "").trim(),
    detail: "Rakamlar bildirimin ekinde yer alır; bağlantıdan açabilirsiniz.", source: "KAP bildirimi", date: d.published_at, link: kapLink(d.id), effect,
  };
}

async function brentDriver(effect: string): Promise<Driver> {
  const p = await getMacro("BRENT");
  if (!p) {
    return {
      title: "Brent petrol", value: "Veri yetersiz",
      detail: evdsEnabled() ? "EVDS serisi henüz alınamadı." : "Bu seri için TCMB EVDS anahtarı gerekir (EVDS_API_KEY).",
      source: "TCMB EVDS", date: null, missing: true, effect,
    };
  }
  return { title: "Brent petrol", value: n2(p.value) + " $/varil", detail: p.change30d !== null ? `Son 30 günde %${n2(p.change30d)}` : "", source: p.source, date: p.date, effect };
}

async function manual(symbol: string): Promise<Driver[]> {
  const rows = await q("SELECT * FROM company_metrics WHERE symbol=$1 ORDER BY created_at DESC LIMIT 12", [symbol]);
  return rows.map((r) => ({
    title: r.metric, value: r.value, detail: `Dönem: ${r.period} · elle girildi`, source: "Kullanıcı girişi (yatırımcı ilişkileri)",
    date: r.created_at, link: r.source_url, effect: "Yatırımcı ilişkileri belgesinden elle kaydedilen değer.",
  }));
}

export const hasCompanyView = (symbol: string) => ["THYAO", "TUPRS", "AEFES"].includes(symbol);

/** Şirkete özgü veriler: yalnızca gerçek kaynaklardan; bulunamayan kalem "Veri yetersiz" olarak gösterilir. */
export async function companyView(symbol: string, disclosures: DisclosureRow[], m: Metrics | null): Promise<CompanyView> {
  const drivers: Driver[] = [];
  const notes: string[] = [], counter: string[] = [], changers: string[] = [];
  const [usd, eur, rub] = await Promise.all([getMacro("USDTRY"), getMacro("EURTRY"), getMacro("RUBTRY")]);
  const period = m?.period ?? null;

  if (symbol === "THYAO") {
    drivers.push(discDriver("Yolcu trafiği", disclosures, /trafik/i, "Yolcu sayısı ve doluluk oranı hasılatın öncü göstergesidir.", "Son 180 günde trafik sonucu bildirimi bulunamadı."));
    drivers.push(await brentDriver("Jet yakıtı en büyük gider kalemidir; Brent jet yakıtı fiyatının göstergesidir. Yükseliş marjı baskılar."));
    drivers.push(fxDriver("USD/TRY", usd, "Gelirlerin büyük bölümü döviz cinsindendir; TL'deki değer kaybı TL bazlı kârı destekler, döviz borcunu büyütür."));
    drivers.push(fxDriver("EUR/TRY", eur, "Bilet gelirlerinde euro payı yüksektir; EUR/USD paritesi marjı etkiler."));
    if (m?.exportSharePct !== null && m?.exportSharePct !== undefined) {
      drivers.push({ title: "Yurt dışı satış payı", value: `%${n1(m.exportSharePct)}`, detail: `Finansal tablo dönemi ${period}`, source: "İş Yatırım (KAP finansal tabloları)", date: null, effect: "Döviz geliri oranı kur duyarlılığını belirler." });
    }
    if (m?.fxPosition !== null && m?.fxPosition !== undefined) {
      drivers.push({ title: "Net yabancı para pozisyonu", value: compact(m.fxPosition), detail: `Finansal tablo dönemi ${period}`, source: "İş Yatırım (KAP finansal tabloları)", date: null, effect: "Açık pozisyon, kur artışında kur farkı gideri yaratır." });
      if (m.fxPosition < 0) counter.push(`Net yabancı para pozisyonu açık (${compact(m.fxPosition)}); hızlı kur artışı finansman giderini büyütür.`);
    }
    if (drivers[0] && !drivers[0].missing) notes.push(`Son trafik bildirimi: ${drivers[0].value}.`);
    changers.push("Aylık trafik sonuçlarında yolcu sayısı veya doluluk oranının art arda gerilemesi", "Brent/jet yakıtı fiyatında kalıcı sıçrama", "EUR/USD paritesinde sert düşüş");
  } else if (symbol === "TUPRS") {
    drivers.push({
      title: "Net nakit", value: m?.netDebt !== null && m?.netDebt !== undefined ? (m.netDebt < 0 ? compact(-m.netDebt) + " net nakit" : compact(m.netDebt) + " net borç") : "Veri yetersiz",
      detail: period ? `Finansal borç − (nakit + kısa vadeli finansal yatırım), dönem ${period}` : "Finansal tablo alınamadı.",
      source: "İş Yatırım (KAP finansal tabloları)", date: null, missing: m?.netDebt === null || m?.netDebt === undefined,
      effect: "Net nakit, temettü kapasitesinin ve marj daralmasına dayanıklılığın göstergesidir.",
    });
    drivers.push({
      title: "Ürün marjı (brüt kâr marjı göstergesi)", value: m?.grossMarginPct !== null && m?.grossMarginPct !== undefined ? `%${n1(m.grossMarginPct)}` : "Veri yetersiz",
      detail: m?.grossMarginPrevPct !== null && m?.grossMarginPrevPct !== undefined ? `Önceki yılın aynı döneminde %${n1(m.grossMarginPrevPct)}. Rafineri marjı ($/varil) şirket sunumlarında açıklanır.` : "Rafineri marjı ($/varil) şirket sunumlarında açıklanır.",
      source: "İş Yatırım (KAP finansal tabloları)", date: null, missing: m?.grossMarginPct === null || m?.grossMarginPct === undefined,
      effect: "Rafineri ürün marjları (dizel, jet, benzin) kârlılığın ana belirleyicisidir.",
    });
    drivers.push(discDriver("Üretim / kapasite kullanımı", disclosures, /kapasite kullan|rafineri üretim|planlı duruş|bakım duruş|üretim sonuç/i, "Kapasite kullanımı ve planlı duruşlar satış hacmini belirler.", "Kapasite kullanım oranı KAP'ta yapılandırılmış veri olarak yayımlanmaz; yatırımcı sunumundan elle ekleyebilirsiniz."));
    drivers.push(await brentDriver("Ham petrol fiyatı stok kâr/zararını ve işletme sermayesini etkiler."));
    drivers.push(fxDriver("USD/TRY", usd, "Ürün fiyatları dolar bazlıdır; kur TL hasılatı ve stok değerini etkiler."));
    if (m?.netDebt !== null && m?.netDebt !== undefined && m.netDebt < 0) notes.push(`Net nakit pozisyonu (${compact(-m.netDebt)}) temettü kapasitesini destekliyor.`);
    if (m?.grossMarginPct != null && m?.grossMarginPrevPct != null && m.grossMarginPct < m.grossMarginPrevPct - 1) counter.push(`Brüt kâr marjı geçen yılın aynı dönemine göre geriledi (%${n1(m.grossMarginPrevPct)} → %${n1(m.grossMarginPct)}).`);
    changers.push("Rafineri ürün marjlarında kalıcı daralma", "Net nakdin net borca dönmesi", "Plansız duruş veya kapasite kullanımında düşüş");
  } else if (symbol === "AEFES") {
    drivers.push(discDriver("Satış hacmi", disclosures, /hacim|satış hac/i, "Bira ve meşrubat satış hacmi hasılatın temelidir.", "Son 180 günde satış hacmi bildirimi bulunamadı; çeyrek sonuç sunumundan elle ekleyebilirsiniz."));
    drivers.push({
      title: "Hammadde maliyeti (brüt kâr marjı göstergesi)", value: m?.grossMarginPct !== null && m?.grossMarginPct !== undefined ? `%${n1(m.grossMarginPct)}` : "Veri yetersiz",
      detail: m?.grossMarginPrevPct !== null && m?.grossMarginPrevPct !== undefined ? `Önceki yılın aynı döneminde %${n1(m.grossMarginPrevPct)}. Arpa, alüminyum ve şeker fiyatları için ayrı bir veri kaynağı bağlı değil.` : "Arpa, alüminyum ve şeker fiyatları için ayrı bir veri kaynağı bağlı değil.",
      source: "İş Yatırım (KAP finansal tabloları)", date: null, missing: m?.grossMarginPct === null || m?.grossMarginPct === undefined,
      effect: "Hammadde ve ambalaj maliyetlerindeki artış brüt marjı daraltır.",
    });
    drivers.push(discDriver("Rusya / BDT gelişmeleri", disclosures, /rusya|russia|bdt|ab inbev|kazakistan|ukrayna/i, "Rusya operasyonları üzerindeki kontrol ve BDT hacimleri konsolide kârı doğrudan etkiler.", "Son 180 günde Rusya/BDT ile ilgili bildirim bulunamadı."));
    drivers.push(fxDriver("RUB/TRY", rub, "Ruble, Rusya/BDT gelirlerinin TL karşılığını belirler."));
    drivers.push(fxDriver("USD/TRY", usd, "Hammadde ve borç döviz cinsindendir; kur maliyetleri ve finansman giderini etkiler."));
    counter.push("Rusya operasyonlarına ilişkin hukuki ve siyasi belirsizlik konsolide sonuçlar için başlıca risktir.");
    if (m?.grossMarginPct != null && m?.grossMarginPrevPct != null && m.grossMarginPct < m.grossMarginPrevPct - 1) counter.push(`Brüt kâr marjı geçen yılın aynı dönemine göre geriledi (%${n1(m.grossMarginPrevPct)} → %${n1(m.grossMarginPct)}).`);
    changers.push("Rusya operasyonlarının statüsüne ilişkin yeni KAP açıklaması", "Satış hacminde art arda iki çeyrek daralma", "Rublede sert değer kaybı");
  }
  drivers.push(...(await manual(symbol)));
  return { drivers, notes, counter, changers };
}
