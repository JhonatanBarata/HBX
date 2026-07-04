# HBX Website Kit

Kit de templates e sites de cliente (Firebase Hosting + Functions). Ver
`docs/Rules/WEBSITE-KIT.md` (regra do domínio — leia antes de mexer aqui) e
`docs/PLANEJAMENTOS/WEBSITE-KIT/` (histórico das sprints 1-3).

> **Extração planejada:** este diretório (`backend/website-kit/`) tem um
> script de extração pra um repo próprio (`hbx-sites`), preparado e NÃO
> executado — ver `docs/PLANEJAMENTOS/WEBSITE-KIT/extract-website-kit.ps1`.
> Antes de reorganizar pastas aqui, confira se não conflita com esse plano.

## Estrutura

```
backend/website-kit/
├── README.md                    (este arquivo)
├── projects.json                 fonte legada de companyId → template/projectId
│                                  (frágil, caminho absoluto — sendo substituída
│                                  por hbx.website.json por cliente + banco)
├── schema/
│   ├── site.config.schema.json   contrato do site.config.json (Sprint 3 / T1)
│   └── site.config.example.json  exemplo pronto pra copiar
├── templates/
│   ├── abner-firebase/source     template com Functions (Mercado Pago)
│   ├── diego-firebase/source     template hosting-only
│   └── hbx-master-saas/source    site do PRÓPRIO HBX (não é template de cliente)
└── companies/
    └── <slug>/
        ├── site.config.json      config-driven do cliente (T1)
        ├── site/                 cópia do template + stamp (gerada por new-site)
        ├── hbx.website.json      metadado do provisionamento (gerado)
        ├── HBX-DEPLOY.md         checklist de deploy do cliente (gerado)
        └── assets-manifest.json  manifest de imagens → Storage (T4, gerado)
```

## T1 — `site.config.json` (config-driven, zero fork de código)

Cada cliente tem **um arquivo de config**, nunca uma cópia editada à mão do
template. Schema completo em `schema/site.config.schema.json`; comece
copiando `schema/site.config.example.json` para
`companies/<slug>/site.config.json` e preenchendo:

- `companySlug`, `companyName`, `companyId` (se já houver `Company.id` no HBX).
- `templateKey`: `abner-firebase` ou `diego-firebase` (`hbx-master-saas` fica
  de fora — é o site do próprio HBX).
- `firebaseProjectId`: Project ID do Firebase do cliente (criado manualmente
  no console — 1 projeto por cliente, ver regra dura do domínio).
- `tokens`: cores em hex, stampadas nas CSS custom properties (`:root`) do
  template. Mesmo espírito das 5 Leis do Design System do app principal: cor
  nasce em token, nunca solta em tela.
- `assets`: pasta LOCAL (fora do repo) com as fotos reais do cliente — nunca
  aponta pra dentro do git (ver T4).
- `mint.useCentralMint`: `true` (default) = site nasce hosting-only, sem
  Cloud Function própria (ver T3). `false` só por compatibilidade/migração.

**Case GuinchoBarata** (cliente usando o `source` do template `abner-firebase`
direto, sem cópia própria) é o motivo do T1 existir: com `site.config.json` +
`new-site`, todo cliente novo ganha uma cópia isolada (`companies/<slug>/site`)
e o template genérico nunca mais é editado com dado de um cliente específico.

## T2 — Provisionador semi-automático (`scripts/website-new-site.js`)

```powershell
# 1. Copie o exemplo e edite:
copy backend\website-kit\schema\site.config.example.json backend\website-kit\companies\<slug>\site.config.json

# 2. Dry-run (não grava nada, só mostra o plano):
node scripts/website-new-site.js --slug <slug>

# 3. Execução real (local — sem rede, sem gcloud):
node scripts/website-new-site.js --slug <slug> --execute
```

O que o script faz (tudo local, **zero chamada de rede/gcloud**):

1. Valida `site.config.json` contra o schema.
2. Copia `templates/<templateKey>/source` para `companies/<slug>/site`.
3. Faz o stamp: tokens de cor no `:root` dos `.css`, `firebaseProjectId` no
   `.firebaserc`, campos preenchidos do `firebase-config.js`, nome da empresa
   no `<title>`. Campos que não podem ser inventados (apiKey etc., só existem
   depois de criar o projeto no console) viram **PENDENTE-DONO** na saída.
4. Gera o manifest de assets (T4, ver abaixo) — nunca copia fotos pro repo.
5. Gera `hbx.website.json` (metadado) e `HBX-DEPLOY.md` (checklist do cliente:
   passos manuais no console Firebase + comando de deploy).
6. **Avisa** se o template copiou imagens de amostra pesadas (dívida
   conhecida do `diego-firebase`, que hoje carrega fotos reais da
   MadeireiraDiego — ver T5 pendente da Sprint 2).

Depois do `--execute`, os passos que exigem ação humana ficam listados em
`companies/<slug>/HBX-DEPLOY.md` — nenhum deles é executado pelo script
(criar projeto Firebase, dar permissão IAM, configurar CORS na VPS, etc.).

## T3 — Mint central do Firebase Custom Token

Antes: cada cliente com admin via Firebase Auth precisava de uma Cloud
Function própria (`hbx-auth-flow.js`), o que **exige plano Blaze** (cartão)
por projeto. Agora: `POST /website/admin/firebase-token` no backend HBX
(`backend/src/website/website.service.ts` +
`backend/src/website/website-firebase-mint.service.ts`) minta o custom token
central, via impersonation IAM — o projeto do cliente pode ficar em **Spark**
(sem billing).

- Atrás de `WEBSITE_TOKEN_MINT_ENABLED` (default desligado) +
  `WEBSITE_MINT_SA_EMAIL` (email da service account central do HBX).
- `hbx-admin-auth.js` (roda no site do cliente) tenta o endpoint novo
  primeiro; se estiver desligado ou falhar, cai automaticamente no fallback
  antigo (`/api/admin/hbx-auth`, a Function por projeto) — sites vivos nunca
  quebram por causa disso.
- Uid do Firebase gerado é **idêntico** ao que a Function antiga sempre gerou
  (`hbx-<projectId>-<companyId>-<userId>`) — trocar de mecanismo não troca a
  identidade do usuário nas regras do Firestore/Storage do cliente.
- Decisão de implementação (REST puro via IAM Credentials `signJwt`, não
  `firebase-admin`) documentada em
  `backend/src/website/website-firebase-mint.service.ts` e no relatório da
  Sprint 3.

**Gap conhecido:** o template `diego-firebase` (genérico, em
`templates/diego-firebase/source`) ainda não tem a ponte de login automático
(`hbx-admin-auth.js` + bridge no `admin-scripts.js`) ligada — só a cópia
customizada da MadeireiraDiego (`companies/madeireiradiego/site`) tem. O
arquivo `hbx-admin-auth.js` (já com suporte ao mint central) e um
`access-denied.html` genérico foram deixados prontos no template, mas não
conectados no `admin.html`/`admin-scripts.js` porque o `admin-scripts.js`
genérico usa login Firebase direto (email/senha) sem a lógica de bridge —
ligar isso exigiria portar/reescrever esse arquivo, fora do escopo da Sprint 3
(ver PENDENTE-DONO no relatório da sprint).

## T4 — Assets no Storage (não no git)

Fotos de cliente **nunca** vão para o git (regra dura do domínio). O
`site.config.json` aponta `assets.sourceDir` para uma pasta local (fora do
repo); o `new-site` lê essa pasta e gera `companies/<slug>/assets-manifest.json`
com a lista de arquivos + o comando `gsutil` pronto pra subir ao Storage do
projeto do cliente. Nenhum upload acontece automaticamente — é uma ação
`PENDENTE-DONO` (comando impresso, ou upload manual pelo console).

## Regras que não mudam nesta sprint

Tudo em `docs/Rules/WEBSITE-KIT.md` continua valendo: 1 projeto Firebase por
cliente, nunca embutir URL de ambiente fixa no site, editar `templates/*`
pode estar editando site vivo (checar `projects.json` antes), fluxo de tokens
(TTL/secrets/exchange) só muda com ordem explícita do dono.
