import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/report";
import { ReportView } from "@/components/ReportView";

export const dynamic = "force-dynamic";

export default async function OzetGun({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const r = await getReport(date);
  if (!r) notFound();
  return (
    <div className="space-y-5">
      <div><Link href="/ozet" className="text-sm text-slate-500 underline">← Günlük Özet</Link><h1 className="mt-1 text-2xl font-bold tracking-tight">Geçmiş rapor</h1></div>
      <ReportView r={r} />
    </div>
  );
}
