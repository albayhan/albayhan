/** Sunucuda çizilen hafif SVG grafikler (JavaScript gerektirmez). */

const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function Sparkline({ data, width = 120, height = 32, className = "" }: { data: number[]; width?: number; height?: number; className?: string }) {
  if (data.length < 2) return <span className="text-xs text-slate-400">—</span>;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const up = data[data.length - 1] >= data[0];
  const color = up ? "#0f9d6b" : "#d9443f";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={`Son ${data.length} gün ${up ? "yükseliş" : "düşüş"}`}>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={color} opacity={0.08} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export interface Slice { label: string; value: number; color: string }

/** Halka grafik + açıklama */
export function Donut({ slices, size = 180, center }: { slices: Slice[]; size?: number; center?: { top: string; bottom: string } }) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (!(total > 0)) return null;
  const r = size / 2 - 14, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Varlık dağılımı">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={22} />
        {slices.map((s) => {
          const len = (Math.max(0, s.value) / total) * c;
          const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={22}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${s.label}: %${nf((s.value / total) * 100)}`}</title></circle>;
          acc += len;
          return el;
        })}
        {center ? <>
          <text x="50%" y="47%" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 15, fontWeight: 600 }}>{center.top}</text>
          <text x="50%" y="60%" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11 }}>{center.bottom}</text>
        </> : null}
      </svg>
      <ul className="grid flex-1 grid-cols-2 gap-x-5 gap-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="font-medium">{s.label}</span><span className="ml-auto text-slate-500">%{nf((s.value / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Yatay, sıfır eksenli çubuk grafik (pozitif yeşil, negatif kırmızı). */
export function DivergingBars({ rows, unit = "%", digits = 1, href }: { rows: { label: string; value: number; sub?: string }[]; unit?: string; digits?: number; href?: (label: string) => string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        const pos = r.value >= 0;
        const label = href ? <a href={href(r.label)} className="font-medium hover:underline">{r.label}</a> : <span className="font-medium">{r.label}</span>;
        return (
          <li key={r.label} className="grid grid-cols-[64px_1fr_72px] items-center gap-2 text-xs sm:grid-cols-[80px_1fr_84px]">
            <span className="truncate">{label}</span>
            <div className="relative h-4 rounded bg-slate-50">
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
              <div className={`absolute inset-y-0.5 rounded-sm ${pos ? "bg-up/80" : "bg-down/80"}`} style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} title={r.sub} />
            </div>
            <span className={`text-right font-semibold ${pos ? "text-up" : "text-down"}`}>{r.value > 0 ? "+" : ""}{nf(r.value, digits)}{unit}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 0–100 arası gösterge çubuğu (ör. RSI ya da puan) */
export function Meter({ value, min = 0, max = 100, zones, label }: { value: number | null; min?: number; max?: number; zones?: { to: number; color: string }[]; label?: string }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const zs = zones ?? [{ to: max, color: "#e2e8f0" }];
  let prev = min;
  return (
    <div className="w-full" aria-label={label}>
      <div className="relative h-2 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          {zs.map((z) => { const w = ((z.to - prev) / (max - min)) * 100; prev = z.to; return <div key={z.to} style={{ width: `${w}%`, background: z.color }} />; })}
        </div>
      </div>
      <div className="relative h-0"><div className="absolute -top-3 h-4 w-1 -translate-x-1/2 rounded bg-slate-900" style={{ left: `${pct}%` }} /></div>
    </div>
  );
}

/** Basit dikey çubuklar (ör. işlem getirileri) */
export function ColumnBars({ values, height = 90, labels }: { values: number[]; height?: number; labels?: string[] }) {
  if (!values.length) return null;
  const max = Math.max(...values.map(Math.abs), 0.0001);
  const half = height / 2;
  const w = 100 / values.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-[90px] w-full" role="img" aria-label="İşlem getirileri">
      <line x1={0} x2={100} y1={half} y2={half} stroke="#cbd5e1" strokeWidth={0.3} />
      {values.map((v, i) => {
        const h = (Math.abs(v) / max) * (half - 2);
        return <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={v >= 0 ? half - h : half} height={Math.max(h, 0.4)} fill={v >= 0 ? "#0f9d6b" : "#d9443f"}><title>{`${labels?.[i] ?? ""} ${v > 0 ? "+" : ""}${nf(v)}%`}</title></rect>;
      })}
    </svg>
  );
}
