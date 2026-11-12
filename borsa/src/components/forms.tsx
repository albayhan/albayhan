"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { addInstrumentAction, addMetricAction, addTxAction, importCsvAction, runReportAction, type FormState } from "@/app/actions";

function Result({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
        {state.errors?.length ? <ul className="mt-1 list-disc pl-5">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      </div>
    );
  }
  if (state.ok) return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</div>;
  return null;
}

const TYPES = [
  ["BUY", "Alış"], ["SELL", "Satış"], ["DIVIDEND", "Temettü"], ["SPLIT", "Bedelsiz / Bölünme"], ["RIGHTS", "Bedelli"], ["DEPOSIT", "Para yatırma"], ["WITHDRAW", "Para çekme"],
] as const;

export function TxForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addTxAction, {});
  const [type, setType] = useState("BUY");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  const trade = type === "BUY" || type === "SELL" || type === "RIGHTS";
  const cash = type === "DEPOSIT" || type === "WITHDRAW";
  return (
    <form ref={ref} action={action} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div><label className="label" htmlFor="tx-date">Tarih</label><input id="tx-date" className="input" type="date" name="date" defaultValue={today} max={today} required /></div>
      <div>
        <label className="label" htmlFor="tx-type">İşlem</label>
        <select id="tx-type" className="input" name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!cash ? <div><label className="label" htmlFor="tx-symbol">Sembol</label><input id="tx-symbol" className="input uppercase" name="symbol" placeholder="THYAO" required /></div> : null}
      {trade ? <div><label className="label" htmlFor="tx-qty">Adet</label><input id="tx-qty" className="input" name="quantity" inputMode="decimal" placeholder="100" required /></div> : null}
      {type === "SPLIT" ? <div><label className="label" htmlFor="tx-qty">Çarpan</label><input id="tx-qty" className="input" name="quantity" inputMode="decimal" placeholder="%100 bedelsiz için 2" required /></div> : null}
      {trade ? <div><label className="label" htmlFor="tx-price">Fiyat (₺)</label><input id="tx-price" className="input" name="price" inputMode="decimal" placeholder="312,50" required /></div> : null}
      {trade ? <div><label className="label" htmlFor="tx-fee">Komisyon (₺)</label><input id="tx-fee" className="input" name="fee" inputMode="decimal" placeholder="0" /></div> : null}
      {type === "DIVIDEND" || cash ? <div><label className="label" htmlFor="tx-amount">{type === "DIVIDEND" ? "Net temettü (₺)" : "Tutar (₺)"}</label><input id="tx-amount" className="input" name="amount" inputMode="decimal" placeholder="10.000" required /></div> : null}
      <div className="col-span-2"><label className="label" htmlFor="tx-note">Not</label><input id="tx-note" className="input" name="note" placeholder="İsteğe bağlı" /></div>
      <div className="col-span-2 flex items-end sm:col-span-4"><button className="btn" disabled={pending}>{pending ? "Kaydediliyor…" : "İşlemi kaydet"}</button></div>
      <div className="col-span-2 sm:col-span-4"><Result state={state} /></div>
    </form>
  );
}

export function CsvForm() {
  const [state, action, pending] = useActionState(importCsvAction, {});
  return (
    <form action={action} className="space-y-3">
      <div><label className="label" htmlFor="csv-file">CSV dosyası</label><input id="csv-file" className="block w-full text-sm" type="file" name="file" accept=".csv,text/csv" /></div>
      <div><label className="label" htmlFor="csv-text">ya da içeriği yapıştırın</label>
        <textarea id="csv-text" className="input min-h-[110px] py-2 font-mono text-xs" name="text" placeholder={"tarih,islem,sembol,adet,fiyat,komisyon,tutar,not\n2026-10-01,YATIR,,,,,100000,\n2026-10-02,AL,THYAO,100,285.50,28.55,,"} />
      </div>
      <button className="btn" disabled={pending}>{pending ? "İçe aktarılıyor…" : "CSV'yi içe aktar"}</button>
      <Result state={state} />
    </form>
  );
}

interface Hit { symbol: string; type: string; name: string; added: boolean }

export function SearchAdd() {
  const [qv, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [state, action, pending] = useActionState(addInstrumentAction, {});
  useEffect(() => {
    if (qv.trim().length < 2) { setHits([]); setNote(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(qv.trim())}`);
        const j = await r.json();
        setHits(j.results); setNote(j.note ?? null);
      } catch { setNote("Arama yapılamadı."); }
    }, 250);
    return () => clearTimeout(t);
  }, [qv, state]);
  return (
    <div className="space-y-3">
      <label className="label" htmlFor="search">BIST hissesi veya TEFAS fon kodu ara</label>
      <input id="search" className="input" value={qv} onChange={(e) => setQ(e.target.value)} placeholder="Örn. GARAN, Koç, TTE" autoComplete="off" />
      {note ? <p className="text-xs text-amber-700">{note}</p> : null}
      {hits.length ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {hits.map((h) => (
            <li key={h.symbol + h.type} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{h.symbol} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{h.type === "fund" ? "TEFAS fonu" : "BIST hisse"}</span></p>
                <p className="truncate text-xs text-slate-500">{h.name}</p>
              </div>
              {h.added ? <span className="text-xs text-slate-500">Listede</span> : (
                <form action={action}>
                  <input type="hidden" name="symbol" value={h.symbol} /><input type="hidden" name="type" value={h.type} />
                  <button className="btn-ghost !min-h-[36px] !px-3" disabled={pending} aria-label={`${h.symbol} ekle`}>Ekle</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : qv.trim().length >= 2 && !note ? <p className="text-xs text-slate-500">Sonuç yok.</p> : null}
      <Result state={state} />
    </div>
  );
}

export function RunReportButton() {
  const [state, action, pending] = useActionState(runReportAction, {});
  return (
    <form action={action} className="space-y-2">
      <button className="btn-ghost" disabled={pending}>{pending ? "Üretiliyor…" : "Özeti şimdi üret"}</button>
      <Result state={state} />
    </form>
  );
}

export function MetricForm({ symbol }: { symbol: string }) {
  const [state, action, pending] = useActionState(addMetricAction, {});
  return (
    <form action={action} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <input type="hidden" name="symbol" value={symbol} />
      <input className="input" name="metric" placeholder="Gösterge (ör. Kapasite kullanımı)" aria-label="Gösterge" />
      <input className="input" name="period" placeholder="Dönem (ör. 2026/3Ç)" aria-label="Dönem" />
      <input className="input" name="value" placeholder="Değer (ör. %94)" aria-label="Değer" />
      <input className="input" name="source_url" placeholder="Kaynak bağlantısı (https://…)" aria-label="Kaynak bağlantısı" />
      <button className="btn-ghost" disabled={pending}>Ekle</button>
      <div className="col-span-2 sm:col-span-5"><Result state={state} /></div>
    </form>
  );
}
