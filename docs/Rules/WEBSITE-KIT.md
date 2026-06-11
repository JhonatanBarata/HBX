# Regras — WEBSITE-KIT (sites de clientes)

> Módulo Website do HBX: templates React + Vite + Firebase para sites de empresas
> clientes, em `backend/website-kit/`.

## Estrutura

- `backend/website-kit/templates/<nome>/source` — fonte única de cada template
  (`abner-firebase`, `diego-firebase`, `hbx-master-saas`).
- `backend/website-kit/companies/<empresa>/site` — instância por empresa cliente
  (ex.: `madeireiradiego`, empresa #6, usa o template `diego-firebase`).
- Cada template inclui painel admin (auth e-mail/senha, CRUD em Firestore,
  upload de imagem no Storage, carrossel).

## Deploy (Firebase)

Template ABNER (scripts npm da raiz):

```powershell
npm run firebase:abner:deploy
npm run firebase:abner:deploy:hosting
npm run firebase:abner:deploy:functions
```

Empresa via Firebase CLI direto (ex. madeireiradiego):

```powershell
firebase login
firebase use madeireira-78732
firebase deploy --only hosting
```

## Variáveis das Functions (pagamento Mercado Pago)

Configurar no ambiente de deploy das Functions — **nunca commitar segredos**:

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_TOKEN=
MASTER_PAYMENT_NOTIFY_WEBHOOK_URL=https://SEU_BACKEND_HBX.com/master/payment-notifications/mercadopago-approved
MASTER_PAYMENT_NOTIFY_SECRET=
MASTER_PAYMENT_NOTIFY_COMPANY_ID=
MASTER_PAYMENT_NOTIFY_TO=
```

O webhook de aprovação notifica o backend HBX
(`/master/payment-notifications/mercadopago-approved`).

## Regras

- Mudança em template é feita na `source` do template, nunca direto na pasta da empresa.
- Regras Firestore/Storage dos templates: leitura pública, escrita só autenticada.
- Site de cliente não acessa o banco principal do HBX.
