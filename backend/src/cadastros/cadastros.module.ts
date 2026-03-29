import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CadastrosController } from './cadastros.controller';
import { CadastrosService } from './cadastros.service';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';

@Module({
  imports: [PrismaModule, CustomerProfileModule],
  controllers: [CadastrosController],
  providers: [CadastrosService],
  exports: [CadastrosService],
})
export class CadastrosModule {}
