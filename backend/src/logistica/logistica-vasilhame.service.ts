import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * VASILHAME / CASCO (17/08/2026) — o patrimônio que a distribuidora deixa na rua.
 *
 * Quem entrega água, gás ou bebida empresta a embalagem: o garrafão de 20L, o
 * botijão, o engradado. Cada casco custa R$25–40, fica na casa do cliente e some
 * sem ninguém perceber — é o ativo mais caro e menos controlado do setor. A
 * pergunta que este serviço responde é uma só: **quanto está com cada cliente, e
 * quanto isso vale.**
 *
 * ── Duas tabelas, dois papéis ───────────────────────────────────────────────
 * `VasilhameSaldo`      = a resposta (quantos, agora).
 * `VasilhameMovimento`  = por que a resposta é essa (extrato append-only).
 *
 * Nunca se escreve saldo sem escrever movimento, e os dois vão na MESMA
 * transação. Saldo sem extrato é briga sem prova: o cliente jura que devolveu, o
 * entregador jura que não, e sem linha do tempo o dono perde a discussão e o casco.
 *
 * ── Por que o saldo é da CONTA e não do vínculo ─────────────────────────────
 * `ClienteProduto` perdeu o @@unique de propósito (o mesmo produto pode estar
 * vinculado 2× ao mesmo cliente — galão na segunda, galão na sexta). Saldo por
 * vínculo contaria o mesmo garrafão duas vezes e o total da tela viraria ficção.
 * A chave é [companyId, customerProfileId, productId].
 */

/** Movimentos aceitos. Allowlist: o que eu não reconheço não move patrimônio. */
export const VASILHAME_TIPOS = ['INJECAO', 'DEVOLUCAO', 'AJUSTE', 'PERDA'] as const;
export type VasilhameTipo = (typeof VASILHAME_TIPOS)[number];

export interface VasilhameLinhaDTO {
  productId: number;
  nome: string;
  unidade: string | null;
  qtd: number;
  /** Valor de UM casco, em centavos (do catálogo). */
  precoCents: number;
  /** qtd × precoCents — o número que faz o dono abrir a carteira. */
  totalCents: number;
}

export interface VasilhameSaldoClienteDTO {
  customerProfileId: string;
  linhas: VasilhameLinhaDTO[];
  /** Soma de todas as linhas. Zero quando o cliente não está com nada. */
  totalQtd: number;
  totalCents: number;
}

export interface VasilhameMovimentoDTO {
  id: string;
  productId: number;
  produtoNome: string | null;
  tipo: string;
  qtd: number;
  saldoDepois: number;
  motivo: string | null;
  userId: number | null;
  createdAt: Date;
}

export interface RegistrarMovimentoInput {
  customerProfileId: string;
  productId: number;
  tipo: string;
  /** SEMPRE positivo no corpo: o SINAL quem dá é o tipo (ver `sinalDoTipo`). */
  qtd: number;
  motivo?: string | null;
  userId?: number | null;
  /** ONDA 2 — entrega que gerou o movimento. Null quando é a mão no cadastro. */
  entregaId?: string | null;
}

/** O que a entrega conseguiu (ou não) mover de casco. Ver `moverPorEntrega`. */
export interface VasilhameEntregaResult {
  /** produtos cujo casco andou nesta passada. 0 = replay honesto (nada a fazer). */
  movidos: number;
  /** o que NÃO deu pra mover, em português. A rua nunca trava por causa de casco. */
  avisos: string[];
}

/**
 * O SINAL MORA NO TIPO, NUNCA NO NÚMERO DIGITADO.
 *
 * Deixar a tela mandar `qtd: -3` seria a mesma cicatriz da manobra fantasma do
 * APK (distância sem sinal): uma casa manda negativo, a outra manda positivo, e o
 * patrimônio anda pro lado errado sem ninguém ver. Aqui a UI diz o VERBO
 * ("injetar", "devolver") e a aritmética é decidida num lugar só.
 */
export function sinalDoTipo(tipo: VasilhameTipo): 1 | -1 {
  // INJECAO e AJUSTE somam (o cliente fica com mais casco);
  // DEVOLUCAO e PERDA tiram (o casco voltou, ou saiu de vez do controle dele).
  return tipo === 'DEVOLUCAO' || tipo === 'PERDA' ? -1 : 1;
}

/**
 * Aplica o movimento ao saldo. Puro e sem I/O de propósito: é a única aritmética
 * do módulo e precisa de teste barato e determinístico (mesma escola do
 * `wa-chip-trust.ts`).
 *
 * Nunca devolve negativo: saldo negativo é sempre erro de digitação, e erro de
 * digitação não pode virar patrimônio inventado na soma da tela. Quem chama
 * decide se o clamp é silencioso (não é: o serviço recusa e explica).
 */
export function aplicarMovimento(saldoAtual: number, tipo: VasilhameTipo, qtd: number): number {
  const atual = Number.isFinite(saldoAtual) ? Math.trunc(saldoAtual) : 0;
  const quantidade = Math.trunc(Number(qtd));
  if (!Number.isFinite(quantidade) || quantidade <= 0) return atual;
  return atual + sinalDoTipo(tipo) * quantidade;
}

@Injectable()
export class LogisticaVasilhameService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizarTipo(tipo: string): VasilhameTipo {
    const chave = String(tipo || '').trim().toUpperCase();
    if (!(VASILHAME_TIPOS as readonly string[]).includes(chave)) {
      throw new BadRequestException(`Tipo de movimento inválido: use ${VASILHAME_TIPOS.join(', ')}.`);
    }
    return chave as VasilhameTipo;
  }

  private normalizarQtd(qtd: unknown): number {
    const n = Math.trunc(Number(qtd));
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('Quantidade precisa ser um número inteiro maior que zero.');
    }
    if (n > 9999) throw new BadRequestException('Quantidade acima do limite (9999).');
    return n;
  }

  /**
   * Confere que a conta é DESTA empresa. Multi-tenant é lei do repo: nada
   * atravessa empresa, nem pra ler.
   */
  private async assertClienteDaEmpresa(companyId: number, customerProfileId: string) {
    const id = String(customerProfileId || '').trim();
    if (!id) throw new BadRequestException('Cliente não informado');
    const cliente = await this.prisma.customerProfile.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente.id;
  }

  /**
   * Produto desta empresa QUE EMPRESTA CASCO. Recusar aqui é de propósito: sem a
   * flag ligada o produto não tem preço de vasilhame, e saldo sem preço envenena
   * o total da tela com zero.
   */
  private async assertProdutoComVasilhame(companyId: number, productId: number) {
    const id = Math.trunc(Number(productId));
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Produto não informado');
    const produto = await this.prisma.product.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, unidade: true, possuiVasilhame: true, vasilhamePrecoCents: true },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    if (!produto.possuiVasilhame) {
      throw new BadRequestException('Este produto não trabalha com vasilhame.');
    }
    return produto;
  }

  /**
   * SALDO DO CLIENTE — o bloco "Vasilhames com este cliente" da ficha.
   *
   * Mostra também produto com casco que o cliente TEM VÍNCULO mas ainda está
   * zerado: sem isso o dono não teria onde clicar pra injetar o primeiro
   * garrafão, e a tela obrigaria um cadastro invisível antes do primeiro uso.
   */
  async saldoDoCliente(companyId: number, customerProfileId: string): Promise<VasilhameSaldoClienteDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const clienteId = await this.assertClienteDaEmpresa(companyId, customerProfileId);

    const [saldos, vinculos] = await Promise.all([
      this.prisma.vasilhameSaldo.findMany({
        where: { companyId, customerProfileId: clienteId },
        select: {
          productId: true,
          qtd: true,
          product: { select: { name: true, unidade: true, possuiVasilhame: true, vasilhamePrecoCents: true } },
        },
      }),
      this.prisma.clienteProduto.findMany({
        where: { companyId, customerProfileId: clienteId, ativo: true, product: { possuiVasilhame: true } },
        select: {
          productId: true,
          product: { select: { name: true, unidade: true, possuiVasilhame: true, vasilhamePrecoCents: true } },
        },
      }),
    ]);

    const porProduto = new Map<number, VasilhameLinhaDTO>();

    const inserir = (productId: number, produto: any, qtd: number) => {
      // Produto que DESLIGOU o vasilhame depois de ter saldo continua aparecendo
      // se ainda houver casco na rua — esconder seria fingir que o galão voltou.
      if (!produto?.possuiVasilhame && qtd <= 0) return;
      const precoCents = Number(produto?.vasilhamePrecoCents) > 0 ? Math.trunc(Number(produto.vasilhamePrecoCents)) : 0;
      const anterior = porProduto.get(productId);
      const quantidade = anterior ? Math.max(anterior.qtd, qtd) : qtd;
      porProduto.set(productId, {
        productId,
        nome: String(produto?.name ?? ''),
        unidade: produto?.unidade ?? null,
        qtd: quantidade,
        precoCents,
        totalCents: quantidade * precoCents,
      });
    };

    for (const s of saldos) inserir(s.productId, s.product, Math.max(0, Math.trunc(Number(s.qtd) || 0)));
    for (const v of vinculos) if (!porProduto.has(v.productId)) inserir(v.productId, v.product, 0);

    const linhas = [...porProduto.values()].sort((a, b) => b.totalCents - a.totalCents || a.nome.localeCompare(b.nome));

    return {
      customerProfileId: clienteId,
      linhas,
      totalQtd: linhas.reduce((soma, l) => soma + l.qtd, 0),
      totalCents: linhas.reduce((soma, l) => soma + l.totalCents, 0),
    };
  }

  /**
   * MOVE O SALDO — injeção, devolução, ajuste ou perda.
   *
   * Saldo e extrato na MESMA transação: um sem o outro é o começo de um saldo que
   * ninguém consegue explicar. Devolver mais do que o cliente tem é RECUSADO (não
   * clampado em silêncio) — quem digitou 10 querendo 1 precisa ver o erro, não
   * descobrir depois que o patrimônio da empresa encolheu.
   */
  async registrarMovimento(
    companyId: number,
    input: RegistrarMovimentoInput,
  ): Promise<{ saldo: number; movimentoId: string; productId: number }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const clienteId = await this.assertClienteDaEmpresa(companyId, input?.customerProfileId);
    const produto = await this.assertProdutoComVasilhame(companyId, input?.productId);
    const tipo = this.normalizarTipo(input?.tipo);
    const qtd = this.normalizarQtd(input?.qtd);
    const motivo = String(input?.motivo ?? '').trim().slice(0, 240) || null;
    const userId = Number(input?.userId) > 0 ? Math.trunc(Number(input.userId)) : null;
    const entregaId = String(input?.entregaId ?? '').trim() || null;

    return this.prisma.$transaction(async (tx: any) => {
      const atual = await tx.vasilhameSaldo.findUnique({
        where: {
          companyId_customerProfileId_productId: {
            companyId,
            customerProfileId: clienteId,
            productId: produto.id,
          },
        },
        select: { id: true, qtd: true },
      });

      const saldoAtual = Math.max(0, Math.trunc(Number(atual?.qtd) || 0));
      const saldoDepois = aplicarMovimento(saldoAtual, tipo, qtd);

      if (saldoDepois < 0) {
        throw new BadRequestException(
          `O cliente está com ${saldoAtual} ${saldoAtual === 1 ? 'vasilhame' : 'vasilhames'} deste produto — não dá pra baixar ${qtd}.`,
        );
      }

      await tx.vasilhameSaldo.upsert({
        where: {
          companyId_customerProfileId_productId: {
            companyId,
            customerProfileId: clienteId,
            productId: produto.id,
          },
        },
        create: { companyId, customerProfileId: clienteId, productId: produto.id, qtd: saldoDepois },
        update: { qtd: saldoDepois },
      });

      const movimento = await tx.vasilhameMovimento.create({
        data: {
          companyId,
          customerProfileId: clienteId,
          productId: produto.id,
          tipo,
          // Grava JÁ ASSINADO: quem ler o extrato direto no banco não precisa
          // conhecer a regra do sinal pra somar a coluna.
          qtd: sinalDoTipo(tipo) * qtd,
          saldoDepois,
          motivo,
          userId,
          entregaId,
        },
        select: { id: true },
      });

      return { saldo: saldoDepois, movimentoId: movimento.id, productId: produto.id };
    });
  }

  /**
   * ── ONDA 2: A ENTREGA MOVE O SALDO SOZINHA ────────────────────────────────
   *
   * Chamado depois que a entrega vira 'entregue' (best-effort, FORA da transação
   * do confirmar — mesmo contrato da baixa de estoque). Para cada item de produto
   * com casco:
   *
   *     saldo += qtdEntregue − vasilhameRetornado
   *
   * ── Por que `vasilhameRetornado: null` NÃO move nada ───────────────────────
   * Null é "a folha nunca falou de casco" (APK velho, entrega legada); zero é "o
   * entregador conferiu e não voltou nenhum". Tratar null como zero faria toda
   * entrega de todo APK antigo injetar casco pra sempre — e em duas semanas de
   * troca-galão-por-galão o "Patrimônio na rua" mostraria um número inventado.
   * Número que mente é pior que número ausente: sem o campo, o saldo espera.
   *
   * ── IDEMPOTÊNCIA: (entregaId, productId) ──────────────────────────────────
   * O outbox do APK retenta o desfecho, e reabrir-corrigir-reconfirmar é rotina.
   * A régua não é "já mexi?" e sim **quanto já mexi**: o extrato desta entrega
   * para este produto é somado e só o DELTA anda. Confirmar 2× dá delta 0 (nada
   * acontece); corrigir 2 vazios pra 1 lança a diferença, com o rastro no motivo.
   * É a mesma escola do carimbo de dinheiro da rota e do dedup da baixa de
   * estoque — o extrato É a memória, não uma flag paralela que um dia diverge.
   *
   * A corrida de dois confirmares simultâneos já morre antes daqui: o núcleo do
   * `confirmarEntrega` só deixa UM ganhar o `updateMany` (os outros voltam como
   * replay sem chegar nos efeitos).
   *
   * Nunca escreve saldo direto: cada produto passa pelo `registrarMovimento`, que
   * é quem garante saldo+extrato na mesma transação. Um produto que falhar (ex.:
   * devolução maior que o saldo) vira AVISO e não derruba os outros nem a entrega.
   */
  async moverPorEntrega(
    companyId: number,
    entregaId: string,
    userId?: number | null,
  ): Promise<VasilhameEntregaResult> {
    const nada: VasilhameEntregaResult = { movidos: 0, avisos: [] };
    const id = String(entregaId || '').trim();
    if (!companyId || !id) return nada;

    const entrega = await this.prisma.entrega.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        customerProfileId: true,
        itens: {
          select: {
            productId: true,
            qtdPrevista: true,
            qtdEntregue: true,
            vasilhameRetornado: true,
            product: { select: { id: true, name: true, possuiVasilhame: true } },
          },
        },
      },
    });
    // Só entrega CONCLUÍDA move patrimônio. Cancelada/agendada não empresta casco.
    if (!entrega || entrega.status !== 'entregue') return nada;

    // Vários EntregaItem podem apontar pro MESMO produto (o add da chegada não
    // funde com o item planejado). O saldo é por [conta, produto], então a conta
    // fecha por PRODUTO — senão o 2º item viraria um 2º movimento pela metade.
    const liquidoPorProduto = new Map<number, number>();
    for (const item of entrega.itens || []) {
      const productId = Math.trunc(Number(item.productId));
      if (!Number.isInteger(productId) || productId <= 0) continue;
      if (!item.product?.possuiVasilhame) continue;
      if (item.vasilhameRetornado == null) continue; // a folha não falou de casco
      // "entregue ?? prevista" é a MESMA fórmula do resto do módulo (baixa de
      // estoque, histórico do cliente): stepper não mexido = saiu o previsto.
      const entregue = Math.max(0, Math.trunc(Number(item.qtdEntregue ?? item.qtdPrevista) || 0));
      const voltou = Math.max(0, Math.trunc(Number(item.vasilhameRetornado) || 0));
      liquidoPorProduto.set(productId, (liquidoPorProduto.get(productId) ?? 0) + (entregue - voltou));
    }
    if (liquidoPorProduto.size === 0) return nada;

    // O que ESTA entrega já moveu deste casco (assinado — ver `registrarMovimento`).
    const anteriores = await this.prisma.vasilhameMovimento.findMany({
      where: { companyId, entregaId: id, productId: { in: [...liquidoPorProduto.keys()] } },
      select: { productId: true, qtd: true },
    });
    const jaMovidoPorProduto = new Map<number, number>();
    for (const mov of anteriores) {
      jaMovidoPorProduto.set(mov.productId, (jaMovidoPorProduto.get(mov.productId) ?? 0) + (Number(mov.qtd) || 0));
    }

    let movidos = 0;
    const avisos: string[] = [];
    for (const [productId, liquido] of liquidoPorProduto) {
      const jaMovido = jaMovidoPorProduto.get(productId) ?? 0;
      const delta = liquido - jaMovido;
      if (delta === 0) continue; // replay do outbox, ou correção que não mudou nada
      try {
        await this.registrarMovimento(companyId, {
          customerProfileId: entrega.customerProfileId,
          productId,
          tipo: delta > 0 ? 'INJECAO' : 'DEVOLUCAO',
          qtd: Math.abs(delta),
          motivo: jaMovido === 0 ? 'Entrega confirmada na porta' : `Correção da entrega: ${jaMovido} → ${liquido}`,
          userId: userId ?? null,
          entregaId: id,
        });
        movidos += 1;
      } catch (e: any) {
        // Caso real: o cliente devolveu mais vazio do que a gente sabia que ele
        // tinha (casco de antes do sistema). Recusar e AVISAR é a lei da onda 1
        // — clampar em silêncio esconderia justamente o saldo que está errado.
        const nome = entrega.itens.find((it) => it.productId === productId)?.product?.name || `produto ${productId}`;
        avisos.push(`Vasilhame de "${nome}" não moveu: ${String(e?.message || e)}`);
      }
    }
    return { movidos, avisos };
  }

  /** EXTRATO do cliente — a prova de quem levou e quem devolveu. */
  async extratoDoCliente(
    companyId: number,
    customerProfileId: string,
    limite = 50,
  ): Promise<VasilhameMovimentoDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const clienteId = await this.assertClienteDaEmpresa(companyId, customerProfileId);
    const take = Math.min(200, Math.max(1, Math.trunc(Number(limite) || 50)));

    const rows = await this.prisma.vasilhameMovimento.findMany({
      where: { companyId, customerProfileId: clienteId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        productId: true,
        tipo: true,
        qtd: true,
        saldoDepois: true,
        motivo: true,
        userId: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    });

    return rows.map((r: any) => ({
      id: r.id,
      productId: r.productId,
      produtoNome: r.product?.name ?? null,
      tipo: r.tipo,
      qtd: r.qtd,
      saldoDepois: r.saldoDepois,
      motivo: r.motivo ?? null,
      userId: r.userId ?? null,
      createdAt: r.createdAt,
    }));
  }

  /**
   * PATRIMÔNIO NA RUA — o total da empresa e quem está com mais.
   *
   * É a tela que vende o módulo: "você tem R$11 mil em garrafão espalhado pela
   * cidade". Read-only e escopada por empresa.
   */
  async patrimonioNaRua(companyId: number, limiteClientes = 20) {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const take = Math.min(200, Math.max(1, Math.trunc(Number(limiteClientes) || 20)));

    const saldos = await this.prisma.vasilhameSaldo.findMany({
      where: { companyId, qtd: { gt: 0 } },
      select: {
        qtd: true,
        customerProfileId: true,
        productId: true,
        customerProfile: { select: { name: true, phone: true } },
        product: { select: { name: true, vasilhamePrecoCents: true } },
      },
    });

    let totalQtd = 0;
    let totalCents = 0;
    const porCliente = new Map<string, { customerProfileId: string; nome: string; qtd: number; totalCents: number }>();

    for (const s of saldos) {
      const qtd = Math.max(0, Math.trunc(Number(s.qtd) || 0));
      if (!qtd) continue;
      const precoCents =
        Number(s.product?.vasilhamePrecoCents) > 0 ? Math.trunc(Number(s.product.vasilhamePrecoCents)) : 0;
      const valor = qtd * precoCents;
      totalQtd += qtd;
      totalCents += valor;

      const chave = s.customerProfileId;
      const atual = porCliente.get(chave);
      if (atual) {
        atual.qtd += qtd;
        atual.totalCents += valor;
      } else {
        porCliente.set(chave, {
          customerProfileId: chave,
          nome: s.customerProfile?.name || 'Sem nome',
          qtd,
          totalCents: valor,
        });
      }
    }

    const clientes = [...porCliente.values()]
      .sort((a, b) => b.totalCents - a.totalCents || b.qtd - a.qtd)
      .slice(0, take);

    return { totalQtd, totalCents, clientes, clientesComCasco: porCliente.size };
  }
}
