# CODEX-GIGANTE-REBASE — Reconciliação da Sprint Gigante (Issue GitHub #1) vs estado atual

> Missão E da auditoria RELEASE-20X · 11/07/2026 · auditor só-leitura.
> Premissas fixas (decisões do dono, não re-abertas): app Android único; 2 tipos de conta
> (`credit` | `enterprise`); S8 commitado (`9fc053da`); freio comissão-fantasma publicado (`8a134730`).

## 1. O que consegui (e não consegui) da issue

- **Texto literal da issue #1: INACESSÍVEL.** `gh` não está instalado (verificado no shell) e
  `https://github.com/JhonatanBarata/HBX/issues/1` retorna 404 sem autenticação (repo privado).
- **Cópia local literal: NÃO EXISTE.** Grep por "issue #1"/"Sprint Gigante"/"Codex" em `docs/` e
  `*.md` da raiz não achou espelho da issue. O que existe é a **arqueologia da era Codex**
  (jun/2026), que delimita bem o escopo da frente — seção 2.
- Consequência honesta: a reconciliação abaixo é **por área temática** (o que se sabe da issue:
  plano, trial, billing, WhatsApp, telas do Master numa frente única, escrita ANTES das
  simplificações). Itens que só o texto literal pode cravar estão marcados UNKNOWN (seção 7).

## 2. Arqueologia — artefatos locais da era Codex (prova de escopo)

| Artefato | Onde está | O que é |
|---|---|---|
| `docs/05-06.md` (795 linhas) | só no git: `git show 2bf3d134:docs/05-06.md` (mergeado em `19e08644`, 06/06) | Plano de execução Codex em 14 PASSOS: governança de acesso por controlador, capacidade efetiva, guards desktop/mobile unificados, quota ativa de cards, dedupe por contato, tela de config, auditoria, testes, PR |
| Branches `codex/05-06-*` | merges `9323be42` (radar-quota), `0d6b5794` (dedupe), `da82b6d0` (access-governance), `19e08644` (plan-doc) — todas 06/06 | Os 3 P0 do plano implementados + o doc |
| `docs/CODEX_BOOTSTRAP_HBX_MASTER.md` (1857 linhas) + `docs/HBX_MASTER_CODEX_QUEUE.md` (1649 linhas, 28 blocos) | só no git: `a8115490` / `955948f1` (05–06/06); removidos do tree em `7fadf4ce` "separate hbx owner from master saas" (06/06) | Fila Codex do **HBX Master ops workspace** — Local Agent :3107, Git/PR panel, Deploy Control, Morning Desk. **NÃO é o /master SaaS**: essa frente virou o HBX Owner (:3107, vivo hoje) |

Leitura: a "frente única gigante" do Codex se partiu em 3 destinos já em junho — (a) os helpers P0
mergeados no backend, (b) o HBX Owner como produto separado, (c) o resto (plano/trial/billing/telas)
que ficou parado até o MASTER-REFAB v2 de 10/07 resolver por outro caminho.

## 3. Reconciliação por área

### Área A — Plano-como-produto (catálogo, módulos-por-plano, PlanModuleConfig) → **SUPERSEDED**
Morto pela decisão "2 tipos" (MASTER-REFAB `PLANO.md:8-19`): módulo é kill-switch por empresa
(SystemModule), não atributo de plano. Prova no código atual:
- `backend/src/modules/modules.controller.ts:505-518` — editor módulos-por-plano → `GoneException` (410).
- `backend/src/modules/modules.controller.ts:610-628` — trocar plano/degustação → 410.
- `frontend/src/app/(app)/master/janela-self-checkout.tsx` — **não existe** (S4 `e817802c`).
- Vitrine pública consertada lê `credits/public-catalog` (`frontend/src/lib/credits-storefront.ts`).

### Área B — Trial / degustação / extensão → **SUPERSEDED**
Ordem literal do dono ("morto em definitivo", `PLANO.md:36`; cortesia morreu no adendo S6 `PLANO.md:92-106`).
- `backend/src/modules/modules.controller.ts:661-666` — grant/end de trial → 410 (S7 `7aefddcf`).
- `backend/src/modules/modules.controller.ts:710-716` — cortesia (box da ficha) → 410.
- Restos de "trial" no front do master são só leitura legada intencional: `page.client.tsx:77`
  (`trial: "Legado: Trial"`) + comentários — dado nunca some, escrita nova bloqueada.

### Área C — Billing / cobrança / checkout → **SUPERSEDED no modelo, DONE no substituto**
O que a issue previa (refino de assinatura/checkout/plano) morreu; o substituto está no ar:
- Modelo crédito track-first publicado (`50696cfd`); packs/recargas centralizados no S2
  (`f13986e7`) — `janela-pagamentos.tsx` **não existe mais** (absorvida por `janela-creditos.tsx`, 867 linhas).
- Enterprise = mensalidade manual: `monthlyValueOverride`/manual-payment vivos em
  `backend/src/modules/modules.service.ts` e `master-cockpit.service.ts`; S8 fecha tudo num gesto
  (`POST master/company/:companyId/enterprise-contract`, `modules.controller.ts:735`, commit `9fc053da` — **LOCAL, não publicado**).
- Freio comissão-fantasma publicado: payable só com receita real `'paying'` (`8a134730`).
- Assinatura MP legada preservada só em leitura: bloco "Assinaturas legadas" no cockpit
  (`janela-cockpit.tsx:137,393-396`, renderiza só se `mrrTotal > 0`) — S5 (`278f98f2`) cumprido.
- `Company.accountType` no schema com default `'credit'` (`backend/prisma/schema.prisma:103`, S6 `21bbc5f4`).

### Área D — WhatsApp no Master → **DONE (em forma diferente da issue)** com 1 REMAINING herdado
- Painel de conexão unificado publicado (`9583b4c0`); chip do Master pra verificação de número
  existe e opera (`frontend/src/app/(app)/master/master-whatsapp-chip.tsx:1-122`, endpoints
  `/companies/master/whatsapp-modal/*`).
- Robustez do motor veio por outra frente: fix pairing code Business (`46b69549`), disjuntor de
  reconexão + "1 número = 1 conexão" (regras duras no CLAUDE.md).
- **REMAINING (fora das telas do master, domínio tenant):** painel "Equipe"
  (`frontend/src/app/(app)/configuracoes/page.client.tsx`, `gerencial/page.client.tsx`) ainda lê o
  banco do app, não o motor ao vivo (`/instance/connectionState`) — pendência já conhecida do
  domínio WHATSAPP, não resolvida por S1–S8 (nenhum dos commits toca esses arquivos).

### Área E — Telas do Master (refactor/UX) → **DONE nas 8 sprints** com REMAINING de decomposição
S1 `f593c756` (ficha montador) · S2 `f13986e7` · S3 `4533751b` (anti-scraper: teto diário +
throttle + MasterAlert, com migration e 208 linhas de teste) · S4 `e817802c` · S5 `278f98f2` ·
S6 `21bbc5f4` · S7 `7aefddcf` · S8 `9fc053da`. Inventário atual de `frontend/src/app/(app)/master/`:

| Arquivo | Bytes | Linhas | >50KB? |
|---|---|---|---|
| `janela-empresas.tsx` | 116.114 | 2.073 | **SIM — candidato nº1 a decomposição** |
| `janela-contabil.tsx` | 61.639 | 1.216 | **SIM — candidato nº2** |
| `janela-creditos.tsx` | 43.239 | 867 | não (borderline; monitorar) |
| `contabil-fechar-mes.tsx` | 42.486 | — | não |
| `janela-cockpit.tsx` | 28.545 | — | não |
| demais (emails, sistema, page.client, integracoes, tickets, online, whatsapp-chip) | ≤27.413 | — | não |

### Área F — Governança de acesso / quota / dedupe (núcleo do doc 05-06) → **DONE desde 06/06**
- `backend/src/access/seller-access-governance.ts` — usado de verdade em
  `backend/src/modules/modules.service.ts:56,2129,2165` (PASSOS 02/04 do plano).
- `backend/src/commercial-plans/seller-card-quota.util.ts` — usado em
  `commercial-usage-limits.service.ts` (PASSOS 05/06); S3 anti-scraper empilhou o teto por empresa em cima.
- `backend/src/vendas/commercial-contact-fingerprint.ts` — usado em `vendas.service.ts` (PASSO 07).
- Todos com teste unitário ao lado (`*.test.ts`).

### Área G — Capacidades granulares (`resolveEffectiveCapability`, 12 chaves) → **REMAINING transformado**
O modelo `Capability` do PASSO 03 **não existe** como especificado (grep por
`resolveEffectiveCapability`/`canAccessRadar` no backend+frontend: zero fora dos arquivos de
governança). O sistema atual decide por kill-switch de módulo + governança por controlador.
A necessidade real sobrevive como **RBAC nº5 (27 chaves)** — já na fila do dono (memória BACKEND).
Não reabrir como "voltar ao desenho Codex": o desenho novo (27 chaves) supersede as 12 capacidades.

### Área H — Auditoria de eventos (PASSO 09) → **DONE parcial / REMAINING (Cockpit nº8)**
`MasterEvent` existe (`backend/prisma/schema.prisma:1868`, `backend/src/common/master-event.ts`) e
é emitido por créditos/financeiro. O watcher/roteador de alertas (Cockpit nº8) está em snapshot
wip (`47764874`) — não concluído.

### REJECTED (conflita com decisão atual — não executar mesmo que a issue mande)
- Qualquer tela/endpoint novo de **catálogo de planos, trial, extensão, cortesia ou self-checkout
  público** (colide com S4/S6/S7 e as premissas 2 e 4).
- Qualquer fluxo que crie **comissão payable sem receita real** (colide com `8a134730`).
- App separado / applicationId diferente pra qualquer módulo (premissa 1: app Android único).

## 4. (a) Tarefas REMAINING reais — ordem de valor

1. **Decompor `janela-empresas.tsx` (116KB / 2.073 linhas).** Objetivo único: extrair ficha,
   wizard e carteira em componentes irmãos SEM mudança de comportamento. Arquivos permitidos:
   `frontend/src/app/(app)/master/janela-empresas.tsx` + novos `frontend/src/app/(app)/master/empresas/*.tsx`.
   Valor: é a tela mais crítica do master e cresce a cada sprint (S1, S6, S7, S8 tocaram nela).
2. **Painel "Equipe" ler o motor ao vivo.** Objetivo único: status de chip nas telas de equipe vem
   de `/instance/connectionState` (fonte única da verdade), não do banco. Arquivos permitidos:
   `frontend/src/app/(app)/configuracoes/page.client.tsx`, `frontend/src/app/(app)/gerencial/page.client.tsx`
   + endpoint de leitura já existente no backend (sem tocar Webwhats/).
3. **RBAC nº5 (27 chaves)** — já na fila do dono; substitui as 12 capacidades do desenho Codex (Área G).
4. **Decompor `janela-contabil.tsx` (62KB / 1.216 linhas)** — mesmo formato da tarefa 1.
5. **Cockpit nº8** (watcher/roteador de MasterEvent) — retomar do snapshot `47764874`.

Pré-requisito de release, não tarefa da issue: **publicar `9fc053da`** (S8 está só local; a issue
não pode ser fechada como "no ar" antes do publish do dono).

## 5. (b) Rascunho do comentário de fechamento da issue (colar no GitHub)

```markdown
## Reconciliação final — issue superada pelo MASTER-REFAB v2 (jul/2026)

Esta issue foi escrita antes das simplificações de produto. O modelo mudou por decisão de
negócio: **plano/trial/cortesia/self-checkout morreram**; ficaram só 2 tipos de conta —
`credit` (default, consome créditos) e `enterprise` (montada pelo master na ficha, mensalidade
manual). Fechando com o mapa do que cada frente desta issue virou:

**Implementado (equivalente moderno):**
- Governança de acesso por controlador, quota ativa de cards e dedupe por contato — mergeados
  ainda em junho: 9323be42, 0d6b5794, da82b6d0 (helpers + testes em `backend/src/access/`,
  `backend/src/commercial-plans/`, `backend/src/vendas/`).
- Refab completo do /master em 8 sprints (10/07):
  - S1 ficha montador f593c756 · S2 centro financeiro de créditos f13986e7
  - S3 guardrails anti-scraper 4533751b · S4 fim do self-checkout e817802c
  - S5 cockpit no modelo crédito 278f98f2 · S6 dois tipos explícitos de conta 21bbc5f4
  - S7 aposentadoria de plano/trial/cortesia (endpoints 410 Gone, dado preservado) 7aefddcf
  - S8 contrato empresarial num gesto 9fc053da
- Freio comissão-fantasma (payable só com receita real): 8a134730
- WhatsApp: painel de conexão unificado 9583b4c0 + chip do master pra verificação de número +
  fix pairing code 46b69549.

**Não será feito (decisão de produto):** telas/fluxos de catálogo de plano, trial, extensão,
cortesia e checkout público — o modelo de crédito track-first (50696cfd) os substitui.

**Sobrevive em issues próprias (escopo único cada):**
1. Decompor `janela-empresas.tsx` (116KB) em componentes.
2. Painel "Equipe" ler status de chip do motor ao vivo (connectionState), não do banco.
3. RBAC de 27 chaves (substitui o modelo de capacidades desta issue).
4. Decompor `janela-contabil.tsx` (62KB).
5. Cockpit: watcher/roteador de MasterEvent.

Fechando como **superada + concluída no equivalente moderno**.
```

(Links: prefixar hashes com `https://github.com/JhonatanBarata/HBX/commit/` se quiser clicável.)

## 6. (c) UNKNOWN — o que só o texto literal da issue crava

1. **Itens exclusivos da issue** que não deixaram rastro em docs/branches locais (ex.: alguma tela
   específica, integração, e-mail ou regra que só ela lista). O risco de buraco é BAIXO — as 5
   áreas conhecidas foram cobertas — mas não é zero.
2. **Critérios de aceite originais** (a issue pode ter checklist; sem ele, o comentário de
   fechamento acima não marca caixinhas).

**Pergunta exata ao dono:** "Cola aqui o corpo da issue #1 do GitHub (ou roda `winget install
GitHub.cli && gh auth login` que eu leio sozinho)? Preciso só pra cravar se ela lista algum item
fora destas 5 áreas: plano, trial, billing, WhatsApp, telas do master. O resto já está
reconciliado com prova de código."

## 7. Notas de auditoria (anti-falso-pendente)

- Todo achado acima tem prova em arquivo:linha ou commit citado; greps rodados no working tree de
  11/07 (inclui S8 local).
- `git status` do início da sessão listava `modules.controller.ts`/`modules.service.ts`/
  `janela-empresas.tsx` como modificados — era snapshot ANTERIOR ao commit `9fc053da`; o diff
  atual desses arquivos é vazio (S8 está integralmente commitado, nada solto).
- Working tree tem trabalho em progresso de OUTRAS frentes (entrega/financeiro tenant, W4/W5/W6
  do PR10072026) — não tocado, não é escopo desta missão.
- `janela-creditos.tsx` tem 43KB: abaixo do corte 50KB, mas absorveu Pagamentos no S2 — vigiar.
