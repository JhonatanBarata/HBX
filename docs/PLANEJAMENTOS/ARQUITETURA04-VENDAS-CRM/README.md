# Arquitetura nº4 — Vendas/CRM — Plano de execução

> Origem: análise arquitetural de 01/07/2026 (sessão Arquitetura nº4), fatos re-auditados no código
> antes deste plano. Convenção da casa: 1 subagente por `.md` desta pasta; o `.md` some ao concluir.
> **EXCEÇÃO: SPRINT3 é frente financeira — Opus edita DIRETO + revisão obrigatória do diff (não delegar).**

## Ordem de execução

| Sprint | O quê | Status | Por quê ($) |
|---|---|---|---|
| [SPRINT1](ARQUITETURA04-VENDAS-CRM-SPRINT1.md) | Máquina de inbound ÚNICA (matar a cópia morta) | ✅ **FEITO 03/07** (`0387ba2d`, 34/34) | Freio anti-ban/opt-out mora em 2 lugares que JÁ divergiram; fix 2× = ban |
| [SPRINT2](ARQUITETURA04-VENDAS-CRM-SPRINT2.md) | Worker restart-safe (recovery + claim atômico) | ✅ **FEITO 03/07** (`6c5b7827`, 37/37) | Publish no typing-delay deixa job órfão HOJE; duplo envio = ban |
| **SPRINT0** (NOVO) | Extrair KERNEL compartilhado (`normalizeCurrencyAmount`/`normalizeText`/status/`resolveVendasUserContext`/…) | ⛔ **pré-req do S3/S5** | Sem o kernel, split duplica matemática de dinheiro ou acopla torto |
| [SPRINT3](ARQUITETURA04-VENDAS-CRM-SPRINT3.md) | Comissões em módulo próprio | ⛔ **BLOQUEADO** por SPRINT0 (ver doc) | Dinheiro do vendedor isolado; mas 15 helpers de $ compartilhados |
| [SPRINT4](ARQUITETURA04-VENDAS-CRM-SPRINT4.md) | Estado opt-out: JSON metadata → tabela tipada | ⬜ pronto (precisa Postgres p/ migration) | Opt-out auditável (LGPD); pós-S1 o dual-write é em 1 lugar só |
| [SPRINT5](ARQUITETURA04-VENDAS-CRM-SPRINT5.md) | Fachada + split por domínio + frontend | ⬜ oportunista (pós-SPRINT0) | Velocidade de evolução; só quando já for tocar no domínio |

**✅ P0 ban-risk ENTREGUE (S1+S2):** a duplicação da máquina de inbound e o job órfão pós-restart —
os dois "ban esperando data" — estão mortos, verificados (build limpo + 37/37) e commitados no master,
preservando o WIP Contábil/hub-integrações do dono (staging cirúrgico por arquivo).

**Ordem revisada para a próxima sessão FOCADA:** SPRINT0 (kernel) → SPRINT3 (comissão, financeiro,
Opus direto) → SPRINT4 (com Postgres de pé) → SPRINT5 (split por domínio). O SPRINT0 nasceu de dado
real: os 7 métodos de comissão dependem de 15 utilitários que são o núcleo do service inteiro
(`normalizeCurrencyAmount` 83 usos, `normalizeText` 180) — extrair o kernel primeiro destrava TODOS
os splits sem duplicar dinheiro. Detalhe em [SPRINT3](ARQUITETURA04-VENDAS-CRM-SPRINT3.md).

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
