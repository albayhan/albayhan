import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("CSV içe aktarma", () => {
  it("virgül ayırıcı ve ISO tarih", () => {
    const r = parseCsv("tarih,islem,sembol,adet,fiyat,komisyon,tutar,not\n2026-10-01,YATIR,,,,,100000,\n2026-10-02,AL,thyao,100,285.50,28.55,,ilk alış\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ type: "BUY", symbol: "THYAO", quantity: 100, price: 285.5, fee: 28.55, note: "ilk alış" });
  });
  it("noktalı virgül, Türkçe sayı ve tarih biçimi", () => {
    const r = parseCsv("Tarih;İşlem;Sembol;Adet;Fiyat;Komisyon;Tutar\n02.10.2026;SATIŞ;TUPRS;1.000;1.234,56;12,5;\n05.10.2026;TEMETTÜ;TUPRS;;;;2.500,75\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ date: "2026-10-02", type: "SELL", quantity: 1000, price: 1234.56, fee: 12.5 });
    expect(r.rows[1]).toMatchObject({ type: "DIVIDEND", amount: 2500.75 });
  });
  it("hatalı satırları satır numarasıyla bildirir", () => {
    const r = parseCsv("tarih,islem,sembol,adet,fiyat\n2026-13-45,AL,X,1,1\n2026-10-02,TAKAS,X,1,1\n2026-10-02,AL,X,,5\n");
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[1]).toMatch(/Satır 3/);
  });
  it("başlık eksikse reddeder", () => {
    expect(parseCsv("a,b\n1,2").errors[0]).toMatch(/tarih/);
  });
});

import { parseTrNumber } from "@/lib/format";
describe("Türkçe sayı çözümleme", () => {
  it("binlik ve ondalık ayırıcıları ayırt eder", () => {
    expect(parseTrNumber("1.234,56")).toBe(1234.56);
    expect(parseTrNumber("1.000")).toBe(1000);
    expect(parseTrNumber("12.500.000")).toBe(12_500_000);
    expect(parseTrNumber("285.50")).toBe(285.5);
    expect(parseTrNumber("312,5")).toBe(312.5);
    expect(parseTrNumber("₺ 10.000")).toBe(10000);
    expect(parseTrNumber("abc")).toBeNaN();
  });
});
