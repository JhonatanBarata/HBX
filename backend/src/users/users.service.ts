import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { username?: string | null; email: string; password: string; name?: string; companyId?: number | null; role?: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username }, include: { company: { include: { plan: { include: { features: true } } } } } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email }, include: { company: { include: { plan: { include: { features: true } } } } } });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id }, include: { company: { include: { plan: { include: { features: true } } } } } });
  }

  async updateCompany(userId: number, companyId: number): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { companyId } });
  }

  async setPassword(userId: number, hashedPassword: string): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
  }

  async updateById(userId: number, data: any): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async listByCompany(companyId: number): Promise<Array<Pick<User, 'id' | 'username' | 'email' | 'name' | 'companyId' | 'role' | 'isActive' | 'deactivatedAt' | 'retentionUntil' | 'createdAt'>>> {
    return this.prisma.user.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        companyId: true,
        role: true,
        isActive: true,
        deactivatedAt: true,
        retentionUntil: true,
        createdAt: true,
      },
    });
  }

  async updateRole(userId: number, role: 'USER' | 'ADMIN' | 'GERENTE'): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async deactivateUser(userId: number, retentionDays = 730): Promise<User> {
    const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        retentionUntil,
      },
    });
  }

  async reactivateUser(userId: number): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        deactivatedAt: null,
        retentionUntil: null,
      },
    });
  }

  async hardDeleteUser(userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userModuleAccess.deleteMany({ where: { userId } });
      await tx.passwordReset.deleteMany({ where: { userId } });
      await tx.productVersion.updateMany({ where: { authorId: userId }, data: { authorId: null } });
      await tx.user.delete({ where: { id: userId } });
    });
  }
}
