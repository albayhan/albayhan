import { httpGet, HttpError } from "../http";

const BASE = () => process.env.TCMB_BASE_URL || "https://www.tcmb.gov.tr";
export const TCMB_SOURCE = "TCMB";
export const FX_CODES = ["USD", "EUR", "GBP", "RUB"] as const;

export interface FxDay {
  date: string;
  rates: Record<string, number>; // 1 birim yabancı para = ? TL (döviz alış)
}

export function parseTcmbXml(xml: string): FxDay {
  const dm = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!dm) throw new Error("TCMB: kur bülteni okunamadı");
  const rates: Record<string, number> = {};
  for (const code of FX_CODES) {
    const block = new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?</Currency>`).exec(xml)?.[0];
    if (!block) continue;
    const unit = Number(/<Unit>(\d+)<\/Unit>/.exec(block)?.[1] ?? "1");
    const buy = Number(/<ForexBuying>([\d.]+)<\/ForexBuying>/.exec(block)?.[1]);
    if (isFinite(buy) && buy > 0) rates[code] = buy / unit;
  }
  if (!rates.USD) throw new Error("TCMB: USD kuru bulunamadı");
  return { date: `${dm[3]}-${dm[2]}-${dm[1]}`, rates };
}

export async function tcmbToday(): Promise<FxDay> {
  return parseTcmbXml(await httpGet(`${BASE()}/kurlar/today.xml`));
}

/** Belirli bir günün bülteni. Tatil/hafta sonu için bülten yoktur → null. */
export async function tcmbOn(date: string): Promise<FxDay | null> {
  const [y, m, d] = date.split("-");
  try {
    return parseTcmbXml(await httpGet(`${BASE()}/kurlar/${y}${m}/${d}${m}${y}.xml`));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}
