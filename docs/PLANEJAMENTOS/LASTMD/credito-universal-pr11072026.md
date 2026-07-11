# HANDOFF — PR11072026 (créditos: overlay + IA batch + comissão) — CONCLUÍDO

Data: 11/07. Orquestrador Opus.

## ⚡ ESTADO FINAL
- **W1+W2+W3 JÁ PUBLICADOS pelo dono** no publish `47ae2e7a` (20260711_004450) — os arquivos novos
  (`credit-action-config.service.ts`, migration `20260711020000`, endpoints master, hook comissão)
  estão TRACKED/commitados. Padrão conhecido: publish do dono varreu o trabalho dos workers.
- **Correções da revisão adversarial = commit LOCAL `56d1da24`** (NÃO publicado). 5 arquivos, +71/-6.
  Isoladas do trabalho da outra sessão (logística/núcleo/entrega ficaram intactos no tree).
- tsc verde; testes de créditos+comissão verdes (incl. 2 casos novos das correções).
- **Falta só: dono publicar o `56d1da24`** + as 2 decisões abaixo.

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

### CORRIGIDO no commit `56d1da24` (aplicado + testado — falta só o dono publicar)
1. ✅ Furo 2 idempotência: dedup por CHARGE (`{cycleKey, kind}` sem leadId) — não dobra se o lead mudar
   entre retries. + teste. Segue desarmado (percent 0).
2. ✅ Paridade whatsapp_auto_send: merge do overlay dropa mode=debit pra whatsapp (defesa em profundidade). + teste.
3. ✅ nit header duplicado da guia Ações.

### DECISÃO DO DONO (não são bug de código — continuam ABERTAS)
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
