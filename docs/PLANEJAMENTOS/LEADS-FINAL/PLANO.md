# LEADS-FINAL — Vendas/Leads: correção final da frente desktop

> Nascido do comparativo com o CNPJ Biz (06/07/2026, prints do dono). Objetivo: densidade
> de ferramenta profissional + página de lead completa + filtros que vendem crédito +
> cofre anti-scrape + copiloto IA — **sem virar plágio do Biz e sem furar as 5 Leis**.

## Princípio-mestre: a CASCA (ordem do dono, 06/07)

Todo o passe de densidade/estrutura vive no **ESQUELETO** (`typography.css`, `spacing.css`,
`skeleton.css`, `kit.css`, `screens.css`). **Pele NUNCA declara métrica estrutural**
(font-size, height, width de rail, row-height) — pele veste cor/borda/sombra/vidro.
Assim trocar tema continua sendo só trocar tokens, e a densidade nova vale pra TODAS as
peles de uma vez. O plano 01 grava isso em `docs/Rules/FRONTEND.md` e arma o fiscal.

Fatos medidos (06/07):
- `html{font-size:15px}` ([base.css:7]) → `--text-base` 0.88rem = **13,2px** (letra base já é pequena).
- O "gigante" vem do chrome: `--rail-width` 260px + `--context-width` 248px (+gaps) ≈ **530px de menu**;
  alturas gordas (`--control-height` 38 / `--field-height` 42); headings de landing dentro do app
  (`--text-h1` 2.4rem ≈ 36px).
- Peles instaladas: aurora/ember/rose/hbx-cyber ([theme-attributes.tsx:18]). `theme-future.css`
  está FORA do seletor e concentra 28 dos 30 `font-size:px` do tema → débito quase zero.
- Mascaramento de contato da vitrine já é **server-side**
  ([radar-core-presentation.mixin.ts:2442] zera phone/email quando `maskContact`).

## Ordem de execução (best judgement: impacto ÷ esforço, dependências)

| # | Plano | Entrega | Depende de |
|---|-------|---------|------------|
| 01 | [01-CASCA-DENSIDADE.md](01-CASCA-DENSIDADE.md) | Passe de densidade em token + sidebar colapsável + regra nova no FRONTEND.md | — |
| 02 | [02-LISTA-DENSA-E-PAGINA-LEAD.md](02-LISTA-DENSA-E-PAGINA-LEAD.md) | Lista em linhas (≥9 leads visíveis) + rota `/leads/[id]` com tabs Anotações/WhatsApp | 01 |
| 03 | [03-FILTROS-E-PESQUISAS-SALVAS.md](03-FILTROS-E-PESQUISAS-SALVAS.md) | Gaveta de filtros (6 que importam) + contagem grátis + pesquisas salvas | — (front final encaixa após 02) |
| 04 | [04-COFRE-DE-CREDITOS.md](04-COFRE-DE-CREDITOS.md) | Auditoria de vazamento no payload + confirmação explícita + teto/dia + alarme + flags | — |
| 05 | [05-COPILOTO-NO-LEAD.md](05-COPILOTO-NO-LEAD.md) | BOT/assistente exposto como Copiloto no lead (rascunho/resumo/próxima ação) | 02 |
| 06 | [06-EMAIL-V1.md](06-EMAIL-V1.md) | Conectar conta SMTP + enviar da timeline do lead (IMAP = v2) | 02 |

01 e 04 podem rodar em paralelo (front×backend). 03 backend pode começar junto; o front
da gaveta entra depois do 02 pra já nascer na lista densa.

## Estado (06/07, orquestração Opus)
- **01 CASCA — CONCLUÍDO** (local, não publicado). Verificado: build verde, lint 80 = baseline
  pré-existente (0 novos), check-pele verde, densidade confirmada ao vivo. Desvio bom do worker:
  os tokens não governavam o CSS real (valores hardcoded) → ele CONECTOU os seletores aos tokens.
  `theme-future.css` órfã deletada; fiscal R5 (`font-size:px` em pele reprova). ⚠️ `.test-login.local.md`
  deu 401 real (senha de teste pode ter mudado — dono conferir).
- **04 COFRE — Etapa 1 CONCLUÍDA** (local). Furo pull-gated fechado + teste, 137/137. Falta Etapa 2
  (front confirmação), Etapa 3 (teto/dia + alarme), Etapa 4 (flags, aguarda go do dono). Pré-publish:
  backfill `ownerCompanyId` legado.
- **02 — CONCLUÍDO** (local). Rota nova `/leads/[id]` (3 colunas, abas Anotações|WhatsApp glass-pill),
  lista densa em linhas (toggle Linhas|Cards), "ver mais" respeitando o pull-gate (não-puxado = aside
  mascarado + CTA Puxar; a própria página `/leads/[id]` é gate de posse contra acesso direto por URL).
  Reusou `DetalhesNegocio` + `ConversationPanel` (WhatsApp real embutido) + helpers de Vendas. Descoberta:
  prints foto2/3/4 = CONCORRENTE (Biz), não tela HBX → construído o nosso, sem plágio/legado.
  - **Correções minhas pós-worker (Opus):** (a) o worker introduziu 1 erro de lint (`set-state-in-effect`
    em `/leads/[id]`) e deu como "sem erros" — corrigido (IIFE async), eslint do arquivo limpo. (b) Aba
    Anotações ficou read-only porque faltava eventType neutro no backend → **adicionei `'note'`** ao
    `RadarLeadEventType` + DTO + `addRadarLeadEventForUser` (record-only: NÃO debita, NÃO muda status, NÃO
    reivindica posse — senão reabriria o vazamento do 04 via `companyState`; exige lead já possuído). Teste
    novo verde (138/137). Front: compose ligado no POST `event{eventType:'note'}` + refetch.
  - Pendência de verificação: banco local sem lead de Radar (total:0) → o happy-path da página cheia
    (lead possuído) não foi exercido com dado real; backend local não hot-reload no Windows, então
    salvar-nota ao vivo precisa de restart do backend. Recomendo teste manual do dono com lead real.
- **03 / 05 / 06 — na fila.** 03 (backend) e Etapa 3 do 04 serializados APÓS 02 (bottleneck de
  `schema.prisma` + cautela na frente financeira). 05/06 dependem de 02.

## Regras de execução (workers)

- 1 worker por `.md`; o `.md` some ao concluir. Trabalhar **direto na master**, commit
  local, **publicar só quando o dono mandar** (`npm run publish`).
- **Conferir `origin/master` antes de implementar** — a frente de créditos tem trabalho
  não-commitado no working tree (`credits-public.controller.ts`, `credits-storefront.ts`,
  cutover vitrine 06-07). Tree sujo não é perigo: merge 3-way por arquivo, **nunca
  reverter o que não criou**.
- Checks mínimos por plano estão em cada `.md`. Frontend: `cd frontend && npm run lint`
  (check-pele) + `npm run build` + zero-scroll no Chrome 100% (lei do FRONTEND.md).
- Nada de copiar tela/texto/nome do Biz — padrão de mercado sim, plágio não.

## Decisões abertas (dono)

1. **Flags de enforcement de crédito**: ligar já (plano 04 etapa 3) ou só depois do
   teto/dia + auditoria? Recomendação: auditoria+teto primeiro, flags na sequência.
2. **E-mail v1 só-envio** (SMTP, entrega rápida) resolve, ou precisa receber na timeline
   desde o início (IMAP, custo bem maior)? Recomendação: v1 só-envio.
3. **Sidebar colapsada por default** em telas <1600px, ou sempre expandida e o usuário
   colapsa? Recomendação: expandida por default, estado lembrado por usuário.
