import { Pool, type QueryResultRow } from "pg";

const g = globalThis as unknown as { __pool?: Pool; __migrated?: Promise<void> };

export function pool(): Pool {
  if (!g.__pool) {
    g.__pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://borsa:borsa@localhost:5432/borsa",
      max: 10,
    });
    // NUMERIC ve BIGINT değerlerini sayı olarak oku
    const types = require("pg").types;
    types.setTypeParser(1700, (v: string) => parseFloat(v));
    types.setTypeParser(20, (v: string) => parseInt(v, 10));
    // DATE -> 'YYYY-AA-GG' metni (saat dilimi kayması olmasın)
    types.setTypeParser(1082, (v: string) => v);
  }
  return g.__pool;
}

export async function q<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<T[]> {
  await migrate();
  const r = await pool().query<T>(text, params);
  return r.rows;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS instruments (
  symbol TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('stock','fund','index')),
  name TEXT NOT NULL DEFAULT '',
  kap_member_oid TEXT,
  in_watchlist BOOLEAN NOT NULL DEFAULT TRUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalog (
  symbol TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  kap_member_oid TEXT,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS price_bars (
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC NOT NULL,
  raw_close NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, date)
);
CREATE TABLE IF NOT EXISTS quotes (
  symbol TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  prev_close NUMERIC,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  volume NUMERIC,
  market_cap NUMERIC,
  as_of TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS fundamentals (
  symbol TEXT NOT NULL,
  year INT NOT NULL,
  period INT NOT NULL,
  items JSONB NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (symbol, year, period)
);
CREATE TABLE IF NOT EXISTS disclosures (
  id BIGINT PRIMARY KEY,
  symbol TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  class TEXT,
  subject TEXT,
  summary TEXT,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS disclosures_symbol_idx ON disclosures (symbol, published_at DESC);
CREATE TABLE IF NOT EXISTS macro (
  series TEXT NOT NULL,
  date DATE NOT NULL,
  value NUMERIC NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (series, date)
);
CREATE TABLE IF NOT EXISTS fund_info (
  symbol TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  source TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS company_metrics (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','DIVIDEND','SPLIT','RIGHTS','DEPOSIT','WITHDRAW')),
  symbol TEXT,
  quantity NUMERIC,
  price NUMERIC,
  fee NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS provider_status (
  provider TEXT PRIMARY KEY,
  ok BOOLEAN NOT NULL,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS daily_reports (
  report_date DATE PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL,
  trigger TEXT NOT NULL,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL REFERENCES daily_reports(report_date) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  prev_status TEXT,
  change_reason TEXT,
  data JSONB NOT NULL,
  UNIQUE (report_date, symbol)
);
CREATE TABLE IF NOT EXISTS job_runs (
  id SERIAL PRIMARY KEY,
  job TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  outcome TEXT,
  detail TEXT
);
INSERT INTO instruments (symbol, type, name) VALUES
  ('THYAO','stock','TÜRK HAVA YOLLARI A.O.'),
  ('TUPRS','stock','TÜPRAŞ-TÜRKİYE PETROL RAFİNERİLERİ A.Ş.'),
  ('AEFES','stock','ANADOLU EFES BİRACILIK VE MALT SANAYİİ A.Ş.')
ON CONFLICT DO NOTHING;
INSERT INTO instruments (symbol, type, name, in_watchlist) VALUES ('XU100','index','BIST 100', FALSE)
ON CONFLICT DO NOTHING;
`;

export function migrate(): Promise<void> {
  if (!g.__migrated) {
    g.__migrated = (async () => {
      const c = await pool().connect();
      try {
        await c.query("SELECT pg_advisory_lock(727001)");
        // İlk kurulumda izleme listesi tohumlanır; kullanıcı sonradan silerse geri gelmesin.
        const first = (await c.query("SELECT to_regclass('public.instruments') AS t")).rows[0].t === null;
        const sql = first ? SCHEMA : SCHEMA.slice(0, SCHEMA.indexOf("INSERT INTO instruments"));
        await c.query(sql);
        await c.query("SELECT pg_advisory_unlock(727001)");
      } finally {
        c.release();
      }
    })().catch((e) => {
      g.__migrated = undefined;
      throw e;
    });
  }
  return g.__migrated;
}
