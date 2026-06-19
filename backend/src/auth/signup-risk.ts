// Verificação por telefone BASEADA EM RISCO — gancho (F8, 19/06).
//
// REGRA (como as grandes fazem): o telefone NÃO é pedágio de entrada — é um
// DESAFIO que só acende quando o risco aparece. Sem risco, o e-mail confirmado
// basta (paridade com o Google). Quando um sinal estoura, o fluxo força
// "confirme por telefone/WhatsApp pra continuar" (reusa o F6). É o oposto de
// pedir telefone de todo mundo: pede só de quem parece abuso de free-trial.
//
// SINAIS A CRAVAR (quando houver telemetria):
//   • muitas contas do MESMO IP numa janela curta;
//   • e-mail descartável (domínio temporário) — único sinal barato HOJE, só
//     precisa do e-mail (implementado abaixo);
//   • velocity de free-trial pelo mesmo fingerprint de device;
//   • reincidência de CPF/telefone (cruza com trial-usage.ts).
//
// ENTREGA DESTA FRENTE (ordem do dono: "planejar isso"): o GANCHO (ponto de
// decisão no fluxo) + a regra documentada, com o detector DESLIGADO por padrão.
// Ligar os triggers de IP/fingerprint é o passo seguinte — exige telemetria de
// IP/fingerprint que ainda não coletamos. NÃO construir o detector inteiro agora.
//
// Liga com SIGNUP_RISK_CHALLENGE_ENABLED=true. Default: desligado → nunca desafia.

export type SignupRiskContext = {
  email: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type SignupRiskDecision = {
  requiresPhoneChallenge: boolean;
  reasons: string[];
};

// Lista enxuta de domínios descartáveis conhecidos. Não é exaustiva de propósito
// (a varredura completa é serviço externo); cobre os mais comuns sem custo.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'sharklasers.com',
  'yopmail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'throwawaymail.com',
  'mintemail.com',
  'mohmal.com',
]);

export function isSignupRiskChallengeEnabled(): boolean {
  return String(process.env.SIGNUP_RISK_CHALLENGE_ENABLED || '').trim().toLowerCase() === 'true';
}

export function isDisposableEmailDomain(email: string): boolean {
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
  return Boolean(domain) && DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

// GANCHO: ponto de decisão único do signup/confirm. Default desligado → devolve
// sempre "sem desafio" (comportamento atual, e-mail basta). Com a flag ligada,
// avalia os sinais BARATOS disponíveis hoje (e-mail descartável). Os sinais de
// IP/velocity/fingerprint ficam como TODO até existir telemetria — quem ligar a
// flag herda só o que já dá pra provar, sem falso-positivo cego.
export function evaluateSignupRisk(ctx: SignupRiskContext): SignupRiskDecision {
  if (!isSignupRiskChallengeEnabled()) {
    return { requiresPhoneChallenge: false, reasons: [] };
  }
  const reasons: string[] = [];
  if (isDisposableEmailDomain(ctx.email)) {
    reasons.push('disposable_email');
  }
  // TODO(telemetria): muitas contas do mesmo IP numa janela; velocity por
  // fingerprint; reincidência de CPF/telefone (cruzar com trial-usage). Cada um
  // precisa de coleta (IP/fingerprint) que ainda não temos — ligar aqui depois.
  return { requiresPhoneChallenge: reasons.length > 0, reasons };
}
