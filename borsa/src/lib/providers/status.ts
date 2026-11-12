import { q } from "../db";

export type ProviderId = "isyatirim" | "kap" | "tcmb" | "tefas" | "eodhd" | "evds";

export const PROVIDERS: Record<ProviderId, { title: string; data: string; access: string; env?: string; optional?: boolean }> = {
  isyatirim: {
    title: "İş Yatırım (web veri servisi)",
    data: "BIST hisse/endeks fiyatı (15 dk gecikmeli), günlük seri, KAP kaynaklı finansal tablolar",
    access: "Anahtarsız, herkese açık web uç noktaları. Resmî bir API değildir; kişisel kullanım içindir.",
  },
  kap: {
    title: "KAP — Kamuyu Aydınlatma Platformu",
    data: "Şirket listesi ve özel durum / finansal rapor bildirimleri",
    access: "Anahtarsız, kap.org.tr herkese açık uç noktaları. Kurumsal kullanım için MKK KAP Veri Yayın Servisi sözleşmesi gerekir.",
  },
  tcmb: {
    title: "TCMB — gösterge niteliğindeki kurlar",
    data: "USD, EUR, GBP, RUB / TRY döviz alış kurları",
    access: "Anahtarsız resmî XML yayını (tcmb.gov.tr/kurlar).",
  },
  tefas: {
    title: "TEFAS — Türkiye Elektronik Fon Alım Satım Platformu",
    data: "Fon fiyatı, portföy dağılımı, risk değeri, valör, yönetim ücreti",
    access: "Resmî açık API yoktur; tefas.gov.tr web uç noktaları kullanılır. Otomatik isteklere kapalıysa bağlantı kurulamaz.",
    env: "TEFAS_BASE_URL",
  },
  eodhd: {
    title: "EODHD (lisanslı, anahtarlı API)",
    data: "BIST günlük açılış/yüksek/düşük/kapanış/hacim ve gecikmeli fiyat (.IS)",
    access: "API anahtarı gerekir. Ücretsiz plan: günde 20 istek, 1 yıl geçmiş; All World planı tam geçmiş ve gecikmeli fiyat.",
    env: "EODHD_API_KEY",
    optional: true,
  },
  evds: {
    title: "TCMB EVDS (anahtarlı API)",
    data: "Brent petrol, politika faizi gibi makro seriler",
    access: "Ücretsiz EVDS hesabından alınan API anahtarı gerekir.",
    env: "EVDS_API_KEY",
    optional: true,
  },
};

export class ProviderDownError extends Error {
  constructor(public provider: ProviderId, msg: string) {
    super(msg);
  }
}

function simulated(provider: ProviderId): boolean {
  return (process.env.SIMULATE_OUTAGE ?? "").split(",").map((s) => s.trim()).includes(provider);
}

/** Yeniden deneme aralığı: 1 dk, 2 dk, 4 dk … en çok 30 dk */
export function backoffMs(failures: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, failures - 1), 30 * 60_000);
}

/**
 * Sağlayıcı çağrısını sarar: başarı/başarısızlık durumunu kaydeder ve
 * kesinti sırasında yeniden deneme zamanı gelene kadar çağrıyı atlar.
 */
export async function callProvider<T>(provider: ProviderId, fn: () => Promise<T>, opts: { force?: boolean } = {}): Promise<T> {
  const [st] = await q("SELECT * FROM provider_status WHERE provider=$1", [provider]);
  if (!opts.force && st && !st.ok && st.next_retry_at && new Date(st.next_retry_at) > new Date()) {
    throw new ProviderDownError(provider, st.last_error ?? "Sağlayıcıya ulaşılamıyor");
  }
  try {
    if (simulated(provider)) throw new Error("Kesinti benzetimi (SIMULATE_OUTAGE)");
    const out = await fn();
    await q(
      `INSERT INTO provider_status (provider, ok, last_success_at, last_attempt_at, last_error, consecutive_failures, next_retry_at)
       VALUES ($1, TRUE, now(), now(), NULL, 0, NULL)
       ON CONFLICT (provider) DO UPDATE SET ok=TRUE, last_success_at=now(), last_attempt_at=now(), last_error=NULL, consecutive_failures=0, next_retry_at=NULL`,
      [provider],
    );
    return out;
  } catch (e: any) {
    const failures = (st?.consecutive_failures ?? 0) + 1;
    const msg = String(e?.message ?? e).slice(0, 300);
    await q(
      `INSERT INTO provider_status (provider, ok, last_attempt_at, last_error, consecutive_failures, next_retry_at)
       VALUES ($1, FALSE, now(), $2, $3, now() + ($4 || ' milliseconds')::interval)
       ON CONFLICT (provider) DO UPDATE SET ok=FALSE, last_attempt_at=now(), last_error=$2, consecutive_failures=$3,
         next_retry_at=now() + ($4 || ' milliseconds')::interval`,
      [provider, msg, failures, String(backoffMs(failures))],
    );
    throw new ProviderDownError(provider, msg);
  }
}
