#!/bin/sh
# HBX Comex — N1: download do bulk Comex Stat (fonte oficial MDIC/SECEX).
# Certificado do balanca.economia.gov.br tem cadeia incompleta (gov) — dado é
# público e read-only, por isso o -k é aceitável aqui e SÓ aqui.
set -e
BASE="https://balanca.economia.gov.br/balanca/bd"
DIR="$(dirname "$0")/data/raw"
mkdir -p "$DIR/tabelas" "$DIR/mun" "$DIR/ncm"

fetch() { # fetch <url> <destino>
  if [ -s "$2" ]; then echo "SKIP $2"; return 0; fi
  echo "GET  $1"
  curl -sk --fail --retry 3 --retry-delay 5 --max-time 1800 "$1" -o "$2.part" && mv "$2.part" "$2"
}

for t in NCM NCM_SH PAIS PAIS_BLOCO UF UF_MUN VIA URF NCM_UNIDADE; do
  fetch "$BASE/tabelas/$t.csv" "$DIR/tabelas/$t.csv"
done

for y in 2024 2025 2026; do
  fetch "$BASE/comexstat-bd/mun/IMP_${y}_MUN.csv" "$DIR/mun/IMP_${y}_MUN.csv"
  fetch "$BASE/comexstat-bd/mun/EXP_${y}_MUN.csv" "$DIR/mun/EXP_${y}_MUN.csv"
  fetch "$BASE/comexstat-bd/ncm/IMP_${y}.csv"     "$DIR/ncm/IMP_${y}.csv"
  fetch "$BASE/comexstat-bd/ncm/EXP_${y}.csv"     "$DIR/ncm/EXP_${y}.csv"
done

echo "DONE"
ls -la "$DIR/tabelas" "$DIR/mun" "$DIR/ncm"
