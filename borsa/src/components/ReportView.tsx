import Link from "next/link";
import { fmtDate, fmtDateTime, fmtNum, fmtPct, fmtSigned, fmtTL } from "@/lib/format";
import { StatusBadge, tone } from "./ui";
import { detailHref } from "./RecCard";
import type { ReportData } from "@/lib/report";

export function ReportView({ r }: { r: { report_date: string; generated_at: string; trigger: string; data: ReportData } }) {
  const d = r.data;
  const changed = d.items.filter((i) => i.changeReason);
  const held = d.items.filter((i) => i.held), watch = d.items.filter((i) => !i.held);
  const Item = ({ i }: { i: ReportData["items"][number] }) => (
    <article className="card" data-testid={`report-item-${i.symbol}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><Link href={detailHref(i.symbol, i.type)} className="font-semibold hover:underline">{i.symbol}</Link>
          <p className="text-xs text-slate-500">{i.price !== null ? `${fmtNum(i.price)} ₺ · ${i.priceKind === "close" ? "kapanış" : "15 dk gecikmeli"} · ${i.priceSource} · ${fmtDateTime(i.priceAsOf)}` : "Fiyat yok"}{i.stale ? " · güncel değil" : ""}</p></div>
        <div className="flex items-center gap-2">{i.prevStatus && i.prevStatus !== i.status ? <span className="text-xs text-slate-500">{i.prevStatus} →</span> : null}<StatusBadge status={i.status} /></div>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="text-xs font-medium text-slate-500">Neden</dt><dd>{i.reason}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500">Karşı sinyal</dt><dd>{i.counter}</dd></div>
        <div><dt className="text-xs font-medium text-slate-500">Kararı ne değiştirir</dt><dd>{i.changeCondition}</dd></div>
        {i.sizeHint ? <div><dt className="text-xs font-medium text-slate-500">Pozisyon büyüklüğü</dt><dd>{i.sizeHint}</dd></div> : null}
      </dl>
      {i.short && !i.stale ? <p className="mt-2 text-xs text-slate-500">Kısa vade ({i.short.horizon}): giriş {fmtNum(i.short.entryBand?.[0])}–{fmtNum(i.short.entryBand?.[1])}, zarar-kes {fmtNum(i.short.stop)}, hedef {fmtNum(i.short.target)}, R/Ö {fmtNum(i.short.rr)} ({i.short.rrBasis}){i.long ? ` · Uzun vade (${i.long.horizon}): ${i.long.view === "olumlu" ? "olumlu" : i.long.view === "olumsuz" ? "olumsuz" : "nötr"}` : ""}</p> : null}
      {i.errors.length ? <p className="mt-2 text-[11px] text-amber-700">Veri uyarısı: {i.errors.join(" · ")}</p> : null}
    </article>
  );
  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h-sec">{fmtDate(d.reportDate)} işlem günü özeti</h2>
          <p className="text-[11px] text-slate-500">Üretildi: {fmtDateTime(r.generated_at)} ({r.trigger})</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-slate-500">Portföy değeri</p><p className="font-semibold">{fmtTL(d.portfolio.totalValue)}</p></div>
          <div><p className="text-xs text-slate-500">Günlük değişim</p><p className={`font-semibold ${tone(d.portfolio.dayChange)}`}>{fmtSigned(d.portfolio.dayChange)} {d.portfolio.dayChangePct !== null ? `(${fmtPct(d.portfolio.dayChangePct)})` : ""}</p></div>
          <div><p className="text-xs text-slate-500">BIST 100</p><p className="font-semibold">{d.index ? fmtNum(d.index.price) : "—"} <span className={tone(d.index?.changePct)}>{d.index ? fmtPct(d.index.changePct) : ""}</span></p></div>
          <div><p className="text-xs text-slate-500">Nakit</p><p className="font-semibold">{fmtTL(d.portfolio.cash)}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{Object.entries(d.counts).map(([k, v]) => <span key={k} className="flex items-center gap-1.5 text-xs"><StatusBadge status={k} /> {v}</span>)}</div>
        <p className="mt-3 text-[11px] text-slate-500">
          {d.index ? `BIST 100: ${d.index.source}, ${fmtDateTime(d.index.asOf)}` : ""}{d.fx.map((f) => ` · ${f.series.replace("TRY", "/TRY")} ${fmtNum(f.value, 4)} (${f.source}, ${fmtDate(f.date)})`).join("")} · Risk profili: {d.settings?.risk}
        </p>
        {d.providerErrors.length ? <p className="mt-2 text-xs text-amber-700">Rapor sırasında veri sorunu: {d.providerErrors.join(" · ")}</p> : null}
      </section>
      {changed.length ? (
        <section className="card"><h3 className="h-sec">Önceki rapora göre değişenler</h3>
          <ul className="mt-2 space-y-2 text-sm">{changed.map((i) => <li key={i.symbol}><span className="font-semibold">{i.symbol}:</span> {i.changeReason}</li>)}</ul></section>
      ) : null}
      {held.length ? <><h3 className="h-sec">Portföydeki pozisyonlar</h3><div className="grid gap-3 lg:grid-cols-2">{held.map((i) => <Item key={i.symbol} i={i} />)}</div></> : null}
      {watch.length ? <><h3 className="h-sec">İzleme listesi</h3><div className="grid gap-3 lg:grid-cols-2">{watch.map((i) => <Item key={i.symbol} i={i} />)}</div></> : null}
    </div>
  );
}
