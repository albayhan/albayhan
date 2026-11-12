import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { refreshCatalog } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const term = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ results: [] });
  const cat = await refreshCatalog();
  const up = term.toLocaleUpperCase("tr-TR");
  const rows = await q(
    `SELECT c.symbol, c.type, c.name, (i.symbol IS NOT NULL AND i.in_watchlist) AS added
     FROM catalog c LEFT JOIN instruments i ON i.symbol=c.symbol
     WHERE c.symbol ILIKE $1 OR upper(c.name) LIKE $2
     ORDER BY (c.symbol = $3) DESC, (c.symbol ILIKE $1) DESC, c.symbol LIMIT 12`,
    [`${term}%`, `%${up}%`, term.toUpperCase()],
  );
  const results = [...rows];
  const code = term.toUpperCase();
  if (/^[A-Z0-9]{3}$/.test(code) && !rows.some((r) => r.symbol === code)) {
    const [i] = await q("SELECT in_watchlist FROM instruments WHERE symbol=$1", [code]);
    results.push({ symbol: code, type: "fund", name: "TEFAS fon kodu olarak ekle", added: !!i?.in_watchlist });
  }
  const [{ n }] = await q("SELECT count(*)::int AS n FROM catalog");
  return NextResponse.json({ results, note: !cat.ok && !n ? `KAP şirket listesine ulaşılamadı: ${cat.error}` : undefined });
}
