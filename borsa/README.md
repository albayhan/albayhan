# BIST Portföy

Türkiye borsası için gerçek piyasa verisiyle çalışan portföy, analiz ve günlük özet uygulaması.
Next.js (App Router) · TypeScript · Tailwind · PostgreSQL · Docker Compose.

- **Portföy** — toplam değer, günlük değişim, toplam kâr/zarar, nakit, varlık dağılımı, pozisyon tablosu, BIST 100 karşılaştırmalı performans, günün önemli önerileri
- **İzleme Listesi** — THYAO, TUPRS, AEFES ile başlar; diğer BIST hisseleri (KAP şirket listesinden) ve TEFAS fon kodları aranıp eklenir
- **Analiz** — kısa vade (varsayılan 1–8 hafta) ve uzun vade (varsayılan 6–24 ay) önerileri; vade ve risk profili ayarlanabilir
- **Günlük Özet** — her BIST işlem günü kapanışından sonra portföye özel rapor; geçmiş raporlar ve öneri değişiklikleri

> Uygulama kural tabanlı bir karar destek aracıdır; yatırım tavsiyesi vermez.

## Kurulum

```bash
cd borsa
docker compose up -d --build
```

Uygulama http://localhost:3000 adresinde açılır. Veritabanı şeması ve ilk izleme listesi ilk açılışta kendiliğinden kurulur.
Anahtar gerekmez. Ayar değiştirmek için `.env.example` dosyasını `.env` olarak kopyalayın.

Docker'sız geliştirme: `npm install`, çalışan bir PostgreSQL için `DATABASE_URL=postgres://kullanici:parola@localhost:5432/borsa`, ardından `npm run dev`.

## Veri kaynakları

Her ekranda verinin kaynağı, veri tarihi ve son güncelleme saati yazılır. Uygulama örnek ya da üretilmiş veri göstermez; alınamayan kalem “Veri yetersiz” olarak görünür.

| Veri | Kaynak | Erişim | Etiket |
|---|---|---|---|
| BIST hisse ve endeks fiyatı, günlük seri | İş Yatırım web veri servisi | Anahtarsız | Seans içinde “15 dk gecikmeli”, seans sonrası “Kapanış” |
| Finansal tablolar (bilanço, gelir, nakit akışı) | İş Yatırım (KAP'a bildirilen tablolar) | Anahtarsız | Dönem (ör. 2026/9) |
| Şirket listesi, özel durum ve finansal rapor bildirimleri | KAP (kap.org.tr) | Anahtarsız | Yayın tarihi ve saati |
| USD, EUR, GBP, RUB kurları | TCMB gösterge kurları (resmî XML) | Anahtarsız | Bülten tarihi |
| Fon fiyatı, dağılım, risk değeri, valör, yönetim ücreti | TEFAS | Anahtarsız web uç noktaları | Fiyat tarihi |
| BIST günlük açılış/yüksek/düşük/kapanış (isteğe bağlı) | EODHD | `EODHD_API_KEY` | Sağlayıcı zaman damgası |
| Brent petrol (isteğe bağlı) | TCMB EVDS | `EVDS_API_KEY` | Seri tarihi |

### Kullanım koşulları hakkında açık not

- **İş Yatırım, KAP ve TEFAS uç noktaları resmî, belgelenmiş API değildir.** Bunlar ilgili sitelerin herkese açık web servisleridir. Uygulama kendini açık bir `User-Agent` ile tanıtır, yanıtları veritabanında önbelleğe alır ve düşük sıklıkta istek atar (fiyat seans içinde en çok dakikada bir, tablolar günde bir). Bu kullanım **kişisel, ticari olmayan** amaç içindir. Borsa İstanbul verisinin yeniden dağıtımı lisansa tabidir; uygulamayı başkalarına açacaksanız lisanslı bir sağlayıcıya geçin.
- **Lisanslı seçenek:** `PRICE_PROVIDER=eodhd` ve `EODHD_API_KEY` ile hisse fiyatı ve günlük seri EODHD'nin anahtarlı API'sinden alınır (`.IS` sembolleri; ücretsiz planda günde 20 istek ve 1 yıl geçmiş, ücretli planda tam geçmiş). Bu bağdaştırıcı da tam mum (açılış dahil) verir. Endeks serisi ve finansal tablolar İş Yatırım'dan gelmeye devam eder.
- **KAP** için kurumsal erişim MKK'nın KAP Veri Yayın Servisi sözleşmesiyle sağlanır; bu uygulama onu kullanmaz.
- **TEFAS'ın açık bir API'si yoktur.** Site otomatik istekleri reddederse fon verisi gelmez; uygulama bunu Durum ekranında ve fon sayfasında nedeniyle gösterir. Farklı bir adres için `TEFAS_BASE_URL` kullanılabilir.

### Bilinen veri sınırları

- İş Yatırım günlük serisinde **açılış fiyatı yoktur**. Bu günlerde mum yalnızca en yüksek–en düşük aralığını ve kapanışı gösterir; açılış uydurulmaz. Uygulama çalışırken geçen günlerin açılışı fiyat kaydından eklenir. Tam mum geçmişi için EODHD anahtarı gerekir.
- Hacim İş Yatırım'da TL işlem hacmidir (EODHD'de adet).
- Banka ve sigorta şirketlerinin tablo biçimi farklıdır; bu hisselerde uzun vade bölümü “Veri yetersiz” gösterebilir.
- Yolcu trafiği, satış hacmi gibi şirket verileri KAP bildirimi olarak bağlantısıyla listelenir; ekteki rakamlar otomatik okunmaz. Rafineri marjı ve kapasite kullanımı gibi yalnızca yatırımcı sunumlarında yer alan değerler, hisse sayfasından **kaynak bağlantısıyla** elle eklenebilir.
- Emsal karşılaştırması tanımlı gruplar için yapılır (`src/lib/analysis/company.ts` içindeki `PEERS`).

## Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `DATABASE_URL` | Compose'da hazır | PostgreSQL bağlantısı |
| `POSTGRES_PASSWORD` | Hayır | Veritabanı parolası (varsayılan `borsa`; dışarı açacaksanız değiştirin) |
| `APP_PORT` | Hayır | Yayın portu (varsayılan 3000) |
| `PRICE_PROVIDER` | Hayır | `isyatirim` (varsayılan) ya da `eodhd` |
| `EODHD_API_KEY` | `eodhd` için | eodhd.com hesabından alınan API anahtarı |
| `EVDS_API_KEY` | Hayır | TCMB EVDS hesabından alınan anahtar (Brent serisi) |
| `EVDS_BASE_URL`, `TEFAS_BASE_URL` | Hayır | Servis adresi değişirse |
| `CRON_SECRET` | Hayır | `/api/cron/daily` için `Authorization: Bearer …` koruması |
| `DISABLE_SCHEDULER` | Hayır | `1` ise sunucu içi zamanlayıcı kapanır |
| `SIMULATE_OUTAGE` | Hayır | Test: `isyatirim,kap,tcmb,tefas` için kesinti benzetimi |

## Bağlantı durumu ve kesinti davranışı

Üst çubuktaki gösterge **Veri kaynakları** ekranını açar: her sağlayıcı için durum, son başarılı güncelleme, son deneme, hata ve sonraki yeniden deneme zamanı görünür; “Şimdi yeniden dene” ile elle denenebilir.

Bir sağlayıcı kesildiğinde:

1. Son doğrulanmış değer, tarihi ve saatiyle “Güncel değil” etiketiyle gösterilir.
2. Güncelliğe bağlı öneri **Bekle** durumuna alınır; nedeni yazılır.
3. Bağlantı 1 dakikadan başlayıp 30 dakikaya kadar katlanan aralıklarla yeniden denenir; düzeldiğinde veri ve öneriler kendiliğinden güncellenir.

## Portföy hesapları

- **İşlem türleri:** alış, satış, temettü, bedelsiz/bölünme (çarpan; %100 bedelsiz için 2), bedelli (rüçhan fiyatından alış), para yatırma, para çekme.
- **Ortalama maliyet:** ağırlıklı ortalama; alış komisyonu maliyete eklenir. Satışta gerçekleşen kâr/zarar = satış tutarı − komisyon − (ortalama maliyet × adet).
- **Nakit:** tüm hareketlerden hesaplanır. Nakit kaydı bir alışı karşılamıyorsa fark “varsayılan para girişi” sayılır ve ekranda belirtilir.
- **Performans:** zaman ağırlıklı getiri. Para yatırma/çekme o günün başında yapılmış sayılır, böylece getiriyi etkilemez. BIST 100 aynı tarih aralığında, aynı başlangıçtan karşılaştırılır.
- **CSV:** başlık `tarih,islem,sembol,adet,fiyat,komisyon,tutar,not`. İşlem: `AL, SAT, TEMETTU, BEDELSIZ, BEDELLI, YATIR, CEK`. Ayırıcı `,` ya da `;` (noktalı virgülde `1.234,56` biçimi okunur). Hatalı satır varsa hiçbir satır kaydedilmez.

```csv
tarih,islem,sembol,adet,fiyat,komisyon,tutar,not
2026-09-01,YATIR,,,,,150000,
2026-09-01,AL,THYAO,200,301.50,60.30,,
2026-10-22,TEMETTU,TUPRS,,,,1500,
```

## Öneriler nasıl üretilir

**Kısa vade** (`src/lib/analysis/short.ts`): trend (20/50/200 günlük ortalamalar), momentum (RSI 14, MACD 12-26-9), hacim (son 5 gün / 20 gün) puanlanır; KAP bildirimleri ve yasal finansal rapor takvimi katalizör olarak listelenir. Giriş bandı 20 günlük ortalama çevresinde ATR ile, zarar-kes en yakın destek ya da ATR ile, hedef en yakın direnç ya da ATR projeksiyonu ile belirlenir. Fiyat giriş bandının üstündeyse risk/ödül **güncel fiyattan** hesaplanır; koşul sağlanmıyorsa **Bekle** gösterilir. Risk/ödül eşiği risk profiline bağlıdır (temkinli 2,5 · dengeli 2,0 · atak 1,5).

**Uzun vade** (`src/lib/analysis/long.ts`): büyüme, nakit akışı, borçluluk ve emsallere göre değerleme puanlanır. Olumlu/baz/olumsuz senaryolar FAVÖK × çarpan − net borç yöntemiyle, varsayımları yazılarak hesaplanır. Senaryo fiyatları model çıktısıdır, veri değildir.

**Şirkete özgü veriler** (`src/lib/analysis/company.ts`): THYAO için trafik bildirimleri, Brent, USD/EUR kuru, döviz pozisyonu; TUPRS için net nakit, brüt marj, Brent, kur; AEFES için satış hacmi bildirimleri, brüt marj, Rusya/BDT bildirimleri, ruble.

**Karar** (`src/lib/analysis/decision.ts`): Alım adayı, Tut, Azalt, Satış adayı, Bekle ya da Veri yetersiz. Maliyet, nakit, pozisyon ağırlığı (üst sınır: temkinli %15 · dengeli %25 · atak %35) ve vade hesaba katılır. Her kararın nedeni, karşı sinyali ve kararı değiştirecek koşulu yazılır.

## Günlük görev

Zamanlayıcı uygulama sunucusunun içinde çalışır (`src/lib/scheduler.ts`, `node-cron`, saat dilimi `Europe/Istanbul`); ayrı bir cron kurulumu gerekmez.

| Zaman | İş |
|---|---|
| Hafta içi 18:40 | Günlük özet (kapanış 18:10; gecikmeli verinin kapanışı yansıtması için pay bırakılır) |
| Hafta içi 18:55 ve 19:10–23:55 arası 15 dakikada bir, ayrıca açılışta | Telafi: rapor eksikse üretir |
| Seans içinde 5 dakikada bir | İzleme listesi fiyat yenileme |
| Hafta içi 16:15 | TCMB kur bülteni |

- **İşlem günü** endeks verisinden belirlenir; resmî tatilde yeni rapor üretilmez.
- **Çift rapor olmaz:** rapor tarihi birincil anahtardır; iş, veritabanı danışma kilidi alır ve kayıt `ON CONFLICT DO NOTHING` ile yazılır. Aynı gün ikinci çalıştırma “zaten var” diye atlanır.
- Seans sürerken rapor üretilmez.
- Elle tetikleme: Günlük Özet ekranındaki “Özeti şimdi üret” ya da `curl -X POST http://localhost:3000/api/cron/daily`.
- İş kayıtları Günlük Özet ve Veri kaynakları ekranlarında listelenir.

## Yedekleme

Tüm kullanıcı verisi (işlemler, izleme listesi, ayarlar, raporlar) PostgreSQL'dedir; Docker birimi `pgdata`.

```bash
# Yedek al
docker compose exec -T db pg_dump -U borsa -d borsa --format=custom > yedek-$(date +%F).dump

# Geri yükle
docker compose exec -T db pg_restore -U borsa -d borsa --clean --if-exists < yedek-2026-11-12.dump

# Yalnızca işlemleri CSV olarak dışa aktar
docker compose exec -T db psql -U borsa -d borsa -c "\copy (SELECT date AS tarih, type AS islem, symbol AS sembol, quantity AS adet, price AS fiyat, fee AS komisyon, amount AS tutar, note AS not FROM transactions ORDER BY date, id) TO STDOUT WITH CSV HEADER" > islemler.csv
```

Düzenli yedek için ilk komutu ana makinenin cron'una ekleyin. `docker compose down -v` birimi ve tüm veriyi siler.

## Testler

```bash
npm test                                             # birim testleri (hesaplar, CSV, göstergeler, karar kuralları)
BASE_URL=http://localhost:3000 node tests/e2e/flows.mjs   # gerçek veriyle uçtan uca akışlar (Playwright, boş portföyle)
```

Kesinti denemesi: uygulamayı `SIMULATE_OUTAGE=isyatirim` ile başlatın; fiyatlar “Güncel değil”, öneriler “Bekle” olur ve Veri kaynakları ekranı yeniden deneme zamanını gösterir.

## Güvenlik

Uygulamada kullanıcı girişi yoktur; tek kullanıcılı, yerel ağ kullanımı için tasarlanmıştır. İnternete açacaksanız önüne kimlik doğrulayan bir ters vekil koyun ve `POSTGRES_PASSWORD` ile `CRON_SECRET` değerlerini değiştirin.
