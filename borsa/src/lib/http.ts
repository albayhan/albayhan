import { fetch as ufetch, EnvHttpProxyAgent, type Dispatcher } from "undici";

let dispatcher: Dispatcher | undefined;
function getDispatcher(): Dispatcher | undefined {
  // Kurumsal/ortam vekil sunucusu tanımlıysa kullan (HTTPS_PROXY / NO_PROXY).
  if (dispatcher === undefined && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
    dispatcher = new EnvHttpProxyAgent();
  }
  return dispatcher;
}

export const USER_AGENT = process.env.HTTP_USER_AGENT ?? "bist-portfoy/1.0 (kisisel kullanim)";

export class HttpError extends Error {
  constructor(public status: number, public url: string, body: string) {
    super(`HTTP ${status} — ${new URL(url).host}${body ? ": " + body.slice(0, 160).replace(/\s+/g, " ") : ""}`);
  }
}

export async function httpGet(url: string, init: { headers?: Record<string, string>; method?: string; body?: string; timeoutMs?: number } = {}): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 20000);
  try {
    const res = await ufetch(url, {
      method: init.method ?? "GET",
      body: init.body,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/xml, */*", ...(init.headers ?? {}) },
      signal: ctl.signal,
      dispatcher: getDispatcher(),
      redirect: "follow",
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, url, text);
    return text;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    const host = new URL(url).host;
    const cause = e?.cause?.code ?? e?.cause?.message ?? e?.name ?? "hata";
    throw new Error(`${host} bağlantı hatası: ${e?.name === "AbortError" ? "zaman aşımı" : cause}`);
  } finally {
    clearTimeout(t);
  }
}

export async function httpJson<T = any>(url: string, init?: Parameters<typeof httpGet>[1]): Promise<T> {
  const text = await httpGet(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${new URL(url).host}: beklenen JSON yerine farklı yanıt geldi (${text.slice(0, 80).replace(/\s+/g, " ")})`);
  }
}
