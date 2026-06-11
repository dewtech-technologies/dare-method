#!/bin/bash
set -euo pipefail

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

export NVM_DIR="/home/ubuntu/.nvm"
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

BACKEND_DIR="/home/ubuntu/exametoxicologico-cms"
FRONTEND_DIR="/home/ubuntu/exametoxicologico-web-front"

log "========== ETAPA 1/2: BACKEND (Strapi) =========="
nvm use 22
cd "$BACKEND_DIR"

log "Instalando dependências do backend..."
yarn install --frozen-lockfile

log "Build do backend (production)..."
NODE_ENV=production yarn build

log "Verificando pasta dist..."
test -d "$BACKEND_DIR/dist" || { echo "ERRO: dist não foi gerado"; exit 1; }

log "Reiniciando PM2: cms-toxicologia..."
pm2 reload cms-toxicologia --update-env
pm2 save

log "Aguardando backend ficar saudável..."
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1337/_health || echo "000")
  if [ "$CODE" = "204" ] || [ "$CODE" = "200" ]; then
    log "Backend OK (HTTP $CODE)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERRO: backend não respondeu após 30 tentativas (último: $CODE)"
    pm2 logs cms-toxicologia --lines 20 --nostream
    exit 1
  fi
  sleep 2
done

log "========== ETAPA 2/2: FRONTEND (Next.js) =========="
cd "$FRONTEND_DIR"

log "Instalando dependências do frontend..."
/usr/bin/npm ci

log "Removendo .next antigo..."
for i in 1 2 3 4 5; do
  rm -rf .next && break
  sleep 2
done

log "Build do frontend (production)..."
NODE_ENV=production /usr/bin/npm run build

log "Verificando pasta .next..."
test -d "$FRONTEND_DIR/.next" || { echo "ERRO: .next não foi gerado"; exit 1; }

log "Reiniciando PM2: front-toxicologia..."
export PATH="/home/ubuntu/.nvm/versions/node/v20.19.5/bin:$PATH"
pm2 reload front-toxicologia --update-env
pm2 save

log "Aguardando frontend ficar saudável..."
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || echo "000")
  if [ "$CODE" = "200" ]; then
    log "Frontend OK (HTTP $CODE)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERRO: frontend não respondeu após 30 tentativas (último: $CODE)"
    pm2 logs front-toxicologia --lines 20 --nostream
    exit 1
  fi
  sleep 2
done

log "========== STATUS FINAL =========="
pm2 list
curl -s -o /dev/null -w "backend_1337:%{http_code}\n" http://127.0.0.1:1337/_health
curl -s -o /dev/null -w "frontend_3000:%{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "www_public:%{http_code}\n" https://www.exametoxicologico.com.br/ -k
curl -s -o /dev/null -w "cms_public:%{http_code}\n" https://cms.exametoxicologico.com.br/admin -k
log "Rebuild concluído com sucesso!"
