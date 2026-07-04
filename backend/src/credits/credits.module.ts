import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditWalletService } from './credit-wallet.service';
import { CreditPackConfigService } from './credit-pack-config.service';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { CreditsMasterController } from './credits-master.controller';
import { MasterGuard } from '../auth/guards/master.guard';

// CRÉDITOS S1 (fundação) + S3-PARTE1 (catálogo de pacotes + endpoints master + /credits/me).
// Tudo atrás de HBX_CREDITS_ENABLED (default OFF): com a flag OFF os controllers respondem
// neutro/404 (ver credits.flags.ts) — o módulo nasce carregado mas INERTE. Ninguém no runtime
// de vendas chama o wallet ainda (débito nos fluxos reais é S2, fora do escopo deste sprint).
@Module({
  imports: [PrismaModule],
  controllers: [CreditsController, CreditsMasterController],
  providers: [CreditWalletService, CreditPackConfigService, CreditsService, MasterGuard],
  exports: [CreditWalletService, CreditPackConfigService, CreditsService],
})
export class CreditsModule {}
