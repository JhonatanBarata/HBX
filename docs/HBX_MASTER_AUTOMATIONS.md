# HBX Master Automations

## Night Factory

- Origem: backend e motores Radar.
- Acoes: status, rodar agora, pausar, retomar e salvar configuracao.
- Modo padrao: manual-first.
- Risco: medio.

## MD Task Runner

- Le `docs/HBX_MASTER_QUEUE.md`.
- Transforma tarefas em cards.
- Executa apenas aliases seguros.
- Nunca executa shell arbitrario.

## Codex Queue Runner

- Le `docs/HBX_MASTER_CODEX_QUEUE.md`.
- Executa `npm run codex:next`.
- Coloca resultado em revisao `[R]`.
- Nao faz commit, push, merge ou deploy.

## Codex PR Worker

- Recebe ticket `BUG_SAFE`.
- Cria tarefa Codex e PR pequeno.
- Nao faz merge.
- Nao publica.

## Ops Health Watcher

- Consulta Ops Control.
- Mostra VPS/local, containers e Radar Audit.
- Alertas viram itens do Morning Desk.

## Git Morning Sync

- Lista branch atual, ultimo commit, status e branches.
- Baixa PR com workspace limpo.
- Sugere testes por area alterada.

## Support Bot Classifier

- Classifica atendimento.
- Detecta cliente, vendedor, lead ou desconhecido.
- Detecta ansiedade, irritacao e urgencia.
- Encaminha humano quando necessario.
