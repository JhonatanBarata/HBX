import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlansModule } from '../plans/plans.module';
import { ProductVersionService } from './product-version.service';

@Module({
  imports: [PrismaModule, PlansModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductVersionService],
  exports: [ProductsService],
})
export class ProductsModule {}
