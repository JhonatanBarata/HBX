import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CadastrosService } from './cadastros.service';
import {
  CreateCadastroClienteDto,
  CreateCustomerProfileDto,
  CreateFornecedorDto,
  CreatePaisDto,
  CreatePortoDto,
  UpdateCadastroClienteDto,
  UpdateCustomerProfileDto,
  UpsertTransitTimeDto,
} from './dto/cadastros.dto';

@Controller('cadastros')
@UseGuards(JwtAuthGuard)
export class CadastrosController {
  constructor(private readonly service: CadastrosService) {}

  @Get('options')
  getOptions(@Req() req: any) {
    return this.service.getOptions(req.user);
  }

  @Get('customers')
  listCustomers(@Req() req: any, @Query('phone') phone?: string) {
    return this.service.listCustomerRegistryByUser(req.user, phone);
  }

  @Post('customers')
  createCustomer(@Req() req: any, @Body() dto: CreateCadastroClienteDto) {
    return this.service.createCustomerRegistryByUser(req.user, dto);
  }

  @Patch('customers/:id')
  updateCustomer(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCadastroClienteDto) {
    return this.service.updateCustomerRegistryByUser(req.user, id, dto);
  }

  @Get('customer-profiles')
  listCustomerProfiles(
    @Req() req: any,
    @Query('phone') phone?: string,
    @Query('document') document?: string,
  ) {
    return this.service.listCustomerProfilesByUser(req.user, { phone, document });
  }

  @Post('customer-profiles')
  createCustomerProfile(@Req() req: any, @Body() dto: CreateCustomerProfileDto) {
    return this.service.createCustomerProfileByUser(req.user, dto);
  }

  @Patch('customer-profiles/:id')
  updateCustomerProfile(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCustomerProfileDto) {
    return this.service.updateCustomerProfileByUser(req.user, id, dto);
  }

  @Get('customer-profiles/by-phone')
  getCustomerProfileByPhone(@Req() req: any, @Query('phone') phone: string) {
    return this.service.getCustomerProfileByPhone(req.user, phone);
  }

  @Get('customer-profiles/by-document')
  getCustomerProfileByDocument(@Req() req: any, @Query('document') document: string) {
    return this.service.getCustomerProfileByDocument(req.user, document);
  }

  @Post('fornecedores')
  createFornecedor(@Req() req: any, @Body() dto: CreateFornecedorDto) {
    return this.service.createFornecedor(req.user, dto);
  }

  @Post('paises')
  createPais(@Req() req: any, @Body() dto: CreatePaisDto) {
    return this.service.createPais(req.user, dto);
  }

  @Post('portos')
  createPorto(@Req() req: any, @Body() dto: CreatePortoDto) {
    return this.service.createPorto(req.user, dto);
  }

  @Post('transit-times')
  upsertTransitTime(@Req() req: any, @Body() dto: UpsertTransitTimeDto) {
    return this.service.upsertTransitTime(req.user, dto);
  }

  @Get('transit-times/resolve')
  resolveTransitTime(
    @Req() req: any,
    @Query('portoOrigemId', ParseIntPipe) portoOrigemId: number,
    @Query('portoDestinoId', ParseIntPipe) portoDestinoId: number,
  ) {
    return this.service.resolveTransitTime(req.user, portoOrigemId, portoDestinoId);
  }
}
