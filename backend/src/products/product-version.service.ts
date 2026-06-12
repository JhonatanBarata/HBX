import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async createVersion(productId: number, data: any, authorId?: number) {
    const last = await this.prisma.productVersion.findFirst({ where: { productId }, orderBy: { version: 'desc' } });
    const next = last ? last.version + 1 : 1;
    // E4 (PLAN12062026001): ProductVersion.data é String no schema — o
    // snapshot vinha como objeto e o Prisma rejeitava com 500 em todo
    // PATCH/arquivamento de produto.
    const snapshot = typeof data === 'string' ? data : JSON.stringify(data ?? null);
    return this.prisma.productVersion.create({ data: { productId, data: snapshot, authorId, version: next } });
  }

  async listVersions(productId: number) {
    return this.prisma.productVersion.findMany({ where: { productId }, orderBy: { version: 'desc' } });
  }
}
