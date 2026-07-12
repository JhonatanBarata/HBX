# 13 — QA GERAL E OBSERVABILIDADE

## Objetivo

Trocar mutirões gigantes por uma rota curta e repetível após cada frente.

## Rota de fumaça por release

- [ ] Login: System Master, Admin, Vendedor e Entregador.
- [ ] Radar → Vendas → WhatsApp → Retorno.
- [ ] Atendimento: texto, mídia e estado real do chip.
- [ ] Entrega: rota, chegada, confirmação, cobrança e offline.
- [ ] Financeiro: pendente, aprovado, refund e idempotência.
- [ ] Público: registro, confirmação, reset, termos e exclusão.
- [ ] Master: empresas, módulos, créditos, pagamentos, flags e saúde.
- [ ] Light/dark e mobile/desktop nas telas tocadas.

## Observabilidade em microetapas

- [ ] 1. Instrumentar primeiro os `catch` silenciosos do fluxo tocado, não os ~194 de uma vez.
- [ ] 2. Criar correlation ID para pagamento, entrega, mensagem e lead.
- [ ] 3. Exibir falhas operacionais acionáveis no Master.
- [ ] 4. Alertar fila parada, webhook não processado, outbox atrasada e scheduler inerte.
- [ ] 5. Medir tempo de Radar até Vendas, Vendas até WhatsApp e WhatsApp até Retorno.

## Qualidade estrutural

- [ ] Remover testes órfãos que apontam para arquivos inexistentes.
- [ ] Criar primitive central de dialog/focus trap quando a próxima tela modal for tocada.
- [ ] Adicionar timeout/AbortSignal por cliente HTTP central, com exceção explícita para streams.
- [ ] Corrigir reconexão SSE infinita e requests fora de ordem por tela, uma tela por vez.
- [ ] Fazer o quality gate cobrir também o fluxo `npm run new`.

## Pronto quando

Cada release tem uma fumaça curta, erros chegam ao dono com contexto e os quatro elos principais possuem métrica.

