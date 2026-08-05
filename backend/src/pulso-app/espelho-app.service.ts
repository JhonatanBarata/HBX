import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';

/**
 * VER TELA — o espelho do NOSSO app (PR05082026-VER-TELA, 05/08).
 *
 * ── O QUE ESTE ARQUIVO NÃO É ───────────────────────────────────────────────
 * NÃO é MediaProjection, print do sistema, nem vídeo do celular. É session
 * replay do PRÓPRIO aplicativo (padrão LogRocket/Smartlook/UXCam): o app manda
 * a MARCAÇÃO da tela dele, já sanitizada, e o painel remonta. O dono nunca vê o
 * WhatsApp, a galeria ou a tela de bloqueio do cliente — só o HBX.
 *
 * ── AS QUATRO LEIS DESTE ARQUIVO ───────────────────────────────────────────
 *  1. **Só com a janela ABERTA.** `espelhoAte` vive 60s e o painel renova a
 *     cada 10s enquanto está na tela. Navegador fechado, aba trocada, notebook
 *     que dormiu — em 60s o aparelho para de mandar sozinho. Câmera que depende
 *     de alguém "lembrar de desligar" fica ligada pra sempre.
 *  2. **Espelho é AO VIVO, não gravação.** Uma linha por aparelho, sobrescrita.
 *     Histórico de tela de gente é outro produto e outra conversa de privacidade.
 *  3. **Digitação chega mascarada.** Quem mascara é o aparelho (app.js), antes
 *     de sair de lá — não adianta mascarar depois de trafegar.
 *  4. **Nunca derrubar o poll.** Este serviço é lido no poll de 5s dos recados,
 *     que é a campainha da rota: tudo aqui é best-effort e engole exceção.
 */

/** Quanto tempo a janela do espelho vive sem renovação. */
export const ESPELHO_TTL_MS = 60_000;

/** Teto do quadro (o DOM do app cabe folgado; acima disso é bug, não tela). */
const HTML_MAX = 400_000;

/** Teto do CSS do app (hoje ~200 KB) — viaja 1× por versão. */
const CSS_MAX = 600_000;

export interface EspelhoEstado {
  /** O aparelho deve mandar quadro agora? */
  ativo: boolean;
  /** O servidor ainda não tem o CSS DESTA versão do app. */
  precisaCss: boolean;
}

export interface EspelhoQuadro {
  ativo: boolean;
  tela: string | null;
  html: string | null;
  tema: string | null;
  bodyClass: string | null;
  css: string | null;
  at: string | null;
}

@Injectable()
export class EspelhoAppService {
  private readonly logger = new Logger(EspelhoAppService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── MASTER: abre e lê a janela ────────────────────────────────────────────

  /**
   * Abre (ou renova) a janela de 60s. O painel chama isto a cada 10s enquanto o
   * "Ver tela" está aberto — parar de chamar é o jeito de desligar.
   */
  async abrir(deviceIdInput: unknown): Promise<{ ok: true; ate: string }> {
    const alvo = await this.carregarAlvo(deviceIdInput);
    const ate = new Date(Date.now() + ESPELHO_TTL_MS);
    await this.prisma.mobileDevice.updateMany({
      where: { id: alvo.id, companyId: alvo.companyId },
      data: { espelhoAte: ate },
    });
    return { ok: true, ate: ate.toISOString() };
  }

  /** O último quadro que chegou. `ativo:false` = a janela expirou. */
  async quadro(deviceIdInput: unknown): Promise<EspelhoQuadro> {
    const alvo = await this.carregarAlvo(deviceIdInput);
    const linha = await withoutTenantScope('painel master: ler o espelho de um aparelho', () =>
      // tenant-scope-allow: leitura master, escopada pela PK (deviceId).
      this.prisma.mobileEspelhoQuadro.findUnique({ where: { deviceId: alvo.id } }),
    );
    const ativo = Boolean(alvo.espelhoAte && alvo.espelhoAte.getTime() > Date.now());
    if (!linha) return { ativo, tela: null, html: null, tema: null, bodyClass: null, css: null, at: null };
    return {
      ativo,
      tela: linha.tela,
      html: linha.html,
      tema: linha.tema ?? null,
      bodyClass: linha.bodyClass ?? null,
      css: linha.css ?? null,
      at: new Date(linha.at).toISOString(),
    };
  }

  // ── APK: o outro lado ─────────────────────────────────────────────────────

  /**
   * O que o poll de 5s precisa saber. Uma leitura por PK — só isso é o "peso"
   * que o espelho põe no poll, e ele NÃO cresce com a frota.
   *
   * Engole erro (Lei nº4): banco lento não pode transformar a campainha da rota
   * em 500. Sem resposta = espelho desligado, que é o lado seguro.
   */
  async estado(deviceIdInput: unknown): Promise<EspelhoEstado> {
    const desligado: EspelhoEstado = { ativo: false, precisaCss: false };
    try {
      const id = String(deviceIdInput || '').trim();
      if (!id) return desligado;
      const alvo = await withoutTenantScope('espelho: o poll do aparelho lê a própria janela', () =>
        this.prisma.mobileDevice.findUnique({
          where: { id },
          select: { espelhoAte: true, appVersion: true },
        }),
      );
      if (!alvo?.espelhoAte || alvo.espelhoAte.getTime() <= Date.now()) return desligado;
      const quadro = await withoutTenantScope('espelho: o poll confere se o CSS desta versão já subiu', () =>
        this.prisma.mobileEspelhoQuadro.findUnique({
          where: { deviceId: id },
          select: { css: true, cssVersao: true },
        }),
      );
      const versao = String(alvo.appVersion || '').trim() || 'sem-versao';
      const precisaCss = !quadro?.css || String(quadro.cssVersao || '') !== versao;
      return { ativo: true, precisaCss };
    } catch (e) {
      this.logger.warn(`[espelho] estado falhou: ${String((e as Error)?.message || e)}`);
      return desligado;
    }
  }

  /**
   * Grava o quadro que o aparelho mandou. Só grava com a janela ABERTA: sem
   * isso, um app com bug (ou alguém curioso com o token do aparelho) manteria o
   * servidor recebendo tela pra sempre.
   */
  async gravarQuadro(
    companyId: number,
    deviceIdInput: unknown,
    dto: { tela?: unknown; html?: unknown; tema?: unknown; bodyClass?: unknown; css?: unknown },
  ): Promise<{ ok: boolean }> {
    const deviceId = String(deviceIdInput || '').trim();
    if (!companyId || !deviceId) return { ok: false };

    const alvo = await withoutTenantScope('espelho: o aparelho confere a própria janela antes de gravar', () =>
      this.prisma.mobileDevice.findUnique({
        where: { id: deviceId },
        select: { companyId: true, espelhoAte: true, appVersion: true },
      }),
    );
    // Aparelho de OUTRA empresa nunca grava aqui (o companyId vem do JWT).
    if (!alvo || Number(alvo.companyId) !== Number(companyId)) return { ok: false };
    if (!alvo.espelhoAte || alvo.espelhoAte.getTime() <= Date.now()) return { ok: false };

    const tela = String(dto.tela || '').trim().slice(0, 40) || 'tela';
    // html/css passam do teto = quadro RECUSADO, nunca cortado: HTML cortado no
    // meio de uma tag vira sopa na tela do painel — "sem quadro" é mais honesto.
    const html = dentroDoTeto(dto.html, HTML_MAX);
    if (!html) return { ok: false };
    const css = dentroDoTeto(dto.css, CSS_MAX);
    const versao = String(alvo.appVersion || '').trim() || 'sem-versao';

    // O CSS só entra quando VEIO: quadro sem css (o caso normal, 1 a cada 2s)
    // não pode apagar o css que já está guardado — senão o painel pisca em
    // "tela crua" a cada quadro.
    const dados = {
      companyId,
      tela,
      html,
      tema: String(dto.tema || '').trim().slice(0, 20) || null,
      bodyClass: String(dto.bodyClass || '').trim().slice(0, 160) || null,
      at: new Date(),
      ...(css ? { css, cssVersao: versao } : {}),
    };
    await withoutTenantScope('espelho: o aparelho grava o próprio quadro (PK = deviceId)', () =>
      // tenant-scope-allow: upsert por PK do aparelho, com companyId no dado.
      this.prisma.mobileEspelhoQuadro.upsert({
        where: { deviceId },
        create: { deviceId, ...dados, css: css ?? null, cssVersao: css ? versao : null },
        update: dados,
      }),
    );
    return { ok: true };
  }

  /** Aparelho existente? Devolve o companyId que escopa a escrita do master. */
  private async carregarAlvo(deviceIdInput: unknown) {
    const id = String(deviceIdInput || '').trim();
    if (!id) throw new BadRequestException('Aparelho inválido.');
    const alvo = await withoutTenantScope('painel master: resolver o aparelho do espelho', () =>
      this.prisma.mobileDevice.findUnique({
        where: { id },
        select: { id: true, companyId: true, espelhoAte: true },
      }),
    );
    if (!alvo) throw new NotFoundException('Aparelho não encontrado.');
    return alvo;
  }
}

/** Texto que cabe no teto, ou vazio (nunca cortado pela metade). */
function dentroDoTeto(valor: unknown, max: number): string {
  if (typeof valor !== 'string') return '';
  const limpo = valor.trim();
  return limpo.length > max ? '' : limpo;
}
