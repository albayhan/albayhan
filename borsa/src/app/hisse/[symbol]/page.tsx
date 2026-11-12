import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstrument, isMaterial } from "@/lib/data";
import { analyzeInstrument } from "@/lib/engine";
import { getPortfolio } from "@/lib/portfolio-data";
import { getSettings } from "@/lib/settings";
import { recommendationHistory } from "@/lib/report";
import { sma } from "@/lib/indicators";
import { kapLink } from "@/lib/providers/kap";
import { fmtCompact, fmtDate, fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import PriceChart, { type Candle } from "@/components/PriceChart";
import { KindBadge, Notice, QuoteStamp, Stamp, StatusBadge, tone } from "@/components/ui";
import { MetricForm } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function Hisse({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol.toUpperCase();
  const inst = await getInstrument(symbol);
  if (!inst || inst.type !== "stock") notFound();
  const [settings, portfolio] = await Promise.all([getSettings(), getPortfolio()]);
  const [a, history] = await Promise.all([analyzeInstrument(inst, { settings, portfolio, deep: true }), recommendationHistory(symbol)]);
  const { quote, bars, short: s, long: l, decision: d } = a;
  const chg = quote?.prev_close ? (quote.price / quote.prev_close - 1) * 100 : null;

  const candles: Candle[] = bars.map((b) => ({
    time: b.date, open: b.open ?? b.close, high: Math.max(b.high ?? b.close, b.close, b.open ?? b.close), low: Math.min(b.low ?? b.close, b.close, b.open ?? b.close),
    close: b.close, volume: b.volume, hasOpen: b.open !== null,
  }));
  const closes = bars.map((b) => b.close);
  const line = (p: number) => sma(closes, p).map((v, i) => (v === null ? null : { time: bars[i].date, value: v })).filter((x): x is { time: string; value: number } => !!x);
  const overlays = [{ name: "20 gün", color: "#2563eb", data: line(20) }, { name: "50 gün", color: "#d97706", data: line(50) }, { name: "200 gün", color: "#7c3aed", data: line(200) }];
  const levels = [
    ...s.supports.slice(0, 2).map((x) => ({ price: x.price, title: "Destek", color: "#047857" })),
    ...s.resistances.slice(0, 2).map((x) => ({ price: x.price, title: "Direnç", color: "#b91c1c" })),
  ];
  const noOpen = bars.filter((b) => b.open === null).length;
  const m = l?.metrics;
  const material = a.disclosures.filter(isMaterial).slice(0, 12);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/izleme" className="text-sm text-slate-500 underline">← İzleme Listesi</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-bold tracking-tight">{symbol}</h1><p className="text-sm text-slate-500">{inst.name}</p></div>
          <StatusBadge status={d.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight" data-testid="price">{quote ? fmtNum(quote.price) : "—"} <span className="text-lg">₺</span></span>
          <span className={`text-base font-medium ${tone(chg)}`}>{fmtPct(chg)}</span>
          <KindBadge quote={quote} stale={a.stale} />
        </div>
        <QuoteStamp quote={quote} stale={a.stale} className="mt-1" />
      </div>

      {a.errors.length ? <Notice>Veri uyarısı: {a.errors.join(" · ")} <Link href="/durum" className="underline">Bağlantı durumu</Link></Notice> : null}

      <section className="card">
        <h2 className="h-sec">Bugünkü değerlendirme</h2>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-medium text-slate-500">Neden</dt><dd>{d.reason}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Karşı sinyal</dt><dd>{d.counter}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Kararı ne değiştirir</dt><dd>{d.changeCondition}</dd></div>
        </dl>
        {d.sizeHint ? <p className="mt-2 text-sm"><span className="text-xs font-medium text-slate-500">Pozisyon büyüklüğü: </span>{d.sizeHint}</p> : null}
        {a.position ? <p className="mt-2 text-xs text-slate-500">Pozisyonunuz: {fmtNum(a.position.qty, 0)} adet · ortalama maliyet {fmtNum(a.position.avgCost)} · K/Z {fmtPct(a.position.plPct)} · ağırlık %{fmtNum(a.position.weightPct, 1)}</p> : null}
      </section>

      <section className="card">
        <h2 className="h-sec mb-3">Fiyat grafiği</h2>
        {candles.length ? <PriceChart candles={candles} overlays={overlays} levels={levels} volumeUnit={bars[0]?.source === "EODHD" ? "adet" : "₺"} /> : <p className="text-sm text-slate-600">Grafik için tarihsel veri yok.</p>}
        <Stamp className="mt-2" source={`${bars[bars.length - 1]?.source ?? "—"} (temettü ve bölünmeye göre düzeltilmiş günlük seri)`} dataAt={bars[bars.length - 1]?.date} dateOnly fetchedAt={quote?.fetched_at} />
        {noOpen > 0 ? <p className="mt-1 text-[11px] text-slate-500">Bu kaynağın günlük serisinde açılış fiyatı yoktur: {noOpen} günde mum yalnızca en yüksek–en düşük aralığı ve kapanışı gösterir (gövde çizilmez). Açılış, fiyat kaydından alınabildiği günlerde eklenir; tam mum için anahtarlı sağlayıcı (EODHD) bağlanabilir.</p> : null}
      </section>

      {s.ok ? (
        <section className="card">
          <h2 className="h-sec">Kısa vade ({s.horizon}) <span className={`ml-1 text-sm font-medium ${s.score > 0 ? "text-up" : s.score < 0 ? "text-down" : ""}`}>teknik puan {s.score > 0 ? "+" : ""}{s.score}</span></h2>
          {a.stale ? <Notice>Fiyat güncel olmadığı için seviyeler son doğrulanmış veriye göredir; öneri beklemede.</Notice> : null}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Giriş bandı</p><p className="font-semibold">{fmtNum(s.entryBand![0])}–{fmtNum(s.entryBand![1])}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Zarar-kes</p><p className="font-semibold">{fmtNum(s.stop)}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Hedef</p><p className="font-semibold">{fmtNum(s.target)}</p><p className="text-[11px] text-slate-500">{s.targetBasis}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Risk/ödül</p><p className={`font-semibold ${s.rr! >= s.minRR ? "text-up" : "text-down"}`}>{fmtNum(s.rr)} <span className="text-xs font-normal text-slate-500">(eşik {fmtNum(s.minRR, 1)})</span></p><p className="text-[11px] text-slate-500">{s.rrBasis === "güncel fiyat" ? "güncel fiyattan" : "giriş bandından"} hesaplandı</p></div>
          </div>
          <p className="mt-3 text-sm"><span className="text-xs font-medium text-slate-500">Giriş koşulu {s.conditionMet ? <span className="text-up">(sağlanıyor)</span> : <span className="text-down">(sağlanmıyor → Bekle)</span>}: </span>{s.entryCondition}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-slate-100"><th className="th !pl-0">Bileşen</th><th className="th">Değer</th><th className="th text-right">Puan</th><th className="th">Yorum</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{s.components.map((c) => <tr key={c.name}><td className="td !pl-0 font-medium">{c.name}</td><td className="td">{c.value}</td><td className={`td text-right ${tone(c.score)}`}>{c.max ? `${c.score > 0 ? "+" : ""}${c.score}/${c.max}` : "—"}</td><td className="td text-slate-600">{c.note}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-xs font-medium text-slate-500">Destekler</p><p>{s.supports.length ? s.supports.map((x) => `${fmtNum(x.price)} (${x.touches} temas)`).join(" · ") : "Son 180 günde altta belirgin destek yok"}</p></div>
            <div><p className="text-xs font-medium text-slate-500">Dirençler</p><p>{s.resistances.length ? s.resistances.map((x) => `${fmtNum(x.price)} (${x.touches} temas)`).join(" · ") : "Son 180 günde üstte belirgin direnç yok"}</p></div>
          </div>
          {s.catalysts.length ? (
            <div className="mt-3"><p className="text-xs font-medium text-slate-500">Katalizörler</p>
              <ul className="mt-1 space-y-1 text-sm">{s.catalysts.map((c, i) => <li key={i}>{c.upcoming ? <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Yaklaşan</span> : null}<span className="text-slate-500">{fmtDate(c.date)}</span> · {c.id ? <a className="underline" href={kapLink(c.id)} target="_blank" rel="noreferrer">{c.title}</a> : c.title}</li>)}</ul>
              <p className="mt-1 text-[11px] text-slate-500">Yaklaşan tarih SPK'nın konsolide raporlar için yasal son bildirim süresidir; şirket daha erken açıklayabilir, süre uzatılabilir.</p></div>
          ) : null}
        </section>
      ) : <section className="card"><h2 className="h-sec">Kısa vade</h2><p className="mt-2 text-sm text-slate-600">Veri yetersiz: {s.reasons[0]}</p></section>}

      {l ? (
        <section className="card">
          <h2 className="h-sec">Uzun vade ({l.horizon})</h2>
          {!l.ok ? <p className="mt-2 text-sm text-slate-600">Veri yetersiz: {l.reasons[0]}</p> : (
            <>
              <p className="mt-2 text-sm"><span className="font-semibold">{l.view === "olumlu" ? "Olumlu" : l.view === "olumsuz" ? "Olumsuz" : "Nötr"} (puan {l.score > 0 ? "+" : ""}{l.score}):</span> {l.thesis}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">{l.pillars.map((p) => <div key={p.name} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{p.name} <span className={tone(p.score)}>({p.score > 0 ? "+" : ""}{p.score})</span></p><p className="font-semibold">{p.value}</p><p className="text-[11px] text-slate-500">{p.note}</p></div>)}</div>

              <h3 className="mt-4 text-sm font-semibold">Senaryolar</h3>
              {l.scenarios.length ? (
                <ul className="mt-1 divide-y divide-slate-100 text-sm">{l.scenarios.map((sc) => <li key={sc.name} className="py-2"><div className="flex items-baseline justify-between gap-2"><span className="font-medium">{sc.name}</span><span><span className="font-semibold">{fmtNum(sc.targetPrice)} ₺</span> <span className={`font-medium ${tone(sc.returnPct)}`}>{fmtPct(sc.returnPct, 0)}</span></span></div><p className="text-xs text-slate-500">{sc.assumptions}</p></li>)}</ul>
              ) : <p className="mt-1 text-sm text-slate-600">Senaryo hesaplanamadı (FAVÖK pozitif değil ya da piyasa değeri yok).</p>}

              <h3 className="mt-4 text-sm font-semibold">Yatırım tezini değiştirecek gelişmeler</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{l.thesisChangers.map((t) => <li key={t}>{t}</li>)}</ul>
              {l.counter.length ? <><h3 className="mt-4 text-sm font-semibold">Riskler ve karşı sinyaller</h3><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{l.counter.map((t) => <li key={t}>{t}</li>)}</ul></> : null}

              <h3 className="mt-4 text-sm font-semibold">Bilanço özeti <span className="font-normal text-slate-500">— dönem {m!.period}, son 12 ay</span></h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                {[
                  ["Hasılat", fmtCompact(m!.revenueTTM) + " ₺"], ["FAVÖK", fmtCompact(m!.ebitdaTTM) + " ₺"], ["Net kâr", fmtCompact(m!.netIncomeTTM) + " ₺"], ["Serbest nakit akışı", fmtCompact(m!.fcfTTM) + " ₺"],
                  ["Brüt marj", m!.grossMarginPct !== null ? "%" + fmtNum(m!.grossMarginPct, 1) : "—"], ["FAVÖK marjı", m!.ebitdaMarginPct !== null ? "%" + fmtNum(m!.ebitdaMarginPct, 1) : "—"], ["Özkaynak kârlılığı", m!.roePct !== null ? "%" + fmtNum(m!.roePct, 1) : "—"], [m!.netDebt !== null && m!.netDebt < 0 ? "Net nakit" : "Net borç", m!.netDebt !== null ? fmtCompact(Math.abs(m!.netDebt)) + " ₺" : "—"],
                  ["Piyasa değeri", fmtCompact(m!.marketCap) + " ₺"], ["F/K", fmtNum(m!.pe, 1)], ["PD/DD", fmtNum(m!.pb, 2)], ["FD/FAVÖK", fmtNum(m!.evEbitda, 1)],
                ].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
              </dl>
              {l.peers.length ? (
                <div className="mt-4 overflow-x-auto"><h3 className="text-sm font-semibold">Sektör emsalleri</h3>
                  <table className="mt-1 w-full min-w-[420px] text-sm"><thead><tr className="border-b border-slate-100"><th className="th !pl-0">Şirket</th><th className="th text-right">F/K</th><th className="th text-right">FD/FAVÖK</th><th className="th text-right">PD/DD</th><th className="th text-right">Net borç/FAVÖK</th><th className="th text-right">Dönem</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="font-semibold"><td className="td !pl-0">{symbol}</td><td className="td text-right">{fmtNum(m!.pe, 1)}</td><td className="td text-right">{fmtNum(m!.evEbitda, 1)}</td><td className="td text-right">{fmtNum(m!.pb, 2)}</td><td className="td text-right">{fmtNum(m!.netDebtToEbitda, 1)}</td><td className="td text-right">{m!.period}</td></tr>
                      {l.peers.map((p) => <tr key={p.symbol}><td className="td !pl-0">{p.symbol}</td><td className="td text-right">{fmtNum(p.pe, 1)}</td><td className="td text-right">{fmtNum(p.evEbitda, 1)}</td><td className="td text-right">{fmtNum(p.pb, 2)}</td><td className="td text-right">{fmtNum(p.netDebtToEbitda, 1)}</td><td className="td text-right">{p.period ?? "—"}</td></tr>)}
                    </tbody></table></div>
              ) : <p className="mt-3 text-xs text-slate-500">Bu hisse için tanımlı emsal grubu yok; değerleme yalnızca kendi çarpanlarıyla gösterilir.</p>}
              <Stamp className="mt-3" source={a.statementsMeta.source} fetchedAt={a.statementsMeta.fetchedAt} />
              <p className="mt-1 text-[11px] text-slate-500">{l.note}</p>
            </>
          )}
        </section>
      ) : null}

      {a.company ? (
        <section className="card">
          <h2 className="h-sec">Şirkete özgü göstergeler</h2>
          {a.company.drivers.length ? (
            <ul className="mt-2 divide-y divide-slate-100">{a.company.drivers.map((dr, i) => (
              <li key={i} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">{dr.title}</p><p className={`text-sm font-semibold ${dr.missing ? "text-slate-400" : ""}`}>{dr.link ? <a href={dr.link} target="_blank" rel="noreferrer" className="underline">{dr.value}</a> : dr.value}</p></div>
                <p className="text-xs text-slate-600">{dr.detail}</p>
                <p className="text-[11px] text-slate-500">{dr.effect} · Kaynak: {dr.source}{dr.date ? ` · ${dr.date.length === 10 ? fmtDate(dr.date) : fmtDateTime(dr.date)}` : ""}</p>
              </li>))}</ul>
          ) : <p className="mt-2 text-sm text-slate-600">Bu şirket için tanımlı özel gösterge yok. Yatırımcı ilişkileri belgelerinden kaynak bağlantısıyla gösterge ekleyebilirsiniz.</p>}
          <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Yatırımcı ilişkileri belgesinden gösterge ekle</summary><div className="mt-3"><MetricForm symbol={symbol} /></div></details>
        </section>
      ) : null}

      <section className="card">
        <h2 className="h-sec">KAP bildirimleri</h2>
        {material.length ? <ul className="mt-2 divide-y divide-slate-100">{material.map((x) => <li key={x.id} className="py-2"><a href={kapLink(x.id)} target="_blank" rel="noreferrer" className="text-sm font-medium underline">{(x.summary?.split("\n")[0] || x.subject || "Bildirim").trim()}</a><p className="text-xs text-slate-500">{fmtDateTime(x.published_at)} · {x.subject}</p></li>)}</ul>
          : <p className="mt-2 text-sm text-slate-600">Son 180 günde şirket bildirimi bulunamadı ya da KAP'a ulaşılamadı.</p>}
        <Stamp className="mt-2" source="KAP (kap.org.tr)" fetchedAt={a.disclosures[0]?.fetched_at} />
      </section>

      <section className="card" id="gecmis">
        <h2 className="h-sec">Geçmiş öneriler</h2>
        {history.length ? <ul className="mt-2 divide-y divide-slate-100">{history.map((h) => <li key={h.report_date} className="py-2 text-sm"><div className="flex items-center justify-between gap-2"><Link href={`/ozet/${h.report_date}`} className="font-medium underline">{fmtDate(h.report_date)}</Link><StatusBadge status={h.status} /></div><p className="text-xs text-slate-600">{h.change_reason ?? h.data.reason}</p></li>)}</ul>
          : <p className="mt-2 text-sm text-slate-600">Bu hisse için henüz günlük rapor kaydı yok.</p>}
      </section>
    </div>
  );
}
