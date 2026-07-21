# PR20072026 — MOTOR ÚNICO DE AUTOMAÇÃO

> Funde `/bot` + `/automacoes` + `/assistente` em **1 módulo** (casca e motor), no padrão
> Intercom/HubSpot/ManyChat/Blip/CNPJ Biz. Autorizado pelo dono em 20/07: **destrutivo permitido**
> (sem clientes usando WhatsApp agora), backup completo em `Desktop\Backup 20-07 alteracaomotor`
> (commit base `127b9166`). Publish é do DONO, 1 vez, no final.

## Os 2 focos (ordem do dono)

**FOCO 1 — Paridade de mercado.** O produto final é o que Intercom/HubSpot/ManyChat/Blip/CNPJ Biz
têm: UMA superfície de automação, entrada por OBJETIVO, IA como ingrediente (não como produto
separado), painel único de status, handoff bot→humano explícito. Se o difícil é o que o mercado
tem, será ele.

**FOCO 2 — Fusão dos motores backend.** Salvar o que funciona perfeitamente, descartar o inútil.
Motor único não significa reescrever tudo: significa UMA espinha (router de inbound, scheduler de
outbound, regras de evento, config de agente) com os executores bons de hoje pendurados nela.

## Diagnóstico (por que fundir)

Hoje são **3 embalagens para 5 motores**, com sobreposição real provada no código:

| Embalagem | Gate | O que esconde |
|---|---|---|
| `/bot` | módulo `bot` | Bot menu (Atendimento) + Bot cobrança (Recovery) + painel do motor de prospecção (`/vendas/automation`) |
| `/automacoes` | módulo `vendas` | Cadências + Gatilhos + Rotinas (domínio `cadencia`) |
| `/assistente` | módulo `bot` | Substituto com IA do bot de Atendimento |

Provas de que é o mesmo domínio:
- `messaging.service.ts:10040-10169` — todo inbound humano passa pelos 3 em fila:
  `interruptForInbound` → `dispatchCadenciaInbound` (gatilhos) → `conversationAssistant.prepareReply`
  (IA; se publicado, **cala o bot**) → `handleAtendimentoInbound` (menu/recovery).
- `cadencia.service.ts:635` — passo WhatsApp da cadência sai com
  `sourceModule: 'vendas_prospeccao_bot'` (o motor da guia Prospecção do /bot).
- `shell.tsx:704-705` — `/bot` e `/assistente` usam a MESMA chave de módulo `bot`.

## Benchmark — o que copiar de cada player

| Player | O que copiar |
|---|---|
| **Intercom** | Fin (agente IA) é um NÓ dentro do Workflows; handoff bot→humano com contexto; "outcomes" medidos (resolvido/handoff) |
| **HubSpot** | 1 hub "Automations"; Sequences com auto-desinscrição quando o lead responde (nós JÁ temos: `interruptForInbound` — preservar como feature) |
| **ManyChat** | Builder de blocos WhatsApp; "AI Step" como bloco; templates prontos por objetivo |
| **Blip** | Roteador atendimento (bot responde → transborda pro humano do /atendimento); campanhas ativas separadas do reativo |
| **CNPJ Biz** | Combo prospecção B2B (dados CNPJ) + disparo + CRM + "Assistente IA no WhatsApp" — é o concorrente direto; nosso diferencial é ter Radar RFB próprio + atendimento no mesmo teto |

Síntese do alvo: **1 módulo "Automação"** com 4 portas por objetivo:
1. **Atender sozinho** (Atendente: cérebro Roteiro-de-botões OU IA — funde bot-atendimento + assistente)
2. **Cobrar quem deve** (Recovery reembalado)
3. **Buscar clientes** (Prospecção + Cadência fundidas: 1 disparador com ritmo/persona)
4. **Reagir e abastecer** (Gatilhos + Rotinas)
+ **Painel único de status** (o que está ligado, pré-voo do chip, teto do dia) — hoje há 3 sistemas
de liga/desliga sem visão conjunta (pino+chavinhas, `published`, `ativa`+runner).

## SALVAR (funciona — vira fundação, proibido quebrar)

- `queueOutboundForCompany` — ÚNICA porta de saída WhatsApp (disjuntor, teto, warmup). TUDO continua saindo por ela.
- `commercialContactControl.interruptForInbound` — inbound real invalida contatos comerciais (paridade HubSpot).
- Claim idempotente `ConversationAssistantRun` (1 inbound = 1 resposta, sem eco duplo).
- Precedência conversacional (IA > menu > recovery) — vira código EXPLÍCITO no router novo.
- Motor de prospecção `vendas-automation.service` (crédito, débito-ao-puxar, timing) — executor mantido, ganha orquestrador novo.
- Runner de cadência (`runDueSteps` com teto diário por empresa) — executor mantido.
- Sandbox do assistente (Ollama local, zero chip) — vira O teste único do Atendente.
- Fundação de IA do Concierge (guardas anti-injeção 10/10, bench 86/100) — vira o cliente Ollama
  ÚNICO de todos os cérebros (S05B); contexto isolado por papel (cliente final NUNCA vê dado interno).
- Pino de ativação master→cliente (`bot-activation`) + gates fail-closed de módulo.
- Guardrails WhatsApp (disjuntor, 1 número=1 conexão) — intocáveis, moram no Webwhats/messaging.

## DESCARTAR (inútil / duplicado — morre na Fase 4)

- 3 modos de montagem do /bot (Tabuleiro/Trilha/Bandeja) — gimmick triplo da MESMA lista de campos.
- Chat de teste FAKE do /bot (simulação hardcoded no front; o sandbox real do assistente o substitui).
- `BotOnboarding` (wizard duplicado — o wizard do assistente é melhor e vira o único).
- Telas `/bot`, `/automacoes`, `/assistente` (viram redirects pra `/automacao`).
- Duplicidade de config conversacional (BotConfig-atendimento × AssistenteConfig → `AutomationAgent`).
- Flags soltas por motor → família única `HBX_AUTOMATION_*` (mapa na S20).

## Regras de orquestração (como esta frente roda)

1. **1 worker (Sonnet) por sprint**, contrato = o `.md` da sprint. Worker NÃO decide escopo: executa o contrato.
2. **Ordem estrita** S01→S22 dentro de fase; fases em sequência. Orquestrador revisa o diff de CADA sprint antes de liberar a próxima (revisão adversarial nas marcadas ⚠). **A revisão FINAL (S21) é feita em FABLE** — ordem do dono 20/07: subir pro modelo mais forte pra auditar o diff acumulado inteiro antes do publish.
3. Cada sprint termina com **commit local** (`feat(automation): S{NN} — {resumo}`). NUNCA `git push`, NUNCA `npm run publish` — publish é do dono, 1 vez, após S22.
4. **Gates entre fases** (no fim de cada fase, orquestrador roda): `cd backend && npm run build` +
   testes da fase + `cd frontend && npm run lint && npm run build`. Vermelho = para tudo, conserta antes.
5. Flags novas nascem **OFF**. Runtime legado continua funcionando até a S10 flipar — e mesmo aí com fallback.
6. Migrations: ADITIVAS até S19. DDL destrutivo SÓ na S20, condicionado ao inventário da S02, com dump seletivo prévio (NUNCA dumpar `cnpj_public*`).
7. **Schema drift**: existe drift conhecido no `schema.prisma` sem migration (frente do dono, app entregador). Workers NÃO "consertam" drift alheio — migration focada só nas tabelas desta frente.

## Regra de produto: o agente é DA EMPRESA (decisão do dono 20/07)

**A configuração feita pelo Admin vale pra TODOS, forçado.** 1 agente por empresa (`companyId
@unique`), configurado por Admin/USERMASTER; vendedor HERDA e não configura nada — no máximo vê
read-only e testa no sandbox. É exatamente como o mercado faz (Intercom/HubSpot/ManyChat/Blip:
o bot/IA é do workspace, fala em nome da MARCA, num canal só; vendedor nunca tem "seu" bot de
atendimento — config por vendedor viraria bagunça de marca e risco de compliance). IA PESSOAL
por usuário só existe como copiloto INTERNO (nosso Concierge — outra frente, intocada).
Implementação: mesmo mecanismo `canManage` que a cadência já usa — S05 (PUT/publish exigem
canManage), S13 (UI: editor só Admin; vendedor read-only + sandbox).

## Guardrails duros (violation = parar a sprint)

- **`Webwhats/` é INTOCÁVEL** nesta frente. Nada de conexão/reconexão/pareamento de chip.
- Nenhum teste dispara WhatsApp real. Teste de envio = sandbox/unit/caracterização. Live só no QA final (S22), no VPS, chip descartável — jamais o chip do dono.
- Freios (disjuntor, teto, interrupt, claim) são FEATURES, não dívida — remoção proibida.
- Não tocar: crédito/carteira (LEI DO VENDEDOR), módulo financeiro, Concierge IA (`concierge` é outra frente).
- Frontend: 5 Leis do Design System — zero hex/inline solto; tudo em classe/token central; `check-pele` verde.

## Rollback

`Desktop\Backup 20-07 alteracaomotor\LEIA-ME-RESTAURACAO.txt`. Resumo: `git reset --hard 127b9166`
(ou cópia física por cima) + rebuild. Banco: nada a restaurar antes da S20; a S20 gera dump próprio.

## Mapa de sprints

| Fase | Sprint | Entrega | ⚠ |
|---|---|---|---|
| **F0 Rede de segurança** | S01 | Testes de caracterização do pipeline inbound | ⚠ |
| | S02 | Inventário de uso real (banco VPS + flags .env) | |
| | S03 | Contrato técnico do motor único (doc) | |
| **F1 Espinha backend** | S04 | Módulo `automation` + `GET /automation/overview` | |
| | S05 | `AgentService` — config unificada do Atendente (adapter) | |
| | S05B | Fundação IA única — cliente Ollama base Concierge (pedido do dono 20/07) | |
| | S06 | `InboundRouterService` — precedência extraída do messaging | ⚠ |
| | S07 | `OutboundOrchestratorService` — 1 scheduler, N executores | ⚠ |
| | S08 | `EventRuleService` — gatilhos generalizados | |
| **F2 Dados** | S09 | Schema `AutomationAgent` + backfill (aditivo) | ⚠ |
| | S10 | Runtime conversacional lê `AutomationAgent` (flag) | ⚠ |
| | S11 | Visão unificada dos "plays" proativos (adapter) | |
| **F3 Casca única** | S12 | Rota `/automacao`: hub por objetivo + painel de status | |
| | S13 | Seção Atendente (wizard único, 2 cérebros, 1 sandbox) | ⚠ |
| | S14 | Seção Cobrança (recovery) | |
| | S15 | Seção Prospecção & Cadência (fundidas) | |
| | S16 | Seção Gatilhos & Rotinas | |
| **F4 Demolição** | S17 | Sidebar 1 item + redirects + gate unificado | ⚠ |
| | S18 | Matar código morto do construtor antigo (front) | |
| | S19 | Matar telas/componentes/CSS órfãos | |
| | S20 | Backend: endpoints/flags/tabelas órfãs + DDL destrutivo | ⚠ |
| **F5 Fechamento** | S21 | Verde total + revisão adversarial do diff completo | ⚠ |
| | S22 | Docs/Rules + roteiro QA VPS + relatório final | |

## Decisões em aberto (dono bate o martelo — recomendação marcada)

1. **Nome do módulo na sidebar**: recomendo **"Automação"** (1 item, grupo Facilidades).
2. **Gate de acesso**: recomendo **manter as chaves `bot` e `vendas` com OR** (item aparece se a
   empresa tem qualquer uma; cada seção interna respeita seu gate). Zero migração de acesso, nenhuma
   empresa perde nada. Alternativa (chave nova `automation`) exige master religar empresa a empresa.
3. **Recovery entra na casca nova?** Recomendo **sim** (só reembalagem; motor intocado).
4. **Rotas velhas**: recomendo **redirect permanente** `/bot|/automacoes|/assistente → /automacao#secao`.
5. **E-mail de cadência (F1, flag OFF)**: recomendo **manter estrutura** (mercado é multicanal), flag continua OFF.
