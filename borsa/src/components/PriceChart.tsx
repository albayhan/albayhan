"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, LineStyle, type IChartApi } from "lightweight-charts";

export interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number | null; hasOpen: boolean }
export interface Overlay { name: string; color: string; data: { time: string; value: number }[] }
export interface PriceLevel { price: number; title: string; color: string }
export interface Marker { time: string; kind: "buy" | "sell"; text: string }

const RANGES = [{ k: "3A", d: 66 }, { k: "6A", d: 132 }, { k: "1Y", d: 252 }, { k: "3Y", d: 9999 }];
const nf = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cf = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

export default function PriceChart({ candles, overlays, levels, volumeUnit, markers = [] }: { candles: Candle[]; overlays: Overlay[]; levels: PriceLevel[]; volumeUnit: string; markers?: Marker[] }) {
  const [showMarkers, setShowMarkers] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState("6A");
  const [hover, setHover] = useState<Candle | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const chart = createChart(el, {
      height: el.clientWidth < 500 ? 320 : 420,
      layout: { background: { color: "#ffffff" }, textColor: "#475569", fontSize: 11 },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", rightOffset: 3 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: "tr-TR", priceFormatter: (p: number) => nf.format(p) },
      handleScale: { axisPressedMouseMove: false },
    });
    chartRef.current = chart;
    const cs = chart.addCandlestickSeries({ upColor: "#0f9d6b", downColor: "#d9443f", borderUpColor: "#0f9d6b", borderDownColor: "#d9443f", wickUpColor: "#0f9d6b", wickDownColor: "#d9443f" });
    cs.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    const vs = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    vs.setData(candles.filter((c) => c.volume !== null).map((c, i, a) => ({ time: c.time, value: c.volume!, color: i > 0 && c.close < a[i - 1].close ? "#f3c4c2" : "#b7e0d1" })));
    for (const o of overlays) {
      chart.addLineSeries({ color: o.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(o.data);
    }
    if (showMarkers && markers.length) {
      cs.setMarkers([...markers].sort((a, b) => a.time.localeCompare(b.time)).map((m) => ({
        time: m.time, position: m.kind === "buy" ? "belowBar" : "aboveBar", color: m.kind === "buy" ? "#0f9d6b" : "#d9443f",
        shape: m.kind === "buy" ? "arrowUp" : "arrowDown", text: m.text,
      })));
    }
    for (const l of levels) cs.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title });
    const byTime = new Map(candles.map((c) => [c.time, c]));
    chart.subscribeCrosshairMove((p) => setHover(p.time ? byTime.get(p.time as string) ?? null : null));
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [candles, overlays, levels, markers, showMarkers]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles.length) return;
    const d = RANGES.find((r) => r.k === range)!.d;
    const from = candles[Math.max(0, candles.length - d)].time;
    chart.timeScale().setVisibleRange({ from, to: candles[candles.length - 1].time });
  }, [range, candles, showMarkers]);

  const c = hover ?? candles[candles.length - 1];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600" data-testid="chart-legend">
          {c ? (
            <>
              <span className="font-medium text-slate-900">{c.time.split("-").reverse().join(".")}</span>
              {c.hasOpen ? <span>A {nf.format(c.open)}</span> : null}
              <span>Y {nf.format(c.high)}</span><span>D {nf.format(c.low)}</span><span>K {nf.format(c.close)}</span>
              {c.volume !== null ? <span>Hacim {cf.format(c.volume)} {volumeUnit}</span> : null}
            </>
          ) : null}
        </div>
        <div className="flex gap-1" role="group" aria-label="Grafik aralığı">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)} aria-pressed={range === r.k}
              className={`min-h-[32px] rounded-lg px-2.5 text-xs font-medium ${range === r.k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{r.k}</button>
          ))}
        </div>
      </div>
      <div ref={ref} className="w-full" data-testid="price-chart" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {overlays.map((o) => (
          <span key={o.name} className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: o.color }} />{o.name}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-emerald-700" />Destek</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-red-700" />Direnç</span>
        {markers.length ? (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
            Geçmiş al/sat sinyalleri ({markers.filter((m) => m.kind === "buy").length})
          </label>
        ) : null}
      </div>
    </div>
  );
}
