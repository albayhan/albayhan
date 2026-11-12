import Link from "next/link";
import { getLastScan, runScan, scanIsOld, scanProgress } from "@/lib/scan";
import { fxSeries, indexCard, kapFeed, PERIODS, sectorOf, type Period } from "@/lib/market";
import { getQuotes, refreshFx } from "@/lib/data";
import { kapLink } from "@/lib/providers/kap";
import { fmtDate, fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { ActionBadge, tone } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import Heatmap, { HeatLegend, type HeatGroup } from "@/components/Heatmap";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const SCALE: Record<Period, number> = { gun: 4, ay: 15, "3ay": 30, yil: 80 };

export default async function Piyasa({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const period = PERIODS.find((x) => x.k === sp.p) ?? PERIODS[0];
  await refreshFx();
  const [scan, idx, fx, feed] = await Promise.all([getLastScan(), indexCard(), fxSeries(["USD", "EUR", "GBP"]), kapFeed(20)]);
  if (scanIsOld(scan) && !scanProgress()?.running) void runScan();
  const running = scanProgress()?.running ?? false;
  const rows = (scan?.rows ?? []).filter((r) => r.price !== null);
  const caps = await getQuotes(rows.map((r) => r.symbol));
  const capMax = Math.max(1, ...rows.map((r) => caps.get(r.symbol)?.market_cap ?? 0));

  const bySector = new Map<string, HeatGroup>();
  for (const r of rows) {
    const s = sectorOf(r.symbol);
    const g = bySector.get(s) ?? { name: s, tiles: [], avg: null };
    const cap = caps.get(r.symbol)?.market_cap ?? 0;
    g.tiles.push({ symbol: r.symbol, name: r.name, value: period.get(r), weight: Math.round(Math.sqrt(cap / capMax) * 4 * 10) / 10 || 1, price: r.price, action: r.action });
    bySector.set(s, g);
  }
  const groups = [...bySector.values()].map((g) => {
    const vals = g.tiles.map((t) => t.value).filter((v): v is number => v !== null);
    g.tiles.sort((a, b) => b.weight - a.weight);
    return { ...g, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  }).sort((a, b) => b.tiles.reduce((x, t) => x + t.weight, 0) - a.tiles.reduce((x, t) => x + t.weight, 0));

  const ranked = rows.filter((r) => period.get(r) !== null).sort((a, b) => period.get(b)! - period.get(a)!);
  const gainers = ranked.slice(0, 5), losers = ranked.slice(-5).reverse();
  const sectorRank = [...groups].filter((g) => g.avg !== null).sort((a, b) => b.avg! - a.avg!);
  const maxAbs = Math.max(0.01, ...sectorRank.map((g) => Math.abs(g.avg!)));

  return (
    <div className="space-y-5">
      {running && !scan ? <AutoRefresh ms={4000} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Piyasa</h1>
          <p className="text-xs text-slate-500">{scan ? `${rows.length} büyük hisse · son tarama ${fmtDateTime(scan.at)}` : "Hisseler taranıyor…"} · fiyatlar 15 dk gecikmeli</p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Endeks ve kurlar">
        {idx ? (
          <div className="card card-hover relative overflow-hidden !p-4">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-emerald-500" />
            <p className="text-xs font-medium text-slate-500">BIST 100</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-semibold tracking-tight">{fmtNum(idx.price, 0)}</p>
                <p className={`text-sm font-medium ${tone(idx.changePct)}`}>{fmtPct(idx.changePct)}</p>
              </div>
              <Sparkline data={idx.spark} width={110} height={44} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">1 ay <span className={tone(idx.ret1m)}>{fmtPct(idx.ret1m, 1)}</span> · 1 yıl <span className={tone(idx.ret1y)}>{fmtPct(idx.ret1y, 1)}</span> · {idx.source}</p>
          </div>
        ) : <div className="card text-sm text-slate-500">BIST 100 verisi yok</div>}
        {fx.map((f) => (
          <div key={f.code} className="card card-hover !p-4">
            <p className="text-xs font-medium text-slate-500">{f.code}/TRY <span className="text-slate-400">· TCMB alış</span></p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-semibold tracking-tight">{fmtNum(f.value, 4)}</p>
                <p className={`text-sm font-medium ${tone(f.changePct)}`}>{fmtPct(f.changePct)}</p>
              </div>
              <Sparkline data={f.spark} width={110} height={44} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">30 gün <span className={tone(f.change30d)}>{fmtPct(f.change30d, 1)}</span> · bülten {fmtDate(f.date)}</p>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Isı haritası">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="h-sec">Isı haritası</h2>
            <p className="text-xs text-slate-500">Kutu büyüklüğü piyasa değeri, renk {period.label.toLowerCase()} değişim. Kutuya tıklayınca hisse açılır.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
              {PERIODS.map((x) => <Link key={x.k} href={`/piyasa?p=${x.k}`} aria-selected={x.k === period.k} className={`chip ${x.k === period.k ? "bg-white shadow-sm text-slate-900" : "text-slate-600"}`}>{x.label}</Link>)}
            </div>
            <HeatLegend scale={SCALE[period.k]} />
          </div>
        </div>
        {groups.length ? <Heatmap groups={groups} scale={SCALE[period.k]} /> : <p className="text-sm text-slate-600">İlk tarama sürüyor; ısı haritası birazdan dolacak.</p>}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="card" aria-label="En çok yükselenler">
          <h2 className="h-sec">🚀 En çok yükselenler <span className="text-xs font-normal text-slate-500">· {period.label.toLowerCase()}</span></h2>
          <ul className="mt-2 divide-y divide-slate-100">{gainers.map((r, i) => (
            <li key={r.symbol} className="flex items-center gap-3 py-2">
              <span className="w-4 text-xs text-slate-400">{i + 1}</span>
              <div className="w-20"><Link href={`/hisse/${r.symbol}`} className="font-semibold hover:underline">{r.symbol}</Link><p className="text-[11px] text-slate-500">{fmtNum(r.price)} ₺</p></div>
              <Sparkline data={r.spark} width={80} height={26} />
              <span className="ml-auto text-sm font-semibold text-up">{fmtPct(period.get(r), 1)}</span>
            </li>))}</ul>
        </section>
        <section className="card" aria-label="En çok düşenler">
          <h2 className="h-sec">📉 En çok düşenler <span className="text-xs font-normal text-slate-500">· {period.label.toLowerCase()}</span></h2>
          <ul className="mt-2 divide-y divide-slate-100">{losers.map((r, i) => (
            <li key={r.symbol} className="flex items-center gap-3 py-2">
              <span className="w-4 text-xs text-slate-400">{i + 1}</span>
              <div className="w-20"><Link href={`/hisse/${r.symbol}`} className="font-semibold hover:underline">{r.symbol}</Link><p className="text-[11px] text-slate-500">{fmtNum(r.price)} ₺</p></div>
              <Sparkline data={r.spark} width={80} height={26} />
              <span className={`ml-auto text-sm font-semibold ${tone(period.get(r))}`}>{fmtPct(period.get(r), 1)}</span>
            </li>))}</ul>
        </section>
        <section className="card" aria-label="Sektör performansı">
          <h2 className="h-sec">🏭 Sektörler <span className="text-xs font-normal text-slate-500">· ortalama, {period.label.toLowerCase()}</span></h2>
          <ul className="mt-3 space-y-2">{sectorRank.map((g) => (
            <li key={g.name} className="text-xs">
              <div className="flex justify-between"><span className="font-medium">{g.name} <span className="text-slate-400">({g.tiles.length})</span></span><span className={`font-semibold ${tone(g.avg)}`}>{fmtPct(g.avg, 1)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${g.avg! >= 0 ? "bg-up" : "bg-down"}`} style={{ width: `${(Math.abs(g.avg!) / maxAbs) * 100}%` }} /></div>
            </li>))}</ul>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <section className="card" aria-label="KAP haber akışı">
          <h2 className="h-sec">📰 KAP haber akışı</h2>
          <p className="text-xs text-slate-500">İzlenen ve taranan şirketlerin son 30 gündeki önemli bildirimleri (rutin borsa duyuruları hariç)</p>
          {feed.length ? (
            <ul className="mt-2 divide-y divide-slate-100">{feed.map((f) => (
              <li key={f.id} className="flex gap-3 py-2.5">
                <Link href={`/hisse/${f.symbol}`} className="mt-0.5 h-fit w-16 shrink-0 rounded-md bg-slate-100 px-1.5 py-1 text-center text-xs font-bold hover:bg-slate-200">{f.symbol}</Link>
                <div className="min-w-0">
                  <a href={kapLink(f.id)} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">{f.title}</a>
                  <p className="text-[11px] text-slate-500">{fmtDateTime(f.published_at)}{f.subject && f.subject !== f.title ? ` · ${f.subject}` : ""}</p>
                </div>
              </li>))}</ul>
          ) : <p className="mt-2 text-sm text-slate-600">Henüz bildirim yok; tarama tamamlandığında dolacak.</p>}
          <p className="mt-2 text-[11px] text-slate-500">Kaynak: KAP (kap.org.tr). Başlığa tıklayınca bildirim KAP'ta açılır.</p>
        </section>
        <section className="card" aria-label="Model özeti">
          <h2 className="h-sec">🧭 Modelin bugünkü görüşü</h2>
          {scan ? (
            <>
              <ul className="mt-3 space-y-2 text-sm">
                {(["AL", "İZLE", "TUT", "BEKLE", "AZALT", "SAT", "UZAK DUR"] as const).map((a) => {
                  const n = scan.rows.filter((r) => r.action === a).length;
                  return n ? <li key={a} className="flex items-center gap-2"><span className="w-20"><ActionBadge action={a} /></span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${(n / scan.rows.length) * 100}%` }} /></div><span className="w-6 text-right text-xs font-semibold">{n}</span></li> : null;
                })}
              </ul>
              <p className="mt-3 text-xs text-slate-600">50 günlük ortalamasının üstündeki hisse oranı: %{fmtNum(scan.breadth.total ? (scan.breadth.above50 / scan.breadth.total) * 100 : 0, 0)}.</p>
              <Link href="/sinyaller" className="btn mt-3 w-full">Sinyallere git</Link>
            </>
          ) : <p className="mt-2 text-sm text-slate-600">Tarama sürüyor…</p>}
        </section>
      </div>
    </div>
  );
}
