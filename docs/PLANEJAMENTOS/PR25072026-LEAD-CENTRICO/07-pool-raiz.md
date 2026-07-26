# S7 — Marquinha no pool + matar o "puxa→dispara" pela raiz + rebaixar Conversas

## Conceito (decisões do dono 25/07)
Lead que morre volta pro pool com MARQUINHA (backend não re-seleciona no período), o histórico
privado NUNCA vaza pra outra empresa, e o motor antigo que "achava e saía mandando mensagem"
é removido PELA RAIZ ("todo bot se perde e corre risco de ban, sem falar que manda msg nada
a ver"). Conversas vira módulo opcional de atendimento, fora do fluxo de prospecção.

## Entrega
1. **Marquinha/supressão global** (dosagem aprovada pelo dono):
   - `negou/sem_interesse` → supressão ~12 meses; `nao_atendeu`/cadência esgotada →
     resfriamento ~90 dias; `opt-out`/"não enviar mais" → permanente; `contato_invalido` →
     invalida o dado (não o CNPJ). Janelas em env com esses defaults.
   - Chave global por CNPJ/telefone/e-mail (a empresa pública é reciclável; o CONTATO carrega
     o opt-out). Registrar origem (empresa X marcou em DD/MM) SEM expor histórico privado —
     outra empresa só "não recebe", nunca lê o porquê detalhado.
   - Solda nos pontos de SELEÇÃO/entrega (Radar delivery + import pra vendas): lead suprimido/
     resfriando é pulado com contador logado (visibilidade porta-a-porta).
   - Fonte: o motivo estruturado de encerramento do S4. Encerrou → marca automática.
2. **Matar o "puxa→dispara" PELA RAIZ**: o motor de campanha de Prospecção automática
   (`vendas-automation.service.ts`) deixa de existir como caminho de disparo:
   - Aposentar criação/retomada de campanha automática (endpoints/botões "Prospecção
     automática" do /vendas somem do front; backend recusa criação nova com mensagem clara).
   - Campanha viva em prod: parar com segurança (status final + log), NUNCA deletar dados.
   - As regras colhidas (janela/tetos/agendamento) já vivem no S5 — conferir que nada de regra
     útil morre junto. O envio da CADÊNCIA (S4) é o único caminho de disparo comercial restante,
     e ele NÃO auto-inscreve ninguém.
   - Cadastro imenso de prospecção some da UI; entrada = config enxuta (S5) + robozinho (S4).
3. **Rebaixar Conversas por flag**: usar o registro de módulos por empresa (masterEnabled ×
   enabled) pra Conversas virar OPCIONAL: default OFF pra empresa nova; empresas existentes
   ficam como estão (master decide no /master). Tirar Conversas do caminho da prospecção: nada
   do fluxo novo (pré-voo/robô/te-chamou) depende da TELA de Conversas — a infra de mensagens
   (ConversationsService/outbox/webhook) fica INTACTA. Congelar regra comercial nova lá.

## O que NÃO fazer
- NÃO deletar tabelas/dados de campanhas nem de Conversas. NÃO tocar na infra de mensageria.
- NÃO tocar em atendimento/recovery/Webwhats (o módulo Atendimento é OUTRO módulo — não
  confundir com Conversas; se a fronteira ficar ambígua no código, PARAR e perguntar no
  relatório em vez de adivinhar).
- NÃO aplicar supressão retroativa em massa (backfill de histórico = decisão futura do dono).

## Aceite
- Testes: lead suprimido não volta na entrega; janelas por motivo; opt-out permanente;
  outra empresa não lê histórico; criação de campanha automática recusada; cadência continua
  funcionando; Conversas OFF não quebra o fluxo novo.
- Typecheck + suítes tocadas verdes. Commit local:
  `feat(vendas): marquinha no pool + fim do puxa-dispara + conversas opcional (S7 LEAD-CENTRICO)`.
- Relatório: o que foi aposentado, o que ficou atrás de flag, contagem de campanhas vivas
  encontradas (só relatar — parar em prod é decisão do dono no publish).
- Guardrails gerais: `00-FRENTE.md`.
