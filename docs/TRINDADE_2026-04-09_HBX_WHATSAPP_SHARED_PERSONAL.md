# TRINDADE — 2026-04-09 — HBX — WhatsApp Shared e Personal

## Sistema
HBX

## Objetivo
Desenhar os dois modos operacionais principais do WhatsApp QR-first dentro do HBX sem perder a essência do produto: **Shared** para operação coletiva da empresa e **Personal** para operação individual por usuário/seat.

---

# Trindade

## 1) MINI
**Nível de inteligência:** mini

### Missão
Definir de forma simples o comportamento do sistema para o usuário final, deixando claro quando a empresa usa um número compartilhado e quando cada pessoa usa o próprio número.

### Modo Shared
- 1 empresa pode ter 1 sessão principal compartilhada.
- 1 sessão = 1 número de WhatsApp.
- vários usuários internos acessam o mesmo inbox no HBX.
- a leitura e atendimento acontecem no mesmo fluxo operacional.
- ideal para:
  - pizzaria
  - clínica
  - auto socorro
  - recepção
  - suporte
  - pedidos centralizados

### Regra de produto do Shared
- o número pertence à operação da empresa, não ao funcionário.
- o QR conecta o número principal da empresa.
- o inbox é compartilhado por perfil/permissão dentro do HBX.
- a troca de operador acontece no sistema, não trocando o número.

### Resultado esperado do Shared
A empresa entra rápido por QR e passa a operar um único canal compartilhado com visibilidade central.

### Modo Personal
- 1 empresa pode ter várias sessões pessoais.
- cada sessão = 1 número de WhatsApp.
- cada sessão pode ser vinculada a um usuário, seat, vendedor ou operador.
- ideal para:
  - time comercial
  - SDR
  - closer
  - follow-up individual
  - cobrança por operador
  - atendimento consultivo por pessoa

### Regra de produto do Personal
- o número pertence ao operador ou à função individual.
- cada QR conecta um número diferente.
- o HBX organiza as conversas por sessão, usuário e empresa.
- métricas e responsabilidade ficam por pessoa.

### Resultado esperado do Personal
A empresa opera vários números sem misturar dono de conversa, contexto e responsabilidade.

---

## 2) COPILOT
**Nível de inteligência:** high / xhigh

### Missão
Estruturar o HBX para suportar Shared e Personal sem misturar regra de produto com regra técnica do motor.

### Arquitetura-alvo
**HBX = cérebro**
**Motor QR = executor técnico**

### Entidade principal sugerida
`CompanyWhatsAppSession`

Campos-base sugeridos:
- `id`
- `companyId`
- `mode` = `SHARED` | `PERSONAL`
- `sessionKey`
- `provider`
- `status`
- `phone`
- `qrCodeDataUrl` apenas transitório
- `connectedAt`
- `lastError`
- `lastSeenAt`
- `isPrimary`
- `label`
- `assignedUserId` nullable
- `seatKey` nullable
- `sortOrder`
- `archivedAt` nullable

### Regras de modelagem

#### Shared
- normalmente 1 sessão principal por empresa.
- `mode = SHARED`
- `assignedUserId = null`
- `isPrimary = true`
- usada como inbox central da empresa.

#### Personal
- 1 empresa pode ter N sessões.
- `mode = PERSONAL`
- `assignedUserId` pode apontar para o dono da sessão.
- `isPrimary = false` por padrão.
- usada para operação individual.

### Regras operacionais

#### Shared
- mensagens entram no inbox central da empresa.
- vários usuários enxergam o mesmo fluxo conforme permissão.
- assignment interno pode existir no HBX sem trocar a sessão do número.
- histórico fica centralizado.

#### Personal
- mensagens entram na sessão da pessoa/seat vinculada.
- filtros, métricas e ownership ficam por usuário.
- o HBX consegue separar performance e contexto por operador.

### Regra crítica
**Não usar a mesma sessão como se fosse Shared e Personal ao mesmo tempo.**

Se o número é da operação central:
- tratar como `SHARED`

Se o número é de um operador específico:
- tratar como `PERSONAL`

### Direção de rollout
#### Fase 1
- validar apenas `SHARED`
- 1 empresa = 1 sessão principal por QR
- inbox compartilhado

#### Fase 2
- adicionar `PERSONAL`
- múltiplas sessões por empresa
- vínculo opcional com user/seat

#### Fase 3
- permitir coexistência de Shared + Personal na mesma empresa
- ex.: número central + números individuais do time comercial

---

## 3) CODEX
**Nível de inteligência:** high / xhigh

### Missão
Implementar o modo Shared agora sem fechar portas para Personal depois.

### Regra de implementação imediata
A validação atual deve ser **somente Shared**.

### O que significa Shared na implementação atual
- `tenantKey = company-<companyId>`
- 1 sessão por empresa
- 1 QR para o número principal da empresa
- o sistema não tenta vincular a sessão a um usuário específico
- o inbox continua sendo da empresa

### O que NÃO fazer agora
- não criar multi-sessão por usuário ainda
- não acoplar QR ao `userId`
- não transformar a sessão atual em sessão pessoal
- não mudar a lógica de inbox/chat existente para ownership individual

### Como preparar o terreno para Personal sem implementar agora
- nomear a sessão atual como sessão principal compartilhada da empresa
- evitar nomes/estruturas que prendam a arquitetura a `1 empresa = 1 sessão para sempre`
- deixar claro no código que o comportamento atual é `shared-first`

### Critério técnico da versão atual
Se a empresa conectar um QR agora:
- essa sessão representa o canal compartilhado da empresa
- o histórico e os chats pertencem à empresa
- os usuários enxergam o mesmo canal pelo HBX

---

# Verdades fechadas nesta decisão

## Shared
- melhor para operação centralizada
- melhor para um número principal da empresa
- melhor para pizzaria, recepção, suporte e pedido central
- deve ser a validação inicial do HBX agora

## Personal
- melhor para vendas e operação por pessoa
- melhor quando cada usuário usa seu próprio número
- exige camada de multi-sessão por empresa
- não deve entrar agora na validação inicial se o objetivo é destravar rápido

## Decisão imediata
**Agora o HBX valida apenas o modo Shared.**

A implementação atual do Codex deve tratar a conexão QR como:
- sessão compartilhada da empresa
- canal principal
- inbox coletivo
- sem vínculo por usuário individual

---

# Frase-resumo
**Shared liga a empresa; Personal organiza o indivíduo. Agora o HBX deve validar Shared primeiro sem matar a expansão para Personal depois.**
