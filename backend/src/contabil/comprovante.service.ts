import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

// ===========================================================================
// CONTABIL S5 — Comprovantes por obrigação (a "pasta-do-contador digital").
// ---------------------------------------------------------------------------
// Storage em DISCO seguindo o padrão da casa (SellerOnboardingAttachment):
// arquivo em `storage/contabil-comprovantes`, metadados no banco (FiscalComprovante).
// Aceita PDF/JPG/PNG (recibo PGDAS-D, guia DAS, print do e-CAC), <= 5MB, com
// validação de magic-bytes (não confia só na extensão). Nada de storage novo:
// mesma máquina (memoryStorage do multer no controller → buffer → writeFile).
// ===========================================================================

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSOES_OK = ['.pdf', '.jpg', '.jpeg', '.png'];

function comprovanteUploadDir(): string {
  return process.env.CONTABIL_COMPROVANTE_UPLOAD_DIR || join(process.cwd(), 'storage', 'contabil-comprovantes');
}

function conteudoPermitido(buffer: Buffer, extension: string): boolean {
  if (extension === '.pdf') {
    return buffer.subarray(0, 5).toString('utf8') === '%PDF-';
  }
  if (extension === '.png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

@Injectable()
export class ComprovanteService {
  private readonly logger = new Logger(ComprovanteService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Lista comprovantes (não deletados) de uma obrigação. */
  async listar(obligationId: string) {
    const rows = await (this.prisma as any).fiscalComprovante.findMany({
      where: { obligationId: String(obligationId || ''), status: { not: 'deleted' } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: any) => this.serialize(r));
  }

  /**
   * Anexa um comprovante (PDF/JPG/PNG) a uma obrigação. `file` vem do multer
   * (memoryStorage — buffer em memória). Valida obrigação existente, tamanho,
   * extensão e magic-bytes; grava em disco + metadados no banco.
   */
  async upload(obligationId: string, file: any) {
    const id = String(obligationId || '').trim();
    if (!id) throw new BadRequestException('obligationId é obrigatório');

    const obrigacao = await (this.prisma as any).fiscalObligation.findUnique({ where: { id } });
    if (!obrigacao) throw new NotFoundException(`obrigação '${id}' não encontrada`);

    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo.');
    const originalFilename = String(file.originalname || '').slice(0, 180) || `comprovante${extname(String(file.originalname || '')) || '.pdf'}`;
    const extension = extname(originalFilename).toLowerCase();
    if (!EXTENSOES_OK.includes(extension)) {
      throw new BadRequestException('Comprovante precisa ser PDF, JPG ou PNG.');
    }
    if (Number(file.size || file.buffer.length || 0) > MAX_BYTES) {
      throw new BadRequestException('Comprovante deve ter no máximo 5MB.');
    }
    const buffer = Buffer.from(file.buffer);
    if (!conteudoPermitido(buffer, extension)) {
      throw new BadRequestException('Arquivo inválido. Envie um PDF, JPG ou PNG real.');
    }

    const uploadDir = comprovanteUploadDir();
    await mkdir(uploadDir, { recursive: true });
    const storedFilename = `${id}-${randomUUID()}${extension}`;
    const storagePath = join(uploadDir, storedFilename);
    await writeFile(storagePath, buffer);

    const created = await (this.prisma as any).fiscalComprovante.create({
      data: {
        obligationId: id,
        competencia: obrigacao.competencia,
        tipo: obrigacao.tipo,
        originalFilename,
        storedFilename,
        storagePath,
        contentType: String(file.mimetype || '').slice(0, 120) || null,
        byteSize: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        status: 'permanent',
      },
    });
    return this.serialize(created);
  }

  /** Lê o arquivo do comprovante para download (streaming pelo controller). */
  async getArquivo(comprovanteId: string) {
    const row = await (this.prisma as any).fiscalComprovante.findFirst({
      where: { id: String(comprovanteId || ''), status: { not: 'deleted' } },
    });
    if (!row) throw new NotFoundException('Comprovante não encontrado.');
    let content: Buffer;
    try {
      content = await readFile(row.storagePath);
    } catch {
      throw new NotFoundException('Arquivo do comprovante não encontrado.');
    }
    return {
      content,
      filename: row.originalFilename || row.storedFilename || 'comprovante',
      contentType: row.contentType || 'application/octet-stream',
      byteSize: row.byteSize || content.length,
    };
  }

  /** Remove (soft-delete + apaga do disco) um comprovante. */
  async remover(comprovanteId: string) {
    const row = await (this.prisma as any).fiscalComprovante.findFirst({
      where: { id: String(comprovanteId || ''), status: { not: 'deleted' } },
    });
    if (!row) throw new NotFoundException('Comprovante não encontrado.');
    try {
      if (row.storagePath) await unlink(row.storagePath);
    } catch {
      /* arquivo já não existe: segue marcando deletado no banco */
    }
    await (this.prisma as any).fiscalComprovante.update({
      where: { id: row.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });
    return { ok: true };
  }

  private serialize(row: any) {
    return {
      id: row.id,
      obligationId: row.obligationId,
      competencia: row.competencia,
      tipo: row.tipo,
      originalFilename: row.originalFilename,
      contentType: row.contentType ?? null,
      byteSize: row.byteSize,
      createdAt: row.createdAt,
    };
  }
}
