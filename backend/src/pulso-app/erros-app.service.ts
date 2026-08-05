import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenantScope } from '../prisma/tenant-context';

/**
 * ERROS QUE O CLIENTE VIU (PR05082026-VER-TELA V3, 05/08) — "Sentry-lite".
 *
 * O recorte é o que decide se isso serve ou vira lixão: **só entra aqui o que o
 * usuário VIU na cara dele** — toast vermelho e erro de JS que estourou na
 * tela. Warning de console, retry que deu certo, 404 esperado: nada disso é
 * erro do CLIENTE, é erro do programa, e já existe log pra isso.
 *
 * ── AS TRÊS LEIS DESTE ARQUIVO ─────────────────────────────────────────────
 *  1. **Nunca derrubar o poll.** Chega de carona nos recados de 5s; qualquer
 *     falha aqui é warn e o poll segue 200 (mesma lei do pulso).
 *  2. **Só quando HOUVER novidade.** O aparelho manda a lista apenas quando
 *     acumulou erro novo — poll normal continua com o corpo de sempre.
 *  3. **Retenção de 7 dias, com faxina lazy.** Trilha sem faxina vira lixão
 *     (mesmo padrão do MobileTelaTrilha).
 */

/** Quantos erros um único poll pode trazer — o app já limita o buffer em ~20. */
const LOTE_MAX = 20;

/** Dias guardados. */
const RETENCAO_DIAS = 7;

/** Uma faxina a cada N gravações — barato e sem cron. */
const FAXINA_A_CADA = 50;

/** Teto da leitura do painel. */
const PAINEL_TAKE = 50;

export interface ErroDoCliente {
  tela: string;
  msg: string;
  at: string;
}

@Injectable()
export class ErrosAppService {
  private readonly logger = new Logger(ErrosAppService.name);

  private gravadosDesdeFaxina = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Porta única do poll. Engole TUDO (Lei nº1); o retorno só existe pro teste.
   */
  async registrarDoPoll(
    companyId: number,
    deviceIdInput: unknown,
    userId: number,
    brutos: unknown,
  ): Promise<number> {
    try {
      const deviceId = String(deviceIdInput || '').trim();
      if (!companyId || !deviceId || !userId) return 0;
      if (!Array.isArray(brutos) || !brutos.length) return 0;

      const linhas = brutos
        .slice(0, LOTE_MAX)
        .map((bruto) => this.normalizar(bruto))
        .filter((linha): linha is { tela: string; msg: string; at: Date } => linha !== null);
      if (!linhas.length) return 0;

      await this.prisma.mobileErroTrilha.createMany({
        data: linhas.map((linha) => ({ companyId, deviceId, userId, ...linha })),
      });

      this.gravadosDesdeFaxina += linhas.length;
      if (this.gravadosDesdeFaxina >= FAXINA_A_CADA) {
        this.gravadosDesdeFaxina = 0;
        await this.faxina();
      }
      return linhas.length;
    } catch (e) {
      this.logger.warn(`[erros] falhou ao gravar: ${String((e as Error)?.message || e)}`);
      return 0;
    }
  }

  /**
   * O horário é do APARELHO aqui — de propósito: o erro pode ter acontecido
   * minutos antes do poll que o trouxe (buffer offline), e o instante do POST
   * mentiria sobre quando o cliente viu a tela quebrar. Mas o relógio de
   * terceiro é DESCONFIÁVEL: data torta, no futuro ou velha demais cai pra
   * agora, que é o pior caso aceitável.
   */
  private normalizar(bruto: unknown): { tela: string; msg: string; at: Date } | null {
    if (!bruto || typeof bruto !== 'object') return null;
    const linha = bruto as { tela?: unknown; msg?: unknown; at?: unknown };
    const msg = String(linha.msg ?? '').trim().slice(0, 300);
    if (!msg) return null;
    const tela = String(linha.tela ?? '').trim().slice(0, 40) || 'app';
    const agora = Date.now();
    const bruta = new Date(String(linha.at ?? ''));
    const valida =
      !Number.isNaN(bruta.getTime()) &&
      bruta.getTime() <= agora + 60_000 &&
      bruta.getTime() >= agora - RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    return { tela, msg, at: valida ? bruta : new Date(agora) };
  }

  /** Os últimos erros de UM aparelho (painel do master, lazy no clique). */
  async listar(deviceIdInput: unknown): Promise<ErroDoCliente[]> {
    const deviceId = String(deviceIdInput || '').trim();
    if (!deviceId) return [];
    const linhas = await withoutTenantScope('painel master: erros de um aparelho', () =>
      // tenant-scope-allow: leitura master, escopada por deviceId.
      this.prisma.mobileErroTrilha.findMany({
        where: { deviceId },
        orderBy: { at: 'desc' },
        take: PAINEL_TAKE,
        select: { tela: true, msg: true, at: true },
      }),
    );
    return linhas.map((linha) => ({ tela: linha.tela, msg: linha.msg, at: new Date(linha.at).toISOString() }));
  }

  /** Apaga o que passou de 7 dias. Best-effort: faxina não derruba poll. */
  private async faxina(): Promise<void> {
    try {
      const corte = new Date();
      corte.setHours(0, 0, 0, 0);
      corte.setDate(corte.getDate() - RETENCAO_DIAS);
      // A retenção é da PLATAFORMA: escopar esta faxina por tenant deixaria o
      // lixo de todas as outras empresas pra trás.
      const apagados = await withoutTenantScope('erros: faxina global da retenção de 7 dias', () =>
        // tenant-scope-allow: faxina global da retenção de 7 dias.
        this.prisma.mobileErroTrilha.deleteMany({ where: { at: { lt: corte } } }),
      );
      if (Number(apagados.count) > 0) {
        this.logger.log(`[erros] faxina: ${apagados.count} linha(s) antigas removidas.`);
      }
    } catch (e) {
      this.logger.warn(`[erros] faxina falhou: ${String((e as Error)?.message || e)}`);
    }
  }
}
