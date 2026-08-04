import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Admin } from '../auth/admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalProfileService } from './fiscal-profile.service';
import { FiscalNfseService } from './fiscal-nfse.service';
import { FiscalEnvioService } from './fiscal-envio.service';
import { FiscalLiberacaoService } from './fiscal-liberacao.service';
import { FiscalMaloteService } from './fiscal-malote.service';
import { EstoqueService } from './estoque.service';
import { renderNfsePdf } from './nfse-pdf.util';
import {
  AtestarContadorDto,
  AtualizarEstoqueProdutoDto,
  AtualizarServicoFiscalDto,
  CancelarDocumentoDto,
  CriarEstoqueProdutoDto,
  CriarServicoFiscalDto,
  EmitirNfseAvulsaDto,
  EntradaXmlConfirmarDto,
  EntradaXmlPreviewDto,
  EnviarDocumentoDto,
  InventarioEstoqueDto,
  MovimentoEstoqueDto,
  PerdaAjusteEstoqueDto,
  UpdatePerfilFiscalDto,
  UploadCertificadoFiscalDto,
} from './dto/fiscal.dto';

/**
 * FISCAL DO TENANT (PR04082026-FISCAL-TENANT F1a) — casca central, irmão do
 * financeiro-tenant ("financeiro pula pro fiscal"). Guard: JwtAuthGuard +
 * RolesGuard + @Admin na classe INTEIRA (LEI DO VENDEDOR: nota/valor é visão
 * do dono). company-scoped: companyId vem SEMPRE do JWT — nada atravessa empresa.
 * SEM @ModuleAccess de propósito (mesma decisão do financeiro-tenant): o
 * paywall do módulo fiscal é decisão comercial pendente do dono.
 */
@Controller('fiscal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Admin()
export class FiscalController {
  constructor(
    private readonly profile: FiscalProfileService,
    private readonly nfse: FiscalNfseService,
    private readonly envio: FiscalEnvioService,
    private readonly estoque: EstoqueService,
    private readonly malote: FiscalMaloteService,
    private readonly liberacao: FiscalLiberacaoService,
    private readonly prisma: PrismaService,
  ) {}

  private companyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa não identificada');
    return companyId;
  }

  // ------------------------------------------------------------------ PERFIL

  @Get('perfil')
  perfil(@Req() req: any) {
    return this.profile.getPerfilPublico(this.companyIdFromUser(req.user));
  }

  @Put('perfil')
  updatePerfil(@Req() req: any, @Body() dto: UpdatePerfilFiscalDto) {
    return this.profile.updatePerfil(this.companyIdFromUser(req.user), dto || {});
  }

  @Post('perfil/certificado')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 512 * 1024 } }))
  uploadCertificado(@Req() req: any, @UploadedFile() file: any, @Body() dto: UploadCertificadoFiscalDto) {
    return this.profile.uploadCertificado(this.companyIdFromUser(req.user), file?.buffer, dto?.senha);
  }

  @Delete('perfil/certificado')
  removerCertificado(@Req() req: any) {
    return this.profile.removerCertificado(this.companyIdFromUser(req.user));
  }

  @Post('disjuntor/rearmar')
  rearmarDisjuntor(@Req() req: any) {
    return this.profile.rearmarDisjuntor(this.companyIdFromUser(req.user));
  }

  // --------------------------------------------------------------- CATÁLOGO

  @Get('servicos')
  listarServicos(@Req() req: any, @Query('inativos') inativos?: string) {
    return this.profile.listarServicos(this.companyIdFromUser(req.user), inativos === '1');
  }

  @Post('servicos')
  criarServico(@Req() req: any, @Body() dto: CriarServicoFiscalDto) {
    return this.profile.criarServico(this.companyIdFromUser(req.user), dto);
  }

  @Patch('servicos/:id')
  atualizarServico(@Req() req: any, @Param('id') id: string, @Body() dto: AtualizarServicoFiscalDto) {
    return this.profile.atualizarServico(this.companyIdFromUser(req.user), id, dto || {});
  }

  // -------------------------------------------------------- APOIO (tela)

  /**
   * Auto-fill do tomador na emissão avulsa — base RFB local (28M CNPJs).
   * Throttle próprio (revisão adversarial M3): sem ele esta rota vira porta de
   * enumeração da base enriquecida por fora do módulo de prospecção ("vitrine e
   * caixa: dois porteiros"). 10/min cobre digitação humana com folga.
   */
  @Get('consulta-cnpj')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  consultaCnpj(@Query('cnpj') cnpj: string) {
    return this.profile.consultaCnpj(cnpj);
  }

  /** Allowlist de municípios (status/rota) — a tela mostra onde a cidade do tenant está. */
  @Get('municipios')
  municipios() {
    return this.profile.listarMunicipios();
  }

  // --------------------------------------------------------------- EMISSÃO

  @Post('nfse/emitir')
  emitir(@Req() req: any, @Body() dto: EmitirNfseAvulsaDto) {
    return this.nfse.emitirAvulsa(this.companyIdFromUser(req.user), Number(req.user?.id) || null, dto);
  }

  @Post('documentos/:id/reemitir')
  reemitir(@Req() req: any, @Param('id') id: string) {
    return this.nfse.reemitir(this.companyIdFromUser(req.user), Number(req.user?.id) || null, id);
  }

  @Post('documentos/:id/cancelar')
  cancelar(@Req() req: any, @Param('id') id: string, @Body() dto: CancelarDocumentoDto) {
    return this.nfse.cancelar(this.companyIdFromUser(req.user), id, dto?.motivo, Number(req.user?.id) || null);
  }

  /** F1b — reenvio manual do PDF+XML ao tomador (e-mail e/ou WhatsApp). */
  @Post('documentos/:id/enviar')
  enviar(@Req() req: any, @Param('id') id: string, @Body() dto: EnviarDocumentoDto) {
    return this.envio.enviar(
      this.companyIdFromUser(req.user),
      id,
      { email: dto?.email, whats: dto?.whats },
      Number(req.user?.id) || null,
      'manual',
    );
  }

  /** F1b — reconciliação pós-timeout: pergunta à Sefin se a nota existe. */
  @Post('documentos/:id/conferir-sefin')
  conferirSefin(@Req() req: any, @Param('id') id: string) {
    return this.nfse.conferirNaSefin(this.companyIdFromUser(req.user), Number(req.user?.id) || null, id);
  }

  @Get('documentos')
  documentos(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('competencia') competencia?: string,
    @Query('limite') limite?: string,
  ) {
    return this.nfse.listarDocumentos(this.companyIdFromUser(req.user), {
      status,
      competencia,
      limite: limite ? Number(limite) : undefined,
    });
  }

  @Get('documentos/:id/xml')
  async xml(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const { filename, xml } = await this.nfse.getXml(this.companyIdFromUser(req.user), id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  // ------------------------------------------------------- F3 ESTOQUE

  @Get('estoque/produtos')
  estoqueProdutos(@Req() req: any, @Query('inativos') inativos?: string) {
    return this.estoque.listarProdutos(this.companyIdFromUser(req.user), inativos === '1');
  }

  @Post('estoque/produtos')
  estoqueCriarProduto(@Req() req: any, @Body() dto: CriarEstoqueProdutoDto) {
    return this.estoque.criarProduto(this.companyIdFromUser(req.user), dto);
  }

  @Patch('estoque/produtos/:id')
  estoqueAtualizarProduto(@Req() req: any, @Param('id') id: string, @Body() dto: AtualizarEstoqueProdutoDto) {
    return this.estoque.atualizarProduto(this.companyIdFromUser(req.user), id, dto || {});
  }

  /** Catálogo da logística pro VÍNCULO (é por ele que entrega baixa e carga reserva). */
  @Get('estoque/produtos-logistica')
  estoqueProdutosLogistica(@Req() req: any) {
    const companyId = this.companyIdFromUser(req.user);
    return (this.prisma as any).product.findMany({
      where: { companyId, status: 'active' },
      select: { id: true, name: true, unidade: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get('estoque/extrato')
  estoqueExtrato(@Req() req: any, @Query('produtoId') produtoId?: string, @Query('limite') limite?: string) {
    return this.estoque.extrato(this.companyIdFromUser(req.user), {
      produtoId: produtoId || undefined,
      limite: limite ? Number(limite) : undefined,
    });
  }

  @Post('estoque/entrada-manual')
  estoqueEntradaManual(@Req() req: any, @Body() dto: MovimentoEstoqueDto) {
    return this.estoque.entradaManual(this.companyIdFromUser(req.user), dto);
  }

  @Post('estoque/perda')
  estoquePerda(@Req() req: any, @Body() dto: PerdaAjusteEstoqueDto) {
    return this.estoque.perda(this.companyIdFromUser(req.user), dto);
  }

  @Post('estoque/ajuste')
  estoqueAjuste(@Req() req: any, @Body() dto: PerdaAjusteEstoqueDto) {
    return this.estoque.ajuste(this.companyIdFromUser(req.user), dto);
  }

  @Post('estoque/devolucao')
  estoqueDevolucao(@Req() req: any, @Body() dto: MovimentoEstoqueDto) {
    return this.estoque.devolucao(this.companyIdFromUser(req.user), dto);
  }

  @Post('estoque/inventario')
  estoqueInventario(@Req() req: any, @Body() dto: InventarioEstoqueDto) {
    return this.estoque.inventario(this.companyIdFromUser(req.user), dto);
  }

  @Post('estoque/entrada-xml/preview')
  estoqueEntradaXmlPreview(@Req() req: any, @Body() dto: EntradaXmlPreviewDto) {
    return this.estoque.previewEntradaXml(this.companyIdFromUser(req.user), dto.xml);
  }

  @Post('estoque/entrada-xml/confirmar')
  estoqueEntradaXmlConfirmar(@Req() req: any, @Body() dto: EntradaXmlConfirmarDto) {
    return this.estoque.confirmarEntradaXml(this.companyIdFromUser(req.user), dto.xml, dto.mapeamentos || [], {
      permitirRelancamento: Boolean(dto.permitirRelancamento),
    });
  }

  // ------------------------------------------------- MALOTE DO CONTADOR

  @Get('malote/:competencia')
  async maloteContador(@Req() req: any, @Param('competencia') competencia: string, @Res() res: any) {
    const { filename, zip } = await this.malote.gerarMalote(this.companyIdFromUser(req.user), competencia);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(zip);
  }

  // -------------------------------------------- LIBERAÇÃO DE PRODUÇÃO (B4)

  @Get('liberacao')
  liberacaoChecklist(@Req() req: any) {
    return this.liberacao.checklist(this.companyIdFromUser(req.user));
  }

  @Post('liberacao/contador')
  liberacaoContador(@Req() req: any, @Body() dto: AtestarContadorDto) {
    return this.liberacao.atestarContador(this.companyIdFromUser(req.user), Number(req.user?.id) || null, Boolean(dto?.aprovado));
  }

  @Post('liberacao/ativar-producao')
  liberacaoAtivar(@Req() req: any) {
    return this.liberacao.ativarProducao(this.companyIdFromUser(req.user), Number(req.user?.id) || null);
  }

  @Post('liberacao/voltar-restrita')
  liberacaoVoltar(@Req() req: any) {
    return this.liberacao.voltarRestrita(this.companyIdFromUser(req.user), Number(req.user?.id) || null);
  }

  @Get('documentos/:id/pdf')
  async pdf(@Req() req: any, @Param('id') id: string, @Res() res: any) {
    const companyId = this.companyIdFromUser(req.user);
    const doc = await this.nfse.getDocumento(companyId, id);
    const perfil = await this.profile.getPerfilPublico(companyId);
    const pdf = await renderNfsePdf({
      ambiente: doc.ambiente,
      status: doc.status,
      // Snapshot da emissão manda (A2); perfil de hoje é só fallback de docs antigos.
      prestador: {
        razaoSocial: doc.prestadorRazaoSocial || perfil.razaoSocial,
        cnpj: doc.prestadorCnpj || perfil.cnpj,
        municipio: doc.prestadorMunicipio || (perfil.municipio ? `${perfil.municipio.nome}/${perfil.municipio.uf}` : null),
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="nfse-${doc.serie || 's'}-${doc.numero || doc.id}.pdf"`);
    res.send(pdf);
  }
}
