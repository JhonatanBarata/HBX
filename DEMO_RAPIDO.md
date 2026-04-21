# Demo Rápido

Este documento mostra passos rápidos para subir um ambiente de demonstração local (apenas para desenvolvimento/demo). As instruções assumem Windows + PowerShell.

Pré-requisitos
- Docker & Docker Compose
- Node.js 20+ e npm (para rodar o frontend localmente e scripts de seed)

Opções de demo (recomendado)

1) Orquestrar backend + DB (Docker)

Abra PowerShell na raiz do projeto e execute:

```powershell
docker-compose up -d
```

O `docker-compose.yml` sobe o Postgres e o backend (o backend no Docker faz `prisma db push` e inicia em modo dev).

2) Preparar e rodar seeds (criar usuário MASTER e empresa/demo)

Aguarde o Postgres iniciar (alguns segundos). No PowerShell:

```powershell
cd backend
npm install
npx prisma generate
# Informe a string de conexão apontando para o Postgres levantado pelo docker-compose
$env:DATABASE_URL = 'postgresql://admin:admin123@localhost:5432/jhonatan_dev'
# (opcional) aplicar migrations: npx prisma migrate deploy

# Criar usuário MASTER (script já existente)
node scripts/create-master.js

# Criar company + user demo (usa variáveis opcionais abaixo)
$env:SEED_COMPANY_SLUG='demo'
$env:SEED_USER_EMAIL='demo@demo.com'
$env:SEED_USER_PASSWORD='demo123'
node scripts/create-company-and-user.js
```

Saída esperada: comandos imprimirão ids e emails criados. Anote os emails/senhas para login no dashboard.

3) Rodar frontend (local, recomendado para desenvolvimento/demo)

No PowerShell (nova aba):

```powershell
cd frontend
npm install
npm run dev
```

Frontend por padrão roda em `http://localhost:3001` (veja `frontend/package.json`). Backend em `http://localhost:3000`.

Credenciais padrão (se usadas as defaults dos scripts)
- Master (criador): ver saída de `create-master.js` — por padrão o script usa `jbinformatica1100@gmail.com` / `Perspective` (poderá variar se você setar variáveis)
- Empresa demo: `demo@demo.com` / `demo123` (se seguiu o passo de seed acima)

Notas e dicas rápidas
- Se preferir não usar Docker: rode Postgres localmente e aponte `DATABASE_URL` para ele; rode `npm run start:dev` no `backend`.
- Para demos rápidos em Windows, você também pode usar `scripts/start-all.ps1` (ele orquestra componentes locais). Se houver erro ao executar, prefira `docker-compose up -d`.
- Para reset do banco local via Prisma, use o Postgres local definido em `DATABASE_URL`.

Próximos passos que posso automatizar para você
- Gerar um `scripts/demo-up.ps1` que executa os passos acima de forma automatizada (docker up + wait + seed). Quer que eu gere isso?
- Verificar se há secrets expostos no repo antes de você compartilhar o demo publicamente.

---
Arquivo criado automaticamente para ajudar demonstrações rápidas.
