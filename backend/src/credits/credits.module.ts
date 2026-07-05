import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditWalletService } from './credit-wallet.service';

/**
 * CRÉDITOS S1 (05/07 — docs/PLANEJAMENTOS/CREDITOS). Só a fundação da carteira
 * pré-paga (schema + saldo atômico). Exporta o CreditWalletService para o S2
 * (débito no puxar lead) e S3 (recarga MP / concessão master) plugarem depois.
 * Nasce inerte: nada no runtime de vendas o consome ainda.
 */
@Module({
  imports: [PrismaModule],
  providers: [CreditWalletService],
  exports: [CreditWalletService],
})
export class CreditsModule {}
