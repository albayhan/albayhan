import Link from "next/link";
import { analyzeAll, STATUS_ORDER } from "@/lib/engine";
import { getPerformance } from "@/lib/portfolio-data";
import { fmtDate, fmtNum, fmtPct, fmtSigned, fmtTL } from "@/lib/format";
import { KindBadge, Notice, Stat, StatusBadge, tone } from "@/components/ui";
import { RecCard, detailHref } from "@/components/RecCard";
import LineChart from "@/components/LineChart";
import { RISK } from "@/lib/settings";

export const dynamic = "force-dynamic";

const COLORS = ["#0f172a", "#2563eb", "#0f9d6b", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d"];

export default async function Home() {
  const [{ items, portfolio: p, settings }, perf] = await Promise.all([analyzeAll({ deep: true }), getPerformance()]);
  const byStatus = [...items].sort((a, b) => STATUS_ORDER.indexOf(a.decision.status) - STATUS_ORDER.indexOf(b.decision.status));
  const top = byStatus.filter((a) => a.decision.status !== "Tut" && a.decision.status !== "Veri yetersiz").slice(0, 3);
  const decisions = new Map(items.map((a) => [a.inst.symbol, a]));
  const alloc = [...p.rows.map((r) => ({ label: r.symbol, value: r.value })), ...(p.cash > 0.005 ? [{ label: "Nakit", value: p.cash }] : [])];
  const asOf = p.rows.map((r) => r.quote?.as_of).filter(Boolean).sort().pop();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Portföy</h1>
          <p className="text-xs text-slate-500">Risk profili: {RISK[settings.risk].label} · Fiyatlar 15 dk gecikmelidir{asOf ? ` · son fiyat ${fmtDate(asOf)}` : ""}</p>
        </div>
        <Link href="/islemler" className="btn">İşlem ekle</Link>
      </div>

      {p.errors.length ? <Notice>Bazı fiyatlar yenilenemedi; son doğrulanmış değerler gösteriliyor ve güncelliğe bağlı öneriler beklemede. <Link className="underline" href="/durum">Bağlantı durumu</Link></Notice> : null}
      {p.warnings.map((w) => <Notice key={w}>{w}</Notice>)}

      {!p.hasTx ? (
        <div className="card text-center">
          <p className="text-base font-semibold">Portföyünüz henüz boş</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">İlk alışınızı ya da para yatırma hareketinizi kaydedin; maliyet, kâr/zarar ve performans otomatik hesaplanır. İzleme listenizdeki öneriler aşağıda.</p>
          <Link href="/islemler" className="btn mt-4">İlk işlemi ekle</Link>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Portföy özeti">
            <Stat label="Toplam değer" value={fmtTL(p.totalValue)} sub={`Pozisyonlar ${fmtTL(p.positionsValue, 0)}`} />
            <Stat label="Günlük değişim" value={fmtSigned(p.dayChange)} valueClass={tone(p.dayChange)} sub={p.dayChangePct !== null ? fmtPct(p.dayChangePct) : "—"} />
            <Stat label="Toplam kâr/zarar" value={fmtSigned(p.totalPL)} valueClass={tone(p.totalPL)}
              sub={`Gerçekleşmemiş ${fmtSigned(p.unrealized, 0)} · gerçekleşen ${fmtSigned(p.realized, 0)} · temettü ${fmtTL(p.dividends, 0)}`} />
            <Stat label="Nakit" value={fmtTL(p.cash)} sub={p.totalValue > 0 ? `Portföyün %${fmtNum((p.cash / p.totalValue) * 100, 1)}'i` : ""} />
          </section>

          {alloc.length ? (
            <section className="card" aria-label="Varlık dağılımı">
              <h2 className="h-sec">Varlık dağılımı</h2>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {alloc.map((a, i) => <div key={a.label} style={{ width: `${(a.value / p.totalValue) * 100}%`, background: a.label === "Nakit" ? "#cbd5e1" : COLORS[i % COLORS.length] }} title={a.label} />)}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {alloc.map((a, i) => (
                  <li key={a.label} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.label === "Nakit" ? "#cbd5e1" : COLORS[i % COLORS.length] }} />
                    <span className="font-medium">{a.label}</span><span className="text-slate-500">%{fmtNum((a.value / p.totalValue) * 100, 1)}</span>
                  </li>
                ))}
              </ul>
              {p.implicitDeposits > 0 ? <p className="mt-2 text-[11px] text-slate-500">Nakit kaydı alışları karşılamadığı için {fmtTL(p.implicitDeposits, 0)} tutarında para girişi varsayıldı. Doğru nakit için para yatırma hareketlerinizi ekleyin.</p> : null}
            </section>
          ) : null}
        </>
      )}

      <section aria-label="Günün önemli önerileri">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h-sec">Günün önemli önerileri</h2>
          <Link href="/analiz" className="text-sm font-medium text-slate-600 underline">Tüm analiz</Link>
        </div>
        {top.length ? (
          <div className="grid gap-3 lg:grid-cols-3">{top.map((a) => <RecCard key={a.inst.symbol} a={a} compact />)}</div>
        ) : (
          <div className="card text-sm text-slate-600">Bugün işlem gerektiren bir öneri yok; pozisyonlar “Tut” durumunda.</div>
        )}
      </section>

      {p.rows.length ? (
        <section className="card !p-0" aria-label="Pozisyonlar">
          <div className="flex items-center justify-between px-4 pt-4 sm:px-5"><h2 className="h-sec">Pozisyonlar</h2><Link href="/islemler" className="text-sm font-medium text-slate-600 underline">İşlemler</Link></div>
          {/* Telefon: kartlar */}
          <ul className="mt-2 divide-y divide-slate-100 md:hidden">
            {p.rows.map((r) => (
              <li key={r.symbol} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={detailHref(r.symbol, r.type)} className="font-semibold">{r.symbol}</Link>
                  <StatusBadge status={decisions.get(r.symbol)?.decision.status ?? "Veri yetersiz"} />
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <p><span className="text-slate-500">Değer </span>{fmtTL(r.value)}</p>
                  <p className="text-right"><span className="text-slate-500">Ağırlık </span>%{fmtNum(r.weightPct, 1)}</p>
                  <p><span className="text-slate-500">Fiyat </span>{fmtNum(r.price)} <KindBadge quote={r.quote} stale={r.stale} /></p>
                  <p className="text-right"><span className="text-slate-500">Maliyet </span>{fmtNum(r.avgCost)}</p>
                  <p><span className="text-slate-500">{fmtNum(r.qty, 0)} adet</span></p>
                  <p className={`text-right font-medium ${tone(r.unrealized)}`}>{fmtSigned(r.unrealized)} ({fmtPct(r.unrealizedPct)})</p>
                </div>
              </li>
            ))}
          </ul>
          {/* Masaüstü: tablo */}
          <div className="mt-2 hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100">
                <th className="th pl-5">Varlık</th><th className="th text-right">Adet</th><th className="th text-right">Ort. maliyet</th><th className="th text-right">Fiyat</th>
                <th className="th text-right">Değer</th><th className="th text-right">Ağırlık</th><th className="th text-right">Gerçekleşmemiş K/Z</th><th className="th text-right">Gerçekleşen</th><th className="th pr-5">Öneri</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {p.rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="td pl-5"><Link href={detailHref(r.symbol, r.type)} className="font-semibold hover:underline">{r.symbol}</Link><p className="max-w-[180px] truncate text-xs text-slate-500">{r.name}</p></td>
                    <td className="td text-right">{fmtNum(r.qty, 0)}</td>
                    <td className="td text-right">{fmtNum(r.avgCost)}</td>
                    <td className="td text-right">{fmtNum(r.price)}<div><KindBadge quote={r.quote} stale={r.stale} /></div></td>
                    <td className="td text-right font-medium">{fmtTL(r.value)}</td>
                    <td className="td text-right">%{fmtNum(r.weightPct, 1)}</td>
                    <td className={`td text-right font-medium ${tone(r.unrealized)}`}>{fmtSigned(r.unrealized)}<div className="text-xs">{fmtPct(r.unrealizedPct)}</div></td>
                    <td className={`td text-right ${tone(r.realized + r.dividends)}`}>{fmtSigned(r.realized + r.dividends)}</td>
                    <td className="td pr-5"><StatusBadge status={decisions.get(r.symbol)?.decision.status ?? "Veri yetersiz"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-3 pt-2 text-[11px] text-slate-500 sm:px-5">Kaynak: {[...new Set(p.rows.map((r) => r.quote?.source).filter(Boolean))].join(", ") || "—"} · Maliyet: ağırlıklı ortalama (komisyon dahil){p.closed.length ? ` · Kapanan pozisyonlar: ${p.closed.map((c) => `${c.symbol} ${fmtSigned(c.realized + c.dividends, 0)}`).join(", ")}` : ""}</p>
        </section>
      ) : null}

      {perf.points.length > 1 ? (
        <section className="card" aria-label="Portföy performansı">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="h-sec">Performans — BIST 100 ile karşılaştırma</h2>
            <p className="text-xs text-slate-500">{fmtDate(perf.from)} – {fmtDate(perf.to)}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
            <div><p className="text-xs text-slate-500">Portföy getirisi (zaman ağırlıklı)</p><p className={`text-lg font-semibold ${tone(perf.twrPct)}`}>{fmtPct(perf.twrPct)}</p></div>
            <div><p className="text-xs text-slate-500">BIST 100</p><p className={`text-lg font-semibold ${tone(perf.benchPct)}`}>{fmtPct(perf.benchPct)}</p></div>
          </div>
          <div className="mt-3">
            <LineChart suffix="%" lines={[
              { name: "Portföy", color: "#0f172a", data: perf.points.map((x) => ({ time: x.date, value: x.twr - 100 })) },
              { name: "BIST 100", color: "#2563eb", data: perf.points.filter((x) => x.bench !== null).map((x) => ({ time: x.date, value: x.bench! - 100 })) },
            ]} />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Getiri, para yatırma ve çekme hareketlerinden arındırılmıştır (zaman ağırlıklı getiri). Net para girişi: {fmtTL(p.netDeposits, 0)}. Kaynak: {perf.benchSource ?? "—"} günlük kapanışları.</p>
        </section>
      ) : p.hasTx ? <div className="card text-sm text-slate-600">Performans grafiği için en az iki işlem günü gerekir.</div> : null}
    </div>
  );
}
