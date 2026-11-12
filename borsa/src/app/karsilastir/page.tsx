import Link from "next/link";
import { redirect } from "next/navigation";
import { getBars, getInstrument, refreshBars } from "@/lib/data";
import { compareStats, ensureStock, type CompareSeries } from "@/lib/market";
import { getLastScan } from "@/lib/scan";
import { addDays, istDate } from "@/lib/time";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { ActionBadge, Notice, tone } from "@/components/ui";
import LineChart from "@/components/LineChart";

export const dynamic = "force-dynamic";

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];
const RANGES = [{ k: "1a", label: "1 ay", d: 31 }, { k: "3a", label: "3 ay", d: 92 }, { k: "6a", label: "6 ay", d: 183 }, { k: "1y", label: "1 yıl", d: 365 }, { k: "3y", label: "3 yıl", d: 1095 }];
const PRESETS = [
  { label: "Havacılık", s: "THYAO,PGSUS,TAVHL" },
  { label: "Bankalar", s: "AKBNK,GARAN,ISCTR,YKBNK" },
  { label: "Otomotiv", s: "FROTO,TOASO" },
  { label: "Holdingler", s: "KCHOL,SAHOL,ALARK" },
  { label: "Perakende", s: "BIMAS,MGROS" },
  { label: "Demir-çelik", s: "EREGL,KRDMD" },
];

async function compareAction(fd: FormData) {
  "use server";
  const raw = String(fd.get("s") ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean).slice(0, 5);
  redirect(`/karsilastir?s=${raw.join(",")}&r=${String(fd.get("r") ?? "1y")}`);
}

export default async function Karsilastir({ searchParams }: { searchParams: Promise<{ s?: string; r?: string }> }) {
  const sp = await searchParams;
  const symbols = [...new Set((sp.s ?? "THYAO,PGSUS,TAVHL").toUpperCase().split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 5);
  const range = RANGES.find((x) => x.k === sp.r) ?? RANGES[3];
  const from = addDays(istDate(), -range.d);
  const scan = await getLastScan();
  const scanRow = new Map((scan?.rows ?? []).map((r) => [r.symbol, r]));

  const missing: string[] = [];
  const series: CompareSeries[] = [];
  await Promise.all(symbols.map((s) => ensureStock(s)));
  await Promise.all([...symbols.map((s) => refreshBars({ symbol: s, type: "stock" })), refreshBars({ symbol: "XU100", type: "index" })]);
  for (const s of symbols) {
    const inst = await getInstrument(s);
    const bars = inst ? await getBars(s, addDays(from, -10)) : [];
    if (!inst || bars.length < 2) { missing.push(s); continue; }
    series.push(compareStats(s, inst.name, bars, from));
  }
  const bench = compareStats("XU100", "BIST 100", await getBars("XU100", addDays(from, -10)), from);
  const lines = [
    ...series.map((x, i) => ({ name: x.symbol, color: COLORS[i % COLORS.length], data: x.points })),
    ...(bench.points.length ? [{ name: "BIST 100", color: "#94a3b8", data: bench.points }] : []),
  ];
  const best = [...series].filter((x) => x.retPct !== null).sort((a, b) => b.retPct! - a.retPct!)[0];
  const href = (o: { s?: string; r?: string }) => `/karsilastir?s=${o.s ?? symbols.join(",")}&r=${o.r ?? range.k}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Karşılaştır</h1>
        <p className="text-xs text-slate-500">En fazla 5 hisseyi aynı başlangıçtan (0%) getiri, oynaklık ve en büyük düşüşle karşılaştırın. BIST 100 gri çizgidir.</p>
      </div>

      <form action={compareAction} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="s">Hisseler (virgülle)</label>
          <input id="s" name="s" className="input font-semibold uppercase tracking-wide" defaultValue={symbols.join(", ")} placeholder="THYAO, PGSUS, TAVHL" />
        </div>
        <input type="hidden" name="r" value={range.k} />
        <button className="btn">Karşılaştır</button>
        <div className="flex w-full flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Hazır gruplar:</span>
          {PRESETS.map((p) => <Link key={p.label} href={href({ s: p.s })} className="chip bg-slate-100 text-slate-700 hover:bg-slate-200">{p.label}</Link>)}
        </div>
      </form>

      {missing.length ? <Notice>Bulunamadı ya da fiyat verisi yok: {missing.join(", ")}</Notice> : null}

      {series.length ? (
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="h-sec">Getiri — {fmtDate(from)} başlangıçlı</h2>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
              {RANGES.map((x) => <Link key={x.k} href={href({ r: x.k })} aria-selected={x.k === range.k} className={`chip ${x.k === range.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>{x.label}</Link>)}
            </div>
          </div>
          <LineChart lines={lines} suffix="%" height={360} />
          {best ? <p className="mt-3 text-sm">Bu dönemde en iyi: <b>{best.symbol}</b> <span className={tone(best.retPct)}>{fmtPct(best.retPct, 1)}</span>{bench.retPct !== null ? <> · BIST 100 <span className={tone(bench.retPct)}>{fmtPct(bench.retPct, 1)}</span></> : null}</p> : null}
        </section>
      ) : null}

      {series.length ? (
        <section className="card !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr className="border-b border-slate-100">
                <th className="th pl-5">Hisse</th><th className="th text-right">Son fiyat</th><th className="th text-right">Getiri</th><th className="th text-right">BIST 100'e göre</th>
                <th className="th text-right">Yıllık oynaklık</th><th className="th text-right">En büyük düşüş</th><th className="th text-right">RSI</th><th className="th text-right">Teknik puan</th><th className="th pr-5">Sinyal</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...series, ...(bench.points.length ? [bench] : [])].map((x, i) => {
                  const r = scanRow.get(x.symbol);
                  const isBench = x.symbol === "XU100";
                  return (
                    <tr key={x.symbol} className={isBench ? "bg-slate-50" : ""}>
                      <td className="td pl-5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: isBench ? "#94a3b8" : COLORS[i % COLORS.length] }} />{isBench ? <b>BIST 100</b> : <Link href={`/hisse/${x.symbol}`} className="font-semibold hover:underline">{x.symbol}</Link>}<p className="ml-[18px] max-w-[180px] truncate text-xs text-slate-500">{isBench ? "Endeks" : x.name}</p></td>
                      <td className="td text-right">{fmtNum(x.last, isBench ? 0 : 2)}</td>
                      <td className={`td text-right font-semibold ${tone(x.retPct)}`}>{fmtPct(x.retPct, 1)}</td>
                      <td className={`td text-right ${tone(isBench || x.retPct === null || bench.retPct === null ? null : x.retPct - bench.retPct)}`}>{isBench || x.retPct === null || bench.retPct === null ? "—" : `${x.retPct - bench.retPct > 0 ? "+" : ""}${fmtNum(x.retPct - bench.retPct, 1)} puan`}</td>
                      <td className="td text-right">%{fmtNum(x.volPct, 0)}</td>
                      <td className="td text-right text-down">{fmtPct(x.maxDdPct, 1)}</td>
                      <td className="td text-right">{fmtNum(r?.rsi, 0)}</td>
                      <td className={`td text-right ${tone(r?.score)}`}>{r ? `${r.score > 0 ? "+" : ""}${r.score}` : "—"}</td>
                      <td className="td pr-5">{r ? <ActionBadge action={r.action} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-3 pt-2 text-[11px] text-slate-500">Getiri temettü ve bölünmeye göre düzeltilmiş kapanışlarla hesaplanır. Oynaklık: günlük getirilerin yıllıklandırılmış standart sapması. En büyük düşüş: dönem içindeki zirveden en derin geri çekilme. Kaynak: İş Yatırım.</p>
        </section>
      ) : null}
    </div>
  );
}
