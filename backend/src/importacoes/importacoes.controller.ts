import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleAccess } from '../modules/module-feature.decorator';
import { ModuleAccessGuard } from '../modules/module-access.guard';
import {
  CreateAlertaImportacaoDto,
  CreateImportacaoDto,
  FollowupGlobalQueryDto,
  GraficoQueryDto,
  HistoricoQueryDto,
  ReabrirImportacaoDto,
  UpdateImportacaoDto,
  UpdatePermissaoRoleDto,
} from './dto/importacoes.dto';
import { ImportacoesService } from './importacoes.service';

function ensureUploadDir() {
  const uploadDir = 'public/uploads/importacoes';
  mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

function buildPdfPath(file: any) {
  if (!file) return null;
  return `/uploads/importacoes/${file.filename}`;
}

function buildFilePath(file: any) {
  if (!file) return null;
  return `/uploads/importacoes/${file.filename}`;
}

function normalizePrepaid(raw: any) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (['true', '1', 'sim', 'yes', 'y'].includes(normalized)) return 'true';
  if (['false', '0', 'nao', 'não', 'no', 'n'].includes(normalized)) return 'false';
  return String(raw);
}

function parseTaxasMeta(raw: any, fileMap: Record<string, any>) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  let parsed: any[] = [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) throw new Error('taxasMeta deve ser um array');
    parsed = data;
  } catch {
    throw new BadRequestException('taxasMeta inválido: envie um JSON array');
  }

  const normalized = parsed.map((item, idx) => {
    const fileKey = `taxaFile_${idx}`;
    const file = fileMap[fileKey];
    return {
      ...item,
      fileField: file ? fileKey : null,
      filePath: file ? buildFilePath(file) : null,
    };
  });
  return JSON.stringify(normalized);
}

@Controller('importacoes')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess('follow_up_internacional')
export class ImportacoesController {
  constructor(private readonly service: ImportacoesService) {}

  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureUploadDir()),
        filename: (_req, file, cb) => {
          const safeExt = extname(file.originalname || '').toLowerCase() || '.pdf';
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(@Req() req: any, @Body() dto: CreateImportacaoDto, @UploadedFiles() files?: any[]) {
    const fileMap: Record<string, any> = {};
    (files || []).forEach((f) => (fileMap[f.fieldname] = f));
    const prepaid = normalizePrepaid((dto as any).prepaid);
    if (prepaid !== undefined) (dto as any).prepaid = prepaid;
    const taxasMeta = parseTaxasMeta((dto as any).taxasMeta, fileMap);
    if (taxasMeta !== undefined) (dto as any).taxasMeta = taxasMeta;
    const pdf = fileMap['pdf'] || null;
    return this.service.create(req.user, dto, buildFilePath(pdf));
  }

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user);
  }

  @Get('historico')
  historico(@Req() req: any, @Query() query: HistoricoQueryDto) {
    return this.service.historico(req.user, query);
  }

  @Get('graficos')
  graficos(@Req() req: any, @Query() query: GraficoQueryDto) {
    return this.service.graficos(req.user, query);
  }

  @Get('followup-global')
  followupGlobal(@Req() req: any, @Query() query: FollowupGlobalQueryDto) {
    return this.service.followupGlobal(req.user, query);
  }

  @Get('permissoes')
  listPermissoes(@Req() req: any) {
    return this.service.listPermissoes(req.user);
  }

  @Put('permissoes')
  updatePermissoes(@Req() req: any, @Body() dto: UpdatePermissaoRoleDto) {
    return this.service.updatePermissoes(req.user, dto);
  }

  @Post(':id/finalizar')
  finalizar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.finalizar(req.user, id);
  }

  @Post(':id/reabrir')
  reabrir(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: ReabrirImportacaoDto) {
    return this.service.reabrir(req.user, id, dto);
  }

  @Post(':id/alertas')
  createAlerta(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateAlertaImportacaoDto) {
    return this.service.createAlerta(req.user, id, dto);
  }

  @Get(':id/alertas')
  listAlertas(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.listAlertas(req.user, id);
  }

  @Post(':id/pdf')
  @UseInterceptors(
    FileInterceptor('pdf', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureUploadDir()),
        filename: (_req, file, cb) => {
          const safeExt = extname(file.originalname || '').toLowerCase() || '.pdf';
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
        },
      }),
      limits: { fileSize: 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!String(file.mimetype || '').includes('pdf')) return cb(new BadRequestException('Apenas PDF permitido'), false);
        cb(null, true);
      },
    }),
  )
  async uploadPdf(@Req() req: any, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: any) {
    if (!file) throw new BadRequestException('Envie um arquivo PDF');
    return this.service.attachPdf(req.user, id, buildPdfPath(file) as string);
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.getById(req.user, id);
  }

  @Patch(':id')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureUploadDir()),
        filename: (_req, file, cb) => {
          const safeExt = extname(file.originalname || '').toLowerCase() || '.pdf';
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImportacaoDto, @UploadedFiles() files?: any[]) {
    const fileMap: Record<string, any> = {};
    (files || []).forEach((f) => (fileMap[f.fieldname] = f));
    const prepaid = normalizePrepaid((dto as any).prepaid);
    if (prepaid !== undefined) (dto as any).prepaid = prepaid;
    const taxasMeta = parseTaxasMeta((dto as any).taxasMeta, fileMap);
    if (taxasMeta !== undefined) (dto as any).taxasMeta = taxasMeta;
    const pdf = fileMap['pdf'] || null;
    return this.service.update(req.user, id, dto, buildFilePath(pdf));
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Query('force') force?: string, @Body() body?: any) {
    const shouldForce = String(force || '').toLowerCase() === 'true';
    const motivo = body?.motivo || body?.reason || null;
    return this.service.delete(req.user, id, shouldForce, motivo);
  }
}
