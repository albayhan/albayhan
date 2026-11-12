import Link from "next/link";
import { notFound } from "next/navigation";
import { getBars, getFundInfo, getInstrument, getQuote, isStale, refreshFund } from "@/lib/data";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import LineChart from "@/components/LineChart";
import { KindBadge, Notice, QuoteStamp, Stamp, tone } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Fon({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const inst = await getInstrument(code);
  if (!inst || inst.type !== "fund") notFound();
  const r = await refreshFund(code);
  const [quote, bars, info] = await Promise.all([getQuote(code), getBars(code), getFundInfo(code)]);
  const stale = isStale(quote, r);
  const ret = (days: number) => {
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const ref = [...bars].reverse().find((b) => Date.parse(last.date) - Date.parse(b.date) >= days * 86400_000);
    return ref ? (last.close / ref.close - 1) * 100 : null;
  };
  const i = info?.data;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/izleme" className="text-sm text-slate-500 underline">← İzleme Listesi</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{code} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">TEFAS fonu</span></h1>
        <p className="text-sm text-slate-500">{inst.name !== code ? inst.name : "Fon unvanı TEFAS'tan alınamadı"}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-3"><span className="text-3xl font-semibold tracking-tight">{quote ? fmtNum(quote.price, 6) : "—"} <span className="text-lg">₺</span></span><KindBadge quote={quote} stale={stale} /></div>
        <QuoteStamp quote={quote} stale={stale} className="mt-1" />
      </div>

      {!r.ok ? (
        <Notice>
          <p className="font-medium">TEFAS bağlantısı kurulamadı{quote ? "; son doğrulanmış değerler gösteriliyor" : "; bu fon için veri yetersiz"}.</p>
          <p className="mt-1 text-xs">Hata: {r.error}</p>
          <p className="mt-1 text-xs">Fon fiyatı, risk değeri, portföy dağılımı ve valör bilgisi TEFAS'tan alınır. Bağlantı düzeldiğinde veriler kendiliğinden yüklenir. <Link href="/durum" className="underline">Bağlantı durumu</Link></p>
        </Notice>
      ) : null}

      {bars.length > 1 ? (
        <section className="card">
          <h2 className="h-sec">Getiri</h2>
          <div className="mt-2 grid grid-cols-4 gap-2 text-sm">{([["1 ay", 30], ["3 ay", 90], ["6 ay", 180], ["1 yıl", 360]] as const).map(([k, d]) => <div key={k}><p className="text-xs text-slate-500">{k}</p><p className={`font-semibold ${tone(ret(d))}`}>{fmtPct(ret(d))}</p></div>)}</div>
          <div className="mt-3"><LineChart suffix="%" lines={[{ name: `${code} getirisi`, color: "#0f172a", data: bars.map((b) => ({ time: b.date, value: (b.close / bars[0].close - 1) * 100 })) }]} /></div>
          <Stamp className="mt-2" source="TEFAS" dataAt={bars[bars.length - 1].date} dateOnly fetchedAt={quote?.fetched_at} />
        </section>
      ) : null}

      <section className="card">
        <h2 className="h-sec">Fon bilgileri</h2>
        {i ? (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">Risk değeri (1–7)</dt><dd className="font-semibold">{i.riskValue ?? "Veri yetersiz"}</dd></div>
              <div><dt className="text-xs text-slate-500">Yıllık yönetim ücreti</dt><dd className="font-semibold">{i.managementFeePct !== null ? "%" + fmtNum(i.managementFeePct, 2) : "Veri yetersiz"}</dd></div>
              <div><dt className="text-xs text-slate-500">Alış valörü</dt><dd className="font-semibold">{i.buyValor ?? "Veri yetersiz"}</dd></div>
              <div><dt className="text-xs text-slate-500">Satış valörü</dt><dd className="font-semibold">{i.sellValor ?? "Veri yetersiz"}</dd></div>
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Açıklanan başlıca pozisyonlar (varlık dağılımı)</h3>
            {i.allocation.length ? <ul className="mt-2 space-y-1.5">{i.allocation.slice(0, 10).map((x) => <li key={x.name} className="text-sm"><div className="flex justify-between"><span>{x.name}</span><span className="font-medium">%{fmtNum(x.pct, 2)}</span></div><div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-slate-700" style={{ width: `${Math.min(100, x.pct)}%` }} /></div></li>)}</ul> : <p className="mt-1 text-sm text-slate-600">Veri yetersiz.</p>}
            <Stamp className="mt-3" source={info!.source} dataAt={i.allocationDate} dateOnly fetchedAt={info!.fetched_at} />
            <p className="mt-1 text-[11px] text-slate-500">Yönetim ücreti ve valör için bağlayıcı kaynak fonun izahnamesi ve yatırımcı bilgi formudur (KAP).</p>
          </>
        ) : <p className="mt-2 text-sm text-slate-600">Veri yetersiz: risk değeri, yönetim ücreti, portföy dağılımı ve alış/satış valörü TEFAS'tan alınamadı.</p>}
      </section>
    </div>
  );
}
