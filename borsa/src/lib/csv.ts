import { parseTrNumber } from "./format";
import { validateTx, type Tx, type TxType } from "./portfolio";

export const CSV_HEADER = "tarih,islem,sembol,adet,fiyat,komisyon,tutar,not";

const TYPE_MAP: Record<string, TxType> = {
  AL: "BUY", ALIS: "BUY", ALIM: "BUY", BUY: "BUY",
  SAT: "SELL", SATIS: "SELL", SATIM: "SELL", SELL: "SELL",
  TEMETTU: "DIVIDEND", DIVIDEND: "DIVIDEND",
  BEDELSIZ: "SPLIT", BOLUNME: "SPLIT", SPLIT: "SPLIT",
  BEDELLI: "RIGHTS", RIGHTS: "RIGHTS",
  YATIR: "DEPOSIT", "PARA YATIRMA": "DEPOSIT", DEPOSIT: "DEPOSIT",
  CEK: "WITHDRAW", "PARA CEKME": "WITHDRAW", WITHDRAW: "WITHDRAW",
};

const norm = (s: string) =>
  s.trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O");

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(s: string): string | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export interface CsvResult {
  rows: Omit<Tx, "id">[];
  errors: string[];
}

/**
 * Başlık: tarih,islem,sembol,adet,fiyat,komisyon,tutar,not
 * Ayırıcı virgül veya noktalı virgül olabilir. Noktalı virgülde ondalık virgül (1.234,56) kabul edilir.
 */
export function parseCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const errors: string[] = [];
  const rows: Omit<Tx, "id">[] = [];
  if (!lines.length) return { rows, errors: ["Dosya boş"] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const head = splitLine(lines[0], sep).map((h) => norm(h).toLowerCase());
  const idx = (name: string) => head.indexOf(name);
  for (const need of ["tarih", "islem"]) if (idx(need) < 0) errors.push(`Başlıkta "${need}" sütunu yok`);
  if (errors.length) return { rows, errors };
  const number = (s: string | undefined): number | null => {
    if (s === undefined || s === "") return null;
    return sep === ";" ? parseTrNumber(s) : Number(s.replace(/\s/g, ""));
  };
  for (let i = 1; i < lines.length; i++) {
    const c = splitLine(lines[i], sep);
    const get = (name: string) => (idx(name) >= 0 ? c[idx(name)] : undefined);
    const date = parseDate(get("tarih") ?? "");
    const type = TYPE_MAP[norm(get("islem") ?? "")];
    const ln = `Satır ${i + 1}`;
    if (!date) { errors.push(`${ln}: tarih okunamadı (${get("tarih")})`); continue; }
    if (!type) { errors.push(`${ln}: işlem türü tanınmadı (${get("islem")})`); continue; }
    const nums = { quantity: number(get("adet")), price: number(get("fiyat")), fee: number(get("komisyon")) ?? 0, amount: number(get("tutar")) };
    if (Object.values(nums).some((v) => v !== null && isNaN(v))) { errors.push(`${ln}: sayı okunamadı`); continue; }
    const row: Omit<Tx, "id"> = {
      date, type, symbol: get("sembol") ? get("sembol")!.toUpperCase() : null,
      quantity: nums.quantity, price: nums.price, fee: nums.fee, amount: nums.amount, note: get("not") || null,
    };
    const err = validateTx(row);
    if (err) errors.push(`${ln}: ${err}`);
    else rows.push(row);
  }
  return { rows, errors };
}
