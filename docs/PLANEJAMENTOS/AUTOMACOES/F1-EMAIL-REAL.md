# F1 — E-mail real na cadência (tira o stub)

**Orquestração:** Opus planeja, 1 worker Sonnet edita este .md. Frente NÃO-financeira (sem R$).
**Estado que estamos consertando:** `CadenciaService.executeEmailStep` hoje só grava um
`vendasLeadTimelineEvent` (`eventType: 'cadencia_email'`) e NÃO envia nada. Os badges "N E-mail"
da tela `/automacoes` são propaganda enganosa. A infra de e-mail JÁ funciona em prod
(Resend/SMTP no container) e existe camada por-tenant.

## Objetivo
Fazer o passo `canal:'email'` da cadência ENVIAR de verdade, pelo remetente do PRÓPRIO tenant,
atrás de flag OFF, best-effort (nunca quebra a cadência), com teto diário por empresa. Mantém o
registro no timeline como hoje (agora com o resultado do envio).

## Contrato duro (NÃO negociável)
- **Flag `HBX_CADENCIA_EMAIL_ENABLED` (default OFF).** Com OFF, comportamento = hoje (só timeline,
  zero envio). Segue o padrão do `RUNNER_FLAG` já no arquivo (`=== '1' || === 'true'`).
- **Duplo gate:** o passo de e-mail só roda dentro do `runDueSteps`, que já exige o runner ON.
  Então NADA envia em prod até o dono ligar OS DOIS (`HBX_CADENCIA_RUNNER_ENABLED` +
  `HBX_CADENCIA_EMAIL_ENABLED`). Isso é proposital.
- **Remetente = tenant.** Usar `CompanyMailerService.sendForCompany(companyId, {to, subject, text, html?})`
  (exportado por `MailModule`). NUNCA o `MailService` cru com sender global.
- **Sem config do tenant = SKIP gracioso.** Se `sendForCompany` volta `errorCode ===
  COMPANY_EMAIL_NOT_CONFIGURED` (ou `isReadyForCompany().usable === false`), NÃO enviar, registrar
  no timeline "e-mail não configurado — passo pulado" e SEGUIR a cadência (return normal). Nunca lança.
- **Lead sem e-mail = no-op** (igual ao WhatsApp sem telefone hoje): `VendasLead.email` é `String?`.
  Sem e-mail → só timeline "sem e-mail", segue.
- **Teto diário por empresa** espelhando o de WhatsApp: novo
  `CADENCIA_EMAIL_DAILY_CAP_PER_COMPANY = Number(process.env.HBX_CADENCIA_EMAIL_DAILY_CAP || '50') || 50`
  (e-mail é mais barato que chip → teto maior, 50). Contabilizar num `Map<companyId,n>` no
  `runDueSteps` igual ao `whatsSentByCompany`; ao estourar, ADIAR 1 dia (`nextStepAt = addDays(now,1)`,
  `lastError: 'email_daily_cap_deferred'`), sem furar o teto — MESMO padrão do bloco `whatsCapReached`.
- **Best-effort:** qualquer erro de envio → timeline com o erro, cadência AVANÇA (não trava o lead).

## Onde mexer
1. `backend/src/cadencia/cadencia.module.ts` — adicionar `MailModule` aos `imports`
   (import de `../mail/mail.module`).
2. `backend/src/cadencia/cadencia.service.ts`:
   - injetar `CompanyMailerService` no constructor.
   - novo getter `emailEnabled` (lê `HBX_CADENCIA_EMAIL_ENABLED`).
   - const do teto de e-mail (ver acima).
   - no `runDueSteps`, adicionar `emailSentByCompany` Map + lógica de cap ANTES de chamar o passo
     de e-mail, espelhando o bloco de WhatsApp (deferir ao estourar). Contar só quando `emailEnabled`.
   - reescrever `executeEmailStep(insc, cadencia, passo)`:
     - montar `to` = `lead.email` (buscar `VendasLead` por id+companyId, select id/email/name).
     - `subject` = `passo.titulo || 'Contato'`; `text` = `passo.corpo || ''`. (Sem corpo → só timeline,
       não envia — igual WhatsApp.)
     - se `!emailEnabled` → comportamento de hoje (timeline "cadencia_email", sourceType 'automacao').
     - se `emailEnabled` → `isReadyForCompany` (ou tratar o errorCode do retorno); enviar; timeline
       com resultado (enviado / não-configurado / erro). Retornar `boolean` (enviou?) pro cap contar.
   - a assinatura de `executeEmailStep` pode mudar pra `Promise<boolean>` (hoje é void) — ajustar o
     caller no `runDueSteps` pra usar o retorno no cap (igual `executeWhatsStep`).

## Testes (obrigatório — o arquivo já tem `cadencia.service.test.ts`)
- flag OFF → NÃO chama `sendForCompany`, grava timeline (mock), retorna sem enviar.
- flag ON + tenant configurado + lead com e-mail → chama `sendForCompany` 1×, avança passo.
- flag ON + tenant NÃO configurado (`COMPANY_EMAIL_NOT_CONFIGURED`) → não lança, timeline de skip,
  cadência avança.
- flag ON + lead sem e-mail → não chama send, avança.
- teto de e-mail estourado → adia 1 dia, não envia.
- envio lança erro → cadência avança (best-effort), timeline com erro.

## Gates
- `cd backend && npm run build` verde + `npx jest src/cadencia` verde.
- NÃO publicar. NÃO tocar em nada fora de `src/cadencia/*` e `cadencia.module.ts`.
- Deixar `HBX_CADENCIA_EMAIL_ENABLED` fora do `.env` (default OFF) — a decisão de ligar é do dono.
