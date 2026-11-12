import Link from "next/link";
import type { Tick } from "@/lib/market";

const pct = (v: number | null) => (v === null ? "" : `${v > 0 ? "▲" : v < 0 ? "▼" : "•"} %${Math.abs(v).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Üstte kayan piyasa şeridi (fareyle üzerine gelince durur). */
export default function Ticker({ items }: { items: Tick[] }) {
  if (!items.length) return null;
  const row = items.map((t, i) => (
    <Link key={`${t.label}-${i}`} href={t.href ?? "#"} className="flex items-center gap-1.5 whitespace-nowrap px-4 text-xs hover:opacity-80">
      <span className="font-semibold text-slate-200">{t.label}</span>
      <span className="text-slate-400">{t.value}</span>
      <span className={t.changePct === null ? "text-slate-500" : t.changePct > 0 ? "text-emerald-400" : t.changePct < 0 ? "text-red-400" : "text-slate-400"}>{pct(t.changePct)}</span>
    </Link>
  ));
  return (
    <div className="ticker overflow-hidden border-b border-slate-800 bg-[#0a0f1c] py-1.5" aria-label="Piyasa şeridi">
      <div className="ticker-track flex"><div className="flex">{row}</div><div className="flex" aria-hidden="true">{row}</div></div>
    </div>
  );
}
