// Máscaras brasileiras de exibição. Não validam o documento/atividade: apenas
// preservam o valor original quando ele não tem o formato esperado.

export function formatBrCnpj(raw: string | null | undefined): string {
  const original = String(raw || "").trim();
  const digits = original.replace(/\D/g, "");
  if (digits.length !== 14) return original;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatBrCnae(raw: string | null | undefined): string {
  const original = String(raw || "").trim();
  if (!original) return "";
  return original.replace(/\b(\d{4})(\d)(\d{2})\b/, "$1-$2/$3");
}
