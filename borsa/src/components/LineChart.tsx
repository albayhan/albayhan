"use client";
import { useEffect, useRef, useState } from "react";
import { useChartTheme } from "./theme";
import { createChart, CrosshairMode } from "lightweight-charts";

export interface Line { name: string; color: string; data: { time: string; value: number }[] }
const nf = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Çok serili çizgi grafik. `suffix` değerlerin birimidir (ör. "%"). */
export default function LineChart({ lines, suffix = "", height = 280 }: { lines: Line[]; suffix?: string; height?: number }) {
  const th = useChartTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ time: string; values: (number | null)[] } | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const chart = createChart(el, {
      height,
      layout: { background: { color: th.bg }, textColor: th.text, fontSize: 11 },
      grid: { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
      rightPriceScale: { borderColor: th.border },
      timeScale: { borderColor: th.border },
      crosshair: { mode: CrosshairMode.Magnet },
      localization: { locale: "tr-TR", priceFormatter: (p: number) => nf.format(p) + suffix },
    });
    const series = lines.map((l) => {
      const s = chart.addLineSeries({ color: l.color, lineWidth: 2, priceLineVisible: false });
      s.setData(l.data);
      return s;
    });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      if (!p.time) return setHover(null);
      setHover({ time: p.time as string, values: series.map((s) => { const d = p.seriesData.get(s) as any; return d ? d.value : null; }) });
    });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [lines, suffix, height, th]);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {lines.map((l, i) => {
          const v = hover ? hover.values[i] : l.data[l.data.length - 1]?.value ?? null;
          return (
            <span key={l.name} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: l.color }} />{l.name}
              <span className="font-semibold text-slate-900">{v === null ? "—" : nf.format(v) + suffix}</span>
            </span>
          );
        })}
        <span className="text-slate-400">{(hover?.time ?? lines[0]?.data[lines[0].data.length - 1]?.time ?? "").split("-").reverse().join(".")}</span>
      </div>
      <div ref={ref} className="w-full" data-testid="line-chart" />
    </div>
  );
}
