# LOGÍSTICA-MOBILE M5 — Regras do admin — RESULTADO

> Executado 05/07 no **master** (base `64b65f6e` — M4). NÃO publicado. Migration NÃO
> aplicada em banco vivo (padrão N1 — o dono aplica no deploy). `git add` por caminho.

## O que entrou

### Backend
- **`GET /logistica/config`** (JwtAuthGuard) — lê a `LogisticaConfig` da empresa;
  **cria o default** (defaults do schema) se ainda não existir. company-scoped.
- **`PATCH /logistica/config`** (JwtAuthGuard + **RolesGuard + `@Admin()`** — ADMIN-only)
  — PATCH parcial: `avisoWhatsEnabled`, `templateAviso`, `raioChegadaM`,
  `velocidadeMediaKmH`, `tempoParadaMin`, `cobrancaNaEntrega`, `moduloFinanceiroAtivo`,
  `moduloRecoveryAtivo`, `gerarDiaAutomatico`. Números clampados; template ≤ 1000 chars
  (vazio → `null` = volta ao fallback). Upsert por `@@unique([companyId])`.
- **`GET /logistica/cliente/:id/aviso`** (JwtAuthGuard) — lê o toggle do cliente.
- **`PATCH /logistica/cliente/:id/aviso`** (**ADMIN-only**) `{ avisar }` — grava
  `CustomerProfile.avisarEntrega`. company-scoped (o cliente TEM de ser da empresa).
- **Novo serviço** `LogisticaConfigService` (CRUD da config + resolução do aviso +
  o render puro). Registrado/exportado no `LogisticaModule`.
- **Render no confirmar (N6):** `dispararWhatsappEntregue` agora
  1) **resolve os 2 níveis de aviso** (`resolverAviso`): só dispara se
     `LogisticaConfig.avisoWhatsEnabled` **E** `cliente.avisarEntrega` — senão **no-op**;
  2) usa **`LogisticaConfig.templateAviso`** renderizado (ou a **msg fixa de fallback**
     antiga quando não há template);
  3) monta as variáveis a partir dos `EntregaItem` (entregues → fallback previstos) +
     legado escalar. **Caminho blindado (`queueOutboundForCompany`), flag
     `HBX_LOGISTICA_ENABLED` e a ausência de retry/loop ficaram INTOCADOS.**

### Como o template renderiza (`renderTemplateAviso` — função PURA)
Substitui `{saudacao} {cliente} {itens} {qtd} {produto}`:
- `{saudacao}` = **por horário LOCAL** (`saudacaoPorHorario`): 5–11h **Bom dia**,
  12–17h **Boa tarde**, senão **Boa noite** (fronteiras 5/12/18 provadas em teste);
- variável ausente → `""` (nunca deixa `{produto}` cru); `{chave}` desconhecida é
  **removida**; limpa espaço duplo e espaço órfão antes de pontuação;
- determinística (mesmas vars + mesmo `now` = mesma saída) → dá pra provar por teste.

Exemplo (`itens="2× Galão 20L, 1× Água com gás"`, `qtd=3`, `produto="Galão 20L"`, manhã):
`"{saudacao} {cliente}! Foram entregues {itens} (total {qtd}× de {produto})."`
→ `"Bom dia Dona Maria! Foram entregues 2× Galão 20L, 1× Água com gás (total 3× de Galão 20L)."`

### Os 2 níveis de toggle (regra dura do sprint)
- **Global** (`LogisticaConfig.avisoWhatsEnabled`, default `true`) — editor nas Regras.
- **Por cliente** (`CustomerProfile.avisarEntrega`, default `true`) — toggle na ficha.
- O N6 **só avisa quando AMBOS true**. Qualquer um OFF → **não dispara** (no-op). A
  **cobrança é INDEPENDENTE** do aviso (segue lançando). Fallback seguro: se ler a
  config falhar, mantém o comportamento atual (avisa, msg fixa).

### Frontend
- **Rota admin** `/(app)/logistica/config` (`page.tsx` + `page.client.tsx`): editor do
  `templateAviso` (textarea + botões que inserem `{variável}` no cursor) com **PREVIEW
  AO VIVO** (mesma lógica de render do backend, dados de exemplo), toggles (avisar global,
  cobrança na entrega, gerar dia automático) e campos raio de chegada / velocidade média /
  tempo de parada. **ADMIN-only** (não-admin vê "acesso restrito").
- Botão **"Regras"** no cabeçalho da tela de Logística (só admin) → leva pra `/logistica/config`.
- **Toggle "Avisar no WhatsApp quando entregar" por cliente** no drawer "Produtos do
  cliente" (aba Contatos → Clientes → Produtos): reusa o drawer do M2, carrega/gera pelo
  `GET/PATCH /logistica/cliente/:id/aviso` (otimista, reverte no erro).
- CSS novo `.log-cfg-*` + `.cli-prod__aviso` em `screens.css` — **zero hex/inline**, só
  tokens (`color-mix`, `var(--…)`).

## Migração (à mão, N1 — NÃO aplicada em banco vivo)
`backend/prisma/migrations/20260705050000_cliente_avisar_entrega/migration.sql`:
```sql
ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "avisarEntrega" BOOLEAN NOT NULL DEFAULT true;
```
Aditivo, idempotente (`IF NOT EXISTS`), default `true` (mantém comportamento atual),
zero drop. Schema Prisma atualizado (`CustomerProfile.avisarEntrega Boolean @default(true)`).

## Checks (todos VERDES)
- `backend npm run build` — **verde** (tsc estrito).
- `npx prisma validate` — **verde**; `npx prisma generate` — **verde** (client com `avisarEntrega`).
- `backend node --test` logística — **verde**: 25/25 (suíte cheia) e 9/9 (service+config).
  Testes novos: render de TODAS as variáveis + saudação/fronteiras + placeholder ausente/
  desconhecido; e `confirmarEntrega` **flag ON mas aviso OFF → NÃO chama
  `queueOutboundForCompany`** (mock, expect não-chamado) com a cobrança seguindo.
- `frontend npx tsc --noEmit` — **verde**.
- `frontend build (next)` — **verde** (exit 0); rota `/logistica/config` no manifest.
- `check-pele` — **0 violação NOS MEUS ARQUIVOS**. (O script reprova por R1 pré-existentes
  em arquivos que o dono mexe em paralelo — `whatsapp.css`, `bot-builder.css`,
  `screens.css:1563/1578` — **nada meu**; meu CSS e TSX = 0 literal de cor, catraca intocada.)

## Decisões p/ o dono
1. **`avisarEntrega` por cliente ficou no domínio Logística** (`GET/PATCH
   /logistica/cliente/:id/aviso`), **não** no `PATCH /nucleo/contas` — pra M5 não tocar o
   DTO/serviço do Núcleo que você edita no M6 (forma de pagamento). Se preferir unificar na
   ficha do cliente do M6, é 1 linha migrar.
2. **`PATCH` da config e do aviso = ADMIN-only** (RolesGuard+`@Admin()`); **GET fica
   JWT** porque o app do entregador também lê a config (raio/velocidade/ETA). Ok?
3. **Preview usa a MESMA regra de render do backend** (copiada em TS no client). Se um dia
   virar componente único, dá pra extrair — hoje são 2 cópias pequenas e testadas.
4. Migration e ativação **seguem OFF** — nada dispara sem `HBX_LOGISTICA_ENABLED` + os 2
   toggles. Aplicar a migration no deploy antes de ligar.
