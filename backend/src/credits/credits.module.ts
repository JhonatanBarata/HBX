import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditWalletService } from './credit-wallet.service';

// CRÉDITOS S1 (docs/PLANEJAMENTOS/CREDITOS/S1-SPEC.md) — módulo nasce inerte: sem controller,
// sem enforcement, atrás de HBX_CREDITS_ENABLED (default OFF). Ninguém no runtime de vendas
// chama o service ainda (débito nos fluxos reais é S2/S3, fora do escopo deste sprint).
@Module({
  imports: [PrismaModule],
  providers: [CreditWalletService],
  exports: [CreditWalletService],
})
export class CreditsModule {}
