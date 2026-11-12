import { httpJson } from "../http";
import type { Disclosure } from "./types";

const BASE = () => process.env.KAP_BASE_URL || "https://www.kap.org.tr";
export const KAP_SOURCE = "KAP";
export const kapLink = (id: number | string) => `https://www.kap.org.tr/tr/Bildirim/${id}`;

export interface KapCompany {
  symbols: string[];
  name: string;
  oid: string;
}

export async function kapCompanies(): Promise<KapCompany[]> {
  const arr = await httpJson<any[]>(`${BASE()}/tr/api/company/items/IGS/A`, { timeoutMs: 40000 });
  if (!Array.isArray(arr) || arr.length < 50) throw new Error("KAP: şirket listesi alınamadı");
  return arr
    .filter((c) => c.stockCode && c.mkkMemberOid)
    .map((c) => ({
      symbols: String(c.stockCode).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      name: String(c.kapMemberTitle ?? "").trim(),
      oid: c.mkkMemberOid,
    }));
}

function parseKapDate(s: string): string {
  // "12.11.2026 16:43:59" (İstanbul)
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return new Date().toISOString();
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+03:00`).toISOString();
}

export async function kapDisclosures(oid: string, from: string, to: string): Promise<Disclosure[]> {
  const arr = await httpJson<any[]>(`${BASE()}/tr/api/disclosure/members/byCriteria`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromDate: from, toDate: to, memberType: "IGS", mkkMemberOidList: [oid], disclosureClass: "", subjectList: [],
      isLate: "", mainSector: "", sector: "", subSector: "", marketOid: "", index: "", bdkReview: "", bdkMemberOidList: [],
      year: "", term: "", ruleType: "", period: "", fromSrc: false, srcCategory: "", disclosureIndexList: [],
    }),
    timeoutMs: 30000,
  });
  if (!Array.isArray(arr)) throw new Error("KAP: bildirim listesi alınamadı");
  return arr.map((d) => ({
    id: d.disclosureIndex,
    publishedAt: parseKapDate(String(d.publishDate)),
    class: d.disclosureClass ?? null,
    subject: d.subject ? String(d.subject).trim() : null,
    summary: d.summary ? String(d.summary).trim() : null,
  }));
}
