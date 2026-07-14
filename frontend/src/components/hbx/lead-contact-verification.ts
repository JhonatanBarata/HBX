export type WhatsAppVerificationContact = {
  kind?: string | null;
  value?: string | null;
  valueNormalized?: string | null;
  whatsappStatus?: string | boolean | null;
  whatsappConfirmed?: boolean | null;
};

export function whatsappIsExplicitlyConfirmed(
  contact: WhatsAppVerificationContact,
  fallback: Record<string, boolean>,
) {
  if (contact.whatsappConfirmed === true || contact.whatsappStatus === true) return true;
  const status = String(contact.whatsappStatus || "").trim().toLowerCase();
  if (["confirmed", "verified", "valid"].includes(status)) return true;
  const digits = String(contact.value || contact.valueNormalized || "").replace(/\D/g, "");
  return Boolean(digits && fallback[digits] === true);
}
