# S4 — Robozinho: ligar a cadência POR LEAD + paradas globais + "Te chamou"

## Conceito (decisão do dono 25/07)
Automação é opt-in POR LEAD: depois do pré-voo (S3), a pessoa clica no robozinho pra ligar.
NUNCA existe disparo por puxar lead. Aviso de que a IA não se responsabiliza no ato de ligar.
Freios de canal valem SEMPRE, robô ligado ou não. A infra JÁ EXISTE — este sprint é solda:
`CadenciaService` (runner atrás de `HBX_AUTOMATION_RUNNER_ENABLED` default OFF, tetos 10 zap /
50 email por empresa/dia) + `CommercialContactControlService` (`createCadenciaInscricao`,
`canCadenciaRun`, `interruptForInbound`, `validateBeforeCommercialDispatch`).

## Entrega
1. **`POST /vendas/lead/:id/robo` {personaKey|cadenciaId, objetivo} / `DELETE .../robo`**:
   ligar = criar a inscrição do lead na cadência via `createCadenciaInscricao` (aproveitar o
   fluxo `aplicarCadencia` existente pra 1 lead) + auditoria (quem ligou, quando, persona).
   Desligar = pausar/cancelar a inscrição. Idempotente (ligar 2x não duplica).
2. **Front**: no painel do S3, habilitar o botão do robozinho com o aviso curto de
   responsabilidade (1 frase; marcar no relatório pro dono revisar a copy) + estado visível
   ligado/desligado no detalhes; selo "🤖" discreto no card do quadro/lista quando ligado
   (moldura de chip existente, tokens).
3. **Paradas globais (verificar e fechar buracos, não reconstruir)**: garantir que a inscrição
   PAUSA quando: (a) lead responde (conferir `interruptForInbound` cobre o caminho da cadência);
   (b) status do lead muda pra `qualificado`/`encerrado` (humano assumiu/fechou); (c) opt-out /
   "não enviar mais". Toda pausa registra motivo + evidência (base do reembolso futuro —
   decisão nº1 do dono no 00-FRENTE.md).
4. **"Te chamou" com contexto**: quando resposta inbound de lead com robô ligado é classificada
   como quente (pedido de preço/interesse — reusar o classificador existente em
   `backend/src/bot/intent/ai-intent-classifier.service.ts` se o caminho já roda; senão regex
   simples de intenção + campo pra IA plugar), então: mover etapa pra `retorno` ("Te chamou"),
   criar atividade/notificação pro responsável com QUEM + O QUE pediu + O QUE Automação já fez +
   sugestão de prazo. Reusar o canal de notificação/atividade existente (`AtividadesService`) —
   nada de sistema novo de notificação.
5. **Motivo de encerramento estruturado**: encerrar lead ganha motivo obrigatório
   (`sem_interesse` / `nao_atendeu` / `contato_invalido` / `convertido` / `outro`) persistido —
   alimenta S7 (marquinha/pool) e o reembolso futuro. Sem migração destrutiva; aditivo.

## O que NÃO fazer
- NÃO ligar `HBX_AUTOMATION_RUNNER_ENABLED` em lugar nenhum (decisão LIVE é do dono).
- NÃO mexer nos tetos/freios do caminho de envio (queueOutboundForCompany/disjuntor/warmup).
- NÃO tocar atendimento/recovery/Webwhats. NÃO testar com chip real.

## Aceite
- Testes: ligar/desligar idempotente; resposta inbound pausa; mudança de etapa pausa; motivo de
  encerramento persiste; classificação quente gera atividade + move etapa.
- Typecheck + suítes tocadas verdes. Commit local:
  `feat(vendas): robozinho por lead — cadencia opt-in, paradas globais e te-chamou (S4 LEAD-CENTRICO)`.
- Relatório: strings novas de UI, buracos achados nas paradas globais e como fechou.
- Guardrails gerais: `00-FRENTE.md`.
