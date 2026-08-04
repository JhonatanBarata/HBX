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

// LEITURA (lista, ficha, card) — (19) 99155-6318, com espaço depois do DDD.
// É irmã da máscara de DIGITAÇÃO acima, e é separada DE PROPÓSITO: ali cada
// caractere entra enquanto o dedo digita (espaço atrapalharia o cursor); aqui o
// número já existe e o espaço é o que separa DDD de assinante no olho.
//
// O que NÃO tem cara de telefone brasileiro sai como veio. Enfiar máscara BR
// num número estrangeiro (ou num campo com dois telefones colados) inventa um
// dado que não existe — pior que não formatar.
export function formatBrPhoneDisplay(raw: string | null | undefined): string {
  const bruto = String(raw ?? "").trim();
  const cru = onlyDigits(bruto);
  if (!cru) return bruto;
  // O "+" DECLARA um DDI, e DDI que não é 55 encerra o assunto. Sem esta linha
  // "+1 415 555 2671" (EUA) vira "(14) 15555-2671": 11 dígitos com um DDD 14
  // plausível na frente, e a máscara passa a mentir com cara de certeza.
  if (bruto.startsWith("+") && !cru.startsWith("55")) return bruto;
  // +55 só é DDI quando sobra número BR embaixo dele (12 ou 13 dígitos).
  const d = (cru.length === 12 || cru.length === 13) && cru.startsWith("55") ? cru.slice(2) : cru;
  // DDD brasileiro vai de 11 a 99 — nenhum tem 0 em qualquer das duas casas.
  if ((d.length === 10 || d.length === 11) && /^[1-9][1-9]/.test(d)) {
    return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
  }
  return bruto;
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
