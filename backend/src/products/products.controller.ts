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
import { ImportProductsDto } from './dto/import-products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Req() req: any, @Body() createDto: CreateProductDto) {
    return this.productsService.createProductForUser(req.user, createDto);
  }

  /** Importação em massa de produtos (planilha). Enviado em lotes pelo front. */
  @Post('import')
  importProducts(@Req() req: any, @Body() dto: ImportProductsDto) {
    return this.productsService.importProductsForUser(req.user, dto.rows || []);
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
