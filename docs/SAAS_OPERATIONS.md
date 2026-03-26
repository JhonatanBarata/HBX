# Operacao Oficial do SaaS

## Arquitetura Recomendada

O projeto passa a operar com separacao explicita entre estrutura e operacao:

- Desenvolvimento local: codigo, testes, experimentacao, seeds de desenvolvimento e rollback rapido.
- Producao: dados reais, migrations aplicadas, configuracao segura e verificacao pos-deploy.
- Seed estrutural: estado idempotente e versionado que pode ser reaplicado com seguranca.
- Dados operacionais: empresas reais, usuarios reais, conversas, mensagens, importacoes e historico de uso. Esses dados nao sobem via publish.

### Separacao recomendada

- Seed estrutural: `SystemModule`, `Plan`, `Feature`, conectores `PlanFeatures`, backfill de `CompanyModule` faltante e permissoes padrao de `ImportacaoPermissao`.
- Dados operacionais: `Company`, `User`, `Conversation`, `OutboundMessage`, `Importacao` e qualquer entidade gerada por uso real.
- Bootstrap de modulos: mantido por migration + runtime + seed estrutural idempotente.
- Usuario master: bootstrap controlado, nunca como sync do banco local. Em producao fica desabilitado por `BOOTSTRAP_SYSTEM_MASTER=false`.
- Credenciais do master: definidas por ambiente quando o bootstrap estiver ativo; nao sao mais tratadas como dado operacional sincronizavel.
- Planos/features: estruturais e versionados.
- Permissoes padrao: estruturais e versionadas, sem sobrescrever operacao fora do escopo definido.

## Fluxo Oficial de Trabalho

1. Suba o ambiente local com `npm run up`.
2. Se precisar de base limpa e previsivel para desenvolvimento, rode `npm run seed:dev`.
3. Desenvolva localmente, teste, refatore e descarte dados locais sem medo.
4. Antes de publicar, rode `npm run publish -- --dry-run` se quiser validar sem commit/push.
5. Quando o codigo estiver pronto, rode `npm run publish`.
6. O proprio `publish` cria um backup novo do banco remoto, publica o codigo e espera a verificacao pos-deploy.
7. Se a verificacao passar, o fluxo remove backups remotos anteriores e mantem apenas o backup mais recente.
8. Se a verificacao falhar, os backups anteriores sao preservados para rollback.

## Scripts Finais

- `npm run up`: sobe backend local em Docker, frontend local e Prisma Studio com protecao contra banco remoto no host.
- `npm run down`: derruba o ambiente local.
- `npm run publish`: valida repo, ambiente local, Prisma, seed estrutural e builds; cria backup remoto; faz commit/push; verifica o deploy; e rotaciona backups antigos apenas em caso de sucesso.
- `npm run seed:dev`: aplica seed estrutural no banco local e cria um sandbox de desenvolvimento previsivel.
- `npm run backup:prod`: gera dump SQL do banco remoto em `backups/prod/<timestamp>/` e recusa localhost por seguranca.
- `npm run verify:prod`: verifica health endpoint, status de migrations e coerencia estrutural do banco de producao, sempre contra URLs remotas.

## O Que Sobe no Publish

- codigo versionado;
- migrations Prisma versionadas;
- bootstrap estrutural versionado;
- configuracao de deploy versionada;
- ajustes de frontend/backend que dependem do codigo publicado.

## O Que Nao Sobe no Publish

- dados do PostgreSQL local;
- usuarios e empresas criados apenas para teste local;
- historico operacional gerado localmente;
- dumps, backups e artefatos locais;
- arquivos `.env*.local` e segredos de operacao.

## Rollback

O rollback oficial fica separado em duas camadas:

- Codigo: revert de commit e novo deploy da plataforma.
- Dados: restore a partir do backup remoto mais recente criado por `npm run publish` ou manualmente por `npm run backup:prod`.

Regra pratica: rollback de codigo nao deve assumir rollback automatico de dados. Se uma migration estrutural mudar schema de producao, o rollback de dados deve ser tratado explicitamente com backup anterior.

## Variaveis Operacionais

Crie um arquivo local baseado em [.env.production.example](.env.production.example):

- `PROD_BACKEND_URL`: URL publica do backend para healthcheck.
- `PROD_FRONTEND_URL`: URL publica do frontend para validacao simples.
- `PROD_DATABASE_URL`: conexao do banco remoto para backup e verificacao.
- `PUBLISH_REMOTE`: remoto git do publish, padrao `origin`.
- `PUBLISH_BRANCH`: branch de destino do publish, padrao `master`.

## Webscraping no Render

O modulo webscraping pode operar de duas formas no deploy:

- caminho preferencial: backend aponta para `WEBSCRAPING_INTERNAL_URL` via private network do Render;
- fallback operacional: backend aponta para `WEBSCRAPING_UPSTREAM_URL` com a URL publica HTTPS do servico webscraping.

Regra pratica:

- se a ligacao privada entre `hbx-backend` e `hbx-webscraping` estiver saudavel, mantenha `WEBSCRAPING_INTERNAL_URL`;
- se o ambiente publicado continuar retornando `503 upstream_unreachable`, configure manualmente `WEBSCRAPING_UPSTREAM_URL` no backend com a URL publica do servico e redeploye o backend;
- `npm run verify:prod` valida `https://<frontend>/hbx/webscraping/_stcore/health`, entao qualquer quebra desse modulo passa a falhar no pos-deploy.

## Primeiro Passo Exato de Implementacao

O primeiro passo operacional, daqui para frente, e criar seu arquivo local de operacao a partir de [.env.production.example](.env.production.example), preencher `PROD_BACKEND_URL`, `PROD_FRONTEND_URL` e `PROD_DATABASE_URL`, e em seguida executar:

```bash
npm run publish -- --dry-run
```

Esse comando valida que o fluxo novo esta coerente sem publicar nada.