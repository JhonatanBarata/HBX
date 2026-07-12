import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditWalletService } from './credit-wallet.service';
import { CreditPackConfigService } from './credit-pack-config.service';
import { CreditActionConfigService } from './credit-action-config.service';
import { CreditMeterService } from './credit-meter.service';
import { CreditsService } from './credits.service';
import { IndicacaoService } from './indicacao.service';
import { CreditsController } from './credits.controller';
import { CreditsMasterController } from './credits-master.controller';
import { CreditsPublicController } from './credits-public.controller';
import { MasterGuard } from '../auth/guards/master.guard';

// CRÉDITOS S1 (fundação) + S3-PARTE1 (catálogo de pacotes + endpoints master + /credits/me).
// Tudo atrás de HBX_CREDITS_ENABLED (default OFF): com a flag OFF os controllers respondem
// neutro/404 (ver credits.flags.ts) — o módulo nasce carregado mas INERTE. Ninguém no runtime
// de vendas chama o wallet ainda (débito nos fluxos reais é S2, fora do escopo deste sprint).
// CRÉDITO UNIVERSAL (PR10072026): CreditMeterService = medidor genérico por ação (track-first);
// no boot ele se registra como listener de uso do AiGatewayService (medição de IA).
// S5 INDICAÇÃO: IndicacaoService (programa "indique e ganhe", HBX_INDICACAO_ENABLED default
// OFF) — exportado pro signup (AuthModule) e pro hook de recarga aprovada (FinanceiroModule).
@Module({
  imports: [PrismaModule],
  controllers: [CreditsController, CreditsMasterController, CreditsPublicController],
  providers: [CreditWalletService, CreditPackConfigService, CreditActionConfigService, CreditsService, CreditMeterService, IndicacaoService, MasterGuard],
  exports: [CreditWalletService, CreditPackConfigService, CreditActionConfigService, CreditsService, CreditMeterService, IndicacaoService],
})
export class CreditsModule {}
