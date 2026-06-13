# PR13062026006 — E-mails editáveis ("+"/"-") também no /master

> Ordem do dono (13/06/2026), no /master e-mails:
> "essas telas eram pra ser editáveis, '+' '-'. Aplicar a regra pra TODOS, não
> só no master; tela e-mails é editável e cada um tem a sua (não perder o que
> existe)."

## Diagnóstico

A "regra" (templates de e-mail com criar/remover, cada dono com o seu conjunto)
**já existia para a EMPRESA** desde o PR12062026005:

- `/configuracoes` → `CompanyEmailSection` + `CompanyEmailTemplateService`
  (`POST`/`DELETE`/`restore` em `/company-email/templates`). Cada empresa tem o
  seu conjunto, escopado por `companyId`. ✅ já conforme.

Faltava **só o /master** (`janela-emails.tsx` + `EmailTemplateService`), que
estava preso a 5 templates fixos, sem "+"/"-".

## Decisão de design (preserva "não perder o que existe")

Os 5 templates do master — `normal`, `password_reset`, `email_confirmation`,
`seller_welcome`, `seller_onboarding_request` — são de **SISTEMA**: estão
ligados a fluxos reais (reset de senha, confirmação de e-mail, onboarding de
vendedor). Por isso continuam **protegidos**: o master edita e **restaura ao
padrão**, mas **não remove**. O "+"/"-" passa a valer para **templates
personalizados** novos (kind `tpl_*`), idêntico ao que a empresa já faz com os
`isSeeded`.

Resultado: master e cada empresa têm o **próprio** conjunto; nada do que existe
é perdido.

## Mudanças

### Backend (fila E15 do PLAN12062026001 — aplica com restart)
- **Migration** `20260613_master_email_custom_templates` (aditiva):
  `ALTER TABLE "MasterEmailTemplate" ADD COLUMN IF NOT EXISTS "label" TEXT;`.
  Schema: `MasterEmailTemplate.label String?`.
- `EmailTemplateService`: `listManagedTemplates`, `getManagedTemplate`,
  `createCustomTemplate`, `saveCustomTemplate`, `removeCustomTemplate`,
  `isSystemKind`, `labelForKind`, `getCustomVariableDefinitions`. Os métodos
  antigos dos 5 kinds de sistema ficam intactos.
- `MasterEmailController`: `POST /master/email/templates` (criar),
  `DELETE /master/email/templates/:kind` (remover só personalizado);
  `PUT`/`restore`/`test` ramificam sistema × personalizado; `formatTemplate`
  expõe `label` + `isSystem`.

### Frontend (já no ar — dev)
- `janela-emails.tsx`: botão **Novo** (+), **Remover** nos personalizados, modal
  de criação, rótulo (`label`) por template, e o badge de seleção mantido.
  Tudo em classe central (`btn-teal`, `btn-ghost`, `btn-danger`, `field-dark`,
  `hbx-veil`/`hbx-modal`); rótulo de campo consolidado num único `lbl`
  (Lei 2). Catraca check-pele caiu 586 → 576.

## Checks
- `cd backend && npm run prisma:validate && npm run build` — OK.
- `node --test dist/mail/company-presentation-email.service.test.js` — 6/6 OK.
- `cd frontend && npm run lint && npm run build` — OK.

## Aplicação
- Frontend: já editado ao vivo.
- Backend: `prisma migrate deploy` + `docker restart backend` (protocolo da
  fila). Até lá, os botões Novo/Remover do master ficam inertes; o resto
  degrada para o comportamento atual.
