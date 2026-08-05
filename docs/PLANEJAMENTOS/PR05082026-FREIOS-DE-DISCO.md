# PR05082026 — FREIOS DE DISCO DA VPS

> **Por que este documento existe.** Em 05/08/2026 a VPS de produção estava com
> **162 GB de 194 GB (84%)** e ninguém sabia. O dono descobriu por acaso, num
> brainstorm sobre outro assunto. A faxina resolveu o sintoma (disco voltou a
> ~61%); este documento é o **freio**, porque a regra da casa é
> *"bug que gera X → a correção é o FREIO, nunca tapar o sintoma da vez"*.
> Faxina sem freio é sintoma tapado: em 3 meses enche de novo.

---

## 0. A pergunta certa: por que ninguém gritou com o disco em 84%?

Levantada na revisão — e vale mais que o conserto. A resposta, com evidência:

**Não existia vigia de disco. Nenhum.** Conferido em `origin/master`:

| Evidência | Resultado |
|---|---|
| Watchers 24/7 no backend | **2**: `master-watch.service.ts` (chip caído, cobrança travada, fábrica parada, estado comercial) e `ai-pressure-watch.service.ts` (pressão da IA) |
| `git grep -E "statfs\|df -h\|diskUsage" origin/master -- backend/src/` | **vazio** — nenhuma linha do backend lia disco |
| Rotas de alerta cadastradas | 9, nenhuma sobre host/disco/memória |

**E a causa raiz é mais interessante que "faltou código".** O disco *era* medido — em
`ops-control/server.js` (`parseDisk`, `df -hP /`, `free -m`). Só que:

1. o Ops Control **não roda na VPS** (conferido: nenhum container, nenhuma unit) —
   ele roda no PC do dono e fala por SSH;
2. ele **não tem limiar nenhum**: nem 80%, nem 90%, nem 95%. Ele *mostra* `84%`
   como texto, sem julgamento.

Ou seja: **a informação existia e ninguém estava do outro lado.** Painel não é
alarme — dado que precisa de alguém olhando pra ser visto não avisa ninguém. A
casa tinha vigia 24/7 pra chip caído e pra IA lenta, mas nada para o recurso
mais finito da máquina, que é o único que, ao acabar, **para o Postgres de
escrever**.

Por isso o FREIO 1 não é um sistema de monitoramento novo: é o sinal que faltava,
pendurado no vigia e no canal de entrega que **já existiam** (`MasterAlertService.routeEvent`
→ e-mail + WhatsApp + sino + `MasterEvent`). Um lugar só.

---

## 1. O que já está PRONTO e LIGADO (sem gate)

| Freio | Mora em | Teto | Como o dono vê que funcionou |
|---|---|---|---|
| **Alarme de disco/RAM/swap** | `backend/src/master-alert/host-disk-watch.service.ts` | avisa 80%, grita 90% | Sino no `/master` + e-mail; a 90% entra WhatsApp. Log do boot: `vigia-de-disco LIGADO` |
| **Faxina no publish** | `scripts/lib/vps-disk-guard.js` (usado pelos 2 deploys) | cache de build ≤ **15 GB**; imagens órfãs > 48h | Saída do publish: bloco `[faxina] ANTES/DEPOIS` com `df` e `docker system df` |
| **Zips da RFB** | `backend/scripts/lib/rfb-disk-guard.js` (chamado pelo importador) | `HBX_RFB_KEEP_MONTHS` = **0 meses** | Log do job: `[freio-disco] apagado .../2026-08 — N arquivo(s), X GB` |
| **Zip do CNEFE** | `backend/scripts/cnefe/carregar-uf.sh` §6 | 1 zip por UF, apagado após aceite | Log da carga: `[freio-disco] apagado .../35_SP.zip` |
| **Guarda de espaço da RFB** | `scripts/rfb-monthly-update.sh` | aborta com < **45 GB** livres | Log: `espaço ok: 77 GB livres` ou `ABORTADO` |
| **Retenção de backups** | `scripts/ops/vps-retention.js` | teto por categoria; **dry-run é o default** | `npm run retencao:vps` mostra o que sairia |

**Todos os freios que apagam algo são condicionados ao SUCESSO** e **logam o que
removeram, com tamanho**. Nenhum toca em volume, banco, container ou dockerd.

### ⚠️ Armadilha pega na revisão do próprio freio: "aceite" que não reprova

A primeira versão do freio da RFB apagava os zips *"depois do `verifyAcceptance()`"*.
Conferindo linha por linha: **aquele aceite tem ZERO `throw`.** Ele mede e loga
(`OK <500ms`, `ATENCAO <7`) e segue em frente de qualquer jeito. Uma carga que
produzisse 0 empresa passaria batido — e o freio apagaria os 7 GB de fonte em
cima de uma base vazia. **A armadilha do CNEFE quase entrou junto com o conserto.**

Conserto: quem decide apagar não é log, é **número**. `evaluateLoadHealth()`
(`backend/scripts/lib/rfb-disk-guard.js`) exige as duas coisas — fases do ledger
concluídas **e** a tabela final acima de `HBX_RFB_MIN_COMPANIES` (default 20M;
medido na VPS: 28.438.116). E **"não consegui conferir" nunca é "está tudo bem"**:
banco fora do ar mantém os zips. Guardar 7 GB é barato; perder a fonte de uma
carga quebrada custa uma re-importação inteira.

**Lei que fica:** *aceite que só loga não é aceite — freio que depende dele está
solto.*

---

## 2. GATE DO DONO Nº 1 — GC nativa do BuildKit (`/etc/docker/daemon.json`)

### Por que seria melhor que o freio do publish
O freio do publish limpa **depois** de sujar. A GC do BuildKit é **contínua**: o
daemon nunca deixa o cache passar do teto, mesmo em build manual, build de outro
projeto ou build que falhou no meio (justamente o que mais deixa lixo).

### Por que NÃO foi aplicada
**Editar `daemon.json` exige `systemctl restart docker`, e isso derruba TODOS os
containers de produção ao mesmo tempo** — backend, frontend, postgres, os 21
motores, o OSRM. É uma janela de indisponibilidade real. Freio que não exige
restart do daemon vem primeiro; este fica pra uma janela escolhida pelo dono.

### O arquivo hoje
Não existe: `cat /etc/docker/daemon.json` → *No such file or directory*. Ou seja,
tudo hoje é default.

### A proposta (aplicar SÓ em janela combinada)
```jsonc
{
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "15GB",
      "policy": [
        { "keepStorage": "2GB",  "filter": ["unused-for=168h"] },
        { "keepStorage": "15GB", "all": true }
      ]
    }
  },
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
```

**O `log-opts` é o item mais subestimado daqui.** Sem ele, o log de container
Docker **não tem teto nenhum** — cresce até o disco acabar. Com 30 containers
(medido em 05/08), o teto passa a ser 30 × 3 × 50 MB = **4,5 GB no pior caso**,
em vez de infinito. O `logrotate` do sistema **não** cobre log de container.

### Passo a passo do dia
```bash
# 1. backup do que existe (mesmo que não exista)
cp /etc/docker/daemon.json /etc/docker/daemon.json.bak 2>/dev/null || true
# 2. escrever o JSON acima
# 3. VALIDAR o JSON antes de reiniciar (JSON inválido = dockerd NÃO SOBE)
python3 -c "import json;json.load(open('/etc/docker/daemon.json'));print('JSON ok')"
# 4. janela de indisponibilidade — aqui TUDO cai e volta
systemctl restart docker
# 5. conferir que voltou inteiro
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -fsS http://127.0.0.1:3000/health && curl -fsS http://127.0.0.1:3001/ >/dev/null && echo "backend+frontend ok"
```

⚠️ **JSON inválido no `daemon.json` impede o `dockerd` de subir.** O passo 3 não
é opcional. Se o daemon não subir: `mv /etc/docker/daemon.json.bak /etc/docker/daemon.json`
(ou apagar o arquivo) e `systemctl restart docker`.

⚠️ **Achado de 05/08:** a VPS usa o **legacy builder** (o plugin `buildx` não está
instalado — `docker buildx version` não responde). O `docker system df` ainda
reporta `Build Cache` porque o BuildKit **embutido no daemon** é o que o
`docker compose build` usa, e é ele que a chave `builder.gc` configura. Ou seja:
a proposta vale. Mas por causa disso vale confirmar depois do restart que a
política pegou: `docker info | grep -iA3 "buildkit\|gc"`.

---

## 3. GATE DO DONO Nº 2 — o que não deveria estar no disco da VPS

### Premissa que MUDOU (bom): a credencial de object storage já existe
O briefing supunha que o dono ainda não tinha object storage. **Tem.** O
`.env.local` da raiz já traz `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` e `R2_API_TOKEN`, e o R2 já
está **em produção** servindo o mapa (`https://mapa.hbxsystem.com.br`, HTTP 206
em Range request, conferido em 05/08). Cloudflare R2: 10 GB grátis permanente e
**egress $0** — é o egress que ganha do S3 aqui, porque tile de mapa é lido pelo
celular de cada entregador, todo dia.

### Os candidatos, em ordem de retorno

| # | Item | Hoje | Quem lê | Migrar? |
|---|---|---|---|---|
| 1 | **`CnpjPublicCompany`** (base RFB) | **61 GB** de 67 GB do banco | Radar, via SQL com índice | **SIM, mas não como arquivo** — ver abaixo |
| 2 | **Banco `cnefe`** | 4,3 GB | resolução de endereço | Mesma tese do nº 1 |
| 3 | **Zip do CNEFE** (`35_SP.zip`) | 1,03 GB | ninguém (já importado) | **Já resolvido** pelo freio no `carregar-uf.sh` |
| 4 | **Zips da RFB** | 0 GB agora, **+7 GB/mês** | ninguém (já importado) | **Já resolvido** pelo freio no importador |
| 5 | **PMTiles do mapa** | **0 GB na VPS** | app do entregador | **JÁ ESTÁ NO R2** — ver §4 |
| 6 | **`/root/osrm`** | 5,8 GB | `hbx-osrm` **em runtime** | **NÃO. Ver o alerta abaixo.** |

### ⚠️ Correção de escopo: o OSRM NÃO é candidato
O briefing listava `.osm.pbf` (814 MB) como candidato a migrar. **Esse arquivo já
não existe na VPS** (`find / -name '*.osm.pbf'` → vazio): quem o baixou já o
apagou. O que resta em `/root/osrm` são os **artefatos compilados**
(`sudeste-latest.osrm.*`, 5,8 GB), e o container `hbx-osrm` monta
`/root/osrm → /data` e **lê esses arquivos em runtime**. É dado **quente**, não
frio. Mandar pra object storage quebraria o roteador. **Deixar como está.**

### O item nº 1 é o prêmio grande — e a casa já tem o padrão
**61 GB dos 194 GB do disco são uma cópia do dump público da Receita Federal** —
dado frio, imutável entre rodadas mensais e 100% reconstruível. É quase 1/3 do
disco de produção.

Object storage não serve pra isso *como arquivo bruto* (o Radar precisa de query
por cidade+CNAE, não de download). **Mas o padrão certo já roda nesta casa:**
`backend/src/comex/comex-data.service.ts` lê **Parquet com DuckDB**
(`@duckdb/node-api`, `read_parquet`) e o Parquet do COMEX já entra no backend por
mount read-only. DuckDB lê Parquet **direto do R2** via `httpfs`, com pushdown de
predicado — ou seja, a query por cidade lê só os row groups daquela cidade.

**Ordem de retorno sugerida (proposta, não decidida):**
1. **Medir antes de mover** — `pg_relation_size` vs `pg_indexes_size` do
   `CnpjPublicCompany`. 61 GB para 28M linhas é ~2,2 KB/linha, alto demais: parte
   disso é o índice GIN de trigram em `searchText` e provavelmente bloat de
   autovacuum (`scale_factor` default 0,2 numa tabela de 28M linhas nunca dispara
   direito). **Um `VACUUM FULL`/reindex pode devolver dezenas de GB sem migrar
   nada** — e é reversível. *Não medi porque outro trabalho estava mexendo no
   Postgres no mesmo momento; ficou pendente.*
2. **Se depois de vacuum ainda for grande:** exportar a RFB pra Parquet
   particionado por UF no R2 e ler com DuckDB, no molde do COMEX. Ganho estimado:
   **~50 GB de disco** (Parquet com compressão colunar costuma dar 5-10× sobre
   heap+índice do Postgres) + backup de produção deixa de carregar a RFB.
3. **Banco `cnefe` (4,3 GB):** mesma tese, prioridade menor.

**Banda economizada:** nos itens 1-4, ~zero (é dado que ninguém baixa; o ganho é
disco). O ganho de **banda** está no PMTiles — e ele já está resolvido.

---

## 4. PMTiles — a decisão já está CERTA. O recado é PROTEGER, não decidir

A missão pedia alertar o dono antes que os PMTiles nascessem na VPS. **A frente
do mapa já escolheu certo**: `docs/PLANEJAMENTOS/PR05082026-MAPA-PMTILES.md`
crava *"Onde mora o arquivo: Cloudflare R2 — NUNCA o VPS dele"*, e a F1 já
entregou `brasil.pmtiles` (**3.021.173.073 B**) em
`https://mapa.hbxsystem.com.br/brasil-20260804.pmtiles`. Conferido em 05/08:
`find / -name '*.pmtiles'` na VPS → **vazio**. Nada de mapa no disco de produção.

**Se tivesse nascido na VPS**, o custo seria duplo:
- **disco:** 3,02 GB (e 6,01 GB se algum dia entrar o z15, já registrado no plano);
- **banda:** cada abertura de mapa no celular de cada entregador puxaria Range
  requests da VPS. Pela medida da própria F2, um recorte de 60 km custa **23 MB em
  63 requisições**. Com 10 entregadores baixando 1 recorte/dia, são ~7 GB/mês de
  egress saindo da VPS — que também serve o banco de produção.

### O que PROTEGER daqui pra frente (é isto que vale o recado ao dono)
1. **A regra "mapa não mora na VPS" precisa valer para as fases que faltam.** A F4
   ainda vai reescrever `MapaOffline.kt`. Se em algum momento aparecer um "cache
   intermediário no servidor" ou um proxy do PMTiles pelo nginx da VPS, o ganho de
   banda morre — o egress volta a passar pela VPS. **O celular deve falar direto
   com o R2.**
2. **O alarme de disco agora cobre esse risco.** Se algum arquivo grande de mapa
   aparecer em `/root/hbx-data`, o vigia lista a pasta entre as causas do alarme.
3. **Cota do R2:** o Brasil ocupa 3,02 GB dos 10 GB grátis (30%). Com z15 seriam
   6,01 GB (60%). O plano já registra isso; vale só não esquecer que **cada versão
   nova do arquivo soma** — `brasil-20260804.pmtiles` é `immutable` com cache de 1
   ano, então subir `brasil-20260904.pmtiles` sem apagar o anterior consome 3 GB a
   mais da cota. **Retenção no bucket também é retenção.**

---

## 5. Projeção honesta de crescimento

### Antes dos freios (o que aconteceu de fato, ~3 meses)
| Fonte | Crescimento |
|---|---|
| Cache de build Docker | 33,7 GB, sem teto |
| Imagens órfãs | 31,9 GB recuperáveis |
| Zips da RFB | +7 GB/mês, para sempre |
| Backups sem prazo | ~3 GB parados desde 02/05 |
| Journal/log | contido (já havia `SystemMaxUse=1G`) |
| **Total** | **~162 GB em 84%** — e sem nenhum aviso |

### Depois dos freios
| Fonte | Crescimento/mês | Por quê |
|---|---|---|
| Cache de build | **0** (teto fixo de 15 GB) | prune por teto em todo publish |
| Imagens órfãs | **0** (teto de 48h) | prune de dangling em todo publish |
| Zips da RFB | **0** | apagados após o aceite da carga |
| Zip do CNEFE | **0** | apagado após o aceite da carga |
| Backups ad-hoc | **~0** | teto por categoria no varredor |
| Log de container Docker | **sem teto ainda** | ⚠️ só o gate nº 1 resolve |
| **Banco (`CnpjPublicCompany`)** | **~1-3 GB/mês** | rodada mensal da RFB reescreve linhas; sem `VACUUM FULL` o espaço morto não volta |

**Resposta direta:** com estes freios, o disco passa a crescer **~1-3 GB/mês**, e
o crescimento vem quase todo de **um lugar só** — o inchaço do banco na rodada
mensal da RFB. Sai de "cresce até estourar, em silêncio" para "cresce devagar,
por um motivo conhecido, com aviso a 80%".

Com 76 GB livres hoje, isso dá **~2 anos de folga** — e o alarme avisa muito
antes. Os dois gates acima atacam o que sobrou: o log de container (sem teto) e o
banco (os 61 GB da RFB).

---

## 6. Pendências (não feitas, com dono)

| # | O quê | Por que não foi feito |
|---|---|---|
| 1 | Medir `pg_relation_size` vs `pg_indexes_size` do `CnpjPublicCompany` e avaliar `VACUUM FULL`/reindex | outro trabalho estava mexendo no Postgres no mesmo momento — a conexão foi terminada no meio da medição |
| 2 | Aplicar `daemon.json` (gate nº 1) | exige `systemctl restart docker` = derruba produção |
| 3 | Decidir a migração da RFB pra Parquet no R2 (gate nº 2) | decisão de arquitetura do dono; depende da medida nº 1 |
| 4 | Agendar `vps-retention.js --apply` semanalmente | havia outro trabalho avaliando quais backups podiam sair; ligar automatismo destrutivo no meio disso é o risco que a casa proíbe. Comando de agendamento no fim do próprio script |
| 5 | Retenção no bucket R2 (versões antigas do PMTiles) | ver §4.3 |
