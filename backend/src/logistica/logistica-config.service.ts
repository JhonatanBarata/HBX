import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { isBillingOwnerActor, type ActorKindUserLike } from '../access/actor-kind';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { isCobrancaWhatsEnabled } from './logistica-cobranca.flags';
import { isPedidoPublicoEnabled } from './logistica-pedido.flags';
import { isLogisticaTrackingEnabled } from './logistica-tracking.flags';
import { isResumoDiarioEnabled } from './resumo-diario.flags';

/**
 * LOGÍSTICA-MOBILE M5 (05/07) — REGRAS DO ADMIN.
 *
 * Duas coisas:
 *  1) CRUD de LogisticaConfig (1/empresa): o admin edita o template do aviso de
 *     WhatsApp "entregue", os toggles (avisar global, cobrança na entrega, gerar
 *     dia automático) e os parâmetros de rota (raio de chegada, velocidade média,
 *     tempo de parada). company-scoped; cria um default se ainda não existir.
 *  2) `renderTemplateAviso` (função PURA, testável isolada): troca as variáveis
 *     públicas do template do admin. É o que o
 *     N6 (dispararWhatsappEntregue) passa a usar no lugar da mensagem fixa.
 *
 * ── SEM EFEITO EXTERNO ───────────────────────────────────────────────────────
 * Este serviço só lê/grava a config e formata texto. NÃO dispara WhatsApp, NÃO
 * cria cobrança, NÃO toca o caminho blindado. O disparo continua sendo do N6,
 * atrás de HBX_LOGISTICA_ENABLED (default OFF) + os 2 níveis de aviso (global e
 * por cliente) resolvidos aqui em `avisoHabilitado`.
 */
@Injectable()
export class LogisticaConfigService {
  private readonly logger = new Logger(LogisticaConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  // ── LER (cria default se não existir) ────────────────────────────────────────
  /**
   * Devolve a config da empresa. Se ainda não existe uma linha, cria com os
   * defaults do schema (idempotente — 2 chamadas concorrentes não duplicam por
   * causa do @@unique([companyId])). company-scoped.
   */
  async getConfig(companyId: number, actor?: ActorKindUserLike): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    return serializeConfig(cfg, actor, creditosEsgotados);
  }

  /**
   * S7 (PR22072026-APP-SOUNDS) — deriva o BOOLEANO "acabaram os créditos" a
   * partir do MESMO saldo do extrato admin (CreditWalletService.getBalance),
   * sem vazar o número: este método nunca devolve o saldo, só <= 0 ou não. É
   * consumido por `/logistica/config`, que o app do entregador já lê SEM ser
   * admin (GET sem @Admin()) — assim o motorista finalmente recebe o FATO
   * ("não dá pra rodar hoje") sem precisar do endpoint admin-only do extrato
   * (`/logistica/creditos/extrato`, que devolveria 403 pra ele).
   * Fail-open: qualquer erro na consulta devolve `false` (não tranca) — igual
   * ao `catch (_) { state.creditsLock = null; }` do app: uma falha de leitura
   * de saldo nunca pode travar o app de quem está tentando trabalhar.
   */
  private async computeCreditosEsgotados(companyId: number): Promise<boolean> {
    try {
      const balance = await this.wallet.getBalance(companyId);
      return Number.isFinite(balance) && balance <= 0;
    } catch (e: any) {
      this.logger.warn(`[logistica] computeCreditosEsgotados company=${companyId} falhou: ${String(e?.message || e)}`);
      return false;
    }
  }

  /**
   * Fonte única do modo EFETIVO usado pela inicialização e pela cobrança.
   * A preferência TRACKED fica dormente enquanto qualquer um dos dois gates
   * (flag global + toggle do tenant) estiver desligado.
   *
   * ── 26/07 — LOGÍSTICA SIMPLES É O PADRÃO DE TODO MUNDO (ordem do dono) ──────
   * Empresa nova nasce ESSENTIAL: o schema defaulta `modoRotaPadrao='ESSENTIAL'`
   * e `trackingAtivo=false`, e `ensureRow` cria a linha SÓ com o companyId — não
   * existe caminho de código que faça uma empresa nascer Rastreada. A Rastreada
   * continua inteira no backend, dormente, e só liga por AÇÃO EXPLÍCITA DO
   * ADMINISTRADOR NO PC (`/logistica/config` → "Modo das novas rotas", PATCH
   * admin + billing owner). O celular não escolhe mais o modo — o modal do APK
   * saiu em 26/07.
   */
  async resolveRouteMode(companyId: number): Promise<LogisticaRouteMode> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    return effectiveRouteMode(cfg);
  }

  /** Linha crua da config (cria o default se não existir) — base do getConfig e
   *  dos métodos de token do pedido público (S6). Idempotente sob corrida (P2002). */
  private async ensureRow(companyId: number) {
    let cfg = await this.prisma.logisticaConfig.findUnique({ where: { companyId } });
    if (!cfg) {
      try {
        cfg = await this.prisma.logisticaConfig.create({ data: { companyId } });
      } catch (e: any) {
        // corrida: outra requisição criou primeiro → relê.
        if (String(e?.code) === 'P2002') {
          cfg = await this.prisma.logisticaConfig.findUnique({ where: { companyId } });
        } else {
          throw e;
        }
      }
    }
    if (!cfg) throw new BadRequestException('Não foi possível carregar a configuração.');
    return cfg;
  }

  // ── S6 PORTAL-PEDIDO — token OPACO do link público /pedido/<token> ───────────
  /**
   * Garante o token do link público (idempotente: emite se a empresa ainda não
   * tiver um; chamadas repetidas devolvem o MESMO token). Molde do
   * ensureWebsiteCaptureToken (website-runtime.ts): randomBytes(24).hex — opaco,
   * não sequencial, NUNCA companyId/slug na URL. Só grava o token; NÃO liga o
   * toggle (pedidoPublicoAtivo é decisão separada do admin).
   */
  async ensurePedidoPublicoToken(companyId: number): Promise<string> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    const atual = String((cfg as any).pedidoPublicoToken || '').trim();
    if (atual) return atual;
    return this.gravarPedidoPublicoToken(companyId);
  }

  /**
   * Rotaciona o token (link antigo MORRE na hora — o lookup público é pelo
   * token). Molde do rotateWebsiteCaptureToken. Não mexe no toggle.
   */
  async rotatePedidoPublicoToken(companyId: number): Promise<string> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    await this.ensureRow(companyId);
    return this.gravarPedidoPublicoToken(companyId);
  }

  /** Grava um token novo com retry na chance (mínima) de colisão do @unique. */
  private async gravarPedidoPublicoToken(companyId: number): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomBytes(24).toString('hex'); // 48 chars hex — opaco.
      try {
        await this.prisma.logisticaConfig.update({
          where: { companyId },
          data: { pedidoPublicoToken: token },
        });
        return token;
      } catch (e: any) {
        if (String(e?.code) === 'P2002') continue; // colisão do unique — tenta outro
        throw e;
      }
    }
    throw new BadRequestException('Não foi possível gerar o link. Tente de novo.');
  }

  // ── GRAVAR (PATCH parcial; upsert) ───────────────────────────────────────────
  /**
   * Atualiza (ou cria) a config da empresa. PATCH parcial: só os campos enviados
   * mudam. Números são clampados (raio/velocidade/tempo ≥ 1) e o template é
   * limitado no tamanho. company-scoped. NÃO dispara nada.
   */
  async updateConfig(
    companyId: number,
    input: UpdateLogisticaConfigInput,
    actor?: ActorKindUserLike,
  ): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');

    // ── 26/07 — o MODO da rota não entra mais por aqui ────────────────────────
    // Ele tem endpoint próprio (`updateRouteMode` / PATCH /logistica/config/
    // modo-rota). Este guarda é cinto-e-suspensório: o ValidationPipe global
    // (whitelist + forbidNonWhitelisted) já barra o payload do APK velho com
    // 400, e quem chamar o serviço direto (script, outro módulo) bate aqui.
    const forasteiro = input as Record<string, unknown>;
    if (forasteiro.trackingAtivo !== undefined || forasteiro.modoRotaPadrao !== undefined) {
      throw new ForbiddenException(
        'O modo da rota só muda no painel do administrador, no computador.',
      );
    }

    const data: Record<string, unknown> = {};
    const changesCommercialConfig = [
      input.cobrancaNaEntrega,
      input.moduloFinanceiroAtivo,
      input.moduloRecoveryAtivo,
      input.pixChave,
      input.pixNome,
      input.pixCidade,
      input.cobrancaWhatsAtiva,
      input.resumoDiarioAtivo,
      input.resumoDiarioHora,
    ].some((value) => value !== undefined);
    if (changesCommercialConfig && !isBillingOwnerActor(actor)) {
      throw new ForbiddenException('Somente o responsável financeiro pode alterar esta configuração.');
    }
    // PR27072026 F1 — teto do nível do plano: lido preguiçoso (só se algum dos
    // campos gateados abaixo estiver no PATCH) e cacheado nesta chamada — no
    // máximo 1 SELECT extra mesmo quando os dois campos vêm juntos. Master
    // bypassa (isSystemMaster) em cada gate; só o tenant fica preso ao teto.
    let nivelCache: LogisticaNivel | null = null;
    const nivelDoTenant = async (): Promise<LogisticaNivel> => {
      if (!nivelCache) {
        const atual = await this.ensureRow(companyId);
        nivelCache = storedNivel((atual as any).logisticaNivel);
      }
      return nivelCache;
    };
    if (input.avisoWhatsEnabled !== undefined) data.avisoWhatsEnabled = !!input.avisoWhatsEnabled;
    if (input.templateAviso !== undefined) {
      const t = String(input.templateAviso ?? '').trim();
      data.templateAviso = t ? t.slice(0, 1000) : null;
    }
    if (input.raioChegadaM !== undefined) data.raioChegadaM = clampInt(input.raioChegadaM, 10, 5000, 60);
    if (input.cobrancaSimples !== undefined) data.cobrancaSimples = !!input.cobrancaSimples;
    if (input.velocidadeMediaKmH !== undefined) data.velocidadeMediaKmH = clampInt(input.velocidadeMediaKmH, 1, 200, 25);
    if (input.tempoParadaMin !== undefined) data.tempoParadaMin = clampInt(input.tempoParadaMin, 0, 240, 5);
    if (input.cobrancaNaEntrega !== undefined) data.cobrancaNaEntrega = !!input.cobrancaNaEntrega;
    if (input.moduloFinanceiroAtivo !== undefined) {
      // PR27072026 F1 — GATE de uso: financeiro real é Advanced+ na matriz do
      // plano. O tenant NUNCA liga por cima do teto do nível (Master pode tudo).
      if (input.moduloFinanceiroAtivo && !actor?.isSystemMaster && (await nivelDoTenant()) === 'BASIC') {
        throw new ForbiddenException('Financeiro completo é do plano Advanced.');
      }
      data.moduloFinanceiroAtivo = !!input.moduloFinanceiroAtivo;
    }
    // PR27072026 F2 — PARADA AMARELA DE DEVEDOR: modo do tratamento na rota de
    // hoje. OPERACIONAL (não exige billing owner — mesmo padrão de
    // gerarDiaAutomatico/cobrancaAutomatica acima; @Admin() do controller já
    // basta). GATE DE USO é só de NÍVEL (Advanced+): NORMAL (equivalente a
    // "desligado") sempre passa, mesmo no BASIC — só COBRANCA/EXCLUIR exigem o
    // nível. logistica.service.ts tem o cinto-e-suspensório na LEITURA (resolve
    // NORMAL sozinho se o nível cair depois de gravado).
    if (input.devedorNaRota !== undefined) {
      const modo = normalizeDevedorNaRota(input.devedorNaRota);
      if (!modo) throw new BadRequestException('Modo de devedor na rota inválido — use COBRANCA, EXCLUIR ou NORMAL.');
      if (modo !== 'NORMAL' && !actor?.isSystemMaster && (await nivelDoTenant()) === 'BASIC') {
        throw new ForbiddenException('Cobrar ou excluir devedor da rota é do plano Advanced.');
      }
      data.devedorNaRota = modo;
    }
    // PR18072026 W-A — toggles operacionais (não exigem billing owner, mesmo
    // padrão do cobrancaSimples): formas de pagamento aceitas + preço por
    // cliente + cobrança automática (painel Avançado).
    if (input.aceitaNaHora !== undefined) data.aceitaNaHora = !!input.aceitaNaHora;
    if (input.aceitaMensal !== undefined) data.aceitaMensal = !!input.aceitaMensal;
    if (input.aceitaFiado !== undefined) data.aceitaFiado = !!input.aceitaFiado;
    if (input.precoPorClienteAtivo !== undefined) data.precoPorClienteAtivo = !!input.precoPorClienteAtivo;
    if (input.cobrancaAutomatica !== undefined) data.cobrancaAutomatica = !!input.cobrancaAutomatica;
    if (input.moduloRecoveryAtivo !== undefined) data.moduloRecoveryAtivo = !!input.moduloRecoveryAtivo;
    if (input.gerarDiaAutomatico !== undefined) data.gerarDiaAutomatico = !!input.gerarDiaAutomatico;
    // TASK 4 — dias de trabalho da empresa: CSV de inteiros 1..7 (ISO, 1=segunda…
    // 7=domingo), dedupe+sort (mesma normalização de ClienteProduto.diasSemana).
    // Vazio/sem dia válido → null (sem restrição configurada).
    if (input.diasTrabalho !== undefined) data.diasTrabalho = normalizeDiasTrabalho(input.diasTrabalho);
    // F1 — Pix direto do tenant (BR Code no app). Vazio limpa (desliga o QR).
    // Nome/cidade entram no payload EMV: sem acento e nos tetos da especificação
    // (25/15) — normalizados AQUI pra o que está salvo ser o que o QR carrega.
    if (input.pixChave !== undefined) {
      const chave = String(input.pixChave ?? '').trim();
      data.pixChave = chave ? chave.slice(0, 77) : null;
    }
    if (input.pixNome !== undefined) {
      const nome = semAcento(String(input.pixNome ?? '').trim());
      data.pixNome = nome ? nome.slice(0, 25) : null;
    }
    if (input.pixCidade !== undefined) {
      const cidade = semAcento(String(input.pixCidade ?? '').trim());
      data.pixCidade = cidade ? cidade.slice(0, 15) : null;
    }
    // AVISO-CHEGANDO (11/07) — toggle INDEPENDENTE do avisoWhatsEnabled (entregue):
    // a empresa liga um, o outro, os dois ou nenhum. Mesmo tratamento de template
    // (trim+slice) do templateAviso; distância clampada 100–2000m (default 500).
    if (input.avisoChegandoEnabled !== undefined) data.avisoChegandoEnabled = !!input.avisoChegandoEnabled;
    if (input.avisoChegandoTemplate !== undefined) {
      const t = String(input.avisoChegandoTemplate ?? '').trim();
      data.avisoChegandoTemplate = t ? t.slice(0, 1000) : null;
    }
    if (input.avisoChegandoDistanciaM !== undefined) {
      data.avisoChegandoDistanciaM = clampInt(input.avisoChegandoDistanciaM, 100, 2000, 500);
    }
    // S2 COBRANÇA-WHATS (11/07) — toggle POR TENANT (aviso de cobrança + lembrete
    // de vencimento no zap). Gravar é livre; EFEITO só existe com a flag global
    // HBX_COBRANCA_WHATS_ENABLED ligada (o serviço de aviso checa as duas).
    if (input.cobrancaWhatsAtiva !== undefined) {
      // PR27072026 F1 — mesmo teto acima: cobrança automática por WhatsApp
      // ("Cobrança automática educada" na matriz) também é Advanced+.
      if (input.cobrancaWhatsAtiva && !actor?.isSystemMaster && (await nivelDoTenant()) === 'BASIC') {
        throw new ForbiddenException('Cobrança automática por WhatsApp é do plano Advanced.');
      }
      data.cobrancaWhatsAtiva = !!input.cobrancaWhatsAtiva;
    }
    // S3 RESUMO-DIÁRIO (11/07) — toggle POR TENANT + hora local (0-23) do resumo
    // do dono no zap. Gravar é livre; EFEITO só com HBX_RESUMO_DIARIO_ENABLED
    // global ligada (o scheduler checa as duas). A marca resumoDiarioUltimoEnvio
    // NÃO entra aqui de propósito — é interna do scheduler, nunca editável via API.
    if (input.resumoDiarioAtivo !== undefined) data.resumoDiarioAtivo = !!input.resumoDiarioAtivo;
    if (input.resumoDiarioHora !== undefined) data.resumoDiarioHora = clampInt(input.resumoDiarioHora, 0, 23, 7);
    // S6 PORTAL-PEDIDO (11/07) — toggle POR TENANT do pedido público pelo link.
    // Gravar é livre; EFEITO só com HBX_PEDIDO_PUBLICO_ENABLED global ligada (a
    // rota pública checa as duas). O TOKEN não entra aqui de propósito — só
    // ensure/rotatePedidoPublicoToken emitem (nunca editável cru via PATCH).
    if (input.pedidoPublicoAtivo !== undefined) data.pedidoPublicoAtivo = !!input.pedidoPublicoAtivo;
    if (input.comprovanteFotoObrigatoria !== undefined) {
      data.comprovanteFotoObrigatoria = !!input.comprovanteFotoObrigatoria;
    }
    if (input.comprovanteAssinaturaObrigatoria !== undefined) {
      data.comprovanteAssinaturaObrigatoria = !!input.comprovanteAssinaturaObrigatoria;
    }
    if (input.comprovanteCodigoObrigatorio !== undefined) {
      data.comprovanteCodigoObrigatorio = !!input.comprovanteCodigoObrigatorio;
    }

    const cfg = await this.prisma.logisticaConfig.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    // PATCH é admin-only (RolesGuard + @Admin() no controller), mas o DTO é o
    // MESMO shape do GET — recalcula o booleano pra não devolver um valor
    // desatualizado pro admin que acabou de editar a config.
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    return serializeConfig(cfg, actor, creditosEsgotados);
  }

  // ── MODO DA ROTA (Simples × Rastreada) — PORTA ÚNICA, SÓ DO PC ──────────────
  /**
   * Grava a escolha comercial do modo das NOVAS rotas. Endpoint próprio
   * (`PATCH /logistica/config/modo-rota`) por decisão de 26/07: enquanto os dois
   * campos moravam no PATCH genérico da config, o APK VELHO já instalado em
   * campo conseguia mandar a troca se quem estivesse logado fosse o dono da
   * conta. Separar o endereço fecha a porta por CONTRATO — o payload antigo cai
   * no ValidationPipe (400) e nenhum bundle do celular conhece esta rota. Não
   * depende de User-Agent, que é string de cliente e se forja.
   *
   * Continua exigindo billing owner (a escolha mexe em quanto a empresa gasta:
   * 2 créditos por entrega na Rastreada contra 1 por bloco de 5 na Simples).
   */
  async updateRouteMode(
    companyId: number,
    input: UpdateLogisticaRouteModeInput,
    actor?: ActorKindUserLike,
  ): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    if (!isBillingOwnerActor(actor)) {
      throw new ForbiddenException('Somente o responsável financeiro pode alterar esta configuração.');
    }

    const data: Record<string, unknown> = {};
    if (input.trackingAtivo !== undefined) data.trackingAtivo = !!input.trackingAtivo;
    if (input.modoRotaPadrao !== undefined) {
      const mode = String(input.modoRotaPadrao || '').trim().toUpperCase();
      if (mode !== 'ESSENTIAL' && mode !== 'TRACKED') {
        throw new BadRequestException('Modo de rota inválido.');
      }
      data.modoRotaPadrao = mode;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Nada para alterar.');
    // 26/07 — DESARMA a preferência órfã. Antes disso `trackingAtivo=false` +
    // `modoRotaPadrao='TRACKED'` era um estado LEGAL: a rota caía em ESSENTIAL
    // (effectiveRouteMode), mas o TRACKED ficava armado no banco e voltava
    // sozinho no dia em que alguém religasse o toggle — foi exatamente assim que
    // as companies 5 e 48 ficaram TRACKED em produção. Desligar o rastreamento
    // agora zera a preferência junto: pra voltar pra Rastreada o administrador
    // (no PC) liga o toggle E escolhe a Rastreada de novo — 2 atos conscientes,
    // nenhum deles no celular. NÃO apaga nada da Rastreada: rota já iniciada
    // guarda o modo congelado na própria LogisticaRoute e continua sendo lida
    // nos dois modos.
    if (data.trackingAtivo === false) data.modoRotaPadrao = 'ESSENTIAL';

    // PR27072026 F1 — GATE de uso, no valor FINAL (depois da desarma acima):
    // Rastreado é exclusivo do plano Full. Checar aqui (não no `mode` bruto do
    // input) importa pro PATCH "contraditório" (trackingAtivo:false +
    // modoRotaPadrao:'TRACKED' no mesmo corpo) continuar resolvendo em
    // ESSENTIAL sem erro — a desarma já neutralizou o pedido, não sobrou
    // TRACKED pra recusar. O tenant NUNCA liga TRACKED por cima do teto do
    // nível por este caminho (Master pode tudo — isSystemMaster bypassa).
    if (data.modoRotaPadrao === 'TRACKED' && !actor?.isSystemMaster) {
      const atual = await this.ensureRow(companyId);
      if (storedNivel((atual as any).logisticaNivel) !== 'FULL') {
        throw new ForbiddenException('Rastreamento é do plano Full.');
      }
    }

    const cfg = await this.prisma.logisticaConfig.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    return serializeConfig(cfg, actor, creditosEsgotados);
  }

  // ── PR27072026 F1 — NÍVEL DO PLANO (Basic/Advanced/Full), SÓ O MASTER ───────
  /** Nível gravado (grandfathering resolvido: ausente/sujo → ADVANCED). */
  async getNivel(companyId: number): Promise<{ nivel: LogisticaNivel }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    return { nivel: storedNivel((cfg as any).logisticaNivel) };
  }

  /**
   * Aplica o nível: grava `logisticaNivel` E o preset de toggles da matriz do
   * plano (nivelPresetPatch) NUM SÓ upsert — "escolher já seta" (F1 item 1).
   * Guard de acesso (MasterGuard) fica no controller; aqui só valida o valor.
   * Preset é ATALHO, não algema: depois de aplicado, o Master segue ajustando
   * toggle a toggle pelo updateConfig/updateRouteMode normais.
   */
  async setNivel(companyId: number, nivel: string, actor?: ActorKindUserLike): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const alvo = String(nivel || '').trim().toUpperCase();
    if (alvo !== 'BASIC' && alvo !== 'ADVANCED' && alvo !== 'FULL') {
      throw new BadRequestException('Nível inválido — use BASIC, ADVANCED ou FULL.');
    }
    const data: Record<string, unknown> = { logisticaNivel: alvo, ...nivelPresetPatch(alvo as LogisticaNivel) };
    const cfg = await this.prisma.logisticaConfig.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    return serializeConfig(cfg, actor, creditosEsgotados);
  }

  // ── TOGGLE "avisar entrega" POR CLIENTE ──────────────────────────────────────
  /**
   * Liga/desliga o aviso de entrega de UM cliente (o 2º nível de silêncio, soma
   * com o global). company-scoped: o cliente TEM de ser desta empresa. Não toca
   * mais nada da conta — é um PATCH cirúrgico de 1 campo aditivo (M5), separado do
   * editor de forma de pagamento (M6).
   */
  /** Lê o toggle "avisar entrega" de UM cliente (p/ a ficha). company-scoped. */
  async getAvisarEntregaCliente(companyId: number, customerProfileId: string): Promise<{ id: string; avisarEntrega: boolean } | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const row = await this.prisma.customerProfile.findFirst({
      where: { id: cid, companyId },
      select: { id: true, avisarEntrega: true },
    });
    return row ? { id: row.id, avisarEntrega: row.avisarEntrega } : null;
  }

  async setAvisarEntregaCliente(companyId: number, customerProfileId: string, avisar: boolean): Promise<{ id: string; avisarEntrega: boolean } | null> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cid = String(customerProfileId || '').trim();
    if (!cid) throw new BadRequestException('Cliente é obrigatório.');
    const found = await this.prisma.customerProfile.findFirst({ where: { id: cid, companyId }, select: { id: true } });
    if (!found) return null;
    const updated = await this.prisma.customerProfile.update({
      where: { id: found.id },
      data: { avisarEntrega: !!avisar },
      select: { id: true, avisarEntrega: true },
    });
    return { id: updated.id, avisarEntrega: updated.avisarEntrega };
  }

  /**
   * Resolve os 2 níveis de aviso (global + por cliente) para o N6. Best-effort:
   * qualquer erro de leitura da config = FALLBACK PARA O COMPORTAMENTO ATUAL
   * (avisa), pra M5 não silenciar a rotina que já funciona hoje.
   * Retorna o template a usar (null = usa a mensagem fixa de fallback do N6).
   */
  async resolverAviso(companyId: number, avisarEntregaCliente: boolean | null | undefined): Promise<{ habilitado: boolean; template: string | null }> {
    // por cliente: default true (coluna nova; entregas antigas vêm null → avisa).
    const clienteOk = avisarEntregaCliente !== false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { avisoWhatsEnabled: true, templateAviso: true },
      });
      // Sem config = default do schema (avisoWhatsEnabled=true) → avisa.
      const globalOk = cfg ? cfg.avisoWhatsEnabled : true;
      return { habilitado: globalOk && clienteOk, template: cfg?.templateAviso ?? null };
    } catch (e: any) {
      this.logger.warn(`[logistica] resolverAviso company=${companyId} falhou: ${String(e?.message || e)}`);
      // fallback seguro = mantém o comportamento atual (avisa, msg fixa).
      return { habilitado: clienteOk, template: null };
    }
  }

  /**
   * AVISO-CHEGANDO (11/07) — espelho de `resolverAviso`, mas pro toggle/template
   * do "chegando" (avisoChegandoEnabled/avisoChegandoTemplate) — INDEPENDENTE do
   * avisoWhatsEnabled do "entregue" (a empresa liga um, o outro, os dois ou
   * nenhum). O consentimento POR CLIENTE é o MESMO campo (avisarEntrega): quem
   * não quer aviso de entrega também não recebe o "chegando".
   *
   * Diferente de resolverAviso (fallback "avisa" no erro — comportamento legado
   * que já existia): aqui o fallback de erro é FAIL-CLOSED (habilitado=false).
   * "Chegando" é feature NOVA opt-in — uma falha de leitura nunca pode "ligar"
   * um WhatsApp que o admin não configurou.
   */
  async resolverAvisoChegando(
    companyId: number,
    avisarEntregaCliente: boolean | null | undefined,
  ): Promise<{ habilitado: boolean; template: string | null }> {
    const clienteOk = avisarEntregaCliente !== false;
    try {
      const cfg = await this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: { avisoChegandoEnabled: true, avisoChegandoTemplate: true },
      });
      // Sem config ainda = default do schema (avisoChegandoEnabled=false) → NÃO avisa
      // (opt-in — diferente do avisoWhatsEnabled legado, que nasce true).
      const globalOk = cfg ? cfg.avisoChegandoEnabled : false;
      return { habilitado: globalOk && clienteOk, template: cfg?.avisoChegandoTemplate ?? null };
    } catch (e: any) {
      this.logger.warn(`[logistica] resolverAvisoChegando company=${companyId} falhou: ${String(e?.message || e)}`);
      // fallback SEGURO = feature opt-in → erro de leitura NÃO liga sozinho.
      return { habilitado: false, template: null };
    }
  }
}

// ── RENDER DO TEMPLATE (função PURA — testável isolada) ─────────────────────────
export interface TemplateVars {
  cliente?: string | null;
  itens?: string | null; // ex.: "2× Galão 20L, 1× Água com gás"
  qtd?: number | string | null; // qtd total
  quantidade?: number | string | null; // alias público de qtd
  produto?: string | null; // produto principal (o primeiro)
  empresa?: string | null;
  // F3 (27/07) — {eta}: minutos estimados até a chegada ("12 min"), vindo do
  // etaAt da entrega quando a rota está rastreada. Ausente/indisponível vira ""
  // (a regra geral do render já limpa o espaço órfão).
  eta?: string | null;
  now?: Date; // p/ a saudação por horário (default: agora) — injetável no teste
}

/**
 * Troca as variáveis públicas do template do admin.
 *  - {saudacao} = "Bom dia" | "Boa tarde" | "Boa noite" pelo horário de `now`.
 *  - variáveis ausentes viram "" (nunca deixa "{produto}" cru na mensagem).
 *  - qualquer {chave} desconhecida é REMOVIDA (não vaza placeholder pro cliente).
 * Determinística: mesmas vars + mesmo `now` = mesma saída.
 */
export function renderTemplateAviso(template: string, vars: TemplateVars = {}): string {
  const saudacao = saudacaoPorHorario(vars.now ?? new Date());
  const map: Record<string, string> = {
    saudacao,
    cliente: String(vars.cliente ?? '').trim(),
    itens: String(vars.itens ?? '').trim(),
    qtd: vars.qtd == null ? '' : String(vars.qtd).trim(),
    quantidade: vars.quantidade == null ? (vars.qtd == null ? '' : String(vars.qtd).trim()) : String(vars.quantidade).trim(),
    produto: String(vars.produto ?? '').trim(),
    empresa: String(vars.empresa ?? '').trim(),
    eta: String(vars.eta ?? '').trim(),
  };
  const out = String(template ?? '').replace(/\{(\w+)\}/g, (_full, key: string) => {
    const k = String(key).toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : '';
  });
  // Limpa espaços deixados por variáveis vazias: colapsa espaços duplos, tira o
  // espaço órfão antes de pontuação (ex.: "entregamos ." → "entregamos.") e apara
  // espaço no fim de linha — sem estragar quebras de linha.
  return out
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+([.,;:!?])/g, '$1')
    .replace(/[^\S\n]+\n/g, '\n')
    .trim();
}

/** Saudação por faixa horária LOCAL: 5–11h bom dia, 12–17h boa tarde, senão boa noite. */
export function saudacaoPorHorario(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ── helpers ─────────────────────────────────────────────────────────────────────
/** Remove diacríticos ("São Paulo" → "Sao Paulo") — exigência prática do EMV. */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// TASK 4 — normaliza "dias de trabalho": CSV de inteiros 1..7 (ISO, 1=segunda…
// 7=domingo), dedupe+sort (mesma regra de normalizeDiasSemana em
// logistica-recorrencia.service.ts, duplicada aqui de propósito — arquivo
// isolado, sem acoplar os dois serviços). Vazio/sem dia válido → null.
function normalizeDiasTrabalho(raw: unknown): string | null {
  const dias = Array.from(
    new Set(
      String(raw ?? '')
        .split(',')
        .map((s) => Math.trunc(Number(s.trim())))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7),
    ),
  ).sort((a, b) => a - b);
  return dias.length > 0 ? dias.join(',') : null;
}

// PR27072026 F2 — só os 3 valores da matriz do plano passam; qualquer outro (lixo,
// vazio) é rejeitado no chamador (BadRequestException), nunca gravado silencioso.
export type DevedorNaRotaModo = 'COBRANCA' | 'EXCLUIR' | 'NORMAL';
function normalizeDevedorNaRota(value: unknown): DevedorNaRotaModo | null {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'COBRANCA' || v === 'EXCLUIR' || v === 'NORMAL') return v;
  return null;
}

function serializeConfig(c: any, actor?: ActorKindUserLike, creditosEsgotados = false): LogisticaConfigDTO {
  const operational: LogisticaConfigDTO = {
    // S7 (PR22072026-APP-SOUNDS) — BOOLEANO, nunca o saldo: vai pra TODO ator
    // (inclusive motorista, que não é billing owner) porque é o único jeito de
    // ele saber "não dá pra rodar hoje" sem bater no endpoint admin-only do
    // extrato. Mesma linha da LEI DO VENDEDOR — o fato pode aparecer, o
    // dinheiro da empresa não.
    creditosEsgotados: !!creditosEsgotados,
    avisoWhatsEnabled: !!c.avisoWhatsEnabled,
    templateAviso: c.templateAviso ?? null,
    raioChegadaM: c.raioChegadaM,
    velocidadeMediaKmH: c.velocidadeMediaKmH,
    tempoParadaMin: c.tempoParadaMin,
    gerarDiaAutomatico: !!c.gerarDiaAutomatico,
    diasTrabalho: c.diasTrabalho ?? null,
    avisoChegandoEnabled: !!c.avisoChegandoEnabled,
    avisoChegandoTemplate: c.avisoChegandoTemplate ?? null,
    avisoChegandoDistanciaM: c.avisoChegandoDistanciaM ?? 500,
    comprovanteFotoObrigatoria: !!c.comprovanteFotoObrigatoria,
    comprovanteAssinaturaObrigatoria: !!c.comprovanteAssinaturaObrigatoria,
    comprovanteCodigoObrigatorio: !!c.comprovanteCodigoObrigatorio,
    cobrancaSimples: !!c.cobrancaSimples,
    // PR18072026 W-A — módulo Financeiro liga/desliga (3 níveis) + painel
    // Avançado. moduloFinanceiroAtivo e os 5 toggles abaixo são OPERACIONAIS
    // (lidos por QUALQUER ator): o app do entregador precisa saber o nível da
    // folha de chegada e quais formas mostrar no editar cliente MESMO sem ser
    // billing owner (motorista/vendedor não é dono nem gerente). É o TOGGLE
    // (liga/desliga), não valor financeiro — LEI DO VENDEDOR segue protegendo
    // saldo/valor, não este booleano.
    moduloFinanceiroAtivo: !!c.moduloFinanceiroAtivo,
    aceitaNaHora: c.aceitaNaHora === undefined ? true : !!c.aceitaNaHora,
    aceitaMensal: c.aceitaMensal === undefined ? true : !!c.aceitaMensal,
    aceitaFiado: c.aceitaFiado === undefined ? true : !!c.aceitaFiado,
    precoPorClienteAtivo: c.precoPorClienteAtivo === undefined ? true : !!c.precoPorClienteAtivo,
    cobrancaAutomatica: !!c.cobrancaAutomatica,
    // ROTA-CONFERIDA — coluna real desde 26/07 (baseline do drift
    // VendasCardComplaint + migration logistica_flags_ligadas, ligada geral).
    // Operacional (todo ator, inclusive motorista) — o APK decide o fluxo.
    rotaConferidaAtiva: !!c.rotaConferidaAtiva,
    // PR27072026 F1 — nível do plano (Basic/Advanced/Full). OPERACIONAL (todo
    // ator lê, inclusive motorista/vendedor): o front usa pra acinzentar os
    // recursos que o nível não cobre ("ver-mas-não-usar" — decisão do dono).
    logisticaNivel: storedNivel(c.logisticaNivel),
    // PR27072026 F2 — modo do tratamento do devedor na rota de hoje. OPERACIONAL
    // (todo ator lê, mesmo padrão do logisticaNivel acima): o chip por parada em
    // si (`somenteCobranca`) já é operacional no payload de /logistica/rota; este
    // campo é só o MODO configurado, pra tela de config saber o que mostrar
    // marcado sem precisar ser billing owner (mesmo padrão de cobrancaAutomatica).
    devedorNaRota: normalizeDevedorNaRota(c.devedorNaRota) ?? 'COBRANCA',
  };

  // O GET também é consumido pelo app do entregador. Campos administrativos,
  // financeiros e comerciais precisam estar AUSENTES (não apenas null) para
  // gerente, vendedor e motorista.
  if (!isBillingOwnerActor(actor)) return operational;

  return {
    ...operational,
    cobrancaNaEntrega: !!c.cobrancaNaEntrega,
    moduloRecoveryAtivo: !!c.moduloRecoveryAtivo,
    pixChave: c.pixChave ?? null,
    pixNome: c.pixNome ?? null,
    pixCidade: c.pixCidade ?? null,
    cobrancaWhatsAtiva: !!c.cobrancaWhatsAtiva,
    cobrancaWhatsDisponivel: isCobrancaWhatsEnabled(),
    resumoDiarioAtivo: !!c.resumoDiarioAtivo,
    resumoDiarioHora: typeof c.resumoDiarioHora === 'number' ? c.resumoDiarioHora : 7,
    resumoDiarioDisponivel: isResumoDiarioEnabled(),
    pedidoPublicoAtivo: !!c.pedidoPublicoAtivo,
    pedidoPublicoToken: c.pedidoPublicoToken ?? null,
    pedidoPublicoDisponivel: isPedidoPublicoEnabled(),
    trackingAtivo: !!c.trackingAtivo,
    trackingDisponivel: isLogisticaTrackingEnabled(),
    // Preferência salva (não o modo efetivo): a UI continua mostrando TRACKED
    // enquanto a flag global está OFF. Inicialização/cobrança usam resolveRouteMode.
    modoRotaPadrao: storedRouteMode(c.modoRotaPadrao),
  };
}

export type LogisticaRouteMode = 'ESSENTIAL' | 'TRACKED';

function storedRouteMode(value: unknown): LogisticaRouteMode {
  return String(value || '').trim().toUpperCase() === 'TRACKED' ? 'TRACKED' : 'ESSENTIAL';
}

// ── PR27072026 F1 — NÍVEL DO PLANO (Basic/Advanced/Full) ─────────────────────
export type LogisticaNivel = 'BASIC' | 'ADVANCED' | 'FULL';

/**
 * Nível cru do banco → tipo válido. GRANDFATHERING: ausente/sujo cai em
 * ADVANCED, NUNCA em BASIC — um valor corrompido/linha antiga (pré-migration)
 * jamais pode derrubar recurso de quem já usa financeiro real (mesma regra do
 * default da coluna no schema).
 */
export function storedNivel(value: unknown): LogisticaNivel {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'BASIC' || v === 'FULL') return v;
  return 'ADVANCED';
}

/**
 * A matriz do plano (docs/PLANEJAMENTOS/PR27072026-ROTA-3-NIVEIS.md) em
 * código: escolher um nível seta o conjunto de toggles que vende aquele plano,
 * NUM SÓ gesto. Preset é ATALHO, não algema (decisão do dono 27/07) — depois
 * de aplicado, o Master segue ajustando toggle a toggle pelo PATCH normal de
 * config; isto aqui só roda na hora de TROCAR o nível.
 *  - BASIC: financeiro real e cobrança automática OFF (registro de recebimento
 *    na entrega continua — não passa por moduloFinanceiroAtivo); tracking OFF.
 *  - ADVANCED: liga o financeiro real (o carro-chefe — "o app cobra por
 *    você"); tracking segue exclusivo do Full.
 *  - FULL: tudo ligado, incluindo o modo TRACKED por padrão de rota (F1 item 4).
 */
function nivelPresetPatch(nivel: LogisticaNivel): Record<string, unknown> {
  if (nivel === 'BASIC') {
    return {
      moduloFinanceiroAtivo: false,
      cobrancaWhatsAtiva: false,
      cobrancaAutomatica: false,
      trackingAtivo: false,
      modoRotaPadrao: 'ESSENTIAL',
    };
  }
  if (nivel === 'FULL') {
    return {
      moduloFinanceiroAtivo: true,
      cobrancaWhatsAtiva: true,
      cobrancaAutomatica: true,
      trackingAtivo: true,
      modoRotaPadrao: 'TRACKED',
    };
  }
  return {
    moduloFinanceiroAtivo: true,
    trackingAtivo: false,
    modoRotaPadrao: 'ESSENTIAL',
  };
}

/**
 * 4 gates, todos obrigatórios, e qualquer buraco cai em ESSENTIAL (Logística
 * Simples): flag global `HBX_LOGISTICA_TRACKING_ENABLED` + toggle do tenant
 * `trackingAtivo` + nível do plano `logisticaNivel==='FULL'` (PR27072026 F1) +
 * preferência salva `modoRotaPadrao='TRACKED'`. Empresa sem linha de config,
 * com linha nova ou com valor sujo no banco → ESSENTIAL. O gate de nível aqui
 * é o cinto-e-suspensório: a escrita já é barrada em updateConfig/
 * updateRouteMode (nível != FULL nunca grava TRACKED por aquele caminho) e o
 * preset acima já zera trackingAtivo fora do Full — isto cobre o buraco de um
 * valor histórico/sujo no banco sem nunca lançar erro no "iniciar rota".
 */
function effectiveRouteMode(c: any): LogisticaRouteMode {
  if (!isLogisticaTrackingEnabled() || !c?.trackingAtivo) return 'ESSENTIAL';
  if (storedNivel(c?.logisticaNivel) !== 'FULL') return 'ESSENTIAL';
  return storedRouteMode(c?.modoRotaPadrao);
}

// ── tipos ─────────────────────────────────────────────────────────────────────
// 26/07 — `trackingAtivo`/`modoRotaPadrao` saíram deste input e viraram o
// UpdateLogisticaRouteModeInput (endpoint próprio). Ver updateRouteMode.
export interface UpdateLogisticaRouteModeInput {
  trackingAtivo?: boolean;
  modoRotaPadrao?: LogisticaRouteMode;
}

export interface UpdateLogisticaConfigInput {
  avisoWhatsEnabled?: boolean;
  templateAviso?: string | null;
  raioChegadaM?: number;
  velocidadeMediaKmH?: number;
  tempoParadaMin?: number;
  cobrancaNaEntrega?: boolean;
  moduloFinanceiroAtivo?: boolean;
  moduloRecoveryAtivo?: boolean;
  gerarDiaAutomatico?: boolean;
  diasTrabalho?: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  avisoChegandoEnabled?: boolean;
  avisoChegandoTemplate?: string | null;
  avisoChegandoDistanciaM?: number;
  // S2 COBRANÇA-WHATS — toggle por tenant (efeito só com a env global ligada).
  cobrancaWhatsAtiva?: boolean;
  // S3 RESUMO-DIÁRIO — toggle por tenant + hora local 0-23 (efeito só com a env).
  resumoDiarioAtivo?: boolean;
  resumoDiarioHora?: number;
  // S6 PORTAL-PEDIDO — toggle por tenant do pedido público (efeito só com a env).
  pedidoPublicoAtivo?: boolean;
  comprovanteFotoObrigatoria?: boolean;
  comprovanteAssinaturaObrigatoria?: boolean;
  comprovanteCodigoObrigatorio?: boolean;
  // W1-BACKEND (18/07) — toggle "Cobrança simples na chegada" do app do entregador.
  cobrancaSimples?: boolean;
  // PR18072026 W-A — módulo Financeiro (3 níveis) + painel Avançado. Todos
  // operacionais: não exigem billing owner (mesmo padrão do cobrancaSimples).
  aceitaNaHora?: boolean;
  aceitaMensal?: boolean;
  aceitaFiado?: boolean;
  precoPorClienteAtivo?: boolean;
  cobrancaAutomatica?: boolean;
  // PR27072026 F2 — modo de tratamento do devedor na rota de hoje. Comercial
  // (billing owner), gate de nível ADVANCED+ pra COBRANCA/EXCLUIR (ver updateConfig).
  devedorNaRota?: DevedorNaRotaModo;
}

export interface LogisticaConfigDTO {
  // S7 (PR22072026-APP-SOUNDS) — ver comentário em `serializeConfig`: booleano
  // operacional (todo ator lê), nunca o saldo.
  creditosEsgotados: boolean;
  avisoWhatsEnabled: boolean;
  templateAviso: string | null;
  raioChegadaM: number;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  cobrancaNaEntrega?: boolean;
  moduloRecoveryAtivo?: boolean;
  gerarDiaAutomatico: boolean;
  diasTrabalho: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  avisoChegandoEnabled: boolean;
  avisoChegandoTemplate: string | null;
  avisoChegandoDistanciaM: number;
  // S2 COBRANÇA-WHATS — toggle do tenant + derivado da env (read-only pro front).
  cobrancaWhatsAtiva?: boolean;
  cobrancaWhatsDisponivel?: boolean;
  // S3 RESUMO-DIÁRIO — toggle+hora do tenant + derivado da env (read-only pro front).
  resumoDiarioAtivo?: boolean;
  resumoDiarioHora?: number;
  resumoDiarioDisponivel?: boolean;
  // S6 PORTAL-PEDIDO — toggle do tenant + token do link + derivado da env
  // (pedidoPublicoToken/Disponivel são read-only pro front; token muda só por
  // ensure/rotate nos endpoints admin).
  pedidoPublicoAtivo?: boolean;
  pedidoPublicoToken?: string | null;
  pedidoPublicoDisponivel?: boolean;
  trackingAtivo?: boolean;
  trackingDisponivel?: boolean;
  modoRotaPadrao?: LogisticaRouteMode;
  comprovanteFotoObrigatoria: boolean;
  comprovanteAssinaturaObrigatoria: boolean;
  comprovanteCodigoObrigatorio: boolean;
  // W1-BACKEND (18/07) — toggle "Cobrança simples na chegada" do app do entregador.
  // Operacional (não financeiro): precisa estar visível pro motorista, não só billing owner.
  cobrancaSimples: boolean;
  // PR18072026 W-A — módulo Financeiro (3 níveis) + painel Avançado. Todos
  // OPERACIONAIS (lidos por QUALQUER ator, mesmo padrão do cobrancaSimples):
  // o app do entregador usa pra decidir o nível da folha de chegada e quais
  // formas de pagamento mostrar no editar cliente.
  moduloFinanceiroAtivo: boolean;
  aceitaNaHora: boolean;
  aceitaMensal: boolean;
  aceitaFiado: boolean;
  precoPorClienteAtivo: boolean;
  cobrancaAutomatica: boolean;
  // ROTA-CONFERIDA — tela de conferência no APK. Coluna real desde 26/07
  // (migration logistica_flags_ligadas), ligada pra todas as empresas.
  rotaConferidaAtiva: boolean;
  // PR27072026 F1 — nível do plano (Basic/Advanced/Full); ver serializeConfig.
  logisticaNivel: LogisticaNivel;
  // PR27072026 F2 — modo de tratamento do devedor na rota. OPERACIONAL (todo
  // ator lê, mesmo padrão do logisticaNivel acima); ver serializeConfig.
  devedorNaRota: DevedorNaRotaModo;
}
