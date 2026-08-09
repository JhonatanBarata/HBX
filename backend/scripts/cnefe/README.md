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

## Agendador noturno (R9, 27/07)

Quem consome a base é `backend/src/nucleo/cnefe-resolver.util.ts` (cadastro via
`resolveServerGeo` + cura de `sem_pino` na conferência + `GET /logistica/geo/cep`).
Cliente de UF sem carga → o resolver INSERE a UF como `pendente` em `cnefe_uf` e o
timer noturno carrega:

- `rodar-pendentes.sh` — varre `cnefe_uf.status='pendente'` (senão a `erro` mais
  antiga) e chama `carregar-uf.sh` 1 UF por vez; lock + piso de 15 GB de disco.
- `hbx-cnefe.service` + `hbx-cnefe.timer` — systemd, 20:10 America/Sao_Paulo
  ("depois das 20:00", pedido do dono). Instalar:
  `cp hbx-cnefe.{service,timer} /etc/systemd/system/ && systemctl daemon-reload &&
  systemctl enable --now hbx-cnefe.timer`.
- Backend: `CNEFE_DATABASE_URL` opcional (default = DATABASE_URL com path `/cnefe`);
  kill-switch `HBX_CNEFE_ENABLED=0` (default LIGADO).

## Tabelas

`cnefe_endereco(uf, cep, logradouro, logradouro_norm, numero, complemento, localidade,
municipio, cod_municipio, lat, lng, nivel_geo)` — índices `(cep,numero)`, `(cep)`,
`(cod_municipio, logradouro_norm)`. `nivel_geo=1` ⇒ coordenada do próprio endereço
(NV_GEO_COORD do CNEFE). `numero` NULL = S/N. `logradouro_norm` espelha
`nucleo-geo.util.ts::normalizeVia` — se mudar lá, mudar `transformar-cnefe.py` junto.

`cnefe_uf(uf, status, zip_bytes, linhas, baixado_em, carregado_em, erro)` — controle do
agendador.

### Agregados de PORTA — `agregados.sql` (09/08/2026)

`carregar-uf.sh` enche `cnefe_endereco`, que é indexada por CEP. Quem cadastra sem CEP
(metade da base real do dono) só chegava ao pino adivinhando o CEP no ViaCEP. Rode
**depois da carga**:

```
psql "$CNEFE_DATABASE_URL" -f backend/scripts/cnefe/agregados.sql
```

Ele cria as tabelas que o backend consulta pra achar a porta por **município + rua +
número**, sem CEP nenhum: `cnefe_mun_map(uf, city_norm) → cod_municipio` e
`cnefe_porta(cod_municipio, via_canon, numero, loc_norm)` (+ `cnefe_porta_any`,
`cnefe_via`, `cnefe_bairro`, `cnefe_mun`, usados pelo enriquecimento da RFB).

Sem estas tabelas o backend **não quebra**: `resolverCnefePorta` pergunta uma vez por
`to_regclass`, avisa no log e segue pelo caminho do CEP. Medido na company 41: dos 91
clientes sem pino, 18 curavam pelo CEP e **56** curam pela porta direta.

`via_canon` tem duas pontas — `canon_via(norm_via(x))` aqui e `canonVia()` no backend
(`nucleo/cnefe-resolver.util.ts`). Mudou uma, muda a outra no MESMO commit.

## Referência de carga (SP, 26/07/2026)

Ver relatório da frente: ~26M linhas, zip 1,0 GB, carga noturna sem derrubar produção.
