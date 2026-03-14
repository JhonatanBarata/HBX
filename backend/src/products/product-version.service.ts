import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async createVersion(productId: number, data: any, authorId?: number) {
    const last = await this.prisma.productVersion.findFirst({ where: { productId }, orderBy: { version: 'desc' } });
    const next = last ? last.version + 1 : 1;
    return this.prisma.productVersion.create({ data: { productId, data, authorId, version: next } });
  }

  async listVersions(productId: number) {
    return this.prisma.productVersion.findMany({ where: { productId }, orderBy: { version: 'desc' } });
  }
}
