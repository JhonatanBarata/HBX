import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalRouteDate } from './logistica-route-billing.util';
import { LogisticaRotaCobrancaService } from './logistica-rota-cobranca.service';
import {
  assertOperationalCapability,
  resolveOperationalCapabilities,
  type OperationalCapability,
} from '../team/operational-capabilities';

export type TipoEntregaComprovante = 'foto' | 'assinatura';

export interface LogisticaActor {
  id?: number | string | null;
  companyId?: number | string | null;
  role?: string | null;
  isSystemMaster?: boolean | null;
  canViewBilling?: boolean | null;
}

export interface RequisitosComprovante {
  fotoObrigatoria: boolean;
  assinaturaObrigatoria: boolean;
  codigoObrigatorio: boolean;
}

const FOTO_MAX_BYTES = 5 * 1024 * 1024;
const ASSINATURA_MAX_BYTES = 1024 * 1024;

function uploadDir(): string {
  return process.env.LOGISTICA_COMPROVANTE_UPLOAD_DIR || join(process.cwd(), 'storage', 'logistica-comprovantes');
}

function actorId(actor?: LogisticaActor | null): number | null {
  const id = Number(actor?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function isLogisticaAdmin(actor?: LogisticaActor | null): boolean {
  if (actor?.isSystemMaster) return true;
  const role = String(actor?.role || '').trim().toUpperCase();
  return role === 'ADMIN' || role === 'USERMASTER';
}

function normalizeClientKey(value: unknown): string | null {
  const key = String(value || '').trim();
  return key ? key.slice(0, 80) : null;
}

function normalizeCodigo(value: unknown): string {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function hashCodigo(codigo: string, salt: string): Buffer {
  return scryptSync(codigo, salt, 32);
}

function detectarImagem(buffer: Buffer): { contentType: string; extension: string } | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: 'image/png', extension: '.png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: '.jpg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { contentType: 'image/webp', extension: '.webp' };
  }
  return null;
}

@Injectable()
export class LogisticaOperacaoService {
  constructor(
    private readonly prisma: PrismaService,
    // ROTA v2 F3b (10/08) — @Optional() por padrão de módulo: instanciação
    // direta em teste sem o serviço de cobrança segue válida (o portão
    // simplesmente não roda).
    @Optional() private readonly cobranca?: LogisticaRotaCobrancaService,
  ) {}

  async assertCapacidade(actor: LogisticaActor, capability: OperationalCapability): Promise<void> {
    if (isLogisticaAdmin(actor)) return;
    await assertOperationalCapability(this.prisma, actor, capability);
  }

  /** Usuário sem ator só existe em chamadas internas/testes legados. Toda rota HTTP passa ator. */
  async whereForActor(actor?: LogisticaActor | null): Promise<Record<string, unknown>> {
    if (!actor || isLogisticaAdmin(actor)) return {};
    const id = actorId(actor);
    if (!id) throw new ForbiddenException('Usuário não identificado.');
    await assertOperationalCapability(this.prisma, actor, 'DRIVER');
    return { entregadorId: id };
  }

  async assertEntregaAcessivel(
    companyId: number,
    entregaId: string,
    actor?: LogisticaActor | null,
  ): Promise<any | null> {
    const actorWhere = await this.whereForActor(actor);
    return (this.prisma as any).entrega.findFirst({
      where: { id: String(entregaId || '').trim(), companyId, ...actorWhere },
      select: { id: true, status: true, entregadorId: true },
    });
  }

  async listarEntregadores(companyId: number) {
    const users = await this.prisma.user.findMany({
      where: { companyId, isActive: true, isSystemMaster: false },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, email: true, username: true, role: true, companyId: true, isSystemMaster: true },
    });
    const avaliados = await Promise.all(
      users.map(async (user) => ({
        user,
        capabilities: await resolveOperationalCapabilities(this.prisma, user),
      })),
    );
    return avaliados
      .filter((row) => row.capabilities.includes('DRIVER'))
      .map(({ user }) => ({
        id: user.id,
        nome: user.name || user.username || user.email || `Usuário ${user.id}`,
        email: user.email ?? null,
      }));
  }

  async atribuirEntrega(companyId: number, entregaId: string, entregadorId: number | null, actor: LogisticaActor) {
    const id = String(entregaId || '').trim();
    const entrega = await this.prisma.entrega.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, scheduledAt: true },
    });
    if (!entrega) return null;
    if (entrega.status === 'entregue' || entrega.status === 'cancelada') {
      throw new BadRequestException('Entrega concluída ou cancelada não pode ser reatribuída.');
    }

    let target: any = null;
    if (entregadorId != null) {
      target = await this.prisma.user.findFirst({
        where: { id: Number(entregadorId), companyId, isActive: true, isSystemMaster: false },
        select: { id: true, name: true, email: true, username: true, role: true, companyId: true, isSystemMaster: true },
      });
      if (!target) throw new BadRequestException('Entregador não encontrado nesta empresa.');
      const caps = await resolveOperationalCapabilities(this.prisma, target);
      if (!caps.includes('DRIVER')) {
        throw new BadRequestException('Este usuário não possui a capacidade Entregas.');
      }
      // ROTA v2 F3b (10/08) — o portão de assentos: só quando um motorista
      // está SENDO POSTO na entrega (nunca ao limpar — `entregadorId: null`
      // nunca gasta assento). A data é a da PRÓPRIA entrega (sem data, cai em
      // hoje — mesma régua de sempre pra entrega perpétua/avulsa).
      if (this.cobranca) {
        await this.cobranca.assertAssentoDoDia(
          companyId,
          target.id,
          canonicalRouteDate(undefined, entrega.scheduledAt ?? new Date()),
        );
      }
    }

    const updated = await this.prisma.entrega.update({
      where: { id: entrega.id },
      data: {
        entregadorId: target?.id ?? null,
        atribuidoPorUserId: actorId(actor),
        atribuidoAt: new Date(),
      },
      select: {
        id: true,
        entregadorId: true,
        atribuidoAt: true,
        entregador: { select: { id: true, name: true, email: true, username: true } },
      },
    });
    return {
      id: updated.id,
      entregador: updated.entregador
        ? {
            id: updated.entregador.id,
            nome: updated.entregador.name || updated.entregador.username || updated.entregador.email,
            email: updated.entregador.email ?? null,
          }
        : null,
      atribuidoAt: updated.atribuidoAt?.toISOString() ?? null,
    };
  }

  /**
   * COCKPIT (03/08) — atribuição em LOTE. Nasceu da tela do dono com 51 paradas
   * órfãs: uma por uma eram 51 arrastadas, e arrastar é gesto de MOUSE — não
   * existia caminho pra "dá tudo pro Marquinhos".
   *
   * 🔴 PARCIAL É SUCESSO, NÃO ERRO. Uma entrega que virou 'entregue' ou
   * 'cancelada' entre a tela pintar e o clique chegar não pode derrubar as
   * outras 50 — o `updateMany` já filtra por status ABERTO e o resultado conta
   * quem entrou e quem ficou de fora. Transação tudo-ou-nada aqui só produziria
   * o pior dos mundos: o operador clica, nada acontece, e a tela não explica.
   *
   * A validação do destinatário é a MESMA de `atribuirEntrega` (existe na
   * empresa, ativo, capacidade DRIVER) — porteiro único: seria bug de produto
   * o lote aceitar alguém que a atribuição de uma parada recusa.
   */
  async atribuirLote(
    companyId: number,
    ids: string[],
    entregadorId: number | null,
    actor: LogisticaActor,
  ): Promise<{ atribuidas: number; ignoradas: number; entregador: { id: number; nome: string } | null }> {
    const lista = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!lista.length) throw new BadRequestException('Selecione ao menos uma parada.');

    let target: any = null;
    if (entregadorId != null) {
      target = await this.prisma.user.findFirst({
        where: { id: Number(entregadorId), companyId, isActive: true, isSystemMaster: false },
        select: { id: true, name: true, email: true, username: true, role: true, companyId: true, isSystemMaster: true },
      });
      if (!target) throw new BadRequestException('Entregador não encontrado nesta empresa.');
      const caps = await resolveOperationalCapabilities(this.prisma, target);
      if (!caps.includes('DRIVER')) {
        throw new BadRequestException('Este usuário não possui a capacidade Entregas.');
      }
    }

    const res = await this.prisma.entrega.updateMany({
      where: { id: { in: lista }, companyId, status: { in: ['agendada', 'em_rota'] } },
      data: {
        entregadorId: target?.id ?? null,
        atribuidoPorUserId: actorId(actor),
        atribuidoAt: new Date(),
      },
    });

    return {
      atribuidas: res.count,
      ignoradas: Math.max(0, lista.length - res.count),
      entregador: target
        ? { id: target.id, nome: target.name || target.username || target.email || `Usuário ${target.id}` }
        : null,
    };
  }

  async gerarCodigo(companyId: number, entregaId: string, actor: LogisticaActor) {
    const entrega = await this.prisma.entrega.findFirst({
      where: { id: String(entregaId || '').trim(), companyId },
      select: { id: true, status: true },
    });
    if (!entrega) return null;
    if (entrega.status === 'entregue' || entrega.status === 'cancelada') {
      throw new BadRequestException('Não é possível gerar código para uma entrega concluída ou cancelada.');
    }
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const geradoAt = new Date();
    await this.prisma.entrega.update({
      where: { id: entrega.id },
      data: {
        comprovanteCodigoSalt: salt,
        comprovanteCodigoHash: hashCodigo(codigo, salt).toString('hex'),
        comprovanteCodigoGeradoAt: geradoAt,
        comprovanteCodigoGeradoPorUserId: actorId(actor),
      },
    });
    return { id: entrega.id, codigo, geradoAt: geradoAt.toISOString() };
  }

  async uploadComprovante(
    companyId: number,
    entregaId: string,
    tipo: TipoEntregaComprovante,
    file: any,
    actor: LogisticaActor,
    clientKeyInput?: unknown,
  ) {
    const entrega = await this.assertEntregaAcessivel(companyId, entregaId, actor);
    if (!entrega) throw new NotFoundException('Entrega não encontrada.');
    if (entrega.status === 'entregue' || entrega.status === 'cancelada') {
      throw new BadRequestException('Entrega concluída ou cancelada não aceita novo comprovante.');
    }
    if (tipo !== 'foto' && tipo !== 'assinatura') throw new BadRequestException('Tipo de comprovante inválido.');

    const clientKey = normalizeClientKey(clientKeyInput);
    if (clientKey) {
      const replay = await (this.prisma as any).entregaComprovante.findFirst({
        where: { entregaId: entrega.id, tipo, clientKey },
      });
      if (replay) {
        if (replay.status === 'removido') {
          throw new BadRequestException('Este upload já foi substituído por um comprovante mais recente.');
        }
        return { ...this.serialize(replay), replayed: true };
      }
    }

    if (!file?.buffer?.length) throw new BadRequestException('Envie o arquivo do comprovante.');
    const buffer = Buffer.from(file.buffer);
    const detected = detectarImagem(buffer);
    if (!detected) throw new BadRequestException('Arquivo inválido. Envie uma imagem JPG, PNG ou WEBP real.');
    if (tipo === 'assinatura' && detected.contentType !== 'image/png') {
      throw new BadRequestException('A assinatura deve ser enviada em PNG.');
    }
    const maxBytes = tipo === 'foto' ? FOTO_MAX_BYTES : ASSINATURA_MAX_BYTES;
    if (buffer.length > maxBytes) {
      throw new BadRequestException(
        tipo === 'foto' ? 'A foto deve ter no máximo 5 MB.' : 'A assinatura deve ter no máximo 1 MB.',
      );
    }

    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    const storedFilename = `${entrega.id}-${randomUUID()}${detected.extension}`;
    const storagePath = join(dir, storedFilename);
    await writeFile(storagePath, buffer);
    const originalFilename = String(file.originalname || `${tipo}${detected.extension}`).slice(0, 180);
    let removidos: Array<{ storagePath?: string }> = [];
    let created: any;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        removidos = await (tx as any).entregaComprovante.findMany({
          where: { companyId, entregaId: entrega.id, tipo, status: 'pendente' },
          select: { id: true, storagePath: true },
        });
        if (removidos.length) {
          await (tx as any).entregaComprovante.updateMany({
            where: { id: { in: removidos.map((row: any) => row.id) } },
            data: { status: 'removido' },
          });
        }
        return (tx as any).entregaComprovante.create({
          data: {
            companyId,
            entregaId: entrega.id,
            tipo,
            originalFilename,
            storedFilename,
            storagePath,
            contentType: detected.contentType,
            byteSize: buffer.length,
            sha256: createHash('sha256').update(buffer).digest('hex'),
            clientKey,
            enviadoPorUserId: actorId(actor),
          },
        });
      });
    } catch (error) {
      await unlink(storagePath).catch(() => undefined);
      // Duas drenagens offline podem correr juntas. O índice composto decide a
      // vencedora; a perdedora relê e devolve o mesmo artefato, sem erro/duplicata.
      if (clientKey && String((error as any)?.code || '') === 'P2002') {
        const replay = await (this.prisma as any).entregaComprovante.findFirst({
          where: { entregaId: entrega.id, tipo, clientKey, status: { not: 'removido' } },
        });
        if (replay) return { ...this.serialize(replay), replayed: true };
      }
      throw error;
    }
    await Promise.all(removidos.map((row) => (row.storagePath ? unlink(row.storagePath).catch(() => undefined) : undefined)));
    return { ...this.serialize(created), replayed: false };
  }

  async getArquivo(companyId: number, comprovanteId: string, actor: LogisticaActor) {
    const row = await (this.prisma as any).entregaComprovante.findFirst({
      where: { id: String(comprovanteId || '').trim(), companyId, status: { not: 'removido' } },
    });
    if (!row) throw new NotFoundException('Comprovante não encontrado.');
    const entrega = await this.assertEntregaAcessivel(companyId, row.entregaId, actor);
    if (!entrega) throw new NotFoundException('Comprovante não encontrado.');
    const content = await readFile(row.storagePath).catch(() => null);
    if (!content) throw new NotFoundException('Arquivo do comprovante não encontrado.');
    return {
      content,
      filename: row.originalFilename || row.storedFilename,
      contentType: row.contentType || 'application/octet-stream',
      byteSize: row.byteSize || content.length,
    };
  }

  requisitosFromConfig(config: any): RequisitosComprovante {
    return {
      fotoObrigatoria: !!config?.comprovanteFotoObrigatoria,
      assinaturaObrigatoria: !!config?.comprovanteAssinaturaObrigatoria,
      codigoObrigatorio: !!config?.comprovanteCodigoObrigatorio,
    };
  }

  /** Executado dentro da transação do confirmar: requisito e artefato fecham juntos. */
  async validarParaConfirmacao(
    tx: any,
    companyId: number,
    entrega: any,
    input: {
      comprovanteFotoId?: string;
      comprovanteAssinaturaId?: string;
      comprovanteCodigo?: string;
    },
    actor?: LogisticaActor | null,
  ): Promise<{ ids: string[]; exigiuComprovante: boolean }> {
    const cfg = await tx.logisticaConfig.findUnique({
      where: { companyId },
      select: {
        comprovanteFotoObrigatoria: true,
        comprovanteAssinaturaObrigatoria: true,
        comprovanteCodigoObrigatorio: true,
      },
    });
    const requisitos = this.requisitosFromConfig(cfg);
    const ids: string[] = [];
    const validarArquivo = async (tipo: TipoEntregaComprovante, idInput?: string) => {
      const id = String(idInput || '').trim();
      if (!id) throw new BadRequestException(`Comprovante de ${tipo} é obrigatório.`);
      const row = await tx.entregaComprovante.findFirst({
        where: {
          id,
          companyId,
          entregaId: entrega.id,
          tipo,
          status: 'pendente',
          ...(actor && !isLogisticaAdmin(actor) ? { enviadoPorUserId: actorId(actor) } : {}),
        },
        select: { id: true },
      });
      if (!row) throw new BadRequestException(`Comprovante de ${tipo} inválido ou já utilizado.`);
      ids.push(row.id);
    };
    if (requisitos.fotoObrigatoria) await validarArquivo('foto', input.comprovanteFotoId);
    if (requisitos.assinaturaObrigatoria) await validarArquivo('assinatura', input.comprovanteAssinaturaId);
    if (requisitos.codigoObrigatorio) {
      const codigo = normalizeCodigo(input.comprovanteCodigo);
      if (codigo.length !== 6) throw new BadRequestException('Informe o código de comprovante com 6 dígitos.');
      if (!entrega.comprovanteCodigoHash || !entrega.comprovanteCodigoSalt) {
        throw new BadRequestException('O admin ainda não gerou o código desta entrega.');
      }
      const expected = Buffer.from(entrega.comprovanteCodigoHash, 'hex');
      const received = hashCodigo(codigo, entrega.comprovanteCodigoSalt);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        throw new BadRequestException('Código de comprovante inválido.');
      }
    }
    return {
      ids,
      exigiuComprovante:
        requisitos.fotoObrigatoria || requisitos.assinaturaObrigatoria || requisitos.codigoObrigatorio,
    };
  }

  private serialize(row: any) {
    return {
      id: row.id,
      entregaId: row.entregaId,
      tipo: row.tipo,
      contentType: row.contentType,
      byteSize: row.byteSize,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    };
  }
}
