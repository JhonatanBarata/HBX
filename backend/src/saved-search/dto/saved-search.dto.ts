import { Transform } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Chaves de filtro do Radar que uma pesquisa salva pode guardar. Subset de
// RadarFiltersInput (backend/src/webscraping/radar/shared/radar-core-shared.ts):
// so os campos que a tela do Radar realmente monta. O resto e ignorado no salvar
// (sanitizado no service) para o filtroJson nao virar deposito de lixo.
export const SAVED_SEARCH_FILTER_KEYS = [
  'city',
  'state',
  'segment',
  'radiusKm',
  'alcance',
  'quantos',
  'targetType',
  'ddd',
  'scoreRange',
  'source',
  'opportunityLevel',
  'minRating',
  'minReviews',
  'noWebsite',
  'withWebsite',
  'weakWebsite',
  'validPhone',
  'likelyWhatsapp',
  'highOpportunity',
  'preferredChannels',
  'requiredChannels',
  'channelMatchMode',
] as const;

export class CreateSavedSearchDto {
  @IsString()
  @MaxLength(120)
  nome!: string;

  // Recorte de filtros do Radar. Objeto livre; o service sanitiza pelas chaves
  // conhecidas antes de persistir.
  @IsObject()
  filtro!: Record<string, unknown>;

  // Vendedor "dono do recorte" (opcional). So admin/gerente pode atribuir; o
  // service valida que o id e um vendedor da empresa.
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  assignedSellerId?: number | null;
}

export class UpdateSavedSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsObject()
  filtro?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? null : Number(value)))
  @IsInt()
  @Min(1)
  assignedSellerId?: number | null;
}
