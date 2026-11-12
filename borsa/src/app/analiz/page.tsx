import Link from "next/link";
import { analyzeAll } from "@/lib/engine";
import { fmtNum, fmtPct } from "@/lib/format";
import { RISK } from "@/lib/settings";
import { RecCard, detailHref } from "@/components/RecCard";
import { Notice } from "@/components/ui";
import { saveSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

const VIEW: Record<string, { label: string; cls: string }> = {
  olumlu: { label: "Olumlu", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  notr: { label: "Nötr", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  olumsuz: { label: "Olumsuz", cls: "bg-red-50 text-red-800 ring-red-200" },
  veri_yetersiz: { label: "Veri yetersiz", cls: "bg-white text-slate-500 ring-slate-300" },
};

export default async function Analiz({ searchParams }: { searchParams: Promise<{ vade?: string }> }) {
  const tab = (await searchParams).vade === "uzun" ? "uzun" : "kisa";
  const { items, settings } = await analyzeAll({ deep: true });
  const stocks = items.filter((a) => a.long);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Analiz</h1>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Vade ve risk ayarları <span className="font-normal text-slate-500">— kısa vade {settings.shortMinWeeks}–{settings.shortMaxWeeks} hafta · uzun vade {settings.longMinMonths}–{settings.longMaxMonths} ay · {RISK[settings.risk].label}</span></summary>
        <form action={saveSettingsAction} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="risk">Risk profili</label>
            <select id="risk" name="risk" defaultValue={settings.risk} className="input">{Object.entries(RISK).map(([k, v]) => <option key={k} value={k}>{v.label} (R/Ö ≥ {fmtNum(v.minRR, 1)}, ağırlık ≤ %{v.maxWeightPct})</option>)}</select></div>
          <div><label className="label" htmlFor="smin">Kısa vade en az (hafta)</label><input id="smin" className="input" type="number" name="shortMinWeeks" min={1} max={26} defaultValue={settings.shortMinWeeks} /></div>
          <div><label className="label" htmlFor="smax">Kısa vade en çok (hafta)</label><input id="smax" className="input" type="number" name="shortMaxWeeks" min={1} max={26} defaultValue={settings.shortMaxWeeks} /></div>
          <div><label className="label" htmlFor="lmin">Uzun vade en az (ay)</label><input id="lmin" className="input" type="number" name="longMinMonths" min={3} max={60} defaultValue={settings.longMinMonths} /></div>
          <div><label className="label" htmlFor="lmax">Uzun vade en çok (ay)</label><input id="lmax" className="input" type="number" name="longMaxMonths" min={3} max={60} defaultValue={settings.longMaxMonths} /></div>
          <div className="col-span-2 sm:col-span-5"><button className="btn">Ayarları kaydet</button></div>
        </form>
      </details>

      <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1 sm:w-fit" role="tablist">
        <Link href="/analiz" role="tab" aria-selected={tab === "kisa"} className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium ${tab === "kisa" ? "bg-white shadow-sm" : "text-slate-600"}`}>Kısa vade ({settings.shortMinWeeks}–{settings.shortMaxWeeks} hafta)</Link>
        <Link href="/analiz?vade=uzun" role="tab" aria-selected={tab === "uzun"} className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium ${tab === "uzun" ? "bg-white shadow-sm" : "text-slate-600"}`}>Uzun vade ({settings.longMinMonths}–{settings.longMaxMonths} ay)</Link>
      </div>

      <Notice kind="info">Öneriler kural tabanlı bir modelin çıktısıdır; yatırım tavsiyesi değildir. Her kartta kullanılan veri, kaynağı ve tarihiyle gösterilir.</Notice>

      {tab === "kisa" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((a) => (
            <div key={a.inst.symbol} className="space-y-0">
              <RecCard a={a} />
              {a.short.ok ? (
                <div className="-mt-2 rounded-b-2xl border border-t-0 border-slate-200 bg-white px-4 pb-4 pt-4 text-sm sm:px-5">
                  <p className="text-xs font-medium text-slate-500">Giriş koşulu {a.short.conditionMet ? <span className="text-up">— sağlanıyor</span> : <span className="text-down">— sağlanmıyor</span>}</p>
                  <p>{a.short.entryCondition}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {a.short.components.map((c) => <li key={c.name}><span className="font-medium text-slate-800">{c.name}{c.max ? ` (${c.score > 0 ? "+" : ""}${c.score}/${c.max})` : ""}:</span> {c.value}</li>)}
                  </ul>
                  {a.short.catalysts.length ? <p className="mt-2 text-xs text-slate-600"><span className="font-medium text-slate-800">Katalizör:</span> {a.short.catalysts.slice(0, 2).map((c) => c.title).join(" · ")}</p> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {stocks.map((a) => {
            const l = a.long!;
            return (
              <article key={a.inst.symbol} className="card" data-testid={`long-${a.inst.symbol}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><Link href={detailHref(a.inst.symbol, a.inst.type)} className="text-base font-semibold hover:underline">{a.inst.symbol}</Link><p className="text-xs text-slate-500">{a.inst.name}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${VIEW[l.view].cls}`}>{VIEW[l.view].label}</span>
                </div>
                {!l.ok ? <p className="mt-3 text-sm text-slate-600">{l.reasons[0]}</p> : (
                  <>
                    <p className="mt-2 text-sm">{l.thesis}</p>
                    <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {l.pillars.map((p) => (
                        <li key={p.name} className="rounded-xl bg-slate-50 p-2.5"><p className="font-medium text-slate-500">{p.name} <span className={p.score > 0 ? "text-up" : p.score < 0 ? "text-down" : ""}>({p.score > 0 ? "+" : ""}{p.score})</span></p><p className="font-semibold text-slate-900">{p.value}</p></li>
                      ))}
                    </ul>
                    {l.scenarios.length ? (
                      <table className="mt-3 w-full text-sm">
                        <thead><tr><th className="th !px-0">Senaryo</th><th className="th text-right">Model fiyatı</th><th className="th !pr-0 text-right">Bugüne göre</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{l.scenarios.map((s) => <tr key={s.name}><td className="py-1.5 font-medium">{s.name}</td><td className="py-1.5 text-right">{fmtNum(s.targetPrice)} ₺</td><td className={`py-1.5 text-right font-medium ${s.returnPct >= 0 ? "text-up" : "text-down"}`}>{fmtPct(s.returnPct, 0)}</td></tr>)}</tbody>
                      </table>
                    ) : <p className="mt-3 text-xs text-slate-500">Senaryo hesaplanamadı (FAVÖK pozitif değil ya da piyasa değeri yok).</p>}
                    <p className="mt-2 text-xs text-slate-600"><span className="font-medium text-slate-800">Tezi değiştirir:</span> {l.thesisChangers.slice(0, 3).join(" · ")}</p>
                    <p className="mt-2 text-[11px] text-slate-500">Kaynak: {a.statementsMeta.source} · Dönem: {l.metrics?.period} · Varsayımlar ve emsaller hisse detayında.</p>
                  </>
                )}
              </article>
            );
          })}
          {items.filter((a) => !a.long).map((a) => <article key={a.inst.symbol} className="card"><p className="font-semibold">{a.inst.symbol}</p><p className="mt-1 text-sm text-slate-600">Fonlar için bilanço analizi uygulanmaz; getiri ve risk bilgisi fon detayındadır.</p><Link className="mt-2 inline-block text-sm underline" href={detailHref(a.inst.symbol, a.inst.type)}>Fon detayı</Link></article>)}
        </div>
      )}
    </div>
  );
}
