import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { getInboxPrivateMediaDir, INBOX_MEDIA_PUBLIC_PREFIX } from '../uploads/inbox-media.util';
import { renderComprovanteEntregaPdf, type ComprovanteEntregaItem } from './comprovante-entrega.util';

// ===========================================================================
// FISCAL DO TENANT F2a — o comprovante SEM VALOR FISCAL que pega carona no
// aviso de entrega do WhatsApp (logística). Este serviço NÃO envia nada: ele
// só gera o PDF e devolve o anexo pro caminho BLINDADO do aviso
// (queueOutboundForCompany — disjuntor, outbox, 1-número=1-conexão).
// Gate por empresa: FiscalTenantProfile.comprovanteEntrega (default OFF — é
// mensagem LIVE pra cliente final; o tenant liga na tela fiscal).
// Best-effort COM VOZ: qualquer falha vira log + null — o aviso de TEXTO da
// entrega segue sozinho, nunca é derrubado pelo papel.
// ===========================================================================

export interface ComprovanteEntregaAnexo {
  kind: 'document';
  url: string; // /uploads/inbox/<arquivo> — o bridge resolve do disco privado
  fileName: string;
  mimeType: 'application/pdf';
}

@Injectable()
export class FiscalComprovanteEntregaService {
  private readonly logger = new Logger(FiscalComprovanteEntregaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** null = sem comprovante (gate OFF, dado faltando ou falha) — texto segue sozinho. */
  async anexoParaEntrega(companyId: number, entregaId: string): Promise<ComprovanteEntregaAnexo | null> {
    try {
      const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
      if (!perfil?.comprovanteEntrega) return null;

      const entrega = await (this.prisma as any).entrega.findFirst({
        where: { id: entregaId, companyId },
        select: {
          id: true,
          quantidade: true,
          valor: true,
          deliveredAt: true,
          customerProfileId: true,
          product: { select: { name: true } },
          itens: {
            select: {
              qtdPrevista: true,
              qtdEntregue: true,
              valorUnit: true,
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!entrega) return null;

      // 24/08/2026 — o gate "financeiro OFF esconde valor" MORREU: o módulo é
      // sempre ligado e o comprovante sempre imprime os valores (0,00 é valor
      // legítimo).
      const cliente = await (this.prisma as any).customerProfile.findFirst({
        where: { id: entrega.customerProfileId, companyId },
        select: { name: true },
      });

      // Itens: EntregaItem (entregue, fallback previsto) — legado escalar vira 1
      // item sintético (mesmo fallback do listRota/histórico).
      const itens: ComprovanteEntregaItem[] = entrega.itens?.length
        ? entrega.itens.map((i: any) => ({
            nome: String(i.product?.name || 'Produto'),
            quantidade: Number(i.qtdEntregue ?? i.qtdPrevista) || 0,
            valorUnit: i.valorUnit != null ? Number(i.valorUnit) : null,
          }))
        : [
            {
              nome: String(entrega.product?.name || 'Produto'),
              quantidade: Number(entrega.quantidade) || 0,
              valorUnit: null, // legado sem valorUnit — o total ainda cobre o dinheiro
            },
          ];

      // Cabeçalho: razão social do perfil fiscal; sem perfil preenchido, o nome
      // da conta da empresa segura o papel.
      let nomeEmpresa = String(perfil.razaoSocial || '').trim();
      if (!nomeEmpresa) {
        try {
          const company = await (this.prisma as any).company.findUnique({ where: { id: companyId }, select: { name: true } });
          nomeEmpresa = String(company?.name || '').trim();
        } catch {
          /* sem nome — o render imprime travessão */
        }
      }

      const pdf = await renderComprovanteEntregaPdf({
        empresa: { nome: nomeEmpresa || null, cnpj: perfil.cnpj || null },
        cliente: { nome: cliente?.name || null },
        entregueEm: entrega.deliveredAt || new Date(),
        itens,
        total: Number(entrega.valor) || 0,
        modoEmissao: perfil.modoEmissaoProduto === 'entrega' ? 'entrega' : 'fechamento',
        entregaId: entrega.id,
      });

      // Mesmo dir privado da mídia de conversa (o bridge lê daqui e o painel da
      // conversa serve assinado) — é mídia de conversa de fato.
      const dir = getInboxPrivateMediaDir();
      mkdirSync(dir, { recursive: true });
      const arquivo = `fiscal-comprovante-${String(entrega.id).replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
      writeFileSync(join(dir, arquivo), pdf);

      return {
        kind: 'document',
        url: `${INBOX_MEDIA_PUBLIC_PREFIX}${arquivo}`,
        fileName: 'comprovante-entrega.pdf',
        mimeType: 'application/pdf',
      };
    } catch (e: any) {
      this.logger.warn(
        `[fiscal] comprovante de entrega falhou (company=${companyId} entrega=${entregaId}): ${String(e?.message || e).slice(0, 160)}`,
      );
      return null;
    }
  }
}
