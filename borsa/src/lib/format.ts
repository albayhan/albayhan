import { TZ } from "./time";

const nf = (min: number, max: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return nf(digits, digits).format(v);
}
export function fmtTL(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return "₺" + nf(digits, digits).format(v);
}
export function fmtPct(v: number | null | undefined, digits = 2, sign = true): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const s = nf(digits, digits).format(Math.abs(v));
  return (v < 0 ? "−" : sign && v > 0 ? "+" : "") + "%" + s;
}
export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return (v < 0 ? "−" : v > 0 ? "+" : "") + "₺" + nf(digits, digits).format(Math.abs(v));
}
/** Büyük tutarlar: 1,2 mlr ₺ */
export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}${nf(2, 2).format(a / 1e12)} trn`;
  if (a >= 1e9) return `${sign}${nf(2, 2).format(a / 1e9)} mlr`;
  if (a >= 1e6) return `${sign}${nf(1, 1).format(a / 1e6)} mn`;
  return sign + nf(0, 0).format(a);
}
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00+03:00" : d) : d;
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
}
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(dt);
}
export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(dt);
}
/** '1.234,56' veya '1234.56' biçimli sayıları çözer */
export function parseTrNumber(s: string): number {
  let t = s.trim().replace(/\s|₺|TL/gi, "");
  if (t === "") return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  // Virgülsüz "1.000" / "12.500.000": nokta binlik ayırıcıdır
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return Number(t);
}
