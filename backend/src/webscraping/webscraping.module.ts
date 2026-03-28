import { Module } from '@nestjs/common';
import { ModulesAccessModule } from '../modules/modules.module';
import { WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

@Module({
  imports: [ModulesAccessModule],
  controllers: [WebscrapingController],
  providers: [WebscrapingService],
})
export class WebscrapingModule {}
