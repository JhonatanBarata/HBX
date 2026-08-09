import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstoqueService } from '../fiscal/estoque.service';
import { ActorKindUserLike, isBillingOwnerActor } from '../access/actor-kind';
import {
  enderecoDaFonteMultilocal,
  linhaEnderecoDaFonte,
  resolverCoordenadaMultilocal,
} from './logistica-geo-fonte.util';
import { LogisticaAgendaService } from './logistica-agenda.service';
import {
  carregarVinculoItemSnapshot,
  parseDateOrNull,
  resolveValorUnit,
  VinculoItemSnapshot,
} from './logistica-recorrencia.util';

// As peças puras do vínculo moram em `logistica-recorrencia.util.ts` (a Agenda
// V2 também precisa delas, e este serviço agora INJETA a Agenda — importar de lá
// fecharia um ciclo de DI). Re-exportadas aqui pra ninguém ter que trocar de
// endereço: rota-modelo, fechamento-dia e os testes seguem importando daqui.
export { carregarVinculoItemSnapshot, parseDateOrNull, resolveValorUnit };

// "Cron" caseiro (o repo não usa @nestjs/schedule): varre 1×/dia + 1 passada
// atrasada no boot. INERTE por default — só toca empresas que ligaram
// LogisticaConfig.gerarDiaAutomatico (default false). Sem nenhuma empresa opt-in,
// o timer acorda, não encontra ninguém e volta a dormir (zero efeito).
const GERAR_DIA_SWEEP_MS = 24 * 60 * 60 * 1000;
const GERAR_DIA_BOOT_DELAY_MS = 30_000;

/**
 * LOGÍSTICA-MOBILE M2 (05/07) — amarração PRODUTO×CLIENTE + recorrência.
 *
 * Duas frentes:
 *  1) CRUD de `ClienteProduto` — o vínculo "cliente X leva N do produto Y, neste
 *     local, pelo preço P", company-scoped, validando que cliente e produto são
 *     da MESMA empresa (isolamento por-tenant duro).
 *
 *     🔴 O VÍNCULO NÃO É MAIS AGENDA (F2, 09/08). `diasSemana`,
 *     `frequenciaDias` e `proximaData` do `ClienteProduto` eram a agenda V1:
 *     duas tabelas respondendo "que dia este cliente recebe", com um espelho no
 *     meio pra tentar mantê-las iguais. A agenda mora INTEIRA em
 *     `LogisticaPlanoEntrega` e quem escreve dia é `definirDiasDoCliente`, que
 *     hoje escreve PLANO. O que sobrou aqui — preço, quantidade, local, ativo —
 *     é o papel VIVO da tabela (o fechamento do dia grava `precoAcordado` nela).
 *
 *  2) "Gerar entregas do dia" (POST /logistica/gerar-dia): delega pra Agenda V2,
 *     que materializa `Entrega` + `EntregaItem` a partir dos planos. IDEMPOTENTE
 *     por [companyId, customerProfileId, localId, dia]: rodar 2× no mesmo dia = 1
 *     entrega por (cliente, local). (MULTILOCAL 10/07 — antes era só cliente+dia.)
 *
 * ── BACKWARD-COMPAT (regra dura do M2) ───────────────────────────────────────
 * Ao criar a Entrega, além de gravar os `EntregaItem`, mantemos `Entrega.quantidade`
 * e `Entrega.valor` COERENTES (soma dos itens) — assim o N6 (confirmarEntrega,
 * cobrança) segue funcionando sem alteração. A Entrega vira multi-produto, mas os
 * campos escalares legados continuam a valer.
 *
 * ── SEM EFEITO EXTERNO ───────────────────────────────────────────────────────
 * Gerar o dia é 100% interno (grava linhas). Não dispara WhatsApp nem cobrança —
 * isso só acontece no CONFIRMAR (N6), atrás de HBX_LOGISTICA_ENABLED. O cron que
 * chama este serviço vive atrás de LogisticaConfig.gerarDiaAutomatico (default OFF).
 */
@Injectable()
export class LogisticaRecorrenciaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticaRecorrenciaService.name);
  private gerarDiaSweepHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    // 🔴 A AGENDA V2 É O ÚNICO GERADOR (F1, 09/08). `gerarDia`/`getDiaPreview`
    // não têm mais motor próprio: delegam pra cá, sem `if` nenhum. @Optional
    // porque os testes legados instanciam este serviço só com o prisma pra
    // exercitar o CRUD de vínculo — quem chamar gerar/prévia sem a Agenda
    // recebe erro EXPLÍCITO (nunca um dia vazio calado).
    @Optional() private readonly agenda?: LogisticaAgendaService,
    // ESTOQUE NO APP (07/08, decisão do dono). @Optional pelo mesmo motivo do
    // `cargaEstoque` do logistica-rota.service: testes legados instanciam este
    // serviço só com o prisma, e sem estoque a lista de produtos segue igual.
    @Optional() private readonly estoque?: EstoqueService,
  ) {}

  /** A Agenda V2 é obrigatória pra gerar/prever o dia — ausência é bug de wiring. */
  private agendaOuErro(): LogisticaAgendaService {
    if (!this.agenda) {
      throw new BadRequestException('Agenda de entregas indisponível.');
    }
    return this.agenda;
  }

  /**
   * SALDO DISPONÍVEL por produto da logística — vazio quando a empresa não
   * ligou o controle de estoque.
   *
   * 🔴 QUEM DECIDE É O ADMIN, NO DESKTOP: o gate é `FiscalTenantProfile
   * .estoqueAtivo`, o mesmo que os ganchos de baixa/reserva já respeitam.
   * Empresa que não ligou não recebe o campo — e a tela do app, que só mostra
   * o que existe, continua exatamente como está hoje.
   *
   * 🔴 E O NÚMERO É O *DISPONÍVEL* (físico − reservado), não o físico: o galpão
   * pode ter 100 com 40 já reservados pras rotas do dia, e quem olha o app
   * precisa saber que só pode contar com 60. A matemática NÃO é refeita aqui —
   * vem inteira do EstoqueService, que é o dono dela.
   */
  private async disponivelPorProdutoLogistica(
    companyId: number,
    produtoIds: number[],
  ): Promise<Map<number, number>> {
    const vazio = new Map<number, number>();
    if (!this.estoque || !produtoIds.length) return vazio;
    try {
      const perfil = await (this.prisma as any).fiscalTenantProfile.findUnique({
        where: { companyId },
        select: { estoqueAtivo: true },
      });
      if (!perfil?.estoqueAtivo) return vazio;
      const vinculos = await (this.prisma as any).estoqueProduto.findMany({
        where: { companyId, ativo: true, logisticaProductId: { in: produtoIds } },
        select: { id: true, logisticaProductId: true },
      });
      if (!vinculos.length) return vazio;
      const saldos = await this.estoque.saldos(companyId);
      const out = new Map<number, number>();
      for (const v of vinculos) {
        if (v.logisticaProductId == null) continue;
        const saldo = saldos.get(v.id);
        // Produto vinculado SEM movimento nenhum tem saldo zero de verdade —
        // isso é informação (ele existe e está zerado), não ausência.
        out.set(Number(v.logisticaProductId), saldo ? Number(saldo.disponivel) || 0 : 0);
      }
      return out;
    } catch (e) {
      // Estoque é ENFEITE nesta lista: se o fiscal tossir, a lista de produtos
      // (que é o que faz o app funcionar) não pode cair junto.
      // 🔴 MAS BEST-EFFORT QUE ENGOLE ERRO PRECISA DE ALARME (lei da casa, paga
      // com 23M de endereços desligados 5 dias em silêncio): o saldo some da
      // tela sem explicação nenhuma se este catch for mudo.
      this.logger.warn(`[estoque] saldo indisponível para a empresa ${companyId}: ${String((e as any)?.message || e)}`);
      return vazio;
    }
  }

  // ── CRON "gerar dia automático" (INERTE por default) ─────────────────────────
  onModuleInit() {
    this.gerarDiaSweepHandle = setInterval(() => {
      void this.sweepGerarDiaAutomatico('interval');
    }, GERAR_DIA_SWEEP_MS);
    // 1 passada atrasada no boot (não roda EM boot — respiro de 30s; ainda assim
    // só faz algo se alguma empresa tiver gerarDiaAutomatico=true).
    setTimeout(() => {
      void this.sweepGerarDiaAutomatico('startup');
    }, GERAR_DIA_BOOT_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.gerarDiaSweepHandle) clearInterval(this.gerarDiaSweepHandle);
    this.gerarDiaSweepHandle = null;
  }

  /**
   * Passada do cron: só as empresas que LIGARAM gerarDiaAutomatico entram. Sem
   * opt-in = no-op total (nenhuma escrita). Cada empresa roda o gerarDia idempotente
   * de HOJE — repetir não duplica. Falha de uma não derruba as outras.
   */
  private async sweepGerarDiaAutomatico(trigger: 'startup' | 'interval'): Promise<void> {
    let configs: Array<{ companyId: number }> = [];
    try {
      configs = await this.prisma.logisticaConfig.findMany({
        where: { gerarDiaAutomatico: true },
        select: { companyId: true },
      });
    } catch (e: any) {
      this.logger.warn(`[logistica] gerar-dia cron (${trigger}) falhou ao listar configs: ${String(e?.message || e)}`);
      return;
    }
    if (configs.length === 0) return; // ninguém opt-in → inerte
    for (const c of configs) {
      try {
        await this.gerarDia(c.companyId);
      } catch (e: any) {
        this.logger.warn(
          `[logistica] gerar-dia cron (${trigger}) company=${c.companyId} falhou: ${String(e?.message || e)}`,
        );
      }
    }
  }

  // ── CRUD ClienteProduto ─────────────────────────────────────────────────────
  async listByCliente(
    companyId: number,
    customerProfileId: string,
    actor?: ActorKindUserLike,
  ): Promise<ClienteProdutoDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const billingAudience = isBillingOwnerActor(actor);
    const [rows, dias] = await Promise.all([
      this.prisma.clienteProduto.findMany({
        where: { companyId, customerProfileId: cid },
        orderBy: [{ ativo: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          customerProfileId: true,
          productId: true,
          qtdPadrao: true,
          ...(billingAudience ? { precoAcordado: true as const } : {}),
          ativo: true,
          localId: true,
          product: {
            select: {
              id: true,
              name: true,
              unidade: true,
              ...(billingAudience ? { price: true as const, priceCents: true as const } : {}),
            },
          },
        },
      }),
      this.diasDaVisita(companyId, cid),
    ]);
    return rows.map((row) => serializeClienteProduto(row, billingAudience, dias));
  }

  /**
   * 🔴 O DIA VEM DO PLANO, SEMPRE (F2, 09/08). `ClienteProduto.diasSemana` era a
   * 2ª verdade que fazia a tela discordar da rota; a resposta certa é a mesma
   * que o traçar rota e o gerar-dia leem: `LogisticaPlanoEntrega.diaSemana`.
   *
   * Continua saindo no DTO do vínculo (formato "1,3,5") porque o dia é do
   * CLIENTE e vale pra todos os vínculos dele — é PROJEÇÃO de leitura, nunca
   * armazenamento. Quem grava é `definirDiasDoCliente`, e grava no plano.
   */
  private async diasDaVisita(companyId: number, customerProfileId: string): Promise<string | null> {
    const planos = await this.prisma.logisticaPlanoEntrega.findMany({
      where: { companyId, customerProfileId, ativo: true },
      select: { diaSemana: true },
    });
    const dias = [...new Set(
      planos.map((p) => Math.trunc(Number(p.diaSemana))).filter((d) => d >= 1 && d <= 7),
    )].sort((a, b) => a - b);
    return dias.length ? dias.join(',') : null;
  }

  async create(companyId: number, input: CreateClienteProdutoInput): Promise<ClienteProdutoDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const customerProfileId = String(input.customerProfileId || '').trim();
    if (!customerProfileId) throw new BadRequestException('Cliente é obrigatório.');

    // Cliente e produto DESTA empresa (isolamento por-tenant duro).
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: customerProfileId, companyId },
      select: { id: true },
    });
    if (!conta) throw new NotFoundException('Cliente não encontrado');
    const product = await this.prisma.product.findFirst({
      where: { id: Number(input.productId), companyId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    // 🔴 27/07 (dono, SEM LEGADO): o dia NÃO vem do produto. E desde a F2
    // (09/08) o vínculo NÃO GUARDA DIA NENHUM: o dia da visita é do CLIENTE e
    // mora em `LogisticaPlanoEntrega`. Produto novo entra nas visitas ATIVAS do
    // cliente pela sincronização do cadastro (`espelharVinculoCadastro`, que o
    // controller chama logo depois deste create); cliente que ainda não tem dia
    // ganha as visitas quando alguém chamar `PATCH /logistica/clientes/:id/dias`.
    this.avisarCadenciaIgnorada('create', companyId, input);

    // MULTILOCAL (10/07) — em qual local este vínculo é entregue. Valida contra o
    // MESMO cliente+empresa; inválido/de-outro-cliente → null (o gerar-dia cai no
    // grupo "sem local", agregando com o principal — leniência igual ao contato/produto).
    const localId = await this.resolveLocalDoCliente(companyId, conta.id, input.localId);

    // TASK 5 (08/07) — @@unique([companyId, customerProfileId, productId]) foi
    // REMOVIDO do schema: o mesmo produto pode ser vinculado 2× ao mesmo cliente
    // (ex.: 1 galão na segunda, outro na sexta, vínculos separados). Sem índice
    // único, este create() não estoura mais P2002 de duplicado — o vínculo
    // repetido é intencional e permitido.
    const created = await this.prisma.clienteProduto.create({
      data: {
        companyId,
        customerProfileId: conta.id,
        productId: product.id,
        qtdPadrao: Math.max(1, Math.trunc(Number(input.qtdPadrao) || 1)),
        precoAcordado:
          input.precoAcordado != null && Number.isFinite(Number(input.precoAcordado))
            ? Math.max(0, Number(input.precoAcordado))
            : null,
        ativo: input.ativo !== false,
        localId,
      },
      select: cpSelect,
    });
    return serializeClienteProduto(created, true, await this.diasDaVisita(companyId, conta.id));
  }

  /**
   * 🔴 CADÊNCIA NÃO EXISTE MAIS NO VÍNCULO (F2, 09/08). Os endpoints ainda
   * ACEITAM `frequenciaDias`/`proximaData` no corpo — o `ValidationPipe` roda com
   * `forbidNonWhitelisted`, então tirar os campos do DTO viraria 400 na cara de
   * cliente já publicado (tela /contatos, APK em campo). O servidor IGNORA os
   * dois; quem define cadência é a Agenda, por visita.
   *
   * Ignorar CALADO é o que a casa proíbe: se alguém ainda manda, sai no log.
   */
  private avisarCadenciaIgnorada(
    origem: string,
    companyId: number,
    input: { frequenciaDias?: number | null; proximaData?: string | null },
  ): void {
    const campos: string[] = [];
    if (input?.frequenciaDias != null) campos.push('frequenciaDias');
    if (input?.proximaData != null) campos.push('proximaData');
    if (!campos.length) return;
    this.logger.warn(
      `[logistica] vínculo ${origem} company=${companyId}: ${campos.join('/')} IGNORADO — cadência mora na Agenda (LogisticaPlanoEntrega), não no ClienteProduto.`,
    );
  }

  /**
   * 🔴 O ÚNICO caminho de escrita de dia da semana no sistema (27/07, ordem do
   * dono) — e desde a F2 (09/08) ele escreve onde o dia REALMENTE mora:
   * `LogisticaPlanoEntrega`.
   *
   * Antes isto gravava `diasSemana` em cada vínculo e um ESPELHO copiava aquilo
   * pros planos depois; o gerar-dia lia só o plano, então toda falha do espelho
   * virava "o dia está na tela do cadastro e o cliente não aparece na rota". A
   * mão foi invertida: escreve-se o plano, e o cadastro passou a LER dele.
   *
   * Define os dias da VISITA do cliente de uma vez (nunca mais produto A na
   * terça e produto B na quinta). Lista vazia = cliente sem dia fixo — as
   * visitas são PAUSADAS, os vínculos (preço/quantidade) ficam intactos.
   *
   * Devolve os ids dos vínculos ativos: o controller usa pra sincronizar o item
   * de cada um nas visitas (idempotente — o plano já nasce com eles dentro).
   */
  async definirDiasDoCliente(
    companyId: number,
    customerProfileId: string,
    dias: number[],
  ): Promise<{ vinculoIds: string[]; diasSemana: string | null; avisos: string[] }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const conta = await this.prisma.customerProfile.findFirst({
      where: { id: String(customerProfileId || '').trim(), companyId },
      select: { id: true },
    });
    if (!conta) throw new NotFoundException('Cliente não encontrado');

    const res = await this.agendaOuErro().definirDiasDaVisita(companyId, conta.id, dias || []);
    const vinculos = await this.prisma.clienteProduto.findMany({
      where: { companyId, customerProfileId: conta.id, ativo: true },
      select: { id: true },
    });
    return { vinculoIds: vinculos.map((v) => v.id), diasSemana: res.diasSemana, avisos: res.avisos };
  }

  /**
   * MULTILOCAL — resolve o localId a gravar num vínculo: só aceita um LocalEntrega
   * do MESMO cliente+empresa; qualquer outra coisa (vazio, inexistente, de outro
   * cliente) vira null (default = grupo sem-local no gerar-dia, que pós-backfill
   * agrega com o principal). Não lança — leniência igual à do contato na entrega.
   */
  private async resolveLocalDoCliente(
    companyId: number,
    customerProfileId: string,
    localId?: string | null,
  ): Promise<string | null> {
    const want = String(localId || '').trim();
    if (!want) return null;
    const loc = await this.prisma.localEntrega.findFirst({
      where: { id: want, companyId, customerProfileId },
      select: { id: true },
    });
    return loc?.id ?? null;
  }

  async update(companyId: number, id: string, input: UpdateClienteProdutoInput): Promise<ClienteProdutoDTO | null> {
    if (!companyId || !id) return null;
    const existing = await this.prisma.clienteProduto.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true, customerProfileId: true },
    });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.qtdPadrao != null) data.qtdPadrao = Math.max(1, Math.trunc(Number(input.qtdPadrao)));
    // MULTILOCAL — trocar o local do vínculo (valida contra o cliente dono; inválido → null).
    if (input.localId !== undefined)
      data.localId = await this.resolveLocalDoCliente(companyId, existing.customerProfileId, input.localId);
    if (input.precoAcordado !== undefined)
      data.precoAcordado =
        input.precoAcordado != null && Number.isFinite(Number(input.precoAcordado))
          ? Math.max(0, Number(input.precoAcordado))
          : null;
    if (input.ativo !== undefined) data.ativo = !!input.ativo;
    // (dia, frequência e próxima data NÃO se editam por aqui — a agenda é do
    // CLIENTE e mora no plano: `definirDiasDoCliente` / tela da Agenda)
    this.avisarCadenciaIgnorada('update', companyId, input);

    const updated = await this.prisma.clienteProduto.update({
      where: { id: existing.id },
      data,
      select: cpSelect,
    });
    return serializeClienteProduto(
      updated,
      true,
      await this.diasDaVisita(companyId, existing.customerProfileId),
    );
  }

  /** Liga/desliga o vínculo (atalho do toggle da UI). */
  async toggleAtivo(companyId: number, id: string, ativo: boolean): Promise<ClienteProdutoDTO | null> {
    return this.update(companyId, id, { ativo });
  }

  /**
   * Snapshot do ITEM do vínculo ANTES de uma mutação, pro cadastro sincronizar a
   * diferença nas visitas do cliente (LogisticaAgendaService
   * .espelharVinculoCadastro). Null = não existe.
   *
   * 🔴 F2 (09/08): o snapshot NÃO carrega mais cadência — só produto,
   * quantidade, preço e local. O dia da visita vem do plano.
   */
  async vinculoEspelhoSnapshot(companyId: number, id: string): Promise<VinculoItemSnapshot | null> {
    return carregarVinculoItemSnapshot(this.prisma, companyId, id);
  }

  /**
   * TASK 9 (08/07) — REMOVE o vínculo produto×cliente de VEZ (hard delete, o "-"
   * da UI). Diferente do toggleAtivo (que só pausa, ativo=false): aqui o vínculo
   * some do banco. company-scoped: só apaga se o id for desta empresa; senão
   * devolve false (o controller vira 404). Não toca entregas já geradas — o
   * gerarDia é que lê os vínculos vivos, então remover só impede recorrências
   * FUTURAS. Sem efeito externo.
   */
  async remove(companyId: number, id: string): Promise<boolean> {
    if (!companyId || !id) return false;
    const existing = await this.prisma.clienteProduto.findFirst({
      where: { id: String(id).trim(), companyId },
      select: { id: true },
    });
    if (!existing) return false;
    await this.prisma.clienteProduto.delete({ where: { id: existing.id } });
    return true;
  }

  /**
   * Catálogo de produtos da empresa para o seletor da UI "Produtos do cliente".
   * Prioriza os marcados usaLogistica (item de entrega), mas devolve todos os
   * ativos para não travar o cadastro. Company-scoped.
   */
  async listProdutos(companyId: number, actor?: ActorKindUserLike): Promise<ProdutoOptionDTO[]> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const billingAudience = isBillingOwnerActor(actor);
    const rows = await this.prisma.product.findMany({
      where: { companyId, status: 'active', kind: 'tenant_product' },
      orderBy: [{ usaLogistica: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: 500,
      select: {
        id: true,
        name: true,
        unidade: true,
        usaLogistica: true,
        ...(billingAudience ? { price: true as const, priceCents: true as const } : {}),
      },
    });
    const disponivel = await this.disponivelPorProdutoLogistica(companyId, rows.map((p) => p.id));
    return rows.map((p) => ({
      id: p.id,
      nome: p.name,
      unidade: p.unidade ?? null,
      usaLogistica: p.usaLogistica,
      ...(disponivel.has(p.id) ? { estoqueDisponivel: disponivel.get(p.id) } : {}),
      ...(billingAudience
        ? {
            precoCatalogo:
              typeof p.priceCents === 'number'
                ? p.priceCents / 100
                : typeof p.price === 'number'
                  ? p.price
                  : null,
          }
        : {}),
    }));
  }

  // ── PR18072026 W1 — façade de produtos sob /logistica (allowlist do APK) ────
  /**
   * POST /logistica/produtos — cria um produto do catálogo do tenant DIRETO
   * (o app do entregador só fala com `logistica/*`, não `/products`). Nasce
   * `kind='tenant_product'`, `status='active'`, `usaLogistica=true` (é o
   * catálogo do roteiro de entrega). Company-scoped (companyId do JWT).
   */
  async createProduto(companyId: number, input: CriarProdutoInput): Promise<ProdutoFacadeDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const nome = String(input.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Nome é obrigatório.');
    const priceCents = normalizePrecoCentavos(input.preco);
    const created = await this.prisma.product.create({
      data: {
        companyId,
        kind: 'tenant_product',
        status: 'active',
        name: nome.slice(0, 140),
        unidade: input.unidade?.trim() || null,
        usaLogistica: true,
        price: priceCents / 100,
        priceCents,
        stock: normalizeEstoque(input.estoque),
      },
    });
    return produtoFacadeDTO(created);
  }

  /**
   * PATCH /logistica/produtos/:id — nome/unidade/preço/estoque/ativo, company-
   * scoped (fail-closed: id de outra empresa → null, o controller vira 404).
   * Arquivar (`ativo:false`) mapeia para `Product.status='archived'` — some do
   * picker (listProdutos filtra `status:'active'`) sem quebrar vínculos
   * existentes (ClienteProduto/EntregaItem seguem apontando pro mesmo id).
   */
  async updateProduto(companyId: number, id: string, input: Partial<CriarProdutoInput> & { ativo?: boolean }): Promise<ProdutoFacadeDTO | null> {
    if (!companyId || !id) return null;
    const productId = Math.trunc(Number(id));
    if (!Number.isInteger(productId) || productId <= 0) return null;
    const existing = await this.prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
    if (!existing) return null;

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) {
      const nome = String(input.nome).trim();
      if (!nome) throw new BadRequestException('Nome é obrigatório.');
      data.name = nome.slice(0, 140);
    }
    if (input.unidade !== undefined) data.unidade = String(input.unidade).trim() || null;
    if (input.preco !== undefined) {
      const priceCents = normalizePrecoCentavos(input.preco);
      data.priceCents = priceCents;
      data.price = priceCents / 100;
    }
    if (input.estoque !== undefined) data.stock = normalizeEstoque(input.estoque);
    // Arquivar = ativo=false: some do picker (listProdutos filtra status:'active')
    // sem quebrar vínculos existentes (produto continua existindo no banco).
    if (input.ativo !== undefined) data.status = input.ativo ? 'active' : 'archived';

    const updated = await this.prisma.product.update({ where: { id: existing.id }, data });
    return produtoFacadeDTO(updated);
  }

  // ── GERAR ENTREGAS DO DIA ────────────────────────────────────────────────────
  /**
   * 🔴 UM GERADOR SÓ (F1, 09/08) — quem materializa o dia é a AGENDA V2
   * (`LogisticaPlanoEntrega`), sempre, sem condicional nenhuma.
   *
   * Até aqui existiam TRÊS geradores para a mesma pergunta ("quem entra na rota
   * de hoje?"): este corpo legado lendo `ClienteProduto`, o motor de ocorrências
   * (`logistica-occurrence.service.ts`) e a Agenda V2 — com um `if
   * (agendaV2Ativa)` escolhendo. As 9 empresas com `LogisticaConfig` medidas em
   * produção estavam TODAS em V2: os outros dois eram ramo morto mantido vivo
   * pelo `if`, e cada lista a mais era uma chance de duas telas discordarem.
   * Ficou UMA lista: a agenda.
   */
  async gerarDia(companyId: number, dateInput?: string): Promise<any> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    return this.agendaOuErro().generateDay(companyId, dateInput);
  }

  /**
   * READ-ONLY: quem vai cair na rota do dia, ANTES de materializar nada (pop-up
   * "Gerar entregas" do app). Mesma fonte do `gerarDia` — a Agenda V2 — porque
   * prévia que lê uma lista e geração que lê outra é a receita da tela que
   * mente.
   */
  async getDiaPreview(
    companyId: number,
    dateInput?: string,
    _actor?: ActorKindUserLike,
  ): Promise<any> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const date = parseDateOrNull(dateInput) ?? new Date();
    const preview = await this.agendaOuErro().getDayPreview(companyId, isoDow(date), dateInput);
    return {
      date: preview.date,
      clientes: preview.paradas.map((stop: any) => {
        // FIX (25/07) — mesmo bug do toStop (logistica-rota.service.ts): campo a
        // campo podia combinar a lat de uma fonte com a lng de outra.
        // resolverCoordenadaMultilocal escolhe a fonte inteira (local só vale com
        // lat E lng válidos; stop.cliente não tem geoFonte — clienteDto não expõe).
        const coord = resolverCoordenadaMultilocal(stop.local, stop.cliente);
        // 🔴 O ENDEREÇO VAI JUNTO, DA MESMA FONTE DO PINO (09/08, ordem do dono:
        // "celular tem que espelhar os mesmos dados que o desktop tem"). Até aqui
        // a prévia mandava só o APELIDO do local — e apelido é APELIDO: na empresa
        // 41 os 51 clientes de segunda têm apelido vazio e rua preenchida, então a
        // montagem do APK listava 51 cartões com o endereço EM BRANCO enquanto o
        // computador mostrava a rua inteira. Mesma régua da conferência, e por
        // isso a mesma função (nunca a rua de um com o CEP do outro).
        const endereco = enderecoDaFonteMultilocal(stop.local, stop.cliente);
        return {
          customerProfileId: stop.customerProfileId,
          nome: stop.cliente?.nome || 'Cliente',
          localId: stop.localId ?? null,
          localApelido: stop.local?.apelido ?? null,
          endereco: endereco.endereco,
          numero: endereco.numero,
          complemento: endereco.complemento,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          uf: endereco.uf,
          cep: endereco.cep,
          enderecoLinha: linhaEnderecoDaFonte(endereco),
          lat: coord.lat,
          lng: coord.lng,
          geoFonte: coord.geoFonte,
          itens: (stop.itens ?? []).map((item: any) => ({
            productId: item.productId,
            nome: item.nome || 'Produto',
            qtd: item.qtd,
            valorUnit: Number(item.valorUnit || 0),
          })),
          observacoes: stop.instrucoes ?? null,
          agendaPlanoId: stop.planoEntregaId,
        };
      }),
    };
  }

}

// ── helpers de data / dias-da-semana ────────────────────────────────────────────
/** "1,3,5" → [1,3,5] (ISO 1=seg…7=dom); lixo é descartado. */
export function parseDiasSemana(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => Math.trunc(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
}

/** ISO day-of-week: 1=segunda … 7=domingo (JS getDay: 0=dom). */
export function isoDow(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

// ── serialização / tipos ────────────────────────────────────────────────────────
const cpSelect = {
  id: true,
  customerProfileId: true,
  productId: true,
  qtdPadrao: true,
  precoAcordado: true,
  ativo: true,
  localId: true,
  product: { select: { id: true, name: true, unidade: true, price: true, priceCents: true } },
} as const;

function serializeClienteProduto(
  r: any,
  billingAudience: boolean,
  diasSemana: string | null,
): ClienteProdutoDTO {
  return {
    id: r.id,
    customerProfileId: r.customerProfileId,
    productId: r.productId,
    qtdPadrao: r.qtdPadrao,
    ...(billingAudience ? { precoAcordado: r.precoAcordado ?? null } : {}),
    // PROJEÇÃO do plano (F2) — o vínculo não guarda dia. Mesmo valor pra todos os
    // vínculos do cliente, porque o dia é da VISITA.
    diasSemana,
    ativo: r.ativo,
    localId: r.localId ?? null,
    produto: r.product
      ? {
          id: r.product.id,
          nome: r.product.name,
          unidade: r.product.unidade ?? null,
          ...(billingAudience
            ? {
                precoCatalogo:
                  typeof r.product.priceCents === 'number'
                    ? r.product.priceCents / 100
                    : typeof r.product.price === 'number'
                      ? r.product.price
                      : null,
              }
            : {}),
        }
      : null,
  };
}

// 🔴 `frequenciaDias`/`proximaData` continuam DECLARADOS e são IGNORADOS (F2):
// o `ValidationPipe` global roda com `forbidNonWhitelisted`, então sumir com o
// campo daria 400 em cliente publicado. Cadência é da Agenda. Ver
// `avisarCadenciaIgnorada`.
export interface CreateClienteProdutoInput {
  customerProfileId: string;
  productId: number;
  qtdPadrao?: number;
  precoAcordado?: number;
  /** @deprecated ACEITO E IGNORADO — cadência mora em LogisticaPlanoEntrega. */
  frequenciaDias?: number;
  /** @deprecated ACEITO E IGNORADO — cadência mora em LogisticaPlanoEntrega. */
  proximaData?: string;
  ativo?: boolean;
  localId?: string;
}

export interface UpdateClienteProdutoInput {
  qtdPadrao?: number;
  precoAcordado?: number;
  /** @deprecated ACEITO E IGNORADO — cadência mora em LogisticaPlanoEntrega. */
  frequenciaDias?: number;
  /** @deprecated ACEITO E IGNORADO — cadência mora em LogisticaPlanoEntrega. */
  proximaData?: string;
  ativo?: boolean;
  localId?: string;
}

export interface ClienteProdutoDTO {
  id: string;
  customerProfileId: string;
  productId: number;
  qtdPadrao: number;
  precoAcordado?: number | null;
  /** Dias da VISITA (projeção de LogisticaPlanoEntrega) — leitura, nunca escrita. */
  diasSemana: string | null;
  ativo: boolean;
  localId: string | null;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo?: number | null } | null;
}

export interface ProdutoOptionDTO {
  id: number;
  nome: string;
  unidade: string | null;
  usaLogistica: boolean;
  precoCatalogo?: number | null;
  /**
   * ADITIVO (07/08) — saldo DISPONÍVEL do estoque fiscal. Só existe quando o
   * tenant ligou `FiscalTenantProfile.estoqueAtivo` E o produto tem vínculo
   * (`EstoqueProduto.logisticaProductId`). Ausente = a empresa não controla
   * estoque; o app esconde o campo em vez de mostrar zero.
   */
  estoqueDisponivel?: number;
}

// ── PR18072026 W1 — façade de produtos ────────────────────────────────────────
export interface CriarProdutoInput {
  nome: string;
  unidade?: string;
  preco?: number;
  estoque?: number;
}

export interface ProdutoFacadeDTO {
  id: number;
  nome: string;
  unidade: string | null;
  preco: number;
  estoque: number;
  ativo: boolean;
}

function normalizePrecoCentavos(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('preco inválido.');
  return Math.round(n * 100);
}

function normalizeEstoque(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Math.trunc(Number(value));
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException('estoque inválido.');
  return n;
}

function produtoFacadeDTO(row: { id: number; name: string; unidade: string | null; price: number | null; priceCents: number | null; stock: number | null; status: string }): ProdutoFacadeDTO {
  return {
    id: row.id,
    nome: row.name,
    unidade: row.unidade ?? null,
    preco: typeof row.priceCents === 'number' ? row.priceCents / 100 : typeof row.price === 'number' ? row.price : 0,
    estoque: row.stock ?? 0,
    ativo: row.status === 'active',
  };
}
