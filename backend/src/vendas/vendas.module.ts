import { Module } from '@nestjs/common';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

@Module({
  imports: [PrismaModule, CustomerProfileModule, ModulesAccessModule, MessagingModule],
  controllers: [VendasController],
  providers: [VendasService],
  exports: [VendasService],
})
export class VendasModule {}
