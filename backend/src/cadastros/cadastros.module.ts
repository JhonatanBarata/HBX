import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { CadastrosController } from './cadastros.controller';
import { CadastrosService } from './cadastros.service';

@Module({
  imports: [PrismaModule, ModulesAccessModule],
  controllers: [CadastrosController],
  providers: [CadastrosService],
})
export class CadastrosModule {}
