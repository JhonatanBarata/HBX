# PRIORIDADE — 2026-04-04 — Bloqueio de módulo sem motor crítico

## Contexto

Hoje o sistema pode deixar módulos visualmente acessíveis mesmo quando o motor crítico necessário para operar aquele módulo não está funcionando.

Isso gera confusão, sensação de sistema quebrado e uso falso de áreas que na prática não deveriam estar liberadas.

## Regra de produto desejada

**Se faltar o motor crítico, o módulo deve fechar.**

Ou seja:

- pode ficar embaçado;
- pode ficar desabilitado;
- pode ficar sem clique;
- ou qualquer solução leve de UI;
- mas precisa ficar claro que o módulo não está operacional.

## Diretriz principal

Linkar funcionalidades com seus motores reais.

Se o motor faltar, o módulo ou a função dependente deve ficar bloqueado.

## Exemplos já percebidos

### 1) Pagamentos / financeiro

Sem token ou motor de pagamento funcionando:

- o cliente não recebe pagamento;
- a função fica operacionalmente quebrada;
- revisar se deve bloquear tudo ou apenas a parte financeira dependente do motor.

### Revisar conceito

- se o módulo inteiro deve fechar;
- ou se apenas a parte que depende de pagamento deve travar;
- deixar isso claro visualmente.

### 2) Atendimento

Sem WhatsApp e sem Meta:

- atendimento não funciona de verdade;
- logo o módulo não deveria continuar parecendo utilizável.

### Regra desejada

Sem WhatsApp / Meta operacional:

- embaçar Atendimento;
- remover clique ou bloquear ações;
- deixar claro que falta conexão/motor.

### 3) Recovery

Se a operação do Recovery depende do mesmo motor de WhatsApp / Meta para cobrar e interagir:

- sem esse motor, o módulo também deve entrar em estado bloqueado ou parcialmente bloqueado.

### Revisar

- o que depende obrigatoriamente de WhatsApp/Meta;
- o que ainda pode funcionar sem esse motor;
- como deixar isso claro sem mentir para o operador.

## Objetivo

Parar de exibir módulos como "funcionando" quando o motor central está ausente.

## Comportamento desejado de UI

Quando faltar motor crítico:

- módulo embaçado, bloqueado ou claramente inativo;
- texto curto e útil explicando o que falta;
- clique levando para a correção do motor;
- não deixar o operador entrar em tela inútil e descobrir só depois que está quebrado.

## Exemplos de vínculo motor -> módulo

### Motor de pagamento

Afeta:

- geração de cobrança;
- envio de link;
- leitura operacional ligada ao recebimento real.

### Motor de WhatsApp / Meta

Afeta:

- Atendimento;
- Recovery;
- envio de mensagens;
- templates;
- automações de conversa.

## Regra estrutural

O sistema precisa entender dependências reais:

- módulo;
- subfunção;
- motor necessário;
- estado atual do motor.

Com isso, a UI decide:

- liberar;
- bloquear parcialmente;
- bloquear totalmente.

## Revisar amanhã

- quais motores existem hoje;
- quais módulos dependem de cada motor;
- qual nível de bloqueio faz sentido por módulo;
- como isso aparece no desktop e no celular;
- como integrar com a barra superior de status operacional.

## Resultado esperado

Ao final:

- menos telas falsas;
- menos clique em área quebrada;
- módulos realmente ligados aos motores certos;
- sistema mais honesto operacionalmente;
- diagnóstico e bloqueio coerentes com a realidade.
