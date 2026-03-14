# HBX Frontend

Frontend principal do HBX em Next.js.

## Ambiente local

1. Instale dependencias com `npm install`
2. Crie `frontend/.env.local` com:
   - `NEXT_PUBLIC_API_URL=http://localhost:3000`
3. Rode `npm run dev`

## Deploy na Vercel

1. Suba este repositorio no GitHub
2. Na Vercel, clique em `Add New > Project`
3. Importe o repositorio do HBX
4. Defina `Root Directory` como `frontend`
5. Framework Preset: `Next.js`
6. Configure a variavel de ambiente:
   - `NEXT_PUBLIC_API_URL=https://URL-DO-BACKEND`
7. Confirme que os comandos estao assim:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: vazio
8. Clique em `Deploy`

## Variaveis de ambiente

- `NEXT_PUBLIC_API_URL`
  - URL publica do backend NestJS
  - Exemplo local: `http://localhost:3000`
  - Exemplo producao: `https://api.hbx.com.br`

## Observacao

Este frontend depende do backend NestJS para autenticacao, dados dos modulos e operacoes do painel.
