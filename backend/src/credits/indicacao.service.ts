import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService } from './credit-wallet.service';
import { computeDefaultExpiresAt } from './credit-pack-catalog';
import { INDICACAO_BONUS_CREDITS, isIndicacaoFeatureEnabled } from './indicacao.flags';

// S5 INDICAÇÃO (docs/PLANEJAMENTOS/VISAO-FUTURO/S5-indicacao-com-creditos.md) — programa
// "indique e ganhe" DORMENTE atrás de HBX_INDICACAO_ENABLED (default OFF).
//
// Desenho anti-farm:
// - código opaco por empresa (`ind_` + 8 hex — mesmo padrão do slug `co_...`), NUNCA
//   derivado do nome; link `https://<host>/?ref=<code>`;
// - no signup o code resolve → grava Company.indicadaPorCompanyId (best-effort, ref
//   inválido = ignora); NENHUM crédito sai no cadastro (senão vira farm de contas);
// - o bônus (INDICACAO_BONUS_CREDITS pra CADA lado) sai SÓ na 1ª recarga PAGA aprovada
//   da indicada, via CreditWalletService.grant idempotente por usageKey:
//     indicador: `referral:indicador:<indicadaCompanyId>`
//     indicada:  `referral:indicada:<indicadaCompanyId>`
//   `kind:'promo'`/`grantType:'promo'` (NUNCA receita), `sourceRef:'referral_program'`;
// - auto-indicação (indicadaPorCompanyId == própria empresa) é ignorada.
//
// Invariante do S2 preservada: este serviço depende SÓ do Prisma + wallet (CreditsModule
// não importa nada de fora). O hook de recarga vive no financeiro (credit-recharge.service),
// que já importa o CreditsModule — direção única, sem ciclo.

const CODE_PREFIX = 'ind_';
const CODE_CREATE_MAX_ATTEMPTS = 5;

export type IndicacaoMe = {
  code: string;
  link: string;
  bonusCredits: number;
  // Empresas que se cadastraram com o meu código (gravaram indicadaPorCompanyId).
  indicadas: number;
  // Das indicadas, quantas CONVERTERAM (1ª recarga paga aprovada → bônus do indicador
  // existe no ledger — 1 lote `referral:indicador:<id>` por indicada convertida).
  convertidas: number;
};

export type IndicacaoBonusResult = {
  granted: boolean;
  reason:
    | 'ok'
    | 'flag_off'
    | 'company_invalida'
    | 'sem_indicador'
    | 'auto_indicacao'
    | 'nao_e_primeira_recarga';
};

@Injectable()
export class IndicacaoService {
  private readonly logger = new Logger(IndicacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  private appBaseUrl(): string {
    // Mesmo padrão de URL pública do resto do backend (auth.service/financeiro.service).
    return String(process.env.APP_URL || process.env.FRONTEND_URL || 'https://hbxsystem.com.br').replace(/\/$/, '');
  }

  private assertEnabled() {
    // Flag OFF ⇒ 404 neutro (mesmo padrão de módulo inerte do credits.controller).
    if (!isIndicacaoFeatureEnabled()) {
      throw new NotFoundException('Recurso indisponivel');
    }
  }

  /**
   * Código de indicação da empresa — gera sob demanda (`ind_` + 8 hex) e persiste.
   * Corrida entre 2 chamadas: `updateMany` condicional (WHERE indicacaoCode IS NULL) —
   * quem perde a corrida relê e devolve o código que o vencedor gravou (nunca troca um
   * código já distribuído). Colisão do hex (unique) só re-sorteia.
   */
  async getOrCreateCode(companyId: number): Promise<string> {
    this.assertEnabled();
    const id = Math.trunc(Number(companyId || 0));
    if (!id) throw new NotFoundException('Empresa não encontrada');

    const company = await this.prisma.company.findUnique({
      where: { id },
      select: { id: true, indicacaoCode: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (company.indicacaoCode) return company.indicacaoCode;

    for (let attempt = 0; attempt < CODE_CREATE_MAX_ATTEMPTS; attempt++) {
      const code = `${CODE_PREFIX}${crypto.randomBytes(4).toString('hex')}`;
      try {
        const updated = await this.prisma.company.updateMany({
          where: { id, indicacaoCode: null },
          data: { indicacaoCode: code },
        });
        if (updated.count > 0) return code;
        // Outra chamada concorrente gravou primeiro — devolve o código dela.
        const current = await this.prisma.company.findUnique({
          where: { id },
          select: { indicacaoCode: true },
        });
        if (current?.indicacaoCode) return current.indicacaoCode;
      } catch (error: any) {
        // P2002 = hex colidiu com o código de OUTRA empresa (unique global) → re-sorteia.
        if (error?.code !== 'P2002') throw error;
      }
    }
    throw new Error(`indicacao: não foi possível gerar código único (company=${id})`);
  }

  /**
   * Resolve um código de indicação → id da empresa indicadora. NUNCA lança (o chamador
   * é o signup — ref inválido/flag OFF/erro = null e o cadastro segue idêntico).
   */
  async resolveCode(code?: string | null): Promise<number | null> {
    if (!isIndicacaoFeatureEnabled()) return null;
    const normalized = String(code || '').trim();
    if (!normalized) return null;
    try {
      const company = await this.prisma.company.findUnique({
        where: { indicacaoCode: normalized },
        select: { id: true },
      });
      return company?.id ?? null;
    } catch (error: any) {
      this.logger.warn(`indicacao_resolve_code_failed error=${String(error?.message || error)}`);
      return null;
    }
  }

  /**
   * Gancho da 1ª recarga PAGA aprovada da empresa (chamado pelo financeiro DEPOIS do
   * grant da recarga — best-effort `.catch(log)` lá; aqui pode lançar). Dispara os 2
   * bônus (indicador + indicada) quando:
   *  - a flag está ON;
   *  - a empresa foi indicada (indicadaPorCompanyId) e NÃO é auto-indicação;
   *  - esta é a 1ª recarga paga da empresa (exatamente 1 lote `recharge`/`paid` no
   *    ledger — o da recarga que acabou de aprovar). 2ª+ recarga = no-op, mesmo que o
   *    programa estivesse OFF na 1ª (bônus só na primeira, nunca "atrasado").
   * Idempotente ponta-a-ponta: usageKeys estáveis por indicadaCompanyId — retry/corrida
   * nunca dobra bônus (dedup no ledger).
   */
  async onPrimeiraRecargaAprovada(companyId: number): Promise<IndicacaoBonusResult> {
    if (!isIndicacaoFeatureEnabled()) return { granted: false, reason: 'flag_off' };
    const id = Math.trunc(Number(companyId || 0));
    if (!id) return { granted: false, reason: 'company_invalida' };

    const company = await this.prisma.company.findUnique({
      where: { id },
      select: { id: true, indicadaPorCompanyId: true },
    });
    const indicadorId = Math.trunc(Number(company?.indicadaPorCompanyId || 0));
    if (!company || !indicadorId) return { granted: false, reason: 'sem_indicador' };
    // Anti-farm: auto-indicação nunca paga.
    if (indicadorId === id) return { granted: false, reason: 'auto_indicacao' };

    // 1ª recarga paga? O hook roda depois do grant da recarga, então a recarga atual JÁ
    // está no ledger: primeira ⇔ exatamente 1 lote pago. (Corrida de 2 "primeiras"
    // simultâneas não dobra nada: as usageKeys abaixo são as MESMAS nas duas execuções.)
    const recargasPagas = await this.prisma.creditLedgerEntry.count({
      where: { companyId: id, kind: 'recharge', grantType: 'paid' },
    });
    if (recargasPagas !== 1) return { granted: false, reason: 'nao_e_primeira_recarga' };

    const amount = INDICACAO_BONUS_CREDITS;
    const expiresAt = computeDefaultExpiresAt();

    // Indicada primeiro (é dela o evento); indicador só se a empresa ainda existir.
    await this.wallet.grant(id, amount, {
      kind: 'promo',
      grantType: 'promo',
      expiresAt,
      sourceRef: 'referral_program',
      usageKey: `referral:indicada:${id}`,
      metadata: { program: 'indicacao', role: 'indicada', indicadorCompanyId: indicadorId },
    });

    const indicador = await this.prisma.company.findUnique({
      where: { id: indicadorId },
      select: { id: true },
    });
    if (indicador) {
      await this.wallet.grant(indicadorId, amount, {
        kind: 'promo',
        grantType: 'promo',
        expiresAt,
        sourceRef: 'referral_program',
        usageKey: `referral:indicador:${id}`,
        metadata: { program: 'indicacao', role: 'indicador', indicadaCompanyId: id },
      });
    }

    this.logger.log(
      `indicacao_bonus_granted indicada=${id} indicador=${indicadorId} amount=${amount} indicadorExiste=${Boolean(indicador)}`,
    );
    return { granted: true, reason: 'ok' };
  }

  /** Painel do admin: código + link montado + contagens (indicadas × convertidas). */
  async getMeForCompany(companyId: number): Promise<IndicacaoMe> {
    this.assertEnabled();
    const id = Math.trunc(Number(companyId || 0));
    if (!id) throw new NotFoundException('Empresa não encontrada');

    const code = await this.getOrCreateCode(id);
    const [indicadas, convertidas] = await Promise.all([
      this.prisma.company.count({ where: { indicadaPorCompanyId: id } }),
      // 1 lote `referral:indicador:<indicadaId>` na MINHA carteira por indicada convertida.
      this.prisma.creditLedgerEntry.count({
        where: { companyId: id, usageKey: { startsWith: 'referral:indicador:' } },
      }),
    ]);

    return {
      code,
      link: `${this.appBaseUrl()}/?ref=${encodeURIComponent(code)}`,
      bonusCredits: INDICACAO_BONUS_CREDITS,
      indicadas,
      convertidas,
    };
  }
}
