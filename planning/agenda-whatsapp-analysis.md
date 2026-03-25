# Fase 1 — Analise da Jornada de Agendamento WhatsApp

## Arquivos analisados

- `frontend/src/app/dashboard/inbox/page.client.tsx`
- `frontend/src/app/dashboard/inbox/_components/AgendaPanel.tsx`
- `frontend/src/app/dashboard/inbox/inbox-model.ts`
- `frontend/src/app/dashboard/inbox/page.module.css`
- `backend/src/inbox/inbox.controller.ts`
- `backend/src/inbox/inbox.service.ts`
- `backend/src/inbox/atendimento-config.ts`
- `backend/src/inbox/dto/update-atendimento-agenda.dto.ts`

## Arquitetura encontrada

- O modulo `Atendimento` ja possui uma aba `Agenda` com persistencia real em `/inbox/agenda`.
- O frontend atual ja renderiza:
  - lista de guias
  - calendario semanal
  - drawer de configuracao
  - slots por guia
  - dias uteis
  - feriados
  - mensagens por guia
- O backend ja salva a agenda em `hbxRecoveryFlowStage`, usando canal/titulo dedicados para o Atendimento.
- O modelo antigo da agenda era simples demais para a jornada pedida: faltavam campos para mensagem inicial, fluxo, regra por guia, cancelamento e simulacao.

## O que pode ser reaproveitado

- `AgendaPanel.tsx` como base visual principal do painel.
- `page.client.tsx` como ponto de integracao para estado, carregamento e persistencia.
- `inbox-model.ts` e `atendimento-config.ts` como schema espelhado entre frontend e backend.
- `page.module.css` para manter o padrao visual HBX sem depender de bibliotecas novas.
- Endpoints existentes `GET /inbox/agenda` e `PATCH /inbox/agenda`.

## Menor ponto de integracao

- Manter a feature dentro de `Dashboard > Inbox > Agenda`.
- Evoluir o `AgendaPanel` para 5 telas internas no drawer:
  - Fluxo principal
  - Guias / Servicos
  - Regras
  - Mensagens automaticas
  - Simulacao
- Acrescentar inline edit nas abas/guias sem trocar a estrutura principal da tela.
- Acrescentar endpoint minimo de simulacao sem executar automacao real.

## Lacunas identificadas

- O DTO do backend nao aceitava os campos novos da jornada.
- O frontend ainda nao normalizava os novos campos da agenda como o backend.
- Faltava um endpoint sandbox para simular clique na guia, disponibilidade, confirmacao e cancelamento.
- Faltava um estado compartilhado para editar mensagens iniciais e mensagens do fluxo.
- A edicao inline do nome da guia ainda nao existia.

## Proposta de implementacao com patch minimo

1. Expandir o schema compartilhado da agenda com:
   - `initialMessage`
   - `flowMessages`
   - `slug`
   - `actionType`
   - `linkedAgendaId`
   - `sortOrder`
   - regras de busca/sugestao/fallback
2. Atualizar DTO e persistencia para salvar a nova estrutura inteira em `/inbox/agenda`.
3. Criar `POST /inbox/agenda/simulate` para sandbox.
4. Evoluir o `AgendaPanel` existente:
   - inline edit da guia
   - painel lateral de dias uteis e regras por guia
   - telas internas para fluxo/mensagens/simulacao
5. Polir o visual preservando cores, espacamento e linguagem do HBX.

## Ordem das proximas fases

1. Fechar schema/persistencia/simulacao.
2. Implementar guias com inline edit.
3. Implementar card lateral de dias uteis e regras por guia.
4. Implementar telas de mensagens automaticas e simulacao.
5. Polir visual e validar save/reload.

## Observacoes

- A melhor estrategia continua sendo evolucao incremental em cima da agenda ja existente.
- Nao vale criar um editor de bot paralelo para esse caso.
- O patch pode ser entregue sem quebrar build/publish se mantivermos a feature dentro do modulo `Atendimento`.
