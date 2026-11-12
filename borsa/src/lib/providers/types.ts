export type QuoteKind = "delayed" | "close";

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null; // TL işlem hacmi
  marketCap: number | null;
  asOf: string; // ISO
  kind: QuoteKind;
  source: string;
}

export interface Bar {
  date: string; // YYYY-AA-GG
  open: number | null;
  high: number | null;
  low: number | null;
  close: number; // düzeltilmiş
  rawClose: number | null; // düzeltilmemiş (portföy değerlemesi)
  volume: number | null;
  source: string;
}

export interface Statement {
  year: number;
  period: number; // 3, 6, 9, 12 (kümülatif)
  items: Record<string, number>;
}

export interface Disclosure {
  id: number;
  publishedAt: string;
  class: string | null;
  subject: string | null;
  summary: string | null;
}
