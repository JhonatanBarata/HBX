import PDFDocument from 'pdfkit';

// ===========================================================================
// FISCAL DO TENANT F2a — COMPROVANTE DE ENTREGA (SEM VALOR FISCAL).
// O papel que o cliente final recebe no WhatsApp quando a entrega é confirmada
// na rota. NÃO é documento fiscal — o rodapé grita isso SEMPRE (obrigatório por
// decisão do plano); no modo 'fechamento' ele ainda explica que a nota fiscal
// vem consolidada no fechamento mensal.
// Valores em REAIS (float) — o domínio da logística (Entrega.valor/valorUnit) é
// reais, não cents. `total`/`valorUnit` null = financeiro do tenant OFF (M4):
// dinheiro NÃO aparece em lugar nenhum, o papel vira só o "o que/quanto/quando".
// ===========================================================================

export interface ComprovanteEntregaItem {
  nome: string;
  quantidade: number;
  valorUnit?: number | null; // reais; null = não imprime
}

export interface ComprovanteEntregaInput {
  empresa: { nome: string | null; cnpj: string | null; municipio?: string | null };
  cliente: { nome: string | null };
  entregueEm: Date | string | null;
  itens: ComprovanteEntregaItem[];
  total?: number | null; // reais; null = sem dinheiro no papel (M4)
  modoEmissao: 'fechamento' | 'entrega';
  entregaId?: string | null; // referência curta impressa no rodapé
}

const INK = '#111111';
const LINE = '#5A5A5A';
const MUTED = '#5F5F5F';
const BAND = '#ECECEC';

const PAGE_W = 595.28; // A4 retrato
const MARGIN = 40;
const X0 = MARGIN;
const X1 = PAGE_W - MARGIN;
const CONTENT_W = X1 - X0;

function limpar(txt: string | null | undefined): string {
  return String(txt ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .trim();
}

function brl(v: number): string {
  const n = Number(v) || 0;
  const [int, dec] = n.toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

function fmtCnpj(v: string | null | undefined): string {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14) return limpar(v) || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtDataHoraBr(v: Date | string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  // Fuso do BRASIL de propósito (teste verde em UTC não vale): o papel é do
  // cliente final, a hora tem que ser a da porta dele.
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(d);
}

export function renderComprovanteEntregaPdf(input: ComprovanteEntregaInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const comValores = input.total !== null && input.total !== undefined;
      doc.info.Title = 'Comprovante de entrega — sem valor fiscal';
      doc.info.Author = limpar(input.empresa.nome) || 'HBX';

      let y = MARGIN;

      // Cabeçalho: a empresa que entregou.
      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK);
      doc.text(limpar(input.empresa.nome) || '—', X0, y, { width: CONTENT_W });
      y = doc.y + 2;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      const linhaEmpresa = [fmtCnpj(input.empresa.cnpj), limpar(input.empresa.municipio)]
        .filter(Boolean)
        .join(' · ');
      if (linhaEmpresa) {
        doc.text(linhaEmpresa, X0, y, { width: CONTENT_W });
        y = doc.y;
      }
      y += 6;
      doc.moveTo(X0, y).lineTo(X1, y).lineWidth(1).strokeColor(LINE).stroke();
      y += 10;

      // Título do papel.
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
      doc.text('COMPROVANTE DE ENTREGA', X0, y, { width: CONTENT_W });
      y = doc.y + 8;

      // Cliente + data/hora.
      doc.font('Helvetica').fontSize(10).fillColor(INK);
      doc.text(`Cliente: ${limpar(input.cliente.nome) || '—'}`, X0, y, { width: CONTENT_W });
      y = doc.y + 2;
      doc.text(`Entregue em: ${fmtDataHoraBr(input.entregueEm)}`, X0, y, { width: CONTENT_W });
      y = doc.y + 10;

      // Itens — faixa de cabeçalho + linhas. Sem financeiro, a coluna de valor some.
      const colQtd = 60;
      const colValor = comValores ? 90 : 0;
      const colSub = comValores ? 90 : 0;
      const colNome = CONTENT_W - colQtd - colValor - colSub;

      doc.rect(X0, y, CONTENT_W, 18).fillColor(BAND).fill();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
      doc.text('Produto', X0 + 6, y + 5, { width: colNome - 12 });
      doc.text('Qtd', X0 + colNome, y + 5, { width: colQtd - 6, align: 'right' });
      if (comValores) {
        doc.text('Valor unit.', X0 + colNome + colQtd, y + 5, { width: colValor - 6, align: 'right' });
        doc.text('Subtotal', X0 + colNome + colQtd + colValor, y + 5, { width: colSub - 6, align: 'right' });
      }
      y += 18;

      doc.font('Helvetica').fontSize(9).fillColor(INK);
      for (const item of input.itens || []) {
        const nome = limpar(item.nome) || '—';
        const qtd = Number(item.quantidade) || 0;
        const alturaNome = doc.heightOfString(nome, { width: colNome - 12 });
        const altura = Math.max(16, alturaNome + 6);
        doc.text(nome, X0 + 6, y + 3, { width: colNome - 12 });
        doc.text(String(qtd), X0 + colNome, y + 3, { width: colQtd - 6, align: 'right' });
        if (comValores && item.valorUnit !== null && item.valorUnit !== undefined) {
          doc.text(brl(item.valorUnit), X0 + colNome + colQtd, y + 3, { width: colValor - 6, align: 'right' });
          doc.text(brl(qtd * (Number(item.valorUnit) || 0)), X0 + colNome + colQtd + colValor, y + 3, {
            width: colSub - 6,
            align: 'right',
          });
        }
        y += altura;
        doc.moveTo(X0, y).lineTo(X1, y).lineWidth(0.5).strokeColor(BAND).stroke();
      }

      if (comValores) {
        y += 8;
        doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
        doc.text(`Total: ${brl(Number(input.total) || 0)}`, X0, y, { width: CONTENT_W, align: 'right' });
        y = doc.y;
      }

      // Rodapé OBRIGATÓRIO — a alma do papel: isto NÃO é nota fiscal.
      y += 18;
      doc.moveTo(X0, y).lineTo(X1, y).lineWidth(1).strokeColor(LINE).stroke();
      y += 8;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
      doc.text('SEM VALOR FISCAL', X0, y, { width: CONTENT_W });
      y = doc.y + 2;
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
      const explicacao =
        input.modoEmissao === 'fechamento'
          ? 'Este comprovante não substitui a nota fiscal. A nota fiscal correspondente é emitida no fechamento mensal.'
          : 'Este comprovante não substitui a nota fiscal.';
      doc.text(explicacao, X0, y, { width: CONTENT_W });
      y = doc.y + 4;
      if (input.entregaId) {
        doc.fontSize(7.5).text(`Ref. entrega ${limpar(input.entregaId)}`, X0, y, { width: CONTENT_W });
      }

      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
