import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { gunzipSync } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyMailerService } from '../mail/company-mailer.service';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { FiscalAutomationLogService } from '../contabil/fiscal-automation-log.service';
import { renderNfsePdf } from './nfse-pdf.util';

// ===========================================================================
// FISCAL DO TENANT F1b — envio do PDF+XML da nota AUTORIZADA ao tomador.
// Envio é TRANSACIONAL (consequência do clique de emissão do dono do tenant):
// NÃO é disparo frio e NÃO passa pela trava de horário de prospecção.
// Canais: e-mail (transporte POR EMPRESA — CompanyMailer; ninguém pega carona
// no SMTP do Master) e WhatsApp (chip da empresa via WebwhatsBridge).
// Falha de envio NUNCA muda o status fiscal da nota — vira trilha no documento
// (envioEmailErro/envioWhatsErro) + botão de reenvio na tela.
// ===========================================================================

export interface EnvioResultado {
  email: { tentado: boolean; ok: boolean; erro: string | null };
  whats: { tentado: boolean; ok: boolean; erro: string | null };
}

@Injectable()
export class FiscalEnvioService {
  private readonly logger = new Logger(FiscalEnvioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: CompanyMailerService,
    private readonly webwhats: WebwhatsBridgeService,
    private readonly trilha: FiscalAutomationLogService,
  ) {}

  /**
   * Disparo automático pós-AUTORIZADA (chamado fire-and-forget pelo emissor):
   * respeita o opt-in do perfil por canal; sem opt-in nenhum, não faz nada.
   */
  async enviarAutomatico(companyId: number, documentoId: string, userId: number | null): Promise<EnvioResultado | null> {
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    if (!perfil || (!perfil.emailAutoEnvio && !perfil.whatsAutoEnvio)) return null;
    return this.enviar(companyId, documentoId, {
      email: Boolean(perfil.emailAutoEnvio),
      whats: Boolean(perfil.whatsAutoEnvio),
    }, userId, 'auto');
  }

  /**
   * Envio (auto ou reenvio manual pela tela). Cada canal falha SOZINHO — um
   * e-mail recusado não impede o WhatsApp, e vice-versa.
   */
  async enviar(
    companyId: number,
    documentoId: string,
    canais: { email?: boolean; whats?: boolean },
    userId: number | null,
    origem: 'auto' | 'manual',
  ): Promise<EnvioResultado> {
    const doc = await (this.prisma as any).fiscalDocumento.findFirst({ where: { id: documentoId, companyId } });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    if (doc.status !== 'AUTORIZADA') throw new BadRequestException('Só nota AUTORIZADA pode ser enviada ao tomador.');
    // Canal não informado = decide pelos dados do documento (tem e-mail? tem fone?).
    if (canais.email === undefined && canais.whats === undefined) {
      canais = { email: Boolean(String(doc.tomadorEmail || '').trim()), whats: Boolean(String(doc.tomadorFone || '').trim()) };
    }
    if (!canais.email && !canais.whats) {
      throw new BadRequestException('Documento sem e-mail e sem WhatsApp do tomador — preencha um contato para enviar.');
    }

    const resultado: EnvioResultado = {
      email: { tentado: false, ok: false, erro: null },
      whats: { tentado: false, ok: false, erro: null },
    };

    // Materiais uma vez só (mesmo PDF/XML pros dois canais).
    const pdf = await this.renderPdf(doc);
    const xml = doc.xmlGzB64 ? gunzipSync(Buffer.from(String(doc.xmlGzB64), 'base64')).toString('utf8') : null;
    const rotulo = `nfse-${doc.serie || 's'}-${doc.numero || doc.id}`;

    if (canais.email) {
      resultado.email.tentado = true;
      const destino = String(doc.tomadorEmail || '').trim();
      if (!destino) {
        resultado.email.erro = 'Documento sem e-mail do tomador.';
      } else {
        try {
          const sent = await this.mailer.sendForCompany(companyId, {
            to: destino,
            subject: `Nota fiscal de serviço nº ${doc.numero ?? ''} — ${doc.prestadorRazaoSocial || 'sua nota chegou'}`.trim(),
            text:
              `Olá, ${doc.tomadorNome || 'cliente'}!\n\n` +
              `Segue em anexo a nota fiscal de serviço nº ${doc.numero ?? ''} (PDF${xml ? ' + XML' : ''}).\n` +
              `Valor: R$ ${(Number(doc.valorCents || 0) / 100).toFixed(2)} — competência ${doc.competencia}.\n\n` +
              `${doc.prestadorRazaoSocial || ''}`.trim(),
            attachments: [
              { filename: `${rotulo}.pdf`, content: pdf, contentType: 'application/pdf' },
              ...(xml ? [{ filename: `${rotulo}.xml`, content: xml, contentType: 'application/xml' }] : []),
            ],
            // Resultado SMTP incerto não pode virar anexo fiscal duplicado na caixa do tomador.
            disableTransportFallback: true,
          });
          resultado.email.ok = Boolean(sent.ok);
          resultado.email.erro = sent.ok ? null : String(sent.errorMessage || sent.errorCode || 'Falha no envio do e-mail.').slice(0, 300);
        } catch (err) {
          resultado.email.erro = String((err as Error)?.message || err).slice(0, 300);
        }
      }
      await (this.prisma as any).fiscalDocumento.update({
        where: { id: doc.id },
        data: resultado.email.ok
          ? { envioEmailEm: new Date(), envioEmailErro: null }
          : { envioEmailErro: resultado.email.erro },
      });
    }

    if (canais.whats) {
      resultado.whats.tentado = true;
      const fone = String(doc.tomadorFone || '').replace(/\D/g, '');
      if (fone.length < 10) {
        resultado.whats.erro = fone ? 'WhatsApp do tomador incompleto (DDD + número).' : 'Documento sem WhatsApp do tomador.';
      } else {
        try {
          await this.webwhats.sendMedia(companyId, {
            to: fone,
            mediaType: 'document',
            media: pdf.toString('base64'),
            fileName: `${rotulo}.pdf`,
            mimeType: 'application/pdf',
            caption: `Nota fiscal de serviço nº ${doc.numero ?? ''} — ${doc.prestadorRazaoSocial || ''}`.trim(),
          });
          resultado.whats.ok = true;
        } catch (err) {
          resultado.whats.erro = String((err as Error)?.message || err).slice(0, 300);
        }
      }
      await (this.prisma as any).fiscalDocumento.update({
        where: { id: doc.id },
        data: resultado.whats.ok
          ? { envioWhatsEm: new Date(), envioWhatsErro: null }
          : { envioWhatsErro: resultado.whats.erro },
      });
    }

    const canaisStr = [canais.email ? 'email' : null, canais.whats ? 'whats' : null].filter(Boolean).join(',');
    const sucesso = (!canais.email || resultado.email.ok) && (!canais.whats || resultado.whats.ok);
    await this.trilha.registrar({
      sistema: 'NFSE',
      operacao: 'ENVIAR_NFSE_TENANT',
      requestResumo: `company=${companyId} doc=${doc.id} canais=${canaisStr} origem=${origem}` +
        (resultado.email.erro ? ` emailErro=${resultado.email.erro.slice(0, 80)}` : '') +
        (resultado.whats.erro ? ` whatsErro=${resultado.whats.erro.slice(0, 80)}` : ''),
      sucesso,
      aprovadoPor: userId != null ? String(userId) : null,
    });
    if (!sucesso) {
      this.logger.warn(`[fiscal] envio ${origem} incompleto (company ${companyId}, doc ${doc.id}): email=${resultado.email.erro || 'ok'} whats=${resultado.whats.erro || 'ok'}`);
    }
    return resultado;
  }

  /** DANFSe do SNAPSHOT do documento (A2) — não usa o perfil de hoje. */
  private async renderPdf(doc: any): Promise<Buffer> {
    return renderNfsePdf({
      ambiente: doc.ambiente,
      status: doc.status,
      prestador: {
        razaoSocial: doc.prestadorRazaoSocial || null,
        cnpj: doc.prestadorCnpj || null,
        municipio: doc.prestadorMunicipio || null,
      },
      tomador: { nome: doc.tomadorNome, doc: doc.tomadorDoc },
      descricao: doc.descricao,
      valorCents: doc.valorCents,
      competencia: doc.competencia,
      serie: doc.serie,
      numero: doc.numero,
      chaveAcesso: doc.chaveAcesso,
      emitidaEm: doc.emitidaEm,
    });
  }
}
