# TODO — 2026-04-04 — Frontend timeout / retry do backend

## Contexto

Foi percebido no frontend, especialmente no cadastro e em fluxos que dependem do backend, que quando o servidor demora para responder a experiência fica ruim e parece erro seco, travamento ou falha definitiva.

Isso tende a acontecer quando o backend está lento, instável ou "acordando".

## Objetivo

Melhorar a UX do frontend em cenários de lentidão do backend.

## Requisito principal

Quando o backend não responder dentro da janela definida pelo frontend:

- exibir estado claro de espera para o usuário;
- mostrar um timer regressivo de 50 segundos;
- ao terminar o timer, tentar novamente a conexão com o backend;
- manter a comunicação visual elegante, sem parecer erro bruto;
- evitar loops infinitos e evitar múltiplas tentativas simultâneas.

## Escopo inicial sugerido

Aplicar primeiro nos fluxos mais sensíveis:

- cadastro;
- login;
- telas de entrada onde o sistema depende do backend para seguir;
- pontos já conhecidos onde o usuário percebe travamento por demora do servidor.

## Comportamento esperado

### Antes do timeout

- mostrar loading normal;
- informar que o ambiente seguro está sendo inicializado ou que o servidor está respondendo.

### Ao detectar demora relevante

- trocar o estado visual para "backend lento";
- exibir contagem regressiva de 50 segundos;
- bloquear spam de clique no botão principal;
- manter opção de cancelar ou voltar quando fizer sentido.

### Ao final da contagem

- executar nova tentativa automática de chamada ao backend;
- se voltar, seguir o fluxo normal;
- se continuar falhando, permitir repetir manualmente e mostrar mensagem clara.

## Regras técnicas sugeridas

- centralizar a lógica de timeout e retry em utilitário/hook reutilizável;
- usar AbortController para encerrar requests travadas no frontend;
- impedir duplicação de requests ao reexecutar;
- registrar distinção entre:
  - timeout/lentidão;
  - backend offline;
  - erro real de validação/regra de negócio;
- não confundir erro de formulário com indisponibilidade do servidor.

## UX copy sugerida

- "Estamos tentando conectar ao servidor."
- "O ambiente pode estar inicializando."
- "Nova tentativa em 50 segundos."
- "Se o servidor responder antes, continuaremos automaticamente."

## Observações de produto

Enquanto o backend ainda puder demorar para responder, essa camada de UX é obrigatória para não passar sensação de sistema quebrado.

O foco não é mascarar erro real, e sim diferenciar:

- erro do usuário;
- erro de regra;
- demora temporária do backend.

## Próximo passo

Ao implementar, revisar primeiro os fluxos de cadastro e login, pois são os pontos onde a primeira impressão do sistema mais sofre.
