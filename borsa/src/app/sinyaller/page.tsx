import Link from "next/link";
import { getLastScan, runScan, scanIsOld, scanProgress, ACTION_ORDER, type ScanRow } from "@/lib/scan";
import { listAlerts } from "@/lib/alerts";
import { getQuotes } from "@/lib/data";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { ActionBadge, Notice, tone } from "@/components/ui";
import { DivergingBars, Meter, Sparkline } from "@/components/charts";
import AutoRefresh from "@/components/AutoRefresh";
import { removeAlertAction, runScanAction, markAlertsSeenAction } from "../actions";

export const dynamic = "force-dynamic";

const FILTERS = [
  { k: "hepsi", label: "Tümü", test: (_: ScanRow) => true },
  { k: "al", label: "AL", test: (r: ScanRow) => r.action === "AL" },
  { k: "sat", label: "SAT / UZAK DUR", test: (r: ScanRow) => r.action === "SAT" || r.action === "AZALT" || r.action === "UZAK DUR" },
  { k: "izle", label: "İZLE", test: (r: ScanRow) => r.action === "İZLE" },
  { k: "portfoy", label: "Portföyüm", test: (r: ScanRow) => r.held },
];
const SORTS: Record<string, { label: string; fn: (a: ScanRow, b: ScanRow) => number }> = {
  sinyal: { label: "Sinyal", fn: (a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) || b.rank - a.rank },
  puan: { label: "Teknik puan", fn: (a, b) => b.score - a.score },
  gun: { label: "Günlük", fn: (a, b) => (b.changePct ?? -1e9) - (a.changePct ?? -1e9) },
  ay: { label: "1 ay", fn: (a, b) => (b.ret1m ?? -1e9) - (a.ret1m ?? -1e9) },
  yil: { label: "1 yıl", fn: (a, b) => (b.ret1y ?? -1e9) - (a.ret1y ?? -1e9) },
  isabet: { label: "Geçmiş isabet", fn: (a, b) => (b.bt?.winRatePct ?? -1) - (a.bt?.winRatePct ?? -1) },
};
const VIEW: Record<string, string> = { olumlu: "Olumlu", notr: "Nötr", olumsuz: "Olumsuz" };

function Pick({ r }: { r: ScanRow }) {
  return (
    <article className="card !p-4" data-testid={`pick-${r.symbol}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/hisse/${r.symbol}`} className="text-base font-bold hover:underline">{r.symbol}</Link>
          <p className="truncate text-xs text-slate-500">{r.name}{r.held ? " · portföyde" : ""}</p>
        </div>
        <ActionBadge action={r.action} size="lg" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-xl font-semibold">{fmtNum(r.price)} ₺</p>
          <p className="text-xs"><span className={tone(r.changePct)}>{fmtPct(r.changePct)}</span> <span className="text-slate-500">bugün · 1 ay</span> <span className={tone(r.ret1m)}>{fmtPct(r.ret1m, 1)}</span></p>
        </div>
        <Sparkline data={r.spark} width={130} height={40} />
      </div>
      {r.entryBand && r.action === "AL" ? (
        <div className="mt-3 grid grid-cols-4 gap-1.5 rounded-xl bg-slate-50 p-2.5 text-[11px]">
          <div><p className="text-slate-500">Giriş</p><p className="font-semibold">{fmtNum(r.entryBand[0], 1)}–{fmtNum(r.entryBand[1], 1)}</p></div>
          <div><p className="text-slate-500">Zarar-kes</p><p className="font-semibold text-down">{fmtNum(r.stop)}</p></div>
          <div><p className="text-slate-500">Hedef</p><p className="font-semibold text-up">{fmtNum(r.target)}</p></div>
          <div><p className="text-slate-500">Risk/ödül</p><p className="font-semibold">{fmtNum(r.rr)}</p></div>
        </div>
      ) : null}
      <p className="mt-2 text-sm">{r.reason}</p>
      <p className="mt-1 text-xs text-slate-500"><span className="font-medium text-slate-700">Ne değiştirir:</span> {r.changeCondition}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>Teknik puan <b className={tone(r.score)}>{r.score > 0 ? "+" : ""}{r.score}</b></span>
        <span>RSI <b className="text-slate-800">{fmtNum(r.rsi, 0)}</b></span>
        {r.longView ? <span>Uzun vade <b className="text-slate-800">{VIEW[r.longView]}</b></span> : null}
        {r.bt && r.bt.closed > 0 ? <span>Geçmiş isabet <b className="text-slate-800">%{fmtNum(r.bt.winRatePct, 0)}</b> ({r.bt.closed} işlem)</span> : null}
      </div>
    </article>
  );
}

export default async function Sinyaller({ searchParams }: { searchParams: Promise<{ f?: string; s?: string }> }) {
  const sp = await searchParams;
  const scan = await getLastScan();
  if (scanIsOld(scan) && !scanProgress()?.running) void runScan();
  const running = scanProgress()?.running ?? false;
  const alerts = await listAlerts();
  const alertQuotes = await getQuotes([...new Set(alerts.map((a) => a.symbol))]);
  const fired = alerts.filter((a) => a.triggeredAt && !a.seen);

  if (!scan) {
    const p = scanProgress();
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold tracking-tight">Sinyaller</h1>
        <div className="card text-center">
          <p className="font-semibold">İlk tarama yapılıyor…</p>
          <p className="mt-1 text-sm text-slate-600">30 büyük BIST hissesi, izleme listesi ve portföyünüz için 3 yıllık fiyat, bilanço ve KAP verisi alınıyor. İlk tarama birkaç dakika sürebilir; sonrakiler önbellekten hızlı gelir.</p>
          {p?.total ? (
            <div className="mx-auto mt-4 max-w-sm">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-slate-900 transition-all" style={{ width: `${(p.done / p.total) * 100}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">{p.done}/{p.total} hisse</p>
            </div>
          ) : <p className="mt-3 text-xs text-slate-500">Hazırlanıyor…</p>}
          {p?.error ? <p className="mt-2 text-sm text-down">Hata: {p.error}</p> : null}
        </div>
        <AutoRefresh ms={3000} />
      </div>
    );
  }

  const filter = FILTERS.find((x) => x.k === sp.f) ?? FILTERS[0];
  const sort = SORTS[sp.s ?? "sinyal"] ?? SORTS.sinyal;
  const rows = scan.rows.filter(filter.test).sort(sort.fn);
  const buys = scan.rows.filter((r) => r.action === "AL").sort((a, b) => b.rank - a.rank);
  const sells = scan.rows.filter((r) => r.action === "SAT" || r.action === "AZALT").sort((a, b) => a.rank - b.rank);
  const watch = scan.rows.filter((r) => r.action === "İZLE").sort((a, b) => b.rank - a.rank).slice(0, 6);
  const avoid = scan.rows.filter((r) => r.action === "UZAK DUR").sort((a, b) => a.rank - b.rank).slice(0, 6);
  const b = scan.breadth;
  const href = (o: { f?: string; s?: string }) => `/sinyaller?f=${o.f ?? filter.k}&s=${o.s ?? sp.s ?? "sinyal"}`;
  const bt = scan.rows.filter((r) => r.bt && r.bt.closed > 0);
  const btTrades = bt.reduce((a, r) => a + r.bt!.closed, 0);
  const btWin = btTrades ? bt.reduce((a, r) => a + (r.bt!.winRatePct! / 100) * r.bt!.closed, 0) / btTrades * 100 : null;
  const btAvg = btTrades ? bt.reduce((a, r) => a + (r.bt!.avgRetPct ?? 0) * r.bt!.closed, 0) / btTrades : null;
  const mood = b.total ? (b.above50 / b.total) * 100 : 0;

  return (
    <div className="space-y-5">
      {running ? <AutoRefresh ms={5000} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sinyaller</h1>
          <p className="text-xs text-slate-500">{scan.rows.length} hisse tarandı · son tarama {fmtDateTime(scan.at)} ({Math.round(scan.durationMs / 1000)} sn){running ? ` · yeni tarama sürüyor ${scanProgress()?.done ?? 0}/${scanProgress()?.total ?? "…"}` : ""}</p>
        </div>
        <form action={runScanAction}><button className="btn" disabled={running}>{running ? "Taranıyor…" : "Şimdi tara"}</button></form>
      </div>

      <Notice kind="info">Sinyaller kural tabanlı bir modelin çıktısıdır (trend, momentum, hacim, bilanço, risk/ödül); yatırım tavsiyesi değildir. Ben lisanslı bir yatırım danışmanı değilim; karar ve sorumluluk sizindir. Her sinyalin nedeni ve kararı neyin değiştireceği yazılıdır.</Notice>

      {fired.length ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" id="alarmlar-tetiklenen">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">🔔 {fired.length} fiyat alarmı tetiklendi</p>
            <form action={markAlertsSeenAction}><button className="text-xs underline">Görüldü olarak işaretle</button></form>
          </div>
          <ul className="mt-1 space-y-0.5">{fired.map((a) => <li key={a.id}><Link className="font-semibold underline" href={`/hisse/${a.symbol}`}>{a.symbol}</Link> {a.op === "above" ? "≥" : "≤"} {fmtNum(a.price)} ₺ — {fmtNum(a.triggeredPrice)} ₺ görüldü ({fmtDateTime(a.triggeredAt)}){a.note ? ` · ${a.note}` : ""}</li>)}</ul>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Piyasa genişliği">
        <div className="card !p-4"><p className="text-xs font-medium text-slate-500">AL sinyali</p><p className="mt-1 text-2xl font-semibold text-up">{b.buy}</p><p className="text-xs text-slate-500">SAT/AZALT: <b className="text-down">{b.sell}</b></p></div>
        <div className="card !p-4"><p className="text-xs font-medium text-slate-500">Bugün yükselen / düşen</p><p className="mt-1 text-2xl font-semibold"><span className="text-up">{b.up}</span> <span className="text-slate-300">/</span> <span className="text-down">{b.down}</span></p><p className="text-xs text-slate-500">Ortalama <span className={tone(b.avgChangePct)}>{fmtPct(b.avgChangePct)}</span></p></div>
        <div className="card !p-4"><p className="text-xs font-medium text-slate-500">50 günlük ort. üstünde</p><p className="mt-1 text-2xl font-semibold">%{fmtNum(mood, 0)}</p><p className="text-xs text-slate-500">{b.above50}/{b.total} hisse</p></div>
        <div className="card !p-4"><p className="text-xs font-medium text-slate-500">200 günlük ort. üstünde</p><p className="mt-1 text-2xl font-semibold">%{fmtNum(b.total ? (b.above200 / b.total) * 100 : 0, 0)}</p><p className="text-xs text-slate-500">uzun vadeli eğilim</p></div>
        <div className="card col-span-2 !p-4 lg:col-span-1"><p className="text-xs font-medium text-slate-500">Piyasa havası</p>
          <p className="mt-1 text-lg font-semibold">{mood >= 65 ? "Güçlü" : mood >= 45 ? "Karışık" : mood >= 25 ? "Zayıf" : "Çok zayıf"}</p>
          <div className="mt-2"><Meter value={mood} zones={[{ to: 25, color: "#fecaca" }, { to: 45, color: "#fde68a" }, { to: 65, color: "#e2e8f0" }, { to: 100, color: "#bbf7d0" }]} label="Piyasa havası" /></div>
        </div>
      </section>

      {btWin !== null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <span className="font-semibold">Modelin geçmiş karnesi:</span> son 2 yılda bu {scan.rows.length} hissede {btTrades} AL sinyali verdi; %{fmtNum(btWin, 0)}'i kârla kapandı, işlem başına ortalama <span className={tone(btAvg)}>{fmtPct(btAvg, 2)}</span> (komisyonsuz).
          {btAvg !== null && btAvg <= 0 ? " Ortalama getiri negatif: bu kural geçmişte tek başına kazandırmadı; sinyalleri tek başına değil, başka bilgilerle birlikte değerlendirin." : btWin < 40 ? " İsabet düşük ama kazançlar kayıplardan büyük; sonuç zarar-kese uymaya bağlı." : ""}
        </div>
      ) : null}

      <section aria-label="Alım sinyalleri">
        <h2 className="h-sec mb-2">🟢 AL — giriş koşulları sağlanan hisseler</h2>
        {buys.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{buys.map((r) => <Pick key={r.symbol} r={r} />)}</div>
          : <div className="card text-sm text-slate-600">Şu an giriş koşullarının hepsini sağlayan hisse yok. Model, risk/ödül en az {fmtNum(scan.rows[0]?.minRR, 1)} ve yukarı eğilim olmadan AL demez. Aşağıda “İZLE” listesi koşullara en yakın hisseleri gösterir.</div>}
      </section>

      {sells.length ? (
        <section aria-label="Satış sinyalleri">
          <h2 className="h-sec mb-2">🔴 SAT / AZALT — portföyünüzde</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{sells.map((r) => <Pick key={r.symbol} r={r} />)}</div>
        </section>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card" aria-label="İzlenecekler">
          <h2 className="h-sec">👀 İZLE — AL'a en yakınlar</h2>
          {watch.length ? <ul className="mt-2 divide-y divide-slate-100">{watch.map((r) => (
            <li key={r.symbol} className="flex items-center gap-3 py-2">
              <div className="w-20"><Link href={`/hisse/${r.symbol}`} className="font-semibold hover:underline">{r.symbol}</Link><p className={`text-xs ${tone(r.changePct)}`}>{fmtPct(r.changePct)}</p></div>
              <Sparkline data={r.spark} width={90} height={28} />
              <p className="flex-1 text-xs text-slate-600">{r.reason}</p>
            </li>))}</ul> : <p className="mt-2 text-sm text-slate-600">Yok.</p>}
        </section>
        <section className="card" aria-label="Uzak durulacaklar">
          <h2 className="h-sec">⛔ UZAK DUR — eğilimi aşağı olanlar</h2>
          {avoid.length ? <ul className="mt-2 divide-y divide-slate-100">{avoid.map((r) => (
            <li key={r.symbol} className="flex items-center gap-3 py-2">
              <div className="w-20"><Link href={`/hisse/${r.symbol}`} className="font-semibold hover:underline">{r.symbol}</Link><p className={`text-xs ${tone(r.changePct)}`}>{fmtPct(r.changePct)}</p></div>
              <Sparkline data={r.spark} width={90} height={28} />
              <p className="flex-1 text-xs text-slate-600">Teknik puan {r.score}{r.longView ? ` · uzun vade ${VIEW[r.longView].toLowerCase()}` : ""} · 3 ay {fmtPct(r.ret3m, 1)}</p>
            </li>))}</ul> : <p className="mt-2 text-sm text-slate-600">Yok.</p>}
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card" aria-label="Teknik puan sıralaması">
          <h2 className="h-sec">Teknik puan sıralaması</h2>
          <p className="mb-3 text-xs text-slate-500">Trend + momentum + hacim (−85 … +85). +20 üstü ve giriş koşulları sağlanırsa AL.</p>
          <DivergingBars unit="" digits={0} href={(s) => `/hisse/${s}`} rows={[...scan.rows].filter((r) => r.price !== null).sort((a, b) => b.score - a.score).map((r) => ({ label: r.symbol, value: r.score }))} />
        </section>
        <section className="card" aria-label="Getiri sıralaması">
          <h2 className="h-sec">Son 1 ay getiri</h2>
          <p className="mb-3 text-xs text-slate-500">Temettü ve bölünmeye göre düzeltilmiş kapanışlar.</p>
          <DivergingBars href={(s) => `/hisse/${s}`} rows={[...scan.rows].filter((r) => r.ret1m !== null).sort((a, b) => b.ret1m! - a.ret1m!).map((r) => ({ label: r.symbol, value: r.ret1m! }))} />
        </section>
      </div>

      <section className="card !p-0" aria-label="Tüm hisseler">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          <h2 className="h-sec">Tüm hisseler</h2>
          <div className="flex flex-wrap gap-1" role="tablist">
            {FILTERS.map((x) => <Link key={x.k} href={href({ f: x.k })} aria-selected={filter.k === x.k} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${filter.k === x.k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{x.label} ({scan.rows.filter(x.test).length})</Link>)}
          </div>
        </div>
        <p className="px-4 pt-2 text-xs text-slate-500 sm:px-5">Sırala: {Object.entries(SORTS).map(([k, v], i) => <span key={k}>{i ? " · " : ""}<Link href={href({ s: k })} className={(sp.s ?? "sinyal") === k ? "font-semibold text-slate-900" : "underline"}>{v.label}</Link></span>)}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr className="border-b border-slate-100">
              <th className="th pl-5">Hisse</th><th className="th">Sinyal</th><th className="th text-right">Fiyat</th><th className="th text-right">Gün</th><th className="th text-right">1 ay</th><th className="th text-right">3 ay</th><th className="th text-right">1 yıl</th>
              <th className="th text-right">RSI</th><th className="th text-right">Puan</th><th className="th">Uzun vade</th><th className="th text-right">Geçmiş isabet</th><th className="th pr-5">60 gün</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.symbol} className={r.held ? "bg-slate-50/60" : ""}>
                  <td className="td pl-5"><Link href={`/hisse/${r.symbol}`} className="font-semibold hover:underline">{r.symbol}</Link>{r.held ? <span className="ml-1 rounded bg-slate-900 px-1 text-[10px] text-white">P</span> : null}<p className="max-w-[150px] truncate text-xs text-slate-500">{r.name}</p></td>
                  <td className="td"><ActionBadge action={r.action} /></td>
                  <td className="td text-right">{fmtNum(r.price)}</td>
                  <td className={`td text-right ${tone(r.changePct)}`}>{fmtPct(r.changePct)}</td>
                  <td className={`td text-right ${tone(r.ret1m)}`}>{fmtPct(r.ret1m, 1)}</td>
                  <td className={`td text-right ${tone(r.ret3m)}`}>{fmtPct(r.ret3m, 1)}</td>
                  <td className={`td text-right ${tone(r.ret1y)}`}>{fmtPct(r.ret1y, 0)}</td>
                  <td className={`td text-right ${r.rsi !== null && r.rsi > 70 ? "text-down" : r.rsi !== null && r.rsi < 30 ? "text-up" : ""}`}>{fmtNum(r.rsi, 0)}</td>
                  <td className={`td text-right font-medium ${tone(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</td>
                  <td className="td text-xs">{r.longView ? VIEW[r.longView] : "—"}</td>
                  <td className="td text-right text-xs">{r.bt && r.bt.closed ? <>%{fmtNum(r.bt.winRatePct, 0)} <span className="text-slate-400">({r.bt.closed})</span></> : "—"}</td>
                  <td className="td pr-5"><Sparkline data={r.spark} width={100} height={26} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-3 pt-2 text-[11px] text-slate-500 sm:px-5">
          Geçmiş isabet: kısa vade kuralının son 2 yılda verdiği AL sinyallerinden kârla kapananların oranı (parantez içinde işlem sayısı){btWin !== null ? `; tüm taramada ${btTrades} işlemde %${fmtNum(btWin, 0)} isabet, işlem başına ortalama ${fmtPct(btAvg, 2)}` : ""}. Komisyon dahil değildir; geçmiş sonuç gelecek için garanti değildir. Kaynak: İş Yatırım fiyat ve tabloları, KAP.
        </p>
      </section>

      <section className="card" id="alarmlar" aria-label="Fiyat alarmları">
        <h2 className="h-sec">🔔 Fiyat alarmları</h2>
        {alerts.length ? (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {alerts.sort((a, b) => Number(!!b.triggeredAt) - Number(!!a.triggeredAt)).map((a) => {
              const qp = alertQuotes.get(a.symbol)?.price;
              const dist = qp ? (a.price / qp - 1) * 100 : null;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link href={`/hisse/${a.symbol}`} className="w-16 font-semibold hover:underline">{a.symbol}</Link>
                  <span>{a.op === "above" ? "≥" : "≤"} <b>{fmtNum(a.price)} ₺</b></span>
                  {a.triggeredAt ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Tetiklendi {fmtDateTime(a.triggeredAt)} · {fmtNum(a.triggeredPrice)} ₺</span>
                    : <span className="text-xs text-slate-500">Şu an {fmtNum(qp)} ₺{dist !== null ? ` · uzaklık ${fmtPct(dist, 1)}` : ""}</span>}
                  {a.note ? <span className="text-xs text-slate-500">· {a.note}</span> : null}
                  <form action={removeAlertAction} className="ml-auto"><input type="hidden" name="id" value={a.id} /><button className="text-xs text-slate-500 underline">Sil</button></form>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-2 text-sm text-slate-600">Henüz alarm yok. Bir hisse sayfasından “Fiyat alarmı” bölümüyle kurabilirsiniz (ör. zarar-kes ya da hedef seviyesine).</p>}
        <p className="mt-2 text-[11px] text-slate-500">Alarmlar seans içinde 5 dakikada bir ve her taramada kontrol edilir; tetiklenince üst çubukta ve bu sayfada görünür.</p>
      </section>
    </div>
  );
}
