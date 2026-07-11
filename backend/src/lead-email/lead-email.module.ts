import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadEmailController } from './lead-email.controller';
import { LeadEmailService } from './lead-email.service';

// LEADS-FINAL/06 — E-MAIL v1. Módulo isolado: conta SMTP do usuário + envio da
// timeline do lead. NÃO importa o MailModule (aquilo é o SMTP POR EMPRESA do
// cadastro/onboarding); aqui é a conta PESSOAL do vendedor pra prospecção.
// Sobe SEM o secret de cifra (feature OFF graciosa) e COM ele (ON) — a decisão
// vive no service (emailCredConfigured), nunca no boot.
@Module({
  imports: [PrismaModule],
  controllers: [LeadEmailController],
  providers: [LeadEmailService],
  exports: [LeadEmailService],
})
export class LeadEmailModule {}
