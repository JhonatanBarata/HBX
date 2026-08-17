// PORTAL DE CIDADE ENTROU COMO "SITE" DO LEAD (17/08 — encomenda do dono).
//
// O FURO: `https://www.encontrahortolandia.com.br` e `https://www.sitedacidade.com.br`
// apareceram no card como se fossem o site da empresa. Não são: é o lugar ONDE o lead foi
// encontrado, não o site DELE. O motor já rejeita essa família na descoberta
// (hbx-scraping-engine/app/services/filters.py → is_blocked_lead_source_domain, que pega
// apontador/solutudo/guiamais), mas esses dois nomes nunca estiveram na lista e o endereço do
// portal virou o `website` do lead.
//
// A DECISÃO DO DONO (17/08): o campo NÃO some e NÃO ganha rótulo novo — na tela tem que
// continuar parecendo um site normal. O que muda é o DESTINO DO CLIQUE: em vez de abrir o
// portal, abre a busca do Google pelo nome do lead + cidade + estado. É exatamente o que o
// vendedor faria na mão quando abrisse o link e caísse num diretório.
//
// Por que lista curada e não regra esperta: uma heurística do tipo "o domínio não parece o nome
// da empresa" erra pra cima (empresa com domínio sem relação com o nome é o caso NORMAL no
// Brasil) e trocaria site de verdade por busca. Lista curada erra pra menos — portal novo
// continua passando até alguém acrescentar aqui, e isso é o lado seguro de errar.

// Casado contra CADA rótulo do host, por igualdade OU por prefixo do rótulo. Prefixo é o que
// faz `encontrahortolandia`, `encontracampinas`, `encontraindaiatuba` caírem numa entrada só —
// a família inteira é "encontra" + nome da cidade.
const PORTAIS_DE_CIDADE = [
  'encontra',
  'sitedacidade',
  'guiadacidade',
  'guialocal',
  'guiamais',
  'apontador',
  'solutudo',
  'listaamarela',
  'telelistas',
];

function hostDoSite(website) {
  const cru = String(website || '').trim();
  if (!cru) return '';
  const comEsquema = /^https?:\/\//i.test(cru) ? cru : `https://${cru}`;
  try {
    return new URL(comEsquema).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** O `website` do lead é, na verdade, um portal/diretório de cidade? */
export function ehPortalDeCidade(website) {
  const host = hostDoSite(website);
  if (!host) return false;
  return host.split('.').some((rotulo) => PORTAIS_DE_CIDADE.some(
    (portal) => rotulo === portal || rotulo.startsWith(portal),
  ));
}

/** Busca do Google que o vendedor faria na mão: nome + cidade + estado. */
export function buscaNoGoogle({ name, city, state } = {}) {
  const termo = [name, city, state]
    .map((parte) => String(parte || '').trim())
    .filter(Boolean)
    .join(' ');
  if (!termo) return '';
  return `https://www.google.com/search?q=${encodeURIComponent(termo)}`;
}

/**
 * Href do link de site do card.
 *
 * Site de verdade → o próprio endereço (com esquema, como sempre foi).
 * Portal de cidade → a busca do Google pelo lead. O TEXTO exibido não muda: quem decide o que
 * aparece é o card, e a decisão do dono é que continue parecendo um site normal.
 *
 * Sem nome pra buscar, o portal volta a ser o próprio link — melhor um link ruim do que um
 * link morto.
 */
export function resolveLeadSiteHref({ website, name, city, state } = {}) {
  const cru = String(website || '').trim();
  if (!cru) return null;
  const direto = /^https?:\/\//i.test(cru) ? cru : `https://${cru}`;
  if (!ehPortalDeCidade(cru)) return direto;
  return buscaNoGoogle({ name, city, state }) || direto;
}
