# HBX Master — controle de execução Codex

Este arquivo é a fonte operacional para aplicar os blocos do HBX Master em ordem. Os nomes e IDs dos blocos abaixo devem ser preservados; o progresso fica registrado nesta seção de controle e nos resumos adicionados depois de cada etapa executada.

## Legenda

- `[ ]` pendente
- `[~]` em execução
- `[R]` pronto para revisão manual
- `[x]` feito e validado
- `[!]` bloqueado ou com erro registrado
- `[>]` pulado por decisão manual

## Fila resumida

| Status | Bloco |
| --- | --- |
| [x] | Organização inicial deste arquivo |
| [ ] | BLOCO 00 — Bootstrap da fila Codex do HBX Master |
| [ ] | HBX-MASTER-001 — Documento central da arquitetura HBX Master |
| [ ] | HBX-MASTER-002 — Especificar automatizadores do HBX Master |
| [ ] | HBX-MASTER-003 — Local Agent: documentação e allowlist |
| [ ] | HBX-MASTER-004 — Local Agent mínimo em Node |
| [ ] | HBX-MASTER-005 — Windows launcher do HBX Master Local Agent |
| [ ] | HBX-MASTER-006 — Manual-first para Night Factory |
| [ ] | HBX-MASTER-007 — Tela Automatizadores no Master Command Center |
| [ ] | HBX-MASTER-008 — Bridge frontend para Local Agent |
| [ ] | HBX-MASTER-009 — Git/PR workflow documentado |
| [ ] | HBX-MASTER-010 — Local Agent: comandos Git somente leitura |
| [ ] | HBX-MASTER-011 — UI Git/PR somente leitura |
| [ ] | HBX-MASTER-012 — Local Agent: checkout de PR com trava |
| [ ] | HBX-MASTER-013 — UI: baixar PR e detectar tipo de teste |
| [ ] | HBX-MASTER-014 — Local Agent: executar testes por área |
| [ ] | HBX-MASTER-015 — UI: painel de testes clicáveis |
| [ ] | HBX-MASTER-016 — Ops Control bridge documentado |
| [ ] | HBX-MASTER-017 — UI: Ops Control dentro do Master |
| [ ] | HBX-MASTER-018 — Morning Desk operacional |
| [ ] | HBX-MASTER-019 — UI Morning Desk |
| [ ] | HBX-MASTER-020 — Support Ops especificação |
| [ ] | HBX-MASTER-021 — Draft de modelos de banco Support Ops sem migration |
| [ ] | HBX-MASTER-022 — Codex PR Worker especificação |
| [ ] | HBX-MASTER-023 — Deploy Control especificação |
| [ ] | HBX-MASTER-024 — Local Agent: Deploy Control com trava |
| [ ] | HBX-MASTER-025 — UI Deploy Control |
| [ ] | HBX-MASTER-026 — App Windows final: especificação |
| [ ] | HBX-MASTER-027 — HBX Master: README final |
| [ ] | HBX-MASTER-028 — Revisão final da fase 1 |

## Direção ajustada pelo dono

O HBX Master deve virar o app único de comando. A direção final é juntar o que hoje está separado entre HBX-BOSS e Ops Control dentro de uma experiência só, criada dentro deste repo, com identidade final HBX Master.

Importante:

- não renomear os IDs e títulos dos blocos deste arquivo;
- não implementar a unificação antes de revisar este plano;
- não fazer deploy, publish, migrations, merge automático ou mudança comercial;
- tratar HBX-BOSS e Ops Control como fontes de capacidade, não como produtos finais separados;
- apagar vestígios internos dos nomes antigos somente quando a etapa correspondente for executada e testada;
- manter o fluxo principal do HBX: Radar -> Vendas -> WhatsApp -> Retorno.

## Plano de unificação HBX Master

1. Consolidar documentação e fila Codex.
   - Criar a fila operacional do HBX Master.
   - Separar tarefas pequenas, revisáveis e testáveis.
   - Manter tudo sem deploy e sem migração.

2. Mapear HBX-BOSS e Ops Control.
   - Registrar quais telas, comandos, rotinas e dados serão reaproveitados.
   - Definir o que entra como módulo do HBX Master.
   - Definir o que vira legado e será removido depois.

3. Criar o núcleo do HBX Master.
   - Usar o frontend `/master` como centro de comando.
   - Criar `hbx-master/` para Local Agent, docs, allowlists e bridges.
   - Preservar backend como fonte de verdade para auth, planos e autorização comercial.

4. Trazer Ops Control para dentro do Master.
   - Começar por leitura: saúde VPS/local, containers, logs e Radar Audit.
   - Depois adicionar ações rápidas allowlistadas.
   - Não expor shell livre.

5. Trazer HBX-BOSS para dentro do Master.
   - Incorporar cockpit pessoal, Kanban, plano do dia, Git seguro e Modo IA.
   - Transformar o que for útil em Morning Desk, Git/PR, Testes e Automatizadores.
   - Remover nomenclatura antiga após cada módulo estar funcionando no Master.

6. Criar o app final.
   - Nome final: HBX Master.
   - O app abre o `/master` e conversa com Local Agent e Ops Control local.
   - O usuário enxerga um produto só, mesmo que alguns serviços continuem separados por dentro no começo.

7. Limpeza final.
   - Remover atalhos, docs, labels, rotas e referências antigas que confundirem o dono.
   - Só remover depois de confirmar que a capacidade equivalente existe no HBX Master.
   - Validar frontend/backend/local agent conforme a área tocada.

## Resumo de execução

- 2026-06-05: organização inicial do controle no topo do arquivo.
- 2026-06-05: direção ajustada para unificar HBX-BOSS e Ops Control no HBX Master; execução pausada para revisão do plano antes de aplicar os blocos.

## Blocos originais preservados

Primeiro comando

No VSCode, abra o terminal na raiz do HBX:

cd C:\Users\Jhonatan\Desktop\App

Crie este arquivo:

docs/CODEX_BOOTSTRAP_HBX_MASTER.md

Cole nele o BLOCO 00 abaixo.

Depois rode:

Get-Content .\docs\CODEX_BOOTSTRAP_HBX_MASTER.md -Raw | codex exec --cd . --sandbox workspace-write -

Depois que esse bloco terminar, você passa a usar:

npm run codex:status
npm run codex:next

A partir daqui, seguem os blocos para colar no .md.

# BLOCO 00 — Bootstrap da fila Codex do HBX Master

Leia AGENTS.md primeiro.

Objetivo:
criar o mecanismo mínimo para o HBX usar uma fila .md de tarefas do Codex, uma por vez, sem o Codex se perder.

Criar os arquivos:

- docs/HBX_MASTER_CODEX_QUEUE.md
- scripts/codex/hbx-codex-queue.js
- scripts/codex/README.md

Alterar package.json adicionando scripts:

```json
{
  "codex:status": "node ./scripts/codex/hbx-codex-queue.js status",
  "codex:next": "node ./scripts/codex/hbx-codex-queue.js next",
  "codex:show": "node ./scripts/codex/hbx-codex-queue.js show",
  "codex:skip": "node ./scripts/codex/hbx-codex-queue.js skip"
}

Comportamento do script:

Ler docs/HBX_MASTER_CODEX_QUEUE.md.
Procurar o primeiro bloco com título começando por:
## [ ]
Extrair o conteúdo desse bloco até o próximo ##.
Salvar o prompt extraído em:
.codex/hbx-next-task.md
Marcar o bloco como:
## [~]
Rodar:
codex exec --cd . --sandbox workspace-write - < .codex/hbx-next-task.md
Quando o Codex terminar sem erro, marcar o bloco como:
## [R]
onde R significa “revisar”.
Não marcar como concluído automaticamente.
Não fazer commit.
Não fazer push.
Não fazer deploy.
Não usar danger-full-access.
Não executar npm run publish, npm run new, npm run force ou migrations.
Se o Codex falhar, marcar como:
## [!]
e registrar o log em:
.codex/logs/<task-id>.log

Formato esperado da fila:

## [ ] HBX-MASTER-001 — Título da tarefa

Prompt completo aqui.

O comando status deve mostrar:

pendentes
rodando
revisão
bloqueadas
concluídas

O comando show deve mostrar a próxima tarefa sem executar.

O comando skip deve marcar a próxima tarefa pendente como [>] pulada.

Criar docs/HBX_MASTER_CODEX_QUEUE.md inicialmente com os blocos 01 a 05 vazios, só como modelo.

Validação:

node ./scripts/codex/hbx-codex-queue.js status
node ./scripts/codex/hbx-codex-queue.js show

Regras:

diff pequeno
sem dependência nova
sem deploy
sem migrations
sem secrets
manter PT-BR

Entrega:

resumo dos arquivos criados
comandos testados
como usar npm run codex:next

```md
## [ ] HBX-MASTER-001 — Documento central da arquitetura HBX Master

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
## [ ] HBX-MASTER-002 — Especificar automatizadores do HBX Master

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

```md
## [ ] HBX-MASTER-003 — Local Agent: documentação e allowlist

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

{
  "up": {
    "label": "Subir HBX local",
    "command": "npm run up",
    "risk": "medium",
    "confirm": false
  },
  "down": {
    "label": "Desligar HBX local",
    "command": "npm run down",
    "risk": "low",
    "confirm": false
  },
  "frontend-lint": {
    "label": "Frontend lint",
    "command": "npm --prefix frontend run lint",
    "risk": "low",
    "confirm": false
  },
  "frontend-build": {
    "label": "Frontend build",
    "command": "npm --prefix frontend run build",
    "risk": "low",
    "confirm": false
  },
  "backend-prisma-validate": {
    "label": "Backend Prisma validate",
    "command": "npm --prefix backend run prisma:validate",
    "risk": "low",
    "confirm": false
  },
  "backend-build": {
    "label": "Backend build",
    "command": "npm --prefix backend run build",
    "risk": "low",
    "confirm": false
  },
  "webwhats-typecheck": {
    "label": "Webwhats typecheck",
    "command": "npm --prefix Webwhats run typecheck",
    "risk": "low",
    "confirm": false
  },
  "webwhats-build": {
    "label": "Webwhats build",
    "command": "npm --prefix Webwhats run build",
    "risk": "low",
    "confirm": false
  },
  "verify-prod": {
    "label": "Verificar produção",
    "command": "npm run verify:prod",
    "risk": "medium",
    "confirm": true
  }
}

Não implementar servidor ainda.

Validação:

JSON válido
documentação clara

Entrega:

arquivos criados
resumo

```md
## [ ] HBX-MASTER-004 — Local Agent mínimo em Node

Leia AGENTS.md primeiro.

Objetivo:
implementar o Local Agent mínimo do HBX Master.

Criar:

- hbx-master/local-agent/package.json
- hbx-master/local-agent/server.js
- hbx-master/local-agent/.env.example
- hbx-master/local-agent/logs/.gitkeep

Adicionar scripts no package raiz:

```json
{
  "master:agent": "node ./hbx-master/local-agent/server.js",
  "master:agent:health": "node ./hbx-master/local-agent/scripts/health-check.js"
}

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

```md
## [ ] HBX-MASTER-005 — Windows launcher do HBX Master Local Agent

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
## [ ] HBX-MASTER-007 — Tela Automatizadores no Master Command Center

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

```md
## [ ] HBX-MASTER-008 — Bridge frontend para Local Agent

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

```md
## [ ] HBX-MASTER-009 — Git/PR workflow documentado

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
## [ ] HBX-MASTER-010 — Local Agent: comandos Git somente leitura

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

```md
## [ ] HBX-MASTER-011 — UI Git/PR somente leitura

Leia AGENTS.md primeiro.

Objetivo:
criar painel Git/PR dentro do Master, inicialmente somente leitura.

Adicionar aba:

```txt
Git / PR

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

```md
## [ ] HBX-MASTER-012 — Local Agent: checkout de PR com trava

Leia AGENTS.md primeiro.

Objetivo:
permitir baixar PR pelo HBX Master, mas com travas.

Adicionar endpoint:

```txt
POST /git/checkout-pr

Body:

{
  "prNumber": 128
}

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

```md
## [ ] HBX-MASTER-013 — UI: baixar PR e detectar tipo de teste

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

Backend:

npm --prefix backend run prisma:validate
npm --prefix backend run build

Webwhats:

npm --prefix Webwhats run typecheck
npm --prefix Webwhats run build

Regras:

não implementar merge ainda
não implementar publish
se HOLD, mostrar alerta e bloquear fluxo automático

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

```md
## [ ] HBX-MASTER-014 — Local Agent: executar testes por área

Leia AGENTS.md primeiro.

Objetivo:
permitir rodar testes seguros a partir do HBX Master.

Adicionar endpoints:

```txt
POST /test/frontend
POST /test/backend
POST /test/webwhats
POST /test/e2e

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

```md
## [ ] HBX-MASTER-015 — UI: painel de testes clicáveis

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

```md
## [ ] HBX-MASTER-016 — Ops Control bridge documentado

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
## [ ] HBX-MASTER-017 — UI: Ops Control dentro do Master

Leia AGENTS.md primeiro.

Objetivo:
adicionar aba Ops Control no Master.

Adicionar aba:

```txt
Ops Control

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

```md
## [ ] HBX-MASTER-018 — Morning Desk operacional

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

```md
## [ ] HBX-MASTER-019 — UI Morning Desk

Leia AGENTS.md primeiro.

Objetivo:
criar aba Morning Desk no Master.

Adicionar aba:

```txt
Morning Desk

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

```md
## [ ] HBX-MASTER-020 — Support Ops especificação

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
## [ ] HBX-MASTER-021 — Draft de modelos de banco Support Ops sem migration

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
## [ ] HBX-MASTER-022 — Codex PR Worker especificação

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
## [ ] HBX-MASTER-023 — Deploy Control especificação

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
## [ ] HBX-MASTER-024 — Local Agent: Deploy Control com trava

Leia AGENTS.md primeiro.

Objetivo:
adicionar comandos de deploy controlado ao Local Agent, mas com trava forte.

Adicionar comandos:

- verify-prod
- deploy-new
- deploy-publish

Não adicionar force.

Endpoints:

```txt
POST /deploy/verify-prod
POST /deploy/new
POST /deploy/publish

Regras:

verify-prod pode rodar com confirmação simples.
new exige:
branch atual = master
git status limpo
body.confirmation = "PUBLICAR"
publish exige:
branch atual = master
git status limpo
body.confirmation = "PUBLICAR"
Salvar log.
Retornar status.
Nunca rodar force.
Nunca rodar se branch não for master.
Nunca rodar se workspace sujo.

Validação:

testar verify-prod se seguro
não rodar new/publish no teste real; criar teste seco/mock se necessário

Entrega:

resumo
riscos

```md
## [ ] HBX-MASTER-025 — UI Deploy Control

Leia AGENTS.md primeiro.

Objetivo:
criar aba Deploy Control no HBX Master.

Adicionar aba:

```txt
Deploy

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

Deploy seletivo e normal começam desabilitados.
Só liberar se:
branch master
workspace limpo
testes passaram
usuário digitou PUBLICAR
Mostrar aviso grande:
“Produção só muda depois desta ação.”

Não incluir force.

Validação:

npm --prefix frontend run lint
npm --prefix frontend run build

Entrega:

resumo

```md
## [ ] HBX-MASTER-026 — App Windows final: especificação

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
## [ ] HBX-MASTER-027 — HBX Master: README final

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

Regras:

docs apenas
sem código funcional novo

Validação:
não precisa build.

Entrega:

README criado

```md
## [ ] HBX-MASTER-028 — Revisão final da fase 1

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

Se backend alterado:

npm --prefix backend run prisma:validate
npm --prefix backend run build

Se Local Agent alterado:

node ./hbx-master/local-agent/server.js

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

Depois que uma tarefa ficar como [R], revise o diff. Se estiver ok, rode de novo:

npm run codex:next

O Codex vai para a próxima pendente sem misturar tudo.
