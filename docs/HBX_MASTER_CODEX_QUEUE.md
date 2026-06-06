## [R] HBX-MASTER-001 — Documento central da arquitetura HBX Master

Leia AGENTS.md primeiro.

Objetivo:
criar a documentação principal do HBX Master.

Criar:

- docs/HBX_MASTER_ARCHITECTURE.md

Conteúdo obrigatório:

1. Nome final:
   HBX Master

2. Objetivo:
   ser o centro de comando do HBX, dentro do repo /HBX.

3. Fontes existentes:
   - `/ops-control`: saúde técnica, VPS, Docker, logs, Radar Audit.
   - `JhonatanBarata/HBXBOSS`: cockpit pessoal, Kanban, Git seguro, plano do dia, relatórios, Modo IA.
   - `/backend`: APIs do SaaS, Night Factory, usuários, empresas, planos, Atendimento.
   - `/frontend/src/app/master`: Master Command Center atual.
   - `/Webwhats`: entrada de comunicação WhatsApp.

4. Módulos finais:
   - Dashboard
   - Automatizadores
   - Git / PR
   - Testes
   - Ops Control
   - Radar Audit
   - Comunicação
   - Tickets
   - Morning Desk
   - Deploy Control
   - Config

5. Fluxo de trabalho do dono:
   - abrir HBX Master
   - ver Morning Desk
   - analisar tickets
   - ativar automatizadores
   - baixar PR
   - testar
   - mergear
   - publicar
   - responder cliente

6. Regras de segurança:
   - sem shell livre
   - sem deploy automático
   - sem merge automático
   - sem secrets
   - sem migrations automáticas
   - auth/billing/plans sempre HOLD
   - produção só com confirmação manual

7. Fases:
   - Fase 1: docs e fila Codex
   - Fase 2: Local Agent
   - Fase 3: UI Automatizadores
   - Fase 4: Git/PR panel
   - Fase 5: Ops Control embutido
   - Fase 6: Support Ops
   - Fase 7: Deploy Control
   - Fase 8: app Windows final

Não alterar código funcional ainda.

Validação:
não precisa rodar build se só criar docs.

Entrega:
- arquivo criado
- resumo objetivo
## [R] HBX-MASTER-002 — Especificar automatizadores do HBX Master

Leia AGENTS.md primeiro.

Objetivo:
criar a especificação dos automatizadores que ficarão dentro do HBX Master.

Criar:

- docs/HBX_MASTER_AUTOMATIONS.md
- hbx-master/automations/catalog.example.json

Automatizadores obrigatórios:

1. Night Factory
   - status
   - rodar agora
   - pausar
   - ativar automático
   - configurar janela
   - origem: backend `/modules/master/night-factory`

2. MD Task Runner
   - lê `docs/HBX_MASTER_QUEUE.md`
   - transforma tarefas em cards
   - executa apenas aliases seguros
   - nunca executa shell arbitrário

3. Codex Queue Runner
   - lê `docs/HBX_MASTER_CODEX_QUEUE.md`
   - executa `npm run codex:next`
   - coloca resultado em revisão

4. Codex PR Worker
   - cria tarefa Codex para bug seguro
   - cria PR
   - não faz merge
   - não publica

5. Ops Health Watcher
   - consulta ops-control
   - mostra VPS/local
   - alerta se backend, banco, motor ou frontend estiverem ruins

6. Git Morning Sync
   - lista branches
   - lista PRs
   - baixa PR
   - detecta arquivos alterados
   - sugere testes

7. Support Bot Classifier
   - classifica atendimento
   - detecta cliente/vendedor/desconhecido
   - detecta ansiedade/irritação
   - encaminha humano quando necessário

Criar `catalog.example.json` com objetos:

```json
{
  "id": "night-factory",
  "label": "Night Factory",
  "kind": "backend-api",
  "defaultMode": "manual",
  "risk": "medium",
  "allowedActions": ["status", "run-now", "pause", "resume", "save-config"],
  "forbiddenActions": ["deploy", "migration", "secrets"]
}
```

Regras:

documentação e JSON apenas
sem código funcional ainda
sem deploy
sem migrations

Validação:

garantir JSON válido

Entrega:

arquivos criados
resumo

## [R] HBX-MASTER-003 — Local Agent: documentação e allowlist

Leia AGENTS.md primeiro.

Objetivo:
preparar o Local Agent do HBX Master, que executará comandos locais clicáveis no Windows.

Criar:

- hbx-master/local-agent/README.md
- hbx-master/local-agent/allowlist.json
- hbx-master/local-agent/COMMANDS.md

O Local Agent deve ser desenhado para rodar em:

```txt
http://127.0.0.1:3107
```

Regras do Local Agent:

Bind somente em 127.0.0.1.
Token local obrigatório.
Sem endpoint de shell livre.
Só executa comandos da allowlist.
Salva logs.
Não roda comandos perigosos na primeira fase.
Não roda publish/new/force ainda.
Não acessa secrets.
Não imprime .env.

Comandos da allowlist inicial:

```json
{
  "up": {
    "label": "Subir HBX local",
    "command": ["npm", "run", "up"],
    "risk": "medium",
    "confirm": false
  },
  "down": {
    "label": "Desligar HBX local",
    "command": ["npm", "run", "down"],
    "risk": "low",
    "confirm": false
  },
  "frontend-lint": {
    "label": "Frontend lint",
    "command": ["npm", "--prefix", "frontend", "run", "lint"],
    "risk": "low",
    "confirm": false
  },
  "frontend-build": {
    "label": "Frontend build",
    "command": ["npm", "--prefix", "frontend", "run", "build"],
    "risk": "low",
    "confirm": false
  },
  "backend-prisma-validate": {
    "label": "Backend Prisma validate",
    "command": ["npm", "--prefix", "backend", "run", "prisma:validate"],
    "risk": "low",
    "confirm": false
  },
  "backend-build": {
    "label": "Backend build",
    "command": ["npm", "--prefix", "backend", "run", "build"],
    "risk": "low",
    "confirm": false
  },
  "webwhats-typecheck": {
    "label": "Webwhats typecheck",
    "command": ["npm", "--prefix", "Webwhats", "run", "typecheck"],
    "risk": "low",
    "confirm": false
  },
  "webwhats-build": {
    "label": "Webwhats build",
    "command": ["npm", "--prefix", "Webwhats", "run", "build"],
    "risk": "low",
    "confirm": false
  },
  "verify-prod": {
    "label": "Verificar produção",
    "command": ["npm", "run", "verify:prod"],
    "risk": "medium",
    "confirm": true
  }
}
```

O Local Agent deve resolver `npm` para `npm.cmd` no Windows e manter `npm` em Linux/macOS.

Não implementar servidor ainda.

Validação:

JSON válido
documentação clara

Entrega:

arquivos criados
resumo

## [R] HBX-MASTER-004 — Local Agent mínimo em Node

Leia AGENTS.md primeiro.

Objetivo:
implementar o Local Agent mínimo do HBX Master.

Criar:

- hbx-master/local-agent/package.json
- hbx-master/local-agent/server.js
- hbx-master/local-agent/.env.example
- hbx-master/local-agent/scripts/health-check.js
- hbx-master/local-agent/logs/.gitkeep

Adicionar scripts no package raiz:

```json
{
  "master:agent": "node ./hbx-master/local-agent/server.js",
  "master:agent:health": "node ./hbx-master/local-agent/scripts/health-check.js"
}
```

Endpoints:

GET /health
GET /commands
POST /commands/:id/run
GET /runs
GET /runs/:id

Comportamento:

Ler hbx-master/local-agent/allowlist.json.
Exigir header:
Authorization: Bearer <HBX_MASTER_LOCAL_TOKEN>
Se token não existir, recusar iniciar.
Executar apenas comando cadastrado.
Separar comando e args sem shell livre.
Aceitar apenas comandos allowlistados como array `[binario, ...args]`.
Resolver `npm` para `npm.cmd` no Windows antes de executar.
Salvar logs em:
hbx-master/local-agent/logs/<run-id>.log
Cada execução retorna:
id
commandId
status
startedAt
finishedAt
exitCode
logPath

Bloqueios obrigatórios:

recusar qualquer commandId inexistente
recusar comandos com &&, ;, |, >, <, salvo se já estiver explicitamente modelado como array seguro
não imprimir variáveis de ambiente
não ler .env
não aceitar comando enviado pelo body

Não implementar publish/new/force.

Validação:

node ./hbx-master/local-agent/server.js deve iniciar com token
GET /health deve responder ok
GET /commands deve listar allowlist

Se precisar adicionar dependência, usar apenas Express se já for necessário; preferir Node HTTP nativo para diff pequeno.

Entrega:

arquivos criados
comando de teste
riscos

## [R] HBX-MASTER-005 — Windows launcher do HBX Master Local Agent

Leia AGENTS.md primeiro.

Objetivo:
criar scripts Windows para iniciar o Local Agent sem abrir VSCode.

Criar:

- hbx-master/local-agent/start-hbx-master-agent.ps1
- hbx-master/local-agent/run-hbx-master-agent.cmd
- hbx-master/local-agent/install-startup.example.ps1

Comportamento:

1. Verificar se está na raiz do HBX.
2. Verificar Node.
3. Verificar se `HBX_MASTER_LOCAL_TOKEN` existe.
4. Iniciar:
   `node ./hbx-master/local-agent/server.js`
5. Mostrar URL:
   `http://127.0.0.1:3107`

Não colocar token real.
Não criar startup automaticamente.
`install-startup.example.ps1` deve ser exemplo, não instalação automática.

Atualizar:
- hbx-master/local-agent/README.md

Validação:
- scripts com instrução clara
- sem secrets

Entrega:
- arquivos criados
## [ ] HBX-MASTER-006 — Manual-first para Night Factory

Leia AGENTS.md primeiro.

Objetivo:
ajustar a Night Factory para ser controlada pelo HBX Master, não rodar solta sem o dono perceber.

Tarefa:

1. Revisar:
   - backend/src/night-factory/night-factory.types.ts
   - backend/src/night-factory/night-factory.service.ts
   - backend/src/night-factory/night-factory.worker.ts
   - backend/src/night-factory/night-factory.controller.ts

2. Garantir que:
   - endpoints status/run-now/pause/resume/config continuem funcionando.
   - `run-now` funcione mesmo se automático estiver pausado.
   - modo automático só rode se `enabled=true`.
   - status deixe claro se está:
     - dormindo
     - rodando
     - pausado
     - manual
     - erro

3. Alterar padrão para manual-first se seguro:
   - `DEFAULT_NIGHT_FACTORY_CONFIG.enabled = false`

4. Documentar em:
   - docs/HBX_MASTER_NIGHT_FACTORY.md

Não alterar regra comercial.
Não alterar planos.
Não alterar billing.
Não criar migration.
Não fazer deploy.

Validação:
- npm --prefix backend run build

Entrega:
- resumo
- arquivos alterados
- comportamento antes/depois
## [R] HBX-MASTER-007 — Tela Automatizadores no Master Command Center

Leia AGENTS.md primeiro.

Objetivo:
adicionar a primeira tela visual de Automatizadores dentro de `/master`.

Arquivos prováveis:

- frontend/src/app/master/_command-center/MasterCommandCenter.tsx
- frontend/src/app/master/_command-center/MasterCommandCenter.module.css
- criar componente se fizer sentido:
  frontend/src/app/master/_command-center/MasterAutomationsPanel.tsx

Adicionar aba superior:

```txt
Automatizadores

Cards iniciais:

Night Factory
status: carregar se houver API disponível; senão mock controlado
botões:
Status
Rodar agora
Pausar
Ativar
MD Task Runner
status: aguardando Local Agent
botões desabilitados:
Executar próxima
Abrir fila
Codex Queue Runner
status: manual
botões:
Mostrar comando npm run codex:next
Ops Control
status: local
botões:
Abrir Ops Control
Auditar VPS
Git / PR Worker
status: planejado
botões desabilitados:
Buscar PRs
Baixar PR
```

Regras:

botões destrutivos desabilitados por enquanto
texto em PT-BR
não mexer em billing/auth/plans
sem deploy
sem migrations
diff pequeno

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo
screenshots textuais do que foi adicionado

## [R] HBX-MASTER-008 — Bridge frontend para Local Agent

Leia AGENTS.md primeiro.

Objetivo:
permitir que a tela Automatizadores consulte o Local Agent local.

Criar:

- frontend/src/app/master/_command-center/localAgentClient.ts

Funções:

```ts
getLocalAgentHealth()
getLocalAgentCommands()
runLocalAgentCommand(commandId: string)
```

Regras:

Base URL padrão:
http://127.0.0.1:3107
Token:
por enquanto ler de localStorage:
hbx_master_local_token
Se token não existir:
retornar erro amigável:
Configure o token local do HBX Master.
Nunca enviar comando livre.
Apenas enviar commandId.
Tratar Local Agent offline sem quebrar a página.

Atualizar painel Automatizadores para:

mostrar status do Local Agent
listar comandos disponíveis
permitir rodar apenas:
up
down
frontend-lint
frontend-build

Não adicionar publish/new/force ainda.

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo
arquivos alterados

## [R] HBX-MASTER-009 — Git/PR workflow documentado

Leia AGENTS.md primeiro.

Objetivo:
documentar o fluxo Git/PR que o HBX Master vai controlar.

Criar:

- docs/HBX_MASTER_GIT_PR_WORKFLOW.md

Conteúdo obrigatório:

1. Estados:
   - master atualizado
   - PR listado
   - PR baixado
   - teste rodando
   - teste passou
   - teste falhou
   - merge liberado
   - merge feito
   - publicação pendente
   - publicado

2. Comandos seguros:
   - git status --short
   - git branch --all
   - git fetch origin
   - gh pr list
   - gh pr checkout <n>
   - gh pr view <n>
   - gh pr merge <n> --squash

3. Comandos proibidos inicialmente:
   - git reset
   - git clean
   - git push direto
   - merge automático
   - force
   - publish automático

4. Detecção de risco por arquivo:
   - .env
   - secrets
   - migrations
   - auth
   - billing
   - commercial-plans
   - deploy
   - docker-compose
   - scripts/ops

5. Teste por área:
   - frontend
   - backend
   - Webwhats
   - e2e

6. Botão futuro:
   `Merge + próximo`

Não alterar código.

Validação:
não precisa build.

Entrega:
- arquivo criado
## [R] HBX-MASTER-010 — Local Agent: comandos Git somente leitura

Leia AGENTS.md primeiro.

Objetivo:
adicionar comandos Git seguros ao Local Agent.

Adicionar endpoints:

```txt
GET /git/status
GET /git/branches
GET /git/current
GET /git/remotes
GET /git/last-commit

Comandos permitidos:

git status --short
git branch --all
git branch --show-current
git remote -v
git log -1 --pretty=format:%H%n%s%n%cd
```

Regras:

somente leitura
sem checkout ainda
sem merge
sem pull
sem push
sem reset
sem clean
salvar logs
retornar JSON estruturado

Atualizar:

hbx-master/local-agent/README.md
hbx-master/local-agent/COMMANDS.md

Validação:

iniciar Local Agent
chamar endpoints manualmente

Entrega:

resumo
endpoints criados

## [R] HBX-MASTER-011 — UI Git/PR somente leitura

Leia AGENTS.md primeiro.

Objetivo:
criar painel Git/PR dentro do Master, inicialmente somente leitura.

Adicionar aba:

```txt
Git / PR
```

Mostrar:

branch atual
último commit
git status curto
branches locais/remotas
aviso se workspace está sujo

Usar Local Agent:

GET /git/status
GET /git/branches
GET /git/current
GET /git/last-commit

Se Local Agent estiver offline:
mostrar orientação para rodar:

npm run master:agent

Regras:

sem checkout
sem pull
sem merge
sem publish
sem comandos destrutivos

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

## [R] HBX-MASTER-012 — Local Agent: checkout de PR com trava

Leia AGENTS.md primeiro.

Objetivo:
permitir baixar PR pelo HBX Master, mas com travas.

Adicionar endpoint:

```txt
POST /git/checkout-pr
```

Body:

```json
{
  "prNumber": 128
}
```

Comportamento:

Validar prNumber inteiro positivo.
Rodar git status --short.
Se workspace sujo, recusar.
Verificar se gh existe.
Rodar:
gh pr checkout <prNumber>
Salvar log.
Retornar:
branch atual
status
arquivos alterados contra master, se possível

Bloqueios:

sem merge
sem push
sem reset
sem clean
sem shell livre

Atualizar docs.

Validação:

se gh não existir, retornar erro amigável
não quebrar Local Agent

Entrega:

resumo

## [R] HBX-MASTER-013 — UI: baixar PR e detectar tipo de teste

Leia AGENTS.md primeiro.

Objetivo:
no painel Git/PR, permitir informar número do PR e baixar localmente.

UI:

- campo: número do PR
- botão: Baixar PR
- estado: baixando / baixado / erro
- mostrar branch atual depois

Depois de baixar, detectar área provável:

- arquivos em frontend/ → frontend
- arquivos em backend/ → backend
- arquivos em Webwhats/ → webwhats
- arquivos em tests/e2e/ → e2e
- arquivos em migrations/auth/billing/secrets/deploy → HOLD

Mostrar comandos sugeridos:

Frontend:

```txt
npm --prefix frontend run lint
npm --prefix frontend run build
```

Backend:

```txt
npm --prefix backend run prisma:validate
npm --prefix backend run build
```

Webwhats:

```txt
npm --prefix Webwhats run typecheck
npm --prefix Webwhats run build
```

Regras:

não implementar merge ainda
não implementar publish
se HOLD, mostrar alerta e bloquear fluxo automático

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

## [R] HBX-MASTER-014 — Local Agent: executar testes por área

Leia AGENTS.md primeiro.

Objetivo:
permitir rodar testes seguros a partir do HBX Master.

Adicionar endpoints:

```txt
POST /test/frontend
POST /test/backend
POST /test/webwhats
POST /test/e2e
```

Mapeamento:

Frontend:

npm --prefix frontend run lint
npm --prefix frontend run build

Backend:

npm --prefix backend run prisma:validate
npm --prefix backend run build

Webwhats:

npm --prefix Webwhats run typecheck
npm --prefix Webwhats run build

E2E:

npm run test:e2e

Comportamento:

rodar sequencial
parar no primeiro erro
salvar logs
retornar resumo:
passed
failed
commands
logPath

Regras:

não rodar publish
não rodar migrations
não rodar force
não acessar secrets

Validação:

testar endpoint com comando leve, se possível frontend-lint

Entrega:

resumo

## [R] HBX-MASTER-015 — UI: painel de testes clicáveis

Leia AGENTS.md primeiro.

Objetivo:
criar painel de testes dentro do HBX Master.

Adicionar aba:

```txt
Testes

Ou integrar no painel Git/PR.

Cards:

Frontend
Lint
Build
Rodar pacote frontend
Backend
Prisma validate
Build
Rodar pacote backend
Webwhats
Typecheck
Build
E2E
Playwright
```

Cada card deve mostrar:

último status
horário
log resumido
botão copiar log
botão abrir log se possível

Regras:

sem publish
sem merge
sem deploy
manter PT-BR

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

## [R] HBX-MASTER-016 — Ops Control bridge documentado

Leia AGENTS.md primeiro.

Objetivo:
documentar como o HBX Master consome o Ops Control existente.

Criar:

- docs/HBX_MASTER_OPS_CONTROL_BRIDGE.md
- hbx-master/ops-control/README.md

Conteúdo:

1. Ops Control roda em:
   `http://127.0.0.1:3099`

2. Endpoints:
   - `/api/overview`
   - `/api/containers`
   - `/api/logs/:name`
   - `/api/radar-audit/vps`
   - `/api/radar-audit/localhost`
   - `/api/quick/:target/:action`

3. Segurança:
   - token obrigatório
   - sem shell livre
   - ações Docker allowlistadas
   - VPS via SSH
   - localhost via Docker local

4. Como aparecer no HBX Master:
   - Saúde VPS
   - Saúde local
   - Containers
   - Logs
   - Radar Audit
   - Motores
   - Ações rápidas

Não alterar ops-control ainda.

Validação:
não precisa build.

Entrega:
- docs criadas
## [R] HBX-MASTER-017 — UI: Ops Control dentro do Master

Leia AGENTS.md primeiro.

Objetivo:
adicionar aba Ops Control no Master.

Adicionar aba:

```txt
Ops Control
```

Campos de configuração local:

Ops Control URL:
http://127.0.0.1:3099
Token local:
salvo em localStorage como hbx_ops_control_token

Exibir:

status do Ops Control
RAM
CPU/load
disco
containers rodando
botão atualizar
botão auditar Radar VPS
botão auditar Radar localhost

Consumir:

GET /api/overview
GET /api/radar-audit/vps
GET /api/radar-audit/localhost

Se offline:
mostrar instrução para iniciar Ops Control.

Regras:

sem ações restart ainda
leitura primeiro
sem secrets no código
token apenas localStorage

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

## [R] HBX-MASTER-018 — Morning Desk operacional

Leia AGENTS.md primeiro.

Objetivo:
criar o Morning Desk como arquivo e tela-base.

Criar:

- docs/HBX_MORNING_DESK.md
- docs/HBX_MORNING_DESK_SPEC.md

Conteúdo do arquivo:

```md
# HBX Morning Desk

## PRs para testar

## Tickets recebidos

## Automatizadores

## HOLDs aguardando dono

## Saúde VPS

## Radar Audit

## Publicações pendentes

## Clientes aguardando retorno
```

Especificação deve dizer:

o que entra automaticamente
o que depende do dono
quais botões o HBX Master terá
como marcar item como resolvido
como criar “lição de casa” de manhã

Não implementar UI ainda.

Validação:
não precisa build.

Entrega:

arquivos criados

## [R] HBX-MASTER-019 — UI Morning Desk

Leia AGENTS.md primeiro.

Objetivo:
criar aba Morning Desk no Master.

Adicionar aba:

```txt
Morning Desk
```

Conteúdo inicial:

PRs para testar
tickets pendentes
automatizadores ativos
HOLDs
status VPS
próximo passo recomendado

Por enquanto, pode usar dados mockados locais e/ou ler endpoints já existentes se seguro.

Botões:

Atualizar
Copiar plano do dia
Abrir Git/PR
Abrir Automatizadores
Abrir Ops Control

Regras:

sem backend novo
sem migrations
sem deploy
texto PT-BR

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

## [R] HBX-MASTER-020 — Support Ops especificação

Leia AGENTS.md primeiro.

Objetivo:
especificar suporte/tickets/clientes dentro do HBX Master.

Criar:

- docs/HBX_SUPPORT_OPS_SPEC.md

Conteúdo:

1. Entrada:
   - Webwhats
   - chat do HBX
   - botão Reportar problema
   - vendedor interno

2. Detecção:
   - cliente HBX
   - vendedor nosso
   - lead
   - desconhecido

3. Tipo de problema:
   - Atendimento / WhatsApp
   - Radar
   - Vendas
   - Login / acesso
   - Pagamento / plano
   - Lentidão
   - Erro visual
   - Outro

4. Tom emocional:
   - normal
   - ansioso
   - irritado
   - urgente
   - encaminhar humano

5. Resposta sem IA:
   - recebido
   - código gerado
   - aguardando análise

6. Classificações:
   - USER_ERROR
   - BUG_SAFE
   - BUG_RISKY
   - COMMERCIAL_ACCESS
   - AUTH_SECURITY
   - VPS_HEALTH
   - RADAR_BLOCK
   - WEBWHATS_FAIL
   - NEEDS_HUMAN

7. Códigos:
   - HBX-SUP
   - HBX-BUG
   - HBX-EDU
   - HBX-SAFE
   - HBX-HOLD
   - HBX-RFC
   - HBX-TEST

8. Quando acionar Codex:
   - apenas BUG_SAFE
   - nunca auth/billing/plans/secrets/migrations/deploy

9. Quando responder cliente:
   - recebido imediatamente
   - bug em análise
   - PR em validação
   - correção aplicada após deploy validado

Não criar banco ainda.
Não criar migrations.

Validação:
não precisa build.

Entrega:
- arquivo criado
## [R] HBX-MASTER-021 — Draft de modelos de banco Support Ops sem migration

Leia AGENTS.md primeiro.

Objetivo:
criar apenas o rascunho técnico dos modelos de suporte, sem migration.

Criar:

- docs/HBX_SUPPORT_OPS_DATA_MODEL.md

Modelos propostos:

- SupportTicket
- SupportMessage
- SupportAttachment
- SupportTriage
- SupportCodexTask
- SupportCustomerReply

Para cada modelo, descrever:

- campos
- tipo
- índices necessários
- relações
- estados
- riscos
- dados sensíveis

Regras:
- não editar schema.prisma
- não criar migration
- não alterar backend funcional
- documentação apenas

Validação:
não precisa build.

Entrega:
- arquivo criado
## [R] HBX-MASTER-022 — Codex PR Worker especificação

Leia AGENTS.md primeiro.

Objetivo:
documentar o trabalhador que cria tarefas Codex a partir de tickets seguros.

Criar:

- docs/HBX_CODEX_PR_WORKER_SPEC.md

Conteúdo:

1. Entrada:
   - ticket BUG_SAFE
   - arquivos anexos
   - rota afetada
   - usuário/empresa
   - logs do Ops Control, se existirem

2. Saída:
   - GitHub issue
   - tarefa Codex
   - branch
   - PR
   - comentário de teste
   - registro no Morning Desk

3. Regras:
   - 1 bug = 1 PR
   - PR pequeno
   - máximo 5 arquivos por padrão
   - sem auth
   - sem billing
   - sem planos
   - sem migrations
   - sem secrets
   - sem deploy
   - sem merge automático

4. Tipos:
   - HBX-SAFE
   - HBX-HOLD
   - HBX-RFC
   - HBX-TEST

5. Prompt padrão do Codex.

6. Como pedir ajuste:
   - comentar no PR com log de falha
   - pedir correção mantendo escopo

Não implementar ainda.

Validação:
não precisa build.

Entrega:
- arquivo criado
## [R] HBX-MASTER-023 — Deploy Control especificação

Leia AGENTS.md primeiro.

Objetivo:
especificar como o HBX Master controla publicação sem automatizar risco.

Criar:

- docs/HBX_MASTER_DEPLOY_CONTROL.md

Comandos existentes:

- npm run new
- npm run publish
- npm run verify:prod
- npm run force

Regras:

1. `new`
   - permitido só em master
   - git status limpo
   - confirmação digitada: PUBLICAR

2. `publish`
   - permitido só em master
   - git status limpo
   - confirmação digitada: PUBLICAR

3. `verify:prod`
   - permitido manualmente
   - recomendado após publish/new

4. `force`
   - bloqueado na primeira versão do HBX Master
   - só documentado como emergência

5. Nunca:
   - publicar branch de PR
   - publicar com teste falhando
   - publicar com HOLD
   - publicar sem confirmação

Não implementar ainda.

Validação:
não precisa build.

Entrega:
- arquivo criado
## [R] HBX-MASTER-024 — Local Agent: Deploy Control com trava

Leia AGENTS.md primeiro.

Objetivo:
implementar apenas a verificação de produção no Local Agent e deixar ações de publicação documentadas, mas desabilitadas.

Adicionar comandos:

- verify-prod

Não adicionar `deploy-new`, `deploy-publish` ou `force` nesta fase.

Endpoints:

```txt
POST /deploy/verify-prod
```

Regras:

verify-prod pode rodar com confirmação simples.
new/publish ficam apenas documentados no bloco 023 e desabilitados no Local Agent.
Salvar log.
Retornar status.
Nunca rodar force.
Nunca expor endpoint, alias ou comando executável para new/publish nesta fase.

Validação:

testar verify-prod se seguro
garantir que new/publish não existem na allowlist nem nos endpoints

Entrega:

resumo
riscos

## [R] HBX-MASTER-025 — UI Deploy Control

Leia AGENTS.md primeiro.

Objetivo:
criar aba Deploy Control no HBX Master.

Adicionar aba:

```txt
Deploy
```

Mostrar:

branch atual
último commit
git status
último teste
último deploy
botões:
Verificar produção
Deploy seletivo
Deploy normal

Regras UI:

Deploy seletivo e normal aparecem desabilitados nesta fase.
Não chamar `/deploy/new` nem `/deploy/publish`.
Documentar visualmente que new/publish ficam para fase posterior.
Mostrar aviso grande:
“Produção só muda depois desta ação.”

Não incluir force.

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

## [R] HBX-MASTER-026 — App Windows final: especificação

Leia AGENTS.md primeiro.

Objetivo:
especificar o app Windows final chamado HBX Master.

Criar:

- docs/HBX_MASTER_WINDOWS_APP.md

Decidir arquitetura recomendada:

Opção A:
- app Windows leve que abre o frontend `/master`
- Local Agent em 127.0.0.1
- Ops Control em 127.0.0.1:3099
- sem duplicar UI

Opção B:
- app Python/Tkinter herdando HBXBOSS
- mais rápido, mas UI menos integrada

Opção C:
- Electron/Tauri
- mais integrado, mas maior custo

Recomendação:
usar Opção A inicialmente:
- navegador/app shell
- tudo dentro do `/HBX`
- Local Agent + frontend Master

Conteúdo obrigatório:

- como abrir
- como instalar atalho
- como iniciar Local Agent
- como iniciar Ops Control
- como autenticar token local
- como evitar múltiplas janelas
- como fazer self-check

Não implementar ainda.

Validação:
não precisa build.

Entrega:
- arquivo criado
## [R] HBX-MASTER-027 — HBX Master: README final

Leia AGENTS.md primeiro.

Objetivo:
criar README final do HBX Master.

Criar:

- hbx-master/README.md

Conteúdo:

1. O que é
2. Como rodar
3. Como iniciar Local Agent
4. Como iniciar Ops Control
5. Como usar Automatizadores
6. Como usar Git/PR
7. Como testar PR
8. Como publicar
9. Como analisar atendimentos
10. Como usar Morning Desk
11. O que nunca fazer
12. Comandos principais

Comandos principais:

```powershell
npm run master:agent
npm run codex:status
npm run codex:next
npm run up
npm run down
npm run verify:prod
```

Regras:

docs apenas
sem código funcional novo

Validação:
não precisa build.

Entrega:

README criado

## [R] HBX-MASTER-028 — Revisão final da fase 1

Leia AGENTS.md primeiro.

Objetivo:
revisar tudo que foi criado até agora e gerar relatório.

Criar:

- docs/HBX_MASTER_PHASE_1_REPORT.md

Conteúdo:

1. Arquivos criados
2. Arquivos alterados
3. O que já funciona
4. O que ainda é mock
5. Quais comandos foram validados
6. Quais riscos existem
7. Próxima fase recomendada
8. O que o dono precisa testar manualmente

Rodar validações mínimas conforme arquivos alterados:

Se frontend alterado:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
```

Se backend alterado:

```bash
npm --prefix backend run prisma:validate
npm --prefix backend run build
```

Se Local Agent alterado:

```bash
node ./hbx-master/local-agent/server.js
```

ou explicar se não foi possível por falta de token.

Regras:

não fazer deploy
não fazer commit
não fazer push
não alterar produção

Entrega:

relatório final
comandos passados/falhados
próximos passos

Use assim:

```powershell
npm run codex:status
npm run codex:next
```

Depois que uma tarefa ficar como [R], revise o diff. Se estiver ok, rode de novo:

```powershell
npm run codex:next
```

O Codex vai para a próxima pendente sem misturar tudo.


