import { Module } from '@nestjs/common';
import { MasterContextModule } from '../master-context/master-context.module';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';

@Module({
  imports: [PrismaModule, MasterContextModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
