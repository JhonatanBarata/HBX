// CATÁLOGO COMERCIAL DO TENANT — "o que ESTA empresa vende".
//
// Nasceu do dia de vendedor de 30/07/2026. O Copiloto, pedido a rascunhar a
// primeira mensagem para uma distribuidora de água, escreveu:
//   "Estou aqui para ajudar com a gestão fiscal do seu estabelecimento..."
// O dono vende logística e controle de frota. A IA não errou o tom — ela não
// tinha COMO saber o que a empresa vende, e preencheu o buraco com chute.
// Varredura confirmou: não existe, em lugar nenhum do schema, um campo dizendo
// o que a empresa oferece (`Company.prospectingSegmentsJson` é o oposto: quem
// ela quer prospectar).
//
// REGRA DURA, e ela é o motivo deste arquivo existir:
//   SEM CATÁLOGO, A MÁQUINA NÃO AFIRMA O QUE A EMPRESA VENDE.
// Silêncio honesto é barato; oferta inventada custa a credibilidade do tenant e
// a reputação do chip. Ver `catalogoEstaPronto` e `LACUNA_SEM_CATALOGO`.
//
// E o catálogo é POR TENANT, sempre. Este arquivo define a FORMA, nunca o
// conteúdo — cozinhar aqui o produto do dono repetiria o defeito que a auditoria
// de hoje achou em prospecting-safety.ts:31 ("Me chamo Jhonatan" literal no
// código do produto multi-tenant).

/** Uma capacidade do produto, na língua do CLIENTE FINAL — não em jargão interno. */
export type CatalogoCapacidade = {
  /** Chave estável para casar com a dor do lead. Ex.: 'rota_do_dia'. */
  chave: string;
  /** Como o cliente descreveria o ganho. Frase curta, sem jargão. */
  ganho: string;
  /** Dores que esta capacidade resolve — usadas para escolher o que citar. */
  resolve: string[];
};

export type CatalogoComercial = {
  /** Uma linha: o que a empresa vende. É o insumo mais importante. */
  oQueVendemos: string;
  /** As capacidades. A máquina escolhe POUCAS, nunca despeja todas. */
  capacidades: CatalogoCapacidade[];
  /** Para quem serve — ajuda a máquina a reconhecer lead fora do perfil. */
  paraQuem: string[];
  /** Comparação honesta de preço, se a empresa quiser usar. Opcional. */
  ancoraDePreco?: string | null;
};

/** Quantas capacidades a máquina pode citar numa mensagem de WhatsApp. */
export const MAX_CAPACIDADES_POR_MENSAGEM = 3;

/**
 * O que a máquina faz quando não há catálogo: NÃO inventa oferta. Ela admite o
 * limite e devolve a conversa para o humano. Isto não é uma mensagem de erro
 * para o lead — é a instrução que entra no prompt no lugar do catálogo.
 */
export const LACUNA_SEM_CATALOGO =
  'Você NÃO sabe o que esta empresa vende. É PROIBIDO afirmar, supor ou dar exemplo ' +
  'de produto, serviço, preço ou benefício. Faça apenas uma pergunta de acolhimento ' +
  'e avise que um responsável assume a conversa.';

function limparTexto(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Chave estável a partir de texto humano: sem acento, minúscula, `_`. A tela do
 * catálogo NÃO pede "chave" (jargão interno) — ela nasce do próprio ganho.
 */
function slugChave(value: unknown): string {
  return limparTexto(value, 60)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function limparLista(value: unknown, max: number, maxItens: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const texto = limparTexto(item, max);
    if (texto && !out.includes(texto)) out.push(texto);
    if (out.length >= maxItens) break;
  }
  return out;
}

/** Sanitiza o que veio da UI/banco. Nunca lança: entrada podre vira catálogo vazio. */
export function normalizeCatalogo(raw: unknown): CatalogoComercial {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const capacidadesRaw = Array.isArray(source.capacidades) ? source.capacidades : [];
  const capacidades: CatalogoCapacidade[] = [];
  for (const item of capacidadesRaw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const ganho = limparTexto(row.ganho, 180);
    // Sem chave explícita ela nasce do ganho — a UI só pede a frase do ganho.
    const chave = slugChave(row.chave) || slugChave(ganho);
    if (!chave || !ganho) continue;
    if (capacidades.some((c) => c.chave === chave)) continue;
    capacidades.push({ chave, ganho, resolve: limparLista(row.resolve, 60, 8) });
    if (capacidades.length >= 20) break;
  }
  return {
    oQueVendemos: limparTexto(source.oQueVendemos, 240),
    capacidades,
    paraQuem: limparLista(source.paraQuem, 160, 6),
    ancoraDePreco: limparTexto(source.ancoraDePreco, 240) || null,
  };
}

/**
 * O portão. Catálogo só está pronto com a frase do que vende E pelo menos uma
 * capacidade — sem isso a máquina não tem o que dizer sem inventar.
 */
export function catalogoEstaPronto(catalogo: CatalogoComercial | null | undefined): boolean {
  if (!catalogo) return false;
  return Boolean(catalogo.oQueVendemos) && catalogo.capacidades.length > 0;
}

/** O que falta preencher, para a tela cobrar do admin em vez de falhar calada. */
export function lacunasDoCatalogo(catalogo: CatalogoComercial | null | undefined): string[] {
  const faltas: string[] = [];
  if (!catalogo?.oQueVendemos) faltas.push('Uma linha dizendo o que a empresa vende');
  if (!catalogo?.capacidades?.length) faltas.push('Pelo menos uma capacidade, na língua do cliente');
  return faltas;
}

/**
 * Escolhe as capacidades a citar: as que casam com a dor que o lead demonstrou,
 * ordenadas por número de casamentos; completa com as primeiras do catálogo até
 * o teto. Determinístico (sem sorteio) — a variação de texto é trabalho do
 * gerador, não da seleção, senão o mesmo lead recebe ofertas diferentes a cada
 * mensagem.
 */
export function escolherCapacidades(
  catalogo: CatalogoComercial,
  doresDoLead: string[],
  limite: number = MAX_CAPACIDADES_POR_MENSAGEM,
): CatalogoCapacidade[] {
  const teto = Math.max(1, Math.min(limite, MAX_CAPACIDADES_POR_MENSAGEM));
  const dores = doresDoLead.map((d) => limparTexto(d, 60).toLowerCase()).filter(Boolean);
  const pontuadas = catalogo.capacidades.map((cap, ordem) => {
    const casamentos = dores.filter((dor) =>
      cap.resolve.some((r) => r.toLowerCase().includes(dor) || dor.includes(r.toLowerCase())),
    ).length;
    return { cap, casamentos, ordem };
  });
  pontuadas.sort((a, b) => (b.casamentos - a.casamentos) || (a.ordem - b.ordem));
  return pontuadas.slice(0, teto).map((p) => p.cap);
}

/**
 * O bloco que entra no prompt. Sem catálogo pronto devolve a LACUNA — nunca um
 * bloco vazio, porque bloco vazio é convite para o modelo preencher sozinho (foi
 * exatamente assim que nasceu a "gestão fiscal").
 */
export function buildCatalogoPromptBlock(
  catalogo: CatalogoComercial | null | undefined,
  doresDoLead: string[] = [],
): string {
  if (!catalogoEstaPronto(catalogo)) return LACUNA_SEM_CATALOGO;
  const pronto = catalogo as CatalogoComercial;
  const linhas: string[] = [`O que esta empresa vende: ${pronto.oQueVendemos}`];
  const escolhidas = escolherCapacidades(pronto, doresDoLead);
  if (escolhidas.length) {
    linhas.push(`Cite no MÁXIMO ${escolhidas.length}, só estas, na língua do cliente:`);
    for (const cap of escolhidas) linhas.push(`- ${cap.ganho}`);
  }
  if (pronto.paraQuem.length) linhas.push(`Serve para: ${pronto.paraQuem.join('; ')}`);
  if (pronto.ancoraDePreco) linhas.push(`Se perguntarem preço, use só esta comparação: ${pronto.ancoraDePreco}`);
  linhas.push('É PROIBIDO citar produto, benefício ou preço que não esteja acima.');
  return linhas.join('\n');
}
