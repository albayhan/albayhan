"use client";
import { useEffect, useRef, useState } from "react";
import { useChartTheme } from "./theme";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";

type Pt = { time: string; value: number };
const nf = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** RSI (14) ve MACD (12-26-9) panelleri; son 1 yıl gösterilir. */
export default function IndicatorChart({ rsi, macd, signal, hist }: { rsi: Pt[]; macd: Pt[]; signal: Pt[]; hist: Pt[] }) {
  const th = useChartTheme();
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ time: string; rsi?: number; macd?: number; sig?: number; hist?: number } | null>(null);

  useEffect(() => {
    if (!rsiRef.current || !macdRef.current) return;
    const base = {
      layout: { background: { color: th.bg }, textColor: th.text, fontSize: 11 },
      grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
      rightPriceScale: { borderColor: th.border },
      timeScale: { borderColor: th.border },
      crosshair: { mode: CrosshairMode.Magnet },
      localization: { locale: "tr-TR", priceFormatter: (p: number) => nf.format(p) },
      handleScale: { axisPressedMouseMove: false },
    };
    const c1 = createChart(rsiRef.current, { ...base, height: 150 });
    const c2 = createChart(macdRef.current, { ...base, height: 170 });
    const rs = c1.addLineSeries({ color: "#7c3aed", lineWidth: 2, priceLineVisible: false });
    rs.setData(rsi);
    rs.createPriceLine({ price: 70, color: "#d9443f", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Aşırı alım" });
    rs.createPriceLine({ price: 30, color: "#0f9d6b", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Aşırı satım" });
    rs.createPriceLine({ price: 50, color: "#cbd5e1", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
    const hs = c2.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    hs.setData(hist.map((h, i) => ({ ...h, color: h.value >= 0 ? (i > 0 && h.value < hist[i - 1].value ? "#9fd9c3" : "#0f9d6b") : (i > 0 && h.value > hist[i - 1].value ? "#f0b4b1" : "#d9443f") })));
    const ms = c2.addLineSeries({ color: "#2563eb", lineWidth: 2, priceLineVisible: false });
    ms.setData(macd);
    const ss = c2.addLineSeries({ color: "#d97706", lineWidth: 2, priceLineVisible: false });
    ss.setData(signal);

    // İki paneli eşle
    let syncing = false;
    const sync = (from: typeof c1, to: typeof c1) => from.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (syncing || !r) return;
      syncing = true; to.timeScale().setVisibleLogicalRange(r); syncing = false;
    });
    sync(c1, c2); sync(c2, c1);
    const from = rsi[Math.max(0, rsi.length - 252)]?.time;
    if (from) { c1.timeScale().setVisibleRange({ from, to: rsi[rsi.length - 1].time }); }
    const val = (m: Map<any, any>, s: any) => (m.get(s) as any)?.value as number | undefined;
    const onMove = (p: any) => {
      if (!p.time) return setHover(null);
      setHover({ time: p.time as string, rsi: val(p.seriesData, rs), macd: val(p.seriesData, ms), sig: val(p.seriesData, ss), hist: val(p.seriesData, hs) });
    };
    c1.subscribeCrosshairMove(onMove);
    c2.subscribeCrosshairMove(onMove);
    const ro = new ResizeObserver(() => { c1.applyOptions({ width: rsiRef.current!.clientWidth }); c2.applyOptions({ width: macdRef.current!.clientWidth }); });
    ro.observe(rsiRef.current);
    return () => { ro.disconnect(); c1.remove(); c2.remove(); };
  }, [rsi, macd, signal, hist, th]);

  const lastR = rsi[rsi.length - 1]?.value, lastM = macd[macd.length - 1]?.value, lastS = signal[signal.length - 1]?.value, lastH = hist[hist.length - 1]?.value;
  const r = hover?.rsi ?? lastR, m = hover?.macd ?? lastM, s = hover?.sig ?? lastS, h = hover?.hist ?? lastH;
  const fmt = (v?: number) => (v === undefined ? "—" : nf.format(v));
  const rsiText = r === undefined ? "" : r > 70 ? "aşırı alım" : r < 30 ? "aşırı satım" : r >= 50 ? "alıcılar güçlü" : "satıcılar güçlü";
  return (
    <div className="space-y-3" data-testid="indicator-chart">
      <div>
        <p className="mb-1 flex flex-wrap items-baseline gap-x-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">RSI (14)</span>
          <span className="font-semibold text-violet-700">{fmt(r)}</span><span>{rsiText}</span>
          {hover ? <span className="text-slate-400">{hover.time.split("-").reverse().join(".")}</span> : null}
        </p>
        <div ref={rsiRef} className="w-full" />
      </div>
      <div>
        <p className="mb-1 flex flex-wrap items-baseline gap-x-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">MACD (12-26-9)</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-blue-600" />MACD <b className="text-slate-900">{fmt(m)}</b></span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-amber-600" />Sinyal <b className="text-slate-900">{fmt(s)}</b></span>
          <span>Histogram <b className={h !== undefined && h >= 0 ? "text-up" : "text-down"}>{fmt(h)}</b></span>
        </p>
        <div ref={macdRef} className="w-full" />
      </div>
      <p className="text-[11px] text-slate-500">RSI 70 üstü aşırı alım, 30 altı aşırı satım bölgesidir. MACD çizgisinin sinyal çizgisini yukarı kesmesi (histogramın pozitife dönmesi) yükseliş ivmesine, aşağı kesmesi düşüş ivmesine işaret eder.</p>
    </div>
  );
}
