// F4 (27/07, PR27072026-ROTA-3-NIVEIS) — PARSERS PUROS da quarentena de importação
// ("máquina de engolir lista podre"). Zero Prisma, zero I/O, zero rede — só
// heurística testável isolada, chamada por logistica-importacao.service.ts.
//
// A régua de ENDEREÇO/CNEFE (verde/vermelho) mora em
// logistica-importacao-sanitizacao.util.ts e REUSA o sanitizador existente
// (cnefe-resolver.util.ts/logistica-cep.util.ts) — este arquivo só EXTRAI campos
// de um texto bruto (linha colada do WhatsApp/caderno de papel) ou de uma linha de
// planilha; nunca decide verde/vermelho.
//
// Filosofia (ordem do dono, F4): "linhas ilegíveis viram item VERMELHO com o bruto
// preservado, NUNCA descartadas silenciosamente". Este parser é DELIBERADAMENTE
// conservador — quando a linha não tem separador claro entre nome/endereço, ele
// NÃO inventa um corte; devolve o que deu pra extrair (dia/telefone/produto) e
// deixa endereço/nome em aberto pra correção manual (PATCH item), em vez de
// arriscar um split errado que passaria por dado bom.

import { extrairNumeroPorta } from '../nucleo/cnefe-resolver.util';

export interface ParsedItemFields {
  nome: string | null;
  telefone: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  /** ISO 1=segunda…7=domingo — mesma convenção de ClienteProduto.diasSemana. */
  diasSemana: number[];
  produtoTexto: string | null;
  qtd: number | null;
}

function camposVazios(): ParsedItemFields {
  return {
    nome: null, telefone: null, endereco: null, numero: null, bairro: null,
    cidade: null, uf: null, cep: null, diasSemana: [], produtoTexto: null, qtd: null,
  };
}

const DIACRITICOS = /[̀-ͯ]/g;

/** Minúsculo, sem acento — só pra CASAR/BUSCAR, nunca pra gravar (mesmo padrão de
 *  logistica-cep.util.ts#normalizar). */
function normalizarTexto(v: string | null | undefined): string {
  return String(v ?? '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}

// ── dia da semana ──────────────────────────────────────────────────────────────
// Nomes/abreviações + ordinal BR ("2ª-feira" = segunda, o 2º dia contando domingo=1º
// — convenção nativa do PT-BR). "1ª"/"7ª" (domingo/sábado por ordinal) são raros e
// ambíguos na fala real — DELIBERADAMENTE fora do dicionário: melhor não reconhecer
// que adivinhar errado (mesma lei do freio de geocode aplicada a dado de agenda).
const DIA_DICIONARIO: Record<string, number> = {
  segunda: 1, seg: 1, '2a': 1,
  terca: 2, ter: 2, '3a': 2,
  quarta: 3, qua: 3, '4a': 3,
  quinta: 4, qui: 4, '5a': 4,
  sexta: 5, sex: 5, '6a': 5,
  sabado: 6, sab: 6,
  domingo: 7, dom: 7,
};

/** "2ª-feira"/"2ª feira"/"2a" → token "2a"; "sexta-feira" → "sexta". Só normalização
 *  de TOKEN pra casar o dicionário — não é exibido nem gravado. */
function tokensDeDia(textoNormalizado: string): string[] {
  return textoNormalizado
    .replace(/-?\s*feiras?\b/g, '')
    .replace(/[ºª]/g, 'a')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Reconhece 1+ dias da semana em QUALQUER texto solto ("seg e qui", "toda terça e
 *  sexta", "2ª/5ª"). Devolve ISO ordenado sem duplicata; [] quando nada reconhecido.
 *  Uso direto (fora de parseLinhaTexto): planilha/campo já isolado, sem risco de rua
 *  com nome de dia dentro — dentro de parseLinhaTexto quem decide é
 *  `diasDeSegmentoPuro`, mais rígido (SEGMENTO inteiro, não palavra solta). */
export function parseDiasSemana(textoBruto: string): number[] {
  const tokens = tokensDeDia(normalizarTexto(textoBruto));
  const dias = new Set<number>();
  for (const t of tokens) {
    const d = DIA_DICIONARIO[t];
    if (d) dias.add(d);
  }
  return [...dias].sort((a, b) => a - b);
}

/** Conectivos que podem conviver num segmento 100% dia ("toda sexta", "seg e qui")
 *  sem tirar a "pureza" dele — qualquer OUTRA palavra (rua, bairro, nome…) reprova. */
const FILLER_DIA = new Set(['e', 'toda', 'todas', 'todo', 'todos']);

/**
 * Um SEGMENTO inteiro (já separado por vírgula/hífen) é feito SÓ de dia(s) da
 * semana + conectivo? Devolve os dias (ISO) ou null quando há QUALQUER palavra que
 * não seja dia/conectivo — é o que impede "Avenida Quinta da Boa Vista" de vazar
 * "quinta" pra dentro da agenda: a via inteira nunca é um segmento 100% dia.
 */
function diasDeSegmentoPuro(seg: string): number[] | null {
  const tokens = tokensDeDia(normalizarTexto(seg)).filter((t) => !FILLER_DIA.has(t));
  if (!tokens.length) return null;
  const dias: number[] = [];
  for (const t of tokens) {
    const d = DIA_DICIONARIO[t];
    if (!d) return null;
    dias.push(d);
  }
  return dias;
}

/** Planilha pode trazer o dia já em ISO cru ("1,3,5", convenção do próprio banco) —
 *  aceita esse caminho ANTES de cair no reconhecimento por nome (mais barato e
 *  inequívoco quando o template já foi preenchido "certo"). */
export function parseDiasSemanaFlexivel(valor: string | number | null | undefined): number[] {
  const texto = String(valor ?? '').trim();
  if (!texto) return [];
  if (/^[1-7](\s*[,/;]\s*[1-7])*$/.test(texto)) {
    const dias = new Set(texto.split(/[,/;]/).map((t) => Number(t.trim())).filter((n) => n >= 1 && n <= 7));
    return [...dias].sort((a, b) => a - b);
  }
  return parseDiasSemana(texto);
}

// ── telefone ────────────────────────────────────────────────────────────────────
// Run de 10-11 dígitos com formatação BR comum (DDD + fixo/celular). Nunca casa CEP
// (8 dígitos) nem número de casa isolado (1-4 dígitos) — o teto de 11 e piso de 10
// já bastam pra isso (CEP tem 8, a maioria dos números de porta tem 1-4).
const TELEFONE_RE = /(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;

/** Devolve {digitos, match} do 1º telefone plausível na linha, ou null. `match` é a
 *  substring EXATA achada — quem chama usa pra remover do resto antes de extrair
 *  nome/endereço (o telefone não pode "vazar" pro endereço). */
export function encontrarTelefone(texto: string): { digitos: string; match: string } | null {
  const candidatos = texto.match(TELEFONE_RE);
  if (!candidatos) return null;
  for (const match of candidatos) {
    let digitos = match.replace(/\D/g, '');
    // 13 dígitos só acontece com país+DDD+celular(9) — nenhum número local BR chega
    // a 13 dígitos, então "55" na frente aqui É código de país (ao contrário de um
    // eventual DDD 55/RS, que sozinho só soma 10-11 dígitos e não entra neste ramo).
    if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2);
    if (digitos.length === 10 || digitos.length === 11) return { digitos, match };
  }
  return null;
}

// ── quantidade + produto ──────────────────────────────────────────────────────────
// Conservador DE PROPÓSITO: só reconhece quantidade quando vem GRUDADA numa unidade
// reconhecível ("2 galões", "1x botijão", "3 un") — nunca um número solto (que na
// prática É o número da casa, "Rua 22", data, etc.). Sem a unidade, fica sem produto
// — a efetivação segue funcionando (cliente entra sem plano de entrega até alguém
// completar o produto na tela), nunca inventa carrinho.
//
// Roda contra o texto ORIGINAL (nunca o normalizado): `match[0]` precisa ser
// substring EXATA de `resto` pra dar pra remover depois sem bagunçar acento/posição
// (normalizarTexto pode até MUDAR o comprimento da string — NFD decompõe "õ" em 2
// codepoints antes de descartar o combinante — então índice normalizado ≠ índice
// original). Por isso as vogais acentuadas entram na classe de caracteres, e o `i`
// cobre maiúscula/minúscula.
const QTD_PRODUTO_RE = /\b(\d{1,3})\s*[x×]?\s*(gal(?:[ãa]o|[õo]es|o)\w*|garraf\w*|buj(?:[ãa]o|[õo]es)\w*|botij(?:[ãa]o|[õo]es)?\w*|unid\w*|un\b)/i;

export function encontrarQtdProduto(texto: string): { qtd: number; produtoTexto: string; match: string } | null {
  const m = QTD_PRODUTO_RE.exec(texto);
  if (!m) return null;
  const qtd = Math.max(1, Math.min(999, Number(m[1]) || 1));
  return { qtd, produtoTexto: m[2], match: m[0] };
}

// ── UF (whitelist fechada — 27 unidades federativas) ─────────────────────────────
const UFS_BR = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

// Delimitadores de segmento — MESMA família de logradouroDoCadastro (vírgula, ponto
// e vírgula, hífen isolado): garante que "endereço" aqui e a busca de via na
// sanitização enxergam a mesma pontuação como fronteira.
const SEGMENTO_RE = /\s*[,;]\s*|\s+[-–—]\s+/;

/**
 * Heurística linha-a-linha do TEXTO COLADO (WhatsApp/caderno digitado). Convenção
 * assumida (a mais comum em lista de entrega real): "Nome - endereço - dia [- tel]",
 * em qualquer ordem de vírgula/hífen. 1º pedaço = nome; o RESTO (menos dia/telefone/
 * qtd+produto, que são reconhecidos em qualquer posição) = endereço.
 *
 * `opts.cidadePadrao/ufPadrao` (do LOTE, ver LogisticaImportacaoLote) preenchem
 * cidade/UF só quando a linha não trouxe a própria — WhatsApp de rota real quase
 * nunca repete a cidade em toda linha (é óbvia pra quem digitou).
 */
export function parseLinhaTexto(
  linhaBruta: string,
  opts: { cidadePadrao?: string | null; ufPadrao?: string | null } = {},
): ParsedItemFields {
  const linha = String(linhaBruta ?? '').trim();
  if (!linha) return camposVazios();

  const telefoneAchado = encontrarTelefone(linha);
  const qtdProduto = encontrarQtdProduto(linha);

  // Resto = a linha com telefone/qtd+produto retirados (dia é removido por SEGMENTO
  // abaixo, não aqui — dia soltando span solto arriscaria comer parte do endereço,
  // ex. "Avenida Quinta da Boa Vista" [rua real] não pode virar dia da semana).
  let resto = linha;
  if (telefoneAchado) resto = resto.replace(telefoneAchado.match, ' ');
  if (qtdProduto) resto = resto.replace(new RegExp(escapeRegExp(qtdProduto.match), 'i'), ' ');
  resto = resto.replace(/\s{2,}/g, ' ').trim();

  const segmentosBrutos = resto
    .split(SEGMENTO_RE)
    .map((s) => s.trim())
    // Descarta segmento que sobrou só com pontuação (hífen órfão de onde telefone/
    // qtd foram cortados) — nunca vira "nome"/"endereço" fantasma.
    .filter((s) => s && /[a-z0-9]/i.test(s));

  // Dia da semana só sai de um SEGMENTO INTEIRO composto por dia(s) + conectivos
  // ("seg e qui", "toda sexta") — NUNCA de uma palavra solta dentro de um segmento
  // maior. Sem isso, endereço real com "Quinta"/"Domingos" no nome (comuns em rua/
  // bairro do Brasil) contaminaria a agenda do cliente com um dia que não existe.
  const diasDoTexto = new Set<number>();
  const segmentos = segmentosBrutos.filter((seg) => {
    const dias = diasDeSegmentoPuro(seg);
    if (!dias) return true;
    dias.forEach((d) => diasDoTexto.add(d));
    return false;
  });
  const diasSemana = [...diasDoTexto].sort((a, b) => a - b);

  if (segmentos.length === 0) {
    // Linha só tinha dia/telefone/produto (ou ficou vazia) — sem nome/endereço
    // reconhecível. Não inventa: bruto continua intacto pra correção manual.
    return { nome: null, telefone: telefoneAchado?.digitos ?? null, endereco: null, numero: null, bairro: null,
      cidade: opts.cidadePadrao ?? null, uf: opts.ufPadrao ?? null, cep: null, diasSemana,
      produtoTexto: qtdProduto?.produtoTexto ?? null, qtd: qtdProduto?.qtd ?? null };
  }

  const nome = segmentos.length > 1 ? segmentos[0] : null;
  const enderecoSegmentos = segmentos.length > 1 ? segmentos.slice(1) : segmentos;

  // UF: segmento isolado de 2 letras batendo a whitelist BR — extrai e some da
  // composição (senão "SP" viraria ruído na busca de logradouro). Cidade: só
  // adivinha quando há UF ANCORANDO — o segmento IMEDIATAMENTE ANTES da UF é
  // quase sempre a cidade ("... - Rio Claro - SP", convenção padrão de endereço
  // BR). SEM UF near ("... - Centro - seg", bairro sem cidade nenhuma por perto)
  // não tenta adivinhar — "Centro" viraria "cidade" errado; fica dentro do
  // endereço composto e cidadePadrao (do lote) é quem preenche o buraco.
  const ufIdx = enderecoSegmentos.findIndex((seg) => seg.length === 2 && UFS_BR.has(seg.toUpperCase()));
  let uf = opts.ufPadrao ?? null;
  let cidade = opts.cidadePadrao ?? null;
  const excluir = new Set<number>();
  if (ufIdx >= 0) {
    uf = enderecoSegmentos[ufIdx].toUpperCase();
    excluir.add(ufIdx);
    if (ufIdx > 0) {
      cidade = enderecoSegmentos[ufIdx - 1];
      excluir.add(ufIdx - 1);
    }
  }
  const enderecoRestante = enderecoSegmentos.filter((_, i) => !excluir.has(i));

  const endereco = enderecoRestante.length ? enderecoRestante.join(', ') : null;
  const numero = endereco ? String(extrairNumeroPorta({ endereco }) ?? '') || null : null;

  return {
    nome,
    telefone: telefoneAchado?.digitos ?? null,
    endereco,
    numero,
    bairro: null,
    cidade,
    uf,
    cep: null,
    diasSemana,
    produtoTexto: qtdProduto?.produtoTexto ?? null,
    qtd: qtdProduto?.qtd ?? null,
  };
}

/** Quebra um texto colado (textarea) em linhas não-vazias — cada linha vira 1 item
 *  (nunca agrupa/funde linhas: 1 linha digitada = 1 cliente na cabeça de quem digita). */
export function quebrarEmLinhas(texto: string): string[] {
  return String(texto ?? '')
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── planilha (xlsx/csv) ───────────────────────────────────────────────────────────
// Cabeçalho tolerante (mesmo espírito do import-planilha-modal.tsx do frontend, mas
// server-side: lib `xlsx` já é dependência do backend — nenhuma nova adicionada).

export interface PlanilhaColuna {
  key: keyof ParsedItemFields | 'diaTexto';
  aliases: string[];
}

export const PLANILHA_COLUNAS: PlanilhaColuna[] = [
  { key: 'nome', aliases: ['nome', 'cliente', 'nome completo', 'razao social'] },
  { key: 'telefone', aliases: ['telefone', 'whatsapp', 'fone', 'celular'] },
  { key: 'endereco', aliases: ['endereco', 'endereço', 'logradouro', 'rua'] },
  { key: 'numero', aliases: ['numero', 'número', 'nº', 'n'] },
  { key: 'bairro', aliases: ['bairro'] },
  { key: 'cidade', aliases: ['cidade', 'municipio', 'município'] },
  { key: 'uf', aliases: ['uf', 'estado'] },
  { key: 'cep', aliases: ['cep'] },
  { key: 'diaTexto', aliases: ['dia', 'dias', 'dia da semana', 'dias da semana', 'dia(s)'] },
  { key: 'produtoTexto', aliases: ['produto', 'item'] },
  { key: 'qtd', aliases: ['qtd', 'quantidade', 'qtde'] },
];

function tokenizeHeader(v: unknown): string {
  return String(v ?? '').toLowerCase().normalize('NFD').replace(DIACRITICOS, '').replace(/[^a-z0-9]/g, '');
}

/** "12,50" / "R$ 1.234,50" / 12.5 → número pt-BR tolerante. null se vazio/inválido. */
function parseNumeroPtBr(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/[R$\s]/gi, '').trim();
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê a 1ª aba de um buffer xlsx/csv (mesma lib `xlsx` já usada no import genérico
 * de Contatos/Produtos) e devolve linhas cruas casadas por cabeçalho tolerante a
 * variação de nome/acento. `bruto` de cada linha = todas as células originais
 * concatenadas — auditoria e revisão de item vermelho nunca perdem o dado de origem.
 */
export function parsePlanilhaBuffer(buffer: Buffer): Array<{ bruto: string; fields: ParsedItemFields }> {
  // Import local (não no topo): `xlsx` só é tocado por este caminho — mesma
  // preocupação de bundle do import dinâmico do frontend, adaptada ao backend
  // (evita custo de parse do módulo em processos que nunca importam planilha).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  if (!matrix.length) return [];

  const tokensByCol = PLANILHA_COLUNAS.map((c) => new Set(c.aliases.map(tokenizeHeader)));
  const known = new Set<string>();
  tokensByCol.forEach((set) => set.forEach((t) => known.add(t)));

  const head = matrix[0] || [];
  const headMatches = head.reduce<number>((n, cell) => n + (known.has(tokenizeHeader(cell)) ? 1 : 0), 0);
  const hasHeader = headMatches >= 2;

  const colIndex: number[] = PLANILHA_COLUNAS.map((_, i) => (hasHeader ? -1 : i));
  if (hasHeader) {
    head.forEach((cell, idx) => {
      const t = tokenizeHeader(cell);
      const col = tokensByCol.findIndex((set, ci) => colIndex[ci] === -1 && set.has(t));
      if (col >= 0) colIndex[col] = idx;
    });
  }

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const saida: Array<{ bruto: string; fields: ParsedItemFields }> = [];
  for (const cells of dataRows) {
    if (!cells || cells.every((c) => String(c ?? '').trim() === '')) continue;
    const cell = (key: string): string => {
      const ci = PLANILHA_COLUNAS.findIndex((c) => c.key === key);
      const idx = ci >= 0 ? colIndex[ci] : -1;
      return idx >= 0 ? String(cells[idx] ?? '').trim() : '';
    };
    const nome = cell('nome');
    const endereco = cell('endereco') || null;
    const bruto = cells.map((c) => String(c ?? '').trim()).filter(Boolean).join(' | ');
    const qtdRaw = cell('qtd');
    saida.push({
      bruto: bruto || '(linha vazia)',
      fields: {
        nome: nome || null,
        telefone: cell('telefone') || null,
        endereco,
        numero: cell('numero') || (endereco ? String(extrairNumeroPorta({ endereco }) ?? '') || null : null),
        bairro: cell('bairro') || null,
        cidade: cell('cidade') || null,
        uf: cell('uf') || null,
        cep: cell('cep') || null,
        diasSemana: parseDiasSemanaFlexivel(cell('diaTexto')),
        produtoTexto: cell('produtoTexto') || null,
        qtd: qtdRaw ? Math.trunc(parseNumeroPtBr(qtdRaw) ?? 1) || 1 : null,
      },
    });
  }
  return saida;
}
