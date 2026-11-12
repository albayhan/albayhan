import Link from "next/link";
import { StatusBadge, KindBadge } from "./ui";
import { fmtNum, fmtPct, fmtDateTime } from "@/lib/format";
import type { Analyzed } from "@/lib/engine";

export const detailHref = (symbol: string, type: string) => (type === "fund" ? `/fon/${symbol}` : `/hisse/${symbol}`);

/** Karar kartı: durum, neden, karşı sinyal, kararı değiştirecek koşul */
export function RecCard({ a, compact = false }: { a: Analyzed; compact?: boolean }) {
  const d = a.decision, s = a.short;
  const chg = a.quote?.prev_close ? (a.quote.price / a.quote.prev_close - 1) * 100 : null;
  return (
    <article className="card" data-testid={`rec-${a.inst.symbol}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={detailHref(a.inst.symbol, a.inst.type)} className="text-base font-semibold hover:underline">{a.inst.symbol}</Link>
          <p className="truncate text-xs text-slate-500">{a.inst.name}{a.position ? ` · portföyde %${fmtNum(a.position.weightPct, 1)}` : " · izleme listesi"}</p>
        </div>
        <StatusBadge status={d.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-lg font-semibold">{a.quote ? fmtNum(a.quote.price) + " ₺" : "—"}</span>
        {chg !== null ? <span className={`text-sm font-medium ${chg > 0 ? "text-up" : chg < 0 ? "text-down" : ""}`}>{fmtPct(chg)}</span> : null}
        <KindBadge quote={a.quote} stale={a.stale} />
        {a.quote ? <span className="text-[11px] text-slate-500">{a.quote.source} · {fmtDateTime(a.quote.as_of)}</span> : null}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="text-xs font-medium text-slate-500">Neden</dt><dd>{d.reason}</dd></div>
        {!compact ? <div><dt className="text-xs font-medium text-slate-500">Karşı sinyal</dt><dd>{d.counter}</dd></div> : null}
        <div><dt className="text-xs font-medium text-slate-500">Kararı ne değiştirir</dt><dd>{d.changeCondition}</dd></div>
        {d.sizeHint && !compact ? <div><dt className="text-xs font-medium text-slate-500">Pozisyon büyüklüğü</dt><dd>{d.sizeHint}</dd></div> : null}
      </dl>
      {s.ok && !compact && !a.stale ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
          <div><p className="text-slate-500">Giriş bandı</p><p className="font-semibold">{fmtNum(s.entryBand![0])}–{fmtNum(s.entryBand![1])}</p></div>
          <div><p className="text-slate-500">Zarar-kes</p><p className="font-semibold">{fmtNum(s.stop)}</p></div>
          <div><p className="text-slate-500">Hedef</p><p className="font-semibold">{fmtNum(s.target)}</p></div>
          <div><p className="text-slate-500">Risk/ödül ({s.rrBasis})</p><p className={`font-semibold ${s.rr! >= s.minRR ? "text-up" : "text-down"}`}>{fmtNum(s.rr)}</p></div>
        </div>
      ) : null}
      {a.errors.length ? <p className="mt-2 text-[11px] text-amber-700">Veri uyarısı: {a.errors.join(" · ")}</p> : null}
    </article>
  );
}
