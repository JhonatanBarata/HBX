import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { name: dto.name, description: dto.description } });
  }

  async findAll() {
    return this.prisma.category.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException(`Category with id ${id} not found`);
    return cat;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.category.update({ where: { id }, data: dto as any });
  }

  async remove(id: number) {
    await this.findOne(id);
    // detach category from products
    await this.prisma.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }
}
