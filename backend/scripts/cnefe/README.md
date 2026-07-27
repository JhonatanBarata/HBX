# CNEFE (IBGE 2022) → banco `cnefe` na VPS

Base de endereços georreferenciados do Censo 2022 (CNEFE). Alimenta o resolver de
coordenada por `(cep, numero)` — pino de porta sem depender de Nominatim.

## Como carregar uma UF (na VPS, como root)

```bash
cd /root/HBX/backend/scripts/cnefe   # ou onde os 2 arquivos estiverem juntos
bash carregar-uf.sh SP
```

O script é idempotente e autossuficiente: cria banco/tabelas se faltar, baixa o zip do
FTP do IBGE se não estiver em `/root/hbx-data/cnefe/`, baixa/cacheia nomes de município
(API IBGE), carrega via COPY em streaming (`unzip -p` | `transformar-cnefe.py` | `psql`,
com `nice`/`ionice`, **sem** extrair CSV pro disco), cria índices ao final e mantém o
progresso em `cnefe_uf` (`pendente|baixando|carregando|carregada|erro`). Re-rodar a
mesma UF apaga e recarrega só as linhas dela. O zip fica guardado (~1 GB por UF grande);
disco é o limite — conferir `df -h` antes de enfileirar UF nova.

- Banco: `cnefe` (mesmo Postgres `hbx-postgres`, usuário `hbx_user`) — separado do
  `hbx_prod` pelo mesmo motivo da RFB: backup do publish não pode inchar.
- Overrides por env: `CNEFE_DIR`, `CNEFE_PGUSER`, `CNEFE_CONTAINER`.
- É este script que o agendador de UF chama (1 UF por vez, janela noturna).

## Tabelas

`cnefe_endereco(uf, cep, logradouro, logradouro_norm, numero, complemento, localidade,
municipio, cod_municipio, lat, lng, nivel_geo)` — índices `(cep,numero)`, `(cep)`,
`(cod_municipio, logradouro_norm)`. `nivel_geo=1` ⇒ coordenada do próprio endereço
(NV_GEO_COORD do CNEFE). `numero` NULL = S/N. `logradouro_norm` espelha
`nucleo-geo.util.ts::normalizeVia` — se mudar lá, mudar `transformar-cnefe.py` junto.

`cnefe_uf(uf, status, zip_bytes, linhas, baixado_em, carregado_em, erro)` — controle do
agendador.

## Referência de carga (SP, 26/07/2026)

Ver relatório da frente: ~26M linhas, zip 1,0 GB, carga noturna sem derrubar produção.
