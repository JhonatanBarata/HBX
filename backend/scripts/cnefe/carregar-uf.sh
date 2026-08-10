#!/usr/bin/env bash
# CNEFE 2022 (IBGE) → banco `cnefe` no Postgres da VPS (container hbx-postgres).
#
# Uso (na VPS, como root):  bash carregar-uf.sh SP
#
# O que faz, nesta ordem:
#   1. garante banco `cnefe` + tabelas (idempotente);
#   2. baixa o zip da UF do FTP do IBGE se ainda não existir em /root/hbx-data/cnefe;
#   3. baixa/cacheia os nomes de município da UF (API de localidades do IBGE);
#   4. carrega via COPY em streaming (unzip -p | python3 transformar-cnefe.py | psql),
#      com nice/ionice — NUNCA extrai o CSV pro disco;
#   5. cria os índices (IF NOT EXISTS) e atualiza `cnefe_uf` a cada etapa.
#
# Re-execução da MESMA UF é segura: apaga as linhas da UF antes de recarregar.
# Progresso/erro ficam em cnefe_uf (status: pendente|baixando|carregando|carregada|erro).

set -euo pipefail

UF="${1:?uso: carregar-uf.sh <UF>  (ex.: SP)}"
UF="$(echo "$UF" | tr '[:lower:]' '[:upper:]')"

declare -A COD_UF=(
  [RO]=11 [AC]=12 [AM]=13 [RR]=14 [PA]=15 [AP]=16 [TO]=17
  [MA]=21 [PI]=22 [CE]=23 [RN]=24 [PB]=25 [PE]=26 [AL]=27 [SE]=28 [BA]=29
  [MG]=31 [ES]=32 [RJ]=33 [SP]=35
  [PR]=41 [SC]=42 [RS]=43
  [MS]=50 [MT]=51 [GO]=52 [DF]=53
)
COD="${COD_UF[$UF]:?UF desconhecida: $UF}"

DIR="${CNEFE_DIR:-/root/hbx-data/cnefe}"
PGUSER="${CNEFE_PGUSER:-hbx_user}"
CONTAINER="${CNEFE_CONTAINER:-hbx-postgres}"
ZIP="$DIR/${COD}_${UF}.zip"
MUN_JSON="$DIR/municipios_${UF}.json"
URL="https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/${COD}_${UF}.zip"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRANSFORM="$SCRIPT_DIR/transformar-cnefe.py"

psql_cnefe() { docker exec -i "$CONTAINER" psql -U "$PGUSER" -d cnefe -v ON_ERROR_STOP=1 "$@"; }

# ── 1. banco + tabelas (idempotente) ────────────────────────────────────────────
docker exec "$CONTAINER" psql -U "$PGUSER" -d hbx_prod -tAc \
  "SELECT 1 FROM pg_database WHERE datname='cnefe'" | grep -q 1 ||
  docker exec "$CONTAINER" psql -U "$PGUSER" -d hbx_prod -c "CREATE DATABASE cnefe"

psql_cnefe <<'SQL'
CREATE TABLE IF NOT EXISTS cnefe_endereco (
  uf              char(2)  NOT NULL,
  cep             char(8),
  logradouro      text,
  logradouro_norm text,
  numero          integer,
  complemento     text,
  localidade      text,
  municipio       text,
  cod_municipio   text,
  lat             double precision,
  lng             double precision,
  nivel_geo       smallint
);
CREATE TABLE IF NOT EXISTS cnefe_uf (
  uf           char(2) PRIMARY KEY,
  status       text NOT NULL DEFAULT 'pendente',
  zip_bytes    bigint,
  linhas       bigint,
  baixado_em   timestamptz,
  carregado_em timestamptz,
  erro         text
);
SQL

marca() { # marca <status> [sql extra de SET]
  psql_cnefe -qc "INSERT INTO cnefe_uf (uf, status) VALUES ('$UF', '$1')
    ON CONFLICT (uf) DO UPDATE SET status='$1', erro=NULL;"
  # SET extra em UPDATE separado: no primeiro INSERT não há conflito e o extra se perderia.
  [[ -n "${2:-}" ]] && psql_cnefe -qc "UPDATE cnefe_uf SET $2 WHERE uf='$UF';" || true
}

falha() {
  local msg="${1:-erro desconhecido}"
  psql_cnefe -qc "INSERT INTO cnefe_uf (uf, status, erro) VALUES ('$UF','erro',\$\$${msg}\$\$)
    ON CONFLICT (uf) DO UPDATE SET status='erro', erro=\$\$${msg}\$\$;" || true
  echo "ERRO [$UF]: $msg" >&2
  exit 1
}
trap 'falha "linha $LINENO: comando falhou"' ERR

# ── 2. zip da UF ────────────────────────────────────────────────────────────────
if [[ ! -s "$ZIP" ]]; then
  marca baixando
  echo "[$UF] baixando $URL"
  curl -fSL --retry 3 --retry-delay 10 -o "$ZIP.part" "$URL" || falha "download falhou: $URL"
  mv "$ZIP.part" "$ZIP"
fi
ZIP_BYTES=$(stat -c%s "$ZIP")
unzip -t "$ZIP" >/dev/null || falha "zip corrompido: $ZIP"
marca baixando "zip_bytes=$ZIP_BYTES, baixado_em=COALESCE(cnefe_uf.baixado_em, now())"

# ── 3. municípios da UF (nome ← código IBGE) ───────────────────────────────────
if [[ ! -s "$MUN_JSON" ]]; then
  curl -fsS --retry 3 -o "$MUN_JSON" \
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF}/municipios" ||
    falha "API de municípios do IBGE indisponível"
fi
python3 -c "import json,sys; d=json.load(open('$MUN_JSON')); sys.exit(0 if d and 'id' in d[0] else 1)" ||
  falha "JSON de municípios inválido: $MUN_JSON"

# ── 4. carga (streaming, sem CSV no disco) ─────────────────────────────────────
marca carregando
psql_cnefe -qc "DELETE FROM cnefe_endereco WHERE uf='$UF';"

echo "[$UF] carga iniciada $(date -Is)"
SECONDS=0
nice -n 19 ionice -c3 unzip -p "$ZIP" \
  | nice -n 19 ionice -c3 python3 "$TRANSFORM" "$UF" "$MUN_JSON" \
  | psql_cnefe -qc "COPY cnefe_endereco (uf,cep,logradouro,logradouro_norm,numero,complemento,localidade,municipio,cod_municipio,lat,lng,nivel_geo) FROM STDIN" \
  || falha "COPY falhou (ver log)"
DUR=$SECONDS

# ── 5. índices DEPOIS da carga + estado final ──────────────────────────────────
psql_cnefe <<'SQL'
CREATE INDEX IF NOT EXISTS idx_cnefe_end_cep_numero ON cnefe_endereco (cep, numero);
CREATE INDEX IF NOT EXISTS idx_cnefe_end_cep        ON cnefe_endereco (cep);
CREATE INDEX IF NOT EXISTS idx_cnefe_end_mun_lognorm ON cnefe_endereco (cod_municipio, logradouro_norm);
ANALYZE cnefe_endereco;
SQL

LINHAS=$(psql_cnefe -tAc "SELECT count(*) FROM cnefe_endereco WHERE uf='$UF';")
[[ "$LINHAS" -gt 0 ]] || falha "carga terminou com 0 linhas"
psql_cnefe -qc "UPDATE cnefe_uf SET status='carregada', linhas=$LINHAS, carregado_em=now(), erro=NULL WHERE uf='$UF';"

echo "[$UF] OK: $LINHAS linhas em ${DUR}s ($(date -Is))"

# ── 5b. AGREGADOS (10/08) — sem eles a UF nova NÃO EXISTE pro backend ──────────
# `cnefe_porta`/`cnefe_via`/`cnefe_mun_map` são o que o reverso (posição → CEP,
# botão GPS do cadastro) e a cura por CEP consultam. Até 10/08 eram build à mão
# (SP, /root/geo/build_sp.sql) e a carga de UF terminava sem eles: o raw entrava,
# o resolver seguia cego. O rebuild é TRUNCATE+INSERT sobre a base inteira —
# minutos, na janela noturna do timer (Nice 19), nunca de dia na mão.
echo "[$UF] reconstruindo agregados (cnefe_porta/cnefe_via/cnefe_mun_map)…"
psql_cnefe < "$SCRIPT_DIR/agregados.sql" || falha "agregados falharam (a UF carregou, mas o backend não a enxerga — rode agregados.sql à mão)"
echo "[$UF] agregados prontos."

# ── 6. FREIO DE DISCO (05/08/2026) ─────────────────────────────────────────────
# O zip da UF é fonte FRIA e RECONSTRUÍVEL: mora no FTP do IBGE e o download é
# re-executável (basta rodar este script de novo). Depois da carga aceita, ele
# não serve mais pra nada — só ocupa disco.
#
# POR QUE ISTO ENTROU: em 05/08 a VPS estava em 84% de disco e o 35_SP.zip
# (1,03 GB), importado em 27/07, ainda estava lá. Só SP. Este script roda por UF
# e há 27 UFs no mapa COD_UF: ligar o hbx-cnefe.timer sem este freio significaria
# até ~27 GB de zips parados no disco de produção. O timer AINDA NÃO está
# instalado na VPS (conferido em 05/08) — o freio entra ANTES dele, não depois.
#
# A CONDIÇÃO É O SUCESSO: este bloco só é alcançado depois de
#   • o COPY ter terminado sem erro (`|| falha` acima),
#   • a contagem de linhas ser > 0,
#   • o status ter virado 'carregada' no cnefe_uf.
# Qualquer falha antes disso cai no trap ERR/`falha` e sai — com o zip INTACTO,
# pra a próxima tentativa não re-baixar 1 GB.
#
# TETO/ESCAPE: apaga UM arquivo, o zip DESTA UF, com caminho literal. Não varre
# pasta, não usa glob, não toca no municipios_*.json (284 KB de cache útil, que
# evita depender da API do IBGE). Pra manter o zip: CNEFE_KEEP_ZIP=1.
if [[ "${CNEFE_KEEP_ZIP:-0}" == "1" ]]; then
  echo "[$UF] [freio-disco] CNEFE_KEEP_ZIP=1: zip mantido em $ZIP ($(du -h "$ZIP" | cut -f1))"
elif [[ -f "$ZIP" ]]; then
  ZIP_HUMAN="$(du -h "$ZIP" | cut -f1)"
  rm -f "$ZIP"
  echo "[$UF] [freio-disco] apagado $ZIP ($ZIP_HUMAN) — carga aceita com $LINHAS linhas; fonte segue no FTP do IBGE"
fi

df -h / | tail -1
