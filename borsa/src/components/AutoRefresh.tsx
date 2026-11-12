"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Sayfayı belirli aralıklarla sunucudan yeniden çizer (ör. tarama sürerken). */
export default function AutoRefresh({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
