"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool, q } from "@/lib/db";
import { refreshCatalog, refreshFund, refreshFx, refreshQuote, refreshSymbol, getInstrument } from "@/lib/data";
import { parseTrNumber } from "@/lib/format";
import { computeLedger, validateTx, type Tx, type TxType } from "@/lib/portfolio";
import { parseCsv } from "@/lib/csv";
import { loadTxs } from "@/lib/portfolio-data";
import { saveSettings } from "@/lib/settings";
import { generateDailyReport } from "@/lib/report";
import { istDate } from "@/lib/time";

export interface FormState {
  error?: string;
  ok?: string;
  errors?: string[];
}

/** Sembolü enstrüman olarak kaydeder: hisse KAP listesinde aranır, 3 karakterli kodlar TEFAS fonu sayılır. */
async function ensureInstrument(symbol: string, watch: boolean, typeHint?: string): Promise<string | null> {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(s)) return `Sembol geçersiz: ${symbol}`;
  const existing = await getInstrument(s);
  if (existing) {
    if (watch && !existing.in_watchlist) await q("UPDATE instruments SET in_watchlist=TRUE WHERE symbol=$1", [s]);
    return null;
  }
  if (typeHint !== "fund") {
    let [c] = await q("SELECT * FROM catalog WHERE symbol=$1", [s]);
    if (!c) {
      await refreshCatalog();
      [c] = await q("SELECT * FROM catalog WHERE symbol=$1", [s]);
    }
    if (c) {
      await q("INSERT INTO instruments (symbol, type, name, kap_member_oid, in_watchlist) VALUES ($1,'stock',$2,$3,$4) ON CONFLICT DO NOTHING", [s, c.name, c.kap_member_oid, watch]);
      return null;
    }
    const [{ n }] = await q("SELECT count(*)::int AS n FROM catalog");
    if (typeHint === "stock") return n ? `${s} KAP şirket listesinde bulunamadı` : "KAP şirket listesine ulaşılamadı; hisse doğrulanamıyor";
  }
  if (/^[A-Z0-9]{3}$/.test(s)) {
    await q("INSERT INTO instruments (symbol, type, name, in_watchlist) VALUES ($1,'fund',$1,$2) ON CONFLICT DO NOTHING", [s, watch]);
    void refreshFund(s);
    return null;
  }
  return `${s} bulunamadı (BIST hissesi veya 3 karakterli TEFAS fon kodu girin)`;
}

function txFromForm(fd: FormData): Omit<Tx, "id"> {
  const num = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : parseTrNumber(v);
  };
  const type = String(fd.get("type") ?? "") as TxType;
  const cashOnly = type === "DEPOSIT" || type === "WITHDRAW";
  return {
    date: String(fd.get("date") ?? ""), type,
    symbol: cashOnly ? null : String(fd.get("symbol") ?? "").trim().toUpperCase() || null,
    quantity: num("quantity"), price: num("price"), fee: num("fee") ?? 0, amount: num("amount"),
    note: String(fd.get("note") ?? "").trim() || null,
  };
}

function checkAgainstLedger(existing: Tx[], added: Omit<Tx, "id">[]): string | null {
  const all = [...existing, ...added.map((t, i) => ({ ...t, id: 1e9 + i }))];
  const l = computeLedger(all);
  return l.warnings.length ? l.warnings[0] : null;
}

export async function addTxAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const t = txFromForm(fd);
  const nums = [t.quantity, t.price, t.fee, t.amount];
  if (nums.some((v) => v !== null && isNaN(v))) return { error: "Sayı biçimi okunamadı (ör. 1.250,50)" };
  const err = validateTx(t);
  if (err) return { error: err };
  if (t.date > istDate()) return { error: "İleri tarihli işlem girilemez" };
  if (t.symbol) {
    const e = await ensureInstrument(t.symbol, true);
    if (e) return { error: e };
  }
  const w = checkAgainstLedger(await loadTxs(), [t]);
  if (w) return { error: w };
  await q("INSERT INTO transactions (date, type, symbol, quantity, price, fee, amount, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [t.date, t.type, t.symbol, t.quantity, t.price, t.fee, t.amount, t.note]);
  revalidatePath("/", "layout");
  return { ok: "İşlem kaydedildi." };
}

export async function importCsvAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("text") ?? "");
  if (!text.trim()) return { error: "CSV dosyası seçin ya da içeriği yapıştırın." };
  const { rows, errors } = parseCsv(text);
  if (errors.length) return { error: "Dosya içe aktarılmadı; önce şu satırları düzeltin:", errors: errors.slice(0, 20) };
  if (!rows.length) return { error: "Dosyada işlem satırı yok." };
  if (rows.some((r) => r.date > istDate())) return { error: "Dosyada ileri tarihli işlem var." };
  for (const s of new Set(rows.map((r) => r.symbol).filter((x): x is string => !!x))) {
    const e = await ensureInstrument(s, true);
    if (e) return { error: e };
  }
  const w = checkAgainstLedger(await loadTxs(), rows);
  if (w) return { error: w };
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    for (const t of rows) {
      await c.query("INSERT INTO transactions (date, type, symbol, quantity, price, fee, amount, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [t.date, t.type, t.symbol, t.quantity, t.price, t.fee, t.amount, t.note]);
    }
    await c.query("COMMIT");
  } catch (e: any) {
    await c.query("ROLLBACK");
    return { error: `Kayıt hatası: ${e.message}` };
  } finally {
    c.release();
  }
  revalidatePath("/", "layout");
  return { ok: `${rows.length} işlem içe aktarıldı.` };
}

export async function deleteTxAction(fd: FormData) {
  const id = Number(fd.get("id"));
  const rest = (await loadTxs()).filter((t) => t.id !== id);
  const l = computeLedger(rest);
  if (l.warnings.length) redirect(`/islemler?hata=${encodeURIComponent("Bu işlem silinirse sonraki satışlar karşılıksız kalıyor: " + l.warnings[0])}`);
  await q("DELETE FROM transactions WHERE id=$1", [id]);
  revalidatePath("/", "layout");
}

export async function addInstrumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const symbol = String(fd.get("symbol") ?? "").trim().toUpperCase();
  const e = await ensureInstrument(symbol, true, String(fd.get("type") ?? "") || undefined);
  if (e) return { error: e };
  const inst = await getInstrument(symbol);
  if (inst) void refreshSymbol(inst, { deep: true });
  revalidatePath("/", "layout");
  return { ok: `${symbol} izleme listesine eklendi.` };
}

export async function removeFromWatchlistAction(fd: FormData) {
  await q("UPDATE instruments SET in_watchlist=FALSE WHERE symbol=$1", [String(fd.get("symbol"))]);
  revalidatePath("/", "layout");
}

export async function saveSettingsAction(fd: FormData) {
  await saveSettings({
    risk: String(fd.get("risk")) as any,
    shortMinWeeks: Number(fd.get("shortMinWeeks")), shortMaxWeeks: Number(fd.get("shortMaxWeeks")),
    longMinMonths: Number(fd.get("longMinMonths")), longMaxMonths: Number(fd.get("longMaxMonths")),
  });
  revalidatePath("/", "layout");
}

export async function runReportAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const o = await generateDailyReport("elle");
  revalidatePath("/", "layout");
  return o.created ? { ok: o.message } : { error: o.message };
}

export async function retryProviderAction(fd: FormData) {
  const p = String(fd.get("provider"));
  await q("UPDATE provider_status SET next_retry_at=NULL WHERE provider=$1", [p]);
  if (p === "isyatirim" || p === "eodhd") await refreshQuote({ symbol: p === "eodhd" ? "THYAO" : "XU100", type: p === "eodhd" ? "stock" : "index" }, true);
  else if (p === "kap") await refreshCatalog(true);
  else if (p === "tcmb") await refreshFx(true);
  else if (p === "tefas") {
    const [f] = await q("SELECT symbol FROM instruments WHERE type='fund' ORDER BY added_at LIMIT 1");
    await refreshFund(f?.symbol ?? "TTE", true);
  }
  revalidatePath("/", "layout");
}

export async function addMetricAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  if (!v("metric") || !v("value") || !v("period")) return { error: "Gösterge, dönem ve değer gerekli." };
  if (!/^https?:\/\/\S+$/.test(v("source_url"))) return { error: "Kaynak bağlantısı (https://…) gerekli; kaynaksız değer kaydedilmez." };
  await q("INSERT INTO company_metrics (symbol, metric, period, value, source_url) VALUES ($1,$2,$3,$4,$5)", [v("symbol"), v("metric"), v("period"), v("value"), v("source_url")]);
  revalidatePath("/", "layout");
  return { ok: "Kaydedildi." };
}

// ---------- Tarama ve alarmlar ----------

export async function runScanAction() {
  const { runScan } = await import("@/lib/scan");
  void runScan();
  await new Promise((r) => setTimeout(r, 300));
  revalidatePath("/sinyaller");
  redirect("/sinyaller");
}

export async function addAlertAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { addAlert } = await import("@/lib/alerts");
  const symbol = String(fd.get("symbol") ?? "").trim().toUpperCase();
  const op = String(fd.get("op")) === "below" ? "below" : "above";
  const raw = String(fd.get("price") ?? "").trim();
  const price = raw ? parseTrNumber(raw) : NaN;
  if (!symbol || !(price > 0)) return { error: "Geçerli bir fiyat girin." };
  await addAlert({ symbol, op, price, note: String(fd.get("note") ?? "").trim().slice(0, 120) });
  revalidatePath("/", "layout");
  return { ok: `Alarm kuruldu: ${symbol} ${op === "above" ? "≥" : "≤"} ${price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺` };
}

export async function removeAlertAction(fd: FormData) {
  const { removeAlert } = await import("@/lib/alerts");
  await removeAlert(String(fd.get("id")));
  revalidatePath("/", "layout");
}

export async function markAlertsSeenAction() {
  const { markAlertsSeen } = await import("@/lib/alerts");
  await markAlertsSeen();
  revalidatePath("/", "layout");
}
