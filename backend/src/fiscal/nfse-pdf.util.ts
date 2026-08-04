import PDFDocument from 'pdfkit';

// ===========================================================================
// FISCAL DO TENANT — DANFSe (representação em PDF da NFS-e) gerada SOB DEMANDA
// a partir do FiscalDocumento (nada de arquivo em disco; o XML autorizado mora
// no banco). Layout v2: documento fiscal sóbrio — moldura externa, blocos com
// borda fina, tabela de valores, chave de acesso em fonte mono e rodapé de
// autenticidade. Assinatura de renderNfsePdf e NfsePdfInput são CONTRATO com o
// controller: não mudam.
// ⚠️ Nota em ambiente 'restrita' SEMPRE estampa "SEM VALOR FISCAL".
// ⚠️ Página ÚNICA por desenho: todo texto longo é medido e truncado para caber;
//    nada de quebra de página no meio de uma caixa.
// ===========================================================================

export interface NfsePdfInput {
  ambiente: string | null; // 'restrita' | 'producao'
  status: string; // AUTORIZADA | CANCELADA | ...
  prestador: { razaoSocial: string | null; cnpj: string | null; municipio?: string | null };
  tomador: { nome: string | null; doc: string | null };
  descricao: string | null;
  valorCents: number;
  competencia: string;
  serie: string | null;
  numero: number | null;
  chaveAcesso: string | null;
  emitidaEm: Date | string | null;
}

type Doc = PDFKit.PDFDocument;

// --- Pele do documento (neutra; vermelho SÓ nos avisos) --------------------
const INK = '#111111';
const LINE = '#5A5A5A';
const HAIR = '#8C8C8C';
const BAND = '#ECECEC';
const MUTED = '#5F5F5F';
const ALERT = '#B00000';
const PAPER = '#FFFFFF';

// --- Geometria (A4 retrato, em pontos) ------------------------------------
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const X0 = MARGIN;
const X1 = PAGE_W - MARGIN;
const CONTENT_W = X1 - X0;
const FOOTER_RESERVE = 40; // espaço do rodapé abaixo da moldura

const EM_DASH = '—';

// ---------------------------------------------------------------------------
// Formatação (determinística — sem depender de ICU completo no runtime)
// ---------------------------------------------------------------------------

function limpar(txt: string | null | undefined): string {
  return String(txt ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ');
}

function soDigitos(v: string | null): string {
  return String(v || '').replace(/\D/g, '');
}

function fmtDoc(doc: string | null): string {
  const d = soDigitos(doc);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return limpar(doc) || EM_DASH;
}

function rotuloDoc(doc: string | null): string {
  const d = soDigitos(doc);
  if (d.length === 14) return 'CNPJ';
  if (d.length === 11) return 'CPF';
  return 'CPF / CNPJ';
}

function fmtReais(cents: number): string {
  const n = Number(cents);
  const seguro = Number.isFinite(n) ? Math.trunc(n) : 0;
  const negativo = seguro < 0;
  const abs = Math.abs(seguro);
  const inteiro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = String(abs % 100).padStart(2, '0');
  return `${negativo ? '-' : ''}R$ ${inteiro},${centavos}`;
}

function fmtCompetencia(competencia: string): string {
  const c = limpar(competencia);
  const m = /^(\d{4})-(\d{2})$/.exec(c);
  return m ? `${m[2]}/${m[1]}` : c || EM_DASH;
}

function fmtDataHora(valor: Date | string | null): string {
  if (!valor) return EM_DASH;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  try {
    return limpar(d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })).trim();
  } catch {
    return d.toISOString().replace('T', ' ').slice(0, 19);
  }
}

function rotuloAmbiente(ambiente: string | null): string {
  const a = String(ambiente || '').trim().toLowerCase();
  if (a === 'producao') return 'PRODUÇÃO';
  if (a === 'restrita' || a === '') return 'PRODUÇÃO RESTRITA (HOMOLOGAÇÃO)';
  return limpar(ambiente).toUpperCase();
}

// ---------------------------------------------------------------------------
// Primitivas de desenho
// ---------------------------------------------------------------------------

function caixa(doc: Doc, x: number, y: number, w: number, h: number, fill?: string): void {
  doc.save().lineWidth(0.6).strokeColor(LINE);
  if (fill) doc.rect(x, y, w, h).fillAndStroke(fill, LINE);
  else doc.rect(x, y, w, h).stroke();
  doc.restore();
}

function divisorVertical(doc: Doc, x: number, y: number, h: number): void {
  doc.save().lineWidth(0.6).strokeColor(LINE).moveTo(x, y).lineTo(x, y + h).stroke().restore();
}

/** Corta uma linha única para caber na largura, com reticências. */
function cabeNaLinha(doc: Doc, texto: string, largura: number): string {
  const t = limpar(texto).replace(/\n+/g, ' ').trim() || EM_DASH;
  if (doc.widthOfString(t) <= largura) return t;
  let s = t;
  while (s.length > 1 && doc.widthOfString(`${s}…`) > largura) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Corta um bloco multi-linha para caber na altura disponível. */
function cabeNoBloco(doc: Doc, texto: string, largura: number, alturaMax: number): string {
  const t = limpar(texto).trim();
  if (!t) return EM_DASH;
  if (doc.heightOfString(t, { width: largura }) <= alturaMax) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (doc.heightOfString(`${t.slice(0, meio)}…`, { width: largura }) <= alturaMax) lo = meio;
    else hi = meio - 1;
  }
  return `${t.slice(0, lo).trimEnd()}…`;
}

/** Faixa de título de seção (cinza claro, caixa alta). */
function faixaSecao(doc: Doc, y: number, titulo: string): number {
  const h = 15;
  caixa(doc, X0, y, CONTENT_W, h, BAND);
  doc.save().fillColor(INK).font('Helvetica-Bold').fontSize(7.5);
  doc.text(titulo.toUpperCase(), X0 + 6, y + 4.4, { width: CONTENT_W - 12, characterSpacing: 0.7, lineBreak: false });
  doc.restore();
  return y + h;
}

/** Célula rotulada: rótulo miúdo em cima, valor embaixo, tudo dentro de borda. */
function celula(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  rotulo: string,
  valor: string,
  opts: { negrito?: boolean; tamanho?: number; mono?: boolean; alinha?: 'left' | 'right' | 'center' } = {},
): void {
  caixa(doc, x, y, w, h);
  doc.save();
  doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(rotulo.toUpperCase(), x + 5, y + 3.6, {
    width: w - 10,
    characterSpacing: 0.4,
    lineBreak: false,
  });
  const tamanho = opts.tamanho ?? 9;
  const fonte = opts.mono ? (opts.negrito ? 'Courier-Bold' : 'Courier') : opts.negrito ? 'Helvetica-Bold' : 'Helvetica';
  doc.fillColor(INK).font(fonte).fontSize(tamanho);
  // Encosta o valor na base da célula SEM invadir a linha do rótulo (y+11 é o piso do rótulo).
  const topoValor = Math.max(y + 11, y + h - tamanho * 1.18 - 3);
  doc.text(cabeNaLinha(doc, valor, w - 10), x + 5, topoValor, {
    width: w - 10,
    align: opts.alinha ?? 'left',
    lineBreak: false,
  });
  doc.restore();
}

/** Linha da tabela de valores: descrição à esquerda, número à direita. */
function linhaValor(doc: Doc, y: number, rotulo: string, valor: string, destaque = false): number {
  const h = destaque ? 20 : 17;
  caixa(doc, X0, y, CONTENT_W, h, destaque ? BAND : undefined);
  const colValor = CONTENT_W * 0.34;
  divisorVertical(doc, X1 - colValor, y, h);
  doc.save();
  doc
    .fillColor(INK)
    .font(destaque ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(destaque ? 9.5 : 8.5)
    .text(rotulo, X0 + 6, y + (destaque ? 6.2 : 5), { width: CONTENT_W - colValor - 12, lineBreak: false });
  doc
    .font(destaque ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(destaque ? 10.5 : 9)
    .text(valor, X1 - colValor + 6, y + (destaque ? 5.6 : 4.6), { width: colValor - 12, align: 'right', lineBreak: false });
  doc.restore();
  return y + h;
}

/** Banner de aviso (borda + fundo claro vermelho), em fluxo, sempre legível. */
function bannerAviso(doc: Doc, y: number, texto: string): number {
  const h = 20;
  doc.save().lineWidth(1).strokeColor(ALERT).rect(X0, y, CONTENT_W, h).fillAndStroke('#FBE9E9', ALERT).restore();
  doc.save().fillColor(ALERT).font('Helvetica-Bold').fontSize(10);
  doc.text(texto, X0 + 6, y + 5.6, { width: CONTENT_W - 12, align: 'center', characterSpacing: 0.6, lineBreak: false });
  doc.restore();
  return y + h;
}

/** Marca d'água diagonal (fica POR CIMA de tudo; opacidade baixa, não atrapalha leitura). */
function marcaDagua(doc: Doc, textos: string[]): void {
  if (!textos.length) return;
  doc.save();
  doc.rotate(-30, { origin: [PAGE_W / 2, PAGE_H / 2] });
  const alturaBloco = 46;
  const topo = PAGE_H / 2 - (textos.length * alturaBloco) / 2;
  doc.rect(-90, topo - 14, PAGE_W + 180, textos.length * alturaBloco + 28).fillOpacity(0.06).fill(ALERT);
  doc.fillOpacity(0.16).fillColor(ALERT).font('Helvetica-Bold');
  textos.forEach((t, i) => {
    doc.fontSize(t.length > 22 ? 24 : 30);
    doc.text(t, -90, topo + i * alturaBloco + 4, { width: PAGE_W + 180, align: 'center', characterSpacing: 1.6, lineBreak: false });
  });
  doc.restore();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderNfsePdf(input: NfsePdfInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const restrita = input.ambiente !== 'producao';
      const cancelada = String(input.status || '').toUpperCase() === 'CANCELADA';
      const numero = input.numero === null || input.numero === undefined ? EM_DASH : String(input.numero);
      const serie = limpar(input.serie).trim() || EM_DASH;

      doc.info.Title = `DANFSe NFS-e ${serie}/${numero}`;
      doc.info.Author = 'HBX — Sistema Nacional NFS-e';
      doc.info.Subject = `NFS-e ${String(input.status || '').toUpperCase()} — ambiente ${restrita ? 'restrita' : 'producao'}`;

      let y = MARGIN;
      const topo = y;

      // --- CABEÇALHO --------------------------------------------------------
      const cabH = 72;
      const colEsq = CONTENT_W * 0.58;
      caixa(doc, X0, y, CONTENT_W, cabH);
      divisorVertical(doc, X0 + colEsq, y, cabH);

      doc.save().fillColor(INK).font('Helvetica-Bold').fontSize(12.5);
      doc.text('NOTA FISCAL DE SERVIÇO ELETRÔNICA', X0 + 10, y + 10, { width: colEsq - 20, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5);
      doc.text('NFS-e — Padrão Nacional', X0 + 10, y + 27, { width: colEsq - 20, lineBreak: false });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
      doc.text('DANFSe — Documento Auxiliar da NFS-e', X0 + 10, y + 43, { width: colEsq - 20, lineBreak: false });
      doc.text('Sistema Nacional NFS-e — www.gov.br/nfse', X0 + 10, y + 54, { width: colEsq - 20, lineBreak: false });
      doc.restore();

      const dirX = X0 + colEsq;
      const dirW = CONTENT_W - colEsq;
      const linhaH = cabH / 3;
      celula(doc, dirX, y, dirW * 0.6, linhaH, 'Número da NFS-e', numero, { negrito: true, tamanho: 11 });
      celula(doc, dirX + dirW * 0.6, y, dirW * 0.4, linhaH, 'Série', serie, { negrito: true, tamanho: 11 });
      celula(doc, dirX, y + linhaH, dirW * 0.6, linhaH, 'Competência', fmtCompetencia(input.competencia), { negrito: true });
      celula(doc, dirX + dirW * 0.6, y + linhaH, dirW * 0.4, linhaH, 'Página', '1 / 1');
      celula(doc, dirX, y + linhaH * 2, dirW, linhaH, 'Data e hora da emissão', fmtDataHora(input.emitidaEm));
      y += cabH;

      // --- SITUAÇÃO / AMBIENTE ---------------------------------------------
      const sitH = 18;
      caixa(doc, X0, y, CONTENT_W, sitH, '#F7F7F7');
      divisorVertical(doc, X0 + CONTENT_W * 0.5, y, sitH);
      doc.save().font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
      doc.text('SITUAÇÃO:', X0 + 8, y + 5.6, { width: 60, lineBreak: false });
      doc.fillColor(cancelada ? ALERT : INK).fontSize(8.5);
      const larguraSit = CONTENT_W * 0.5 - 66;
      doc.text(cabeNaLinha(doc, String(input.status || EM_DASH).toUpperCase(), larguraSit), X0 + 58, y + 5.2, {
        width: larguraSit,
        lineBreak: false,
      });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
      doc.text('AMBIENTE:', X0 + CONTENT_W * 0.5 + 8, y + 5.6, { width: 62, lineBreak: false });
      doc.fillColor(restrita ? ALERT : INK).fontSize(8.5);
      const larguraAmb = CONTENT_W * 0.5 - 70;
      doc.text(cabeNaLinha(doc, rotuloAmbiente(input.ambiente), larguraAmb), X0 + CONTENT_W * 0.5 + 62, y + 5.2, {
        width: larguraAmb,
        lineBreak: false,
      });
      doc.restore();
      y += sitH;

      // --- AVISOS EM FLUXO --------------------------------------------------
      if (restrita) {
        y += 4;
        y = bannerAviso(doc, y, 'AMBIENTE DE TESTE — SEM VALOR FISCAL');
      }
      if (cancelada) {
        y += 4;
        y = bannerAviso(doc, y, 'NOTA CANCELADA');
      }
      if (restrita || cancelada) y += 4;

      // --- PRESTADOR --------------------------------------------------------
      y = faixaSecao(doc, y, 'Prestador de serviços');
      celula(doc, X0, y, CONTENT_W, 26, 'Razão social', input.prestador?.razaoSocial || EM_DASH, { negrito: true });
      y += 26;
      celula(doc, X0, y, CONTENT_W * 0.45, 26, 'CNPJ', fmtDoc(input.prestador?.cnpj ?? null));
      celula(doc, X0 + CONTENT_W * 0.45, y, CONTENT_W * 0.55, 26, 'Município do prestador', input.prestador?.municipio || EM_DASH);
      y += 26;

      // --- TOMADOR ----------------------------------------------------------
      y += 6;
      y = faixaSecao(doc, y, 'Tomador de serviços');
      celula(doc, X0, y, CONTENT_W, 26, 'Nome / Razão social', input.tomador?.nome || EM_DASH, { negrito: true });
      y += 26;
      celula(doc, X0, y, CONTENT_W * 0.45, 26, rotuloDoc(input.tomador?.doc ?? null), fmtDoc(input.tomador?.doc ?? null));
      celula(doc, X0 + CONTENT_W * 0.45, y, CONTENT_W * 0.55, 26, 'Competência do serviço', fmtCompetencia(input.competencia));
      y += 26;

      // --- DISCRIMINAÇÃO DOS SERVIÇOS --------------------------------------
      y += 6;
      y = faixaSecao(doc, y, 'Discriminação dos serviços');
      // Reserva o que vem depois para nunca estourar a página (documento de 1 folha).
      const reservaAbaixo = 6 + 15 + 17 + 20 + 6 + 15 + 30 + FOOTER_RESERVE;
      const alturaMaxTexto = Math.max(34, PAGE_H - MARGIN - reservaAbaixo - y - 12);
      doc.font('Helvetica').fontSize(8.5);
      const descricao = cabeNoBloco(doc, input.descricao || EM_DASH, CONTENT_W - 16, alturaMaxTexto);
      const alturaTexto = Math.max(46, doc.heightOfString(descricao, { width: CONTENT_W - 16 }) + 12);
      caixa(doc, X0, y, CONTENT_W, alturaTexto);
      doc.save().fillColor(INK).font('Helvetica').fontSize(8.5);
      doc.text(descricao, X0 + 8, y + 6, { width: CONTENT_W - 16, align: 'left' });
      doc.restore();
      y += alturaTexto;

      // --- VALORES ----------------------------------------------------------
      y += 6;
      y = faixaSecao(doc, y, 'Valores');
      y = linhaValor(doc, y, 'Valor dos serviços', fmtReais(input.valorCents));
      y = linhaValor(doc, y, 'VALOR TOTAL DA NFS-e', fmtReais(input.valorCents), true);

      // --- CHAVE DE ACESSO --------------------------------------------------
      y += 6;
      y = faixaSecao(doc, y, 'Chave de acesso da NFS-e');
      const chaveH = 30;
      caixa(doc, X0, y, CONTENT_W, chaveH, '#FAFAFA');
      doc.save();
      const chave = limpar(input.chaveAcesso).replace(/\s+/g, '');
      if (chave) {
        doc.fillColor(INK).font('Courier-Bold').fontSize(9);
        doc.text(cabeNaLinha(doc, chave, CONTENT_W - 16), X0 + 8, y + 7, {
          width: CONTENT_W - 16,
          align: 'center',
          characterSpacing: 0.5,
          lineBreak: false,
        });
        doc.fillColor(MUTED).font('Helvetica').fontSize(6.5);
        doc.text('Chave de 50 posições — use para consultar a NFS-e no portal nacional.', X0 + 8, y + 20, {
          width: CONTENT_W - 16,
          align: 'center',
          lineBreak: false,
        });
      } else {
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(8.5);
        doc.text('Documento sem chave de acesso (NFS-e não autorizada).', X0 + 8, y + 11, {
          width: CONTENT_W - 16,
          align: 'center',
          lineBreak: false,
        });
      }
      doc.restore();
      y += chaveH;

      // --- MOLDURA EXTERNA (fecha o documento) ------------------------------
      doc.save().lineWidth(1.2).strokeColor(INK).rect(X0, topo, CONTENT_W, y - topo).stroke().restore();

      // --- RODAPÉ -----------------------------------------------------------
      doc.save().fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5);
      doc.text('Consulte a autenticidade em www.gov.br/nfse', X0, y + 8, { width: CONTENT_W, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor(HAIR);
      doc.text(
        'A DANFSe é a representação gráfica da NFS-e e não substitui o documento fiscal eletrônico.',
        X0,
        y + 19,
        { width: CONTENT_W, align: 'center', lineBreak: false },
      );
      if (restrita) {
        doc.fillColor(ALERT).font('Helvetica-Bold').fontSize(6.5);
        doc.text('Emitida em ambiente de teste (produção restrita) — SEM VALOR FISCAL.', X0, y + 28, {
          width: CONTENT_W,
          align: 'center',
          lineBreak: false,
        });
      }
      doc.restore();

      // --- MARCA D'ÁGUA (por cima de tudo) ----------------------------------
      const avisos: string[] = [];
      if (cancelada) avisos.push('NOTA CANCELADA');
      if (restrita) avisos.push('SEM VALOR FISCAL');
      marcaDagua(doc, avisos);

      doc.fillColor(PAPER); // higiene: não deixa cor pendurada no estado final
      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
