import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { saoPauloDateKey } from './logistica-dia.util';
import {
  ParadaCoord,
  LinhaCorredor,
  ProspectoCorredor,
  capDeEmbarque,
  clampMaxDia,
  clampRaioM,
  montarSqlCorredor,
  normalizarParadas,
  ordenarProspectos,
  MAX_DIA_PADRAO,
  RAIO_PADRAO_M,
} from './prospector-corredor.sql';

/**
 * PROSPECTOR CNPJ — F0: o serviço que acha as empresas no CORREDOR da rota.
 * Plano: docs/PLANEJAMENTOS/PR07082026-PROSPECTOR-CNPJ.md (§0, §1, §2, F0).
 *
 * O que ele faz: recebe as PARADAS DO DIA (as da rota que está sendo iniciada,
 * não uma janela histórica) e devolve as empresas da RFB com pino bom a menos
 * de `prospectorRaioM` de alguma parada, tirando quem o tenant já tem e quem
 * está de castigo, ranqueadas por afinidade de ramo.
 *
 * ┌─ AS LEIS QUE MORDEM AQUI ────────────────────────────────────────────────┐
 * │ 1. ENFEITE NÃO DERRUBA ROTA. Todo método público é best-effort: falhou,  │
 * │    devolve [] e a rota inicia sem prospectos. MAS com `logger.error` —   │
 * │    best-effort MUDO foi o que desligou 23M endereços do CNEFE por 5 dias │
 * │    sem ninguém ver (memória: cnefe-morto-por-cast-de-cep). Nunca lança   │
 * │    pra cima.                                                             │
 * │ 2. PINO HONESTO: só `nivelGeo <= 2`. Nível 3-4 é pino de quarteirão      │
 * │    grosseiro e NUNCA vira anúncio de proximidade — 31 das 47 "duplicatas"│
 * │    da company 41 eram exatamente isso.                                   │
 * │ 3. MULTI-TENANT: `companyId` escopa o livro do tenant e os bloqueios.    │
 * │    Nada atravessa empresa.                                               │
 * │ 4. O DIA É O DE SÃO PAULO (`saoPauloDateKey`), nunca o UTC do container. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ POR QUE TUDO AQUI É `$queryRaw` (07/08):
 *  · O CORREDOR é raw PARA SEMPRE: bbox + distância euclidiana + `DISTINCT ON`
 *    não existem na API tipada do Prisma, e a versão "esperta" com `findMany`
 *    faria N consultas ou varreria 28M linhas. A receita raw foi MEDIDA.
 *  · Config e gravação são raw por TRANSIÇÃO: o model `ProspectoRota` e os
 *    campos `prospector*` acabaram de entrar no schema (migrations
 *    `20260807000000_prospector_e_modulos_do_app` e `20260807050000_prospecto_rota`),
 *    mas AINDA NÃO estão aplicados em produção. `capacidades()` pergunta ao
 *    banco o que já existe e liga sozinho quando a migration rodar — sem
 *    chavinha, sem release coordenado, e sem 500 no iniciar-rota no intervalo.
 *
 * TODO (limpeza, depois que a migration estiver aplicada em TODOS os ambientes):
 *   · `lerConfig()` → `prisma.logisticaConfig.findFirst({ select: {...} })`
 *   · apagar `capacidades()` e as duas guardas — nada mais é condicional.
 *   · `gravarEmbarque()` FICA raw: é upsert de N linhas em UMA ida ao banco,
 *     e `prisma.prospectoRota.upsert` só faz uma por vez.
 *
 * ⚠️ FRONTEIRA DE ESCOPO: este serviço é CAPACIDADE, não política. Ele não lê
 * `prospectorAtivo`, `prospectorEquipe` nem `HBX_PROSPECTOR_ENABLED` — esses
 * gates são do CHAMADOR (o iniciar-rota, que é dono do ator e do contexto).
 * Chamar `embarcar()` já significa "a empresa ligou e o ator pode ver".
 */

/** Cache das capacidades do banco. TTL curto: a migration pode entrar com o processo vivo. */
const CAPACIDADES_TTL_MS = 60_000;

type Capacidades = { tabelaProspecto: boolean; configProspector: boolean };

type LinhaCapacidade = { tabela: boolean | null; colunas: boolean | null };
type LinhaConfig = { raioM: number | null; maxDia: number | null };

export type OpcoesCorredor = {
  /** Sobrescreve `LogisticaConfig.prospectorRaioM` (clamp 50–500). */
  raioM?: number | null;
  /** Sobrescreve `LogisticaConfig.prospectorMaxDia` (clamp 1–8). O cap de embarque é o DOBRO. */
  maxDia?: number | null;
  /** Dia da rota em `YYYY-MM-DD` (São Paulo). Ausente = hoje em São Paulo. */
  rotaDia?: string | null;
};

export type ResultadoEmbarque = {
  rotaDia: string;
  raioM: number;
  maxDia: number;
  /** Quantos o mapa pode ACENDER sozinho no dia (o resto é reserva do clique manual). */
  acendeNoDia: number;
  prospectos: ProspectoCorredor[];
  /** false = a consulta falhou e a rota segue sem prospectos (o erro está no log). */
  ok: boolean;
  /** true = os prospectos ficaram só em memória (tabela ainda não existe no banco). */
  somenteMemoria: boolean;
};

const ESTADO_EMBARCADO = 'embarcado';

@Injectable()
export class ProspectorCorredorService {
  private readonly logger = new Logger(ProspectorCorredorService.name);

  private capacidadesCache: { valor: Capacidades; em: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * O CORREDOR, só leitura. Nunca lança: qualquer defeito vira [] + log de erro.
   *
   * @param companyId tenant dono da rota
   * @param paradas   coordenadas das paradas do dia (a rota sendo iniciada)
   */
  async montarCorredor(
    companyId: number,
    paradas: readonly ParadaCoord[],
    opts: OpcoesCorredor = {},
  ): Promise<ProspectoCorredor[]> {
    try {
      const company = Number(companyId);
      if (!Number.isInteger(company) || company <= 0) return [];

      const pontos = normalizarParadas(paradas);
      if (pontos.length === 0) return [];

      const { raioM, maxDia } = await this.resolverOpcoes(company, opts);
      const cap = capDeEmbarque(maxDia);
      const capacidades = await this.capacidades();

      const linhas = await this.prisma.$queryRaw<LinhaCorredor[]>(
        montarSqlCorredor({
          companyId: company,
          paradas: pontos,
          raioM,
          cap,
          temTabelaProspecto: capacidades.tabelaProspecto,
        }),
      );

      const prospectos = (Array.isArray(linhas) ? linhas : []).map((linha) => this.normalizarLinha(linha));
      // O SQL já entrega ordenado e capado; reordenar em TS pela MESMA regra pura
      // é o que deixa o ranqueamento provável sem banco (e barato: <= 16 itens).
      return ordenarProspectos(prospectos).slice(0, cap);
    } catch (error) {
      this.logger.error(
        `[prospector] corredor FALHOU company=${companyId} paradas=${Array.isArray(paradas) ? paradas.length : 0}: ${this.msg(
          error,
        )}`,
      );
      return [];
    }
  }

  /**
   * Corredor + EMBARQUE na folha: grava/atualiza `ProspectoRota` do dia e devolve
   * o que o payload da rota leva. Também nunca lança.
   */
  async embarcar(
    companyId: number,
    paradas: readonly ParadaCoord[],
    opts: OpcoesCorredor = {},
  ): Promise<ResultadoEmbarque> {
    const rotaDia = this.resolverRotaDia(opts.rotaDia);
    let raioM = clampRaioM(opts.raioM ?? RAIO_PADRAO_M);
    let maxDia = clampMaxDia(opts.maxDia ?? MAX_DIA_PADRAO);
    try {
      const company = Number(companyId);
      if (!Number.isInteger(company) || company <= 0) {
        return this.vazio(rotaDia, raioM, maxDia, true, false);
      }

      const resolvido = await this.resolverOpcoes(company, opts);
      raioM = resolvido.raioM;
      maxDia = resolvido.maxDia;

      const prospectos = await this.montarCorredor(company, paradas, { raioM, maxDia });
      if (prospectos.length === 0) {
        return { rotaDia, raioM, maxDia, acendeNoDia: maxDia, prospectos: [], ok: true, somenteMemoria: false };
      }

      const gravou = await this.gravarEmbarque(company, rotaDia, prospectos);
      return {
        rotaDia,
        raioM,
        maxDia,
        acendeNoDia: maxDia,
        prospectos,
        ok: true,
        somenteMemoria: !gravou,
      };
    } catch (error) {
      this.logger.error(`[prospector] embarque FALHOU company=${companyId} rotaDia=${rotaDia}: ${this.msg(error)}`);
      return this.vazio(rotaDia, raioM, maxDia, false, false);
    }
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private vazio(
    rotaDia: string,
    raioM: number,
    maxDia: number,
    ok: boolean,
    somenteMemoria: boolean,
  ): ResultadoEmbarque {
    return { rotaDia, raioM, maxDia, acendeNoDia: maxDia, prospectos: [], ok, somenteMemoria };
  }

  private msg(error: unknown): string {
    return String((error as Error)?.message || error);
  }

  /** Dia OPERACIONAL em São Paulo — nunca o UTC do container. */
  private resolverRotaDia(bruto?: string | null): string {
    const texto = String(bruto || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    return saoPauloDateKey(new Date()) || '';
  }

  private normalizarLinha(linha: LinhaCorredor): ProspectoCorredor {
    const distM = Number(linha?.distM);
    return {
      cnpj: String(linha?.cnpj || ''),
      nome: String(linha?.nome || '').trim() || 'Empresa sem nome na Receita',
      cnae: linha?.cnae ? String(linha.cnae) : null,
      cnaeDescricao: linha?.cnaeDescricao ? String(linha.cnaeDescricao) : null,
      porte: linha?.porte ? String(linha.porte) : null,
      phoneDigits: linha?.phoneDigits ? String(linha.phoneDigits).replace(/\D/g, '') || null : null,
      lat: Number(linha?.lat),
      lng: Number(linha?.lng),
      distM: Number.isFinite(distM) ? Math.round(distM) : 0,
      afinidade: linha?.afinidade === true,
    };
  }

  /**
   * Raio e teto: `opts` manda, senão `LogisticaConfig`, senão o default do plano.
   * Enquanto as colunas `prospector*` não existirem, cai direto no default —
   * sem erro e sem log de alarme, porque isso é ESPERADO nesta transição.
   */
  private async resolverOpcoes(companyId: number, opts: OpcoesCorredor): Promise<{ raioM: number; maxDia: number }> {
    const raioForcado = opts.raioM != null;
    const maxForcado = opts.maxDia != null;
    if (raioForcado && maxForcado) {
      return { raioM: clampRaioM(opts.raioM), maxDia: clampMaxDia(opts.maxDia) };
    }

    const linha = await this.lerConfig(companyId);
    return {
      raioM: clampRaioM(raioForcado ? opts.raioM : linha?.raioM ?? RAIO_PADRAO_M),
      maxDia: clampMaxDia(maxForcado ? opts.maxDia : linha?.maxDia ?? MAX_DIA_PADRAO),
    };
  }

  private async lerConfig(companyId: number): Promise<LinhaConfig | null> {
    const capacidades = await this.capacidades();
    if (!capacidades.configProspector) return null;
    const linhas = await this.prisma.$queryRaw<LinhaConfig[]>(Prisma.sql`
      SELECT "prospectorRaioM" AS "raioM", "prospectorMaxDia" AS "maxDia"
      FROM "LogisticaConfig"
      WHERE "companyId" = ${companyId}
      LIMIT 1
    `);
    return Array.isArray(linhas) && linhas.length > 0 ? linhas[0] : null;
  }

  /**
   * Pergunta ao BANCO o que já existe (tabela `ProspectoRota` e as colunas
   * `prospector*`). Cache de 60 s: a migration do outro worker pode entrar com
   * este processo vivo, e a feature tem que ligar sozinha quando entrar.
   */
  private async capacidades(): Promise<Capacidades> {
    const agora = Date.now();
    if (this.capacidadesCache && agora - this.capacidadesCache.em < CAPACIDADES_TTL_MS) {
      return this.capacidadesCache.valor;
    }
    let valor: Capacidades = { tabelaProspecto: false, configProspector: false };
    try {
      const linhas = await this.prisma.$queryRaw<LinhaCapacidade[]>(Prisma.sql`
        SELECT
          (to_regclass('public."ProspectoRota"') IS NOT NULL) AS "tabela",
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'LogisticaConfig'
              AND column_name = 'prospectorRaioM'
          ) AS "colunas"
      `);
      const linha = Array.isArray(linhas) ? linhas[0] : null;
      valor = { tabelaProspecto: linha?.tabela === true, configProspector: linha?.colunas === true };
    } catch (error) {
      // Sondagem falhou: segue no modo conservador (só memória, defaults do
      // plano). Isso É alarme — sondagem quebrada normalmente significa banco
      // fora do ar, e o silêncio aqui é exatamente o defeito do CNEFE.
      this.logger.error(`[prospector] sondagem de capacidades falhou: ${this.msg(error)}`);
    }
    this.capacidadesCache = { valor, em: agora };
    return valor;
  }

  /**
   * Grava o embarque do dia. Volta `false` (sem erro) quando a tabela ainda não
   * existe — nesse caso os prospectos vão no payload assim mesmo, só não têm
   * memória entre rotas.
   *
   * `estado` NUNCA regride de 'lead': quem já virou lead saiu do jogo pra
   * sempre (e nem chega aqui, o CTE `bloqueados` já o tirou) — a guarda é
   * cinto de segurança contra uma corrida entre iniciar-rota e o clique.
   */
  private async gravarEmbarque(
    companyId: number,
    rotaDia: string,
    prospectos: readonly ProspectoCorredor[],
  ): Promise<boolean> {
    const capacidades = await this.capacidades();
    if (!capacidades.tabelaProspecto) return false;
    if (prospectos.length === 0) return true;

    const linhas = Prisma.join(
      prospectos.map(
        (p) => Prisma.sql`(
          ${randomUUID()}, ${companyId}, ${p.cnpj}, ${p.nome}, ${p.cnaeDescricao},
          ${p.lat}::float8, ${p.lng}::float8, ${p.distM}::int, ${p.phoneDigits},
          ${ESTADO_EMBARCADO}, ${rotaDia}, now(), now()
        )`,
      ),
    );

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ProspectoRota" (
        "id", "companyId", "cnpj", "nome", "cnaeDescricao",
        "lat", "lng", "distM", "phoneDigits",
        "estado", "rotaDia", "createdAt", "updatedAt"
      ) VALUES ${linhas}
      ON CONFLICT ("companyId", "cnpj") DO UPDATE SET
        "nome" = EXCLUDED."nome",
        "cnaeDescricao" = EXCLUDED."cnaeDescricao",
        "lat" = EXCLUDED."lat",
        "lng" = EXCLUDED."lng",
        "distM" = EXCLUDED."distM",
        "phoneDigits" = EXCLUDED."phoneDigits",
        "rotaDia" = EXCLUDED."rotaDia",
        "estado" = CASE WHEN "ProspectoRota"."estado" = 'lead' THEN "ProspectoRota"."estado" ELSE ${ESTADO_EMBARCADO} END,
        "updatedAt" = now()
    `);
    return true;
  }
}
