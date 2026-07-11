// Flags do envio LIVE do código de confirmação por WhatsApp (F1 —
// docs/PLANEJAMENTOS/CREDITOS/CONFIRMACAO-TELEFONE.md). TODAS nascem OFF: com a
// flag desligada o código continua saindo só no log/preview (dev) ou gated-TODO
// (produção) — NENHUM disparo live acontece. Ligar é ordem do dono na VPS.

function isEnvTrue(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

// Mestra do disparo LIVE (default OFF). ON = em produção o start envia o código
// pela ROTINA DO APP (WebwhatsBridgeService.sendText, chip do Master), com os
// guardrails (cooldown/teto/disjuntor). OFF = comportamento atual (gated-TODO,
// sem envio). Nunca dispara em dev/build (lá o código sai no log/preview).
export function isLiveWhatsappConfirmEnabled(): boolean {
  return isEnvTrue(process.env.LIVE_WHATSAPP_CONFIRM);
}

// Empresa HBX (com WhatsApp conectado) que ENVIA o código. Reusa a mesma env do
// alerta do master (MASTER_ALERT_WA_COMPANY_ID) como fallback — é o mesmo chip do
// Master que já manda os alertas hoje. Env dedicada WHATSAPP_CONFIRM_WA_COMPANY_ID
// tem prioridade se o dono quiser separar. 0 = não configurado (não envia).
export function resolveWhatsappConfirmSenderCompanyId(): number {
  const dedicated = Number(process.env.WHATSAPP_CONFIRM_WA_COMPANY_ID || 0) || 0;
  if (dedicated > 0) return dedicated;
  return Number(process.env.MASTER_ALERT_WA_COMPANY_ID || 0) || 0;
}
