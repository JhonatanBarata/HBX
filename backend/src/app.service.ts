import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getRoot() {
    return { message: 'NestJS fresh app' };
  }

  async healthWithDb() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'connecting',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Database unavailable',
      });
    }
  }
}
