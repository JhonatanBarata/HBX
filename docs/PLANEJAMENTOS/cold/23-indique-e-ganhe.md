# COLD-23 — Indique e Ganhe (crescimento pelos próprios clientes)

**O que eles têm:** menu "Indique e Ganhe" no site e no app — cliente indica, ganha crédito.
Custo de aquisição virando produto: quem já paga vira vendedor.

## Versão HBX (quando houver base de clientes que justifique)
- Moeda de recompensa NÃO é desconto (desmonetiza) — é **leads validados bônus** ou **1 mês de
  um recurso a mais** (ex. +1 automação ativa). Custo marginal ~zero pra nós, valor alto percebido.
- Mecânica mínima: link `?ref={companyId}` no cadastro → tabela `Referral { referrerId, newId,
  status }` → recompensa ao 1º pagamento do indicado (não no cadastro — senão vira farm).
- Onde divulgar: rodapé do painel + mensagem pós-venda-fechada ("fechou negócio? conhece alguém
  que também quer?") — momento de dopamina é o momento do pedido de indicação.

## Plano mínimo (2-3 dias quando ativar)
1. Migration Referral + captura do ref no registro + tela "Indique" com link copiável.
2. Job: indicado pagou → credita recompensa + notifica os dois via WhatsApp.
3. Frente financeira → Opus edita direto + revisão de diff (regra da casa).

**Gatilho:** ≥20 empresas pagantes ativas. Antes disso, boca-a-boca manual do dono rende mais.
