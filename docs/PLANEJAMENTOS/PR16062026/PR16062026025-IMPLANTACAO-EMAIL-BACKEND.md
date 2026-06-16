# PR16062026025 — Implantação: endpoint de e-mail do botão "Email"

> Lê o **023**. Fecha o botão "Email" da tela de seleção do **024**: a pessoa escreve um recado e
> a HBX recebe por e-mail.

## OBJETIVO
Endpoint que recebe o texto digitado e **envia e-mail para `jhonatan@hbxsystem.com.br`** com quem
está pedindo implantação. Best-effort: falha de e-mail nunca derruba a resposta pro usuário.

## FAZER — BACKEND
Arquivo: `backend/src/commercial-plans/commercial-plans.controller.ts` + `.service.ts`
1. Novo endpoint autenticado (admin de empresa): `POST /commercial-plans/implantacao/contact`
   - Body: `{ message?: string }` (texto livre, limitar a ~2000 chars, sanitizar/escapar).
   - Reusa `resolveUserContext` + `canSelectPlan` (mesma régua: só ADMIN/Master).
2. No service, método `requestImplantacaoContact(user, dto)`:
   - Carrega empresa (id, name, primaryContactName, contactPhone) + e-mail do user.
   - Envia e-mail via `MailService.sendMail` (`backend/src/mail/mail.service.ts`):
     - `to: 'jhonatan@hbxsystem.com.br'`
     - `subject`: `Pedido de Implantação — <empresa>`
     - corpo (texto + html escapado): empresa, contato, telefone, e-mail do solicitante, e a
       **mensagem digitada**.
   - **Best-effort:** `.catch()` no envio; também disparar o alerta in-app do master
     (`MasterAlertService` — reusar/estender `notifyFullPlanRequested`) pra não depender só de SMTP.
   - Retorna `{ ok: true, message: 'Recebemos seu pedido de Implantação. A HBX vai te chamar.' }`.

## REUSO (não criar do zero)
- `requestFullPlan` já faz quase isso (alerta o master). Pode **renomear/estender** pra cobrir o
  e-mail + texto livre, OU criar o novo método e deixar a 032 aposentar o `requestFullPlan` se
  ninguém mais o chamar. **Não** duplicar dois caminhos vivos fazendo a mesma coisa.

## NÃO FAZER
- Não mudar plano nem entitlement aqui (é só contato — feature paga sem pagar é proibido).
- Não expor o endpoint sem auth (não é vitrine pública; é admin logado pedindo implantação).
- Recipiente é `jhonatan@hbxsystem.com.br` (não confundir com `ADMIN_SUPPORT_EMAIL`).

## CHECKS
`cd backend && npm run build` + teste do método (mock do MailService): envia pro endereço certo,
não explode se o SMTP falhar, barra role USER.

## DEPENDE DE
Front do **024** (a tela que chama este POST). Pode ser implementado em paralelo.

## STATUS
Planejado 16/06.
