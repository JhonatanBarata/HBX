# HBX AI Commands

Comandos para agentes explorarem o repo sem abrir tudo manualmente.

## Estado e inventario

```powershell
git status --short
rg --files -g '!node_modules/**' -g '!.git/**' -g '!postgres-data/**' -g '!storage/**' -g '!backups/**' -g '!.worktrees/**'
Get-ChildItem -Directory
```

## Produto e instrucoes

```powershell
Get-Content AGENTS.md
Get-Content docs\ai\AI_CONTEXT.md
Get-Content docs\ai\PRODUCT_INVARIANTS.md
Get-Content docs\ai\AI_ENTRYPOINTS.md
```

## Backend

```powershell
Get-Content backend\src\app.module.ts
Get-Content backend\src\main.ts
rg "^(model|enum) " backend\prisma\schema.prisma
Get-ChildItem backend\src -Directory
Get-ChildItem backend\src -Recurse -Include *.module.ts,*.controller.ts,*.service.ts,*.guard.ts,*.decorator.ts
```

## Frontend

```powershell
Get-Content frontend\src\app\layout.tsx
Get-ChildItem frontend\src\app -Recurse -File -Include page.tsx,page.client.tsx,page.module.css,route.ts
Get-ChildItem frontend\src\components -File
Get-ChildItem frontend\src\lib -File
rg "HbxGuide1|hbx-guide1|HbxGuide4|hbx-guide4|hbx-guide5" frontend\src
```

## Radar

```powershell
rg "Radar|radar|Webscraping|webscraping" backend\src frontend\src hbx-scraping-engine\app tests
rg "negative|negativo|recusado|perdido|duplic" backend\src frontend\src tests
Get-ChildItem backend\src\webscraping\radar -Recurse -File
Get-Content backend\src\webscraping\radar\01-search\README.md
Get-Content backend\src\webscraping\radar\02-filter\README.md
Get-Content backend\src\webscraping\radar\03-enrichment\README.md
```

## Vendas

```powershell
rg "Vendas|vendas|lead|timeline|complaint|commission|automation" backend\src\vendas frontend\src\app\vendas tests
Get-ChildItem backend\src\vendas -File
Get-ChildItem frontend\src\app\vendas -Recurse -File
```

## WhatsApp

```powershell
rg "WhatsApp|whatsapp|Webwhats|inbox|conversation|consent" backend\src frontend\src Webwhats\src docs
Get-Content Webwhats\AGENTS.md
Get-ChildItem backend\src\messaging -File
Get-ChildItem Webwhats\src\api -Directory
```

## Comercial e acesso

```powershell
rg "plan|quota|entitlement|subscription|billing|commercial|feature|payment|mercado" backend\src frontend\src
Get-ChildItem backend\src\commercial-plans -File
Get-ChildItem backend\src\modules -File
```

## Checks padrao

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Backend:

```powershell
cd backend
npm run prisma:validate
npm run build
```

E2E:

```powershell
npm run test:e2e
```

Nao rode deploy, publish, release ou restart de producao em manutencao normal.

