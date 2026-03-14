import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Log DB URL at startup to help diagnose multiple DB instances
    try {
      // eslint-disable-next-line no-console
      console.log('Prisma connecting to DATABASE_URL=', process.env.DATABASE_URL);
    } catch (e) {}
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
