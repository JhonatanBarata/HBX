# HANDOFF — PR11072026 (créditos: overlay + IA batch + comissão)

Data: 11/07. Orquestrador Opus. **NÃO publicado, NÃO commitado.** Tree tem trabalho de OUTRA sessão junto
(P0.3 chargeback debt, MULTILOCAL/LocalEntrega) — cuidado no commit.

## Decisões do dono (11/07, fechadas)
1. Baileys NUNCA debita (reafirmado). 2. 3 furos comissão APROVADOS (furo 1 já em prod `8a134730`).
3. Enriquecimento pago = ABERTO, não implementar (ideia: ação separada no Vendas, ativação manual,
   débito só com entrega conferida por IA). 4. Reserva/hold no ledger = CANCELADA.

## O que JÁ FIZ (código no tree, verde)
- **W1 overlay catálogo de ações** (/master edita mode/cost sem deploy): `credit-action-config.service.ts`
  (novo) + migration `20260711020000_credit_action_config` (à mão, aditiva) + 3 endpoints MasterGuard em
  `credits-master.controller.ts` + overlay em `credit-action-catalog.ts` + guia "Ações" em
  `janela-creditos.tsx`. lead_delivery bloqueado; whatsapp_auto_send+debit bloqueado (2 camadas).
- **W2 companyId IA batch**: só o saneamento pós-entrega (`saneiaComNota`) tinha tenant → recebeu
  `{companyId, actionKey:'ai_batch'}`. Outros 4 call-sites = fábrica global do dono, intactos.
- **W3 comissão (Opus direto)**: furo 2 recarga comissiona DESARMADA por default
  (`HBX_COMMISSION_RECHARGE_PERCENT=0`, idempotente `recharge:<chargeId>`); furo 3 base = valor negociado
  real (para de rebaixar pra tabela). `hbx-commission-sync.service.ts` + hook @Optional em
  `credit-recharge.service.ts`.
- **Provas**: `tsc --noEmit` limpo; 148/148 testes (credits + comissão + recarga).

## REVISÃO ADVERSARIAL — FEITA (`wf_b3f1770c-dfe`). Nenhum bloqueante/alto. W1+W2 aprovados, W3 aprovado-com-ressalvas.

### CORRIGIR ANTES DE LIGAR (baratos, não são live — recarga desarmada por default)
1. **[media] Furo 2 idempotência por CHARGE, não por lead** (`hbx-commission-sync.service.ts` ~L1009, meu código):
   dedup faz `findFirst({leadId, cycleKey, kind:'recharge'})` — mas se o lead "mais recente vinculado" mudar
   ENTRE retries da MESMA recarga, cria 2ª comissão pra mesma charge (dobra). Fix: dedupar por
   `{cycleKey:'recharge:<chargeId>', kind}` SEM leadId (o cycleKey já embute o chargeId único). 1 linha.
2. **[baixa] Paridade whatsapp_auto_send** (`credit-action-catalog.ts` applyCreditActionOverrides ~L121):
   só o service rejeita mode=debit; escrita direta no banco burlaria (lead tem 3 camadas, whatsapp só 1).
   Fix: dropar mode='debit' quando key==='whatsapp_auto_send' no merge do overlay. Defesa em profundidade.
3. **[nit]** header duplicado "Ação" na guia Ações (`janela-creditos.tsx` ~L733) → renomear última col p/ "".

### DECISÃO DO DONO (não são bug de código)
- **Furo 3 backfill**: o fix só vale daqui pra frente. Leads Enterprise sincronizados ANTES de 11/07 tiveram
  `saleValue` negociado APAGADO pra tabela — preso na coluna. Precisa backfill de fonte de auditoria
  (VendasLeadTimelineEvent / valor original do card) ou re-entrada manual. Confirmar com o dono se sobrou dado.
- **Recarga: "último a vincular vence"** quando 2 vendedores no mesmo cliente — recarga paga 1, recorrência
  paga os 2. Inconsistência a decidir (ratear? vínculo canônico?).

### DEPOIS DAS CORREÇÕES
4. **Commit LOCAL** seletivo (só arquivos dos 3 workers — lista nos relatórios) SEM arrastar P0.3/MULTILOCAL
   da outra sessão. NÃO `git add -A`.
5. **Publish = só o dono.** Nenhum env novo obrigatório.

## Pendências abertas (decisão do dono, NÃO são bug)
- Enriquecimento pago: desenhar com o dono (ação Vendas + IA confere entrega antes de debitar).
- % de comissão de recarga (default 0 hoje). Preço real dos packs. Flip track→debit ação a ação (após ~30d
  de dado; cuidado: conta credit tem enforce ON → flip queima welcome 50 da conta grátis).
- Furo 1 comissão-fantasma: conferir que `8a134730` (payable só 'paying') segue de pé em prod.

## Fonte
Plano completo: `docs/PLANEJAMENTOS/PR11072026/PLANO.md`. Memória: `PAGAMENTOS.md` seção "DECISÕES 11/07".
