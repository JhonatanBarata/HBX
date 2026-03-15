import { Body, Controller, Delete, Param, ParseIntPipe, Post, UseGuards, Get, Patch } from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Admin } from '../auth/admin.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MasterGuard } from '../auth/guards/master.guard';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.plansService.createPlan(dto);
  }

  @Post('seed')
  @UseGuards(JwtAuthGuard, MasterGuard)
  seed() {
    return this.plansService.createDefaultPlans();
  }

  @Post('seed-full')
  @UseGuards(JwtAuthGuard, MasterGuard)
  async seedFull(@Body() dto: import('./dto/seed-full.dto').SeedFullDto) {
    return this.plansService.createFullSeed(dto as any);
  }

  @Get()
  list() {
    return this.plansService.listPlans();
  }

  @Post(':planId/features')
  @UseGuards(JwtAuthGuard)
  addFeature(@Param('planId', ParseIntPipe) planId: number, @Body() dto: CreateFeatureDto) {
    return this.plansService.addFeature(planId, dto);
  }

  @Patch('features/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  updateFeature(@Param('id', ParseIntPipe) id: number, @Body() dto: import('./dto/create-feature.dto').UpdateFeatureDto) {
    return this.plansService.updateFeature(id, dto as any);
  }

  @Delete(':planId/features/:featureId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  disconnectFeature(@Param('planId', ParseIntPipe) planId: number, @Param('featureId', ParseIntPipe) featureId: number) {
    return this.plansService.disconnectFeature(planId, featureId);
  }

  @Delete('features/id/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  deleteFeatureById(@Param('id', ParseIntPipe) id: number) {
    return this.plansService.deleteFeatureById(id);
  }

  @Delete('features/:key')
  @UseGuards(JwtAuthGuard)
  removeFeature(@Param('key') key: string) {
    return this.plansService.removeFeature(key);
  }

  @Get(':planId/features')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  featuresByPlan(@Param('planId', ParseIntPipe) planId: number) {
    return this.plansService.featuresByPlan(planId);
  }

  @Get('features')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Admin()
  allPlansWithFeatures() {
    return this.plansService.allPlansWithFullFeatures();
  }
}
