import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaService } from './logistica.service';
import type { LogisticaActor } from './logistica-operacao.service';
import { isoWeekdayForDate, saoPauloDateKey } from './logistica-occurrence.service';
import { saoPauloMidnight } from './logistica-agenda-cursor.util';
import type { VenderCadernetaDto } from './dto/logistica.dto';

/**
 * MODO CADERNETA (PR04082026-MODO-CADERNETA) — venda por toque no cliente, SEM
 * rota e SEM debitar crédito (o débito segue exclusivo do Iniciar rota).
 *
 * Nasceu do André (company 41): ele abandonou a ROTA (pinos podres), não o app —
 * usa a tela de Clientes como caderneta. Aqui a venda registrada é a MESMA
 * máquina do confirmar da rota (cobrança, comprovante, GPS de ouro realimenta o
 * pino ≤60m) — cada venda registrada conserta um pino, e o medidor "Mapa: X de N"
 * mostra o GPS sendo reconstruído até o dia liberar a rota de volta.
 *
 * Reuso deliberado: `vender` = createEntrega + confirmarEntrega EXISTENTES —
 * nenhuma regra de dinheiro nova mora aqui (código financeiro tem dono).
 */

// Fontes PROVADAS no campo — MESMA lei do semáforo da conferência
// (GEOFONTES_PROVADAS em logistica-conferencia.util.ts): geocode não conta.
const FONTES_PROVADAS = new Set(['gps_entrega', 'gps_cadastro']);

export interface CadernetaResumo {
  ativo: boolean;
  dia: { total: number; provados: number; pronto: boolean };
  fechamento: {
    totalCents: number;
    vendas: number;
    formas: { dinheiroCents: number; pixCents: number; cartaoCents: number; fiadoCents: number };
  };
}

export interface CadernetaVendaResult {
  ok: true;
  entregaId: string;
  totalCents: number;
  replayed?: boolean;
}

function cents(valor: number | null | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function dateKeyValida(v: unknown): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : saoPauloDateKey(new Date());
}

@Injectable()
export class LogisticaCadernetaService {
  private readonly logger = new Logger(LogisticaCadernetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
  ) {}

  private async configRow(companyId: number) {
    return this.prisma.logisticaConfig.findUnique({ where: { companyId } });
  }

  /** Medidor do dia + fechamento por forma — o contrato da tela caderneta do APK. */
  async resumo(companyId: number, dateInput?: unknown): Promise<CadernetaResumo> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const dateKey = dateKeyValida(dateInput);
    const cfg = await this.configRow(companyId);

    // ── Medidor: clientes do DIA (dia é do CLIENTE — LogisticaPlanoEntrega é a
    // verdade) × quantos têm localização PROVADA no campo. Read-only: nunca
    // materializa entrega nem avança proximaData (mesma lei do dia-preview).
    const diaSemana = isoWeekdayForDate(dateKey);
    const planos = await this.prisma.logisticaPlanoEntrega.findMany({
      // Cliente morto não conta (mesma régua CLIENTE_VIVO da agenda).
      where: { companyId, diaSemana, ativo: true, customerProfile: { status: 'active', isCliente: true } },
      select: { customerProfileId: true },
    });
    const clienteIds = [...new Set(planos.map((p) => p.customerProfileId))];

    let provados = 0;
    if (clienteIds.length) {
      const contas = await this.prisma.customerProfile.findMany({
        where: { companyId, id: { in: clienteIds } },
        select: {
          geoFonte: true,
          // O pino que a rota USA é o do local principal (multilocal); perfil é fallback.
          locais: {
            where: { ativo: true, isPrincipal: true },
            select: { geoFonte: true },
            take: 1,
          },
        },
      });
      for (const conta of contas) {
        const fonte = conta.locais[0]?.geoFonte ?? conta.geoFonte;
        if (fonte && FONTES_PROVADAS.has(fonte)) provados += 1;
      }
    }
    const total = clienteIds.length;

    // ── Fechamento do dia: a conta que o dono faz de cabeça hoje (quanto entrou
    // em dinheiro/pix/cartão + quanto ficou fiado). Fonte = Entrega entregue no
    // dia civil SP; método imediato soma na forma, o resto é fiado do dia.
    const inicio = saoPauloMidnight(dateKey);
    const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
    const entregues = await this.prisma.entrega.findMany({
      where: { companyId, status: 'entregue', deliveredAt: { gte: inicio, lt: fim } },
      select: { valor: true, receiptMethod: true },
    });
    const formas = { dinheiroCents: 0, pixCents: 0, cartaoCents: 0, fiadoCents: 0 };
    let totalCents = 0;
    for (const e of entregues) {
      const c = cents(e.valor);
      totalCents += c;
      if (e.receiptMethod === 'dinheiro') formas.dinheiroCents += c;
      else if (e.receiptMethod === 'pix') formas.pixCents += c;
      else if (e.receiptMethod === 'cartao') formas.cartaoCents += c;
      else formas.fiadoCents += c;
    }

    return {
      ativo: !!cfg?.modoCaderneta,
      dia: { total, provados, pronto: total > 0 && provados >= total },
      fechamento: { totalCents, vendas: entregues.length, formas },
    };
  }

  /**
   * Vendeu: cria a Entrega de HOJE já entregue reusando createEntrega +
   * confirmarEntrega (cobrança/GPS/idempotência da casa). NUNCA debita crédito.
   */
  async vender(
    companyId: number,
    dto: VenderCadernetaDto,
    actor?: LogisticaActor | null,
  ): Promise<CadernetaVendaResult> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.configRow(companyId);
    if (!cfg?.modoCaderneta) {
      throw new BadRequestException('O modo caderneta está desligado nos Ajustes.');
    }
    const itens = Array.isArray(dto.itens) ? dto.itens : [];
    if (itens.length === 0) throw new BadRequestException('Escolha ao menos um produto.');
    const desfecho = String(dto.desfecho || '').trim();
    const metodo = String(dto.metodo || '').trim() || null;
    if (desfecho === 'pagou' && !metodo) {
      throw new BadRequestException('Escolha como recebeu: dinheiro, Pix ou cartão.');
    }
    const key = String(dto.idempotencyKey || '').trim().slice(0, 80);
    if (!key) throw new BadRequestException('Chave de idempotência é obrigatória.');

    // Idempotência do CLIQUE (antes de criar qualquer coisa): a mesma key já
    // virou venda → devolve o desfecho anterior, nada re-executa. (A janela
    // criar→confirmar não pré-grava a key de propósito: o replay do confirmar
    // PRESSUPÕE que key gravada = entrega confirmada — ver M8.)
    const anterior = await this.prisma.entrega.findFirst({
      where: { companyId, idempotencyKey: key },
      select: { id: true, valor: true },
    });
    if (anterior) {
      return { ok: true, entregaId: anterior.id, totalCents: cents(anterior.valor), replayed: true };
    }

    const [primeiro, ...resto] = itens;
    const criada = await this.logistica.createEntrega(
      companyId,
      {
        customerProfileId: dto.clienteId,
        productId: primeiro.productId,
        quantidade: primeiro.quantidade,
        localId: dto.localId,
      },
      actor ?? null,
    );

    // Confirma na mesma máquina da rota. 'deveu' manda 'fiado' EXPLÍCITO — sem
    // isso o M6 derivaria o metodoPadrao do cliente na_hora e QUITARIA uma venda
    // que ficou pendurada. Ator não filtra aqui: a entrega nasceu NESTA chamada,
    // sem entregador — o escopo por-tenant (companyId) segue duro.
    await this.logistica.confirmarEntrega(
      companyId,
      criada.id,
      {
        lat: dto.gps?.lat,
        lng: dto.gps?.lng,
        accuracy: dto.gps?.accuracy,
        receiptMethod: desfecho === 'pagou' ? (metodo as string) : 'fiado',
        novosItens: resto.map((i) => ({ productId: i.productId, qtdEntregue: i.quantidade })),
        idempotencyKey: key,
      },
      null,
    );

    // Número da casa (opcional, best-effort): completa o cadastro SEM nunca
    // travar a venda — e só preenche o que está VAZIO (nunca reescreve decisão).
    const numero = String(dto.numero || '').trim().slice(0, 20);
    if (numero) {
      try {
        await this.prisma.customerProfile.updateMany({
          where: { companyId, id: dto.clienteId, OR: [{ numero: null }, { numero: '' }] },
          data: { numero },
        });
        await this.prisma.localEntrega.updateMany({
          where: dto.localId
            ? { companyId, id: dto.localId, customerProfileId: dto.clienteId, OR: [{ numero: null }, { numero: '' }] }
            : { companyId, customerProfileId: dto.clienteId, isPrincipal: true, ativo: true, OR: [{ numero: null }, { numero: '' }] },
          data: { numero },
        });
      } catch (e: any) {
        this.logger.warn(`[caderneta] numero best-effort cliente=${dto.clienteId} falhou: ${String(e?.message || e)}`);
      }
    }

    const final = await this.prisma.entrega.findFirst({
      where: { companyId, id: criada.id },
      select: { valor: true },
    });
    return { ok: true, entregaId: criada.id, totalCents: cents(final?.valor) };
  }
}
