# Vendas — conversa canônica e estado do cockpit

Escopo implementado em 13/07/2026: conversa canônica (Fases 0–2) e execução
canônica das automações comerciais (Fase 3). Este contrato existe para impedir que
pipeline, mensageria, Bot e interface voltem a interpretar o mesmo fato de formas
diferentes.

## Resultado do primeiro corte

- Vendas reconhece uma conversa existente sem usar o telefone como vínculo permanente.
- Abrir uma conversa existente é uma leitura de banco e não chama
  `/inbox/conversations/start`, `onWhatsApp` nem sincronização histórica.
- Abrir não muda Bot, responsável, fila, rota, fluxo ou etapa comercial.
- O cockpit distingue fila, envio, confirmação, resposta, falha e cancelamento.
- Um outbound confirmado mantém o lead em Prospecção e apenas muda o engajamento
  para `awaiting_reply`.
- Um inbound humano válido interrompe contatos comerciais futuros antes de IA e
  gatilhos opcionais.
- Recovery e e-mail usam filas duráveis próprias e compartilham a mesma barreira
  de inbound e a ação de crédito `Automação`.

## Dimensões canônicas

```text
pipelineStage:
  prospeccao | qualificacao | proposta | negociacao | fechamento

outcome:
  open | won | lost | no_interest | opt_out

engagementState:
  no_conversation | no_messages | queued | sending
  | awaiting_reply | replied | failed | canceled
```

Os três campos não podem ser fundidos em um enum único: etapa comercial, desfecho e
estado de comunicação mudam por eventos diferentes.

## Matriz de transição

| Evento persistido | Engajamento | Pipeline/outcome |
|---|---|---|
| conversa vinculada, sem mensagem | `no_messages` | sem mudança |
| outbox `PENDING` / mensagem `QUEUED` | `queued` | sem mudança |
| dispatcher iniciou | `sending` | sem mudança |
| provedor confirmou `SENT`, `DELIVERED` ou `READ` | `awaiting_reply` | sem mudança |
| provedor falhou | `failed` | sem mudança |
| envio cancelado | `canceled` | sem mudança |
| inbound humano válido | `replied` | pode qualificar |
| inbound negativo | `replied` | `outcome=no_interest`, sem falsa qualificação |
| opt-out | `replied` | `outcome=opt_out`, sem falsa qualificação |
| confirmação humana ou regra determinística auditável | preserva | pode qualificar |

Não são inbound qualificante: histórico importado, recibo, reação, mensagem apagada,
evento técnico, duplicata ou resposta automática identificada.

## Uma automação comercial por lead

O modelo da Fase 3 usa:

- `AutomationEnrollment`: inscrição e slot comercial único;
- `AutomationStepRun`: claim/lease idempotente do passo lógico e vínculo direto
  com `OutboundMessage`;
- `AutomationLedgerEvent`: trilha técnica append-only, sem corpo integral da
  mensagem.

O índice único `(companyId, leadId, activeCommercialSlot)` garante no banco uma
única automação comercial ativa ou pausada por lead. Durante o dual-write, jobs do
Bot e inscrições de Cadência continuam dirigindo os runners, mas são espelhados no
modelo canônico. Falha definitiva, cancelamento, skip terminal e expiração liberam
o slot imediatamente.

Não entram nessa restrição mensagens humanas, mensagens transacionais, Atendimento
manual nem resposta conversacional da assistente da empresa. O nome público da
assistente é configuração por empresa; internamente usa-se nomenclatura genérica.

## Ordem obrigatória do inbound

```text
persistir/deduplicar
→ suprimir histórico e eventos técnicos
→ resolver vínculo canônico com o lead
→ cancelar próximos contatos comerciais
→ projetar o cockpit
→ publicar atualização
→ classificadores e gatilhos opcionais
→ Atendimento/resposta conversacional
```

O dispatcher revalida a interrupção imediatamente antes do provedor. Se o request já
estava em voo, o sistema registra a corrida; não promete um cancelamento fisicamente
impossível.

## Diagnóstico do Bot legado

O diagnóstico do código encontrou quatro bloqueios estruturais antes da outbox:

- `start` e `resume` gravavam `running` sem `triagemConfirmedAt`, mas o worker só
  seleciona campanha com triagem confirmada;
- a UI iniciava a campanha e ligava a chave física em requests separados;
- o runner comercial dependia indevidamente do bot global do Atendimento;
- editar configuração não invalidava triagem nem desligava a campanha.

O corte corrige os quatro pontos. `start`/`resume` são comandos atômicos de negócio:
validam papel e checklist, persistem a triagem, preparam a fila, armam o canal e
revertem para pausado se o pré-voo falhar. Atendimento e prospecção têm gates
independentes. Enfileiramento continua distinto de confirmação do provedor no
cockpit (`queued` → `sending` → `awaiting_reply`/`failed`).

O script read-only `backend/scripts/diagnose-vendas-prospecting.js` mostra, por tenant:

- campanha, triagem e jobs por status;
- jobs vencidos;
- outbox comercial por status;
- falhas recentes;
- canal, chave-mestra, live flag, horário e limite diário;
- enrollments e passos canônicos, quando a migration já existe;
- `firstBlocker` e todos os reason codes aplicáveis.

Ele não ativa campanha, não confirma triagem, não cria tarefas e não chama o provedor.

O runner é um timer do processo e ainda não possui heartbeat durável. Portanto o
script prova tarefas/fila/provedor pelo banco, mas liveness do processo deve ser
confirmada nos health checks e logs da instância.

## Contrato HTTP do cockpit

```text
GET  /vendas/lead/:leadId/conversation
POST /vendas/lead/:leadId/conversation
GET  /vendas/lead/:leadId/conversation/messages
POST /vendas/lead/:leadId/conversation/message
```

O `GET` é puro. O primeiro `POST` cria ou persiste o vínculo somente após ação
explícita. O envio usa a outbox e retorna inicialmente `queued`.

O Copiloto também usa apenas o endpoint de leitura por `leadId`; ele não chama mais
`/inbox/conversations/start` para consultar histórico.

## Assistente de conversa

- `AssistenteConfig` é única por empresa e contém o nome público configurável.
- Internamente usa-se `conversationAssistant`; não existe identificador global
  fixo nem o nome "Bianca" no runtime.
- `ConversationAssistantRun` reivindica cada inbound uma única vez.
- Respostas usam `purpose=conversation_reply`, não ocupam o slot comercial e não
  rodam em paralelo com o Atendimento para a mesma mensagem.
- O runtime exige configuração publicada, canal armado, conversa com bot ativo e
  `HBX_ASSISTENTE_PUBLISH_ENABLED=true`. A flag nasce desligada.
- Clientes do Recovery continuam no fluxo de Recovery e não entram na assistente.

## Recovery: Cliente × Produto × Financeiro

- `FinanceiroCharge` vencida e ligada a `CustomerProfile` materializa um
  `RecoveryDebtItem` idempotente; não depende mais de a origem ser Logística.
- Produtos de `Entrega`/`EntregaItem` são preservados em
  `RecoveryDebtItemProduct`, formando o gancho Cliente × Produto × Financeiro.
- Pagamentos do Recovery são distribuídos FIFO nos itens por
  `RecoveryDebtAllocation`; quitação/estorno reconcilia item, cobrança financeira
  e `DebtCase`.
- `RecoveryAutomationStepRun` transforma as etapas configuradas em uma fila
  durável para WhatsApp ou e-mail, com claim, lease, estados de falha e
  idempotência por ciclo de dívida.
- Inbound humano cancela passos futuros e a outbox ainda pendente antes de IA.
- O worker exige `HBX_RECOVERY_AUTOMATION_WORKER_ENABLED=true`, Recovery ao vivo e
  `moduloRecoveryAtivo=true` no tenant. Tudo nasce desligado.

## E-mail automático

- E-mail comercial/Recovery entra em `EmailOutboundMessage` e
  `EmailOutboundAttempt`; e-mail humano ou transacional permanece fora.
- Resultado SMTP incerto vira `unknown` e não é repetido cegamente.
- O débito da ação `Automação` acontece antes do SMTP e é estornado apenas em
  falha confirmada, como ausência de configuração da empresa.
- O worker exige `HBX_EMAIL_OUTBOX_WORKER_ENABLED=true` e nasce desligado.

## Créditos de ações

O Master configura todas as ações em `Grátis` ou `Débito`:

| Ação | Default |
|---|---:|
| Lead entregue | 1 |
| Automação (WhatsApp, e-mail, Atendimento, prospecção e Recovery) | 0,1 |
| IA em tempo real, incluindo Concierge | 0,1 |
| IA em lote/enriquecimento | Grátis |
| Entrega iniciada — Logística | 0,2 |

A carteira e o ledger usam três casas decimais. Assim, uma entrega iniciada
consome `0,2` diretamente e deixa `0,8` do crédito disponível, preservando no
mesmo mecanismo FIFO, expiração, idempotência e estorno. Isso substitui o antigo
modo intermediário e evita um acumulador paralelo com resultado equivalente.

Em `/configuracoes?sec=Créditos`, “Como funcionam os créditos” explica custos,
frações, falhas/estornos e que mudanças futuras serão avisadas antecipadamente no
sistema e por e-mail.

## Rollout e backfill

Ordem segura:

1. aplicar as migrations `20260713190000_automation_execution_canonical` e
   `20260713220000_fractional_credits_email_outbox`;
2. publicar backend e frontend com as flags de assistente, e-mail e Recovery desligadas;
3. executar `npm run diagnose:vendas-prospecting -- --company-id <id>`;
4. executar `npm run backfill:commercial-automation -- --company-id <id>` em
   dry-run;
5. revisar casos `ambiguous_multiple_legacy_executions` e
   `in_flight_sending_requires_reconciliation`;
6. somente então repetir com `--apply` para o tenant revisado;
7. publicar/configurar a assistente por empresa e habilitar a flag em uma janela
   controlada.

O backfill não cria mensagem, não chama provedor, não muda campanha e ignora casos
ambíguos ou em voo.

## Matriz mínima de regressão

| Cenário | Resultado obrigatório |
|---|---|
| abrir card com conversa existente | leitura pura, `Continuar conversa`, sem mutação |
| criar conversa explicitamente | vínculo `CompanyConversation.vendasLeadId` tenant-safe |
| outbound em fila/envio/sucesso/falha | cockpit reflete o estado físico da outbox |
| outbound confirmado | permanece em Prospecção, `awaiting_reply` |
| inbound humano válido | `replied`, cancela jobs/cadência/passos/outbox pendente |
| duas réplicas no mesmo passo | somente um claim cria a mensagem |
| Bot e Cadência no mesmo lead | segunda inscrição recusada pelo slot único |
| resposta humana/transacional/assistente | não ocupa slot comercial |
| replay do mesmo inbound | nenhuma segunda resposta da assistente |
| nome da assistente em dois tenants | cada tenant usa sua própria configuração |
| Recovery ativo | fluxo permanece em Recovery |
| cobrança financeira com produtos | um item Recovery idempotente preserva cliente e produtos |
| pagamento/estorno Recovery | alocação, item, `FinanceiroCharge` e `DebtCase` ficam coerentes |
| etapa Recovery WhatsApp/e-mail | uma execução por ciclo, débito de Automação uma vez |
| inbound durante Recovery | próximos passos e outbox ainda pendente são cancelados |
| Logística iniciada | debita 0,2; falha de criação estorna 0,2 |
| IA realtime/Concierge | autoriza 0,1 antes do modelo; falha confirmada estorna |
| alteração de ação no Master | aceita Grátis/Débito e custo decimal em todas as linhas |
| flags desligadas | nenhum novo runtime é ativado |

## Fora deste corte

- nome global fixo para a assistente (proibido pelo contrato multi-tenant);
- barramento distribuído para SSE entre múltiplas réplicas.
