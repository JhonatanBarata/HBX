import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductVersionService } from './product-version.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly pv: ProductVersionService) {}

  private async assertWritable(companyId: number, id: number) {
    const prod = await this.prisma.product.findUnique({ where: { id } });
    if (!prod) throw new NotFoundException(`Product with id ${id} not found`);
    if (prod.companyId !== companyId) throw new ForbiddenException('Cannot modify product from a different company');
    return prod;
  }

  async createForCompany(companyId: number, createDto: CreateProductDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);

    return this.prisma.product.create({
      data: {
        name: createDto.name,
        description: createDto.description,
        price: createDto.price,
        stock: createDto.stock ?? 0,
        companyId,
      },
    });
  }

  async findAllForCompany(companyId: number) {
    return this.prisma.product.findMany({ where: { companyId }, orderBy: { id: 'asc' } });
  }

  async findOneForCompany(companyId: number, id: number) {
    const prod = await this.prisma.product.findFirst({ where: { id, companyId } });
    if (!prod) throw new NotFoundException(`Product with id ${id} not found`);
    return prod;
  }

  async updateForCompany(companyId: number, id: number, updateDto: UpdateProductDto, authorId?: number) {
    const prod = await this.assertWritable(companyId, id);
    // create version snapshot before update
    await this.pv.createVersion(id, prod, authorId);

    return this.prisma.product.update({ where: { id }, data: updateDto as any });
  }

  async responsiveEdit(id: number, partial: Partial<UpdateProductDto>, authorId?: number) {
    // responsive edit: creates a version and applies patch
    const prod = await this.prisma.product.findUnique({ where: { id } });
    if (!prod) throw new NotFoundException(`Product with id ${id} not found`);
    await this.pv.createVersion(id, prod, authorId);
    return this.prisma.product.update({ where: { id }, data: partial as any });
  }

  async removeForCompany(companyId: number, id: number) {
    await this.assertWritable(companyId, id);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }
}
