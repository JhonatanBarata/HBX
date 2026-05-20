# Deploy Firebase ABNER

Fonte unica no HBX:

`backend/website-kit/templates/abner-firebase/source`

Comandos:

```powershell
npm run firebase:abner:deploy
npm run firebase:abner:deploy:hosting
npm run firebase:abner:deploy:functions
```

Variaveis necessarias nas Functions do Firebase:

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_TOKEN=
MASTER_PAYMENT_NOTIFY_WEBHOOK_URL=https://SEU_BACKEND_HBX.com/master/payment-notifications/mercadopago-approved
MASTER_PAYMENT_NOTIFY_SECRET=
MASTER_PAYMENT_NOTIFY_COMPANY_ID=
MASTER_PAYMENT_NOTIFY_TO=5519996513456
```

Nao commitar segredos. Configure os valores no ambiente de deploy das Functions.
