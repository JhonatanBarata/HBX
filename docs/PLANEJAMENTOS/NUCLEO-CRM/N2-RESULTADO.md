# N2 — RESULTADO (ingestão no PULL: Conta+Contato a partir do CNPJ)

> Sprint N2 (o ÚLTIMO) do plano NÚCLEO-CRM. Executado 04/07 na branch `claude/nucleo-crm`.
> **NÃO publicado.** Aditivo, atrás de flag `HBX_NUCLEO_INGESTAO_ENABLED` **default OFF**.
> Objetivo: quando um lead da base 28M (RFB) é "puxado" pro Vendas, materializar a espinha
> Conta(PJ = o lugar) + Contato(dono = a pessoa) — sem tocar no refab "Buscar empresas" do dono.

## O choke certo — onde a ingestão FOI hookada (não é o `cnpj-base/pull` do plano)

O plano (seção 3a) supunha um `POST /webscraping/radar/cnpj-base/pull` que materializa `VendasLead`.
**Esse endpoint NÃO existe.** A base 28M tem:
- `POST /modules/owner/cnpj-base/query` (leitura pura, preview de contagem — `CnpjBaseController`);
- `POST /modules/owner/cnpj-base/materialize` — que NÃO cria `VendasLead`: joga o lead na **lagoa**
  (`RadarLeadPool`) via `LeadHarvestImportService.importBatchForUser`.

O **único choke** onde um lead da lagoa vira `VendasLead` (o "puxar") é:

> **`backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts` → `importRadarLeadToVendasForUser(...)`**

Todo caminho de pull passa por ele: `POST /webscraping/radar/pull-to-vendas` →
`pullRadarLeadsToVendasForUser` → `importRadarLeadToVendasForUser` (linha ~3175); a sync de
run e as notificações do sino também. Ele retorna `vendasLeadId`. **É lá que o hook ficou.**

### Onde ficou o hook (arquivo:linha)
- **Chamada do hook:** `radar-core-delivery.mixin.ts`, logo após `this.enqueueRadarPostDeliveryAiSaneamento(leadRow)`
  e ANTES do `return { ok: true, ... }` de `importRadarLeadToVendasForUser` (~linha 3808):
  `void this.materializeNucleoFromRadarLead(context.companyId, leadRow);` (fire-and-forget).
- **Gate da flag:** o método privado `materializeNucleoFromRadarLead(companyId, leadRow)` (mesmo arquivo,
  logo abaixo do choke) faz `if (!nucleoIngestaoEnabled()) return Promise.resolve();` ANTES de qualquer
  I/O. A verdade da flag mora em `backend/src/nucleo/nucleo-ingestao.ts` (`HBX_NUCLEO_INGESTAO_ENABLED`).
- **Serviço da espinha:** getter lazy `getNucleoCadastro()` em
  `backend/src/webscraping/radar/radar-webscraping-core.service.ts` → `new NucleoCadastroService(this.prisma)`
  (mesmo padrão de `getRadarPostDeliveryAiSaneamento`; **NÃO** entrou no construtor porque o `super()` de
  `webscraping.service.ts` é posicional — mexer nele quebraria a cadeia).
- **Lógica pura/testável:** `backend/src/nucleo/nucleo-ingestao.ts` — `materializeNucleoFromRadarLead(deps, companyId, row)`.

### Por que hookado E não só call-ready
O choke `importRadarLeadToVendasForUser` **NÃO é um arquivo que o dono está editando** (o refab dele é o
FRONT `buscar-empresas.tsx` + `vendas/page.client.tsx`, e o back `cnpj-base-query.service.ts`/controller —
nenhum tocado aqui). Então dava pra hookar de verdade, atrás da flag OFF, sem risco de colisão. Com a
flag OFF o comportamento do pull é **byte-a-byte o de hoje** (o `if` sai antes de instanciar serviço).

## Como o CNPJ é recuperado (RadarLeadPool NÃO tem coluna cnpj)
O `materialize` da Base Receita grava o CNPJ em 2 lugares do pool row, e a ingestão lê deles (em ordem):
1. `sourceUrl` = `internal://cnpj-base/<cnpj>` (regex);
2. `evidenceJson` = `{ evidence: { cnpj } }` (ou `{ cnpj }`);
3. `metadataJson.cnpj` (fallback).
Lead **web** (Google/scraping) não tem CNPJ → a ingestão é **no-op** pra ele (`skipped: no_cnpj`) — por design.

## O que a ingestão faz (flag ON)
- `nucleoCadastro.upsertContaFromCnpj({ companyId, cnpj, nome = nomeFantasia||razaoSocial||row.name,
  endereco/cidade/uf, isLead:true, origin:'radar' })` → **nome do LUGAR vira Conta**.
- Se a base RFB conhece o sócio (`ownerName` preenchido): `upsertContatoPrincipal({ nome: ownerName,
  cargo: ownerQualification, source:'cnpj_socio' })` → **nome do DONO vira Contato**. Sem dono conhecido,
  **não inventa pessoa** (Conta fica sem principal; N4 manual pode adicionar).
- Enriquecimento pela RFB é **opcional** (`loadCnpjPublic` só roda se `CnpjPublicCompany` existir no
  ambiente — `hasTable`); sem ela, usa nome/cidade/uf do próprio pool row.
- **Idempotente:** o serviço N1 faz acha-ou-cria por `(companyId, cnpj)` e principal único por conta —
  puxar o mesmo lead de novo NÃO duplica.
- **NUNCA quebra o pull:** a função engole o próprio erro (`status:'error'`) e o caller ainda faz
  `.catch(() => undefined)` — o `VendasLead` já foi entregue antes dela rodar.

## Backfill (opcional, INERTE por default — NÃO roda sozinho)
Não criei script novo de boot/cron. O caminho de backfill é **manual e reutiliza o mesmo helper**:
percorrer os `VendasLead`/`RadarLeadCompanyState` já entregues, carregar o `RadarLeadPool` de origem
(que carrega `sourceUrl`/`evidenceJson` com o CNPJ) e chamar `materializeNucleoFromRadarLead({ cadastro,
loadCnpjPublic, enabled:true }, companyId, poolRow)` por linha. Como é idempotente, pode rodar N vezes.
**Recomendação p/ o dono:** rodar só DEPOIS de validar a flag ON ao vivo em 1-2 pulls; um `scripts/`
dedicado pode nascer no próximo toque se ele quiser um comando único. (Deixei call-ready, não construí o
loop de boot pra não introduzir superfície automática nesta sprint.)

## Checks (todos VERDES)
- `npx prisma validate` → **valid** (N2 NÃO mexe no schema; usa o de N1).
- `npx tsc -p tsconfig.json` (build estrito) → **0 erro**.
- Teste (convenção `node:test` sobre `dist/`): `node --test dist/nucleo/nucleo-ingestao.test.js` →
  **10/10 pass**. Cobre o pedido: flag OFF → `upsertContaFromCnpj` **NÃO** chamado (0×); flag ON →
  chamado **1×**; + extração de CNPJ (url/evidence/web), Contato só com ownerName, no-op sem cnpj,
  nunca-lança, e idempotência de contrato (2 pulls → 2 upserts, dedup é no serviço).

## Arquivos
| Arquivo | Mudança |
|---|---|
| `backend/src/nucleo/nucleo-ingestao.ts` | **Novo.** Helper puro: flag `HBX_NUCLEO_INGESTAO_ENABLED`, `extractCnpjFromRadarLead`, `materializeNucleoFromRadarLead`. |
| `backend/src/nucleo/nucleo-ingestao.test.ts` | **Novo.** 10 testes (`node:test`). |
| `backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts` | Import do helper + `void this.materializeNucleoFromRadarLead(...)` no choke + método privado gate/loader. |
| `backend/src/webscraping/radar/radar-webscraping-core.service.ts` | Import `NucleoCadastroService` + getter lazy `getNucleoCadastro()` (sem tocar construtor/`super()`). |

## Decisões / pontos p/ o dono
1. **Hook no `importRadarLeadToVendasForUser`, não num "pull" novo.** O `cnpj-base/pull` do plano não
   existe; o pull real é `pull-to-vendas` → esse choke. Não inventei endpoint que brigasse com o refab.
2. **Só lead COM CNPJ materializa Conta.** Lead web = no-op (não tem CNPJ). Se você quiser que lead web
   também vire Conta(PJ sem cnpj / PF), é outra regra — hoje a espinha PJ nasce da base 28M.
3. **Contato só quando a RFB conhece o dono** (`ownerName`). Sem sócio identificado, a Conta fica sem
   Contato principal (não fabrico nome). Confirmar se prefere um Contato "placeholder" nesses casos.
4. **Flag default OFF.** Ligar em prod só depois de: (a) aplicar as migrations de N1 (Conta/Contato) no
   Postgres, (b) 1-2 pulls de teste com a flag ON, (c) rodar o backfill manual se quiser preencher o
   histórico. Enquanto OFF, pull idêntico ao de hoje.
5. **Sem backfill automático** (nada em boot/cron) — call-ready manual, idempotente. Peço OK antes de
   escrever um `scripts/` dedicado, se você quiser um comando único.
