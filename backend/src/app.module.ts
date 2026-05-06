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
import { PlansModule } from './plans/plans.module';
import { MessagingModule } from './messaging/messaging.module';
import { MailModule } from './mail/mail.module';
import { SupportModule } from './support/support.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { InboxModule } from './inbox/inbox.module';
import { GerencialModule } from './gerencial/gerencial.module';
import { ModulesAccessModule } from './modules/modules.module';
import { ImportacoesModule } from './importacoes/importacoes.module';
import { CadastrosModule } from './cadastros/cadastros.module';
import { WebsiteModule } from './website/website.module';
import { HbxRecoveryModule } from './hbx-recovery/hbx-recovery.module';
import { MasterContextModule } from './master-context/master-context.module';
import { WebscrapingModule } from './webscraping/webscraping.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { VendasModule } from './vendas/vendas.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { getBackendPublicRoot } from './public-assets';
import { AdminModule } from './admin/admin.module';
import { CommercialPlansModule } from './commercial-plans/commercial-plans.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';

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
    PrismaModule,
    MailModule,
    UsersModule,
    AuthModule,
    CompaniesModule,
    SupportModule,
    PlansModule,
    ProductsModule,
    CategoriesModule,
    MessagingModule,
    InboxModule,
    GerencialModule,
    ModulesAccessModule,
    ImportacoesModule,
    CadastrosModule,
    WebsiteModule,
    HbxRecoveryModule,
    MasterContextModule,
    WebscrapingModule,
    IntegrationsModule,
    VendasModule,
    FinanceiroModule,
    CommercialPlansModule,
    AiAssistantModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
