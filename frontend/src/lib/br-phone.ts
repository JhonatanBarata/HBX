// Máscara/normalização de telefone BR para os painéis de conexão WhatsApp.
// Regra do dono: digitar dígitos e auto-formatar (DD)NNNNN-NNNN (os últimos 4
// SEMPRE depois do traço). NÃO forçar +55 na digitação — o +55 entra só no
// envio ao backend (E.164). Exemplos:
//   19997024884 -> (19)99702-4884   |   1997024884 -> (19)9702-4884

export function onlyDigits(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

// Dígitos LOCAIS (DDD + assinante), sem DDI. Remove um "55" colado na frente
// (quando o usuário cola +55…) e limita a 11 (DDD + 9).
export function toLocalDigits(raw: string | null | undefined): string {
  let d = onlyDigits(raw);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

// (DD)NNNNN-NNNN | (DD)NNNN-NNNN — os 4 últimos sempre depois do traço.
export function formatBrPhone(raw: string | null | undefined): string {
  const d = toLocalDigits(raw);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const sub = d.slice(2);
  if (sub.length <= 4) return `(${ddd})${sub}`;
  return `(${ddd})${sub.slice(0, -4)}-${sub.slice(-4)}`;
}

// Completo = 10 (fixo) ou 11 (celular) dígitos locais, DDD começando em 1–9.
export function isBrPhoneComplete(raw: string | null | undefined): boolean {
  const d = toLocalDigits(raw);
  return (d.length === 10 || d.length === 11) && /^[1-9][0-9]/.test(d);
}

// E.164 pro backend (+55…). Vazio se não houver dígitos.
export function brPhoneToE164(raw: string | null | undefined): string {
  const d = toLocalDigits(raw);
  return d ? `+55${d}` : "";
}
