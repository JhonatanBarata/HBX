# W3 — Comissão: recarga comissiona (desarmado) + base = receita real — **OPUS DIRETO (frente financeira)**

Aprovado pelo dono 11/07 ("os 3 furos"). Furo 1 (comissão fantasma: payable só `paying`) já tem freio
`8a134730` PUBLICADO 10/07 — só CONFERIR que segue de pé, não refazer.

## Furo 2 — Recarga de crédito NÃO comissiona
Hoje a base de comissão é só `getCommercialPlanMonthlyPrice` (mensalidade de plano); a receita de recarga
(o novo modelo!) fica 100% fora do incentivo do vendedor.
- Ao confirmar recarga PAGA (choke da `CreditRechargeService`/charge paga no financeiro), se a empresa
  tem lead de venda vinculado (mesmo matching do sync: email/phone), gerar comissão sobre o VALOR REAL
  da recarga.
- **% configurável, default 0 = DESARMADO** (dono define o número depois; código nasce pronto). Config no
  padrão existente (env `HBX_COMMISSION_RECHARGE_PERCENT` ou CreditGlobalConfig — seguir o que o código
  de comissão já usa de config).
- Idempotente por charge (recarga re-sincada não duplica receivable).

## Furo 3 — Base = tabela, não o valor real
`updateLeadFromCompany` SOBRESCREVE `saleValue` com preço de catálogo a cada sync (negociado morre).
- Base da comissão = **receita REAL cobrada** (charges pagas). Parar de sobrescrever `saleValue`
  negociado com preço de tabela; tabela vira só default inicial quando não há valor.
- Conferir os 3 gatilhos do sync: `auth.service` ~L402, `financeiro.service` ~L1798 (⚠️ arquivo com
  trabalho alheio não commitado — edição cirúrgica), `gerencial.service` ~L592.

## Aceite
Testes das suítes commissions/financeiro tocadas verdes + tsc verde; recarga paga com % 0 → nenhum
receivable novo (desarmado); % > 0 (teste) → receivable = valor_recarga × %; sync não rebaixa mais
`saleValue` negociado. Nada de cobrança live disparada por este worker.
