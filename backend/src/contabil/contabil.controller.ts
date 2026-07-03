import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterGuard } from '../auth/guards/master.guard';
import { ContabilService } from './contabil.service';
import { LivroCaixaService } from './livro-caixa.service';
import { ContabilCloseService } from './contabil-close.service';
import { ComprovanteService } from './comprovante.service';
import {
  AjusteManualDto,
  CriarLancamentoManualDto,
  DefinirProlaboreDto,
  EstornarLancamentoDto,
  FecharAnoDto,
  FecharMesDto,
  ImpactoProlaboreDto,
  MarcarObligationDto,
  UpdateFiscalProfileDto,
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
}
