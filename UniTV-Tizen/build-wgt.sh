#!/usr/bin/env bash
# Empacota o projeto em UniTV.wgt usando o Tizen CLI.
# Requer Tizen Studio + TV Extensions no PATH e um perfil de assinatura criado.
# Uso: ./build-wgt.sh <NOME_DO_PERFIL>
set -e
PROFILE="${1:-UniTVProfile}"
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "==> tizen build-web"
tizen build-web -- .

echo "==> tizen package (wgt) com perfil: $PROFILE"
tizen package -t wgt -s "$PROFILE" -- .buildResult

echo "==> Gerado:"
ls -1 .buildResult/*.wgt
echo "Instale com: sdb connect <IP_TV>:26101 && tizen install -n .buildResult/UniTV.wgt -t <TV_TARGET>"
