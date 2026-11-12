"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Portföy", match: (p: string) => p === "/" || p.startsWith("/islemler") },
  { href: "/izleme", label: "İzleme Listesi", match: (p: string) => p.startsWith("/izleme") || p.startsWith("/hisse") || p.startsWith("/fon") },
  { href: "/analiz", label: "Analiz", match: (p: string) => p.startsWith("/analiz") },
  { href: "/ozet", label: "Günlük Özet", match: (p: string) => p.startsWith("/ozet") },
];

export default function Nav({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  if (variant === "top") {
    return (
      <nav className="flex gap-1" aria-label="Ana menü">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={i.match(path) ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${i.match(path) ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="grid grid-cols-4" aria-label="Ana menü">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.match(path) ? "page" : undefined}
          className={`flex min-h-[56px] items-center justify-center px-1 text-center text-xs font-medium ${i.match(path) ? "text-slate-900" : "text-slate-500"}`}>
          <span className={`rounded-lg px-2 py-1.5 ${i.match(path) ? "bg-slate-900 text-white" : ""}`}>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
