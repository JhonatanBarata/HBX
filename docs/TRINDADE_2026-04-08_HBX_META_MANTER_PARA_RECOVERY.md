# TRINDADE — 2026-04-08 — HBX — Manter Meta para Recovery

## Sistema
HBX

## Decisão principal
Mesmo com a decisão de seguir com um motor próprio QR-first para onboarding, trial e atendimento rápido, o **Meta oficial deve ser mantido obrigatoriamente** dentro do HBX.

## Motivo
Quando o sistema for usado no módulo **Recovery / cobrança**, usar um motor baseado em WhatsApp Web / JS para cobranças aumenta demais o risco operacional e de banimento.

## Regra fechada
- **QR / JS / motor raça** = trilho de onboarding, trial, atendimento e operação rápida.
- **Meta oficial** = trilho obrigatório para **Recovery / cobrança**, onde há mais risco e necessidade de previsibilidade.

## Interpretação de produto
O HBX não vai abandonar a Meta.
A Meta continua como parte central da estratégia, porém deixa de ser a porta de entrada comercial do produto.

### Nova separação estratégica
1. **Atendimento / trial / ativação rápida**
   - prioridade para QR-first
   - foco em facilidade de entrada
   - menos fricção comercial

2. **Recovery / cobrança / operação crítica**
   - prioridade para Meta oficial
   - mais segurança institucional
   - menor risco de banimento
   - melhor aderência para uso sensível

## Impacto no sistema
O HBX deve continuar suportando os dois trilhos:
- um trilho rápido para ativação e uso inicial
- um trilho oficial para fluxos críticos e financeiros

## Regra de arquitetura
Essa separação deve aparecer claramente no produto:
- onboarding do trial pode priorizar QR
- módulos de cobrança e recovery devem sinalizar claramente a necessidade de rota oficial Meta

## Trindade

### MINI
**Nível de inteligência:** mini
- Ajustar comunicação do produto para não vender QR como solução universal.
- Deixar claro no onboarding e nos textos internos que cobrança/recovery exigem avaliação da rota oficial.

### COPILOT
**Nível de inteligência:** high / xhigh
- Modelar no HBX a separação entre sessões/rotas por contexto de uso.
- Garantir que módulos sensíveis consigam identificar quando devem exigir a rota oficial.

### CODEX
**Nível de inteligência:** high / xhigh
- Implementar guardrails técnicos para impedir uso indevido do motor JS em cenários de cobrança massiva/recovery, ou ao menos sinalizar risco alto dentro do sistema.
- Preservar compatibilidade com Meta oficial como trilho premium e crítico.

## Frase-resumo
**QR liga o cliente; Meta protege o Recovery.**
