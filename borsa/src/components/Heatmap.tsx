import Link from "next/link";
import { heatColor } from "@/lib/market";

export interface HeatTile { symbol: string; name: string; value: number | null; weight: number; price: number | null; action?: string }
export interface HeatGroup { name: string; tiles: HeatTile[]; avg: number | null }

const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

/**
 * Sektörlere göre ısı haritası. Kutu büyüklüğü piyasa değerine (karekök ölçekli),
 * rengi seçilen dönemdeki değişime göre belirlenir.
 */
export default function Heatmap({ groups, scale }: { groups: HeatGroup[]; scale: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <div key={g.name} className="rounded-xl border border-slate-200 bg-slate-50 p-1.5">
          <div className="flex items-baseline justify-between px-1 pb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.name}</p>
            <p className="text-[11px] font-semibold" style={{ color: heatColor(g.avg, scale) }}>{pct(g.avg)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {g.tiles.map((t) => (
              <Link key={t.symbol} href={`/hisse/${t.symbol}`} title={`${t.name} · ${pct(t.value)}${t.action ? ` · ${t.action}` : ""}`}
                className="group relative flex min-h-[64px] min-w-[72px] flex-col items-center justify-center rounded-lg px-2 py-2 text-white transition hover:brightness-110 hover:ring-2 hover:ring-white/60"
                style={{ background: heatColor(t.value, scale), flex: `${Math.max(1, t.weight)} 1 0` }}>
                <span className="text-sm font-bold leading-none tracking-tight">{t.symbol}</span>
                <span className="mt-1 text-[11px] font-medium leading-none opacity-95">{pct(t.value)}</span>
                {t.price !== null ? <span className="mt-0.5 text-[10px] leading-none opacity-70">{t.price.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : null}
                {t.action === "AL" ? <span className="absolute right-1 top-1 rounded bg-white/90 px-1 text-[9px] font-bold text-emerald-700">AL</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeatLegend({ scale }: { scale: number }) {
  const steps = [-1, -0.5, -0.2, 0, 0.2, 0.5, 1];
  return (
    <div className="flex items-center gap-1 text-[10px] text-slate-500">
      {steps.map((s) => <span key={s} className="flex flex-col items-center gap-0.5"><span className="h-2.5 w-7 rounded-sm" style={{ background: heatColor(s * scale, scale) }} />{s === 0 ? "0" : `${s > 0 ? "+" : ""}${(s * scale).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`}</span>)}
    </div>
  );
}
