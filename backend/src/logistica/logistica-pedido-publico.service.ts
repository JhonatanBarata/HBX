import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSearch } from '../nucleo/nucleo-search.util';
import { resolvePrincipalContatoId } from './logistica-contato.util';
import { isPedidoPublicoEnabled } from './logistica-pedido.flags';

/**
 * S6 PORTAL-PEDIDO (11/07) — serviço do pedido PÚBLICO pelo link /pedido/<token>.
 *
 * Rota pública NÃO tem req.user (sem JWT, sem TenantContext no store): o
 * companyId nasce do token OPACO (LogisticaConfig.pedidoPublicoToken, unique) e
 * é passado EXPLÍCITO em toda query — mesmo padrão do lead-capture
 * (website-lead-capture.service.ts, getCompanyIdByCaptureToken).
 *
 * DORMENTE em 2 chaves: env HBX_PEDIDO_PUBLICO_ENABLED (default OFF → tudo aqui
 * devolve not_found/null e o controller responde 404 seco) + toggle por tenant
 * LogisticaConfig.pedidoPublicoAtivo (default false).
 *
 * ── SEM EFEITO EXTERNO ───────────────────────────────────────────────────────
 * Cria CustomerProfile (lead) + Entrega 'agendada' com itens — e SÓ isso. NÃO
 * dispara WhatsApp, NÃO lança cobrança, NÃO toca rota/replanejar (rotaOrdem
 * null = a entrega cai no fim; o replanejar existente pega). Os efeitos da
 * entrega continuam no confirmar (N6), atrás de HBX_LOGISTICA_ENABLED.
 *
 * ── BLINDAGEM (além do @Throttle 5/min do controller) ────────────────────────
 *  · honeypot `_hp` preenchido → 200 fake sem efeito (molde lead-capture);
 *  · teto de pedidos/dia POR EMPRESA (em memória — best-effort de tráfego,
 *    zera no restart; estouro responde o MESMO 200 genérico, sem pista);
 *  · teto de itens por pedido + quantidade máxima por item (400 de validação);
 *  · telefone BR normalizável obrigatório (400 de validação normal);
 *  · preço SEMPRE do servidor (regra de ouro F2, logistica.service.ts): o
 *    payload nem tem campo de preço — qualquer chave extra é ignorada.
 */

export const PEDIDO_PUBLICO_MAX_ITENS = 20;
export const PEDIDO_PUBLICO_MAX_QTD_ITEM = 50;
export const PEDIDO_PUBLICO_MAX_PEDIDOS_DIA = 100;

export type PedidoPublicoCatalogo = {
  empresaNome: string;
  produtos: Array<{ id: number; nome: string; preco: number; unidade: string | null }>;
};

export type CriarPedidoPublicoInput = {
  token: string;
  itens?: unknown;
  nome?: unknown;
  telefone?: unknown;
  endereco?: unknown;
  obs?: unknown;
  _hp?: unknown; // honeypot — campo escondido no form; humano nunca preenche
};

export type CriarPedidoPublicoResult = {
  ok: boolean;
  reason?: 'not_found' | 'validacao' | 'rate_limited';
  message?: string;
};

@Injectable()
export class LogisticaPedidoPublicoService {
  private readonly logger = new Logger(LogisticaPedidoPublicoService.name);

  // Teto de pedidos/dia por empresa, EM MEMÓRIA (v1 do .md): proteção de
  // tráfego best-effort — restart zera, réplicas não compartilham. A
  // contabilidade real é a própria Entrega criada.
  private readonly pedidosDia = new Map<number, { day: string; count: number }>();

  constructor(private readonly prisma: PrismaService) {}

  // ── helpers de normalização (molde lead-capture) ─────────────────────────────
  private normalizeString(value: unknown, maxLength = 300): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
  }

  /**
   * Telefone BR "normalizável": só dígitos; +55/55 na frente (12-13 dígitos) é
   * removido — a convenção dominante do app é o número LOCAL (DDD+8/9), que é o
   * que o dono digita no cadastro (nucleo normalizeDigits). Fora de 10-11
   * dígitos = lixo → null (o POST responde 400 de validação normal).
   */
  private normalizeTelefoneBr(value: unknown): string | null {
    let digits = String(value ?? '').replace(/\D+/g, '').slice(0, 20);
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      digits = digits.slice(2);
    }
    return digits.length === 10 || digits.length === 11 ? digits : null;
  }

  /** Preço de catálogo (mesma resolução do F2/listProdutos: priceCents vence). */
  private precoCatalogo(p: { price: number | null; priceCents: number | null }): number {
    const preco = typeof p.priceCents === 'number' ? p.priceCents / 100 : typeof p.price === 'number' ? p.price : 0;
    return Math.max(0, preco);
  }

  /** Resolve o tenant pelo token opaco. null = flag OFF / token inválido / tenant OFF. */
  private async resolveCompanyIdByToken(tokenRaw: string): Promise<number | null> {
    if (!isPedidoPublicoEnabled()) return null;
    const token = this.normalizeString(tokenRaw, 128);
    if (!token) return null;
    const cfg = await this.prisma.logisticaConfig.findFirst({
      where: { pedidoPublicoToken: token },
      select: { companyId: true, pedidoPublicoAtivo: true },
    });
    if (!cfg || !cfg.pedidoPublicoAtivo) return null;
    return cfg.companyId;
  }

  /** Teto diário por empresa (em memória). true = estourou (recusa silenciosa). */
  private estourouTetoDiario(companyId: number): boolean {
    const day = new Date().toISOString().slice(0, 10);
    const atual = this.pedidosDia.get(companyId);
    if (!atual || atual.day !== day) return false;
    return atual.count >= PEDIDO_PUBLICO_MAX_PEDIDOS_DIA;
  }

  private contarPedidoDoDia(companyId: number): void {
    const day = new Date().toISOString().slice(0, 10);
    const atual = this.pedidosDia.get(companyId);
    if (!atual || atual.day !== day) {
      this.pedidosDia.set(companyId, { day, count: 1 });
      return;
    }
    atual.count += 1;
  }

  // ── GET público: catálogo da empresa ─────────────────────────────────────────
  /**
   * Vitrine do link público: nome da empresa + produtos `usaLogistica` ativos
   * com preço de CATÁLOGO (exibição). O preço REAL do pedido é SEMPRE resolvido
   * de novo no POST (regra de ouro) — e preço acordado por cliente NUNCA aparece
   * aqui (regra do .md). null = 404 no controller (flag OFF / token inválido /
   * tenant OFF — resposta idêntica, sem pista de qual caso foi).
   */
  async getCatalogo(tokenRaw: string): Promise<PedidoPublicoCatalogo | null> {
    const companyId = await this.resolveCompanyIdByToken(tokenRaw);
    if (!companyId) return null;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    if (!company) return null;

    const rows = await this.prisma.product.findMany({
      where: { companyId, usaLogistica: true, status: 'active', kind: 'tenant_product' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 200,
      select: { id: true, name: true, unidade: true, price: true, priceCents: true },
    });

    return {
      empresaNome: company.name,
      produtos: rows.map((p) => ({
        id: p.id,
        nome: p.name,
        preco: this.precoCatalogo(p),
        unidade: p.unidade ?? null,
      })),
    };
  }

  // ── POST público: criar o pedido ─────────────────────────────────────────────
  /**
   * Fluxo: valida token+flags → honeypot → valida campos/tetos → acha-ou-cria
   * CustomerProfile por [companyId, phoneNormalized] (unique existente; novo
   * nasce isLead:true/isCliente:false com o endereço informado) → cria Entrega
   * 'agendada' HOJE com EntregaItem por produto e preço DO SERVIDOR. Origem
   * anotada em Entrega.notes (campo de texto livre EXISTENTE — sem coluna nova).
   *
   * ip: reservado p/ auditoria futura (rate-limit por IP vive no @Throttle do
   * controller, mesmo padrão do lead-capture).
   */
  async criarPedido(input: CriarPedidoPublicoInput, ip: string | null): Promise<CriarPedidoPublicoResult> {
    void ip;

    // Honeypot ANTES de tocar o banco: bot preencheu o campo escondido →
    // responde OK sem efeito e sem revelar que foi descartado (molde lead-capture).
    if (this.normalizeString(input._hp)) {
      return { ok: true };
    }

    const companyId = await this.resolveCompanyIdByToken(input.token);
    if (!companyId) return { ok: false, reason: 'not_found' };

    // Teto diário por empresa: estourou → 200 genérico (nunca dá pista pro bot),
    // mas NADA é criado. Molde do "rate_limited" do lead-capture.
    if (this.estourouTetoDiario(companyId)) {
      this.logger.warn(`[pedido-publico] teto diário atingido company=${companyId} — pedido descartado.`);
      return { ok: false, reason: 'rate_limited' };
    }

    // ── validação de campos (400 normal em campo obrigatório — só o honeypot finge sucesso) ──
    const nome = this.normalizeString(input.nome, 200);
    if (!nome) return { ok: false, reason: 'validacao', message: 'Informe seu nome.' };

    const telefone = this.normalizeTelefoneBr(input.telefone);
    if (!telefone) return { ok: false, reason: 'validacao', message: 'Informe um telefone válido com DDD.' };

    const endereco = this.normalizeString(input.endereco, 300);
    if (!endereco) return { ok: false, reason: 'validacao', message: 'Informe o endereço de entrega.' };

    const obs = this.normalizeString(input.obs, 300);

    const rawItens = Array.isArray(input.itens) ? input.itens : [];
    if (rawItens.length === 0) {
      return { ok: false, reason: 'validacao', message: 'Escolha pelo menos um produto.' };
    }
    if (rawItens.length > PEDIDO_PUBLICO_MAX_ITENS) {
      return { ok: false, reason: 'validacao', message: `Máximo de ${PEDIDO_PUBLICO_MAX_ITENS} itens por pedido.` };
    }

    // Agrega por productId (2 linhas do mesmo produto somam) e valida os tetos.
    // Preço NÃO é aceito daqui — qualquer campo além de productId/quantidade é
    // simplesmente ignorado (regra de ouro: preço nasce do catálogo, abaixo).
    const qtdPorProduto = new Map<number, number>();
    for (const raw of rawItens) {
      const productId = Math.trunc(Number((raw as any)?.productId));
      const qtd = Math.trunc(Number((raw as any)?.quantidade));
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(qtd) || qtd <= 0) {
        return { ok: false, reason: 'validacao', message: 'Itens do pedido inválidos.' };
      }
      qtdPorProduto.set(productId, (qtdPorProduto.get(productId) || 0) + qtd);
    }
    for (const qtd of qtdPorProduto.values()) {
      if (qtd > PEDIDO_PUBLICO_MAX_QTD_ITEM) {
        return { ok: false, reason: 'validacao', message: `Quantidade máxima por item é ${PEDIDO_PUBLICO_MAX_QTD_ITEM}.` };
      }
    }

    // ── preço DO SERVIDOR: só produto do catálogo público desta empresa passa ──
    const produtos = await this.prisma.product.findMany({
      where: { id: { in: [...qtdPorProduto.keys()] }, companyId, usaLogistica: true, status: 'active' },
      select: { id: true, price: true, priceCents: true },
    });
    if (produtos.length !== qtdPorProduto.size) {
      return { ok: false, reason: 'validacao', message: 'Produto indisponível no catálogo.' };
    }
    const itens = produtos.map((p) => ({
      productId: p.id,
      qtdPrevista: qtdPorProduto.get(p.id) || 1,
      valorUnit: this.precoCatalogo(p),
    }));
    const quantidade = itens.reduce((soma, it) => soma + it.qtdPrevista, 0);
    const valor = round2(itens.reduce((soma, it) => soma + it.valorUnit * it.qtdPrevista, 0));

    // ── acha-ou-cria a CONTA por [companyId, phoneNormalized] (unique do schema) ──
    let cliente = await this.prisma.customerProfile.findFirst({
      where: { companyId, phoneNormalized: telefone },
      select: { id: true, endereco: true },
    });
    if (!cliente) {
      try {
        cliente = await this.prisma.customerProfile.create({
          data: {
            companyId,
            tipo: 'pf',
            name: nome,
            // Coluna espelho de busca (BUG 1, 11/07): TODO write de `name` grava junto.
            searchName: normalizeSearch(nome),
            phone: telefone,
            phoneNormalized: telefone,
            endereco,
            // Cliente novo do link nasce LEAD (sem workflow de aprovação novo —
            // a "aprovação" v1 é o operador ver a entrega agendada do dia).
            isLead: true,
            isCliente: false,
          },
          select: { id: true, endereco: true },
        });
      } catch (e: any) {
        // Corrida: outro pedido do MESMO telefone criou primeiro → relê (unique garante 1).
        if (String(e?.code) === 'P2002') {
          cliente = await this.prisma.customerProfile.findFirst({
            where: { companyId, phoneNormalized: telefone },
            select: { id: true, endereco: true },
          });
        } else {
          throw e;
        }
      }
    } else if (!cliente.endereco) {
      // Conta existente SEM endereço: preenche o gap (a rota precisa de onde
      // entregar) — nunca sobrescreve endereço já cadastrado pelo dono.
      await this.prisma.customerProfile
        .update({ where: { id: cliente.id }, data: { endereco } })
        .catch((e: any) => this.logger.warn(`[pedido-publico] fill endereco cliente=${cliente?.id} falhou: ${String(e?.message || e)}`));
    }
    if (!cliente) {
      this.logger.warn(`[pedido-publico] não foi possível resolver o cliente company=${companyId}.`);
      return { ok: false, reason: 'validacao', message: 'Não foi possível registrar o pedido.' };
    }

    // Contato que recebe os avisos (best-effort, mesmo padrão do createEntrega):
    // cliente novo não tem Contato → null (fallback do aviso é o phone da conta).
    let contatoId: string | null = null;
    try {
      contatoId = await resolvePrincipalContatoId(this.prisma as any, companyId, cliente.id);
    } catch (e: any) {
      this.logger.warn(`[pedido-publico] resolvePrincipalContato cliente=${cliente.id} falhou: ${String(e?.message || e)}`);
    }

    // ── Entrega 'agendada' pra HOJE + itens com preço do servidor (create aninhado
    // = atômico). rotaOrdem fica null de propósito: cai no FIM da rota do dia e o
    // replanejar existente ordena. Origem anotada no campo LIVRE existente (notes).
    const notes = ['Pedido pelo link', obs].filter(Boolean).join(' — ').slice(0, 500);
    const created = await this.prisma.entrega.create({
      data: {
        companyId,
        customerProfileId: cliente.id,
        contatoId,
        // productId escalar legado = o do 1º item (backward-compat N6, mesmo
        // padrão do gerarDia — as telas novas leem `itens`).
        productId: itens[0].productId,
        quantidade,
        valor,
        status: 'agendada',
        // L4-A (18/07) — pedido pelo link é um pedido único do cliente, mesma
        // categoria do createEntrega manual (nunca recorrência).
        origem: 'avulsa',
        scheduledAt: new Date(),
        cobrancaStatus: 'pendente',
        notes,
        itens: { create: itens },
      },
      select: { id: true },
    });

    this.contarPedidoDoDia(companyId);
    this.logger.log(`[pedido-publico] pedido criado company=${companyId} entrega=${created.id} itens=${itens.length}.`);
    // Resposta GENÉRICA (nunca vaza id interno pro público).
    return { ok: true };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
