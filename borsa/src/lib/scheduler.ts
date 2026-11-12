import cron from "node-cron";
import { migrate } from "./db";
import { backfillFx, listInstruments, refreshCatalog, refreshFx, refreshQuote } from "./data";
import { generateDailyReport } from "./report";
import { inSession, istClock, isWeekday, TZ } from "./time";

const g = globalThis as unknown as { __scheduler?: boolean };

/**
 * Sunucu içi zamanlayıcı (Europe/Istanbul):
 *  - Hafta içi 18:40: günlük özet (kapanış 18:10; 15 dk gecikmeli veri için pay bırakılır)
 *  - Hafta içi 18:55–23:55 arası 15 dakikada bir ve açılışta: eksik rapor için telafi
 *  - Seans içinde 5 dakikada bir: izleme listesi fiyat yenileme
 */
export function startScheduler() {
  if (g.__scheduler || process.env.DISABLE_SCHEDULER === "1") return;
  g.__scheduler = true;
  const log = (m: string) => console.log(`[zamanlayıcı] ${new Date().toISOString()} ${m}`);
  const report = async (trigger: "zamanlayıcı" | "telafi") => {
    try {
      const o = await generateDailyReport(trigger);
      log(`günlük özet (${trigger}): ${o.message}`);
    } catch (e: any) {
      log(`günlük özet hatası: ${e?.message ?? e}`);
    }
  };
  cron.schedule("40 18 * * 1-5", () => report("zamanlayıcı"), { timezone: TZ });
  cron.schedule("10,25,40,55 19-23 * * 1-5", () => report("telafi"), { timezone: TZ });
  cron.schedule("55 18 * * 1-5", () => report("telafi"), { timezone: TZ });
  cron.schedule("*/5 10-18 * * 1-5", async () => {
    if (!inSession()) return;
    for (const i of await listInstruments("in_watchlist OR type='index'")) await refreshQuote(i);
  }, { timezone: TZ });
  cron.schedule("15 16 * * 1-5", () => { void refreshFx(true); }, { timezone: TZ }); // TCMB bülteni 15:30'da yayımlanır

  // Açılış: şema, katalog, kurlar; rapor saati geçtiyse ya da önceki günün raporu eksikse telafi
  setTimeout(async () => {
    try {
      await migrate();
      await Promise.all([refreshCatalog(), refreshFx()]);
      void backfillFx();
      const c = istClock();
      if (!isWeekday() || c.minutes >= 18 * 60 + 40 || c.minutes < 10 * 60) await report("telafi");
      else log("seans sürüyor; günlük özet 18:40'ta üretilecek");
    } catch (e: any) {
      log(`açılış hatası: ${e?.message ?? e}`);
    }
  }, 3000);
  log("başlatıldı (saat dilimi Europe/Istanbul)");
}
