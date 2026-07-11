# PR11072026 — Créditos: overlay do catálogo + medição IA batch + comissão (furos 2 e 3)

Decisões do dono 11/07 (chat, fechadas por pergunta direta):
- **Baileys NUNCA debita** (reafirmado). Track perpétuo; só Meta API oficial futura cobraria (repasse).
- **3 furos comissão×créditos: consertar.** Furo 1 (comissão fantasma) já tem freio `8a134730` PUBLICADO
  10/07 (payable só `paying`) — conferir, não refazer. Restam furos 2 e 3 (worker 03, Opus direto).
- **Enriquecimento pago: DECISÃO ABERTA — NÃO IMPLEMENTAR NADA.** Ideia do dono a discutir: ação
  separada, ativação manual, cliente ciente do custo, débito só com entrega conferida por IA. Nenhum
  worker cria ação/cobrança de enriquecimento.
- **Hold/reserva no ledger: CANCELADO.** Não construir. O padrão vigente é débito-antes + estorno
  idempotente (já live no lead).

## Escopo (3 workers, 1 por .md)
| # | Doc | O quê | Quem |
|---|-----|-------|------|
| W1 | 01-OVERLAY-CATALOGO-ACOES.md | Catálogo de ações editável no /master (base em código + overlay em banco) | Sonnet |
| W2 | 02-IA-BATCH-COMPANYID.md | Propagar `companyId` nos call-sites batch de IA que têm tenant real | Sonnet |
| W3 | 03-COMISSOES-FUROS-2-3.md | Recarga comissiona (desarmado por default) + base = receita real | **Opus DIRETO** (frente financeira) |

## Invariantes que NENHUM worker pode violar
1. `lead_delivery` debita SÓ pelo caminho assert (`assertAndDebitLeadDelivery`); o meter recusa lead —
   NÃO mexer nessa recusa (credit-meter.service.ts:93-98).
2. Meter continua best-effort pós-fato (nunca lança, nunca bloqueia). Overlay não muda essa semântica.
3. `whatsapp_auto_send` nunca vira `debit` — nem por overlay (validação dura no W1).
4. Ledger é Int — custo sempre inteiro ≥ 1. Nada de fração.
5. Track-first: nenhuma ação nova nasce `debit`; flip é decisão explícita do dono.
6. Lei do Vendedor: vendedor não vê valor/saldo; telas novas são do /master (MasterGuard).

## ⚠️ Tree QUENTE — sessão paralela em voo (11/07)
Trabalho NÃO commitado de outra sessão em: `schema.prisma` (MULTILOCAL/LocalEntrega + avisoChegandoAt),
`credit-wallet.service.ts` + `credits.service.ts` (P0.3 dívida de chargeback), `financeiro.service.ts`,
`janela-creditos.tsx` (+4). Regras pros workers:
- **PROIBIDO qualquer comando git** (add/commit/stash/checkout/restore). Só Edit/Write nos arquivos do seu doc.
- Edições **aditivas e cirúrgicas** — nunca reformatar arquivo, nunca tocar região alheia.
- **Migration escrita À MÃO** (SQL only, aditiva) — NUNCA `prisma migrate dev` (varreria o schema da outra
  sessão). Padrão: `backend/prisma/migrations/20260705110000_credits_pack_catalog/`.
- Reportar no final: arquivos tocados + testes rodados + qualquer conflito visto.

## Fora de escopo (registrado pra não virar buraco silencioso)
Enriquecimento pago (aberto), hold/reserva (cancelado), ações email/export/report (sem decisão),
flips track→debit (só com ~30d de dado + decisão do dono), preço real dos packs (decisão do dono).

## Aceite do pacote
- `cd backend && npx tsc --noEmit` verde; suítes credits + commissions + usage-limits verdes.
- Overlay: master muda mode/cost de ação (exceto lead) sem deploy; base em código = fallback; boot sem banco não quebra.
- IA batch: call-sites com tenant real passam `{companyId, actionKey:'ai_batch'}`; fábrica global fica como está (não inventar companyId).
- Comissão: recarga paga gera receivable com % configurável (default 0 = desarmado); sync não sobrescreve mais valor negociado com preço de tabela.
- Commit LOCAL no final; **publish só o dono**.
