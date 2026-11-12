import { httpGet, httpJson } from "../http";
import type { Bar } from "./types";

/**
 * TEFAS'ın resmî bir açık API'si yoktur. Buradaki uç noktalar tefas.gov.tr sitesinin
 * kendi kullandığı servislerdir; site otomatik istekleri reddederse bağlantı kurulamaz
 * ve uygulama fon verisini "Veri yetersiz" olarak gösterir.
 */
const BASE = () => process.env.TEFAS_BASE_URL || "https://www.tefas.gov.tr";
export const TEFAS_SOURCE = "TEFAS";

const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

async function post(path: string, form: Record<string, string>): Promise<any> {
  return httpJson(`${BASE()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
    body: new URLSearchParams(form).toString(),
    timeoutMs: 30000,
  });
}

export interface FundHistory {
  name: string;
  bars: Bar[];
}

export async function tefasHistory(code: string, from: string, to: string): Promise<FundHistory> {
  const j = await post("/api/DB/BindHistoryInfo", { fontip: "YAT", fonkod: code, bastarih: dmy(from), bittarih: dmy(to) });
  if (!Array.isArray(j?.data)) throw new Error("TEFAS: fon fiyat serisi okunamadı");
  if (!j.data.length) throw new Error(`TEFAS: ${code} kodlu fon bulunamadı`);
  const bars = j.data
    .map((r: any): Bar => ({
      date: new Date(Number(r.TARIH)).toISOString().slice(0, 10),
      open: null, high: null, low: null,
      close: Number(r.FIYAT), rawClose: Number(r.FIYAT),
      volume: r.PORTFOYBUYUKLUK != null ? Number(r.PORTFOYBUYUKLUK) : null,
      source: TEFAS_SOURCE,
    }))
    .filter((b: Bar) => isFinite(b.close) && b.close > 0)
    .sort((a: Bar, b: Bar) => a.date.localeCompare(b.date));
  return { name: String(j.data[0].FONUNVAN ?? code), bars };
}

export interface FundInfo {
  allocation: { name: string; pct: number }[];
  allocationDate: string | null;
  riskValue: number | null;
  managementFeePct: number | null;
  buyValor: string | null;
  sellValor: string | null;
  category: string | null;
}

const ALLOC_LABELS: Record<string, string> = {
  HS: "Hisse Senedi", DT: "Devlet Tahvili", HB: "Hazine Bonosu", KKS: "Kira Sertifikası", TPP: "Takasbank Para Piyasası",
  R: "Repo", TR: "Ters Repo", VM: "Vadeli Mevduat", KM: "Katılma Hesabı", YHS: "Yabancı Hisse Senedi", EUT: "Eurobond",
  OST: "Özel Sektör Tahvili", FB: "Finansman Bonosu", KH: "Katılım Hesabı", YYF: "Yatırım Fonu", BYF: "Borsa Yatırım Fonu",
  KMK: "Kıymetli Maden", D: "Döviz", VİNT: "Vadeli İşlem Nakit Teminatı", T: "Türev", DB: "Devlet Bonosu",
};

export async function tefasInfo(code: string, from: string, to: string): Promise<FundInfo> {
  const [alloc, html] = await Promise.all([
    post("/api/DB/BindHistoryAllocation", { fontip: "YAT", fonkod: code, bastarih: dmy(from), bittarih: dmy(to) }),
    httpGet(`${BASE()}/FonAnaliz.aspx?FonKod=${encodeURIComponent(code)}`, { timeoutMs: 30000 }),
  ]);
  const rows: any[] = Array.isArray(alloc?.data) ? alloc.data : [];
  rows.sort((a, b) => Number(b.TARIH) - Number(a.TARIH));
  const last = rows[0];
  const allocation = last
    ? Object.entries(last)
        .filter(([k, v]) => !["TARIH", "FONKODU", "FONUNVAN", "BilFiyat"].includes(k) && typeof v === "number" && (v as number) > 0)
        .map(([k, v]) => ({ name: ALLOC_LABELS[k] ?? k, pct: v as number }))
        .sort((a, b) => b.pct - a.pct)
    : [];
  const field = (label: string) => {
    const m = new RegExp(label + "\\s*</td>\\s*<td[^>]*>\\s*([^<]+)<", "i").exec(html);
    return m ? m[1].trim() : null;
  };
  const numTr = (s: string | null) => (s ? Number(s.replace("%", "").replace(/\./g, "").replace(",", ".")) : NaN);
  const risk = numTr(field("Fonun Risk Değeri"));
  const fee = numTr(field("Yıllık Yönetim Ücreti") ?? field("Yönetim Ücreti"));
  return {
    allocation,
    allocationDate: last ? new Date(Number(last.TARIH)).toISOString().slice(0, 10) : null,
    riskValue: isFinite(risk) ? risk : null,
    managementFeePct: isFinite(fee) ? fee : null,
    buyValor: field("Alış Valörü"),
    sellValor: field("Satış Valörü"),
    category: field("Kategorisi"),
  };
}
