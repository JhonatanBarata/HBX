import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOrNull, resolveValorUnit } from './logistica-recorrencia.service';
import { resolvePrincipalContatoId } from './logistica-contato.util';

/**
 * PR18072026 W1 — CRUD de "rota-modelo" (roteiro salvo): nome + dia da semana
 * opcional + paradas em ordem (cliente + local opcional). Company-scoped,
 * fail-closed (id de outra empresa → null, o controller vira 404).
 *
 * Aplicar o modelo é 100% CLIENT-SIDE: o app lê `paradas` e monta o
 * `ordemManual` que manda pro planejar/iniciar — não existe endpoint
 * "aplicar" aqui (contrato do 00-ORQUESTRACAO.md).
 *
 * PR20072026 W1 — nome ÚNICO por empresa (case-insensitive/trim, SEM constraint
 * no banco — dados legados podem ter duplicata). `assertNomeUnico` é exportado
 * para o finalizar de logistica-leitura.service.ts reusar a MESMA regra dentro
 * da própria transação (aceita `tx` do Prisma).
 */
export const ROTA_NOME_DUPLICADO_CODE = 'ROTA_NOME_DUPLICADO';
export const ROTA_NOME_DUPLICADO_MESSAGE = 'Já existe uma rota com esse nome.';

type RotaModeloClient = Pick<PrismaService, 'logisticaRotaModelo'> | { logisticaRotaModelo: any };

export async function assertNomeUnico(
  client: RotaModeloClient,
  companyId: number,
  nome: string,
  excludeId?: string,
): Promise<void> {
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return;
  const existing = await (client as any).logisticaRotaModelo.findFirst({
    where: { companyId, nome: { equals: nome.trim(), mode: 'insensitive' } },
    select: { id: true, nome: true },
  });
  if (existing && existing.id !== excludeId && String(existing.nome ?? '').trim().toLowerCase() === alvo) {
    throw new ConflictException({
      statusCode: 409,
      code: ROTA_NOME_DUPLICADO_CODE,
      message: ROTA_NOME_DUPLICADO_MESSAGE,
    });
  }
}

@Injectable()
export class LogisticaRotaModeloService {
  private readonly logger = new Logger(LogisticaRotaModeloService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: number): Promise<RotaModeloDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const rows = await this.prisma.logisticaRotaModelo.findMany({
      where: { companyId },
      orderBy: [{ nome: 'asc' }],
    });
    return rows.map(toDTO);
  }

  async create(companyId: number, input: RotaModeloInput): Promise<RotaModeloDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const nome = normalizeNome(input.nome);
    const diaSemana = normalizeDiaSemana(input.diaSemana);
    const paradas = normalizeParadas(input.paradas);
    await assertNomeUnico(this.prisma, companyId, nome);
    const row = await this.prisma.logisticaRotaModelo.create({
      data: { companyId, nome, diaSemana, paradasJson: paradas as any },
    });
    this.logger.log(`[logistica] rota-modelo criado company=${companyId} id=${row.id} paradas=${paradas.length}`);
    return toDTO(row);
  }

  async update(companyId: number, id: string, input: Partial<RotaModeloInput>): Promise<RotaModeloDTO | null> {
    if (!companyId || !id) return null;
    const existing = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) {
      const nome = normalizeNome(input.nome);
      await assertNomeUnico(this.prisma, companyId, nome, existing.id);
      data.nome = nome;
    }
    if (input.diaSemana !== undefined) data.diaSemana = normalizeDiaSemana(input.diaSemana);
    if (input.paradas !== undefined) data.paradasJson = normalizeParadas(input.paradas) as any;

    const row = await this.prisma.logisticaRotaModelo.update({ where: { id: existing.id }, data });
    return toDTO(row);
  }

  async remove(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const existing = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.logisticaRotaModelo.delete({ where: { id: existing.id } });
    return true;
  }

  /**
   * PR20072026-ROTA-SALVA F2 — `POST /rota-modelos/:id/gerar`: materializa a
   * LISTA EXATA do modelo (na ORDEM salva), espelhando o shape de `gerarDia`
   * (logistica-recorrencia.service.ts): contatoId resolvido, escalares
   * quantidade/valor coerentes com a soma dos itens, `status:'agendada'`,
   * `origem:'avulsa'` (NÃO reusa 'recorrente' — consumidores de `origem` não
   * são tocados por este PR), `cobrancaStatus:'pendente'`.
   *
   * Itens vêm dos `ClienteProduto` ATIVOS do cliente (qtd=qtdPadrao,
   * valor=resolveValorUnit), IGNORANDO dia/vencimento — é isto que faz "rota
   * salva" rodar em QUALQUER dia, diferente do gerar-dia (que só pega vencidos).
   * Cliente sem vínculo ativo → Entrega SEM itens (valor 0; o motorista edita
   * na hora, edição de item por entrega já existe desde PR18072026).
   *
   * Idempotência IDÊNTICA ao gerarDia — [companyId, customerProfileId, localId,
   * dia]: já existe Entrega → REUSA o id (não duplica com a recorrência nem
   * entre 2 chamadas no mesmo dia; claim de cobrança é por delivery). NÃO
   * debita crédito aqui e NÃO avança `proximaData` de nenhum vínculo (só a
   * recorrência automática mexe nisso).
   *
   * Company-scoped/fail-closed: id de modelo de outra empresa → 404 (padrão do
   * service). Parada sem cliente / cliente de outra empresa / excluído → pula
   * e entra em `avisos[]`, sem travar o restante da lista.
   */
  async gerar(companyId: number, id: string, dateInput: string | undefined, userId: number): Promise<GerarRotaModeloResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('Usuário não identificado');
    const modelo = await this.prisma.logisticaRotaModelo.findFirst({
      where: { id: String(id ?? '').trim(), companyId },
      select: { id: true, paradasJson: true },
    });
    if (!modelo) throw new NotFoundException('Modelo de rota não encontrado');

    const paradas: RotaModeloParada[] = Array.isArray(modelo.paradasJson)
      ? (modelo.paradasJson as unknown as RotaModeloParada[])
      : [];

    const dia = startOfDay(parseDateOrNull(dateInput) ?? new Date());
    const dayEnd = endOfDay(dia);

    const avisos: string[] = [];
    const deliveryIds: string[] = [];
    const atribuidoAt = new Date();

    for (const parada of paradas) {
      const customerProfileId = String((parada as any)?.customerProfileId ?? '').trim();
      if (!customerProfileId) {
        avisos.push('Parada sem cliente vinculado foi ignorada.');
        continue;
      }

      const cliente = await this.prisma.customerProfile.findFirst({
        where: { id: customerProfileId, companyId },
        select: { id: true, name: true },
      });
      if (!cliente) {
        avisos.push(`Cliente (${customerProfileId}) não encontrado nesta empresa — parada ignorada.`);
        continue;
      }

      // localId da parada salva SÓ vale se ainda pertencer ao MESMO cliente+
      // empresa (leniência igual à do resolveLocalDoCliente em recorrencia) —
      // senão cai no grupo sem-local (null), mesma chave de idempotência do gerarDia.
      const localIdParada = String((parada as any)?.localId ?? '').trim();
      let localId: string | null = null;
      if (localIdParada) {
        const local = await this.prisma.localEntrega.findFirst({
          where: { id: localIdParada, companyId, customerProfileId },
          select: { id: true },
        });
        localId = local?.id ?? null;
      }

      // Idempotência IGUAL ao gerarDia: já existe Entrega (cliente, local, dia)?
      const existente = await this.prisma.entrega.findFirst({
        where: { companyId, customerProfileId, localId, scheduledAt: { gte: dia, lte: dayEnd } },
        select: { id: true, entregadorId: true },
      });
      if (existente) {
        if (existente.entregadorId != null && existente.entregadorId !== userId) {
          throw new ConflictException(`A entrega de ${cliente.name || 'um cliente'} já está atribuída a outro motorista.`);
        }
        if (existente.entregadorId == null) {
          const assigned = await this.prisma.entrega.updateMany({
            where: { id: existente.id, companyId, entregadorId: null },
            data: { entregadorId: userId, atribuidoPorUserId: userId, atribuidoAt },
          });
          if (assigned.count !== 1) {
            const current = await this.prisma.entrega.findFirst({
              where: { id: existente.id, companyId },
              select: { entregadorId: true },
            });
            if (current?.entregadorId !== userId) {
              throw new ConflictException(`A entrega de ${cliente.name || 'um cliente'} foi atribuída a outro motorista.`);
            }
          }
        }
        if (Array.isArray(parada.itens)) {
          const itens = await resolveSnapshotItens(this.prisma, companyId, parada.itens);
          const quantidade = itens.reduce((soma, it) => soma + it.qtdPrevista, 0);
          const valor = itens.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0);
          await this.prisma.entrega.update({
            where: { id: existente.id },
            data: {
              productId: itens[0]?.productId ?? null,
              quantidade,
              valor,
              itens: { deleteMany: {}, ...(itens.length ? { create: itens } : {}) },
            },
          });
        }
        deliveryIds.push(existente.id);
        continue;
      }

      const itens = Array.isArray(parada.itens)
        ? await resolveSnapshotItens(this.prisma, companyId, parada.itens)
        : await this.resolveLegacyItens(companyId, customerProfileId);
      const quantidade = itens.reduce((soma, it) => soma + it.qtdPrevista, 0);
      const valor = itens.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0);

      // Mesmo BUGFIX (09/07) do gerarDia: resolve o contato principal ANTES de
      // criar a Entrega, best-effort (falha aqui não pode travar o gerar).
      let contatoId: string | null = null;
      try {
        contatoId = await resolvePrincipalContatoId(this.prisma as any, companyId, customerProfileId);
      } catch (e: any) {
        this.logger.warn(
          `[logistica] rota-modelo gerar resolvePrincipalContato cliente=${customerProfileId} falhou: ${String(e?.message || e)}`,
        );
      }

      const criada = await this.prisma.entrega.create({
        data: {
          companyId,
          customerProfileId,
          contatoId,
          localId,
          entregadorId: userId,
          atribuidoPorUserId: userId,
          atribuidoAt,
          productId: itens[0]?.productId ?? null,
          quantidade,
          valor,
          status: 'agendada',
          origem: 'avulsa',
          scheduledAt: dia,
          cobrancaStatus: 'pendente',
          ...(itens.length ? { itens: { create: itens } } : {}),
        },
        select: { id: true },
      });
      deliveryIds.push(criada.id);
    }

    this.logger.log(
      `[logistica] rota-modelo gerar company=${companyId} modeloId=${modelo.id}: ${deliveryIds.length} entrega(s), ${avisos.length} aviso(s).`,
    );
    return { deliveryIds, avisos };
  }

  private async resolveLegacyItens(companyId: number, customerProfileId: string): Promise<EntregaItemCreate[]> {
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId, ativo: true },
      select: {
        productId: true,
        qtdPadrao: true,
        precoAcordado: true,
        product: { select: { price: true, priceCents: true } },
      },
    });
    return vinculos.map((v: any) => ({
      productId: v.productId,
      qtdPrevista: Math.max(1, Math.trunc(Number(v.qtdPadrao) || 1)),
      valorUnit: resolveValorUnit(v),
    }));
  }
}

async function resolveSnapshotItens(
  prisma: Pick<PrismaService, 'product'>,
  companyId: number,
  snapshot: RotaModeloItem[],
): Promise<EntregaItemCreate[]> {
  const itens = snapshot.map((item) => ({
    productId: Math.trunc(Number(item.productId)),
    qtdPrevista: Math.trunc(Number(item.qtd)),
    valorUnit: Number(item.valorUnit),
  }));
  const productIds = [...new Set(itens.map((item) => item.productId))];
  const produtos = productIds.length
    ? await prisma.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true } })
    : [];
  if (produtos.length !== productIds.length) {
    throw new BadRequestException('Um produto salvo nesta rota não pertence mais a esta empresa.');
  }
  return itens;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function normalizeNome(value: unknown): string {
  const nome = String(value ?? '').trim();
  if (!nome) throw new BadRequestException('Nome é obrigatório.');
  if (nome.length > 80) throw new BadRequestException('Nome deve ter até 80 caracteres.');
  return nome;
}

export function normalizeDiaSemana(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.trunc(Number(value));
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw new BadRequestException('diaSemana deve ser 1 (segunda) a 7 (domingo), ou omitido.');
  }
  return n;
}

// PR20072026 W1 — `horaRef` ("HH:MM") é chave ADITIVA gravada pelo finalizar de
// logistica-leitura.service.ts (hora de referência da parada capturada em campo).
// PRESERVAR aqui: o modelo salvo pela Leitura de Rota também passa por esta
// função (via prisma direto no finalizar, mas com o MESMO contrato de shape).
export function normalizeParadas(value: unknown): RotaModeloParada[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException('paradas deve ser uma lista.');
  if (value.length > 500) throw new BadRequestException('No máximo 500 paradas por modelo.');
  return value.map((item, index) => {
    const customerProfileId = String((item as any)?.customerProfileId ?? '').trim();
    if (!customerProfileId) {
      throw new BadRequestException(`paradas[${index}].customerProfileId é obrigatório.`);
    }
    const localIdRaw = (item as any)?.localId;
    const localId = localIdRaw != null ? String(localIdRaw).trim() : null;
    const horaRefRaw = (item as any)?.horaRef;
    const horaRef = horaRefRaw != null ? String(horaRefRaw).trim() : null;
    const itensRaw = (item as any)?.itens;
    let itens: RotaModeloItem[] | undefined;
    if (itensRaw !== undefined) {
      if (!Array.isArray(itensRaw) || itensRaw.length > 50) {
        throw new BadRequestException(`paradas[${index}].itens deve ter no máximo 50 itens.`);
      }
      itens = itensRaw.map((raw: any, itemIndex: number) => {
        const productId = Math.trunc(Number(raw?.productId));
        const qtd = Math.trunc(Number(raw?.qtd));
        const valorUnit = Number(raw?.valorUnit);
        if (!Number.isInteger(productId) || productId <= 0) {
          throw new BadRequestException(`paradas[${index}].itens[${itemIndex}].productId inválido.`);
        }
        if (!Number.isInteger(qtd) || qtd < 1) {
          throw new BadRequestException(`paradas[${index}].itens[${itemIndex}].qtd deve ser ao menos 1.`);
        }
        if (!Number.isFinite(valorUnit) || valorUnit < 0) {
          throw new BadRequestException(`paradas[${index}].itens[${itemIndex}].valorUnit inválido.`);
        }
        return { productId, qtd, valorUnit };
      });
    }
    return {
      customerProfileId,
      ...(localId ? { localId } : {}),
      ...(horaRef ? { horaRef } : {}),
      ...(itens ? { itens } : {}),
    };
  });
}

function toDTO(row: { id: string; nome: string; diaSemana: number | null; paradasJson: unknown }): RotaModeloDTO {
  return {
    id: row.id,
    nome: row.nome,
    diaSemana: row.diaSemana ?? null,
    paradas: Array.isArray(row.paradasJson) ? (row.paradasJson as RotaModeloParada[]) : [],
  };
}

export interface RotaModeloParada {
  customerProfileId: string;
  localId?: string;
  // PR20072026 W1 — hora de referência ("HH:MM") da parada na captura original.
  horaRef?: string;
  itens?: RotaModeloItem[];
}

export interface RotaModeloItem {
  productId: number;
  qtd: number;
  valorUnit: number;
}

interface EntregaItemCreate {
  productId: number;
  qtdPrevista: number;
  valorUnit: number;
}

export interface RotaModeloInput {
  nome: string;
  diaSemana?: number | null;
  paradas?: RotaModeloParada[];
}

export interface RotaModeloDTO {
  id: string;
  nome: string;
  diaSemana: number | null;
  paradas: RotaModeloParada[];
}

export interface GerarRotaModeloResult {
  deliveryIds: string[];
  avisos: string[];
}
