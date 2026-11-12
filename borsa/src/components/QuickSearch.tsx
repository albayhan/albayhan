"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

interface Hit { symbol: string; type: string; name: string }

/** Başlıktaki hızlı hisse arama: yaz, seç, hisse sayfasına git. "/" tuşu odaklar. */
export default function QuickSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        setHits((j.results as Hit[]).slice(0, 8)); setSel(0); setOpen(true);
      } catch { setHits([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: Hit | undefined) => {
    const target = h ?? (q.trim().length >= 2 ? { symbol: q.trim().toUpperCase(), type: "stock", name: "" } : undefined);
    if (!target) return;
    setOpen(false); setQ(""); ref.current?.blur();
    router.push(target.type === "fund" ? `/fon/${target.symbol}` : `/hisse/${target.symbol}`);
  };

  return (
    <div className="relative w-full max-w-[220px]">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">{Icon.search("h-4 w-4")}</span>
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(hits[sel]); }
          else if (e.key === "Escape") { setOpen(false); ref.current?.blur(); }
        }}
        placeholder="Hisse ara…  /" aria-label="Hisse ara" autoComplete="off"
        className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white" />
      {open && hits.length ? (
        <ul className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox">
          {hits.map((h, i) => (
            <li key={h.symbol + h.type} role="option" aria-selected={i === sel}>
              <button onMouseDown={(e) => { e.preventDefault(); go(h); }} onMouseEnter={() => setSel(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === sel ? "bg-slate-100" : ""}`}>
                <span className="w-16 text-sm font-semibold">{h.symbol}</span>
                <span className="flex-1 truncate text-xs text-slate-500">{h.name}</span>
                <span className="text-[10px] text-slate-400">{h.type === "fund" ? "Fon" : "Hisse"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
