# PR12062026005 — Módulo E-mail por empresa + Novo acesso completo

> Ordem do dono (12/06/2026, literal): aplicar o módulo E-mail em todos os admins;
> e-mail mora em Configurações, ativável, mas "só aparece realmente se a pessoa
> configurar"; admin cria e REMOVE templates próprios (tem que ter "+");
> os templates prontos do Master NÃO copiam pra ninguém — exceto
> "Onboarding do vendedor" e "Boas-vindas do vendedor", que copiam APENAS pro
> HBX admin com todas as funcionalidades; disparo de e-mail é MANUAL e o
> template de cada ponto de disparo é configurável por empresa; o cadastro
> completo ("Novo acesso") é PRA TODO MUNDO — só o disparo de e-mail fica
> condicionado a ter e-mail configurado; ninguém aproveita o SMTP do Master —
> cada empresa configura o seu; ÚNICO privilégio do HBX admin = usar o mesmo
> SMTP do Master (nada além disso); faltou peça → parar e acionar o dono;
> quem cadastra e testa tudo é o dono.

## Regras de ouro (não negociáveis)

1. **SMTP por empresa.** Cada empresa configura o próprio SMTP. Sem fallback
   silencioso pro SMTP da plataforma. E-mail não configurado → disparo nem aparece.
2. **HBX admin (companyId 2): único privilégio = transporte SMTP do Master.**
   Nenhum endpoint master é chamado pelo HBX admin; o compartilhamento é interno
   (mailer por empresa decide o transporte). HBX admin não ganha mais nada.
3. **Templates prontos do Master ficam no Master**: Apresentação,
   Recuperação de senha, Confirmação de e-mail não são copiados pra ninguém.
4. **`seller_welcome` + `seller_onboarding_request`**: cópias semeadas SÓ pra
   empresa HBX (com restaurar padrão, variáveis, teste, anexo/cartão).
5. **Disparos manuais** (botão). Nada automático. O template usado em cada
   disparo (boas-vindas / onboarding-documentos) é escolhido pela empresa.
6. **Cadastro completo pra todo mundo** (Novo acesso). Os botões de e-mail do
   fluxo só aparecem com e-mail ativo+configurado na empresa do admin.
7. `POST /users/company/create` **deixa de disparar convite automático**
   (hoje manda e-mail pelo SMTP da plataforma — viola a regra 1). Campo
   `Senha` opcional no cadastro cobre o caso sem e-mail.

## Modelo de dados (Prisma — aditivo, sem migration destrutiva)

- `CompanyEmailSettings`: `companyId` (PK), `enabled`, `smtpHost`, `smtpPort`,
  `smtpSecure`, `smtpUser`, `smtpPass`, `fromName`, `fromEmail`, `replyTo`,
  `testEmail`, `sampleName`, `sampleCompany`,
  `welcomeTemplateKind` (disparo boas-vindas), `onboardingTemplateKind`
  (disparo solicitar documentos), timestamps.
- `CompanyEmailTemplate`: `id`, `companyId`, `kind` (slug), `label`,
  `subject`, `text`, `html?`, `isSeeded` (true só nas 2 cópias da HBX),
  timestamps. Único `[companyId, kind]`.
- `CompanyEmailAsset`: espelho do `MasterEmailAsset` com `companyId`
  (`[companyId, key]` único; `key` = `presentation_pptx` | `business_card`).

## Backend novo — `company-email` (guard: Jwt + Roles Admin)

`companyId` SEMPRE do `req.user`. Nunca de param/body.

| Endpoint | Função |
|---|---|
| `GET /company-email` | settings + sender (`ready/mode/missing`; HBX → mode `hbx_shared`, pronto) + anexos + formState |
| `PUT /company-email/settings` | salvar SMTP/remetente/enabled/testEmail/samples + templates dos disparos |
| `GET /company-email/templates` | lista templates da empresa (HBX: semeia as 2 cópias na 1ª leitura) |
| `POST /company-email/templates` | **"+" criar template** `{label, subject, text}` → kind `tpl_<slug>` |
| `PUT /company-email/templates/:kind` | salvar |
| `DELETE /company-email/templates/:kind` | remover (custom; seeded não remove — tem restaurar) |
| `POST /company-email/templates/:kind/restore` | só seeded (volta ao padrão do kind) |
| `POST /company-email/templates/:kind/test` | envio de teste **pelo SMTP da empresa** |
| `POST/DELETE /company-email/attachment` | PPTX da empresa |
| `POST/DELETE /company-email/business-card` | cartão/assinatura da empresa |
| `POST /company-email/send` | envio avulso com template escolhido |

`CompanyMailerService.sendForCompany(companyId, msg)`:
- `companyId === HBX` → transporte do `MailService` da plataforma (regra 2);
- senão → transporte nodemailer com o SMTP salvo da empresa;
- não configurado → erro honesto `COMPANY_EMAIL_NOT_CONFIGURED` (UI esconde os botões antes disso).

Motor de variáveis/render: reuso do `EmailTemplateService` (rende `{x}`/`{{x}}`,
sanitize, html). Templates custom: sem variável obrigatória. Seeded mantêm as
validações do kind (`seller_welcome` exige `{acesso}`+`{senha}` etc.).

## Recablagem dos disparos existentes

- `POST /users/company/create`:
  - aceita `password` opcional (min 8; hash igual ao fluxo atual);
  - **não envia mais convite automático** — resposta informa `invite: null` e
    o caminho manual;
  - resto do contrato intocado (assentos, onboarding, indicação).
- `POST /users/:id/send-welcome` (novo, Admin): gera senha temporária
  (mustChangePassword) + dispara boas-vindas **pelo mailer da empresa** com o
  template do disparo (`welcomeTemplateKind`). Botão correspondente na Equipe,
  visível só com e-mail pronto.
- `POST gerencial/hbx-partners/:userId/onboarding/send-email` ("Solicitar
  documentos"): troca `mailService.sendMail` → `companyMailer.sendForCompany`
  com o template `onboardingTemplateKind` da empresa. Sem e-mail configurado →
  erro honesto (UI nem mostra o botão).
- Recuperação de senha / confirmação de e-mail / apresentação do Master:
  **intocados** (plataforma).

## Frontend

### Configurações → seção "E-mail" (todo admin)
1. Card de ativação + status do remetente (HBX: "SMTP da plataforma — pronto",
   sem campos; demais: form SMTP host/porta/seguro/usuário/senha/fromName/
   fromEmail/replyTo + salvar + `ready/missing` honesto).
2. Editor de templates (só com `enabled`; aviso pra configurar se não `ready`):
   select de templates + **botão "+"** (criar) + remover (custom) + restaurar
   (seeded) + painel de variáveis (tokens por grupo) + assunto/corpo + salvar +
   envio de teste + anexos (PPTX/cartão) + envio avulso.
3. Card "Disparos do cadastro": template de **Boas-vindas** e template de
   **Onboarding (solicitar documentos)** — selects salvos nos settings.

### Configurações → Equipe → "Novo acesso" (substitui o convite simples, todo admin)
Campos (imagem de referência do dono): abas Vendedor/Admin; Nome; E-mail;
WhatsApp; Comissão; D+; checkbox "Salvar documentação deste vendedor"
(`requiresSellerOnboarding`); CPF; **Senha** (opcional); Endereço; Indicado por
(vendedores ativos; "Direto" = sem); Herança (% do indicador, leitura);
Enriquecimentos/dia (`sellerDistributionDailyLimitOverride`, padrão 30).
Painel de documentação (após criar, com `userId`): slots Documento*, Currículo,
Contrato assinado*, Outro (obrigatório/opcional via `document-requirement`);
**Editar modelo** (contract-template GET/PATCH); **Gerar contrato PDF**
(generate-contract); **Solicitar documentos** (send-email — só com e-mail pronto).

## Fases de execução

- **F1** Prisma (3 modelos) + migration aditiva + `prisma:validate`.
- **F2** Backend: `CompanyMailerService` + `CompanyEmailTemplateService` +
  `CompanyEmailController` + recablagem (create sem auto-invite, send-welcome,
  onboarding send-email por empresa). Build.
- **F3** Front: seção E-mail em /configuracoes.
- **F4** Front: Novo acesso completo na Equipe.
- **F5** Checks (lint/build front, build back), **docker restart do backend
  (obrigatório)**, prints de prova. Dono cadastra e testa tudo.

## Pare-e-acione (estado pós-execução, 12/06/2026)

- ✅ RESOLVIDO `smtpPass`: criptografada com o `IntegrationSecretsService`
  (AES-256-GCM, mesma chave `INTEGRATION_SECRET_KEY` das integrações). Sem a
  chave no ambiente, salvar senha SMTP devolve erro honesto.
- ✅ RESOLVIDO (ordem do dono, 12/06/2026): o fluxo de E-MAIL DE APRESENTAÇÃO
  do VENDAS (`/vendas/leads/:id/email/presentation/preview|send`) agora sai
  pelo e-mail DA EMPRESA: novo `mail/company-presentation-email.service.ts`
  (anexos PPTX/cartão do CompanyEmailAsset da própria empresa, envio pelo
  `CompanyMailerService`, sem cópia pro Master, HBX = só o transporte).
  Não configurado → erro honesto `COMPANY_EMAIL_NOT_CONFIGURED` no send;
  preview devolve `senderSummary.usable` + warning pra UI esconder/avisar.
  O `CompanyMailerService` ganhou `replyTo` opcional por mensagem (aditivo).
  Fluxo do Master (master/email/send) intocado.
  - ⚠️ AINDA NA PLATAFORMA (sem ordem): apresentação manual do RADAR
    (`radar-core-delivery.mixin.ts` → previewRadar/sendRadar) e o disparo do
    BOT Caça de e-mail (`messaging.service.ts` → sendPresentationToContact)
    seguem no `HbxPresentationEmailService` (transporte do Master). Migrar é
    o mesmo padrão do Vendas quando o dono ordenar.
- ⚠️ ABERTO: "reenviar link de definição de senha" manual não existe (o
  automático foi desligado). Caminhos atuais: senha no cadastro, ou
  boas-vindas na liberação (senha temporária). Se quiser o link manual,
  é 1 endpoint + 1 botão.
- O convite automático antigo segue existindo APENAS no fluxo do Master
  (`POST /users/master/company/:id/create`) — privilégio do Master, intocado.

## Como ficou (execução)

- Migration `20260612_company_email` aplicada (3 tabelas novas, aditiva).
- Backend: `common/hbx-platform-company.ts`, `mail/company-email-settings.service.ts`,
  `mail/company-email-template.service.ts`, `mail/company-mailer.service.ts`,
  `mail/company-email.controller.ts`; recablados `users.controller`
  (senha opcional + sem auto-convite + boas-vindas por empresa + senha
  temporária na resposta quando o e-mail falha) e
  `gerencial/seller-onboarding.service` (solicitar documentos por empresa).
  Testes: 25/25 verdes nos arquivos tocados.
- 12/06 (2ª leva): `mail/company-presentation-email.service.ts` (apresentação
  do Vendas por empresa) + `vendas.service` recablado pro novo serviço +
  `replyTo` por mensagem no `CompanyMailerService`. Testes: 6 novos no
  serviço + 68 do vendas.service, todos verdes (74/74).
- Frontend: `components/hbx/company-email-section.tsx` (seção E-mail),
  `components/hbx/novo-acesso-modal.tsx` (cadastro completo);
  `/configuracoes` ganhou a seção E-mail (admin) e o botão da Equipe virou
  "Novo acesso" — modal antigo de convite DELETADO no mesmo commit (PR-010).
