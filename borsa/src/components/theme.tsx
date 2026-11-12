"use client";
import { useEffect, useState } from "react";

export interface ChartTheme { bg: string; text: string; grid: string; border: string; dark: boolean }
const LIGHT: ChartTheme = { bg: "#ffffff", text: "#475569", grid: "#f1f5f9", border: "#e2e8f0", dark: false };
const DARK: ChartTheme = { bg: "#0d1424", text: "#94a3b8", grid: "#151f33", border: "#1e293b", dark: true };

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/** Grafikler için tema renkleri; tema değişince güncellenir. */
export function useChartTheme(): ChartTheme {
  const [t, setT] = useState<ChartTheme>(LIGHT);
  useEffect(() => {
    const upd = () => setT(isDark() ? DARK : LIGHT);
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

/** Sayfa çizilmeden önce temayı uygular (yanıp sönmeyi önler). */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('tema');var d=t?t==='koyu':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(isDark()), []);
  const toggle = () => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("tema", next ? "koyu" : "acik"); } catch {}
    setDark(next);
  };
  return (
    <button onClick={toggle} aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"} title={dark ? "Açık tema" : "Koyu tema"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100">
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
