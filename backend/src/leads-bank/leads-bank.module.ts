import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadsBankController } from './leads-bank.controller';
import { LeadsBankService } from './leads-bank.service';

@Module({
  imports: [PrismaModule],
  controllers: [LeadsBankController],
  providers: [LeadsBankService],
  exports: [LeadsBankService],
})
export class LeadsBankModule {}
