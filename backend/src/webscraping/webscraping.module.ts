import { forwardRef, Module } from '@nestjs/common';
import { ModulesAccessModule } from '../modules/modules.module';
import { VendasModule } from '../vendas/vendas.module';
import { WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

@Module({
  imports: [ModulesAccessModule, forwardRef(() => VendasModule)],
  controllers: [WebscrapingController],
  providers: [WebscrapingService],
  exports: [WebscrapingService],
})
export class WebscrapingModule {}
