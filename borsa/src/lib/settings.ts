import { q } from "./db";

export type RiskProfile = "temkinli" | "dengeli" | "atak";
export interface Settings {
  risk: RiskProfile;
  shortMinWeeks: number;
  shortMaxWeeks: number;
  longMinMonths: number;
  longMaxMonths: number;
}
export const DEFAULT_SETTINGS: Settings = { risk: "dengeli", shortMinWeeks: 1, shortMaxWeeks: 8, longMinMonths: 6, longMaxMonths: 24 };

export const RISK: Record<RiskProfile, { label: string; minRR: number; maxWeightPct: number; riskPerTradePct: number }> = {
  temkinli: { label: "Temkinli", minRR: 2.5, maxWeightPct: 15, riskPerTradePct: 0.5 },
  dengeli: { label: "Dengeli", minRR: 2.0, maxWeightPct: 25, riskPerTradePct: 1 },
  atak: { label: "Atak", minRR: 1.5, maxWeightPct: 35, riskPerTradePct: 2 },
};

export function sanitizeSettings(s: Partial<Settings>): Settings {
  const clamp = (v: any, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const risk = s.risk && s.risk in RISK ? s.risk : DEFAULT_SETTINGS.risk;
  const shortMin = clamp(s.shortMinWeeks, 1, 26, 1);
  const shortMax = Math.max(shortMin, clamp(s.shortMaxWeeks, 1, 26, 8));
  const longMin = clamp(s.longMinMonths, 3, 60, 6);
  const longMax = Math.max(longMin, clamp(s.longMaxMonths, 3, 60, 24));
  return { risk, shortMinWeeks: shortMin, shortMaxWeeks: shortMax, longMinMonths: longMin, longMaxMonths: longMax };
}

export async function getSettings(): Promise<Settings> {
  const [r] = await q("SELECT value FROM settings WHERE key='user'");
  return sanitizeSettings(r?.value ?? {});
}
export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const v = sanitizeSettings(s);
  await q("INSERT INTO settings (key, value) VALUES ('user', $1) ON CONFLICT (key) DO UPDATE SET value=$1", [JSON.stringify(v)]);
  return v;
}
