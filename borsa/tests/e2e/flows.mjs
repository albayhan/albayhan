// Uçtan uca doğrulama: gerçek veriyle çalışan uygulamada kullanıcı akışları.
// Çalıştırma: BASE_URL=http://localhost:3000 node tests/e2e/flows.mjs  (boş portföyle)
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "tests/e2e-out";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};
const trNum = (s) => Number(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: "tr-TR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function addTx(f) {
  await page.goto(`${BASE}/islemler`);
  await page.fill("#tx-date", f.date);
  await page.selectOption("#tx-type", f.type);
  for (const [k, id] of [["symbol", "#tx-symbol"], ["quantity", "#tx-qty"], ["price", "#tx-price"], ["fee", "#tx-fee"], ["amount", "#tx-amount"]]) {
    if (f[k] !== undefined) await page.fill(id, String(f[k]));
  }
  await page.click("text=İşlemi kaydet");
  // Next.js'in kendi rota duyurucusu da role="alert" taşır: forma göre daralt
  const res = page.locator('form:has(#tx-date) [role="status"], form:has(#tx-date) [role="alert"]');
  await res.first().waitFor();
  return res.first().innerText();
}

// 1) Canlı fiyat
await page.goto(`${BASE}/izleme`);
for (const s of ["THYAO", "TUPRS", "AEFES"]) {
  const row = page.getByTestId(`watch-${s}`);
  const txt = await row.innerText();
  check(`İzleme listesinde ${s} gerçek fiyatla görünüyor`, /İş Yatırım|EODHD/.test(txt) && /\d+,\d{2}/.test(txt), txt.replace(/\s+/g, " ").slice(0, 110));
  check(`${s} fiyat etiketi (gecikmeli/kapanış)`, /15 dk gecikmeli|Kapanış/.test(txt));
}
await page.screenshot({ path: path.join(OUT, "01-izleme.png"), fullPage: true });

// 2) İşlem ekleme (elle) — fiyatlar ilgili günlerin gerçek kapanışlarıdır
check("Para yatırma kaydı", /kaydedildi/.test(await addTx({ date: "2026-09-01", type: "DEPOSIT", amount: "150.000" })));
check("Alış kaydı (THYAO)", /kaydedildi/.test(await addTx({ date: "2026-09-01", type: "BUY", symbol: "THYAO", quantity: "200", price: "301,50", fee: "60,30" })));
check("Alış kaydı (TUPRS)", /kaydedildi/.test(await addTx({ date: "2026-09-15", type: "BUY", symbol: "TUPRS", quantity: "100", price: "412,50", fee: "41,25" })));
check("İkinci alış (THYAO)", /kaydedildi/.test(await addTx({ date: "2026-10-01", type: "BUY", symbol: "THYAO", quantity: "100", price: "286,50", fee: "28,65" })));
check("Satış kaydı (THYAO)", /kaydedildi/.test(await addTx({ date: "2026-10-15", type: "SELL", symbol: "THYAO", quantity: "50", price: "276,75", fee: "13,84" })));
const over = await addTx({ date: "2026-10-16", type: "SELL", symbol: "TUPRS", quantity: "500", price: "380", fee: "0" });
check("Eldekinden fazla satış reddediliyor", /fazla/.test(over), over);
const bad = await addTx({ date: "2026-10-16", type: "BUY", symbol: "ZZZZZ", quantity: "1", price: "1" });
check("Bilinmeyen sembol reddediliyor", /bulunamadı/.test(bad), bad);

// 3) CSV içe aktarma
await page.goto(`${BASE}/islemler`);
await page.fill("#csv-text", "tarih,islem,sembol,adet,fiyat,komisyon,tutar,not\n2026-10-15,AL,AEFES,1000,18.07,18.07,,\n2026-10-20,YATIR,,,,,20000,\n2026-10-22,TEMETTU,TUPRS,,,,1500,\n");
await page.click("text=CSV'yi içe aktar");
await page.waitForSelector('form:has(#csv-text) [role="status"], form:has(#csv-text) [role="alert"]');
check("CSV içe aktarma", /3 işlem içe aktarıldı/.test(await page.locator("form:has(#csv-text) [role=status]").innerText().catch(() => "")));
await page.fill("#csv-text", "tarih,islem,sembol,adet,fiyat\n2026-10-15,AL,AEFES,abc,18\n");
await page.click("text=CSV'yi içe aktar");
await page.waitForSelector("form:has(#csv-text) [role=alert]");
check("Hatalı CSV satırı satır numarasıyla reddediliyor", /Satır 2/.test(await page.locator("form:has(#csv-text) [role=alert]").innerText()));
await page.goto(`${BASE}/islemler`);
check("İşlem listesinde 8 kayıt", (await page.locator("tbody tr").count()) === 8, `${await page.locator("tbody tr").count()} satır`);
await page.screenshot({ path: path.join(OUT, "02-islemler.png"), fullPage: true });

// 4) Maliyet hesabı — bağımsız hesapla karşılaştır
await page.goto(`${BASE}/`);
const row = page.locator("table tbody tr", { hasText: "THYAO" });
const cells = await row.locator("td").allInnerTexts();
const expAvg = (200 * 301.5 + 60.3 + 100 * 286.5 + 28.65) / 300; // 296,7965
check("THYAO adet 250", trNum(cells[1]) === 250, cells[1]);
check("THYAO ortalama maliyet 296,80", Math.abs(trNum(cells[2]) - expAvg) < 0.006, `${cells[2]} (beklenen ${expAvg.toFixed(4)})`);
const price = trNum(cells[3].split("\n")[0]);
const expUnreal = 250 * price - 250 * expAvg;
check("THYAO gerçekleşmemiş K/Z = adet × (fiyat − maliyet)", Math.abs(Math.abs(trNum(cells[6].split("\n")[0])) - Math.abs(expUnreal)) < 0.02, `${cells[6].split("\n")[0]} (fiyat ${price}, beklenen ${expUnreal.toFixed(2)})`);
const expReal = 50 * 276.75 - 13.84 - 50 * expAvg; // −1.016,17
check("THYAO gerçekleşen K/Z −1.016,17", Math.abs(Math.abs(trNum(cells[7])) - Math.abs(expReal)) < 0.02 && cells[7].includes("−"), cells[7]);
const body = await page.locator("main").innerText();
const expCash = 150000 - (200 * 301.5 + 60.3) - (100 * 412.5 + 41.25) - (100 * 286.5 + 28.65) + (50 * 276.75 - 13.84) - (1000 * 18.07 + 18.07) + 20000 + 1500;
const cashTxt = body.match(/Nakit\s+(₺[\d.,]+)/)?.[1] ?? "";
check("Nakit bakiyesi tüm hareketleri yansıtıyor", Math.abs(trNum(cashTxt) - expCash) < 0.02, `${cashTxt} (beklenen ${expCash.toFixed(2)})`);
check("Ana ekranda toplam değer, günlük değişim, toplam K/Z, nakit", ["Toplam değer", "Günlük değişim", "Toplam kâr/zarar", "Nakit", "Varlık dağılımı", "Günün önemli önerileri", "Pozisyonlar"].every((t) => body.includes(t)));
check("Performans BIST 100 ile karşılaştırılıyor", body.includes("BIST 100") && body.includes("zaman ağırlıklı"));
await page.waitForSelector('[data-testid="line-chart"] canvas');
check("Performans grafiği çizildi", (await page.locator('[data-testid="line-chart"] canvas').count()) > 0);
await page.screenshot({ path: path.join(OUT, "03-portfoy.png"), fullPage: true });

// 5) Hisse detayı ve grafik
await page.goto(`${BASE}/hisse/THYAO`);
await page.waitForSelector('[data-testid="price-chart"] canvas');
const hb = await page.locator("main").innerText();
check("Hisse detayında fiyat, kaynak ve zaman damgası", /Kaynak: (İş Yatırım|EODHD) · Veri: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} · Güncelleme:/.test(hb));
check("Mum grafiği, ortalamalar, destek/direnç", ["20 gün", "50 gün", "200 gün", "Destek", "Direnç"].every((t) => hb.includes(t)));
check("Kısa vade: giriş bandı, zarar-kes, hedef, risk/ödül", ["Giriş bandı", "Zarar-kes", "Hedef", "Risk/ödül", "Giriş koşulu"].every((t) => hb.includes(t)));
check("Uzun vade: senaryolar ve tez değiştiriciler", ["Olumlu", "Baz", "Olumsuz", "Yatırım tezini değiştirecek gelişmeler", "Bilanço özeti", "Sektör emsalleri"].every((t) => hb.includes(t)));
check("THYAO'ya özgü göstergeler", ["Yolcu trafiği", "USD/TRY", "Brent petrol"].every((t) => hb.includes(t)));
check("KAP bildirimleri listeleniyor", (await page.locator('a[href*="kap.org.tr/tr/Bildirim/"]').count()) > 3);
await page.click("button:has-text('1Y')");
const box = await page.locator('[data-testid="price-chart"]').boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
const legend = await page.getByTestId("chart-legend").innerText();
check("Grafik etkileşimli (imleçle gün değerleri)", /Y [\d.,]+/.test(legend) && /K [\d.,]+/.test(legend), legend.replace(/\s+/g, " "));
await page.screenshot({ path: path.join(OUT, "04-hisse-thyao.png"), fullPage: true });
for (const [s, keys] of [["TUPRS", ["Net nakit", "Ürün marjı", "kapasite kullanımı"]], ["AEFES", ["Satış hacmi", "Hammadde maliyeti", "Rusya / BDT"]]]) {
  await page.goto(`${BASE}/hisse/${s}`);
  const t = await page.locator("main").innerText();
  check(`${s}'e özgü göstergeler`, keys.every((k) => t.includes(k)));
}

// 6) Arama ve ekleme (hisse + fon)
await page.goto(`${BASE}/izleme`);
await page.fill("#search", "garan");
await page.waitForSelector('button[aria-label="GARAN ekle"]');
await page.click('button[aria-label="GARAN ekle"]');
await page.waitForSelector("text=GARAN izleme listesine eklendi");
await page.goto(`${BASE}/izleme`);
const g = await page.getByTestId("watch-GARAN").innerText();
check("Aranan BIST hissesi (GARAN) eklendi ve fiyatı geldi", /\d+,\d{2}/.test(g), g.replace(/\s+/g, " ").slice(0, 100));
await page.fill("#search", "TTE");
await page.waitForSelector('button[aria-label="TTE ekle"]');
await page.click('button[aria-label="TTE ekle"]');
await page.waitForSelector("text=TTE izleme listesine eklendi");
await page.goto(`${BASE}/fon/TTE`);
const fb = await page.locator("main").innerText();
check("Fon detayı: TEFAS verisi varsa gösterilir, yoksa 'Veri yetersiz' ve neden", /Risk değeri \(1–7\)\n\d/.test(fb) || (/TEFAS bağlantısı kurulamadı/.test(fb) && /[Vv]eri yetersiz/.test(fb)), /TEFAS bağlantısı kurulamadı/.test(fb) ? "TEFAS'a ulaşılamadı → Veri yetersiz" : "TEFAS verisi geldi");
await page.screenshot({ path: path.join(OUT, "05-fon.png"), fullPage: true });

// 7) Analiz ve ayarlar
await page.goto(`${BASE}/analiz`);
const ab = await page.locator("main").innerText();
check("Analiz: kısa vade kartları durum etiketiyle", /Alım adayı|Bekle|Tut|Azalt|Satış adayı/.test(ab) && ab.includes("Kararı ne değiştirir"));
await page.screenshot({ path: path.join(OUT, "06-analiz-kisa.png"), fullPage: true });
await page.click("summary:has-text('Vade ve risk ayarları')");
await page.fill("#smax", "4");
await page.selectOption("#risk", "temkinli");
await page.click("text=Ayarları kaydet");
await page.waitForFunction(() => document.body.innerText.includes("Kısa vade (1–4 hafta)"));
check("Vade ve risk profili ayarlanabiliyor", (await page.locator("main").innerText()).includes("Temkinli"));
await page.goto(`${BASE}/analiz`);
await page.click("summary:has-text('Vade ve risk ayarları')");
await page.fill("#smax", "8");
await page.selectOption("#risk", "dengeli");
await page.click("text=Ayarları kaydet");
await page.waitForFunction(() => document.body.innerText.includes("Kısa vade (1–8 hafta)"));
await page.goto(`${BASE}/analiz?vade=uzun`);
const lb = await page.locator("main").innerText();
check("Analiz: uzun vade senaryoları", ["Senaryo", "Model fiyatı", "Tezi değiştirir"].every((t) => lb.includes(t)));
await page.screenshot({ path: path.join(OUT, "07-analiz-uzun.png"), fullPage: true });

// 8) Bağlantı durumu
await page.goto(`${BASE}/durum`);
const db = await page.locator("main").innerText();
check("Durum ekranı: son başarılı güncelleme ve yeniden deneme bilgisi", db.includes("Son başarılı güncelleme") && db.includes("Son deneme"));
for (const p of ["isyatirim", "kap", "tcmb"]) check(`Sağlayıcı çalışıyor: ${p}`, (await page.getByTestId(`provider-${p}`).innerText()).includes("Çalışıyor"));
const tf = await page.getByTestId("provider-tefas").innerText();
check("TEFAS durumu açıkça gösteriliyor", /Çalışıyor|Bağlantı yok/.test(tf), tf.includes("Bağlantı yok") ? "Bağlantı yok (hata ve sonraki deneme zamanı gösteriliyor)" : "Çalışıyor");
await page.screenshot({ path: path.join(OUT, "08-durum.png"), fullPage: true });

// 9) Günlük özet sayfası
await page.goto(`${BASE}/ozet`);
await page.screenshot({ path: path.join(OUT, "09-ozet.png"), fullPage: true });

// 10) Telefon görünümü
const m = await browser.newContext({ ...devices["iPhone 13"], locale: "tr-TR" });
const mp = await m.newPage();
for (const [name, url] of [["m1-portfoy", "/"], ["m2-hisse", "/hisse/THYAO"], ["m3-analiz", "/analiz"], ["m4-ozet", "/ozet"], ["m5-izleme", "/izleme"]]) {
  await mp.goto(`${BASE}${url}`);
  if (url.startsWith("/hisse")) await mp.waitForSelector('[data-testid="price-chart"] canvas');
  await mp.waitForTimeout(400);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`Telefon: ${url} yatay taşma yok`, overflow <= 1, `taşma ${overflow}px`);
  await mp.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}
const navTxt = await mp.locator('nav[aria-label="Ana menü"]:visible').innerText();
check("Ana menü: Portföy, İzleme Listesi, Analiz, Günlük Özet", ["Portföy", "İzleme Listesi", "Analiz", "Günlük Özet"].every((t) => navTxt.includes(t)));

check("Tarayıcıda JavaScript hatası yok", errors.length === 0, errors.join(" | "));
await browser.close();
writeFileSync(path.join(OUT, "sonuc.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti`);
process.exit(failed.length ? 1 : 0);
