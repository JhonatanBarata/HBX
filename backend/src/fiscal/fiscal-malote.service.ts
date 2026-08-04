import { BadRequestException, Injectable } from '@nestjs/common';
import { gunzipSync } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';
import { montarZipStore, type ZipEntryInput } from './zip-store.util';

// ===========================================================================
// FISCAL — MALOTE DO CONTADOR (decisão 10 do plano): a pasta fiscal permanente
// da empresa. Por competência, um .zip com:
//   vendas.csv  — notas de serviço emitidas (nº, tomador, valor, status, chave)
//   vendas/*.xml — os XMLs autorizados
//   compras.csv — entradas de estoque por XML (data, fornecedor, chave, itens)
//   compras/*.xml — os XMLs das NF-e de compra (guardados no upload)
// CSV separado por ';' com BOM — abre certo no Excel BR do contador.
// ===========================================================================

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

@Injectable()
export class FiscalMaloteService {
  constructor(private readonly prisma: PrismaService) {}

  async gerarMalote(companyId: number, competencia: string): Promise<{ filename: string; zip: Buffer }> {
    if (!/^\d{4}-\d{2}$/.test(String(competencia || ''))) {
      throw new BadRequestException("Competência no formato 'YYYY-MM'.");
    }

    const [vendas, compras] = await Promise.all([
      (this.prisma as any).fiscalDocumento.findMany({
        where: { companyId, tipo: 'NFSE', competencia, status: { in: ['AUTORIZADA', 'CANCELADA'] } },
        orderBy: { numero: 'asc' },
      }),
      (this.prisma as any).fiscalCompraXml.findMany({
        where: { companyId, competencia },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const entries: ZipEntryInput[] = [];

    // ── VENDAS ────────────────────────────────────────────────────────────────
    const vendasCsv = ['﻿serie;numero;status;tomador_documento;tomador_nome;valor;competencia;chave_acesso;emitida_em;cancelada_em;motivo_cancelamento'];
    for (const d of vendas) {
      vendasCsv.push([
        csvCell(d.serie), csvCell(d.numero), csvCell(d.status), csvCell(d.tomadorDoc), csvCell(d.tomadorNome),
        csvCell(((Number(d.valorCents) || 0) / 100).toFixed(2).replace('.', ',')),
        csvCell(d.competencia), csvCell(d.chaveAcesso),
        csvCell(d.emitidaEm ? new Date(d.emitidaEm).toISOString() : ''),
        csvCell(d.canceladaEm ? new Date(d.canceladaEm).toISOString() : ''),
        csvCell(d.motivoCancelamento),
      ].join(';'));
      if (d.xmlGzB64) {
        try {
          entries.push({
            nome: `vendas/nfse-${d.serie || 's'}-${d.numero ?? d.id}.xml`,
            conteudo: gunzipSync(Buffer.from(String(d.xmlGzB64), 'base64')),
          });
        } catch { /* XML corrompido não derruba o malote — a linha do CSV fica */ }
      }
    }
    entries.push({ nome: 'vendas.csv', conteudo: vendasCsv.join('\r\n') });

    // ── COMPRAS ───────────────────────────────────────────────────────────────
    const comprasCsv = ['﻿data_upload;fornecedor;fornecedor_cnpj;chave_acesso'];
    for (const c of compras) {
      comprasCsv.push([
        csvCell(new Date(c.createdAt).toISOString()), csvCell(c.emitenteNome), csvCell(c.emitenteCnpj), csvCell(c.chaveAcesso),
      ].join(';'));
      try {
        entries.push({
          nome: `compras/nfe-${c.chaveAcesso}.xml`,
          conteudo: gunzipSync(Buffer.from(String(c.xmlGzB64), 'base64')),
        });
      } catch { /* idem */ }
    }
    entries.push({ nome: 'compras.csv', conteudo: comprasCsv.join('\r\n') });

    return { filename: `malote-fiscal-${competencia}.zip`, zip: montarZipStore(entries) };
  }
}
