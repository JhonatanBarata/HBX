# PLAN — E-mail vira módulo de 1ª classe (gating + ícone global) + roadmap Gmail OAuth

Motivo do dono (21/06): vai **automatizar disparo de e-mails**. Então e-mail precisa ser
módulo de verdade (aparece/sumir conforme plano+permissão) e ganhar **ícone global** no topo
(do lado do tema) que **acende a cor do tema só quando o e-mail está ATIVO e FUNCIONAL**.

## Estado atual (o que já existe)
- `email` é `companyAssignable` em `structural-defaults.json` → **já aparece** na aba Módulos do
  Self-Checkout por plano (`getPlanModulesForMaster` lista todos assignable). Master já liga email num plano.
- `canUserAccessModule('email')` já funciona (lê post-it/plan default).
- `MODULE_ACCESS_EQUIVALENTS.email = ['email.access']`; ícone `mail` já existe em `shell.tsx ICONS`.

## Furos a corrigir
1. **Backend listagem:** `email` e `bot` NÃO estão em `knownModuleKeys` do `listMyModules`
   (`modules.service.ts` ~L2254). Resultado: mesmo plano marcando email, `GET /modules/me` nunca
   devolve email → front não gateia nem acende ícone.
2. **Frontend gate:** aba "E-mail" em `configuracoes/page.client.tsx:254` usa `isAdminUser` em vez
   do módulo. Deve seguir o módulo (igual sidebar usa `isModuleVisible`/`useMyModules`).
3. **`email.access defaultForSeller: true`** (`team-access-catalog.ts:192`) → flip p/ **false**
   (consistência com `bot.access`/`atendimento.access`; admin distribui quando quiser).
4. **Sem endpoint de status** legível por não-admin: controller `company-email` é todo `@Admin()`.

## Decisões
- Ícone do topo: **mostra** quando `mods.byKey["email"].accessible`; **acende** (`--active`) quando
  e-mail `enabled && ready`. Clique → `/configuracoes?sec=E-mail`. Mesma estética de `wa-action-btn--active`.
- Status "funcional" = `enabled && sender.ready` (de `getPublicState`). Novo `GET /company-email/status`
  (só JwtAuthGuard, escopo company, **sem segredo**: `{ enabled, ready }`).
- Flip `defaultForSeller` p/ false (decisão; admin libera depois).

## Blocos (workers Sonnet; Opus revisa diff + runtime)

### Bloco 1 — Backend (modules + team-catalog + status endpoint)
Arquivos: `backend/src/modules/modules.service.ts`, `backend/src/team/team-access-catalog.ts`,
`backend/src/mail/company-email*.{controller,settings.service}.ts`.
- `listMyModules`: incluir `'email'` e `'bot'` em `knownModuleKeys` (para serem avaliados mesmo desligados).
- `team-access-catalog.ts`: `email.access.defaultForSeller` → `false`.
- Novo `GET /company-email/status` (controller separado, **sem `@Admin()`**, JwtAuthGuard, company-scoped):
  retorna `{ enabled, ready }` de `settingsService.getPublicState(companyId)` (nenhum segredo SMTP).
- Checks: `cd backend && npm run prisma:validate && npm run build`.

### Bloco 2 — Frontend (gate da aba + ícone global)
Arquivos: `frontend/src/app/(app)/configuracoes/page.client.tsx`, `frontend/src/components/hbx/shell.tsx`.
- `page.client.tsx`: gatear "E-mail" pelo módulo (via `useMyModules`/`isModuleVisible('email')`),
  não por `isAdminUser`. Master sempre vê (bypass já existe). Manter `<CompanyEmailSection/>`.
- `shell.tsx` Topbar `.top-actions`: novo botão e-mail entre `PeleSwitch`/`ModeToggle`. Mostra quando
  `mods.byKey["email"]?.accessible`; classe `wa-action-btn--active` quando funcional (fetch cacheado de
  `/company-email/status`, padrão `fetchWaStatusCached`). Clique → `router.push("/configuracoes?sec=E-mail")`.
  Ícone `ICONS.mail`. `NAV_MODULE_KEY`/`NAV_ENTITLEMENT`: adicionar `email` se for gatear via `isModuleVisible`.
- Checks: `cd frontend && npm run lint && npm run build`.

## Fase 2 — Envio Gmail + captura de resposta — EM EXECUÇÃO (22/06)
Dono cria projeto Google SEPARADO (não arrastar o login `-6pcir0` p/ verificação). **Decisões travadas (22/06):**
(1) Gmail **POR VENDEDOR**; conexão gateada por **2ª camada = nova permissão `communication.email.gmailConnect`**
que o admin libera por usuário (ter o módulo e-mail não basta). (2) Aviso de resposta **nos DOIS lugares**:
timeline do card + bolinha no ícone de e-mail E no sino. (3) `From` real do vendedor (frestinha aceita).
**Validação só na VPS** (Gmail off no localhost; inbound precisa DNS público) → tudo mock-first/log no localhost.

### Blocos de execução (workers Sonnet; Opus revisa diff)
- **A (backend fundação) — EM EXECUÇÃO:** modelo `GmailConnection` POR USER (refresh token cifrado via
  `IntegrationSecretsService`, env `INTEGRATION_SECRET_KEY`) + migration; permissão `communication.email.gmailConnect`
  no `team-access-catalog` (admin libera por vendedor); endpoints por-user `GET /company-email/gmail/connect|callback|status`,
  `POST .../disconnect` (gateados por módulo email + permissão; mock quando env Gmail ausente). Lib `google-auth-library` (já é dep).
- **B (backend envio):** Gmail API (`users.messages.send` via REST + access token do refresh) no
  `company-mailer.service.ts` quando o user tem conexão; `From` real + `Reply-To: resposta+<token>` + guardar `Message-ID`;
  fallback SMTP/HBX. Util HMAC do token (`empresa+vendedor+card`).
- **C (backend inbound + aviso):** `POST /company-email/inbound` (segredo compartilhado, sem JWT) → verifica HMAC →
  card+vendedor → timeline do card + master-notice (sino) + contador não-lido (ícone). [explorar timeline do vendas + master-notice]
- **D (frontend):** botão "Conectar Gmail" + status no `CompanyEmailSection` (gateado pela permissão); bolinha de
  não-lido no ícone de e-mail; respostas na timeline do card (`DetalhesNegocio`).
- **E (Cloudflare Worker):** código do Email Worker (parse MIME `postal-mime` + POST c/ segredo) p/ o dono deployar.

Decisão de produto tomada nesta sessão (pensar junto):

**Três posturas — escolhida a 3ª:**
1. Só disparo (`gmail.send`): manda, não recebe → cego, não fecha o ciclo.
2. Ler caixa toda (`gmail.readonly`/`mail.google.com`): escopo RESTRITO (verificação pesada + auditoria),
   privacidade ruim (caixa pessoal inteira), vira cliente de e-mail completo. **FORA DE ESCOPO** (canhão/mosquito).
3. **Disparar + capturar SÓ a resposta** ← escolhida.

**Pulo do gato:** Gmail API não tem escopo "só replies do que mandei" (ou tudo ou nada). Então a resposta
NÃO volta pro Gmail — volta pro HBX (mesmo modelo do inbox WhatsApp). Quebra em 2 peças INDEPENDENTES:

- **2A — Enviar pelo Gmail da pessoa.** OAuth `gmail.send` + Gmail API (NÃO XOAUTH2/SMTP, que exige o
  escopo amplo `https://mail.google.com/`). Refresh token cifrado **por VENDEDOR** (não por empresa); encaixa no
  `company-mailer.service.ts` ao lado de SMTP/HBX. Front: botão "Conectar Gmail" + status. Guardar o
  `Message-ID` de cada envio. **Fora do código (dono):** ativar Gmail API + scope `gmail.send` + consent no
  projeto Google novo. Gmail off no localhost → só valida na VPS.
- **2B — Capturar a resposta (transport-agnostic, mais valiosa, NÃO depende do Gmail/OAuth).** `Reply-To`
  único por card (`resposta+<token>@inbound.hbxsystem.com.br`) → webhook de entrada do HBX → casa por token
  + cabeçalho `In-Reply-To`/`References` (Message-ID guardado em 2A) → cola na timeline do card + contador
  de não-lido (igual bolinha do WhatsApp no ícone do topo). Escopo Gmail = ZERO. Funciona com envio Gmail OU
  SMTP/HBX. Pode ser feita ANTES/independente de 2A.
  **Infra DECIDIDA (dono já usa): Cloudflare Email Routing + Email Worker (custo ~R$0).** MX catch-all em
  `inbound.hbxsystem.com.br` → Email Worker parseia MIME (`postal-mime`) + tira texto citado + ignora
  auto-resposta/bounce (cabeçalhos `Auto-Submitted`/`Precedence`) → POST com segredo pro webhook NestJS.
  Free tier: Email Routing ilimitado + Workers 100k/dia. Parte mais chata = parse MIME + stripping do
  histórico citado + matching robusto (token + Message-ID).

**Roteamento (esclarecido 21/06):** a resposta do lead NUNCA chega no Gmail do vendedor — chega no
domínio do HBX (`inbound.hbxsystem.com.br`). Envio leva `From: vendedor@gmail.com` (real, p/ confiança) +
`Reply-To: resposta+<token>@inbound…` (sempre HBX). "Responder" do lead vai pro Reply-To → Cloudflare do HBX →
Worker decodifica o token → card+vendedor. **Plataforma nunca precisa conhecer/acessar o e-mail do vendedor
p/ RECEBER.** Token = **HMAC assinado** com `empresa+vendedor+card` (stateless, sem tabela por-e-mail). Todas
as respostas de TODOS os vendedores/empresas funilam p/ 1 domínio + 1 Worker (escala). Gmail do vendedor só
serve p/ ENVIAR (2A, OAuth `gmail.send`, sem senha/sem ler caixa); sem 2A, envia por SMTP/HBX e 2B funciona igual.
**Fresta aceita:** lead que manda e-mail NOVO direto pro Gmail do vendedor (em vez de Responder) não é captado
(cortamos "ler caixa"). 100% de captura = enviar com `From:` do domínio HBX (nome do vendedor aparecendo) —
opção por empresa, perde o "veio do Gmail real dele".

Liga com F5 do PLAN-PLANOS-COBRANCA (agenda do bot: disparo automático no retorno agendado).
