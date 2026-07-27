#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CNEFE 2022 (IBGE) → COPY text do Postgres (tabela cnefe_endereco).

Lê o CSV do CNEFE (separador ';', UTF-8, com header) no stdin e escreve no stdout
linhas tab-separadas prontas pro `COPY cnefe_endereco (...) FROM STDIN`.

Uso: unzip -p 35_SP.zip | python3 transformar-cnefe.py SP municipios_SP.json

  argv[1] = sigla da UF (vai na coluna `uf`)
  argv[2] = JSON da API do IBGE com os municípios da UF
            (https://servicodados.ibge.gov.br/api/v1/localidades/estados/<UF>/municipios)
            → resolve cod_municipio → nome.

Mapeamento CSV → contrato (colunas do CNEFE 2022, 1-indexadas):
   9 CEP              → cep (8 dígitos)
  10 DSC_LOCALIDADE   → localidade
  11 NOM_TIPO_SEGLOGR ┐
  12 NOM_TITULO_SEGLOGR├→ logradouro (juntos, espaço simples) + logradouro_norm
  13 NOM_SEGLOGR      ┘
  14 NUM_ENDERECO     → numero (0/S/N → NULL; DSC_MODIFICADOR='SN' marca sem número)
  15 DSC_MODIFICADOR + 16..25 NOM/VAL_COMP_ELEM1..5 → complemento
   3 COD_MUNICIPIO    → cod_municipio (+ municipio via JSON do IBGE)
  26 LATITUDE         → lat   (ponto decimal)
  27 LONGITUDE        → lng
  28 NV_GEO_COORD     → nivel_geo (1 = coordenada do próprio endereço)

`logradouro_norm` ESPELHA backend/src/nucleo/nucleo-geo.util.ts::normalizeVia
(minúsculo, sem acento, sem [.,], espaços colapsados, tipo de via abreviado).
Se mudar lá, mude aqui.
"""
import csv
import json
import re
import sys
import unicodedata

# ── espelho de normalizeVia (nucleo-geo.util.ts) ────────────────────────────────
_DIACRITICS = re.compile('[\u0300-\u036f]')
_PONTO_VIRGULA = re.compile(r'[.,]')
_ESPACOS = re.compile(r'\s+')

TIPO_VIA = [
    (re.compile(r'^(av|avn|avd|avenida)\b'), 'av'),
    (re.compile(r'^(r|rua)\b'), 'rua'),
    (re.compile(r'^(tv|trav|travessa)\b'), 'travessa'),
    (re.compile(r'^(rod|rodovia)\b'), 'rodovia'),
    (re.compile(r'^(est|estr|estrada)\b'), 'estrada'),
    (re.compile(r'^(al|alameda)\b'), 'alameda'),
    (re.compile(r'^(pc|pca|praca)\b'), 'praca'),
]


def normalize_lookup(value: str) -> str:
    s = unicodedata.normalize('NFD', value or '')
    s = _DIACRITICS.sub('', s)
    return _ESPACOS.sub(' ', s.lower()).strip()


def normalize_via(value: str) -> str:
    v = normalize_lookup(value)
    v = _ESPACOS.sub(' ', _PONTO_VIRGULA.sub(' ', v)).strip()
    for rx, canonico in TIPO_VIA:
        if rx.match(v):
            v = rx.sub(canonico, v, count=1)
            break
    return _ESPACOS.sub(' ', v).strip()


# ── saída COPY text: tab separa, \N é NULL ─────────────────────────────────────
def copy_escape(v: str) -> str:
    return (
        v.replace('\\', '\\\\').replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')
    )


def main() -> int:
    if len(sys.argv) < 3:
        sys.stderr.write('uso: transformar-cnefe.py <UF> <municipios.json>\n')
        return 2

    uf = sys.argv[1].strip().upper()
    with open(sys.argv[2], 'r', encoding='utf-8') as f:
        municipios = {str(m['id']): m['nome'] for m in json.load(f)}

    reader = csv.reader(sys.stdin, delimiter=';')
    out = sys.stdout
    header = next(reader, None)
    if not header or header[0] != 'COD_UNICO_ENDERECO':
        sys.stderr.write('ERRO: header inesperado (esperava COD_UNICO_ENDERECO): %r\n' % (header[:3] if header else header))
        return 3

    idx = {name: i for i, name in enumerate(header)}
    # nomes reais conferidos no CSV de SP em 26/07/2026
    I_MUN = idx['COD_MUNICIPIO']
    I_CEP = idx['CEP']
    I_LOC = idx['DSC_LOCALIDADE']
    I_TIPO = idx['NOM_TIPO_SEGLOGR']
    I_TIT = idx['NOM_TITULO_SEGLOGR']
    I_NOME = idx['NOM_SEGLOGR']
    I_NUM = idx['NUM_ENDERECO']
    I_MOD = idx['DSC_MODIFICADOR']
    I_COMP = [(idx['NOM_COMP_ELEM%d' % n], idx['VAL_COMP_ELEM%d' % n]) for n in range(1, 6)]
    I_LAT = idx['LATITUDE']
    I_LNG = idx['LONGITUDE']
    I_NV = idx['NV_GEO_COORD']

    total = 0
    for row in reader:
        if len(row) < 28:
            continue

        cep = re.sub(r'\D', '', row[I_CEP])
        cep_out = cep if len(cep) == 8 else '\\N'

        logradouro = ' '.join(p for p in (row[I_TIPO].strip(), row[I_TIT].strip(), row[I_NOME].strip()) if p)
        lognorm = normalize_via(logradouro)

        num_raw = row[I_NUM].strip()
        numero = num_raw if num_raw.isdigit() and int(num_raw) > 0 else '\\N'

        partes = []
        mod = row[I_MOD].strip()
        if mod and mod != 'SN':
            partes.append(mod)
        for i_nom, i_val in I_COMP:
            for p in (row[i_nom].strip(), row[i_val].strip()):
                if p:
                    partes.append(p)
        complemento = ' '.join(partes)

        lat_raw, lng_raw = row[I_LAT].strip(), row[I_LNG].strip()
        try:
            lat = repr(float(lat_raw)) if lat_raw else '\\N'
            lng = repr(float(lng_raw)) if lng_raw else '\\N'
        except ValueError:
            lat = lng = '\\N'

        nv = row[I_NV].strip()
        nivel = nv if nv.isdigit() else '\\N'

        cod_mun = row[I_MUN].strip()
        municipio = municipios.get(cod_mun, '')

        out.write('\t'.join((
            uf,
            cep_out,
            copy_escape(logradouro) if logradouro else '\\N',
            copy_escape(lognorm) if lognorm else '\\N',
            numero,
            copy_escape(complemento) if complemento else '\\N',
            copy_escape(row[I_LOC].strip()) or '\\N',
            copy_escape(municipio) if municipio else '\\N',
            cod_mun or '\\N',
            lat,
            lng,
            nivel,
        )) + '\n')
        total += 1
        if total % 1000000 == 0:
            sys.stderr.write('… %d linhas\n' % total)

    sys.stderr.write('TOTAL_TRANSFORMADO=%d\n' % total)
    return 0


if __name__ == '__main__':
    sys.exit(main())
