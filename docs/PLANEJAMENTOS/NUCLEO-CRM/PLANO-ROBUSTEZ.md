# NUCLEO-CRM — PLANO-ROBUSTEZ (endurecer o que foi construído)

> Ordem do dono 04/07 pós-orquestração. Os 6 sprints (N1–N6, HEAD `49661aae` na `claude/nucleo-crm`)
> compilam verdes, mas **NADA rodou vivo** (confirmado por git: origin/master NÃO contém os commits;
> migrations não aplicadas). Este plano NÃO adiciona feature — **endurece o que existe**. Features
> novas (app do entregador, rota, recorrência) vivem em `../LOGISTICA-MOBILE/PLANO.md`.
> Workers LOCAL, sequenciais, não publicam; frente financeira (R2) = Opus direto + revisão de diff.

## Dívidas catalogadas (fonte: N*-RESULTADO.md + revisão de diff do orquestrador)
| # | Dívida | Onde | Risco se ignorar |
|---|---|---|---|
| 1 | Migrations N1/N5/N6 não aplicadas; zero QA vivo | `prisma/migrations/20260705*` | flag ON quebra em runtime (build verde ≠ boot ok — já deu 502 em prod) |
| 2 | Mensal lança 1 charge POR ENTREGA (não agrupa por `diaFechamento`) | `logistica.service.ts` `lancarCobranca` | cliente mensal recebe N cobranças |
| 3 | `FinanceiroCharge` órfã: sem `customerProfileId`/`dueDate`/`entregaId` (só `providerPayload` JSON) | idem ~L356 | impossível extrato por cliente / fechar-mês / recovery |
| 4 | `billingCycle` ternário redundante `'MONTHLY':'MONTHLY'` | idem ~L362 | bug latente |
| 5 | `cnpj` sem unique (idempotência só no serviço) | schema `CustomerProfile` | corrida = conta duplicada |
| 6 | Falha de efeito invisível (catch → `log.warn` e nada mais) | `confirmarEntrega` ~L234–241 | zap/cobrança falha e ninguém vê |
| 7 | Backfill N2 não rodado; dedupe radar×manual inexistente | `nucleo-ingestao` | base nasce suja |
| 8 | check-pele reprova por violações PRÉ-EXISTENTES | `screens.css:1555/1572`, `whatsapp.css:86`, `bot-builder.css:163` | gate de lint bloqueado p/ todo mundo |
| 9 | Sem e2e cross-tenant / DTO estrito nos endpoints novos | `nucleo/`, `logistica/` controllers | superfície de auth |

## Sprints

### R1 — Aterrissagem viva (fazer JUNTO com o dono; não é worker solo)
- Merge da branch → master local, aplicar as 3 migrations em ordem (N1→N5→N6), `docker ps` Up + logs limpos no boot (regra: build verde ≠ boot ok).
- QA Chrome do roteiro do `HANDOFF.md` (abas novas, criar cliente manual, criar produto, criar entrega, confirmar com flag OFF).
- Rodar o backfill N2 manual num tenant de teste; medir duplicatas geradas.
- **Gate: NENHUMA flag ON e NENHUM sprint M do plano mobile em prod antes deste sprint fechar.**

### R2 — Financeiro de verdade (FRENTE FINANCEIRA — Opus edita direto + revisão de diff)
- Colunas ADITIVAS em `FinanceiroCharge`: `customerProfileId?`, `dueDate?`, `sourceModule?`, `entregaId?` + índices (mata as dívidas 2/3/4).
- Mensal deixa de lançar por entrega: entrega marca `cobrancaStatus='aguardando_fechamento'`; ação/job "fechar mês" agrupa por cliente no `diaFechamento` → 1 charge.
- Consertar `billingCycle`; `dueDate` derivado do modelo (avulso = hoje; mensal = diaFechamento).
- Testes: confirmar 2× = 1 charge (idempotência), concorrência, extrato por cliente responde.

### R3 — Integridade da espinha
- Dedupe do existente + `@@unique([companyId, cnpj])` (migração com limpeza prévia; null-safe).
- Ferramenta de merge de contas (radar×manual duplicadas): quem tem mais dado vence, refs (entregas/contatos/leads) migram, perdedora vira `DeletionRecord`.
- Transação em `confirmarEntrega` (status + outcome atômicos).
- Soft-delete com `DeletionRecord` para Conta/Contato/Entrega (padrão do repo).

### R4 — Falha visível
- `Entrega` ganha `whatsappStatus`/`cobrancaOutcome` (`enviado|falhou|pulado` + razão) — persistido, não só log.
- Botão "reenviar aviso" (mesmo caminho blindado; teto duro: 1 reenvio manual).
- Contador de falhas de efeito no cockpit master (reusa `MasterEvent`).

### R5 — Testes e blindagem de borda
- e2e: cross-tenant 404 em TODOS os endpoints `nucleo/`+`logistica/`; DTO `class-validator` estrito (rejeita campo extra, teto de payload).
- Playwright mobile viewport: abas abrem, criar cliente, confirmar entrega (GPS mockado).

### R6 — Passe de pele isolado (diff puro de pele, nada mais junto)
- Consertar as violações pré-existentes (`screens.css:1555/1572`, `whatsapp.css:86`, `bot-builder.css:163`) → `check-pele` volta a ser gate verde pra todo mundo.

## Ordem
R1 primeiro (com o dono). Depois R2→R3→R4→R5 sequenciais (mesmo repo, sem paralelo — guardrail).
R6 entra em qualquer janela (arquivos disjuntos).

## Checks por sprint
`backend npm run build` + `prisma validate` + `tsc` + check-pele + testes novos verdes; NÃO publicar;
`git add` por caminho, sem stash; `R{n}-RESULTADO.md` nesta pasta; conferir origin/master antes.
