import { httpJson } from "../http";

/** TCMB EVDS — yalnızca EVDS_API_KEY tanımlıysa kullanılır. */
export const EVDS_SOURCE = "TCMB EVDS";
export const EVDS_SERIES: Record<string, string> = {
  BRENT: "TP.BRENTPETROL.EUBP",
};
export const evdsEnabled = () => !!process.env.EVDS_API_KEY;

export async function evdsSeries(code: string, from: string, to: string): Promise<{ date: string; value: number }[]> {
  const base = process.env.EVDS_BASE_URL || "https://evds2.tcmb.gov.tr/service/evds";
  const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
  const j = await httpJson<any>(`${base}/series=${code}&startDate=${dmy(from)}&endDate=${dmy(to)}&type=json`, {
    headers: { key: process.env.EVDS_API_KEY! },
  });
  const field = code.replace(/\./g, "_");
  if (!Array.isArray(j?.items)) throw new Error("EVDS: seri okunamadı");
  return j.items
    .filter((r: any) => r[field] !== null && r[field] !== undefined && r.Tarih)
    .map((r: any) => {
      const [d, m, y] = String(r.Tarih).split("-");
      return { date: `${y}-${m}-${d}`, value: Number(r[field]) };
    })
    .filter((r: any) => isFinite(r.value));
}
