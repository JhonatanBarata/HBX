import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { isBillingOwnerActor, type ActorKindUserLike } from '../access/actor-kind';
import { supportEmail, supportWhatsappDigits } from '../common/hbx-support-contact';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { isCobrancaWhatsEnabled } from './logistica-cobranca.flags';
import { isPedidoPublicoEnabled } from './logistica-pedido.flags';
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
// PROSPECTOR CIENTE (24/08/2026) — chave do carimbo por usuário em
// User.onboardingStateJson. MESMO trilho do tutorial obrigatório
// (EVENTO_TUTORIAL_OBRIGATORIO, logistica-tutorial.service.ts): zero migration.
export const EVENTO_PROSPECTOR_CIENTE = 'logistica_prospector_ciente';

@Injectable()
export class LogisticaConfigService {
  private readonly logger = new Logger(LogisticaConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly users: UsersService,
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
    const prospectorCiente = await this.computeProspectorCiente(actor);
    return serializeConfig(cfg, actor, creditosEsgotados, prospectorCiente);
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
   * PROSPECTOR CIENTE (24/08/2026, decisão do dono) — o prospector abriu pra
   * TODO usuário (sem gate de Master/env/equipe), mas com um aviso "Ciente"
   * obrigatório na primeira vez. O carimbo é POR USUÁRIO e NO SERVIDOR —
   * espelho exato do tutorial obrigatório (logistica-tutorial.service.ts):
   * reusa `User.onboardingStateJson` (stampOnboardingEvent/getOnboardingEvents,
   * idempotente, tolerante a JSON quebrado) — ZERO MIGRATION de propósito.
   * Fail-closed no erro (false = mostra o aviso de novo; repetir o aviso é
   * chato, pular o aviso é quebrar a decisão do dono).
   */
  private async computeProspectorCiente(actor?: ActorKindUserLike): Promise<boolean> {
    const userId = Number((actor as any)?.id);
    if (!Number.isInteger(userId) || userId <= 0) return false;
    try {
      const user = await this.users.findById(userId);
      const events = this.users.getOnboardingEvents(user as any);
      return !!events[EVENTO_PROSPECTOR_CIENTE];
    } catch (e: any) {
      this.logger.warn(`[logistica] computeProspectorCiente user=${userId} falhou: ${String(e?.message || e)}`);
      return false;
    }
  }

  /** Carimba o "Ciente" do prospector pro ATOR. Idempotente (herda do stamp). */
  async marcarProspectorCiente(userId: number): Promise<{ ok: true; prospectorCiente: true; cienteEm: string }> {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Usuário não identificado');
    const { events } = await this.users.stampOnboardingEvent(id, EVENTO_PROSPECTOR_CIENTE);
    return { ok: true, prospectorCiente: true, cienteEm: events[EVENTO_PROSPECTOR_CIENTE] };
  }

  /**
   * 24/08/2026 (decisão do dono) — NÃO EXISTE MAIS ESCOLHA DE MODO: toda rota
   * nasce TRACKED. A régua de 4 gates (env HBX_LOGISTICA_TRACKING_ENABLED +
   * trackingAtivo + nível FULL + modoRotaPadrao) morreu junto com as colunas.
   * O método fica (assinatura estável pra quem consulta o modo da PRÓXIMA rota);
   * rota antiga ESSENTIAL congelada em LogisticaRoute.mode continua sendo lida.
   */
  async resolveRouteMode(companyId: number): Promise<LogisticaRouteMode> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    return 'TRACKED';
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

    // 24/08/2026 — os guardas "forasteiro" (trackingAtivo/modoRotaPadrao e
    // prospectorAutomacao*) morreram junto com os campos: as colunas saíram do
    // schema e o ValidationPipe global (whitelist + forbidNonWhitelisted) segue
    // devolvendo 400 pra qualquer payload que ainda os mande.

    const data: Record<string, unknown> = {};
    const changesCommercialConfig = [
      input.cobrancaNaEntrega,
      input.moduloRecoveryAtivo,
      input.pixChave,
      input.pixNome,
      input.pixCidade,
      input.cobrancaWhatsAtiva,
      // F4 (07/08) — o TEXTO da cobrança anda com o toggle dela: quem manda na
      // cobrança é o responsável financeiro (é a voz da empresa cobrando dinheiro).
      input.cobrancaWhatsTemplate,
      input.resumoDiarioAtivo,
      input.resumoDiarioHora,
    ].some((value) => value !== undefined);
    if (changesCommercialConfig && !isBillingOwnerActor(actor)) {
      throw new ForbiddenException('Somente o responsável financeiro pode alterar esta configuração.');
    }
    // 24/08/2026 — o "teto do nível" (nivelDoTenant + gates BASIC/ADVANCED/FULL)
    // morreu: plano difere SÓ por nº de assentos (decisão do dono). Nenhum campo
    // deste PATCH consulta mais o nível.
    if (input.avisoWhatsEnabled !== undefined) data.avisoWhatsEnabled = !!input.avisoWhatsEnabled;
    if (input.templateAviso !== undefined) {
      const t = String(input.templateAviso ?? '').trim();
      data.templateAviso = t ? t.slice(0, 1000) : null;
    }
    if (input.raioChegadaM !== undefined) data.raioChegadaM = clampInt(input.raioChegadaM, 10, 5000, 60);
    // MODO PASSEIO (29/07) — liberação pra equipe. Operacional: @Admin() do
    // controller já basta, não exige billing owner.
    if (input.passeioEquipe !== undefined) data.passeioEquipe = !!input.passeioEquipe;
    if (input.velocidadeMediaKmH !== undefined) data.velocidadeMediaKmH = clampInt(input.velocidadeMediaKmH, 1, 200, 25);
    if (input.tempoParadaMin !== undefined) data.tempoParadaMin = clampInt(input.tempoParadaMin, 0, 240, 5);
    // SENTINELA (03/08) — as réguas do vigia. Piso 0 é DESLIGAR aquela pergunta
    // (empresa que entrega em prédio com garagem não quer "sem sinal" tocando o
    // dia todo); teto de 240 min impede régua que, por engano, nunca dispara.
    if (input.sentinelaSemSinalMin !== undefined) data.sentinelaSemSinalMin = clampInt(input.sentinelaSemSinalMin, 0, 240, 15);
    if (input.sentinelaParadoMin !== undefined) data.sentinelaParadoMin = clampInt(input.sentinelaParadoMin, 0, 240, 25);
    if (input.sentinelaAtrasoMin !== undefined) data.sentinelaAtrasoMin = clampInt(input.sentinelaAtrasoMin, 0, 240, 20);
    if (input.cobrancaNaEntrega !== undefined) data.cobrancaNaEntrega = !!input.cobrancaNaEntrega;
    // 24/08/2026 — `moduloFinanceiroAtivo` MORREU (coluna e campo): financeiro é
    // SEMPRE ligado, R$ 0,00 é valor legítimo. O toggle era uma escolha que 12
    // das 14 empresas nunca fizeram e que fazia a Folha da venda abrir vazia.
    // PR27072026 F2 — PARADA AMARELA DE DEVEDOR: modo do tratamento na rota de
    // hoje. OPERACIONAL (não exige billing owner — mesmo padrão do
    // `cobrancaAutomatica`; @Admin() do controller já basta). 24/08/2026: o gate
    // de nível (Advanced+ pra COBRANCA/EXCLUIR) saiu — plano difere só por
    // assentos; a normalização fica.
    if (input.devedorNaRota !== undefined) {
      const modo = normalizeDevedorNaRota(input.devedorNaRota);
      if (!modo) throw new BadRequestException('Modo de devedor na rota inválido — use COBRANCA, EXCLUIR ou NORMAL.');
      data.devedorNaRota = modo;
    }
    // PR18072026 W-A — toggles operacionais (não exigem billing owner): formas
    // de pagamento aceitas + cobrança automática (painel Avançado).
    if (input.aceitaNaHora !== undefined) data.aceitaNaHora = !!input.aceitaNaHora;
    if (input.aceitaMensal !== undefined) data.aceitaMensal = !!input.aceitaMensal;
    if (input.aceitaFiado !== undefined) data.aceitaFiado = !!input.aceitaFiado;
    if (input.cobrancaAutomatica !== undefined) data.cobrancaAutomatica = !!input.cobrancaAutomatica;
    if (input.moduloRecoveryAtivo !== undefined) data.moduloRecoveryAtivo = !!input.moduloRecoveryAtivo;
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
    // 24/08/2026: o gate de nível (Advanced+) saiu — plano difere só por assentos.
    if (input.cobrancaWhatsAtiva !== undefined) data.cobrancaWhatsAtiva = !!input.cobrancaWhatsAtiva;
    // F4 PROSPECTOR (07/08) — "organize os 3 disparos": a cobrança ganhou o
    // texto cadastrado que o aviso de chegada já tinha. MESMO tratamento do
    // avisoChegandoTemplate (trim + slice 1000, vazio → null); null = a mensagem
    // fixa de sempre no serviço de cobrança (zero regressão).
    if (input.cobrancaWhatsTemplate !== undefined) {
      const t = String(input.cobrancaWhatsTemplate ?? '').trim();
      data.cobrancaWhatsTemplate = t ? t.slice(0, 1000) : null;
    }
    // PROSPECTOR CNPJ (07/08) — MESMO shape do trio avisoChegando acima (toggle +
    // template + condição). OPERACIONAL: @Admin() do controller basta, não exige
    // billing owner (mesmo padrão de passeioEquipe) — quem escolhe
    // é o admin da operação, e o que gasta crédito (abrir lead) tem gate próprio
    // no ato. 24/08/2026: a env global HBX_PROSPECTOR_ENABLED morreu (hard-on) —
    // este toggle da empresa é a única chave de produto que resta.
    if (input.prospectorAtivo !== undefined) data.prospectorAtivo = !!input.prospectorAtivo;
    if (input.prospectorTemplate !== undefined) {
      const t = String(input.prospectorTemplate ?? '').trim();
      data.prospectorTemplate = t ? t.slice(0, 1000) : null;
    }
    // Raio do corredor: 150 m é o valor MEDIDO em produção (~53 CNPJs/parada).
    // Piso 50 (abaixo disso o pino nível 1-2 não distingue vizinho) e teto 500
    // (acima vira lista, não escolha — "53/parada obriga funil").
    if (input.prospectorRaioM !== undefined) data.prospectorRaioM = clampInt(input.prospectorRaioM, 50, 500, 150);
    // Quantas acendem sozinhas no dia — o "3 a 5" do dono, com folga 1..8.
    if (input.prospectorMaxDia !== undefined) data.prospectorMaxDia = clampInt(input.prospectorMaxDia, 1, 8, 4);
    // 24/08/2026 — `prospectorEquipe` MORREU: com o toggle da empresa ligado,
    // TODO usuário vê o prospector (a régua "funcionário só com equipe" saiu;
    // o que segura a primeira vez agora é o "Ciente" por usuário).
    // ITEM 9 DO DONO (07/08) — o admin desliga módulos do app do motorista PELO
    // DESKTOP. OPERACIONAL (não exige billing owner) e normalizado igual ao
    // diasTrabalho: split, filtra chave válida, dedupe, sort, vazio → null.
    // 🔴 "rota" NUNCA entra (ver normalizeAppModulosDesativados).
    if (input.appModulosDesativados !== undefined) {
      data.appModulosDesativados = normalizeAppModulosDesativados(input.appModulosDesativados);
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
    const prospectorCiente = await this.computeProspectorCiente(actor);
    return serializeConfig(cfg, actor, creditosEsgotados, prospectorCiente);
  }

  // ⚰️ `updateRouteMode` (PATCH /logistica/config/modo-rota) MORREU em
  // 24/08/2026: não existe mais escolha de modo — toda rota nasce TRACKED
  // (decisão do dono). O endpoint saiu do controller junto; rota antiga
  // ESSENTIAL congelada em LogisticaRoute.mode continua sendo lida normalmente.

  // ── PR27072026 F1 — NÍVEL DO PLANO (Basic/Advanced/Full), SÓ O MASTER ───────
  /** Nível gravado (grandfathering resolvido: ausente/sujo → ADVANCED). */
  async getNivel(companyId: number): Promise<{ nivel: LogisticaNivel; logisticaAssentos: number | null }> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const cfg = await this.ensureRow(companyId);
    return {
      nivel: storedNivel((cfg as any).logisticaNivel),
      // ROTA v2 (10/08) — a PRESENÇA desta chave é o sinal pro /master de que o
      // PUT desta ficha já aceita o override de assentos (a ficha só mostra o
      // campo quando a chave vem; null = herda `assentosInclusos` do nível).
      logisticaAssentos: typeof (cfg as any).logisticaAssentos === 'number' ? (cfg as any).logisticaAssentos : null,
    };
  }

  /**
   * Aplica o nível. 24/08/2026 — o preset de toggles comerciais
   * (nivelPresetPatch) MORREU: plano difere SÓ por nº de assentos, então trocar
   * o nível grava nível (+ assentos, quando enviados) e NADA mais.
   * Guard de acesso (MasterGuard) fica no controller; aqui só valida o valor.
   *
   * ROTA v2 F2c (10/08) — `logisticaAssentosInput` é o override de assentos da
   * MESMA ficha (1 PUT, 1 tela: trocar nível e assentos juntos). `undefined` =
   * não mexe no override existente; número = grava (sanitize 1–999, mesma
   * régua do catálogo de níveis). Sem suporte a "limpar" por aqui de propósito
   * — o override nasce sempre null (herda do nível) e só o master grava um
   * valor; se um dia precisar voltar a herdar, o PATCH genérico da config
   * ganha a porta.
   */
  async setNivel(
    companyId: number,
    nivel: string,
    actor?: ActorKindUserLike,
    logisticaAssentosInput?: number,
  ): Promise<LogisticaConfigDTO> {
    if (!companyId) throw new BadRequestException('Empresa não identificada');
    const alvo = String(nivel || '').trim().toUpperCase();
    if (alvo !== 'BASIC' && alvo !== 'ADVANCED' && alvo !== 'FULL' && alvo !== 'CREDITO') {
      throw new BadRequestException('Nível inválido — use BASIC, ADVANCED, FULL ou CREDITO.');
    }
    const data: Record<string, unknown> = { logisticaNivel: alvo };
    if (logisticaAssentosInput !== undefined) {
      data.logisticaAssentos = clampInt(logisticaAssentosInput, 1, 999, 1);
    }
    const cfg = await this.prisma.logisticaConfig.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    const creditosEsgotados = await this.computeCreditosEsgotados(companyId);
    const prospectorCiente = await this.computeProspectorCiente(actor);
    return serializeConfig(cfg, actor, creditosEsgotados, prospectorCiente);
  }

  // ⚰️ `getProspectorAutomacao`/`setProspectorAutomacao` (GET/PUT /logistica/
  // master/company/:id/prospector-automacao) MORRERAM em 24/08/2026: o gate
  // Master do disparo automático era uma porta sem nada atrás (zero consumidor)
  // e as colunas prospectorAutomacaoAtiva/MaxDia saíram do schema junto.

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
/* CADASTRO EM MASSA (17/08) — onde o cliente novo fala com a HBX pra mandar a
   lista dele por foto. Mesmas envs que o financeiro já lê (`ADMIN_SUPPORT_*`):
   duas fontes pro mesmo "telefone da HBX" é como uma delas fica velha sem
   ninguém perceber. Só dígitos no telefone, porque quem consome é um `wa.me/`. */
// PR22082026: a fonte virou `common/hbx-support-contact.ts` (e-mail de boas-vindas e o
// "quero que a HBX me ligue" leem o MESMO número). Estes dois ficam como atalho local.
function suporteWhatsappDigits(): string {
  return supportWhatsappDigits();
}
function suporteEmailAlvo(): string {
  return supportEmail();
}

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

// ── ITEM 9 DO DONO (07/08) — MÓDULOS DO APP QUE O ADMIN DESLIGA PELO DESKTOP ──
/**
 * As ÚNICAS chaves desativáveis do app do motorista. Lista fechada de propósito:
 * chave que não está aqui é lixo (ou app velho/novo falando outra língua) e é
 * DESCARTADA, nunca gravada.
 *
 * 🔴 "rota" NÃO ESTÁ NA LISTA E NUNCA ESTARÁ — app de entrega sem rota não é
 * app. Desligar a rota deixaria o motorista com um aparelho que não faz a única
 * coisa que ele precisa fazer, e o admin descobriria isso na rua.
 */
export const APP_MODULOS_DESATIVAVEIS = ['fechamento', 'clientes', 'produtos', 'chat', 'ajustes'] as const;

/**
 * 🔴 A CHAVE VELHA, TRADUZIDA (09/08). O CSV vive no BANCO: quem desligou o
 * módulo antes de 09/08 tem a string 'caderneta' gravada. Só renomear a
 * allowlist faria a chave antiga cair no filtro de lixo, e o módulo que o admin
 * MANDOU sumir reapareceria no celular do motorista sozinho — decisão dele
 * desfeita em silêncio, que é o pior jeito de errar. Aqui ela é traduzida na
 * entrada E na saída; a linha some do banco na primeira vez que o admin salvar.
 */
const APP_MODULO_RENOMEADO: Record<string, string> = { caderneta: 'fechamento' };

/** Aplica os renomes na lista já normalizada (entrada e leitura usam a MESMA). */
export function traduzirModulosRenomeados(csv: string | null): string | null {
  if (!csv) return csv;
  const chaves = Array.from(
    new Set(
      csv.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        .map((k) => APP_MODULO_RENOMEADO[k] ?? k),
    ),
  ).sort();
  return chaves.length > 0 ? chaves.join(',') : null;
}
export type AppModuloDesativavel = (typeof APP_MODULOS_DESATIVAVEIS)[number];

/**
 * Normaliza o CSV de módulos desativados — MESMA receita do normalizeDiasTrabalho
 * acima: split, filtra o que é válido, dedupe, sort, vazio → null.
 * Case-insensitive ("Chat" = "chat"). "rota" é barrada DUAS vezes: por não estar
 * na allowlist e pelo filtro explícito (cinto-e-suspensório — se um dia alguém
 * engordar a lista sem ler o comentário, a lei continua de pé).
 */
function normalizeAppModulosDesativados(raw: unknown): string | null {
  const chaves = Array.from(
    new Set(
      String(raw ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        // O rename entra ANTES da allowlist: 'caderneta' vira 'fechamento' e
        // passa; sem esta linha ela seria descartada como lixo.
        .map((s) => APP_MODULO_RENOMEADO[s] ?? s)
        .filter((s) => s !== 'rota')
        .filter((s) => (APP_MODULOS_DESATIVAVEIS as readonly string[]).includes(s)),
    ),
  ).sort();
  return chaves.length > 0 ? chaves.join(',') : null;
}

// PR27072026 F2 — só os 3 valores da matriz do plano passam; qualquer outro (lixo,
// vazio) é rejeitado no chamador (BadRequestException), nunca gravado silencioso.
export type DevedorNaRotaModo = 'COBRANCA' | 'EXCLUIR' | 'NORMAL';
function normalizeDevedorNaRota(value: unknown): DevedorNaRotaModo | null {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'COBRANCA' || v === 'EXCLUIR' || v === 'NORMAL') return v;
  return null;
}

function serializeConfig(
  c: any,
  actor?: ActorKindUserLike,
  creditosEsgotados = false,
  prospectorCiente = false,
): LogisticaConfigDTO {
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
    sentinelaSemSinalMin: c.sentinelaSemSinalMin,
    sentinelaParadoMin: c.sentinelaParadoMin,
    sentinelaAtrasoMin: c.sentinelaAtrasoMin,
    diasTrabalho: c.diasTrabalho ?? null,
    avisoChegandoEnabled: !!c.avisoChegandoEnabled,
    avisoChegandoTemplate: c.avisoChegandoTemplate ?? null,
    avisoChegandoDistanciaM: c.avisoChegandoDistanciaM ?? 500,
    comprovanteFotoObrigatoria: !!c.comprovanteFotoObrigatoria,
    comprovanteAssinaturaObrigatoria: !!c.comprovanteAssinaturaObrigatoria,
    comprovanteCodigoObrigatorio: !!c.comprovanteCodigoObrigatorio,
    // MODO PASSEIO (29/07) — OPERACIONAL (todo ator lê): o APK decide se mostra
    // a entrada do modo pro papel comum. É TOGGLE, nunca valor (LEI DO VENDEDOR).
    passeioEquipe: !!c.passeioEquipe,
    // 24/08/2026 — `moduloFinanceiroAtivo`/`cobrancaSimples`/`precoPorClienteAtivo`
    // saíram do contrato: financeiro é sempre ligado (0,00 é valor legítimo).
    // PR18072026 W-A — formas de pagamento aceitas: OPERACIONAIS (lidas por
    // QUALQUER ator): o app do entregador precisa saber quais formas mostrar no
    // editar cliente MESMO sem ser billing owner. É TOGGLE, não valor financeiro
    // — LEI DO VENDEDOR segue protegendo saldo/valor, não estes booleanos.
    aceitaNaHora: c.aceitaNaHora === undefined ? true : !!c.aceitaNaHora,
    aceitaMensal: c.aceitaMensal === undefined ? true : !!c.aceitaMensal,
    aceitaFiado: c.aceitaFiado === undefined ? true : !!c.aceitaFiado,
    cobrancaAutomatica: !!c.cobrancaAutomatica,
    // ROTA-CONFERIDA — coluna real desde 26/07 (baseline do drift
    // VendasCardComplaint + migration logistica_flags_ligadas, ligada geral).
    // Operacional (todo ator, inclusive motorista) — o APK decide o fluxo.
    rotaConferidaAtiva: !!c.rotaConferidaAtiva,
    // PR27072026 F1 — nível do plano (Basic/Advanced/Full). OPERACIONAL (todo
    // ator lê, inclusive motorista/vendedor): o front usa pra acinzentar os
    // recursos que o nível não cobre ("ver-mas-não-usar" — decisão do dono).
    logisticaNivel: storedNivel(c.logisticaNivel),
    // ROTA v2 F2c (10/08) — override de ASSENTOS por empresa. OPERACIONAL (é o
    // portão que decide se ESTE motorista pode entrar na rota, ver
    // `assertAssentoDoDia`) — null = herda `assentosInclusos` do nível.
    logisticaAssentos: typeof c.logisticaAssentos === 'number' ? c.logisticaAssentos : null,
    // PR27072026 F2 — modo do tratamento do devedor na rota de hoje. OPERACIONAL
    // (todo ator lê, mesmo padrão do logisticaNivel acima): o chip por parada em
    // si (`somenteCobranca`) já é operacional no payload de /logistica/rota; este
    // campo é só o MODO configurado, pra tela de config saber o que mostrar
    // marcado sem precisar ser billing owner (mesmo padrão de cobrancaAutomatica).
    devedorNaRota: normalizeDevedorNaRota(c.devedorNaRota) ?? 'COBRANCA',
    // PROSPECTOR CNPJ (07/08) — OPERACIONAIS (todo ator lê, inclusive motorista):
    // o APK precisa saber se mostra os pinos apagados, com que texto fala, em que
    // raio acende e quantas vezes por dia. São TOGGLES e RÉGUAS, nunca valor: a
    // LEI DO VENDEDOR segue intacta. 24/08/2026 — `prospectorEquipe` e
    // `prospectorDisponivel` (env global) morreram: com o toggle da empresa
    // ligado, todo usuário vê; a 1ª vez é segurada pelo "Ciente" abaixo.
    prospectorAtivo: !!c.prospectorAtivo,
    prospectorTemplate: c.prospectorTemplate ?? null,
    prospectorRaioM: typeof c.prospectorRaioM === 'number' ? c.prospectorRaioM : 150,
    prospectorMaxDia: typeof c.prospectorMaxDia === 'number' ? c.prospectorMaxDia : 4,
    // PROSPECTOR CIENTE (24/08/2026) — carimbo DO ATOR (por usuário, no
    // servidor — espelho do tutorial obrigatório): o app só mostra o aviso
    // "Ciente" enquanto isto for false. Marca via POST /logistica/prospector/ciente.
    prospectorCiente: !!prospectorCiente,
    // ITEM 9 (07/08) — o que o admin DESLIGOU no app, lido por todo ator: é o
    // próprio app do motorista que precisa do CSV pra sumir com a entrada do
    // menu. null = tudo ligado. "rota" nunca aparece aqui (lei dura).
    // Traduzido na LEITURA também: o app novo poda por `data-ir="fechamento"`,
    // e a linha antiga do banco ainda diz 'caderneta'.
    appModulosDesativados: traduzirModulosRenomeados(c.appModulosDesativados ?? null),
    // CADASTRO EM MASSA (17/08) — o canal de suporte que a tela "você ainda não
    // tem clientes" oferece. OPERACIONAL: quem desenha essa tela é o APK, e
    // cravar telefone/e-mail dentro do APK obrigaria uma publicação nova pra
    // trocar um número. Mesma fonte que o financeiro já usa (ADMIN_SUPPORT_*),
    // pra não nascer uma segunda verdade sobre "onde fala com a HBX".
    suporteWhatsapp: suporteWhatsappDigits(),
    suporteEmail: suporteEmailAlvo(),
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
    // F4 (07/08) — o texto cadastrado da cobrança viaja JUNTO do toggle dela
    // (bloco do billing owner): é a voz da empresa cobrando dinheiro, não é
    // assunto do motorista na rua.
    cobrancaWhatsTemplate: c.cobrancaWhatsTemplate ?? null,
    cobrancaWhatsDisponivel: isCobrancaWhatsEnabled(),
    resumoDiarioAtivo: !!c.resumoDiarioAtivo,
    resumoDiarioHora: typeof c.resumoDiarioHora === 'number' ? c.resumoDiarioHora : 7,
    resumoDiarioDisponivel: isResumoDiarioEnabled(),
    pedidoPublicoAtivo: !!c.pedidoPublicoAtivo,
    pedidoPublicoToken: c.pedidoPublicoToken ?? null,
    pedidoPublicoDisponivel: isPedidoPublicoEnabled(),
    // 24/08/2026 — o app deduz "sou admin" por PRESENÇA de campo do bloco
    // billing-owner (hasOwnProperty(config,'modoRotaPadrao')). Com a escolha de
    // modo morta, este é o sinal EXPLÍCITO novo — o app migra pra ele no 361.
    admin: true,
    // 🪦 compat APK 359 em campo (ehAdmin por presença); remover no 361. O modo
    // é hard-on: toda rota nasce TRACKED, não existe mais preferência salva.
    modoRotaPadrao: 'TRACKED' as const,
  };
}

// 24/08/2026 — ESSENTIAL sobrevive SÓ como valor congelado em
// LogisticaRoute.mode (rota antiga); rota nova nasce sempre TRACKED.
export type LogisticaRouteMode = 'ESSENTIAL' | 'TRACKED';

/** Normaliza o `LogisticaRoute.mode` LEGADO do banco (valor sujo → ESSENTIAL). */
export function storedRouteMode(value: unknown): LogisticaRouteMode {
  return String(value || '').trim().toUpperCase() === 'TRACKED' ? 'TRACKED' : 'ESSENTIAL';
}

// ── PR27072026 F1 — NÍVEL DO PLANO (Basic/Advanced/Full) ─────────────────────
// ROTA v2 F2b (10/08) — CREDITO entra na união: o 4º nível, "Rota Avulsa"
// (débito por dia rodado, sem mensalidade nem franquia) — o berço de toda
// empresa nova (ver seedLogisticaConfigTx, tenant-provisioning.pipeline.ts).
export type LogisticaNivel = 'BASIC' | 'ADVANCED' | 'FULL' | 'CREDITO';

/**
 * Nível cru do banco → tipo válido. GRANDFATHERING: ausente/sujo cai em
 * ADVANCED, NUNCA em BASIC nem CREDITO — um valor corrompido/linha antiga
 * (pré-migration) jamais pode derrubar recurso de quem já usa financeiro real
 * (mesma regra do default da coluna no schema). CREDITO só existe quando
 * ALGUÉM gravou explicitamente (setNivel do master ou o nascimento da empresa
 * nova) — nunca é o pouso de um valor sujo.
 */
export function storedNivel(value: unknown): LogisticaNivel {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'BASIC' || v === 'FULL' || v === 'CREDITO') return v;
  return 'ADVANCED';
}

// ⚰️ 24/08/2026 — `nivelPresetPatch` e `effectiveRouteMode` MORRERAM: plano
// difere SÓ por nº de assentos (trocar o nível não escreve mais toggle
// comercial nenhum) e toda rota nasce TRACKED (a régua de 4 gates saiu junto
// com as colunas trackingAtivo/modoRotaPadrao). Os tipos
// UpdateLogisticaRouteModeInput/UpdateProspectorAutomacaoInput saíram junto.

// ── tipos ─────────────────────────────────────────────────────────────────────
export interface UpdateLogisticaConfigInput {
  avisoWhatsEnabled?: boolean;
  templateAviso?: string | null;
  raioChegadaM?: number;
  velocidadeMediaKmH?: number;
  tempoParadaMin?: number;
  sentinelaSemSinalMin?: number;
  sentinelaParadoMin?: number;
  sentinelaAtrasoMin?: number;
  cobrancaNaEntrega?: boolean;
  moduloRecoveryAtivo?: boolean;
  diasTrabalho?: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  avisoChegandoEnabled?: boolean;
  avisoChegandoTemplate?: string | null;
  avisoChegandoDistanciaM?: number;
  // S2 COBRANÇA-WHATS — toggle por tenant (efeito só com a env global ligada).
  cobrancaWhatsAtiva?: boolean;
  // F4 (07/08) — texto cadastrado da cobrança (comercial, billing owner).
  cobrancaWhatsTemplate?: string | null;
  // PROSPECTOR CNPJ (07/08) — operacionais (não exigem billing owner, mesmo
  // padrão de passeioEquipe). 24/08/2026: `prospectorEquipe` morreu (todo
  // usuário da empresa vê quando prospectorAtivo está on).
  prospectorAtivo?: boolean;
  prospectorTemplate?: string | null;
  prospectorRaioM?: number;
  prospectorMaxDia?: number;
  // ITEM 9 (07/08) — CSV dos módulos do app desligados pelo desktop.
  appModulosDesativados?: string | null;
  // S3 RESUMO-DIÁRIO — toggle por tenant + hora local 0-23 (efeito só com a env).
  resumoDiarioAtivo?: boolean;
  resumoDiarioHora?: number;
  // S6 PORTAL-PEDIDO — toggle por tenant do pedido público (efeito só com a env).
  pedidoPublicoAtivo?: boolean;
  comprovanteFotoObrigatoria?: boolean;
  comprovanteAssinaturaObrigatoria?: boolean;
  comprovanteCodigoObrigatorio?: boolean;
  // MODO PASSEIO (29/07) — liberação do modo pra equipe (operacional).
  passeioEquipe?: boolean;
  // PR18072026 W-A — formas de pagamento aceitas + painel Avançado. Todos
  // operacionais: não exigem billing owner.
  aceitaNaHora?: boolean;
  aceitaMensal?: boolean;
  aceitaFiado?: boolean;
  cobrancaAutomatica?: boolean;
  // PR27072026 F2 — modo de tratamento do devedor na rota de hoje (operacional;
  // 24/08/2026: sem gate de nível — plano difere só por assentos).
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
  sentinelaSemSinalMin: number;
  sentinelaParadoMin: number;
  sentinelaAtrasoMin: number;
  cobrancaNaEntrega?: boolean;
  moduloRecoveryAtivo?: boolean;
  diasTrabalho: string | null;
  pixChave?: string | null;
  pixNome?: string | null;
  pixCidade?: string | null;
  avisoChegandoEnabled: boolean;
  avisoChegandoTemplate: string | null;
  avisoChegandoDistanciaM: number;
  // S2 COBRANÇA-WHATS — toggle do tenant + derivado da env (read-only pro front).
  cobrancaWhatsAtiva?: boolean;
  // F4 (07/08) — texto cadastrado da cobrança; null = a mensagem fixa de sempre.
  cobrancaWhatsTemplate?: string | null;
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
  // 24/08/2026 — sinal explícito "sou admin" (bloco billing owner). O APK 359
  // deduz por presença de `modoRotaPadrao`; o 361 migra pra este campo.
  admin?: true;
  // 🪦 compat APK 359 em campo (ehAdmin por presença de campo); remover no 361.
  // Sempre 'TRACKED' — não existe mais escolha de modo.
  modoRotaPadrao?: 'TRACKED';
  comprovanteFotoObrigatoria: boolean;
  comprovanteAssinaturaObrigatoria: boolean;
  comprovanteCodigoObrigatorio: boolean;
  // MODO PASSEIO (29/07) — liberação pra equipe (operacional, todo ator lê).
  passeioEquipe: boolean;
  // PR18072026 W-A — formas de pagamento aceitas + painel Avançado. Todos
  // OPERACIONAIS (lidos por QUALQUER ator): o app do entregador usa pra decidir
  // quais formas de pagamento mostrar no editar cliente. 24/08/2026 —
  // moduloFinanceiroAtivo/cobrancaSimples/precoPorClienteAtivo morreram
  // (financeiro é sempre ligado; 0,00 é valor legítimo).
  aceitaNaHora: boolean;
  aceitaMensal: boolean;
  aceitaFiado: boolean;
  cobrancaAutomatica: boolean;
  // ROTA-CONFERIDA — tela de conferência no APK. Coluna real desde 26/07
  // (migration logistica_flags_ligadas), ligada pra todas as empresas.
  rotaConferidaAtiva: boolean;
  // PR27072026 F1 — nível do plano (Basic/Advanced/Full/Credito); ver serializeConfig.
  logisticaNivel: LogisticaNivel;
  // ROTA v2 F2c (10/08) — override de assentos por empresa; null = herda do nível.
  logisticaAssentos: number | null;
  // PR27072026 F2 — modo de tratamento do devedor na rota. OPERACIONAL (todo
  // ator lê, mesmo padrão do logisticaNivel acima); ver serializeConfig.
  devedorNaRota: DevedorNaRotaModo;
  // PROSPECTOR CNPJ (07/08) — OPERACIONAIS (todo ator lê; ver serializeConfig).
  // 24/08/2026: prospectorEquipe/prospectorDisponivel/prospectorAutomacao*
  // morreram; entrou o `prospectorCiente` (carimbo DO ATOR).
  prospectorAtivo: boolean;
  prospectorTemplate: string | null;
  prospectorRaioM: number;
  prospectorMaxDia: number;
  prospectorCiente: boolean;
  // ITEM 9 (07/08) — CSV dos módulos desligados; null = tudo ligado. Operacional.
  appModulosDesativados: string | null;
  // CADASTRO EM MASSA (17/08) — canal de suporte da tela de captura. Operacional.
  suporteWhatsapp: string;
  suporteEmail: string;
}
