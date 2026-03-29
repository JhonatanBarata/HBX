import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerProfileService } from './customer-profile.service';

@Module({
  imports: [PrismaModule],
  providers: [CustomerProfileService],
  exports: [CustomerProfileService],
})
export class CustomerProfileModule {}