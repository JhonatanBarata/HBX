# Deploy Hostinger

Este é o fluxo principal de produção do HBX desde a migração do backend para a VPS Hostinger.

## Arquitetura atual

- Frontend: Vercel em `https://www.hbxsystem.com.br`
- Backend: VPS Hostinger em `https://api.hbxsystem.com.br`
- Banco: Supabase remoto
- DNS: Cloudflare com A record `api` apontando para o IP da VPS Hostinger
- Proxy: Nginx na VPS encaminhando `api.hbxsystem.com.br` para o NestJS em `127.0.0.1:3000`
- HTTPS: Certbot habilitado para `api.hbxsystem.com.br`
- Container: Docker rodando o backend no container `hbx-backend`

## Domínios oficiais

- API: `https://api.hbxsystem.com.br`
- Frontend: `https://www.hbxsystem.com.br`

## Variáveis e segurança

Use `.env.hostinger.example` como referência para o ambiente da VPS e `.env.production.example` como referência para comandos operacionais locais.

Arquivos locais com valores reais nunca devem ser commitados:

- `.env.production.local`
- `.env.ops.local`
- `.env.operations.local`
- `backend/.env`
- `backend/.env.local`

A `DATABASE_URL` de produção deve manter o pool saudável para Supabase:

```env
?sslmode=require&connection_limit=10&pool_timeout=60
```

Não commitar `.env` reais, senhas, tokens, backups, `postgres-data`, dumps ou arquivos locais.

## Fluxo pós-commit

Fluxo correto:

```text
local -> git push -> VPS -> git pull/reset -> docker-compose rebuild
```

Depois de commitar no `master`, o deploy automatizado local deve ser feito com o comando padrão:

```powershell
npm run publish
```

Esse script roda preflight local, faz `git push origin master`, entra na VPS via SSH, atualiza o diretório da aplicação e reconstrói o Docker.

`npm run deploy:hostinger` existe como alias explícito para o mesmo fluxo.

## Deploy manual na VPS

Na VPS atual o comando disponível é `docker-compose`, não `docker compose`.

```bash
cd /caminho/do/app
git pull
docker-compose down
docker-compose up -d --build
docker ps
```

Se a VPS futura tiver o plugin novo, `docker compose` também pode ser usado. Para a VPS atual, mantenha `docker-compose`.

## Testes de produção

Teste health direto:

```bash
curl -I https://api.hbxsystem.com.br/health
```

Teste CORS a partir do frontend oficial:

```bash
curl -I -H "Origin: https://www.hbxsystem.com.br" https://api.hbxsystem.com.br/health
```

Também valide o frontend em:

```text
https://www.hbxsystem.com.br
```

## Troca futura de VPS

Para trocar de VPS sem mudar os domínios públicos:

1. Subir a nova VPS com Docker, Nginx e Certbot.
2. Restaurar o backup necessário do app/configuração e confirmar `.env` real fora do git.
3. Rodar o backend em `127.0.0.1:3000`.
4. Apontar o A record `api` no Cloudflare para o novo IP.
5. Reemitir ou validar o certificado HTTPS do `api.hbxsystem.com.br`.
6. Rodar os testes de health e CORS.

O frontend não precisa trocar a URL se `https://api.hbxsystem.com.br` continuar como domínio oficial.

## Checklist antes de remover o provedor antigo

- Confirmar que `https://api.hbxsystem.com.br/health` responde pela VPS Hostinger.
- Confirmar CORS com `Origin: https://www.hbxsystem.com.br`.
- Confirmar que o Cloudflare aponta `api` para o IP da VPS Hostinger.
- Confirmar que Nginx faz proxy para `127.0.0.1:3000`.
- Confirmar que Certbot/HTTPS está válido para `api.hbxsystem.com.br`.
- Confirmar que o container `hbx-backend` está rodando.
- Confirmar que o frontend Vercel usa `NEXT_PUBLIC_API_URL=https://api.hbxsystem.com.br`.
- Confirmar que o banco usado é o Supabase remoto correto.
- Confirmar que `DATABASE_URL` usa `connection_limit=10` e `pool_timeout=60`.
- Confirmar que não há webhooks ou integrações externas apontando para domínio antigo.
- Confirmar backup recente antes de remover qualquer serviço antigo.

## Checklist antes de refund/troca de VPS

- Criar backup do banco/Supabase ou confirmar restore point.
- Salvar inventário de variáveis reais fora do git.
- Exportar ou documentar configuração Nginx do `api.hbxsystem.com.br`.
- Confirmar que Certbot pode ser refeito na nova VPS.
- Confirmar que o repositório está atualizado no remoto.
- Confirmar que `docker-compose.yml` e Dockerfile constroem o backend.
- Confirmar que backups, dumps e dados locais não foram commitados.
- Testar restauração em nova VPS antes de desligar a antiga, quando possível.

## Comando oficial

```powershell
npm run commit
npm run publish
```

`npm run commit` continua criando o commit no `master`. `npm run publish` agora publica no Hostinger.
