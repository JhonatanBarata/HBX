# HBX SaaS

Aplicação SaaS multi-tenant com backend NestJS, frontend Next.js, Prisma e PostgreSQL.

## Fluxo oficial

- Ambiente local: `npm run up` / `npm run down`
- Deploy normal Hostinger: `npm run publish`
- Deploy seletivo do que mudou: `npm run new`
- Rebuild/restart completo com backup: `npm run force`
- Verificacao completa de producao: `npm run verify:prod`

`npm run publish` detecta mudancas, mostra diff resumido, cria commit automatico quando necessario e executa o deploy Hostinger normal. O build local e o push ficam concentrados no deploy para evitar trabalho duplicado.

`npm run new` cria commit automatico quando necessario, detecta os arquivos alterados contra `origin/master`, faz push e atualiza na VPS apenas os servicos afetados.

`npm run force` cria backup antes de qualquer acao destrutiva, cria commit/push quando necessario, para containers/processos HBX, sobe tudo novamente, roda migrations Prisma dentro do container `hbx-backend`, verifica Docker/backend/frontend/banco/logs e termina com o servidor em uso.

## Ambientes

- Local é ambiente de desenvolvimento e pode conter testes, lixo temporário e dados descartáveis.
- Produção é ambiente real e só deve receber código, migrations e bootstrap estrutural idempotente.
- Dados operacionais reais não devem nascer no banco local esperando subir com publish.

## Seeds estruturais

As definições estruturais do sistema ficam centralizadas em [backend/src/bootstrap/structural-defaults.json](backend/src/bootstrap/structural-defaults.json).

Isso inclui:
- módulos globais padrão;
- planos e features padrão;
- permissões padrão de importação por role;
- seed local controlado para desenvolvimento.

## Documentação operacional

Os comandos oficiais estao documentados em [OPS.md](OPS.md).

O fluxo oficial completo está em [docs/SAAS_OPERATIONS.md](docs/SAAS_OPERATIONS.md).

Para salvar o projeto antes de formatar a maquina e reconstruir o ambiente depois, use [docs/FORMATAR_PC_CHECKLIST.md](docs/FORMATAR_PC_CHECKLIST.md).

## Observações

- `npm run up` recusa `backend/.env` apontando para banco remoto no host, para evitar abrir Prisma Studio ou ferramentas locais contra produção por engano.
- `npm run up` valida backend em `http://localhost:3000/health` e frontend em `http://localhost:3001`; Prisma Studio vira opcional se `backend/.env` nao estiver pronto para o host.
- `npm run publish` roda preflight de Prisma, build e health minimo no fluxo de deploy.
- Mudancas em `frontend/` entram no build Docker `hbx-frontend` na Hostinger.
- `npm run force` salva backup local em `backups/ops/<timestamp>` e tenta dump seguro de producao antes de parar processos.
- `npm run verify:prod` recusa targets locais e só aceita URLs remotas de produção.
- O bootstrap do usuário master é controlado por ambiente; em produção o padrão oficial continua sendo `BOOTSTRAP_SYSTEM_MASTER=false`.
- Os comandos operacionais de produção usam variáveis documentadas em [.env.production.example](.env.production.example).
