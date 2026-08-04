import PDFDocument from 'pdfkit';

// ===========================================================================
// FISCAL DO TENANT — DANFSe (representação em PDF da NFS-e) gerada SOB DEMANDA
// a partir do FiscalDocumento (nada de arquivo em disco; o XML autorizado mora
// no banco). Layout v1 sóbrio — worker de polish pode evoluir SEM mudar a
// assinatura de renderNfsePdf.
// ⚠️ Nota em ambiente 'restrita' SEMPRE estampa "SEM VALOR FISCAL".
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

function fmtDoc(doc: string | null): string {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '—';
}

function fmtReais(cents: number): string {
  return (Math.trunc(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function renderNfsePdf(input: NfsePdfInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const restrita = input.ambiente !== 'producao';
    const cancelada = input.status === 'CANCELADA';

    doc.fontSize(16).font('Helvetica-Bold').text('NFS-e — Nota Fiscal de Serviço Eletrônica', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').text('Sistema Nacional NFS-e (gov.br/nfse)', { align: 'center' });

    if (restrita) {
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#B00000')
        .text('AMBIENTE DE TESTE (PRODUÇÃO RESTRITA) — SEM VALOR FISCAL', { align: 'center' });
      doc.fillColor('#000000');
    }
    if (cancelada) {
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#B00000').text('NOTA CANCELADA', { align: 'center' });
      doc.fillColor('#000000');
    }

    doc.moveDown(1);
    const linha = (label: string, valor: string) => {
      doc.fontSize(9).font('Helvetica-Bold').text(label, { continued: true }).font('Helvetica').text(` ${valor}`);
      doc.moveDown(0.2);
    };

    doc.fontSize(11).font('Helvetica-Bold').text('Prestador');
    doc.moveDown(0.3);
    linha('Razão social:', input.prestador.razaoSocial || '—');
    linha('CNPJ:', fmtDoc(input.prestador.cnpj));
    if (input.prestador.municipio) linha('Município:', input.prestador.municipio);

    doc.moveDown(0.6);
    doc.fontSize(11).font('Helvetica-Bold').text('Tomador');
    doc.moveDown(0.3);
    linha('Nome:', input.tomador.nome || '—');
    linha('Documento:', fmtDoc(input.tomador.doc));

    doc.moveDown(0.6);
    doc.fontSize(11).font('Helvetica-Bold').text('Serviço');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').text(input.descricao || '—');
    doc.moveDown(0.4);
    linha('Competência:', input.competencia);
    linha('Série/Número DPS:', `${input.serie || '—'} / ${input.numero ?? '—'}`);
    if (input.emitidaEm) {
      const d = new Date(input.emitidaEm);
      linha('Emitida em:', d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
    }

    doc.moveDown(0.8);
    doc.fontSize(13).font('Helvetica-Bold').text(`Valor do serviço: ${fmtReais(input.valorCents)}`);

    if (input.chaveAcesso) {
      doc.moveDown(1);
      doc.fontSize(8).font('Helvetica-Bold').text('Chave de acesso:');
      doc.fontSize(8).font('Helvetica').text(input.chaveAcesso);
      doc.moveDown(0.3);
      doc.fontSize(8).font('Helvetica').text('Consulte a autenticidade em www.gov.br/nfse');
    }

    doc.end();
  });
}
