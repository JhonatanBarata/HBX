# HBX SaaS

Aplicação SaaS multi-tenant com backend NestJS, frontend Next.js, Prisma e PostgreSQL.

## Fluxo oficial

- Desenvolvimento local: `npm run up`
- Encerramento local: `npm run down`
- Seed local controlado: `npm run seed:dev`
- Publicação de código: `npm run publish`
- Backup do banco de produção: `npm run backup:prod`
- Verificação pós-deploy: `npm run verify:prod`

`npm run publish` valida o projeto, cria backup do banco remoto, publica o código, verifica o deploy e mantém apenas o backup remoto mais recente quando tudo termina bem. Ele não sincroniza automaticamente o banco local para produção.

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

O fluxo oficial completo está em [docs/SAAS_OPERATIONS.md](docs/SAAS_OPERATIONS.md).

## Observações

- `npm run up` recusa `backend/.env` apontando para banco remoto no host, para evitar abrir Prisma Studio ou ferramentas locais contra produção por engano.
- `npm run publish` roda preflight de Prisma, build e coerência estrutural antes de qualquer commit/push.
- `npm run publish` também faz backup remoto antes do push e só rota backups antigos quando a verificação pós-deploy passa.
- `npm run backup:prod` e `npm run verify:prod` recusam targets locais e só aceitam URLs remotas de produção.
- O bootstrap do usuário master é controlado por ambiente; em produção o padrão oficial continua sendo `BOOTSTRAP_SYSTEM_MASTER=false`.
- Os comandos operacionais de produção usam variáveis documentadas em [.env.production.example](.env.production.example).