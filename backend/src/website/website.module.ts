import { Module } from '@nestjs/common';
import { ModulesAccessModule } from '../modules/modules.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [WebsiteController],
  providers: [WebsiteService],
})
export class WebsiteModule {}
