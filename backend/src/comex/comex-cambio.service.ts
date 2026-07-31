import { Injectable, Logger } from '@nestjs/common';

/**
 * COMEX — Câmbio PTAX (N3). Cotação oficial do Banco Central (API Olinda,
 * gratuita, sem chave): USD/EUR/CNY venda. Cache de 60min; fim de semana e
 * feriado servem a última cotação disponível (janela de 7 dias). Falha do BC
 * devolve null — a tela mostra "—", nunca inventa número.
 */

// CNY fora de propósito: o boletim PTAX do BC não cota yuan (só ~10 moedas);
// número de outra fonte aqui viraria "dado sem contrato" — mostramos só o oficial.
export type ComexCambio = {
  atualizadoEm: string | null;
  moedas: Array<{ moeda: 'USD' | 'EUR'; venda: number; dataCotacao: string }>;
};

const BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';
const CACHE_TTL_MS = 60 * 60 * 1000;

function fmtData(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getFullYear()}`;
}

@Injectable()
export class ComexCambioService {
  private readonly logger = new Logger('ComexCambio');
  private cache: { at: number; data: ComexCambio } | null = null;

  async cambio(): Promise<ComexCambio> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.data;
    const fim = new Date();
    const ini = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    const moedas: ComexCambio['moedas'] = [];

    const dolar = await this.fetchJson(
      `${BASE}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
        `?@dataInicial='${fmtData(ini)}'&@dataFinalCotacao='${fmtData(fim)}'&$top=100&$format=json`,
    );
    const ultDolar = (dolar?.value || []).at(-1);
    if (ultDolar?.cotacaoVenda) {
      moedas.push({ moeda: 'USD', venda: ultDolar.cotacaoVenda, dataCotacao: ultDolar.dataHoraCotacao });
    }

    for (const moeda of ['EUR'] as const) {
      const r = await this.fetchJson(
        `${BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
          `?@moeda='${moeda}'&@dataInicial='${fmtData(ini)}'&@dataFinalCotacao='${fmtData(fim)}'&$top=200&$format=json`,
      );
      // Boletim de fechamento é o último do dia; a lista vem cronológica.
      const ult = (r?.value || []).filter((x: any) => x?.cotacaoVenda).at(-1);
      if (ult) moedas.push({ moeda, venda: ult.cotacaoVenda, dataCotacao: ult.dataHoraCotacao });
    }

    const data: ComexCambio = {
      atualizadoEm: moedas.length ? new Date().toISOString() : null,
      moedas,
    };
    if (moedas.length) this.cache = { at: Date.now(), data };
    return data;
  }

  private async fetchJson(url: string): Promise<any | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error: any) {
      this.logger.warn(`PTAX indisponível: ${error?.message || error}`);
      return null;
    }
  }
}
