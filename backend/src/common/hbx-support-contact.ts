// ONDE O CLIENTE FALA COM A HBX — a fonte única (PR22082026-CLIENTE-ME-ACHA).
//
// O mesmo par ADMIN_SUPPORT_PHONE / ADMIN_SUPPORT_EMAIL já era lido pelo financeiro,
// pelo cadastro em massa e pela config da logística, cada um com a sua cópia da
// linha. Três cópias de "qual é o telefone da HBX" é como uma delas fica velha sem
// ninguém perceber — e agora o número também vai no e-mail de boas-vindas e no lead
// "quero que a HBX me ligue". Então: um arquivo, três leitores.
//
// Só dígitos pro `wa.me/`; o "bonito" é pra texto de e-mail/WhatsApp.

const DEFAULT_SUPPORT_PHONE = '+5519997024884';
const DEFAULT_SUPPORT_EMAIL = 'jbinformatica1100@gmail.com';

/** Só dígitos, com o 55 na frente (é o que o wa.me aceita). */
export function supportWhatsappDigits(): string {
  const digits = String(process.env.ADMIN_SUPPORT_PHONE || DEFAULT_SUPPORT_PHONE).replace(/\D/g, '');
  if (!digits) return '';
  // 10/11 dígitos = DDD + número sem o país → prefixa 55 (mesma régua do NativeAppBridge.openWhatsapp).
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** "(19) 99702-4884" — pra ler em e-mail/WhatsApp. Cai nos dígitos crus se o formato fugir. */
export function supportWhatsappPretty(): string {
  const digits = supportWhatsappDigits();
  const local = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits ? `+${digits}` : '';
}

/** Link pronto do WhatsApp da HBX (texto opcional já codificado). */
export function supportWhatsappLink(text?: string): string {
  const digits = supportWhatsappDigits();
  if (!digits) return '';
  const suffix = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${suffix}`;
}

export function supportEmail(): string {
  return String(process.env.ADMIN_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();
}
