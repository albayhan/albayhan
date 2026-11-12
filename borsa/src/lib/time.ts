export const TZ = "Europe/Istanbul";

/** İstanbul saatine göre 'YYYY-AA-GG' */
export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** İstanbul saatine göre dakika cinsinden gün içi zaman ve hafta günü (1=Pzt … 7=Paz) */
export function istClock(d: Date = new Date()): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { minutes: (parseInt(get("hour"), 10) % 24) * 60 + parseInt(get("minute"), 10), weekday: wd };
}

export const SESSION_OPEN = 10 * 60; // 10:00
export const SESSION_CLOSE = 18 * 60 + 10; // 18:10 (kapanış seansı dahil)

export function isWeekday(d: Date = new Date()): boolean {
  return istClock(d).weekday <= 5;
}

/** Seans saatleri içinde mi (resmî tatiller sağlayıcı verisinden anlaşılır) */
export function inSession(d: Date = new Date()): boolean {
  const c = istClock(d);
  return c.weekday <= 5 && c.minutes >= SESSION_OPEN && c.minutes <= SESSION_CLOSE + 20;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}
