import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NucleoCadastroService } from './nucleo-cadastro.service';
import { NucleoController } from './nucleo.controller';

/**
 * NÚCLEO-CRM — módulo da espinha de cadastro (Conta + Contato).
 *
 * N1 (04/07): NucleoCadastroService (métodos upsert idempotentes), exportado
 * pra N2/N3 consumirem.
 * N3 (04/07): NucleoController — janela "Empresas" (contas PJ), SÓ LEITURA,
 * company-scoped (JwtAuthGuard). Sem cron/boot, sem WhatsApp, sem escrita nova.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NucleoController],
  providers: [NucleoCadastroService],
  exports: [NucleoCadastroService],
})
export class NucleoModule {}
