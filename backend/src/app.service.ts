import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getRoot() {
    return { message: 'NestJS fresh app' };
  }

  async healthWithDb() {
    try {
      // Try a simple database query to verify connection
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Database is not available yet (cold start)
      return {
        status: 'ok',
        database: 'connecting',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Database unavailable',
      };
    }
  }
}
