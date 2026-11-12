import { NextResponse } from "next/server";
import { generateDailyReport } from "@/lib/report";

export const dynamic = "force-dynamic";

/** Günlük özeti elle/harici zamanlayıcıdan tetikler. Aynı gün için ikinci rapor üretilmez. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  return NextResponse.json(await generateDailyReport("elle"));
}
