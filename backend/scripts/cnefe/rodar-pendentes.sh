#!/usr/bin/env bash
# R9 (27/07) — agendador noturno do CNEFE: carrega as UFs marcadas como `pendente`
# em cnefe_uf (quem marca é o backend, cnefe-resolver.util.ts, quando aparece cliente
# de UF sem carga). Roda 1 UF por vez, na janela noturna (systemd timer 20h10
# America/Sao_Paulo — ver hbx-cnefe.timer), pra nunca competir com a produção de dia.
#
# Ordem: todas as `pendente` (mais antiga primeiro); se não houver, tenta a `erro`
# mais antiga (falha transitória de download se cura sozinha; erro repetido continua
# registrado em cnefe_uf.erro pro operador).
#
# Guardas: lock (não empilha com uma carga ainda em andamento) e piso de disco
# (zip ~1 GB + carga — aborta com <15 GB livres em vez de derrubar a VPS).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGUSER="${CNEFE_PGUSER:-hbx_user}"
CONTAINER="${CNEFE_CONTAINER:-hbx-postgres}"
LOCK="/run/hbx-cnefe.lock"
MIN_DISCO_KB=$((15 * 1024 * 1024))

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[cnefe] carga anterior ainda em andamento — pulando esta janela."
  exit 0
fi

livre_kb=$(df -k / | awk 'NR==2 {print $4}')
if [[ "$livre_kb" -lt "$MIN_DISCO_KB" ]]; then
  echo "[cnefe] disco insuficiente ($((livre_kb / 1024 / 1024)) GB livres; mínimo 15 GB) — nada carregado." >&2
  exit 1
fi

psql_cnefe() { docker exec -i "$CONTAINER" psql -U "$PGUSER" -d cnefe -tAc "$1"; }

# Sem banco/tabela ainda = nada pendente (o carregar-uf.sh cria tudo na 1ª carga manual).
UFS=$(psql_cnefe "SELECT uf FROM cnefe_uf WHERE status='pendente' ORDER BY baixado_em NULLS FIRST, uf" 2>/dev/null || true)
if [[ -z "$UFS" ]]; then
  UFS=$(psql_cnefe "SELECT uf FROM cnefe_uf WHERE status='erro' ORDER BY uf LIMIT 1" 2>/dev/null || true)
fi
if [[ -z "$UFS" ]]; then
  echo "[cnefe] nenhuma UF pendente."
  exit 0
fi

for UF in $UFS; do
  echo "[cnefe] carregando UF pendente: $UF"
  bash "$SCRIPT_DIR/carregar-uf.sh" "$UF" || {
    echo "[cnefe] carga de $UF falhou (registrada em cnefe_uf.erro) — segue pra próxima janela." >&2
    exit 1
  }
done
echo "[cnefe] fila de UFs pendentes concluída."
