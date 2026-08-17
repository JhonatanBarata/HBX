import { Injectable, Optional } from '@nestjs/common';
import { buildRadarStageIssue } from '../shared/radar-stage-policy';
import type { NormalizedSearchInput } from '../shared/radar-types';
import { CnpjPublicDatasetService } from '../providers/cnpj-public/cnpj-public-dataset.service';
import { CnpjPublicProviderService } from '../providers/cnpj-public/cnpj-public-provider.service';
import { CnpjDiscoveryService, isCnpjDiscoveryEnabled } from '../providers/cnpj-public/cnpj-discovery.service';
import type { CnpjPublicCompanyRecord, CnpjPublicDrainCursor } from '../providers/cnpj-public/cnpj-public-types';
import type { WebscrapingContactResult } from '../shared/radar-core-shared';
import type { RadarLeadSourceResult } from './radar-lead-source.types';

/**
 * LOTE 2 (17/08 — PR17082026): a fonte passou a DRENAR a base, então precisa devolver ONDE
 * parou e SE secou. Os dois campos são opcionais e nascem aqui, e não no
 * `RadarLeadSourceResult` de radar-lead-source.types.ts, porque aquele arquivo está fora do
 * recorte deste lote (edição paralela) e é o retorno de ~8 fontes diferentes. Como é
 * interseção, quem espera `RadarLeadSourceResult` continua compilando sem tocar em nada.
 */
export type RadarLeadSourceResultComDrenagem = RadarLeadSourceResult & {
  exhausted?: boolean;
  cursor?: CnpjPublicDrainCursor | null;
};

function envEnabled(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

/**
 * Teto de páginas por LOTE (env `HBX_RADAR_RFB_MAX_PAGES_PER_BATCH`, default 6 = 3.000 linhas).
 * É o botão que segura a cena de aceite "a tela não fica 10 min buscando": a drenagem devolve a
 * vez pro run quando bate o teto e continua do cursor no lote seguinte.
 */
const TETO_PAGINAS_POR_LOTE_PADRAO = 6;

function tetoDePaginasPorLote() {
  const bruto = Number(process.env.HBX_RADAR_RFB_MAX_PAGES_PER_BATCH);
  if (Number.isFinite(bruto) && bruto >= 1) return Math.min(50, Math.trunc(bruto));
  return TETO_PAGINAS_POR_LOTE_PADRAO;
}

/**
 * Disjuntor de seca: N páginas SEGUIDAS com zero aceito e a fonte para de insistir neste lote.
 * A porta da Receita rejeita muito (DV, situação, cidade, exclusão de segmento) — sem o
 * disjuntor, uma cidade com 28M de linhas incompatíveis faria a drenagem varrer a base inteira
 * de 500 em 500 sem nunca entregar um card.
 */
const PAGINAS_ZERADAS_ATE_SECAR = 3;

function sourceIssue(message: string) {
  return buildRadarStageIssue({
    stage: 'search',
    code: 'cnpj_public_failed',
    message,
    retryable: true,
    blocksDelivery: false,
  });
}

function normalizeCnpjKey(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

/** Merge dedup por cnpj — dataset primeiro (fonte já validada), discovery só completa. */
function mergeRecordsByCnpj(
  datasetRecords: CnpjPublicCompanyRecord[],
  discoveredRecords: CnpjPublicCompanyRecord[],
): CnpjPublicCompanyRecord[] {
  const seen = new Set<string>();
  const merged: CnpjPublicCompanyRecord[] = [];
  for (const record of datasetRecords) {
    const key = normalizeCnpjKey(record.cnpj);
    if (key) seen.add(key);
    merged.push(record);
  }
  for (const record of discoveredRecords) {
    const key = normalizeCnpjKey(record.cnpj);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged;
}

@Injectable()
export class RadarCnpjPublicSourceService {
  constructor(
    @Optional() private readonly provider?: CnpjPublicProviderService,
    @Optional() private readonly dataset?: CnpjPublicDatasetService,
    @Optional() private readonly discovery?: CnpjDiscoveryService,
  ) {}

  async run(input: {
    normalized: NormalizedSearchInput;
    seeds?: Array<Record<string, any>>;
    limit?: number;
    records?: CnpjPublicCompanyRecord[];
    prisma?: any;
    cursor?: CnpjPublicDrainCursor | null;
  }): Promise<RadarLeadSourceResultComDrenagem> {
    if (!envEnabled('HBX_RADAR_CNPJ_PUBLIC_ENABLED')) {
      return {
        source: 'cnpj_public',
        status: 'skipped',
        retryable: false,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: 'flag_cnpj_public_desativada',
        results: [],
        // Flag desligada não é "a Receita ainda tem base pra dar" — é "não há Receita neste
        // ambiente". Marcar seca aqui é o que libera a web na hora, sem esperar nada.
        exhausted: true,
        cursor: null,
      };
    }

    const provider = this.provider || new CnpjPublicProviderService();
    const dataset = this.dataset || new CnpjPublicDatasetService();
    const limite = Math.max(1, Number(input.limit) || 20);
    const tetoPaginas = tetoDePaginasPorLote();
    const registrosInjetados = input.records?.length ? input.records : null;

    try {
      // AQUI NASCE A DRENAGEM (A5 do LOTE 2, 17/08): o loop do run só pede "me traz até
      // `limite`" — quem vira as páginas da base é esta fonte. Motivo de estar aqui e não no
      // loop: a porta da Receita REJEITA muito (DV, situação, cidade, exclusão de segmento),
      // então uma página de 500 pode render 2 aceitos; sem o while, "drenagem" viraria uma
      // página por lote e a base de 86 empresas levaria 43 lotes pra sair.
      let cursor: CnpjPublicDrainCursor | null = input.cursor ?? null;
      let exhausted = false;
      let datasetQueried = false;
      let paginas = 0;
      let paginasZeradasSeguidas = 0;
      let foundCount = 0;
      let acceptedCount = 0;
      let rejectedCount = 0;
      let houvePaginaComLinhas = false;
      let status: RadarLeadSourceResult['status'] = 'skipped';
      let retryable = false;
      let reason = 'cnpj_public_provider_sem_base_configurada';
      let issueMessage: string | null = null;
      const results: WebscrapingContactResult[] = [];
      const registrosVistos: CnpjPublicCompanyRecord[] = [];

      do {
        let registrosDaPagina: CnpjPublicCompanyRecord[];
        // Fase da página LIDA (não a do próximo cursor): é nela que a re-âncora tem de cair
        // quando o provider para no meio. `null` = a página não veio da base (injetada ou
        // processo sem prisma), então não há cursor a corrigir.
        let fasePagina: CnpjPublicDrainCursor['phase'] | null = null;
        if (paginas === 0 && registrosInjetados) {
          // Registros injetados pelo caller (executor de lanes / teste): não há base a virar,
          // é uma passada só.
          registrosDaPagina = registrosInjetados;
          exhausted = true;
        } else if (input.prisma) {
          const pagina = await dataset.fetchRecordsPage({
            prisma: input.prisma,
            normalized: input.normalized,
            cursor,
          });
          // A7 (LOTE 1): a base FOI consultada e respondeu — mesmo com zero linha. É o que
          // separa 'sem_match_na_base' (honesto) de 'sem_base_configurada' (mentira de infra).
          datasetQueried = true;
          registrosDaPagina = pagina.records;
          fasePagina = pagina.phase === 'without_contact' ? 'without_contact' : 'with_contact';
          cursor = pagina.nextCursor;
          exhausted = pagina.exhausted;
        } else {
          // Processo sem prisma: não existe base pra drenar, e dizer o contrário travaria a web.
          registrosDaPagina = [];
          exhausted = true;
        }
        paginas += 1;
        if (registrosDaPagina.length) registrosVistos.push(...registrosDaPagina);

        const parcial = await provider.search({
          normalized: input.normalized,
          seeds: input.seeds,
          limit: Math.max(1, limite - acceptedCount),
          records: registrosDaPagina,
          datasetQueried,
        });
        foundCount += parcial.foundCount;
        acceptedCount += parcial.acceptedCount;
        rejectedCount += parcial.rejectedCount;
        results.push(...parcial.results);
        // Página COM linhas sempre dita o motivo; página vazia só fala quando ninguém falou
        // ainda — senão a última página seca apagaria o "records_normalizados" das anteriores.
        if (registrosDaPagina.length || !houvePaginaComLinhas) {
          status = parcial.status;
          retryable = parcial.retryable;
          reason = parcial.reason;
          issueMessage = parcial.issue ? parcial.issue.message : null;
        }
        if (registrosDaPagina.length) houvePaginaComLinhas = true;

        // ── O CURSOR SÓ ANDA ATÉ ONDE O PROVIDER PERCORREU (17/08) ──────────────────────────
        // A porta da Receita para no `limit` (`accepted.length >= limit` → break) e larga o
        // rabo da página SEM AVALIAR. O cursor da página, porém, nasce ancorado na última linha
        // CRUA — e, em página curta, ainda VIRA A FASE. Somando os dois, tudo que estava depois
        // do N-ésimo aceito ficava atrás do cursor: inalcançável no resto do run (com página de
        // 500 e meta 20, até 480 linhas por lote; foi assim que Valinhos entregou 20 de 86).
        // Aqui o cursor volta pro último registro CONSUMIDO e a fase NÃO fecha — o lote seguinte
        // (ou a volta seguinte deste laço, quando o provider clampa em 100) continua exatamente
        // dali.
        //
        // A alternativa avaliada era não deixar o provider parar no meio quando está a serviço
        // da drenagem (mandar `limit` do tamanho da página). Descartada: ela faria a porta
        // avaliar 500 linhas pra entregar 20, obrigaria a fonte a APARAR o excedente depois (a
        // meta do cliente é teto de produto) e nesse aparo `acceptedCount`/`rejectedCount`
        // passariam a contar o que foi jogado fora — contador mentiroso, o mesmo tipo de defeito
        // que este conserto está matando. Ainda exigiria a mesma âncora no último mantido, e
        // pediria pra afrouxar o clamp de 100 do provider, que protege TODOS os callers.
        const consumidos = Number(parcial.consumedCount);
        const percorridos = Number.isFinite(consumidos)
          ? Math.max(0, Math.min(consumidos, registrosDaPagina.length))
          // Provider legado/stub que não informa: mantém o comportamento antigo (assume página
          // percorrida inteira) em vez de travar a drenagem.
          : registrosDaPagina.length;
        if (fasePagina && percorridos < registrosDaPagina.length) {
          const ancora = String(registrosDaPagina[percorridos - 1]?.cnpj || '') || null;
          // Sem âncora utilizável a página seguinte repetiria esta pra sempre — nesse caso vale
          // mais o cursor do dataset (na prática não acontece: o registro que estoura o limite é
          // sempre um ACEITO, e aceito sem CNPJ válido não existe).
          if (ancora) {
            cursor = { phase: fasePagina, cnpj: ancora };
            exhausted = false;
          }
        }

        paginasZeradasSeguidas = parcial.acceptedCount === 0 ? paginasZeradasSeguidas + 1 : 0;
        if (paginasZeradasSeguidas >= PAGINAS_ZERADAS_ATE_SECAR) exhausted = true;
      } while (!exhausted && acceptedCount < limite && paginas < tetoPaginas);

      // Furo comprovado 01/07 (docs/PLANEJAMENTOS/PR01072026/30-motor-receita.md): o dataset
      // local não tinha nada a alimentá-lo por nicho+cidade. Quando o dataset não bastou e a
      // flag está ligada, descobre CNPJs via busca web (queries segmento+cidade) e hidrata via
      // L4 — merge dedup por cnpj, dataset sempre primeiro. Falha do discovery NUNCA derruba a
      // fonte: segue só com o que o dataset já tinha (degrade gracioso).
      //
      // LOTE 2 (17/08): a condição virou `exhausted` em vez de "trouxe menos que o alvo". Com
      // páginas, a regra antiga dispararia discovery em TODA página (dezenas de buscas web por
      // lote — exatamente o lixo que o Lote 3 vai matar). Só depois que a Receita secou de
      // verdade é que faz sentido perguntar à web quem mais existe.
      let discoveredCount = 0;
      if (exhausted && acceptedCount < limite && isCnpjDiscoveryEnabled() && input.prisma) {
        try {
          const discovered = await (this.discovery || new CnpjDiscoveryService()).discover({
            normalized: input.normalized,
            needed: limite - acceptedCount,
            prisma: input.prisma,
          });
          // `mergeRecordsByCnpj` devolve os já vistos na frente e os inéditos no rabo — o corte
          // separa o que o discovery acrescentou de verdade do que já saiu pela drenagem.
          const ineditos = mergeRecordsByCnpj(registrosVistos, discovered).slice(registrosVistos.length);
          discoveredCount = ineditos.length;
          if (ineditos.length) {
            const parcial = await provider.search({
              normalized: input.normalized,
              seeds: input.seeds,
              limit: Math.max(1, limite - acceptedCount),
              records: ineditos,
              datasetQueried,
            });
            foundCount += parcial.foundCount;
            acceptedCount += parcial.acceptedCount;
            rejectedCount += parcial.rejectedCount;
            results.push(...parcial.results);
            status = parcial.status;
            retryable = parcial.retryable;
            reason = parcial.reason;
            issueMessage = parcial.issue ? parcial.issue.message : null;
          }
        } catch {
          // degrade gracioso: discovery falhou, segue só com o dataset
        }
      }

      return {
        source: 'cnpj_public',
        status,
        retryable,
        foundCount,
        acceptedCount,
        rejectedCount,
        reason: discoveredCount ? `${reason}; discovery_encontrou_${discoveredCount}` : reason,
        results,
        issue: issueMessage ? sourceIssue(issueMessage) : null,
        exhausted,
        cursor: exhausted ? null : cursor,
      };
    } catch (error) {
      const issue = sourceIssue(String((error as any)?.message || error || 'cnpj_public falhou'));
      return {
        source: 'cnpj_public',
        status: 'partial_error',
        retryable: true,
        foundCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        reason: issue.message,
        results: [],
        issue,
        // FAIL-OPEN: erro da Receita NUNCA pode trancar a lane web. Sem `exhausted: true` aqui,
        // uma falha de delegate deixaria o run esperando pra sempre uma drenagem que não vem.
        exhausted: true,
        cursor: null,
      };
    }
  }
}
