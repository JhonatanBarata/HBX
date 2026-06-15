// Ícone de CANAL — PADRÃO CENTRAL (dono 14/06/2026). Um só componente pra
// WhatsApp / telefone / e-mail / Instagram / Facebook / site, em TODA tela onde
// o canal/contato de um lead aparece (Radar, Leads, Vendas, aside).
// A imagem real mora em /Icones/<canal>.webp e troca claro↔escuro SOZINHA pelo
// CSS (.chan-ico--<canal> + [data-theme-mode="dark"]). Lei 5: zero cor/inline na
// tela — só a classe central. Tamanho por classe (sm/md/lg), nunca style inline.

export type Canal = "whatsapp" | "telefone" | "email" | "instagram" | "facebook" | "site";

export const CANAL_LABEL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  email: "E-mail",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
};

// Aceita os apelidos que já circulam no app (ex.: recommendedChannel="call",
// "mail", "web") e normaliza pro canal canônico. Devolve null se não for canal.
export function toCanal(value: string | null | undefined): Canal | null {
  const v = String(value || "").trim().toLowerCase();
  if (v === "whatsapp" || v === "wa") return "whatsapp";
  if (v === "telefone" || v === "phone" || v === "call" || v === "ligacao" || v === "ligação") return "telefone";
  if (v === "email" || v === "e-mail" || v === "mail") return "email";
  if (v === "instagram" || v === "insta" || v === "ig") return "instagram";
  if (v === "facebook" || v === "face" || v === "fb") return "facebook";
  if (v === "site" || v === "website" || v === "web" || v === "globe") return "site";
  return null;
}

export function CanalIcon({ canal, size = "md", label }: { canal: Canal; size?: "sm" | "md" | "lg"; label?: string }) {
  const cls = "chan-ico chan-ico--" + canal + (size === "sm" ? " chan-ico--sm" : size === "lg" ? " chan-ico--lg" : "");
  return <span className={cls} role="img" aria-label={label ?? CANAL_LABEL[canal]} />;
}
