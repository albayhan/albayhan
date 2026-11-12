import Link from "next/link";
import { q } from "@/lib/db";
import { getReport, listReports } from "@/lib/report";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ReportView } from "@/components/ReportView";
import { RunReportButton } from "@/components/forms";
import { StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Ozet() {
  const [latest, list, runs, changes] = await Promise.all([
    getReport(), listReports(),
    q("SELECT * FROM job_runs WHERE job='daily_report' ORDER BY id DESC LIMIT 5"),
    q("SELECT report_date, symbol, change_reason FROM recommendations WHERE change_reason IS NOT NULL ORDER BY report_date DESC, symbol LIMIT 30"),
  ]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold tracking-tight">Günlük Özet</h1><p className="text-xs text-slate-500">Her BIST işlem günü kapanışından sonra 18:40'ta (Europe/Istanbul) otomatik üretilir. Aynı gün için tek rapor yazılır.</p></div>
        <RunReportButton />
      </div>
      {latest ? <ReportView r={latest} /> : <div className="card text-sm text-slate-600">Henüz rapor üretilmedi. İlk rapor, bir sonraki seans kapanışından sonra otomatik oluşur.</div>}

      <section className="card"><h2 className="h-sec">Öneri değişiklikleri</h2>
        {changes.length ? <ul className="mt-2 space-y-2 text-sm">{changes.map((c) => <li key={c.report_date + c.symbol}><span className="text-slate-500">{fmtDate(c.report_date)}</span> · <Link className="font-semibold underline" href={`/hisse/${c.symbol}#gecmis`}>{c.symbol}</Link>: {c.change_reason}</li>)}</ul>
          : <p className="mt-2 text-sm text-slate-600">Henüz durum değiştiren bir öneri yok. Değişiklikler gerekçesiyle burada listelenir.</p>}
      </section>

      <section className="card"><h2 className="h-sec">Geçmiş raporlar</h2>
        {list.length ? (
          <ul className="mt-2 divide-y divide-slate-100">{list.map((r) => (
            <li key={r.report_date} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <Link href={`/ozet/${r.report_date}`} className="text-sm font-semibold underline">{fmtDate(r.report_date)}</Link>
              <div className="flex flex-wrap gap-2">{Object.entries(r.counts ?? {}).map(([k, v]) => <span key={k} className="flex items-center gap-1 text-xs"><StatusBadge status={k} /> {String(v)}</span>)}</div>
            </li>))}</ul>
        ) : <p className="mt-2 text-sm text-slate-600">Kayıtlı rapor yok.</p>}
      </section>

      <section className="card"><h2 className="h-sec">Zamanlanmış iş kayıtları</h2>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">{runs.map((r) => <li key={r.id}>{fmtDateTime(r.started_at)} · <span className="font-medium text-slate-800">{r.outcome ?? "sürüyor"}</span> · {r.detail}</li>)}{runs.length === 0 ? <li>Kayıt yok.</li> : null}</ul>
      </section>
    </div>
  );
}
