# PR16062026030 — Cancelamento: mantém os dias pagos + botão "Falar com o suporte"

> Lê o **023**. Fecha o cancelamento no modelo do dono: quem já pagou **usa até compensar**;
> reclamação/reembolso **não é automático** — manda pro suporte (sem processo).

## OBJETIVO
1. Ao cancelar a assinatura, o acesso **continua até o fim do período já pago** (até compensar os
   dias). A cobrança automática para.
2. Reclamação ou pedido de reembolso → **botão "Falar com o suporte HBX"** (WhatsApp/telefone do
   dono). **Sem reembolso automático.**

## ESTADO DE HOJE
- `POST /financeiro/subscription/cancel` já existe (`cancelSubscriptionForUser`) e cancela a
  preapproval no provedor. A copy da tela já diz "acesso continua até o fim do período já pago".
- Confirmar que o **acesso realmente fica vivo** até `subscriptionCurrentPeriodEnd`/`nextBillingAt`
  (não cair pra suspenso na hora). Se hoje cai, ajustar: cancelar = parar a renovação, **não**
  revogar o período pago. `resolveCompanyAccessState` decide pelo prazo, não por flag crua.

## FAZER — FRONT
Arquivo: `frontend/src/app/(app)/configuracoes/page.client.tsx`
- O `ConfirmDialog` de cancelar mantém a mensagem honesta ("para a cobrança automática; o acesso
  continua até {data}").
- Adicionar, na seção de plano e no pós-cancelamento, um botão **"Falar com o suporte HBX"** que
  abre `https://wa.me/5519997024884` (e/ou `tel:+5519997024884`). Reusa a tela de contato do **024**
  se já estiver pronta (mesmo componente de botões), pra não duplicar.
- Texto curto perto do cancelar: "Precisa de reembolso ou tem uma reclamação? Fale com a gente" →
  botão. Nada de formulário de reembolso automático.

## NÃO FAZER
- Não implementar reembolso automático nem fluxo de estorno (o dono **não quer processo**).
- Não revogar o período já pago no ato do cancelamento.
- Não mostrar cancelamento/valor pra USER/Gerente sem cobrança.

## CHECKS
`cd frontend && npm run lint && npm run build`; `cd backend && npm run build` se tocar o service.
Ao vivo (mock): cancelar para a renovação, acesso segue até a data; botão de suporte abre o WhatsApp
certo (`5519997024884`).

## DEPENDE DE
Idealmente depois do **024** (reusa o componente de contato). Pode ir antes — só duplica menos se vier depois.

## STATUS
Planejado 16/06.
