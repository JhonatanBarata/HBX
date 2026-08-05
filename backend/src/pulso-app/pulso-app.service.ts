import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';

/**
 * PULSO DO APP (PR04082026-PULSO-DO-APP, 04/08).
 *
 * O dono queria ver a tela real dos clientes SEM depender de ninguém. Até aqui
 * isso só existia lendo log de nginx na mão. Este serviço é o outro lado disso:
 * telemetria mínima do NOSSO app (NOME da tela + hora do servidor), nunca
 * imagem, nunca digitação, nunca conteúdo — o padrão de analytics de app.
 *
 * ── DE ONDE VEM O PULSO ────────────────────────────────────────────────────
 * De carona no poll que o APK JÁ faz a cada 5s (`POST /logistica/recados/
 * pendentes`). Nenhuma requisição nova nasce, nenhuma bateria a mais é gasta.
 *
 * ── AS TRÊS LEIS DESTE ARQUIVO ─────────────────────────────────────────────
 *  1. NUNCA derrubar o poll. Ele é a campainha da rota; recado é o canal do
 *     escritório com quem está na rua. Tela inválida, aparelho sumido, banco
 *     lento — tudo vira warn e o poll segue 200. Por isso `registrarDoPoll`
 *     não propaga NENHUMA exceção.
 *  2. Trilha é 1 linha por TROCA de tela, nunca por poll. A 5s, gravar todo
 *     pulso daria ~17 mil linhas por aparelho por dia — lixão, não trilha. A
 *     troca é detectada pelo PRÓPRIO UPDATE condicional (ver `registrar`):
 *     quem mudou a coluna é quem grava a trilha, então dois polls simultâneos
 *     não viram duas linhas.
 *  3. O relógio é do SERVIDOR. `ultimaTelaAt` nunca vem do aparelho — celular
 *     com hora errada mentiria o "há quanto tempo" do painel inteiro.
 *
 * Faxina: a trilha guarda HOJE + D-1 e é limpa de carona na troca de tela
 * (1 vez a cada `FAXINA_A_CADA` inserções). Trilha sem faxina vira lixão.
 */

/** Vocabulário aceito: letra/número/`:`/`_`/`-`, até 40 (o tamanho da coluna). */
const TELA_RE = /^[a-z0-9:_-]{1,40}$/i;

/** Aberto AGORA = pulsou há menos disto. O poll bate a cada 5s. */
export const PULSO_ABERTO_MS = 15_000;

/** Dias guardados na trilha: hoje + D-1. */
const TRILHA_DIAS = 1;

/** Uma faxina a cada N trocas de tela — barato e sem cron. */
const FAXINA_A_CADA = 50;

/** Teto de aparelhos no painel: é visão de plataforma, não relatório. */
const PAINEL_TAKE = 100;

/** Teto de pontos numa trilha do dia (o dia inteiro de um aparelho). */
const TRILHA_TAKE = 500;

export interface PulsoAparelho {
  deviceId: string;
  companyId: number;
  companyName: string;
  userName: string;
  // O NOME DO APARELHO ("Motorola moto g15") + quando pareou — sem isso, 4
  // aparelhos da mesma pessoa viram 4 linhas idênticas e o dono não distingue
  // o celular de teste dele do celular real do cliente (aconteceu 04/08).
  deviceName: string | null;
  pareadoEm: string | null;
  ultimaTela: string | null;
  ultimaTelaAt: string | null;
  /** Servidor decide: nunca deixar o painel calcular com relógio de terceiro. */
  abertoAgora: boolean;
  appVersion: string | null;
}

export interface PulsoTrilhaPonto {
  tela: string;
  at: string;
}

@Injectable()
export class PulsoAppService {
  private readonly logger = new Logger(PulsoAppService.name);

  /** Contador da faxina lazy — vive no processo, não precisa de persistência. */
  private trocasDesdeFaxina = 0;

  constructor(private readonly prisma: PrismaService) {}

  // ── ESCRITA (carona no poll do APK) ───────────────────────────────────────

  /**
   * Nome de tela que presta, ou null. Lixo NÃO é erro: APK velho não manda o
   * campo, APK novo pode mandar tela que ainda não existe aqui — nos dois casos
   * o poll segue vivo e a gente simplesmente não grava.
   *
   * Minúsculo à força: "Rota" e "rota" são a MESMA tela; sem normalizar, cada
   * variação de caixa viraria uma troca falsa e uma linha de trilha a mais.
   */
  sanitizarTela(valor: unknown): string | null {
    if (typeof valor !== 'string') return null;
    const limpo = valor.trim();
    if (!limpo || !TELA_RE.test(limpo)) return null;
    return limpo.toLowerCase();
  }

  /**
   * O aparelho do request. Sai do `sessionId` que o JwtStrategy montou
   * (`mobile:<deviceId>`) — NUNCA de campo do corpo: id de aparelho vindo do
   * cliente é id de aparelho de outra pessoa esperando acontecer.
   * Sessão web comum não tem aparelho: devolve null e o pulso não é gravado.
   */
  resolveDeviceIdDaSessao(user: unknown): string | null {
    const sessionId = String((user as { sessionId?: unknown } | null)?.sessionId || '').trim();
    if (!sessionId.startsWith('mobile:')) return null;
    return sessionId.slice('mobile:'.length).trim() || null;
  }

  /**
   * Porta única do poll: resolve o aparelho, valida a tela e grava. Engole
   * TUDO (Lei nº1) — o retorno é só para o teste saber o que aconteceu.
   */
  async registrarDoPoll(
    user: unknown,
    companyId: number,
    userId: number,
    telaBruta: unknown,
  ): Promise<'gravado' | 'ignorado'> {
    try {
      const tela = this.sanitizarTela(telaBruta);
      if (!tela) return 'ignorado';
      const deviceId = this.resolveDeviceIdDaSessao(user);
      if (!deviceId || !companyId || !userId) return 'ignorado';
      await this.registrar({ companyId, deviceId, userId, tela });
      return 'gravado';
    } catch (e) {
      // Pulso é enfeite de suporte; recado é operação. Enfeite não derruba rota.
      this.logger.warn(`[pulso] falhou ao gravar o pulso: ${String((e as Error)?.message || e)}`);
      return 'ignorado';
    }
  }

  /**
   * Grava o pulso já validado.
   *
   * O UPDATE condicional é o coração: ele só casa quando a tela gravada é
   * DIFERENTE da que chegou, então `count > 0` significa literalmente "esta
   * requisição foi quem trocou a tela" — e só ela insere na trilha. Sem isso,
   * dois polls que se cruzam inserem a mesma troca duas vezes.
   *
   * O `OR` com `ultimaTela: null` existe porque, em SQL, `coluna <> 'x'` é
   * NULL (nem verdadeiro nem falso) quando a coluna é NULL — o primeiro pulso
   * de um aparelho novo nunca casaria e a trilha começaria vazia.
   */
  private async registrar(input: {
    companyId: number;
    deviceId: string;
    userId: number;
    tela: string;
  }): Promise<void> {
    const { companyId, deviceId, userId, tela } = input;
    const agora = new Date();

    const trocou = await this.prisma.mobileDevice.updateMany({
      where: {
        id: deviceId,
        companyId,
        revokedAt: null,
        OR: [{ ultimaTela: null }, { ultimaTela: { not: tela } }],
      },
      data: { ultimaTela: tela, ultimaTelaAt: agora },
    });

    if (Number(trocou.count) <= 0) {
      // Mesma tela (ou aparelho revogado/apagado): só o carimbo da hora. É este
      // carimbo que o painel usa pra dizer 🟢 "está com o app aberto agora".
      await this.prisma.mobileDevice.updateMany({
        where: { id: deviceId, companyId, revokedAt: null },
        data: { ultimaTelaAt: agora },
      });
      return;
    }

    await this.prisma.mobileTelaTrilha.create({
      data: { companyId, deviceId, userId, tela, at: agora },
    });

    this.trocasDesdeFaxina += 1;
    if (this.trocasDesdeFaxina >= FAXINA_A_CADA) {
      this.trocasDesdeFaxina = 0;
      await this.faxina();
    }
  }

  /**
   * Apaga trilha mais velha que HOJE + D-1. Best-effort: faxina que falha não
   * pode transformar um poll de rota em erro.
   */
  private async faxina(): Promise<void> {
    try {
      const corte = new Date();
      corte.setHours(0, 0, 0, 0);
      corte.setDate(corte.getDate() - TRILHA_DIAS);
      // A retenção é da PLATAFORMA, não de uma empresa: escopar a faxina por
      // tenant deixaria o lixo de todas as outras empresas pra trás.
      const apagados = await withoutTenantScope('pulso: faxina global da trilha do dia', () =>
        // tenant-scope-allow: faxina global da retenção (hoje + D-1).
        this.prisma.mobileTelaTrilha.deleteMany({ where: { at: { lt: corte } } }),
      );
      if (Number(apagados.count) > 0) {
        this.logger.log(`[pulso] faxina da trilha: ${apagados.count} linha(s) antigas removidas.`);
      }
    } catch (e) {
      this.logger.warn(`[pulso] faxina da trilha falhou: ${String((e as Error)?.message || e)}`);
    }
  }

  // ── LEITURA (painel do /master) ───────────────────────────────────────────

  /**
   * Uma linha por aparelho pareado e vivo. Visão de PLATAFORMA: quem chama é
   * só o master (guard no controller), nunca admin de tenant.
   */
  async listarAparelhos(agoraInput?: Date): Promise<PulsoAparelho[]> {
    const agora = agoraInput ?? new Date();
    // tenant-scope-allow: painel do MASTER — a leitura é cross-company por
    // definição (é o dono da plataforma olhando a frota inteira).
    const linhas = await withoutTenantScope('pulso: painel master lê a frota inteira', () =>
      this.prisma.mobileDevice.findMany({
        where: { revokedAt: null },
        orderBy: { ultimaTelaAt: { sort: 'desc', nulls: 'last' } },
        take: PAINEL_TAKE,
        select: {
          id: true,
          companyId: true,
          name: true,
          createdAt: true,
          appVersion: true,
          ultimaTela: true,
          ultimaTelaAt: true,
          company: { select: { name: true } },
          user: { select: { name: true, username: true, email: true } },
        },
      }),
    );

    return linhas.map((linha) => {
      const at = linha.ultimaTelaAt ? new Date(linha.ultimaTelaAt) : null;
      return {
        deviceId: linha.id,
        companyId: Number(linha.companyId),
        companyName: linha.company?.name || `Empresa #${linha.companyId}`,
        userName:
          linha.user?.name || linha.user?.username || linha.user?.email || 'Sem nome',
        deviceName: linha.name ?? null,
        pareadoEm: linha.createdAt ? new Date(linha.createdAt).toISOString() : null,
        ultimaTela: linha.ultimaTela ?? null,
        ultimaTelaAt: at ? at.toISOString() : null,
        abertoAgora: Boolean(at && agora.getTime() - at.getTime() < PULSO_ABERTO_MS),
        appVersion: linha.appVersion ?? null,
      };
    });
  }

  /**
   * A trilha de UM aparelho num dia, na ordem em que aconteceu. Dia inválido
   * (ou ausente) = hoje: o painel nunca fica sem resposta por causa de um
   * parâmetro torto na URL.
   */
  async trilhaDoDia(deviceIdInput: string, dateInput?: string): Promise<PulsoTrilhaPonto[]> {
    const deviceId = String(deviceIdInput || '').trim();
    if (!deviceId) return [];
    const { start, end } = rangeDoDia(dateInput);

    // Painel do MASTER: a trilha é lida PELO APARELHO, que já é a chave mais
    // estreita possível — a empresa dele o painel já mostra na linha de cima.
    const linhas = await withoutTenantScope('pulso: painel master lê a trilha de um aparelho', () =>
      // tenant-scope-allow: leitura master, escopada por deviceId.
      this.prisma.mobileTelaTrilha.findMany({
        where: { deviceId, at: { gte: start, lte: end } },
        orderBy: { at: 'asc' },
        take: TRILHA_TAKE,
        select: { tela: true, at: true },
      }),
    );

    return linhas.map((linha) => ({ tela: linha.tela, at: new Date(linha.at).toISOString() }));
  }
}

/**
 * Janela local do dia (mesma semântica do rangeDoDia da logística). Data torta
 * cai pra hoje — o painel é ferramenta de suporte, não formulário.
 */
function rangeDoDia(dateInput?: string): { start: Date; end: Date } {
  const bruto = String(dateInput || '').trim();
  const base = /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : null;
  const hoje = new Date();
  const [ano, mes, dia] = base
    ? base.split('-').map(Number)
    : [hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate()];
  const start = new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
  const end = new Date(ano, (mes || 1) - 1, dia || 1, 23, 59, 59, 999);
  return { start, end };
}
