import { ConfigService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { PrismaClient } from '@prisma/client';

export class Query<T> {
  where?: T;
  sort?: 'asc' | 'desc';
  page?: number;
  offset?: number;
  take?: number;
  skip?: number;
  limit?: number;
  cursor?: string;
  search?: string;
}

type PaginationDefaults = {
  take?: number;
  maxTake?: number;
  maxSkip?: number;
};

export type NormalizedPagination = {
  take: number;
  skip: number;
  limit: number;
  page?: number;
  offset?: number;
  cursor?: string;
  search?: string;
};

const DEFAULT_TAKE = 50;
const DEFAULT_MAX_TAKE = 100;
const DEFAULT_MAX_SKIP = 5000;

function toPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function toNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

export function normalizePagination<T>(
  query: Query<T> | null | undefined,
  defaults: PaginationDefaults = {},
): NormalizedPagination {
  const maxTake = toPositiveInteger(defaults.maxTake) || DEFAULT_MAX_TAKE;
  const maxSkip = toNonNegativeInteger(defaults.maxSkip) ?? DEFAULT_MAX_SKIP;
  const defaultTake = clamp(toPositiveInteger(defaults.take) || DEFAULT_TAKE, 1, maxTake);

  const legacyOffset = toPositiveInteger(query?.offset);
  const legacyPage = toPositiveInteger(query?.page);
  const takeCandidate =
    toPositiveInteger(query?.take) || toPositiveInteger(query?.limit) || legacyOffset || defaultTake;
  const skipCandidate =
    toNonNegativeInteger(query?.skip) ??
    (legacyOffset && legacyPage ? legacyOffset * (Math.max(legacyPage, 1) - 1) : 0);

  return {
    take: clamp(takeCandidate, 1, maxTake),
    skip: clamp(skipCandidate, 0, maxSkip),
    limit: clamp(takeCandidate, 1, maxTake),
    page: legacyPage || undefined,
    offset: legacyOffset || undefined,
    cursor: normalizeText(query?.cursor),
    search: normalizeText(query?.search),
  };
}

export class PrismaRepository extends PrismaClient {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  private readonly logger = new Logger('PrismaRepository');

  public async onModuleInit() {
    await this.$connect();
    this.logger.info('Repository:Prisma - ON');
  }

  public async onModuleDestroy() {
    await this.$disconnect();
    this.logger.warn('Repository:Prisma - OFF');
  }
}
