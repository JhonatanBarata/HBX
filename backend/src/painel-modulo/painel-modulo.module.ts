import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PainelModuloController } from './painel-modulo.controller';
import { PainelModuloService } from './painel-modulo.service';

@Module({
  imports: [PrismaModule],
  controllers: [PainelModuloController],
  providers: [PainelModuloService],
})
export class PainelModuloModule {}
