import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import type { QuoteRow } from "@/lib/data";

export const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "text-slate-700" : v > 0 ? "text-up" : "text-down");

const STATUS_STYLE: Record<string, string> = {
  "Alım adayı": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Tut: "bg-slate-100 text-slate-700 ring-slate-200",
  Azalt: "bg-amber-50 text-amber-800 ring-amber-200",
  "Satış adayı": "bg-red-50 text-red-800 ring-red-200",
  Bekle: "bg-sky-50 text-sky-800 ring-sky-200",
  "Veri yetersiz": "bg-white text-slate-500 ring-slate-300",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status] ?? STATUS_STYLE["Tut"]}`}>{status}</span>;
}

export function KindBadge({ quote, stale }: { quote: QuoteRow | null; stale?: boolean }) {
  if (!quote) return <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">Veri yok</span>;
  if (stale) return <span className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Güncel değil</span>;
  return quote.kind === "delayed"
    ? <span className="whitespace-nowrap rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">15 dk gecikmeli</span>
    : <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">Kapanış</span>;
}

/** Her verinin altında: kaynak · veri tarihi · son güncelleme */
export function Stamp({ source, dataAt, fetchedAt, dateOnly, className = "" }: { source: string | null; dataAt?: string | null; fetchedAt?: string | null; dateOnly?: boolean; className?: string }) {
  return (
    <p className={`text-[11px] leading-4 text-slate-500 ${className}`}>
      Kaynak: {source ?? "—"}
      {dataAt ? <> · Veri: {dateOnly ? fmtDate(dataAt) : fmtDateTime(dataAt)}</> : null}
      {fetchedAt ? <> · Güncelleme: {fmtDateTime(fetchedAt)}</> : null}
    </p>
  );
}

export function QuoteStamp({ quote, stale, className }: { quote: QuoteRow | null; stale?: boolean; className?: string }) {
  if (!quote) return <p className={`text-[11px] text-slate-500 ${className ?? ""}`}>Doğrulanmış fiyat yok</p>;
  return (
    <div className={className}>
      <Stamp source={quote.source} dataAt={quote.as_of} fetchedAt={quote.fetched_at} />
      {stale ? <p className="text-[11px] font-medium text-amber-700">Sağlayıcıya ulaşılamadı: son doğrulanmış değer gösteriliyor ({fmtDate(quote.as_of)} {fmtTime(quote.as_of)}).</p> : null}
    </div>
  );
}

export function Notice({ kind = "warn", children }: { kind?: "warn" | "info" | "error"; children: React.ReactNode }) {
  const c = kind === "error" ? "border-red-200 bg-red-50 text-red-800" : kind === "info" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return <div className={`rounded-xl border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function Stat({ label, value, sub, valueClass = "" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="card !p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight sm:text-2xl ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

const ACTION_STYLE: Record<string, string> = {
  AL: "bg-emerald-600 text-white ring-emerald-600",
  SAT: "bg-red-600 text-white ring-red-600",
  AZALT: "bg-amber-500 text-white ring-amber-500",
  TUT: "bg-slate-100 text-slate-700 ring-slate-200",
  "İZLE": "bg-sky-50 text-sky-800 ring-sky-300",
  BEKLE: "bg-white text-slate-600 ring-slate-300",
  "UZAK DUR": "bg-red-50 text-red-700 ring-red-200",
  "VERİ YOK": "bg-white text-slate-400 ring-slate-200",
};
/** Sinyal ekranındaki net eylem etiketi */
export function ActionBadge({ action, size = "sm" }: { action: string; size?: "sm" | "lg" }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md font-bold tracking-wide ring-1 ring-inset ${size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px]"} ${ACTION_STYLE[action] ?? ACTION_STYLE.BEKLE}`}>{action}</span>;
}
