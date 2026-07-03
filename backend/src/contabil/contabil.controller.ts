import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { ContabilService } from './contabil.service';
import { LivroCaixaService } from './livro-caixa.service';
import { ContabilCloseService } from './contabil-close.service';
import { ComprovanteService } from './comprovante.service';
import { NfseCertService } from './nfse-cert.service';
import { NfseEmitterService } from './nfse-emitter.service';
import { FiscalAutomationLogService } from './fiscal-automation-log.service';
import { SerproCredService } from './serpro-cred.service';
import { SerproAutopostService } from './serpro-autopost.service';
import {
  AjusteManualDto,
  CriarLancamentoManualDto,
  DefinirProlaboreDto,
  EmitirNfseDto,
  EstornarLancamentoDto,
  FecharAnoDto,
  FecharMesDto,
  ImpactoProlaboreDto,
  MarcarObligationDto,
  SalvarSerproCredDto,
  SerproTransmitirDto,
  UpdateFiscalProfileDto,
  UploadCertificadoDto,
  ValidarDasDto,
} from './dto/contabil.dto';

// CONTABIL — endpoints owner-only (mesmo guard das rotas /master). O Contabil só LÊ
// as fontes MP (nenhum endpoint aqui escreve em fluxo de pagamento).
@Controller('master/contabil')
@UseGuards(JwtAuthGuard, MasterGuard)
export class ContabilController {
  constructor(
    private readonly contabil: ContabilService,
    private readonly livroCaixa: LivroCaixaService,
    private readonly close: ContabilCloseService,
    private readonly comprovantes: ComprovanteService,
    private readonly nfseCert: NfseCertService,
    private readonly nfseEmitter: NfseEmitterService,
    private readonly automationLog: FiscalAutomationLogService,
    private readonly serproCred: SerproCredService,
    private readonly serproAutopost: SerproAutopostService,
  ) {}

  // FiscalRevenueMonth completo — calcula on-demand se não existir.
  @Get('mes/:competencia')
  getMes(@Param('competencia') competencia: string) {
    return this.contabil.getMes(competencia);
  }

  // Simulador de cenário. receita/prolabore em CENTS.
  @Get('simulador')
  simulador(
    @Query('receita') receita?: string,
    @Query('prolabore') prolabore?: string,
    @Query('rbt12') rbt12?: string,
    @Query('folha12m') folha12m?: string,
  ) {
    return this.contabil.simulador({
      receitaMesCents: Math.max(0, Math.trunc(Number(receita || 0))),
      prolaboreCents: Math.max(0, Math.trunc(Number(prolabore || 0))),
      rbt12Cents: rbt12 !== undefined ? Math.max(0, Math.trunc(Number(rbt12))) : undefined,
      folha12mCents: folha12m !== undefined ? Math.max(0, Math.trunc(Number(folha12m))) : undefined,
    });
  }

  // Perfil fiscal (singleton). SEM campos *Encrypted.
  @Get('perfil')
  getPerfil() {
    return this.contabil.getPerfil();
  }

  @Patch('perfil')
  updatePerfil(@Body() dto: UpdateFiscalProfileDto) {
    return this.contabil.updatePerfil(dto);
  }

  // Ajuste manual da receita do mês (motivo obrigatório).
  @Post('mes/:competencia/ajuste')
  ajuste(@Param('competencia') competencia: string, @Body() dto: AjusteManualDto) {
    return this.contabil.ajusteManual(competencia, dto);
  }

  // CONTABIL S2 — calendário fiscal ------------------------------------

  // Lista de obrigações com estados. competencia opcional filtra ('YYYY-MM' ou 'YYYY-ANUAL').
  @Get('obrigacoes')
  listarObrigacoes(@Query('competencia') competencia?: string) {
    return this.contabil.listarObrigacoes(competencia);
  }

  // As 5 próximas (badge do master).
  @Get('proximas')
  proximas() {
    return this.contabil.proximasObrigacoes(5);
  }

  // Transição manual: dono marcou TRANSMITIDO/PAGO/CONFERIDO (com nº de recibo).
  @Post('obrigacoes/:id/marcar')
  marcar(@Param('id') id: string, @Body() dto: MarcarObligationDto) {
    return this.contabil.marcarObrigacao(id, dto);
  }

  // CONTABIL S4 — Livro Caixa ------------------------------------------

  // Lista lançamentos (filtro opcional por competência/ano/categoria/tipo) + saldo acumulado.
  @Get('livro-caixa')
  listarLivroCaixa(
    @Query('competencia') competencia?: string,
    @Query('ano') ano?: string,
    @Query('categoria') categoria?: string,
    @Query('tipo') tipo?: string,
  ) {
    return this.livroCaixa.listar({ competencia, ano, categoria, tipo });
  }

  // Resumo do ano: total entradas/saídas/saldo (cabeçalho do bloco Livro Caixa).
  @Get('livro-caixa/resumo/:ano')
  resumoLivroCaixa(@Param('ano') ano: string) {
    return this.livroCaixa.resumoAno(ano);
  }

  // Espelha a competência (pagamentos MP aprovados/estornados → ENTRADA). Idempotente —
  // chamável manualmente (botão "sincronizar") ou pelo cron do S5 no futuro.
  @Post('livro-caixa/espelhar/:competencia')
  espelharLivroCaixa(@Param('competencia') competencia: string) {
    return this.livroCaixa.espelharCompetencia(competencia);
  }

  // Lançamento manual (servidor, ferramenta, pró-labore pago, distribuição de lucro).
  @Post('livro-caixa')
  criarLancamento(@Body() dto: CriarLancamentoManualDto) {
    return this.livroCaixa.criarLancamentoManual(dto);
  }

  // Correção via ESTORNO (nunca edição direta — Guardrail do S4).
  @Post('livro-caixa/:id/estornar')
  estornarLancamento(@Param('id') id: string, @Body() dto: EstornarLancamentoDto) {
    return this.livroCaixa.estornarLancamento(id, dto);
  }

  // Painel de lucro isento do ano (32% × receita acumulada − DAS pago − já distribuído).
  @Get('livro-caixa/lucro-isento/:ano')
  lucroIsento(@Param('ano') ano: string) {
    return this.livroCaixa.lucroIsentoDisponivelDoAno(ano);
  }

  // Fechamento anual: congela lançamentos (edição só via estorno, mesmo depois de fechado).
  @Post('livro-caixa/fechar/:ano')
  fecharAno(@Param('ano') ano: string, @Body() dto: FecharAnoDto) {
    return this.livroCaixa.fecharAno(ano, dto);
  }

  // Export CSV streaming (data;histórico;entrada;saída;saldo, BOM UTF-8). Filtro por
  // competência OU ano (query) — sem filtro exporta tudo.
  @Get('livro-caixa/export.csv')
  async exportarCsv(
    @Res() res: Response,
    @Query('competencia') competencia?: string,
    @Query('ano') ano?: string,
  ) {
    await this.livroCaixa.exportarCsv(res, { competencia, ano });
  }

  // CONTABIL S5 — copiloto "Fechar o mês" ------------------------------

  // Dossiê do fechamento: números do motor + reconciliação + obrigações +
  // detecção de Fase 0 + pró-labore recomendado. É o que o wizard consome.
  @Get('mes/:competencia/pre-close')
  preClose(@Param('competencia') competencia: string) {
    return this.close.preClose(competencia);
  }

  // Impacto ao vivo de um pró-labore hipotético (passo 2). Só leitura.
  @Post('mes/:competencia/impacto-prolabore')
  impactoProlabore(@Param('competencia') competencia: string, @Body() dto: ImpactoProlaboreDto) {
    return this.close.impactoProlabore(competencia, Number(dto?.prolaboreCents ?? 0));
  }

  // Grava o pró-labore do mês (input do dono, passo 2) — recomputa a cadeia.
  @Post('mes/:competencia/prolabore')
  definirProlabore(@Param('competencia') competencia: string, @Body() dto: DefinirProlaboreDto) {
    return this.close.definirProlabore(competencia, Number(dto?.prolaboreCents ?? 0));
  }

  // Validador de divergência do DAS (o disjuntor do copiloto, passo 4).
  @Post('mes/:competencia/validar-das')
  validarDas(@Param('competencia') competencia: string, @Body() dto: ValidarDasDto) {
    return this.close.validarDivergenciaDas(competencia, Number(dto?.dasGovernoCents ?? 0));
  }

  // O clique final do dono (passo 6): fecha o mês + relatório. NUNCA transmite.
  @Post('mes/:competencia/fechar')
  fecharMes(@Param('competencia') competencia: string, @Body() dto: FecharMesDto) {
    return this.close.fecharMes(competencia, dto || {});
  }

  // Histórico do relatório mensal (o dono relê o que foi mandado no zap).
  @Get('mes/:competencia/relatorio')
  relatorioHistorico(@Param('competencia') competencia: string) {
    return this.close.getRelatorioHistorico(competencia);
  }

  // Comprovantes por obrigação (a pasta-do-contador digital) --------------

  @Get('obrigacoes/:id/comprovantes')
  listarComprovantes(@Param('id') id: string) {
    return this.comprovantes.listar(id);
  }

  @Post('obrigacoes/:id/comprovantes')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadComprovante(@Param('id') id: string, @UploadedFile() file: any) {
    return this.comprovantes.upload(id, file);
  }

  @Get('comprovantes/:comprovanteId/download')
  async downloadComprovante(@Res() res: Response, @Param('comprovanteId') comprovanteId: string) {
    const file = await this.comprovantes.getArquivo(comprovanteId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.byteSize));
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.end(file.content);
  }

  @Delete('comprovantes/:comprovanteId')
  removerComprovante(@Param('comprovanteId') comprovanteId: string) {
    return this.comprovantes.remover(comprovanteId);
  }

  // CONTABIL S6 — NFS-e Nacional automática ----------------------------------
  // TUDO atrás da flag HBX_CONTABIL_NFSE_ENABLED (default OFF). O cofre do
  // certificado funciona independente da flag (o dono pode configurar antes de
  // ligar); a EMISSÃO só age com a flag ON. Segredo nunca sai pela API.

  // Status público do certificado do cofre (validade/dias p/ expirar) — sem segredo.
  @Get('nfse/certificado')
  statusCertificado() {
    return this.nfseCert.getStatus();
  }

  // Upload do .pfx (multipart 'file') + senha (body) → cofre AES-256-GCM.
  @Post('nfse/certificado')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 512 * 1024 } }))
  uploadCertificado(@UploadedFile() file: any, @Body() dto: UploadCertificadoDto) {
    return this.nfseCert.uploadCertificado(file?.buffer, dto?.senha);
  }

  // Remove o certificado do cofre (dono trocou/revogou).
  @Delete('nfse/certificado')
  removerCertificado() {
    return this.nfseCert.removerCertificado();
  }

  // Dispara a emissão da fila (modo manual do dono). Inerte com a flag OFF.
  @Post('nfse/emitir')
  emitirNfse(@Req() req: any, @Body() dto: EmitirNfseDto) {
    const aprovadoPor = req?.user?.id ? String(req.user.id) : 'auto-flag';
    return this.nfseEmitter.emitirPendentes({ competencia: dto?.competencia, limite: dto?.limite, aprovadoPor });
  }

  // Reconciliação pagamentos × notas da competência (semNota = 🔴 na janela).
  @Get('nfse/reconciliacao/:competencia')
  reconciliarNfse(@Param('competencia') competencia: string) {
    return this.nfseEmitter.reconciliar(competencia);
  }

  // Trilha de auditoria das chamadas externas (NFSE|SERPRO). Sem dado sensível.
  @Get('nfse/trilha')
  trilhaAutomacao(@Query('sistema') sistema?: string, @Query('limite') limite?: string) {
    const s = sistema === 'NFSE' || sistema === 'SERPRO' ? sistema : undefined;
    return this.automationLog.listar({ sistema: s, limite: limite ? Number(limite) : undefined });
  }

  // CONTABIL S7 — Autopost PGDAS-D/DAS via Serpro Integra Contador -------------
  // TUDO atrás da flag HBX_CONTABIL_SERPRO_ENABLED (default OFF). O cofre da
  // credencial funciona independente da flag (o dono configura antes de ligar);
  // a TRANSMISSÃO só age com a flag ON E o clique-com-confirmação (Lei nº1).

  // Estado do braço S7 (ligado? credencial no cofre?) — o wizard lê p/ decidir
  // auto (ARMAR/TRANSMITIR) vs semi-auto (deep-link do S5). Nunca dispara nada.
  @Get('serpro/status')
  serproStatus() {
    return this.serproAutopost.status();
  }

  // Status público da credencial do cofre (só o flag configurado; sem segredo).
  @Get('serpro/credencial')
  serproCredStatus() {
    return this.serproCred.getStatus();
  }

  // Guarda a credencial Serpro no cofre AES-256-GCM (Lei nº3). Segredo nunca ecoa.
  @Post('serpro/credencial')
  salvarSerproCred(@Body() dto: SalvarSerproCredDto) {
    return this.serproCred.salvarCredencial(dto);
  }

  // Remove a credencial do cofre (dono trocou/revogou).
  @Delete('serpro/credencial')
  removerSerproCred() {
    return this.serproCred.removerCredencial();
  }

  // ARMAR (Lei nº1): LEITURA PURA — monta o payload EXATO do motor + custo
  // estimado. NÃO transmite, NÃO chama o Serpro. Indisponível → wizard cai no
  // semi-auto. O dono revisa este payload ANTES de decidir transmitir.
  @Get('serpro/armar/:competencia')
  serproArmar(@Param('competencia') competencia: string) {
    return this.serproAutopost.armar(competencia);
  }

  // TRANSMITIR (Lei nº1): o CLIQUE-COM-CONFIRMAÇÃO do dono. aprovadoPor = userId
  // do JWT (NUNCA do body); o DTO exige a confirmação "TRANSMITIR". Declara +
  // gera DAS + confere. NUNCA por cron/retry — transmissão falhou = volta pro dono.
  @Post('serpro/transmitir/:competencia')
  serproTransmitir(@Req() req: any, @Param('competencia') competencia: string, @Body() dto: SerproTransmitirDto) {
    const aprovadoPor = req?.user?.id ? String(req.user.id) : '';
    return this.serproAutopost.transmitir(competencia, { aprovadoPor, confirmacao: dto?.confirmacao });
  }

  // DEFIS assistida (anual) — SEMI-AUTO por decisão do sprint: totais do ano
  // prontos (motor + Livro Caixa) + deep-link. NÃO transmite (o dono digita).
  @Get('serpro/defis/:ano')
  serproDefis(@Param('ano') ano: string) {
    return this.serproAutopost.defisDossie(ano);
  }
}
