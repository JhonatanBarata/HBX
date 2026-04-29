# Mercado Pago Subscriptions no HBX

O HBX usa Mercado Pago Subscriptions/Preapproval para cobrança recorrente por cartão.

## Variáveis

- Backend: `MERCADO_PAGO_ACCESS_TOKEN` ou o token Mercado Pago configurado na biblioteca MASTER do HBX.
- Frontend: `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`.
- Webhook público: `PUBLIC_API_BASE_URL`.
- Retorno do checkout: `APP_URL` ou `FRONTEND_URL`.

Não duplique token se a biblioteca MASTER já estiver configurada para a empresa.

## Setup Mercado Pago

1. Criar o app no painel Mercado Pago.
2. Configurar credenciais de produção.
3. Configurar webhook para `https://SEU_BACKEND/webhooks/mercadopago/financeiro`.
4. Testar com credenciais e cartões de teste do Mercado Pago.
5. Validar criação de `preapproval_plan`, criação de `preapproval`, webhook de pagamento aprovado, cancelamento e troca de cartão.
6. Ir para produção.

## Segurança

O frontend gera `card_token_id` com o SDK/Brick do Mercado Pago. O HBX envia esse token temporário ao backend apenas para criar ou alterar a assinatura.

O HBX não deve armazenar número completo do cartão, CVV ou token temporário do cartão. O armazenamento local permitido é limitado a IDs da assinatura/plano, status, plano/ciclo, datas, e `cardBrand`/`cardLast4` quando o provedor retornar esses dados de forma segura.
