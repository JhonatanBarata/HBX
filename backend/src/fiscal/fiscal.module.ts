import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContabilModule } from '../contabil/contabil.module';
import { MailModule } from '../mail/mail.module';
import { WebwhatsBridgeService } from '../messaging/webwhats-bridge.service';
import { NfseNationalClient, RealNfseTransport } from '../contabil/nfse-national.client';
import { FiscalController } from './fiscal.controller';
import { FiscalProfileService } from './fiscal-profile.service';
import { FiscalNfseService } from './fiscal-nfse.service';
import { FiscalEnvioService } from './fiscal-envio.service';
import { FiscalComprovanteEntregaService } from './fiscal-comprovante-entrega.service';
import { FiscalLiberacaoService } from './fiscal-liberacao.service';
import { FiscalMaloteService } from './fiscal-malote.service';
import { EstoqueService } from './estoque.service';
import { BalcaoService } from './balcao.service';

// FISCAL DO TENANT (PR04082026-FISCAL-TENANT F1a) — módulo do TENANT, irmão do
// financeiro-tenant. O contabil/ (robô do dono) fica INTOCADO: importamos o
// módulo p/ FiscalAutomationLogService (trilha compartilhada, exportado) e
// provemos NOSSA instância do NfseNationalClient (a classe é paramétrica e não
// é exportada lá; instância própria = zero mudança no contabil). O client nasce
// com transporte HTTP real, mas ele SÓ é exercido quando um tenant com perfil
// completo + cert no cofre + município na allowlist clica Emitir — o gate é o
// onboarding, não flag (lei: entregar LIGADO).
// F1b: MailModule dá o CompanyMailerService (transporte POR EMPRESA — ninguém
// pega carona no SMTP do Master); WebwhatsBridgeService entra como instância
// PRÓPRIA (só depende de Prisma @Global) — mesmo padrão do AuthModule, pra não
// importar o MessagingModule inteiro nem criar ciclo.
@Module({
  imports: [PrismaModule, ContabilModule, MailModule],
  controllers: [FiscalController],
  providers: [
    // Timeout de 15s (< teto do proxy do Next): o resultado da emissão — inclusive
    // ERRO com motivo — sempre chega de volta na tela em vez de virar 500 do proxy.
    { provide: NfseNationalClient, useFactory: () => new NfseNationalClient(new RealNfseTransport(15_000)) },
    WebwhatsBridgeService,
    FiscalProfileService,
    FiscalNfseService,
    FiscalEnvioService,
    FiscalComprovanteEntregaService,
    EstoqueService,
    BalcaoService,
    FiscalMaloteService,
    FiscalLiberacaoService,
  ],
  exports: [
    FiscalProfileService,
    FiscalNfseService,
    FiscalEnvioService,
    FiscalComprovanteEntregaService,
    EstoqueService,
  ],
})
export class FiscalModule {}
