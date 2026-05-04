# HBX Frontend

Frontend principal do HBX em Next.js.

## Ambiente local

1. Instale dependencias com `npm install`
2. Crie `frontend/.env.local` com:
   - `NEXT_PUBLIC_API_URL=http://localhost:3000`
3. Rode `npm run dev`

## Deploy na Hostinger

O frontend oficial sobe no Docker pela VPS Hostinger usando `docker-compose.hostinger.yml`.

Variavel obrigatoria no build:

- `NEXT_PUBLIC_API_URL=https://api.hbxsystem.com.br`

Comando principal na raiz do repositorio:

```bash
docker compose -f docker-compose.hostinger.yml up -d --build frontend
```

## Variaveis de ambiente

- `NEXT_PUBLIC_API_URL`
  - URL publica do backend NestJS
  - Exemplo local: `http://localhost:3000`
  - Exemplo producao: `https://api.hbxsystem.com.br`

## Observacao

Este frontend depende do backend NestJS para autenticacao, dados dos modulos e operacoes do painel.
