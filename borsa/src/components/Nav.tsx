"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const ITEMS = [
  { href: "/", label: "Portföy", icon: Icon.wallet, match: (p: string) => p === "/" || p.startsWith("/islemler") },
  { href: "/piyasa", label: "Piyasa", icon: Icon.globe, match: (p: string) => p.startsWith("/piyasa") },
  { href: "/sinyaller", label: "Sinyaller", icon: Icon.bolt, match: (p: string) => p.startsWith("/sinyaller") },
  { href: "/izleme", label: "İzleme", icon: Icon.eye, match: (p: string) => p.startsWith("/izleme") || p.startsWith("/hisse") || p.startsWith("/fon") },
  { href: "/karsilastir", label: "Karşılaştır", icon: Icon.scale, match: (p: string) => p.startsWith("/karsilastir") },
  { href: "/analiz", label: "Analiz", icon: Icon.brain, match: (p: string) => p.startsWith("/analiz") },
  { href: "/ozet", label: "Özet", icon: Icon.doc, match: (p: string) => p.startsWith("/ozet") },
];

export default function Nav({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  if (variant === "top") {
    return (
      <nav className="flex gap-0.5 overflow-x-auto" aria-label="Ana menü">
        {ITEMS.map((i) => {
          const on = i.match(path);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition ${on ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              {i.icon("h-4 w-4 opacity-80")}<span>{i.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="grid grid-cols-7" aria-label="Ana menü">
      {ITEMS.map((i) => {
        const on = i.match(path);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${on ? "text-blue-600" : "text-slate-500"}`}>
            <span className={`rounded-lg px-2 py-1 ${on ? "bg-blue-600/10" : ""}`}>{i.icon("h-5 w-5")}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
