# Deploy no Render (Docker + Postgres) — passos mínimos

Resumo rápido
- Objetivo: subir o Evolution API no Render usando o Dockerfile do repositório e um Postgres gerenciado.
- Não é obrigatório usar Redis (vamos desabilitá-lo).

Passos mínimos

1) Criar o banco Postgres (Managed)
   - No painel do Render: New → PostgreSQL.
   - Escolha plano e crie o DB.
   - Após criado, copie a Primary DB Connection String (algo como `postgres://USER:PASS@HOST:5432/DB_NAME`).

2) Criar o Web Service (Docker)
   - New → Web Service → Conecte o repositório e branch desejado.
   - Escolha "Dockerfile" (o repositório já tem um Dockerfile configurado).

3) Variáveis de ambiente (Web Service)
   Adicione pelo menos estas variáveis no painel do serviço (Environment → Environment Variables):

   - `DATABASE_PROVIDER` = `postgresql`
   - `DATABASE_URL` = copie a Primary DB Connection String do passo 1
   - `DATABASE_CONNECTION_URI` = copie o mesmo valor de `DATABASE_URL` (a aplicação usa este nome)
   - `DATABASE_CONNECTION_CLIENT_NAME` = `evolution` (opcional)
   - `CACHE_REDIS_ENABLED` = `false`
   - `CACHE_LOCAL_ENABLED` = `true`
   - `AUTHENTICATION_API_KEY` = (defina uma chave segura para sua API)
   - `DOCKER_ENV` = `true` (opcional, está definido no Dockerfile final)
   - `SERVER_URL` = `https://<seu-servico>.onrender.com` (opcional)

   Importante: o container precisa ouvir na porta que o Render fornece. No painel do Render defina:

   - `SERVER_PORT` = `$PORT`

   (O valor `$PORT` refere-se à variável que o Render fornece no runtime. Se o painel não permitir usar `$PORT` diretamente,
   use o Start Command alternativo abaixo.)

4) Start Command (fallback)
   Se você não puder setar `SERVER_PORT=$PORT` no painel, substitua o Start Command do serviço por este (advanced):

   sh -lc "export SERVER_PORT=$PORT && . ./Docker/scripts/deploy_database.sh && npm run start:prod"

   Observação: o Dockerfile do projeto já possui um ENTRYPOINT que executa `./Docker/scripts/deploy_database.sh` e `npm run start:prod`.
   O ponto crítico é garantir que `SERVER_PORT` esteja definido com o valor do `PORT` fornecido pelo Render.

5) Deploy e verificação
   - Inicie o deploy e acompanhe os logs.
   - O entrypoint do container rodará as migrações (procure por "Migration succeeded").
   - Quando o servidor subir, deverá aparecer o log com a porta (ex.: `HTTP - ON: <port>`).

Dicas e troubleshooting
- Se o serviço falhar na etapa de migração, verifique nos logs se `DATABASE_URL` e `DATABASE_CONNECTION_URI` estão corretos.
- Se houver erro de porta/health check, confirme se `SERVER_PORT` foi corretamente definido para `$PORT`.
- Se quiser executar comandos manuais (one-off) no container: use o Shell/Console do Render e rode `npm run db:deploy` ou `npm run db:generate`.

Resumo das variáveis mínimas (para colar rápido)

```
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgres://<USER>:<PASS>@<HOST>:5432/<DB>
DATABASE_CONNECTION_URI=postgres://<USER>:<PASS>@<HOST>:5432/<DB>
CACHE_REDIS_ENABLED=false
CACHE_LOCAL_ENABLED=true
AUTHENTICATION_API_KEY=<sua-chave>
SERVER_PORT=$PORT
```

Pronto — com isso o Render deverá construir a imagem (Dockerfile), rodar as migrações e expor a API.
