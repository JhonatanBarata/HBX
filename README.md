# HBX SaaS

Aplicação SaaS multi-tenant com backend NestJS, frontend Next.js, Prisma e PostgreSQL.

## Fluxo oficial

- Release sem restart de produção: `npm run release`
- Deploy normal Hostinger: `npm run publish`
- Rebuild/restart completo com backup: `npm run force`

Os comandos auxiliares foram movidos para scripts `internal:*` para evitar fluxos duplicados na raiz.

`npm run release` detecta mudancas, mostra arquivos alterados, roda validacoes rapidas, cria commit automatico quando necessario, faz push e valida backend/frontend sem reiniciar producao.

`npm run publish` detecta mudancas, mostra diff resumido, cria commit automatico quando necessario, faz push, builda backend/frontend, executa o deploy Hostinger existente e valida backend/frontend.

`npm run force` cria backup antes de qualquer acao destrutiva, cria commit/push quando necessario, para containers/processos HBX, sobe tudo novamente, roda migrations Prisma dentro do container `hbx-backend`, verifica Docker/PM2/backend/frontend/banco/logs e termina com o servidor em uso.

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
- `npm run publish` roda preflight de Prisma, build e coerência estrutural no fluxo de deploy.
- Mudancas em `frontend/` entram no build PM2 `hbx-frontend` na Hostinger.
- `npm run force` salva backup local em `backups/ops/<timestamp>` e tenta dump seguro de producao antes de parar processos.
- `internal:backup:prod` e `internal:verify:prod` recusam targets locais e só aceitam URLs remotas de produção.
- O bootstrap do usuário master é controlado por ambiente; em produção o padrão oficial continua sendo `BOOTSTRAP_SYSTEM_MASTER=false`.
- Os comandos operacionais de produção usam variáveis documentadas em [.env.production.example](.env.production.example).
