import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Req() req: any, @Body() createDto: CreateProductDto) {
    return this.productsService.createProductForUser(req.user, createDto);
  }

  @Get()
  findAll(@Req() req: any, @Query('status') status?: string) {
    return this.productsService.listProductsForUser(req.user, { status });
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.productsService.getProductForUser(req.user, id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateProductDto) {
    return this.productsService.updateProductForUser(req.user, id, updateDto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.productsService.archiveProductForUser(req.user, id);
  }
}
