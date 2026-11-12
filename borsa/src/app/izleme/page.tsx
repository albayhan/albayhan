import Link from "next/link";
import { getQuotes, isStale, listInstruments, refreshQuote } from "@/lib/data";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { KindBadge, tone } from "@/components/ui";
import { SearchAdd } from "@/components/forms";
import { detailHref } from "@/components/RecCard";
import { removeFromWatchlistAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Izleme() {
  const insts = await listInstruments("in_watchlist");
  const refreshed = new Map(await Promise.all(insts.map(async (i) => [i.symbol, await refreshQuote(i)] as const)));
  const quotes = await getQuotes(insts.map((i) => i.symbol));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">İzleme Listesi</h1>
      <section className="card"><SearchAdd /></section>
      <section className="card !p-0">
        <ul className="divide-y divide-slate-100">
          {insts.map((i) => {
            const qt = quotes.get(i.symbol) ?? null;
            const r = refreshed.get(i.symbol);
            const stale = isStale(qt, r);
            const chg = qt?.prev_close ? (qt.price / qt.prev_close - 1) * 100 : null;
            return (
              <li key={i.symbol} className="flex items-center gap-3 px-4 py-3 sm:px-5" data-testid={`watch-${i.symbol}`}>
                <Link href={detailHref(i.symbol, i.type)} className="min-w-0 flex-1">
                  <p className="font-semibold">{i.symbol} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{i.type === "fund" ? "Fon" : "Hisse"}</span></p>
                  <p className="truncate text-xs text-slate-500">{i.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{qt ? `${qt.source} · ${fmtDateTime(qt.as_of)}` : r && !r.ok ? `Veri yetersiz: ${r.error}` : "Veri yetersiz"}</p>
                </Link>
                <div className="text-right">
                  <p className="text-base font-semibold">{qt ? fmtNum(qt.price, i.type === "fund" ? 6 : 2) : "—"}</p>
                  <p className={`text-sm font-medium ${tone(chg)}`}>{fmtPct(chg)}</p>
                  <KindBadge quote={qt} stale={stale} />
                </div>
                <form action={removeFromWatchlistAction}><input type="hidden" name="symbol" value={i.symbol} /><button className="min-h-[40px] px-2 text-xs text-slate-500 underline" aria-label={`${i.symbol} listeden çıkar`}>Çıkar</button></form>
              </li>
            );
          })}
          {insts.length === 0 ? <li className="px-4 py-4 text-sm text-slate-600">Liste boş. Yukarıdan hisse ya da fon ekleyin.</li> : null}
        </ul>
      </section>
    </div>
  );
}
