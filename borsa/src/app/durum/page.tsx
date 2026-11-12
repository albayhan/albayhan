import { providerStatuses } from "@/lib/data";
import { PROVIDERS, type ProviderId } from "@/lib/providers/status";
import { eodhdEnabled } from "@/lib/providers/eodhd";
import { evdsEnabled } from "@/lib/providers/evds";
import { fmtDateTime } from "@/lib/format";
import { q } from "@/lib/db";
import { retryProviderAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Durum() {
  const st = new Map((await providerStatuses()).map((s) => [s.provider as ProviderId, s]));
  const runs = await q("SELECT * FROM job_runs ORDER BY id DESC LIMIT 8");
  const enabled: Record<string, boolean> = { eodhd: eodhdEnabled(), evds: evdsEnabled() };
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold tracking-tight">Veri kaynakları ve bağlantı durumu</h1><p className="text-xs text-slate-500">Bir kaynak kesildiğinde son doğrulanmış değer tarihiyle gösterilir, güncelliğe bağlı öneriler beklemeye alınır ve bağlantı artan aralıklarla (1 dk → 30 dk) yeniden denenir.</p></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
          const p = PROVIDERS[id], s = st.get(id);
          const off = p.optional && !enabled[id];
          const state = off ? "Anahtar tanımlı değil" : !s ? "Henüz denenmedi" : s.ok ? "Çalışıyor" : "Bağlantı yok";
          const dot = off || !s ? "bg-slate-300" : s.ok ? "bg-up" : "bg-down";
          return (
            <section key={id} className="card" data-testid={`provider-${id}`}>
              <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold">{p.title}</h2><span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium"><span className={`h-2 w-2 rounded-full ${dot}`} />{state}</span></div>
              <p className="mt-1 text-sm text-slate-700">{p.data}</p>
              <p className="mt-1 text-xs text-slate-500">{p.access}{p.env ? <> Ortam değişkeni: <code className="rounded bg-slate-100 px-1">{p.env}</code></> : null}</p>
              {!off ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-slate-500">Son başarılı güncelleme</dt><dd className="font-medium">{fmtDateTime(s?.last_success_at)}</dd></div>
                  <div><dt className="text-slate-500">Son deneme</dt><dd className="font-medium">{fmtDateTime(s?.last_attempt_at)}</dd></div>
                  {s && !s.ok ? <><div><dt className="text-slate-500">Art arda hata</dt><dd className="font-medium">{s.consecutive_failures}</dd></div><div><dt className="text-slate-500">Sonraki yeniden deneme</dt><dd className="font-medium">{fmtDateTime(s.next_retry_at)}</dd></div><div className="col-span-2"><dt className="text-slate-500">Hata</dt><dd className="break-words font-medium text-red-700">{s.last_error}</dd></div></> : null}
                </dl>
              ) : null}
              {!off ? <form action={retryProviderAction} className="mt-3"><input type="hidden" name="provider" value={id} /><button className="btn-ghost !min-h-[36px]">Şimdi yeniden dene</button></form> : null}
            </section>
          );
        })}
      </div>
      <section className="card"><h2 className="h-sec">Zamanlanmış iş kayıtları</h2>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">{runs.map((r) => <li key={r.id}>{fmtDateTime(r.started_at)} · {r.job} · <span className="font-medium text-slate-800">{r.outcome ?? "sürüyor"}</span> · {r.detail}</li>)}{runs.length === 0 ? <li>Kayıt yok.</li> : null}</ul>
      </section>
    </div>
  );
}
