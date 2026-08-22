# PR22082026 — O CLIENTE ME ACHA (app sem financeiro não adianta)

> Ordem do dono (22/08/2026): *"crie um plano, e implante, aprovo tudo. garanta q o
> cliente vai me achar, não adianta ter um app sem financeiro"*. Tudo abaixo está
> APROVADO; o que é de código entra neste PR, o que é do Console/Master é ação do
> dono (seção 6), e o que é semana 3 / fase 2 está marcado como tal.

## 0. O modelo que vale HOJE (medido no código — corrige o que eu tinha dito antes)

| Fato | Onde |
|---|---|
| Empresa nascida pelo app (Google) cai no nível **CREDITO / "Rota Avulsa"**: sem mensalidade, **6 créditos por dia de rota** (1× por empresa+dia) | `seedLogisticaConfigTx`, `credit-action-catalog.ts` (`logistica_dia_de_rota`) |
| Brinde: **50 créditos, 30 dias** (≈ 8 dias de rota) | `credit-pack-catalog.ts` (`DEFAULT_WELCOME_CREDITS`) |
| Basic R$99 / Advanced R$199 / Full R$299 = **rota ILIMITADA**; o limite é de **ASSENTO** (motoristas simultâneos); motorista a mais paga "passe do dia" em crédito. **A franquia de paradas morreu em 10/08 (ROTA v2).** | `logistica-nivel-catalog.ts`, `logistica.controller.ts` (`@Get('plano')`) |
| Mensalidade **não tem checkout**: cliente paga por fora → Master troca o nível | `LogisticaNivelMasterController` |
| Recarga no site = **só cartão** (Mercado Pago, token no navegador) | `credit-recharge.service.ts` ("Cartão-only nesta fase") |
| No binário da Play: pacotes e CTA **somem** (`HBX.info().play`); sobra saldo/extrato | `90-ajustes-financeiro.js` `encherCarteira` |
| Trava "Créditos insuficientes · Debita 6 · você tem 0" com botão **Fechar** — **sem dizer onde pagar** | `32-verbos-montar-iniciar.js` |
| Gancho `suporte` (abre o WhatsApp do dono) **existe na ponte e NÃO tem linha na tela** (ordem 6 de 17/08 ficou pela metade) | `D0-porta-entrega.js` |
| Lead do site já entra no `/vendas` da HBX (`intakeAdvertisingLead`, empresa "HBX") | `website-lead-capture.service.ts` |
| Cadastro pelo Google **não manda e-mail nenhum** (só confirmação de e-mail e reset) | `auth.service.ts` |
| Prod: `HBX_CREDITS_ENABLED=true`, `ENFORCE=true`, MP token de produção, webhook secret em `enforce`, SMTP/Resend, `PUBLIC_API_BASE_URL=https://api.hbxsystem.com.br` | VPS `/root/HBX/backend/.env` |

## 1. A lei da Play que desenha tudo (não muda)

**Dentro do app**: saldo, uso, extrato, texto informativo, **suporte** (WhatsApp/e-mail) e
**pedido de contato** — nunca preço, "assine/compre", link de pagamento, nem URL do site.
**Fora do app** (e-mail, WhatsApp, site, ficha da loja): pode tudo. É o modelo Netflix:
*vende fora, consome dentro*. Play Billing (vender DENTRO, Google com 15%) é **fase 2**, depois
do app público (seção 8).

## 2. Os três jeitos de o cliente me achar (o que este PR entrega)

1. **Vendedor** — 90 dias: 100% dos clientes chegam pela mão dele. O onboarding no WhatsApp
   leva o link do painel e o link de pagamento (seção 10).
2. **E-mail de boas-vindas** — nasce a conta pelo app (ou pelo Google no site) → e-mail com o
   link do painel, o que fazer primeiro e o WhatsApp da HBX. Template de SISTEMA editável no
   Master (`account_welcome`).
3. **Dentro do app** — grupo **Ajuda** nos Ajustes (para todos): *Falar com a HBX no WhatsApp*
   e *Quero que a HBX me ligue* (vira lead no `/vendas` da HBX + e-mail pro suporte); tela de
   Créditos no binário da Play ganha o aviso *"quem recarrega é o administrador, pelo painel
   HBX"* + as duas portas; o portão *Créditos insuficientes* ganha o botão *Falar com a HBX*.

## 3. Lote A — backend

### A1. Pix na recarga de créditos (`financeiro/credits/recharge/pix`)
- `POST /financeiro/credits/recharge/pix` `{packKey, idempotencyKey, taxDocument?}` → cria
  pagamento MP `payment_method_id:'pix'` (30 min de validade, `notification_url` do webhook do
  financeiro, `external_reference` = `hbx-credit-recharge-<companyId>-<idempotencyKey>`, mesmo
  esquema do cartão) → grava `FinanceiroCharge` **pending/PIX** com `pixQrCode`/`pixQrCodeBase64`/
  `pixTicketUrl` → devolve QR + copia-e-cola + `paymentId` + `expiresAt`.
- `GET /financeiro/credits/recharge/pix/:paymentId` → status local; se `pending`, **consulta o
  MP** e assenta: aprovado → `wallet.grant` (usageKey `mp:<paymentId>`, idempotente) + charge
  `approved/paid` + linha de receita no ledger master (mesmo molde do cartão); cancelado/expirado
  → charge `cancelled`. Funciona **sem depender do webhook**.
- Webhook: `FinanceiroWebhookController` chama `CreditRechargeService.settleIfCreditRecharge
  (paymentId)` **antes** do `processMercadoPagoWebhook` — o genérico só atualiza a charge (e não
  duplica receita porque a charge já sai com `ledgerEntryId`).
- LEI DO VENDEDOR: só dono/master (`isBillingOwnerActor`); gerente/vendedor = 403 neutro.
- Guardas P0.4 iguais às do cartão: id presente, `external_reference`/valor/moeda batem, tenant
  da charge = tenant do pagamento; divergência → MasterEvent `action_required` + erro.
- Mock (dev): QR falso, aprova no 1º poll.
- Testes `node:test` (`credit-recharge-pix.service.test.ts`): cria pendente; poll aprova 1×
  (grant+ledger+charge); poll de novo é idempotente; cancelado não credita; gerente 403;
  charge de outra empresa não assenta; webhook assenta.

### A2. E-mail de boas-vindas da conta (`account_welcome`)
- Novo `EmailTemplateKind` de sistema `account_welcome` (label *Boas-vindas da conta*) com
  variáveis `{nome} {empresa} {linkAcesso} {suportewhatsapp}`; default em PT-BR: o que fazer no app,
  onde fica o painel (mesmo Google), como falar com a HBX, "nos 14 primeiros dias acompanhamos".
- Gatilho: `createGoogleAccountTx` (cobre pareamento do app E Google no site), **best-effort**
  depois da transação, nunca trava o cadastro.
- Master → E-mails lista o tipo novo (label no `janela-emails.tsx`).

### A3. "Quero que a HBX me ligue" (`POST /logistica/contato-hbx`)
- Controller novo no `WebsiteLeadCaptureModule` (já tem VendasService/ledger/webwhats), só
  `JwtAuthGuard`; body `{assunto, telefone?, mensagem?}`.
- Empresa-alvo = tenant **HBX** (`resolveHbxPlatformCompanyId`); responsável = 1º ADMIN da HBX;
  `intakeAdvertisingLead` com `source:'app_logistica'`, nota *"Pediu contato pelo app HBX
  Logística — <assunto> — empresa <nome> (#id) — <usuário/e-mail>"*, telefone do pedido ou o da
  empresa, e-mail do usuário. Dedup 5 min por empresa+assunto (webhook ledger, provider
  `app_contact`). E-mail pro `ADMIN_SUPPORT_EMAIL` em paralelo (best-effort).
- Resposta neutra `{ok:true}`; erro de lead NUNCA vira 500 pro motorista (loga e devolve
  `{ok:true}` se pelo menos o e-mail saiu; `{ok:false}` só se nada saiu).

## 4. Lote B — painel web (`/configuracoes` → Créditos)
- `CreditsWalletSection`: ao escolher pacote, seletor **Pix | Cartão** (Pix default). Pix: botão
  *Gerar QR Code* → QR (PNG base64) + copia-e-cola com *Copiar* + "válido até HH:MM" + polling a
  cada 4 s → aprovado: mensagem + recarrega carteira. Expirou: *Gerar outro*. Classes `.cw-pix*`
  em `creditos.css` (tokens, zero hex/inline visual).
- Nada muda no modo casca (`useHbxShell`): continua sem vitrine.

## 5. Lote C — app (casca + ponte + Kotlin)
- **Fonte é o mock** `docs/mockups/logistica2.0/logistica-2.0.html` → `node scripts/casca-injetar.js`
  (gera `mock.js`/`index.html`); ponte em `ponte-src/` → `node scripts/ponte-costurar.js`;
  gates `casca-conferir` + `ponte-conferir`.
- Ajustes: grupo **Ajuda** (todos os perfis): `Falar com a HBX` (WhatsApp — `data-acao="suporte"`,
  já existe na ponte; passa a preferir `config.suporteWhatsapp`, cai no número fixo) e
  `Quero que a HBX me ligue` (portão com assunto + telefone → `POST /logistica/contato-hbx` →
  portão "Recebido — a HBX fala com você").
- Ajustes · Créditos **no binário da Play** (`info().play`): banner *"Quem recarrega é o
  administrador da empresa, pelo painel HBX."* + as duas portas (WhatsApp / me ligue). Sem
  preço, sem link. Fora da Play: tela igual à de hoje.
- Portão *Créditos insuficientes*: `acoes: [['Fechar',''],['Falar com a HBX','principal',undefined,'suporte']]`.
- Kotlin: allowlist `POST /logistica/contato-hbx` + assert no `NativeApiClientPathPolicyTest`.
- `versionCode=357` (356 já foi gerado e pode ter subido) → `:app:bundleLogisticaRelease`.

## 6. Lote D — ações do DONO (Console / Master / MP) — sem código
1. **Play Console**: subir o `.aab` 357 na faixa **fechada** (ficha/formulários/vídeo do serviço em
   1º plano conforme `docs/play/PUBLICAR.md`), publicar, gerar o link de opt-in, convidar todo
   mundo **no mesmo dia**, começar o diário.
2. **Master → Créditos → Ações/Lotes**: pra cada testador/fundador, conceder lote de cortesia
   (≥ 100 créditos, 30 dias) **ou** pôr a empresa em Basic por 30 dias — o brinde de 50 não cobre
   os 14 dias do estágio.
3. **Mercado Pago (painel)**: criar 3 links de assinatura (Basic 99 / Advanced 199 / Full 299,
   mensal). O vendedor manda o link no WhatsApp; pago → Master → Logística → nível da empresa.
   Fica assim até o botão *Assinar* do painel (seção 7 / semana 3).
4. (Opcional) `ADMIN_SUPPORT_PHONE` no `.env` do backend — hoje cai no `+5519997024884`.
5. Diário do estágio: cada "Falar com a HBX" e cada lead `app_logistica` é material.

## 7. Semana 3 (aprovado, próximo PR) — botão *Assinar* no painel web
- Família `rota_basic|advanced|full` no catálogo de assinatura (preapproval MP já existe em
  `financeiro.service.ts`), página em Configurações → Plano, webhook `preapproval` → `setNivel`.
  Não entra neste PR: mexe em checkout/webhook de assinatura e merece prova própria.

## 8. Fase 2 (outubro, depois do app público) — Play Billing
- Assinaturas Basic/Advanced/Full dentro do app via Google (15%); preço pode ser +15% no app
  (permitido; o app só não pode dizer que fora é mais barato). Loja só pro ADMIN; compra fica na
  conta Google de quem compra; recibo é do Google (não NF da HBX). 1–2 semanas + Console
  (perfil de pagamentos, produtos, testadores de licença).

## 9. Verificação (portões deste PR)
- backend: `npm run build` + `node --test dist/financeiro/credit-recharge*.test.js dist/website-lead-capture/*.test.js`
- app: `node scripts/casca-injetar.js && node scripts/ponte-costurar.js && node scripts/casca-conferir.js && node scripts/ponte-conferir.js`;
  `gradlew :app:testLogisticaReleaseUnitTest`; `:app:bundleLogisticaRelease` (357).
- frontend: `npm run lint` (check-pele) + build.
- Publicar: `npm run new` (backend + frontend); o `.aab` sobe pelo Console (dono).

## 10. Manual do vendedor — semana 1 (o que mandar no WhatsApp)
1. Convite: link de opt-in da faixa fechada (*"abre a Play Store, toca na sua foto; o e-mail do
   topo é o da conta — é com ele que o link funciona"*).
2. Depois de instalar e entrar: *"seu painel no computador é www.hbxsystem.com.br — entra com o
   mesmo Google do app. Lá ficam plano, créditos e pagamento (Pix ou cartão)."*
3. Proposta fundador: link de assinatura MP do nível + *"pagou, eu ligo seu plano na hora"*.
4. Todo pedido que chegar de dentro do app ("Quero que a HBX me ligue") cai no `/vendas` da HBX
   com origem **app_logistica** — responder em até 1 hora útil.
