// HOT-05 — util ÚNICA de link WhatsApp (wa.me) do lado frontend. Consumida por toda superfície
// que mostra telefone de lead (card Vendas/Atendimento/Leads, detalhes-negócio) — substitui as
// cópias soltas de `https://wa.me/${digits}` espalhadas pelas telas. Ação HUMANA (o vendedor
// clica) — não passa pelo motor/Webwhats, zero risco de ban (docs/PLANEJAMENTOS/hot/
// 05-links-whatsapp-1clique.md). Cópia irmã no backend: backend/src/webscraping/radar/shared/
// wa-link.util.ts (mesma assinatura/regra de normalização).
import { categoryOfSegment } from "@/lib/radar-segments";
import waMessageTemplatesRaw from "@/lib/wa-message-templates.json";

export type BuildWaLinkOptions = {
  /** Texto pré-preenchido (vira `?text=`, já URL-encoded pela função). */
  text?: string | null;
};

/** Normaliza qualquer telefone BR cru pros dígitos que o wa.me espera (55 + DDD + número). */
export function normalizeWaPhoneDigits(rawPhone: string | null | undefined): string {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  // já vem com 55 e tamanho de DDI+DDD+número (12/13 dígitos) → mantém.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  // 10/11 dígitos (DDD+número, sem 55) → prefixa.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/**
 * Monta o link wa.me de 1 clique a partir de um telefone cru (com ou sem DDI/máscara).
 * `opts.text` vira `?text=` (URL-encoded). Retorna null se não sobrar nenhum dígito.
 */
export function buildWaLink(phone: string | null | undefined, opts: BuildWaLinkOptions = {}): string | null {
  const digits = normalizeWaPhoneDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = String(opts.text || "").trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

type WaTemplates = Record<string, string> & { _comment?: string };
const TEMPLATES = waMessageTemplatesRaw as WaTemplates;

// Label da categoria (RADAR_SEGMENT_CATEGORIES, ex.: "Comércio & Serviços") -> slug do JSON de
// templates (espelha HBX_CATEGORY_SEGMENTS do backend, ex.: "comercio").
const CATEGORY_LABEL_TO_SLUG: Record<string, string> = {
  "Saúde": "saude",
  "Beleza & Estética": "beleza",
  "Alimentação": "alimentacao",
  "Automotivo": "automotivo",
  "Comércio & Serviços": "comercio",
  "Indústria": "industria",
  "Atacado & Logística": "atacado",
  "Agro & Campo": "agro",
};

function normalizeTemplateCategory(segment: string | null | undefined): string {
  const label = segment ? categoryOfSegment(segment) : null;
  const slug = label ? CATEGORY_LABEL_TO_SLUG[label] : null;
  return slug && TEMPLATES[slug] ? slug : "default";
}

/**
 * Preenche o template de abertura por categoria (wa-message-templates.json) a partir do
 * segmento do lead. Sem segmento reconhecido → cai no template "default". Placeholders:
 * {nome} {segmento} {cidade} (só entram se o dado existir, sem deixar "de undefined").
 */
export function buildWaMessage(params: {
  name?: string | null;
  segment?: string | null;
  city?: string | null;
}): string {
  const key = normalizeTemplateCategory(params.segment);
  const template = TEMPLATES[key] || TEMPLATES.default;
  const nome = params.name ? ` ${params.name}` : "";
  const segmento = params.segment ? params.segment.toLowerCase() : "sua área";
  const cidade = params.city ? ` em ${params.city}` : "";
  return template
    .replace("{nome}", nome)
    .replace("{segmento}", segmento)
    .replace("{cidade}", cidade);
}
