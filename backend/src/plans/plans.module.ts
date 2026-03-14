import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureGuard } from './feature.guard';

@Module({
  imports: [PrismaModule],
  providers: [PlansService, FeatureGuard],
  controllers: [PlansController],
  exports: [PlansService, FeatureGuard],
})
export class PlansModule {}
