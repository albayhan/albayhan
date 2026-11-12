import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import { providerStatuses } from "@/lib/data";

export const metadata: Metadata = { title: "BIST Portföy", description: "Türkiye borsası için portföy, analiz ve günlük özet" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let down = 0;
  try {
    down = (await providerStatuses()).filter((s) => !s.ok).length;
  } catch {
    down = -1;
  }
  return (
    <html lang="tr">
      <body>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
            <Link href="/" className="text-base font-bold tracking-tight">BIST Portföy</Link>
            <div className="hidden flex-1 md:block"><Nav variant="top" /></div>
            <Link href="/durum" className="ml-auto flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100" title="Veri kaynakları ve bağlantı durumu">
              <span className={`h-2 w-2 rounded-full ${down === 0 ? "bg-up" : down < 0 ? "bg-down" : "bg-amber-500"}`} />
              {down === 0 ? "Veri bağlantıları çalışıyor" : down < 0 ? "Veritabanına ulaşılamıyor" : `${down} veri kaynağında sorun`}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:pb-12">{children}</main>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white md:hidden"><Nav variant="bottom" /></div>
      </body>
    </html>
  );
}
