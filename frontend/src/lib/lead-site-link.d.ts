// Tipos do módulo puro lead-site-link.mjs (a fonte é o .mjs — testável com `node --test`
// sem transpilar; este arquivo só descreve o contrato pro TSX).

export declare function ehPortalDeCidade(website: unknown): boolean;

export declare function buscaNoGoogle(opts?: {
  name?: string | null;
  city?: string | null;
  state?: string | null;
}): string;

/**
 * Href do link de site do card: o próprio endereço quando é site de verdade, a busca do Google
 * pelo lead (nome + cidade + estado) quando o `website` é um portal/diretório de cidade.
 * Devolve null quando não há website.
 */
export declare function resolveLeadSiteHref(opts?: {
  website?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null;
