# S8 — SDR DE IA: PILOTO MANUAL-ASSISTIDO (PLANO — não construído; a aposta de 12+ meses)

> O bot que PROSPECTA: pega lead do Radar, abre conversa, qualifica, entrega só o quente pro vendedor.
> Gringos cobram US$500-2.000/mês (11x, Artisan); ninguém atende PME BR em português por preço de PME.
> O HBX tem todas as peças: base 28M + enriquecimento + motor WA custo-zero + qwen3:4b + disjuntor.

## REGRA ZERO (cicatriz de jun/26 — chip banido não tem git revert)
NUNCA começar pelo automático. Fase 1 é HUMANO no gatilho, medindo. Só automatiza o que sobreviver a 60 dias.

## Fase 1 — manual-assistido (o que construir primeiro)
- Botão "Rascunhar abertura" no lead do Radar/Vendas usando o Copiloto já construído
  (LEADS-FINAL/05, flag HBX_COPILOTO_ENABLED): IA redige mensagem de abertura personalizada
  (empresa, CNAE, cidade — dados do enriquecimento), HUMANO revisa e envia pelo Atendimento normal.
- Telemetria desde o dia 1: tabela `ProspeccaoEnvio` (leadId, companyId, sentAt, respondeuAt?,
  optOutAt?) — sem isso não existe decisão de fase 2.
- Metas de validação: taxa de resposta >8%, zero dano de chip, opt-out <2%.

## Fase 2 — semi-auto (só se Fase 1 validar)
- Fila de aberturas: IA redige N/dia, humano APROVA em lote (1 clique por mensagem, nunca "aprovar tudo").
- Chip DEDICADO de outbound por tenant (nunca o de atendimento), aquecimento progressivo
  (semana 1: 10/dia → +10/semana até teto 50/dia), só horário comercial, opt-out honrado na 1ª
  (o classificador qwen3:4b-instruct já detecta opt-out — reusar), disjuntor existente.
- Resposta do lead → conversa cai IMEDIATAMENTE pro humano (SDR só abre, não conduz — v1).

## Fase 3 — cobrança (modelo de negócio)
Cobrar por LEAD QUALIFICADO entregue (crédito via action-catalog existente), NUNCA por mensagem —
alinha incentivo com não-spam. Preço referência de mercado: lead qualificado B2B vale R$10-50.

## Nunca fazer
Loop de reenvio; follow-up automático sem resposta (fase 3+ com opt-in explícito do dono do tenant);
prospecção de lista fria comprada (só leads do Radar próprio com telefone validado pelo enriquecimento);
usar o chip do dono pra teste (número descartável SEMPRE — regra da casa).
