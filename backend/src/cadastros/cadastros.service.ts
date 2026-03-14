import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFornecedorDto, CreatePaisDto, CreatePortoDto, UpsertTransitTimeDto } from './dto/cadastros.dto';

@Injectable()
export class CadastrosService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureCompanyIdFromUser(user: any): number {
    const companyId = Number(user?.companyId);
    if (!companyId) throw new ForbiddenException('Empresa nao identificada');
    return companyId;
  }

  private cleanName(input: string) {
    return String(input || '').trim();
  }

  async getOptions(user: any) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const [fornecedores, paises, portos, transitTimes] = await Promise.all([
      this.prisma.cadastroFornecedor.findMany({
        where: { empresaId: companyId },
        include: { pais: true, portoOrigem: true, portoDestino: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cadastroPais.findMany({
        where: { empresaId: companyId },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cadastroPorto.findMany({
        where: { empresaId: companyId },
        include: { pais: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.cadastroTransitTime.findMany({
        where: { empresaId: companyId },
        include: { portoOrigem: true, portoDestino: true },
        orderBy: [{ portoOrigemId: 'asc' }, { portoDestinoId: 'asc' }],
      }),
    ]);

    return { fornecedores, paises, portos, transitTimes };
  }

  async createFornecedor(user: any, dto: CreateFornecedorDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const nome = this.cleanName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome do fornecedor e obrigatorio');

    let paisId: number | null = null;
    if (dto?.paisId !== undefined && dto?.paisId !== null) {
      const pais = await this.prisma.cadastroPais.findUnique({ where: { id: Number(dto.paisId) } });
      if (!pais || pais.empresaId !== companyId) throw new NotFoundException('Pais nao encontrado');
      paisId = pais.id;
    }

    let portoOrigemId: number | null = null;
    if (dto?.portoOrigemId !== undefined && dto?.portoOrigemId !== null) {
      const porto = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoOrigemId) } });
      if (!porto || porto.empresaId !== companyId) throw new NotFoundException('Porto de origem nao encontrado');
      portoOrigemId = porto.id;
    }

    let portoDestinoId: number | null = null;
    if (dto?.portoDestinoId !== undefined && dto?.portoDestinoId !== null) {
      const porto = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoDestinoId) } });
      if (!porto || porto.empresaId !== companyId) throw new NotFoundException('Porto de destino nao encontrado');
      portoDestinoId = porto.id;
    }

    if (portoOrigemId && portoDestinoId && portoOrigemId === portoDestinoId) {
      throw new BadRequestException('Porto de origem e destino devem ser diferentes');
    }

    return this.prisma.cadastroFornecedor.upsert({
      where: { empresaId_nome: { empresaId: companyId, nome } },
      update: { paisId, portoOrigemId, portoDestinoId },
      create: { empresaId: companyId, nome, paisId, portoOrigemId, portoDestinoId },
      include: { pais: true, portoOrigem: true, portoDestino: true },
    });
  }

  async createPais(user: any, dto: CreatePaisDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const nome = this.cleanName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome do pais e obrigatorio');
    return this.prisma.cadastroPais.upsert({
      where: { empresaId_nome: { empresaId: companyId, nome } },
      update: {},
      create: { empresaId: companyId, nome },
    });
  }

  async createPorto(user: any, dto: CreatePortoDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const nome = this.cleanName(dto?.nome);
    if (!nome) throw new BadRequestException('Nome do porto e obrigatorio');

    let paisId: number | null = null;
    if (dto?.paisId !== undefined && dto?.paisId !== null) {
      const pais = await this.prisma.cadastroPais.findUnique({ where: { id: Number(dto.paisId) } });
      if (!pais || pais.empresaId !== companyId) throw new NotFoundException('Pais nao encontrado');
      paisId = pais.id;
    }

    return this.prisma.cadastroPorto.upsert({
      where: { empresaId_nome: { empresaId: companyId, nome } },
      update: { paisId },
      create: { empresaId: companyId, nome, paisId },
      include: { pais: true },
    });
  }

  async upsertTransitTime(user: any, dto: UpsertTransitTimeDto) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const origem = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoOrigemId) } });
    const destino = await this.prisma.cadastroPorto.findUnique({ where: { id: Number(dto.portoDestinoId) } });
    if (!origem || origem.empresaId !== companyId) throw new NotFoundException('Porto de origem nao encontrado');
    if (!destino || destino.empresaId !== companyId) throw new NotFoundException('Porto de destino nao encontrado');
    if (origem.id === destino.id) throw new BadRequestException('Portos de origem e destino devem ser diferentes');

    const dias = Number(dto?.dias || 0);
    if (!Number.isFinite(dias) || dias <= 0) throw new BadRequestException('Dias de transit time invalido');

    return this.prisma.cadastroTransitTime.upsert({
      where: {
        empresaId_portoOrigemId_portoDestinoId: {
          empresaId: companyId,
          portoOrigemId: origem.id,
          portoDestinoId: destino.id,
        },
      },
      update: { dias },
      create: {
        empresaId: companyId,
        portoOrigemId: origem.id,
        portoDestinoId: destino.id,
        dias,
      },
      include: { portoOrigem: true, portoDestino: true },
    });
  }

  async resolveTransitTime(user: any, portoOrigemId: number, portoDestinoId: number) {
    const companyId = this.ensureCompanyIdFromUser(user);
    const row = await this.prisma.cadastroTransitTime.findUnique({
      where: {
        empresaId_portoOrigemId_portoDestinoId: {
          empresaId: companyId,
          portoOrigemId: Number(portoOrigemId),
          portoDestinoId: Number(portoDestinoId),
        },
      },
    });
    return row ? { dias: row.dias } : { dias: null };
  }
}
