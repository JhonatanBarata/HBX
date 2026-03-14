import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Feature } from '../plans/feature.decorator';
import { FeatureGuard } from '../plans/feature.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Feature('product_create')
  create(@Req() req: any, @Body() createDto: CreateProductDto) {
    const userCompanyId = Number(req.user?.companyId);
    if (!Number.isFinite(userCompanyId) || userCompanyId <= 0) {
      throw new ForbiddenException('User is not associated with a company');
    }
    return this.productsService.createForCompany(userCompanyId, createDto);
  }

  @Get()
  findAll(@Req() req: any) {
    const userCompanyId = Number(req.user?.companyId);
    if (!Number.isFinite(userCompanyId) || userCompanyId <= 0) {
      throw new ForbiddenException('User is not associated with a company');
    }
    return this.productsService.findAllForCompany(userCompanyId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userCompanyId = Number(req.user?.companyId);
    if (!Number.isFinite(userCompanyId) || userCompanyId <= 0) {
      throw new ForbiddenException('User is not associated with a company');
    }
    return this.productsService.findOneForCompany(userCompanyId, id);
  }

  @Patch(':id')
  @UseGuards(FeatureGuard)
  @Feature('product_edit')
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateProductDto) {
    const userCompanyId = Number(req.user?.companyId);
    if (!Number.isFinite(userCompanyId) || userCompanyId <= 0) {
      throw new ForbiddenException('User is not associated with a company');
    }
    return this.productsService.updateForCompany(userCompanyId, id, updateDto, req.user?.id);
  }

  @Delete(':id')
  @UseGuards(FeatureGuard)
  @Feature('product_edit')
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userCompanyId = Number(req.user?.companyId);
    if (!Number.isFinite(userCompanyId) || userCompanyId <= 0) {
      throw new ForbiddenException('User is not associated with a company');
    }
    this.productsService.removeForCompany(userCompanyId, id);
    return { success: true };
  }
}
