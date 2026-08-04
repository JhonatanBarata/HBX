import { Module } from '@nestjs/common';

import { ComexModule } from '../comex/comex.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PainelModuloController } from './painel-modulo.controller';
import { PainelModuloService } from './painel-modulo.service';

// ComexModule entra só pelo CÂMBIO (o painel do Comex mostra o dólar do dia).
// É o único painel sem dado no banco do tenant. A dependência é de mão única:
// o Comex não conhece o painel — se um dia isso virar círculo, a saída é o
// serviço de câmbio virar módulo próprio, não duplicar o cache.
@Module({
  imports: [PrismaModule, ComexModule],
  controllers: [PainelModuloController],
  providers: [PainelModuloService],
})
export class PainelModuloModule {}
