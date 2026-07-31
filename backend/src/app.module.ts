import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/product.module';
import { CategoriesModule } from './categories/categories.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { MessagingModule } from './messaging/messaging.module';
import { MailModule } from './mail/mail.module';
import { SupportModule } from './support/support.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextInterceptor } from './prisma/tenant-context.interceptor';
import { InboxModule } from './inbox/inbox.module';
import { GerencialModule } from './gerencial/gerencial.module';
import { ModulesAccessModule } from './modules/modules.module';
import { CadastrosModule } from './cadastros/cadastros.module';
import { WebsiteModule } from './website/website.module';
import { HbxRecoveryModule } from './hbx-recovery/hbx-recovery.module';
import { MasterContextModule } from './master-context/master-context.module';
import { ContabilModule } from './contabil/contabil.module';
import { WebscrapingModule } from './webscraping/webscraping.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { VendasModule } from './vendas/vendas.module';
import { AtividadesModule } from './atividades/atividades.module';
import { SavedSearchModule } from './saved-search/saved-search.module';
import { CadenciaModule } from './cadencia/cadencia.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { getBackendPublicRoot } from './public-assets';
import { AdminModule } from './admin/admin.module';
import { CommercialPlansModule } from './commercial-plans/commercial-plans.module';
import { PulseModule } from './pulse/pulse.module';
import { OwnerModule } from './owner/owner.module';
import { TeamModule } from './team/team.module';
import { MasterProvisioningModule } from './master-provisioning/master-provisioning.module';
import { TenantCommunicationModule } from './tenant-communication/tenant-communication.module';
import { NightFactoryModule } from './night-factory/night-factory.module';
import { MetaLeadAdsModule } from './meta-lead-ads/meta-lead-ads.module';
import { BotModule } from './bot/bot.module';
import { AssistenteModule } from './assistente/assistente.module';
import { ConciergeModule } from './concierge/concierge.module';
import { LeadEmailModule } from './lead-email/lead-email.module';
import { MasterCockpitModule } from './master-cockpit/master-cockpit.module';
import { WebsiteLeadCaptureModule } from './website-lead-capture/website-lead-capture.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { NucleoModule } from './nucleo/nucleo.module';
import { LogisticaModule } from './logistica/logistica.module';
import { CreditsModule } from './credits/credits.module';
import { UploadsModule } from './uploads/uploads.module';
import { TutorialMediaModule } from './tutorial-media/tutorial-media.module';
import { FinanceiroTenantModule } from './financeiro-tenant/financeiro-tenant.module';
import { AutomationModule } from './automation/automation.module';
import { PainelModuloModule } from './painel-modulo/painel-modulo.module';
import { ComexModule } from './comex/comex.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS || '60'),
        limit: Number(process.env.RATE_LIMIT_LIMIT || '120'),
      },
    ]),
    ServeStaticModule.forRoot({
      rootPath: getBackendPublicRoot(),
      serveRoot: '/',
    }),
    // P1.3: mídia do inbox saiu do public — GET /uploads/inbox/:filename com URL assinada.
    // Rota de controller entra no router ANTES do middleware do serve-static (que só
    // registra no onModuleInit), então ela intercepta /uploads/inbox/* mesmo com o
    // estático servindo a raiz.
    UploadsModule,
    PrismaModule,
    MailModule,
    UsersModule,
    AuthModule,
    CompaniesModule,
    SupportModule,
    ProductsModule,
    CategoriesModule,
    MessagingModule,
    InboxModule,
    GerencialModule,
    ModulesAccessModule,
    CadastrosModule,
    WebsiteModule,
    HbxRecoveryModule,
    MasterContextModule,
    ContabilModule,
    WebscrapingModule,
    IntegrationsModule,
    VendasModule,
    AtividadesModule,
    SavedSearchModule,
    CadenciaModule,
    FinanceiroModule,
    CommercialPlansModule,
    PulseModule,
    OwnerModule,
    TeamModule,
    MasterProvisioningModule,
    TenantCommunicationModule,
    NightFactoryModule,
    MetaLeadAdsModule,
    BotModule,
    AssistenteModule,
    ConciergeModule,
    LeadEmailModule,
    AdminModule,
    MasterCockpitModule,
    WebsiteLeadCaptureModule,
    RelatoriosModule,
    NucleoModule,
    LogisticaModule,
    CreditsModule,
    FinanceiroTenantModule,
    TutorialMediaModule,
    AutomationModule,
    PainelModuloModule,
    ComexModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Abre o escopo de tenant (AsyncLocalStorage) por request pra trava do Prisma
    // (multi-tenancy Sprint 1). Global: cobre todo controller.
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule {}
