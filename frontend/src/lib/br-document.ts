// Máscaras brasileiras de exibição. Não validam o documento/atividade: apenas
// preservam o valor original quando ele não tem o formato esperado.

export function formatBrCnpj(raw: string | null | undefined): string {
  const original = String(raw || "").trim();
  const digits = original.replace(/\D/g, "");
  if (digits.length !== 14) return original;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatBrCpf(raw: string | null | undefined): string {
  const original = String(raw || "").trim();
  const digits = original.replace(/\D/g, "");
  if (digits.length !== 11) return original;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** CPF ou CNPJ pelo tamanho — o tomador da nota pode ser pessoa ou empresa. */
export function formatBrDoc(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11) return formatBrCpf(digits);
  if (digits.length === 14) return formatBrCnpj(digits);
  return String(raw || "").trim();
}

/**
 * Máscara PROGRESSIVA de CPF/CNPJ (o campo se forma enquanto a pessoa digita).
 * Até 11 dígitos veste CPF; do 12º em diante vira CNPJ — é o mesmo campo, e a
 * pessoa não escolhe o tipo antes de digitar.
 */
export function maskBrDocInput(raw: string | null | undefined): string {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatBrCnae(raw: string | null | undefined): string {
  const original = String(raw || "").trim();
  if (!original) return "";
  return original.replace(/\b(\d{4})(\d)(\d{2})\b/, "$1-$2/$3");
}
