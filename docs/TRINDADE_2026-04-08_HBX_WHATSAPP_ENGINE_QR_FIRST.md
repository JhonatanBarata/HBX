# TRINDADE — 2026-04-08 — HBX — Motor WhatsApp QR-first

## Sistema
HBX

## Objetivo
Definir o próximo passo inteligente do sistema para destravar onboarding, trial e operação inicial com WhatsApp sem depender da fricção da Meta como entrada principal.

## Decisão principal
O HBX vai seguir com dois trilhos:

1. **Trilho rápido (QR / WhatsApp Web)** como padrão do trial e da ativação inicial.
2. **Trilho oficial (Meta)** como rota posterior para clientes que já validaram uso e desejam estabilidade institucional.

A prioridade imediata deixa de ser "forçar Evolution" e passa a ser **criar um motor próprio QR-first**, com regras no HBX e execução em um serviço Node separado.

---

# Trindade

## 1) MINI
**Nível de inteligência:** mini

### Missão
Entregar o menor caminho funcional para cliente entrar, escanear QR e usar rápido.

### Escopo
- Fazer o onboarding do trial destacar **Conectar WhatsApp rápido por QR**.
- Deixar a rota **Meta oficial** como opção secundária.
- Mapear o fluxo mínimo do usuário:
  - cadastro
  - email
  - login
  - abrir painel
  - conectar por QR
  - receber/enviar mensagens
- Definir o mínimo operacional vendável:
  - conectar sessão
  - status da sessão
  - QR visível
  - envio de texto
  - envio de imagem/logo
  - resposta inbound
- Definir guardrails básicos:
  - fila
  - atraso entre mensagens
  - limite por sessão
  - limite por contato
  - pausa em erro

### Regra central
**Se o cliente não falou antes, o motor raça não envia.**

### Resultado esperado
Um trial que não espanta o cliente e mostra valor em minutos.

---

## 2) COPILOT
**Nível de inteligência:** high / xhigh

### Missão
Reestruturar o HBX para suportar múltiplas sessões por empresa, sem enterrar regra de negócio dentro do motor.

### Arquitetura alvo
**HBX = cérebro**
**Motor Node = executor**

### Regras de arquitetura
As regras de negócio ficam no **HBX**:
- o que responder
- quando responder
- fluxo por módulo
- limites
- cooldown
- regras por empresa
- regras por funcionário
- risco operacional

O motor Node executa:
- QR
- sessão
- reconnect
- envio
- recebimento
- eventos
- mídia
- status técnico

### Mudança estrutural necessária
Hoje o modelo está centrado em **1 empresa = 1 sessão temporária**.
Precisa evoluir para **1 empresa = N sessões**.

### Modelo alvo sugerido
Tabela/entidade nova para sessões WhatsApp, por exemplo:
- `CompanyWhatsAppSession`
  - `id`
  - `companyId`
  - `userId` ou `seatId`
  - `provider`
  - `sessionKey`
  - `status`
  - `phone`
  - `qrCodeDataUrl`
  - `connectedAt`
  - `lastError`
  - `lastSeenAt`

### Contrato sugerido do motor externo
- `POST /sessions`
- `GET /sessions/:id/status`
- `GET /sessions/:id/qr`
- `POST /sessions/:id/disconnect`
- `POST /sessions/:id/restart`
- `POST /sessions/:id/send-text`
- `POST /sessions/:id/send-media`

### Ponto crítico
Não deixar as regras de resposta voltarem a morar no `index.js`.
O `index.js` deve só executar as decisões que vierem do HBX.

### Resultado esperado
Um HBX pronto para múltiplos funcionários, múltiplas sessões e troca de motor sem bagunça.

---

## 3) CODEX
**Nível de inteligência:** high / xhigh

### Missão
Construir o motor próprio QR-first em Node, com foco em rapidez de operação e liberdade de regra.

### Direção técnica
Criar um serviço separado, por exemplo:
- `hbx-whatsapp-engine`

Base técnica sugerida:
- `whatsapp-web.js` como fundação do motor
- autenticação local por sessão
- multi-sessão por `clientId`
- eventos/webhooks para o HBX

### Responsabilidades do motor
- criar sessão
- gerar QR
- manter sessão viva
- reconnect
- receber mensagem
- enviar mensagem
- enviar mídia/logo
- retornar status técnico
- expor erros reais

### Regras de segurança operacional mínimas
- fila por sessão
- throttling
- cooldown por contato
- limite por janela de tempo
- pausa automática em erro
- logs por empresa e por sessão
- bloqueio de rajada

### Regra comercial inteligente
Se 3+ QR simultâneos começarem a pesar, isso vira **regra de plano** e não improviso técnico.

### Uso de botões
- botão visual pode existir como recurso complementar
- a fundação do fluxo deve ser texto + mídia + fallback numérico
- ex.: `1 = Sim` / `2 = Não`

### Verdade operacional
O motor próprio é mais promissor para o momento atual do HBX do que insistir em APIs instáveis para onboarding.
Mas ele deve ser tratado como **trilho não oficial**, enquanto a Meta permanece como rota premium/oficial futura.

### Resultado esperado
Um motor que liga cliente rápido, sem depender da burocracia da Meta como porta de entrada.

---

# Verdades fechadas nesta decisão

## O que ficou decidido
- QR-first será a estratégia principal do trial.
- Meta não será mais a barreira inicial do onboarding.
- O motor próprio em Node faz mais sentido para a fase atual do HBX.
- O HBX continuará sendo o cérebro das regras.
- O executor técnico será um serviço separado.
- O modelo atual de 1 sessão por empresa precisa evoluir para múltiplas sessões.
- O foco inicial é atendimento/resposta, não spam/vendas.

## Regra operacional inicial confirmada
**Motor apenas de resposta/inbox é muito menos arriscado do que motor de spam/vendas.**
Mesmo assim, deve nascer com guardrails técnicos e comerciais.

## Próximo passo recomendado
Amanhã, começar pelo desenho do **mínimo operacional vendável** do motor:
1. modelo de dados
2. serviço Node
3. endpoints internos
4. tela de onboarding QR-first

---

# Frase-resumo
**Agora o HBX não precisa do motor perfeito; precisa do motor que liga cliente sem espantar ele.**
