# Vendas — conversa canônica e estado do cockpit

Escopo aprovado em 13/07/2026: Fases 0–2. Este contrato existe para impedir que
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
- Recovery, e-mail e o modelo definitivo de execuções de automação não fazem parte
  deste corte.

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

Enquanto não existe o modelo definitivo da Fase 3, a guarda considera ativos:

- jobs do Bot em `pending`, `scheduled` ou claim ainda cancelável;
- inscrição de Cadência `ativa` ou `pausada`.

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

O runner existe e agenda ticks. O bloqueio estrutural observado ocorre antes da
outbox: `start` e `resume` deixam a campanha `running` sem preencher
`triagemConfirmedAt`, enquanto o worker seleciona somente campanha com triagem.
Além disso, enfileiramento hoje é tratado como envio antes da confirmação do provedor.

O script read-only `backend/scripts/diagnose-vendas-prospecting.js` mostra, por tenant:

- campanha, triagem e jobs por status;
- jobs vencidos;
- outbox comercial por status;
- falhas recentes;
- canal, chave-mestra, live flag, horário e limite diário;
- `firstBlocker` e todos os reason codes aplicáveis.

Ele não ativa campanha, não confirma triagem, não cria tarefas e não chama o provedor.

## Contrato HTTP do cockpit

```text
GET  /vendas/lead/:leadId/conversation
POST /vendas/lead/:leadId/conversation
GET  /vendas/lead/:leadId/conversation/messages
POST /vendas/lead/:leadId/conversation/message
```

O `GET` é puro. O primeiro `POST` cria ou persiste o vínculo somente após ação
explícita. O envio usa a outbox e retorna inicialmente `queued`.

## Fora deste corte

- ativar, migrar ou substituir o Bot legado;
- Recovery;
- e-mail da assistente;
- `AutomationEnrollment`, `AutomationStepRun` ou ledger;
- nome global fixo para a assistente;
- barramento distribuído para SSE entre múltiplas réplicas.
