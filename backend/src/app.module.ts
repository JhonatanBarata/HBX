import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
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
import { TechAssistantModule } from './tech-assistant/tech-assistant.module';
import { MasterContextModule } from './master-context/master-context.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS || '60'),
        limit: Number(process.env.RATE_LIMIT_LIMIT || '120'),
      },
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
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
    TechAssistantModule,
    MasterContextModule,
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
