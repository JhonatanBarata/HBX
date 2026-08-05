#!/usr/bin/env bash
# =============================================================================
# ATUALIZAÇÃO MENSAL DA BASE PÚBLICA DA RFB — acionado pelo systemd.
# =============================================================================
# Unidades na VPS (instaladas à mão, ver "INSTALAÇÃO" no fim):
#   /etc/systemd/system/hbx-rfb-monthly.timer    → OnCalendar=*-*-15 21:00 America/Sao_Paulo
#   /etc/systemd/system/hbx-rfb-monthly.service  → ExecStart=/root/HBX/scripts/rfb-monthly-update.sh
#
# ⚠️ POR QUE ESTE ARQUIVO PASSOU A SER VERSIONADO (05/08/2026)
# Ele existia SÓ na VPS, como arquivo untracked dentro de /root/HBX (`git status`
# mostrava `?? scripts/rfb-monthly-update.sh`). O deploy roda
# `git reset --hard origin/master`, que não remove untracked — então ele
# sobrevivia por sorte. Um `git clean -fd` (ou uma faxina de repo) apagaria o
# job mensal inteiro, em silêncio, e ninguém descobriria até a base da RFB
# ficar velha. Freio que mora fora do git não é freio: é sorte.
#
# ⚠️ O FREIO DE DISCO QUE ENTROU AQUI (05/08/2026)
# Este job era a maior fonte de vazamento de disco da casa: baixava ~7 GB de
# zips por mês em /root/hbx-data/rfb/<AAAA-MM>/ e NUNCA apagava nada. Medido em
# 05/08: 7,2 GB da rodada de julho parados, já importados, sem ninguém lendo —
# com a VPS em 84% de disco. A limpeza agora vive DENTRO do importador
# (backend/scripts/lib/rfb-disk-guard.js), condicionada ao SUCESSO do aceite da
# carga; ela NÃO está aqui de propósito: só o importador sabe se a carga fechou.
#
# O prune de Docker no fim também mudou: era `-af` (levava imagem COM tag e
# zerava o cache de build inteiro, deixando o publish seguinte lento). Agora usa
# o MESMO freio do publish — scripts/lib/vps-disk-guard.js, uma fonte só.
# =============================================================================
set -Eeuo pipefail

umask 027

trap 'code=$?; echo "[rfb-monthly] FALHA código=$code em $(date --iso-8601=seconds)"; df -h /; exit "$code"' ERR

readonly REPO_ROOT="${HBX_RFB_REPO_ROOT:-/root/HBX}"
readonly DATA_DIR="${HBX_RFB_DATA_DIR:-/root/hbx-data/rfb}"
readonly DB_CONTAINER="${HBX_RFB_DB_CONTAINER:-hbx-postgres}"
readonly LOCK_FILE="${HBX_RFB_LOCK_FILE:-/run/lock/hbx-rfb-monthly.lock}"

cd "$REPO_ROOT"
mkdir -p "$DATA_DIR"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[rfb-monthly] outra atualização já está em execução; encerrando sem concorrência"
  exit 0
fi

echo "[rfb-monthly] início $(date --iso-8601=seconds)"
echo "[rfb-monthly] disco antes:"
df -h /

# ---------------------------------------------------------------------------
# GUARDA DE ESPAÇO — a rodada precisa de ~7 GB de download + ~25 GB de staging
# no Postgres. Entrar nela com o disco no fim é como o incidente de 05/08
# começou. Aborta ANTES de baixar 7 GB que não vão caber.
# Teto configurável: HBX_RFB_MIN_FREE_GB (default 45).
# ---------------------------------------------------------------------------
readonly MIN_FREE_GB="${HBX_RFB_MIN_FREE_GB:-45}"
free_gb="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
if [ -n "$free_gb" ] && [ "$free_gb" -lt "$MIN_FREE_GB" ]; then
  echo "[rfb-monthly] ABORTADO: só ${free_gb} GB livres em / e a rodada precisa de ~${MIN_FREE_GB} GB"
  echo "[rfb-monthly] (download ~7 GB + staging ~25 GB no Postgres). Faça faxina e rode de novo:"
  echo "[rfb-monthly]   npm run docker:clean:vps"
  echo "[rfb-monthly]   systemctl start hbx-rfb-monthly.service"
  exit 1
fi
echo "[rfb-monthly] espaço ok: ${free_gb} GB livres (mínimo exigido ${MIN_FREE_GB} GB)"

# A carga apaga os zips no fim, mas SÓ depois do aceite passar — ver
# backend/scripts/lib/rfb-disk-guard.js. Pra depurar sem re-baixar 7 GB, passe
# --keep-zips (ou HBX_RFB_KEEP_MONTHS=1 pra guardar o mês corrente).
node backend/scripts/import-cnpj-dataset.js rfb \
  --container "$DB_CONTAINER" \
  --dir "$DATA_DIR" \
  "$@"

# ---------------------------------------------------------------------------
# Higiene de Docker — MESMO freio do publish (fonte única:
# scripts/lib/vps-disk-guard.js). Só imagens órfãs e cache de build acima do
# teto; containers, volumes, banco e backups NUNCA entram.
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/scripts/lib/vps-disk-guard.js" ]; then
  node -e 'console.log(require("./scripts/lib/vps-disk-guard").buildDiskGuardShellLines().join("\n"))' \
    | bash || echo "[rfb-monthly] AVISO: faxina de Docker falhou (não invalida a carga)"
else
  echo "[rfb-monthly] AVISO: scripts/lib/vps-disk-guard.js não encontrado — faxina de Docker PULADA."
fi

echo "[rfb-monthly] disco depois:"
df -h /
echo "[rfb-monthly] fim $(date --iso-8601=seconds)"

# =============================================================================
# INSTALAÇÃO / MANUTENÇÃO (referência — as unidades já estão na VPS)
#   chmod 0750 /root/HBX/scripts/rfb-monthly-update.sh
#   systemctl daemon-reload
#   systemctl enable --now hbx-rfb-monthly.timer
#   systemctl list-timers hbx-rfb-monthly.timer     # confere a próxima execução
#   journalctl -u hbx-rfb-monthly.service -n 200    # log da última rodada
#   systemctl start hbx-rfb-monthly.service         # roda agora, à mão
# =============================================================================
