#!/bin/sh
# S20 (MOTOR-ÚNICO) — dump SELETIVO das tabelas-alvo do DDL destrutivo em
# backend/prisma/migrations-hold/pending_drop_assistente_config_and_atendimento_botconfig/migration.sql
#
# Regra de ouro (README da frente, "Publish NUNCA faz backup da RFB" na
# memória do dono): NUNCA dumpar `cnpj_public*` — já encheu volume da VPS
# antes. Este script usa `--table` (allowlist) com EXATAMENTE 3 tabelas: as 2
# alvo do DROP/DELETE (AssistenteConfig, BotConfig — a tabela toda, não só o
# domain, porque pg_dump --table não filtra por WHERE; é a única forma de ter
# um restore completo se precisar reverter) + AutomationAgent (destino da
# migração, incluída pra ter o "antes/depois" no mesmo arquivo de dump).
# Nenhuma outra tabela é tocada.
#
# Roda NO VPS (o dump é gerado lá, não no Windows do dono — Postgres/Docker
# vivem só no VPS). Uso típico a partir da raiz do repo, via o wrapper que já
# existe pra falar com o VPS:
#   node scripts/vps-run.js "bash /root/HBX/backend/scripts/automation-pre-drop-dump.sh"
# (ou colar o corpo abaixo direto num shell já dentro do VPS).
#
# Saída fica no HOST do VPS (fora do container, sobrevive a `docker restart`):
#   /root/HBX/backup-motor-unico/db/automation-pre-drop-<timestamp>.dump
# Pra guardar uma cópia local também (convenção da frente — ver README:
# "Desktop\Backup 20-07 alteracaomotor"), baixar depois com scp/rsync pra
# Desktop\Backup 20-07 alteracaomotor\db\ — este script não tem acesso ao
# filesystem do Windows do dono, só ao VPS.
#
# Restaurar (se precisar reverter um DROP/DELETE já aplicado):
#   docker exec -i hbx-postgres pg_restore -U hbx_user -d hbx_prod --clean --if-exists < <arquivo>.dump

set -e

CONTAINER="${HBX_POSTGRES_CONTAINER:-hbx-postgres}"
DB_USER="${POSTGRES_USER:-hbx_user}"
DB_NAME="${POSTGRES_DB:-hbx_prod}"
OUT_DIR="${AUTOMATION_DUMP_DIR:-/root/HBX/backup-motor-unico/db}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="automation-pre-drop-${TIMESTAMP}.dump"

echo "[automation-pre-drop-dump] container=${CONTAINER} db=${DB_NAME}"
echo "[automation-pre-drop-dump] tabelas (allowlist, NUNCA cnpj_public): AssistenteConfig, BotConfig, AutomationAgent"
echo "[automation-pre-drop-dump] destino=${OUT_DIR}/${OUT_FILE}"

mkdir -p "${OUT_DIR}"

docker exec "${CONTAINER}" pg_dump \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  --table='"AssistenteConfig"' \
  --table='"BotConfig"' \
  --table='"AutomationAgent"' \
  --file="/tmp/${OUT_FILE}"

docker cp "${CONTAINER}:/tmp/${OUT_FILE}" "${OUT_DIR}/${OUT_FILE}"
docker exec "${CONTAINER}" rm -f "/tmp/${OUT_FILE}"

echo "[automation-pre-drop-dump] OK -> ${OUT_DIR}/${OUT_FILE}"
echo "[automation-pre-drop-dump] Restaurar: docker exec -i ${CONTAINER} pg_restore -U ${DB_USER} -d ${DB_NAME} --clean --if-exists < ${OUT_DIR}/${OUT_FILE}"
echo "[automation-pre-drop-dump] LEMBRETE: a migration em migrations-hold/ tem checagem de paridade embutida (aborta se o backfill nao estiver completo/atualizado), mas este dump eh a rede de seguranca fisica — gerar SEMPRE antes de mover a migration pra prisma/migrations/."
