# Arquitetura nº4 — Vendas/CRM — Plano de execução

> Origem: análise arquitetural de 01/07/2026 (sessão Arquitetura nº4), fatos re-auditados no código
> antes deste plano. Convenção da casa: 1 subagente por `.md` desta pasta; o `.md` some ao concluir.
> **EXCEÇÃO: SPRINT3 é frente financeira — Opus edita DIRETO + revisão obrigatória do diff (não delegar).**

## Ordem de execução

| Sprint | O quê | Prioridade | Esforço | Por quê ($) |
|---|---|---|---|---|
| [SPRINT1](ARQUITETURA04-VENDAS-CRM-SPRINT1.md) | Máquina de inbound ÚNICA (matar a cópia do messaging) | P0 | 1–2 dias | Freio anti-ban/opt-out mora em 2 lugares que JÁ divergiram; fix de compliance 2× = ban esperando data |
| [SPRINT2](ARQUITETURA04-VENDAS-CRM-SPRINT2.md) | Worker restart-safe (recovery de `sending` + claim atômico) | P0.5 | ~1 dia | `npm run publish` no meio do typing delay (8–20s) deixa job órfão HOJE; duplo envio = risco de ban |
| [SPRINT3](ARQUITETURA04-VENDAS-CRM-SPRINT3.md) | Comissões em módulo próprio (só movimentação) | P1 | 2–3 dias | Dinheiro do vendedor isolado de mudança de board; confiança do time |
| [SPRINT4](ARQUITETURA04-VENDAS-CRM-SPRINT4.md) | Estado opt-out/prospecção: JSON metadata → tabela tipada | P1 | ~2 dias | Opt-out auditável (LGPD) e indexável; mata parse manual em 3 módulos |
| [SPRINT5](ARQUITETURA04-VENDAS-CRM-SPRINT5.md) | Fachada + split por domínio + frontend | contínuo | oportunista | Velocidade de evolução; só quando já for tocar no domínio |

**SPRINT1 e SPRINT2 mexem no MESMO arquivo (`vendas-automation.service.ts`) — executar em SÉRIE,
nunca em paralelo.** Ordem recomendada: 1 → 2 (se o 1 travar em revisão, o 2 pode adiantar por ser
menor e não tocar a máquina de inbound).

## Regras comuns (valem para todos os sprints)

- **Backend é contrato**: nenhuma rota, payload ou regra de negócio muda. Refactor interno apenas.
- Migration destrutiva/dado destrutivo: PROIBIDO sem ordem explícita do dono (docs/Rules/BACKEND.md).
- Auth/autorização/secrets/env de produção: não tocar.
- WhatsApp: nada aqui conecta/reconecta chip. Se algum teste precisar de conexão viva → número
  descartável, NUNCA chip do dono (docs/Rules/WHATSAPP.md). Disjuntores e semântica de opt-out são
  intocáveis — mudança neles não é refactor, é decisão do dono.
- Checks mínimos por sprint: `cd backend && npm run build` + `npm run prisma:validate` (se schema) +
  testes direcionados dos arquivos tocados. Motor: typecheck estrito se Webwhats for tocado (não é o caso).
- Bug real encontrado durante refactor: NÃO consertar "de brinde". Listar no `.md` do sprint e decidir
  com o dono — refactor tem que ser comportamento-idêntico para ser revisável.

## Fatos-âncora (re-auditados em 01/07, working tree)

- Máquina de inbound viva: `backend/src/messaging/messaging.service.ts` L1810–3741 (~1.9k linhas),
  entrada `handleVendasAutomationInbound` L2936, chamada L6751. Coberta por `messaging.service.test.ts`.
- Cópia morta: `backend/src/vendas/vendas-automation.service.ts` L4359 `classifyProspectingInbound` —
  só `vendas-automation.service.test.ts` chama. Divergência confirmada: fluxo de reagendamento
  (`handleVendasProspectionScheduleReply`/`parseProspectionScheduleRequest`) SÓ existe no messaging.
  Paridade confirmada nos dois lados: pitch pós pré-mensagem (`sendVendasPitchAfterPreMessage` L1998 ↔
  `sendPitchAfterPreMessage` L4282).
- Causa-raiz da cópia: ciclo de módulos — `VendasModule` importa `MessagingModule`; messaging só
  importa `AiIntentClassifierModule` de vendas. A assinatura morta já usa callback `setInboundMeta`
  (mesmo contrato da chamada viva) → foi desenhada pra ser a fonte única e alguém copiou em vez de ligar.
- Worker: `setInterval` 15s in-process (`onModuleInit`), `MAX_DUE_JOBS_PER_CYCLE=50`, job vira
  `sending` (L4031) ANTES do typing delay `await` de 8–20s (L4038); `findNextDueJob` só pega
  `scheduled` (L3077); SEM recovery no boot (padrão pronto na casa: `webscraping/hbx-engine-pool.service.ts`
  L509 solta lease órfão no boot).
- `VendasCardComplaint`: model no schema (L1448) mas SEM migration — tabela existe em produção só pelo
  runtime-ensure (`vendas-complaints-runtime.ts`). Regularizar no SPRINT4.
- `VendasLead`: 60+ colunas misturando CRM + venda + comissão. `vendas.service.ts`: 9.719 linhas,
  53 rotas, ~15 assuntos. Frontend: `app/(app)/vendas/page.client.tsx` 1.789 linhas e importa
  `LeadsClient` (página inteira) como componente.
