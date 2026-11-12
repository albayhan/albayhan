import { q } from "./db";
import { getQuotes } from "./data";

export interface PriceAlert {
  id: string;
  symbol: string;
  op: "above" | "below";
  price: number;
  note: string;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  seen: boolean;
}

export async function listAlerts(): Promise<PriceAlert[]> {
  const [r] = await q("SELECT value FROM settings WHERE key='alerts'");
  return Array.isArray(r?.value) ? r.value : [];
}
async function saveAlerts(a: PriceAlert[]) {
  await q("INSERT INTO settings (key, value) VALUES ('alerts', $1) ON CONFLICT (key) DO UPDATE SET value=$1", [JSON.stringify(a)]);
}

export async function addAlert(a: { symbol: string; op: "above" | "below"; price: number; note?: string }): Promise<void> {
  const all = await listAlerts();
  all.push({ id: Math.random().toString(36).slice(2, 10), symbol: a.symbol, op: a.op, price: a.price, note: a.note ?? "", createdAt: new Date().toISOString(), triggeredAt: null, triggeredPrice: null, seen: false });
  await saveAlerts(all);
  await checkAlerts();
}
export async function removeAlert(id: string) {
  await saveAlerts((await listAlerts()).filter((a) => a.id !== id));
}
export async function markAlertsSeen() {
  const all = await listAlerts();
  if (all.some((a) => a.triggeredAt && !a.seen)) await saveAlerts(all.map((a) => (a.triggeredAt ? { ...a, seen: true } : a)));
}

/** Kayıtlı son fiyatlarla alarmları kontrol eder; tetiklenenleri işaretler. */
export async function checkAlerts(): Promise<PriceAlert[]> {
  const all = await listAlerts();
  const open = all.filter((a) => !a.triggeredAt);
  if (!open.length) return [];
  const quotes = await getQuotes([...new Set(open.map((a) => a.symbol))]);
  const fired: PriceAlert[] = [];
  for (const a of open) {
    const qt = quotes.get(a.symbol);
    if (!qt) continue;
    if ((a.op === "above" && qt.price >= a.price) || (a.op === "below" && qt.price <= a.price)) {
      a.triggeredAt = new Date().toISOString();
      a.triggeredPrice = qt.price;
      fired.push(a);
    }
  }
  if (fired.length) await saveAlerts(all);
  return fired;
}
