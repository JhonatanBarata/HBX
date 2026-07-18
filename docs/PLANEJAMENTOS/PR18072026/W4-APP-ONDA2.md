# W4 — app.js Onda 2: chegada simples (Pago/Próximo), fiado, toggle (Sonnet)

Arquivo ÚNICO: `EntregaShell/app/src/logistica/assets/app/app.js` (o W3 acabou de mexer nele —
leia o estado ATUAL antes). Contratos: `00-ORQUESTRACAO.md`. NADA é removido: modo simples é
camada opcional por cima do fluxo atual.

## Tarefas

1. **Toggle nos Ajustes** (`settingsScreen`): seção nova "Como você trabalha" com switch
   "Cobrança simples na chegada" → `PATCH /logistica/config {cobrancaSimples}` (mesmo padrão
   visual dos switches de módulo existentes). Visível só p/ admin.

2. **Folha de chegada modo simples** (`deliverySheet`): quando `state.config.cobrancaSimples`
   e a entrega NÃO está finalizada: renderizar por padrão a versão simples —
   nome do cliente GRANDE, observações (se houver), linha "Deve R$ {debitoAtual + valor de hoje}"
   (se financeiro ativo; `cliente.debitoAtual` vem do listRota) e DOIS botões grandes:
   - **[Pago]** → confirma a entrega marcando recebido na hora (mesmo caminho do confirmar
     atual + campo de método recebido que o backend já aceita — usar `metodoPadrao` do cliente,
     fallback "dinheiro").
   - **[Próximo]** → confirma a entrega SEM receber (fiado: charge fica pendente, saldo do
     cliente cresce) e dispara o fluxo existente de próxima parada (`openNextStop`/countdown).
   Link discreto "Ver detalhes" alterna para a folha completa atual (stepper, comprovantes,
   não-entregue). A folha completa continua 100% intacta quando o toggle está OFF.
   Respeitar a checagem de GPS/distância existente nos dois botões.

3. **Fiado na UI:** onde o app oferece forma de pagamento (cadastro novo cliente + ficha,
   seção Financeiro): adicionar opção "Fiado" (`formaPagamento:'pendura'`) ao lado de
   "Na hora"/"Mensal". Pendura: não pede diaFechamento nem método. Chip de pendência "Pag"
   (`clientMissingLabels`/`clientPendingKeys`) passa a considerar pendura como preenchido.

## Regras
- `node --check` ao final. NÃO commitar. Não tocar em outros arquivos.
- Não quebrar nada do W3 (produtos/observações/preço) — leia antes de editar.
- Relatório: mudanças por tarefa, paths de API novos chamados, como "Pago" marca o recebimento
  (payload exato enviado ao confirmar), pendências.
