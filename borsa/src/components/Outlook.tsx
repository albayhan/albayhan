import type { ChartAnalysis, Outlook } from "@/lib/chartAnalysis";
import type { Explanation } from "@/lib/explain";
import { ActionBadge } from "./ui";

const nf = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pf = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);

const STYLE = {
  yukari: { arrow: "M5 19 19 5M9 5h10v10", text: "text-up", bg: "from-emerald-500/15 to-emerald-500/0", ring: "ring-emerald-500/30", label: "Yukarı" },
  asagi: { arrow: "M5 5l14 14M19 9v10H9", text: "text-down", bg: "from-red-500/15 to-red-500/0", ring: "ring-red-500/30", label: "Aşağı" },
  yatay: { arrow: "M4 12h16M14 6l6 6-6 6", text: "text-slate-500", bg: "from-slate-400/15 to-slate-400/0", ring: "ring-slate-400/30", label: "Yatay" },
};

export function OutlookCard({ o, sub }: { o: Outlook; sub?: string }) {
  const st = STYLE[o.dir];
  const pos = (o.score + 100) / 2;
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 ring-1 ring-inset ${st.bg} ${st.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{o.horizon} görünümü</p>
          <p className={`mt-0.5 text-2xl font-bold tracking-tight ${st.text}`}>{st.label}</p>
          <p className="text-xs text-slate-500">güven: <b className="text-slate-700">{o.confidence}</b> · puan {o.score > 0 ? "+" : ""}{o.score}</p>
        </div>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={st.text} aria-hidden><path d={st.arrow} /></svg>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-gradient-to-r from-red-500/60 via-slate-300 to-emerald-500/60">
        <div className="absolute -top-1 h-3.5 w-1.5 -translate-x-1/2 rounded bg-slate-900" style={{ left: `${pos}%` }} />
      </div>
      <ul className="mt-3 space-y-1 text-xs text-slate-600">{o.why.map((w) => <li key={w} className="flex gap-1.5"><span className={w.startsWith("▲") ? "text-up" : "text-down"}>{w[0]}</span><span>{w.slice(2)}</span></li>)}</ul>
      {sub ? <p className="mt-2 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function OddsPanel({ ch }: { ch: ChartAnalysis }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ch.odds.map((o) => {
        const label = o.horizon <= 10 ? "2 hafta sonra" : "2 ay sonra";
        const enough = o.n >= 15 && o.episodes >= 5;
        return (
          <div key={o.horizon} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">Geçmişte benzer durum → {label}</p>
            {o.upPct !== null ? (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${o.upPct >= 50 ? "text-up" : "text-down"}`}>%{Math.round(o.upPct)}</span>
                  <span className="text-xs text-slate-500">yükselme oranı · {o.n} gün, {o.episodes} ayrı dönem{enough ? "" : " (az örnek, güvenilirlik düşük)"}</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-red-500/30"><div className="h-full bg-up" style={{ width: `${o.upPct}%` }} /></div>
                <p className="mt-2 text-[11px] text-slate-600">Ortanca getiri <b className={o.medianPct! >= 0 ? "text-up" : "text-down"}>{pf(o.medianPct)}</b> · çoğu sonuç {pf(o.p25)} ile {pf(o.p75)} arasında</p>
                <p className="text-[11px] text-slate-500">Karşılaştırma: bu hissede tüm günler için {label} yükselme oranı %{Math.round(o.baseUpPct ?? 0)} (ortanca {pf(o.baseMedianPct)}).</p>
              </>
            ) : <p className="mt-1 text-sm text-slate-600">Bu durum geçmişte görülmemiş.</p>}
          </div>
        );
      })}
      <p className="text-[11px] text-slate-500 sm:col-span-2">Benzer durum: {ch.odds[0]?.state}. Son 3 yılda bu koşulların aynen oluştuğu günler bulunup sonraki getirileri sayıldı; birbirine 10 günden yakın günler aynı dönem sayılır, 5'ten az ayrı dönem varsa sonuç yön kararına katılmaz. Geçmiş sıklık, gelecek için garanti değildir.</p>
    </div>
  );
}

export function ExplanationView({ e, action }: { e: Explanation; action: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <ActionBadge action={action} size="lg" />
        <p className="text-lg font-semibold tracking-tight">{e.headline.split(" — ")[1] ?? e.headline}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{e.summary}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-800">▲ Alım yönündeki gerekçeler ({e.bull.length})</p>
          {e.bull.length ? <ul className="mt-2 space-y-1.5 text-sm">{e.bull.map((x) => <li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-up" /><span>{x}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">Belirgin olumlu gerekçe yok.</p>}
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">▼ Satış / temkin yönündeki gerekçeler ({e.bear.length})</p>
          {e.bear.length ? <ul className="mt-2 space-y-1.5 text-sm">{e.bear.map((x) => <li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-down" /><span>{x}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">Belirgin olumsuz gerekçe yok.</p>}
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">🎯 Ne yapılabilir</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{e.plan.map((x) => <li key={x}>{x}</li>)}</ol>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">👀 Kararı ne değiştirir</p>
          <ul className="mt-2 space-y-1 text-sm">{e.watch.map((x) => <li key={x} className="flex gap-2"><span className="text-slate-400">→</span><span>{x}</span></li>)}</ul>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Bu açıklama kural tabanlı modelin çıktısıdır; yatırım tavsiyesi değildir.</p>
    </div>
  );
}

export function PatternList({ ch }: { ch: ChartAnalysis }) {
  if (!ch.patterns.length) return <p className="text-sm text-slate-600">Şu an belirgin bir formasyon yok.</p>;
  const sorted = [...ch.patterns].sort((a, b) => b.strength - a.strength);
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {sorted.map((p) => (
        <li key={p.key} className={`rounded-xl border p-3 ${p.bias > 0 ? "border-emerald-200 bg-emerald-50" : p.bias < 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-semibold ${p.bias > 0 ? "text-emerald-800" : p.bias < 0 ? "text-red-800" : "text-slate-800"}`}>{p.bias > 0 ? "▲" : p.bias < 0 ? "▼" : "◆"} {p.title}</p>
            <span className="text-[10px] tracking-widest text-slate-400">{"●".repeat(p.strength)}{"○".repeat(3 - p.strength)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">{p.detail}</p>
          {p.date ? <p className="mt-1 text-[10px] text-slate-400">{p.date.split("-").reverse().join(".")}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function ScenarioCards({ ch }: { ch: ChartAnalysis }) {
  const c5 = ch.cones.find((c) => c.horizon === 5), c20 = ch.cones.find((c) => c.horizon === 20);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {ch.scenarios.map((s) => (
        <div key={s.name} className={`rounded-xl p-3 ring-1 ring-inset ${s.bias > 0 ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}>
          <p className={`text-sm font-semibold ${s.bias > 0 ? "text-emerald-800" : "text-red-800"}`}>{s.bias > 0 ? "📈" : "📉"} {s.name}</p>
          <p className="mt-1 text-xs text-slate-600">Tetikleyici: <b className="text-slate-800">{s.trigger}</b></p>
          <p className="text-xs text-slate-600">Olası hedef: <b className="text-slate-800">{nf(s.target)} ₺</b> ({pf(s.target ? (s.target / ch.price - 1) * 100 : null)})</p>
          <p className="mt-1 text-[11px] text-slate-500">{s.note}</p>
        </div>
      ))}
      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
        <p className="text-sm font-semibold">📊 Olası fiyat aralığı</p>
        <table className="mt-1 w-full text-xs">
          <thead><tr className="text-slate-500"><th className="py-1 text-left font-medium">Süre</th><th className="py-1 text-right font-medium">%68</th><th className="py-1 text-right font-medium">%95</th></tr></thead>
          <tbody>
            {[c5, c20].filter(Boolean).map((c) => <tr key={c!.horizon}><td className="py-0.5">{c!.horizon === 5 ? "1 hafta" : "1 ay"}</td><td className="py-0.5 text-right font-medium">{nf(c!.low68)} – {nf(c!.high68)}</td><td className="py-0.5 text-right text-slate-500">{nf(c!.low95)} – {nf(c!.high95)}</td></tr>)}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-500">Son 60 günün günlük oynaklığına (%{nf(c5?.sigmaDailyPct)}) göre; yön değil, salınım genişliği.</p>
      </div>
    </div>
  );
}
