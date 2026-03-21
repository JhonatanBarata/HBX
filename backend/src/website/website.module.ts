import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MasterContextModule } from '../master-context/master-context.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule, MasterContextModule, JwtModule.register({})],
  controllers: [WebsiteController],
  providers: [WebsiteService],
})
export class WebsiteModule {}
