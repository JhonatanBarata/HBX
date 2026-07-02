import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';

// WORM-18 — Relatorios "Acompanhe sua equipe". SO LEITURA: agrega VendasLead,
// conversas do Webwhats no banco e distribuicao. Sem schema/migration.
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}
