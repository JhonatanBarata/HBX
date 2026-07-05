import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import type { ImportProductRowDto } from './dto/import-products.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductVersionService } from './product-version.service';
import { hasTeamAccess } from '../team/team-access-catalog';
import { resolveProductsAccessContext, type ProductsAccessContext } from '../team/team-access-runtime';

type ProductListOptions = {
  status?: string | null;
};

type ProductMutationDto = CreateProductDto | UpdateProductDto;

function hasOwn(value: unknown, key: string) {
  // E3 (PLAN12062026001): o ValidationPipe materializa campos opcionais do
  // DTO como propriedade própria `undefined` — presença exige valor real,
  // senão `priceCents: undefined` engole o `price` enviado (produto nascia
  // com preço 0) e dispara asserts de permissão sem mutação de verdade.
  return Boolean(
    value &&
    Object.prototype.hasOwnProperty.call(value, key) &&
    (value as Record<string, unknown>)[key] !== undefined,
  );
}

function normalizeText(value: unknown, max = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeKey(value: unknown, fallback: string, max = 80) {
  const text = normalizeText(value, max);
  return text ? text.toLowerCase() : fallback;
}

function normalizeUpperKey(value: unknown, fallback: string | null, max = 20) {
  const text = normalizeText(value, max);
  return text ? text.toUpperCase() : fallback;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'sim'].includes(normalized)) return true;
    if (['false', '0', 'no', 'nao'].includes(normalized)) return false;
  }
  return Boolean(value);
}

function normalizeInteger(value: unknown, field: string, fallback?: number | null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${field} invalido.`);
  return parsed;
}

function normalizePositiveInteger(value: unknown, field: string, fallback?: number | null) {
  const parsed = normalizeInteger(value, field, fallback);
  if (parsed === null || parsed === undefined) return parsed;
  if (parsed < 0) throw new BadRequestException(`${field} nao pode ser negativo.`);
  return parsed;
}

function normalizeNumber(value: unknown, field: string, fallback?: number | null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new BadRequestException(`${field} invalido.`);
  return parsed;
}

function normalizePositiveNumber(value: unknown, field: string, fallback?: number | null) {
  const parsed = normalizeNumber(value, field, fallback);
  if (parsed === null || parsed === undefined) return parsed;
  if (parsed < 0) throw new BadRequestException(`${field} nao pode ser negativo.`);
  return parsed;
}

function normalizePercent(value: unknown, field: string, fallback?: number | null) {
  const parsed = normalizePositiveNumber(value, field, fallback);
  if (parsed === null || parsed === undefined) return parsed;
  if (parsed > 100) throw new BadRequestException(`${field} nao pode passar de 100%.`);
  return parsed;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly pv: ProductVersionService) {}

  private async assertWritable(companyId: number, id: number) {
    const prod = await this.prisma.product.findUnique({ where: { id } });
    if (!prod) throw new NotFoundException(`Product with id ${id} not found`);
    if (prod.companyId !== companyId) throw new ForbiddenException('Cannot modify product from a different company');
    return prod;
  }

  private async resolveAccess(user: any) {
    return resolveProductsAccessContext(this.prisma, user);
  }

  private assertCanView(access: ProductsAccessContext) {
    if (!access.canViewProducts) {
      throw new ForbiddenException('Acesso ao catalogo de produtos bloqueado pela politica da equipe.');
    }
  }

  private assertCanEdit(access: ProductsAccessContext) {
    if (!access.canEditProducts) {
      throw new ForbiddenException('Edicao de produtos bloqueada pela politica da equipe.');
    }
  }

  private assertMutationPermissions(access: ProductsAccessContext, dto: ProductMutationDto) {
    this.assertCanEdit(access);

    if (this.hasPriceMutation(dto) && !access.canChangeProductPrice) {
      throw new ForbiddenException('Alteracao de preco bloqueada pela politica da equipe.');
    }
    if (this.hasDiscountMutation(dto) && !access.canApplyProductDiscount) {
      throw new ForbiddenException('Configuracao de desconto bloqueada pela politica da equipe.');
    }
    if (hasOwn(dto, 'defaultCommissionPercent') && !hasTeamAccess(access.accessMap, 'commission.editPercent')) {
      throw new ForbiddenException('Alteracao de comissao bloqueada pela politica da equipe.');
    }
  }

  private hasPriceMutation(dto: ProductMutationDto) {
    return hasOwn(dto, 'price') || hasOwn(dto, 'priceCents') || hasOwn(dto, 'minPriceCents');
  }

  private hasDiscountMutation(dto: ProductMutationDto) {
    return hasOwn(dto, 'allowDiscount') || hasOwn(dto, 'maxDiscountPercent') || hasOwn(dto, 'minPriceCents');
  }

  private normalizePriceCents(dto: ProductMutationDto, fallback?: number | null) {
    if (hasOwn(dto, 'priceCents')) {
      return normalizePositiveInteger((dto as any).priceCents, 'priceCents', fallback);
    }
    if (hasOwn(dto, 'price')) {
      const price = normalizePositiveNumber((dto as any).price, 'price', fallback === undefined ? undefined : fallback / 100);
      return price === null || price === undefined ? fallback : Math.round(price * 100);
    }
    return fallback;
  }

  private buildCreateData(companyId: number, dto: CreateProductDto, authorId?: number | null) {
    const name = normalizeText(dto.name, 140);
    if (!name) throw new BadRequestException('Nome do produto e obrigatorio.');

    const priceCents = this.normalizePriceCents(dto, 0) ?? 0;
    const createdByUserId = authorId || null;

    return {
      kind: normalizeKey(dto.kind, 'tenant_product', 40),
      status: normalizeKey(dto.status, 'active', 40),
      sku: normalizeText(dto.sku, 80),
      name,
      description: normalizeText(dto.description, 1000),
      category: normalizeText(dto.category, 120),
      price: priceCents / 100,
      priceCents,
      currency: normalizeUpperKey(dto.currency, 'BRL', 12) || 'BRL',
      billingCycle: normalizeUpperKey(dto.billingCycle, null, 30),
      saleMode: normalizeKey(dto.saleMode, 'internal', 40),
      planKey: normalizeText(dto.planKey, 80),
      externalUrl: normalizeText(dto.externalUrl, 500),
      allowDiscount: normalizeBoolean(dto.allowDiscount, false),
      maxDiscountPercent: normalizePercent(dto.maxDiscountPercent, 'maxDiscountPercent', null),
      minPriceCents: normalizePositiveInteger(dto.minPriceCents, 'minPriceCents', null),
      defaultCommissionPercent: normalizePercent(dto.defaultCommissionPercent, 'defaultCommissionPercent', null),
      sortOrder: normalizeInteger(dto.sortOrder, 'sortOrder', 0) ?? 0,
      stock: normalizePositiveInteger(dto.stock, 'stock', 0) ?? 0,
      // NÚCLEO-CRM N5 — catálogo do tenant: unidade de venda + flag Logística.
      unidade: normalizeText(dto.unidade, 60),
      usaLogistica: normalizeBoolean(dto.usaLogistica, false),
      companyId,
      categoryId: normalizePositiveInteger(dto.categoryId, 'categoryId', null),
      metadataJson: normalizeText(dto.metadataJson, 5000),
      createdByUserId,
      updatedByUserId: createdByUserId,
    };
  }

  private buildUpdateData(dto: UpdateProductDto, authorId?: number | null) {
    const data: Record<string, any> = {};

    if (hasOwn(dto, 'kind')) data.kind = normalizeKey(dto.kind, 'tenant_product', 40);
    if (hasOwn(dto, 'status')) data.status = normalizeKey(dto.status, 'active', 40);
    if (hasOwn(dto, 'sku')) data.sku = normalizeText(dto.sku, 80);
    if (hasOwn(dto, 'name')) {
      const name = normalizeText(dto.name, 140);
      if (!name) throw new BadRequestException('Nome do produto e obrigatorio.');
      data.name = name;
    }
    if (hasOwn(dto, 'description')) data.description = normalizeText(dto.description, 1000);
    if (hasOwn(dto, 'category')) data.category = normalizeText(dto.category, 120);

    const priceCents = this.normalizePriceCents(dto, undefined);
    if (priceCents !== undefined) {
      data.priceCents = priceCents;
      data.price = priceCents / 100;
    }

    if (hasOwn(dto, 'currency')) data.currency = normalizeUpperKey(dto.currency, 'BRL', 12) || 'BRL';
    if (hasOwn(dto, 'billingCycle')) data.billingCycle = normalizeUpperKey(dto.billingCycle, null, 30);
    if (hasOwn(dto, 'saleMode')) data.saleMode = normalizeKey(dto.saleMode, 'internal', 40);
    if (hasOwn(dto, 'planKey')) data.planKey = normalizeText(dto.planKey, 80);
    if (hasOwn(dto, 'externalUrl')) data.externalUrl = normalizeText(dto.externalUrl, 500);
    if (hasOwn(dto, 'allowDiscount')) data.allowDiscount = normalizeBoolean(dto.allowDiscount, false);
    if (hasOwn(dto, 'maxDiscountPercent')) {
      data.maxDiscountPercent = normalizePercent(dto.maxDiscountPercent, 'maxDiscountPercent', null);
    }
    if (hasOwn(dto, 'minPriceCents')) {
      data.minPriceCents = normalizePositiveInteger(dto.minPriceCents, 'minPriceCents', null);
    }
    if (hasOwn(dto, 'defaultCommissionPercent')) {
      data.defaultCommissionPercent = normalizePercent(dto.defaultCommissionPercent, 'defaultCommissionPercent', null);
    }
    if (hasOwn(dto, 'sortOrder')) data.sortOrder = normalizeInteger(dto.sortOrder, 'sortOrder', 0) ?? 0;
    if (hasOwn(dto, 'stock')) data.stock = normalizePositiveInteger(dto.stock, 'stock', 0) ?? 0;
    // NÚCLEO-CRM N5 — catálogo do tenant: unidade de venda + flag Logística.
    if (hasOwn(dto, 'unidade')) data.unidade = normalizeText(dto.unidade, 60);
    if (hasOwn(dto, 'usaLogistica')) data.usaLogistica = normalizeBoolean(dto.usaLogistica, false);
    if (hasOwn(dto, 'categoryId')) data.categoryId = normalizePositiveInteger(dto.categoryId, 'categoryId', null);
    if (hasOwn(dto, 'metadataJson')) data.metadataJson = normalizeText(dto.metadataJson, 5000);
    data.updatedByUserId = authorId || null;

    return data;
  }

  private presentProduct(product: any, access: ProductsAccessContext) {
    const output = { ...product };
    if (!access.canViewProductPrice) {
      output.price = null;
      output.priceCents = null;
      output.minPriceCents = null;
    }
    return output;
  }

  async listProductsForUser(user: any, options: ProductListOptions = {}) {
    const access = await this.resolveAccess(user);
    this.assertCanView(access);

    const status = normalizeText(options.status, 40);
    const rows = await this.prisma.product.findMany({
      where: {
        companyId: access.companyId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return rows.map((product) => this.presentProduct(product, access));
  }

  async getProductForUser(user: any, id: number) {
    const access = await this.resolveAccess(user);
    this.assertCanView(access);

    const product = await this.prisma.product.findFirst({ where: { id, companyId: access.companyId } });
    if (!product) throw new NotFoundException(`Product with id ${id} not found`);
    return this.presentProduct(product, access);
  }

  async createProductForUser(user: any, createDto: CreateProductDto) {
    const access = await this.resolveAccess(user);
    this.assertMutationPermissions(access, createDto);

    const data = this.buildCreateData(access.companyId, createDto, access.userId);
    const product = await this.prisma.product.create({ data });
    return this.presentProduct(product, access);
  }

  /**
   * IMPORTAÇÃO EM MASSA de produtos (planilha). Resolve o acesso UMA vez, valida cada
   * linha reusando `buildCreateData` (mesma normalização do cadastro manual) e insere
   * em lote com `createMany`. Linha sem nome é PULADA; linha inválida (ex.: preço
   * negativo) vira `errors` e a batelada segue. Se qualquer linha traz preço e a
   * política da equipe não deixa mexer em preço → 403 (mesmo veredito do create único).
   */
  async importProductsForUser(user: any, rows: ImportProductRowDto[]) {
    const access = await this.resolveAccess(user);
    this.assertCanEdit(access);

    const list = Array.isArray(rows) ? rows : [];
    const anyPrice = list.some((r) => r?.price != null && Number(r.price) > 0);
    if (anyPrice && !access.canChangeProductPrice) {
      throw new ForbiddenException('Alteracao de preco bloqueada pela politica da equipe.');
    }

    const result = {
      total: list.length,
      imported: 0,
      skipped: 0,
      errors: [] as { line: number; name: string; message: string }[],
    };

    const data: any[] = [];
    list.forEach((row, index) => {
      const name = normalizeText(row?.name, 140);
      if (!name) {
        result.skipped++;
        return;
      }
      try {
        data.push(
          this.buildCreateData(
            access.companyId,
            {
              name,
              price: row?.price,
              unidade: row?.unidade,
              usaLogistica: row?.usaLogistica,
              sku: row?.sku,
              description: row?.description,
            } as CreateProductDto,
            access.userId,
          ),
        );
      } catch (error: any) {
        result.errors.push({
          line: index + 1,
          name,
          message: String(error?.message || error || 'linha invalida'),
        });
      }
    });

    if (data.length) {
      await this.prisma.product.createMany({ data });
      result.imported = data.length;
    }
    return result;
  }

  async updateProductForUser(user: any, id: number, updateDto: UpdateProductDto) {
    const access = await this.resolveAccess(user);
    this.assertMutationPermissions(access, updateDto);

    const product = await this.assertWritable(access.companyId, id);
    await this.pv.createVersion(id, product, access.userId);

    const updated = await this.prisma.product.update({
      where: { id },
      data: this.buildUpdateData(updateDto, access.userId),
    });
    return this.presentProduct(updated, access);
  }

  async archiveProductForUser(user: any, id: number) {
    const access = await this.resolveAccess(user);
    this.assertCanEdit(access);

    const product = await this.assertWritable(access.companyId, id);
    await this.pv.createVersion(id, product, access.userId);
    await this.prisma.product.update({
      where: { id },
      data: {
        status: 'archived',
        updatedByUserId: access.userId,
      },
    });
    return { success: true };
  }

  async resolveSellableProductForUser(user: any, id: number) {
    const access = await this.resolveAccess(user);
    if (!access.canSellProducts) {
      throw new ForbiddenException('Venda de produtos bloqueada pela politica da equipe.');
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id,
        companyId: access.companyId,
        status: 'active',
      },
    });
    if (!product) throw new NotFoundException(`Product with id ${id} not found`);
    return product;
  }

}
