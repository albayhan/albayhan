import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import QuickSearch from "@/components/QuickSearch";
import Ticker from "@/components/Ticker";
import { ThemeToggle, THEME_SCRIPT } from "@/components/theme";
import { Icon } from "@/components/icons";
import { providerStatuses } from "@/lib/data";
import { listAlerts } from "@/lib/alerts";
import { tickerItems, type Tick } from "@/lib/market";

export const metadata: Metadata = { title: "BIST Portföy", description: "Türkiye borsası için portföy, sinyal, analiz ve günlük özet" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0f1c" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let down = 0, fired = 0;
  let ticks: Tick[] = [];
  try {
    down = (await providerStatuses()).filter((s) => !s.ok).length;
    fired = (await listAlerts()).filter((a) => a.triggeredAt && !a.seen).length;
    ticks = await tickerItems();
  } catch {
    down = -1;
  }
  const status = down === 0 ? "Veri bağlantıları çalışıyor" : down < 0 ? "Veritabanına ulaşılamıyor" : `${down} veri kaynağında sorun`;
  return (
    <html lang="tr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight">{Icon.logo()}<span className="hidden sm:inline">BIST Portföy</span></Link>
            <div className="hidden min-w-0 flex-1 lg:block"><Nav variant="top" /></div>
            <div className="ml-auto flex items-center gap-2">
              <QuickSearch />
              {fired > 0 ? <Link href="/sinyaller#alarmlar-tetiklenen" className="whitespace-nowrap rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">🔔 {fired}</Link> : null}
              <Link href="/durum" className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-100" title={status} aria-label={status}>
                <span className="relative flex h-2 w-2">
                  {down === 0 ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" /> : null}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${down === 0 ? "bg-up" : down < 0 ? "bg-down" : "bg-amber-500"}`} />
                </span>
                <span className="hidden xl:inline">{status}</span>
              </Link>
              <ThemeToggle />
            </div>
          </div>
          <Ticker items={ticks} />
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:pb-12">{children}</main>
        <footer className="mx-auto hidden max-w-7xl px-4 pb-8 text-[11px] text-slate-400 lg:block">BIST Portföy · Veriler 15 dk gecikmelidir · Kural tabanlı karar destek aracıdır, yatırım tavsiyesi değildir.</footer>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"><Nav variant="bottom" /></div>
      </body>
    </html>
  );
}
