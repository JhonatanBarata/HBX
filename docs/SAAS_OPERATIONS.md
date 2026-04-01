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
4. Quando quiser consolidar alteracoes, rode `npm run commit -- "mensagem aqui"` no `master`.
5. Antes de publicar, rode `npm run publish -- --dry-run` se quiser validar a estrutura atual sem push.
6. Quando o codigo ja estiver commitado no `master`, rode `npm run publish`.
7. O `publish` cria um backup novo do banco remoto, publica o `HEAD` atual do `master` e espera a verificacao pos-deploy.
8. Se a verificacao passar, o fluxo remove backups remotos anteriores e mantem apenas o backup mais recente.
9. Se a verificacao falhar, os backups anteriores sao preservados para rollback.

## Scripts Finais

- `npm run up`: sobe backend local em Docker, frontend local e valida `http://localhost:3000/health` e `http://localhost:3001`; Prisma Studio sobe somente quando `backend/.env` estiver pronto para uso local no host.
- `npm run down`: derruba o ambiente local.
- `npm run build`: executa build de backend e frontend a partir da raiz.
- `npm run commit`: faz `git add -A` na estrutura principal e cria um commit unico no `master`, sem push automatico.
- `npm run publish`: valida repo limpo no `master`, ambiente local, Prisma, seed estrutural e builds; cria backup remoto; faz push do `HEAD` atual; verifica o deploy; e rotaciona backups antigos apenas em caso de sucesso.
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

No backend publicado, valide tambem as variaveis de runtime abaixo:

- `JWT_SECRET`: assinatura dos access tokens.
- `INTEGRATION_SECRET_KEY`: obrigatoria para criptografar e descriptografar credenciais de `IntegrationConnection` sem expor segredo puro no banco ou na API.

Sem `INTEGRATION_SECRET_KEY`, o backend ainda consegue subir, mas os fluxos de conexao e sync de integracoes ficam indisponiveis ate a variavel ser configurada no ambiente publicado.

Regra pratica para `INTEGRATION_SECRET_KEY`:

- gere um valor forte e estavel por ambiente;
- nao troque esse valor sem plano de rotacao, porque conexoes AUVO e TAGPLUS persistidas deixam de ser descriptografaveis;
- trate essa variavel como segredo operacional, nunca como dado versionado.

## Integracoes AUVO e TagPlus

O backend agora suporta adapters HTTP reais para AUVO e TagPlus, mas a homologacao continua dependente do contrato efetivo liberado por cada fornecedor.

Variaveis de runtime do backend para AUVO:

- `AUVO_API_BASE_URL`: base URL do tenant ou ambiente AUVO.
- `AUVO_AUTH_MODE`: `app_key_token_query` por padrao; use `bearer_token` apenas se seu contrato oficial exigir.
- `AUVO_APP_KEY`: obrigatoria quando `AUVO_AUTH_MODE=app_key_token_query`.
- `AUVO_EXTERNAL_ACCOUNT_ID`: opcional; enviado quando o contrato exigir identificacao extra da conta.
- `AUVO_TEST_PATH`: endpoint minimo para teste de conexao real.
- `AUVO_CUSTOMERS_PATH`: endpoint dedicado de clientes, se existir.
- `AUVO_TASKS_PATH`: endpoint de tarefas/OS usado para sync principal.
- `AUVO_UPDATED_SINCE_PARAM`, `AUVO_PAGE_PARAM`, `AUVO_PAGE_SIZE_PARAM`, `AUVO_PAGE_SIZE`: controles de incremental e paginacao.
- `AUVO_PENDING_STATUS_PARAM`, `AUVO_PENDING_STATUS_VALUES`: filtros operacionais para backlog aberto quando o contrato suportar.
- `AUVO_TIMEOUT_MS`, `AUVO_RETRY_ATTEMPTS`, `AUVO_RETRY_BACKOFF_MS`: timeout, retry limitado e backoff simples.

Variaveis de runtime do backend para TagPlus:

- `TAGPLUS_API_BASE_URL`: base URL do ambiente TagPlus.
- `TAGPLUS_AUTH_MODE`: `bearer_token` por padrao; use `query_token` apenas se o contrato oficial exigir.
- `TAGPLUS_EXTERNAL_ACCOUNT_ID`: opcional; enviado quando necessario.
- `TAGPLUS_TEST_PATH`: endpoint minimo para teste de conexao real.
- `TAGPLUS_CUSTOMERS_PATH`: endpoint dedicado de clientes, se existir.
- `TAGPLUS_RECEIVABLES_PATH`: endpoint de titulos/cobrancas usado no sync principal.
- `TAGPLUS_UPDATED_SINCE_PARAM`, `TAGPLUS_PAGE_PARAM`, `TAGPLUS_PAGE_SIZE_PARAM`, `TAGPLUS_PAGE_SIZE`: controles de incremental e paginacao.
- `TAGPLUS_TIMEOUT_MS`, `TAGPLUS_RETRY_ATTEMPTS`, `TAGPLUS_RETRY_BACKOFF_MS`: timeout, retry limitado e backoff simples.

Regras praticas para homologacao:

- nao esconder endpoint assumido no codigo; declare tudo por variavel de ambiente ou override na conexao;
- use `baseUrl`, `authMode`, `externalAccountId` e, no caso da AUVO, `appKey`, somente quando o contrato real do cliente pedir;
- se `*_CUSTOMERS_PATH` nao estiver configurado, o sync de clientes dedicados e ignorado de forma explicita;
- se `AUVO_TASKS_PATH` ou `TAGPLUS_RECEIVABLES_PATH` nao estiver configurado, o sync real nao deve ser tratado como homologado.

O fluxo oficial de publicacao assume `origin/master` como destino unico.

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

Esse comando valida que o fluxo novo esta coerente sem push e sem alterar o historico git.