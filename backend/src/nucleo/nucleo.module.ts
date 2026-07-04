import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NucleoCadastroService } from './nucleo-cadastro.service';

/**
 * NÚCLEO-CRM N1 (04/07) — módulo da espinha de cadastro (Conta + Contato).
 *
 * INERTE nesta sprint: registra APENAS o NucleoCadastroService (métodos upsert
 * idempotentes) e o exporta pra N2/N3 consumirem. SEM controllers, SEM endpoints,
 * SEM cron/boot, SEM disparo de WhatsApp. Registrado no AppModule só pra ficar
 * disponível na injeção — não muda nenhum comportamento existente.
 */
@Module({
  imports: [PrismaModule],
  providers: [NucleoCadastroService],
  exports: [NucleoCadastroService],
})
export class NucleoModule {}
