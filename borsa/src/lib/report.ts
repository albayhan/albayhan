import { pool, q } from "./db";
import { analyzeAll } from "./engine";
import { getBars, getMacro, getQuote, refreshBars, refreshQuote } from "./data";
import { istClock, istDate } from "./time";

export interface ReportItem {
  symbol: string;
  name: string;
  type: string;
  held: boolean;
  status: string;
  prevStatus: string | null;
  changeReason: string | null;
  reason: string;
  counter: string;
  changeCondition: string;
  sizeHint: string | null;
  price: number | null;
  priceAsOf: string | null;
  priceKind: string | null;
  priceSource: string | null;
  stale: boolean;
  position: { qty: number; avgCost: number; weightPct: number; plPct: number } | null;
  short: { score: number; signal: string; entryBand: [number, number] | null; stop: number | null; target: number | null; rr: number | null; rrBasis: string | null; conditionMet: boolean; horizon: string } | null;
  long: { view: string; score: number; horizon: string } | null;
  errors: string[];
}
export interface ReportData {
  reportDate: string;
  settings: any;
  portfolio: { totalValue: number; cash: number; dayChange: number; dayChangePct: number | null; totalPL: number; positions: number };
  index: { price: number; changePct: number | null; asOf: string; source: string } | null;
  fx: { series: string; value: number; date: string; source: string }[];
  items: ReportItem[];
  counts: Record<string, number>;
  providerErrors: string[];
}

export interface ReportOutcome {
  created: boolean;
  reportDate: string | null;
  message: string;
}

/** Son tamamlanmış BIST işlem günü (resmî tatiller endeks verisinden anlaşılır). */
export async function lastClosedSession(): Promise<{ date: string | null; open?: boolean; error?: string }> {
  const xu = { symbol: "XU100", type: "index" as const };
  const [rq, rb] = await Promise.all([refreshQuote(xu, true), refreshBars(xu)]);
  const quote = await getQuote("XU100");
  const bars = await getBars("XU100");
  if (!rq.ok && !rb.ok) return { date: null, error: rq.error ?? rb.error };
  const today = istDate();
  if (quote && rq.ok) {
    const qd = istDate(new Date(quote.as_of));
    if (quote.kind === "close" && (qd < today || istClock().minutes >= 18 * 60 + 25)) return { date: qd };
    // Bugün işlem var ve seans kapanmadı: güncel fiyatlarla geçmiş güne rapor yazılmaz.
    if (qd === today) return { date: null, open: true };
  }
  const prev = bars.filter((b) => b.date < today).pop();
  return { date: prev?.date ?? null };
}

/**
 * Günlük özet üretir. Aynı işlem günü için yalnızca bir rapor yazılır:
 * danışma kilidi + birincil anahtar çakışması ikinci çalıştırmayı etkisiz kılar.
 */
export async function generateDailyReport(trigger: "zamanlayıcı" | "elle" | "telafi"): Promise<ReportOutcome> {
  const [run] = await q("INSERT INTO job_runs (job) VALUES ('daily_report') RETURNING id");
  const finish = async (o: ReportOutcome) => {
    await q("UPDATE job_runs SET finished_at=now(), outcome=$2, detail=$3 WHERE id=$1", [run.id, o.created ? "oluşturuldu" : "atlandı", `${trigger}: ${o.message}`]);
    return o;
  };
  const client = await pool().connect();
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(727002) AS ok");
    if (!lock.rows[0].ok) return finish({ created: false, reportDate: null, message: "Başka bir rapor işi çalışıyor." });
    try {
      const session = await lastClosedSession();
      if (session.open) return finish({ created: false, reportDate: null, message: "Seans sürüyor; günlük özet kapanıştan sonra (18:40) üretilir." });
      if (!session.date) return finish({ created: false, reportDate: null, message: `İşlem günü belirlenemedi: ${session.error ?? "endeks verisi yok"}` });
      const reportDate = session.date;
      const exists = await client.query("SELECT 1 FROM daily_reports WHERE report_date=$1", [reportDate]);
      if (exists.rowCount) return finish({ created: false, reportDate, message: `${reportDate} için rapor zaten var; yenisi üretilmedi.` });

      const { items, portfolio, settings } = await analyzeAll({ deep: true, force: true });
      const prevRows = (await client.query(
        "SELECT symbol, status FROM recommendations WHERE report_date=(SELECT max(report_date) FROM daily_reports WHERE report_date < $1)", [reportDate],
      )).rows;
      const prev = new Map<string, string>(prevRows.map((r) => [r.symbol, r.status]));
      const xu = await getQuote("XU100");
      const fx = (await Promise.all(["USDTRY", "EURTRY"].map((s) => getMacro(s)))).filter((x): x is NonNullable<typeof x> => !!x);

      const repItems: ReportItem[] = items.map((a) => {
        const ps = prev.get(a.inst.symbol) ?? null;
        const changed = ps !== null && ps !== a.decision.status;
        return {
          symbol: a.inst.symbol, name: a.inst.name, type: a.inst.type, held: !!a.position,
          status: a.decision.status, prevStatus: ps,
          changeReason: changed ? `${ps} → ${a.decision.status}: ${a.decision.reason}` : null,
          reason: a.decision.reason, counter: a.decision.counter, changeCondition: a.decision.changeCondition, sizeHint: a.decision.sizeHint,
          price: a.quote?.price ?? null, priceAsOf: a.quote?.as_of ?? null, priceKind: a.quote?.kind ?? null, priceSource: a.quote?.source ?? null, stale: a.stale,
          position: a.position,
          short: a.short.ok ? { score: a.short.score, signal: a.short.signal, entryBand: a.short.entryBand, stop: a.short.stop, target: a.short.target, rr: a.short.rr, rrBasis: a.short.rrBasis, conditionMet: a.short.conditionMet, horizon: a.short.horizon } : null,
          long: a.long?.ok ? { view: a.long.view, score: a.long.score, horizon: a.long.horizon } : null,
          errors: a.errors,
        };
      });
      const counts: Record<string, number> = {};
      for (const it of repItems) counts[it.status] = (counts[it.status] ?? 0) + 1;
      const data: ReportData = {
        reportDate, settings,
        portfolio: { totalValue: portfolio.totalValue, cash: portfolio.cash, dayChange: portfolio.dayChange, dayChangePct: portfolio.dayChangePct, totalPL: portfolio.totalPL, positions: portfolio.rows.length },
        index: xu ? { price: xu.price, changePct: xu.prev_close ? (xu.price / xu.prev_close - 1) * 100 : null, asOf: xu.as_of, source: xu.source } : null,
        fx: fx.map((f) => ({ series: f.series, value: f.value, date: f.date, source: f.source })),
        items: repItems, counts,
        providerErrors: [...new Set(repItems.flatMap((i) => i.errors))],
      };

      await client.query("BEGIN");
      const ins = await client.query(
        "INSERT INTO daily_reports (report_date, generated_at, trigger, data) VALUES ($1, now(), $2, $3) ON CONFLICT (report_date) DO NOTHING",
        [reportDate, trigger, JSON.stringify(data)],
      );
      if (!ins.rowCount) {
        await client.query("ROLLBACK");
        return finish({ created: false, reportDate, message: `${reportDate} için rapor zaten var; yenisi üretilmedi.` });
      }
      for (const it of repItems) {
        await client.query(
          "INSERT INTO recommendations (report_date, symbol, status, prev_status, change_reason, data) VALUES ($1,$2,$3,$4,$5,$6)",
          [reportDate, it.symbol, it.status, it.prevStatus, it.changeReason, JSON.stringify(it)],
        );
      }
      await client.query("COMMIT");
      return finish({ created: true, reportDate, message: `${reportDate} raporu üretildi (${repItems.length} enstrüman).` });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      return finish({ created: false, reportDate: null, message: `Hata: ${String(e?.message ?? e)}` });
    } finally {
      await client.query("SELECT pg_advisory_unlock(727002)");
    }
  } finally {
    client.release();
  }
}

export async function getReport(date?: string): Promise<{ report_date: string; generated_at: string; trigger: string; data: ReportData } | null> {
  const rows = date
    ? await q("SELECT * FROM daily_reports WHERE report_date=$1", [date])
    : await q("SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT 1");
  return rows[0] ?? null;
}
export async function listReports(limit = 60) {
  return q("SELECT report_date, generated_at, trigger, data->'counts' AS counts FROM daily_reports ORDER BY report_date DESC LIMIT $1", [limit]);
}
export async function recommendationHistory(symbol: string, limit = 60) {
  return q("SELECT report_date, status, prev_status, change_reason, data FROM recommendations WHERE symbol=$1 ORDER BY report_date DESC LIMIT $2", [symbol, limit]);
}
