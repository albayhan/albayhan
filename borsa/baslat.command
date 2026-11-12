#!/bin/bash
# BIST Portföy — Mac'te tek tıkla başlatma
cd "$(dirname "$0")"
LOG="$PWD/baslat.log"
exec > >(tee "$LOG") 2>&1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "== $(date) =="
open_app() { for i in $(seq 1 90); do curl -s localhost:${1}/api/health >/dev/null && { echo "HAZIR: http://localhost:$1"; open "http://localhost:$1"; return 0; }; sleep 2; done; echo "UYGULAMA AÇILMADI"; return 1; }

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  echo "Docker bulundu, compose ile başlatılıyor..."
  docker compose up -d --build && open_app 3000
  docker compose ps
  exit
fi
echo "Docker yok ya da çalışmıyor; yerel Node + PostgreSQL ile denenecek."
command -v node >/dev/null || { echo "HATA: Node.js yok. 'brew install node' ya da Docker Desktop kurun."; exit 1; }
echo "node $(node -v)"
if ! command -v pg_ctl >/dev/null && ! ls /opt/homebrew/opt/postgresql@16/bin/pg_ctl >/dev/null 2>&1; then
  command -v brew >/dev/null || { echo "HATA: PostgreSQL ve Homebrew yok."; exit 1; }
  echo "PostgreSQL 16 kuruluyor (brew)..."; brew install postgresql@16
fi
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
brew services start postgresql@16 2>/dev/null
for i in $(seq 1 20); do pg_isready -q && break; sleep 1; done
createdb borsa 2>/dev/null; echo "Veritabanı hazır"
export DATABASE_URL="postgres://$(whoami)@localhost:5432/borsa" TZ=Europe/Istanbul PORT=3000
OLD=$(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null)
if [ -n "$OLD" ]; then echo "eski sunucu durduruluyor (pid $OLD)"; kill $OLD; sleep 2; fi
npm ci --no-audit --no-fund && npm run build || { echo "HATA: derleme"; exit 1; }
cp -R .next/static .next/standalone/.next/
nohup node "$PWD/.next/standalone/server.js" > sunucu.log 2>&1 &
open_app 3000
echo "Durdurmak için: kill \$(lsof -ti tcp:3000 -sTCP:LISTEN)"
