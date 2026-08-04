import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalAutomationLogService } from '../contabil/fiscal-automation-log.service';

// ===========================================================================
// FISCAL — SEMÁFORO DE LIBERAÇÃO (auditoria 6b, item 6; resolve o B4).
// "Ativar emissão em produção" deixa de ser UPDATE manual no banco: a tela
// mostra o checklist DERIVADO DO ESTADO REAL ([LT] legal-tributário / [TEC]
// técnico / [OP] operacional), o botão só abre com LT+TEC completos, e a
// ativação REGISTRA usuário + data (trilha). Aprovação final é do CONTADOR do
// tenant — atestada pelo admin com carimbo de data ([LT]).
// [OP] NÃO bloqueia produção de NFS-e (bloqueia só baixa de estoque — produto).
// ===========================================================================

export interface ItemChecklist {
  grupo: 'LT' | 'TEC' | 'OP';
  chave: string;
  rotulo: string;
  ok: boolean;
  detalhe: string | null;
}

@Injectable()
export class FiscalLiberacaoService {
  private readonly logger = new Logger(FiscalLiberacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trilha: FiscalAutomationLogService,
  ) {}

  async checklist(companyId: number) {
    const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({ where: { companyId } });
    const municipio = perfil?.municipioIbge
      ? await (this.prisma as any).fiscalMunicipio.findUnique({ where: { ibge: perfil.municipioIbge } })
      : null;
    const [servicosAtivos, notaRestritaOk] = await Promise.all([
      (this.prisma as any).fiscalServicoCatalogo.count({ where: { companyId, ativo: true } }),
      (this.prisma as any).fiscalDocumento.findFirst({
        where: { companyId, tipo: 'NFSE', status: 'AUTORIZADA', ambiente: 'restrita' },
        select: { id: true, numero: true },
      }),
    ]);

    const certOk = Boolean(perfil?.certA1Encrypted) &&
      (!perfil?.certA1ExpiresAt || new Date(perfil.certA1ExpiresAt).getTime() > Date.now());
    const enderecoOk = Boolean(perfil?.endCep && perfil?.endLogradouro && perfil?.endNumero && perfil?.endBairro);

    const itens: ItemChecklist[] = [
      { grupo: 'LT', chave: 'dados', rotulo: 'CNPJ, razão social e município', ok: Boolean(perfil?.cnpj && perfil?.razaoSocial && perfil?.municipioIbge), detalhe: null },
      { grupo: 'LT', chave: 'catalogo', rotulo: 'Catálogo de serviços montado com o contador', ok: servicosAtivos > 0, detalhe: servicosAtivos > 0 ? `${servicosAtivos} serviço(s) ativo(s)` : 'Nenhum serviço ativo' },
      { grupo: 'LT', chave: 'contador', rotulo: 'Aprovação do contador do tenant', ok: Boolean(perfil?.contadorAprovou), detalhe: perfil?.contadorAprovouEm ? `Atestada em ${new Date(perfil.contadorAprovouEm).toLocaleDateString('pt-BR')}` : null },
      { grupo: 'TEC', chave: 'cert', rotulo: 'Certificado A1 válido no cofre', ok: certOk, detalhe: certOk ? null : 'Suba um A1 dentro da validade' },
      { grupo: 'TEC', chave: 'endereco', rotulo: 'Endereço completo do prestador', ok: enderecoOk, detalhe: enderecoOk ? null : 'CEP, logradouro, número e bairro' },
      { grupo: 'TEC', chave: 'municipio', rotulo: 'Município homologado pelo HBX', ok: municipio?.status === 'HOMOLOGADO', detalhe: municipio ? `${municipio.nome}/${municipio.uf}: ${municipio.status}` : 'Selecione o município' },
      { grupo: 'TEC', chave: 'nota-teste', rotulo: 'Uma nota AUTORIZADA no ambiente de teste', ok: Boolean(notaRestritaOk), detalhe: notaRestritaOk ? `Nota nº ${notaRestritaOk.numero}` : 'Emita uma nota em produção-restrita' },
      { grupo: 'OP', chave: 'estoque', rotulo: 'Estoque ligado (só para nota de PRODUTO)', ok: Boolean(perfil?.estoqueAtivo), detalhe: 'Não bloqueia a nota de serviço' },
    ];

    const bloqueantes = itens.filter((i) => i.grupo !== 'OP');
    const completos = bloqueantes.filter((i) => i.ok).length;
    const prontoParaProducao = completos === bloqueantes.length;

    return {
      ambiente: perfil?.ambiente || 'restrita',
      producaoAtivadaEm: perfil?.producaoAtivadaEm ? new Date(perfil.producaoAtivadaEm).toISOString() : null,
      producaoAtivadaPor: perfil?.producaoAtivadaPor || null,
      percentual: Math.round((completos / bloqueantes.length) * 100),
      prontoParaProducao,
      itens,
    };
  }

  /** Atestado da aprovação do contador (LT) — carimbo de quem/quando na trilha. */
  async atestarContador(companyId: number, userId: number | null, aprovado: boolean) {
    // B1: upsert — primeira visita da empresa à tela sem perfil não vira 500.
    await (this.prisma as any).fiscalTenantProfile.upsert({
      where: { companyId },
      create: { companyId, contadorAprovou: aprovado, contadorAprovouEm: aprovado ? new Date() : null },
      update: { contadorAprovou: aprovado, contadorAprovouEm: aprovado ? new Date() : null },
    });
    await this.trilha.registrar({
      sistema: 'NFSE',
      operacao: 'LIBERACAO_CONTADOR_TENANT',
      requestResumo: `company=${companyId} contadorAprovou=${aprovado}`,
      sucesso: true,
      aprovadoPor: userId != null ? String(userId) : null,
    });
    return this.checklist(companyId);
  }

  /**
   * ATIVAR PRODUÇÃO — só com LT+TEC completos; registra usuário/data (trilha).
   * A partir daqui as notas são DOCUMENTO FISCAL DE VERDADE.
   */
  async ativarProducao(companyId: number, userId: number | null) {
    const estado = await this.checklist(companyId);
    if (!estado.prontoParaProducao) {
      const faltando = estado.itens.filter((i) => i.grupo !== 'OP' && !i.ok).map((i) => i.rotulo).join(' · ');
      throw new BadRequestException(`Checklist incompleto para produção: ${faltando}.`);
    }
    await (this.prisma as any).fiscalTenantProfile.update({
      where: { companyId },
      data: {
        ambiente: 'producao',
        producaoAtivadaEm: new Date(),
        producaoAtivadaPor: userId != null ? String(userId) : null,
      },
    });
    await this.trilha.registrar({
      sistema: 'NFSE',
      operacao: 'ATIVAR_PRODUCAO_TENANT',
      requestResumo: `company=${companyId} ambiente=producao`,
      sucesso: true,
      aprovadoPor: userId != null ? String(userId) : null,
    });
    this.logger.warn(`[fiscal] PRODUÇÃO ATIVADA para company ${companyId} por user ${userId ?? '?'} (trilha registrada).`);
    return this.checklist(companyId);
  }

  /** Voltar pra restrita — sentido SEGURO, sempre permitido (com trilha). */
  async voltarRestrita(companyId: number, userId: number | null) {
    await (this.prisma as any).fiscalTenantProfile.upsert({
      where: { companyId },
      create: { companyId, ambiente: 'restrita' },
      update: { ambiente: 'restrita' },
    });
    await this.trilha.registrar({
      sistema: 'NFSE',
      operacao: 'VOLTAR_RESTRITA_TENANT',
      requestResumo: `company=${companyId} ambiente=restrita`,
      sucesso: true,
      aprovadoPor: userId != null ? String(userId) : null,
    });
    return this.checklist(companyId);
  }
}
