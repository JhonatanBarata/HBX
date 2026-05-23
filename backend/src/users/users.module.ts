import { Module, forwardRef } from '@nestjs/common';
import { MasterContextModule } from '../master-context/master-context.module';
import { ModulesAccessModule } from '../modules/modules.module';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';

@Module({
  imports: [PrismaModule, MasterContextModule, forwardRef(() => ModulesAccessModule)],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
