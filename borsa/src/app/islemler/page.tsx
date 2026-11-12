import Link from "next/link";
import { loadTxs } from "@/lib/portfolio-data";
import { TX_LABELS } from "@/lib/portfolio";
import { fmtDate, fmtNum, fmtTL } from "@/lib/format";
import { istDate } from "@/lib/time";
import { CsvForm, TxForm } from "@/components/forms";
import { Notice } from "@/components/ui";
import { deleteTxAction } from "../actions";
import { CSV_HEADER } from "@/lib/csv";

export const dynamic = "force-dynamic";

export default async function Islemler({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  const sp = await searchParams;
  const txs = (await loadTxs()).reverse();
  return (
    <div className="space-y-5">
      <div><Link href="/" className="text-sm text-slate-500 underline">← Portföy</Link><h1 className="mt-1 text-2xl font-bold tracking-tight">İşlemler</h1></div>
      {sp.hata ? <Notice kind="error">{sp.hata}</Notice> : null}
      <section className="card"><h2 className="h-sec mb-3">İşlem ekle</h2><TxForm today={istDate()} /></section>
      <section className="card">
        <h2 className="h-sec">CSV ile içe aktar</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">Başlık: <code className="rounded bg-slate-100 px-1">{CSV_HEADER}</code> · İşlem türleri: AL, SAT, TEMETTU, BEDELSIZ, BEDELLI, YATIR, CEK · Tarih: 2026-10-02 ya da 02.10.2026 · Hatalı satır varsa hiçbir satır kaydedilmez.</p>
        <CsvForm />
      </section>
      <section className="card !p-0">
        <h2 className="h-sec px-4 pt-4 sm:px-5">Kayıtlı işlemler ({txs.length})</h2>
        {txs.length === 0 ? <p className="px-4 py-4 text-sm text-slate-600 sm:px-5">Henüz işlem yok.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-slate-100"><th className="th pl-5">Tarih</th><th className="th">İşlem</th><th className="th">Sembol</th><th className="th text-right">Adet / çarpan</th><th className="th text-right">Fiyat</th><th className="th text-right">Komisyon</th><th className="th text-right">Tutar</th><th className="th pr-5"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {txs.map((t) => (
                  <tr key={t.id}>
                    <td className="td pl-5">{fmtDate(t.date)}</td><td className="td">{TX_LABELS[t.type]}</td><td className="td font-medium">{t.symbol ?? "—"}</td>
                    <td className="td text-right">{t.quantity !== null ? fmtNum(t.quantity, t.type === "SPLIT" ? 2 : 0) : "—"}</td>
                    <td className="td text-right">{t.price !== null ? fmtNum(t.price) : "—"}</td>
                    <td className="td text-right">{t.fee ? fmtNum(t.fee) : "—"}</td>
                    <td className="td text-right">{t.amount !== null ? fmtTL(t.amount) : t.quantity !== null && t.price !== null ? fmtTL(t.quantity * t.price) : "—"}</td>
                    <td className="td pr-5 text-right"><form action={deleteTxAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-red-700 underline" aria-label={`${fmtDate(t.date)} ${TX_LABELS[t.type]} işlemini sil`}>Sil</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
