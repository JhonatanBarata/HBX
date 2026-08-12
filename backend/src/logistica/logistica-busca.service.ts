import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cnefeQuery } from '../nucleo/cnefe-resolver.util';
import {
  BUSCA_MIN_CHARS,
  FUZZY_COMERCIO_MIN,
  PortaRow,
  coordDaQuery,
  escolherPortaDaBusca,
  normalizarBuscaTexto,
  parGpsValido,
  sqlBuscaClientes,
  sqlBuscaComercios,
  sqlBuscaVias,
  sqlCidadeDoMunicipio,
  sqlCidadeModalDoTenant,
  sqlMunicipioPorCentroide,
  sqlMunicipioPorCidade,
  sqlMunicipioPorPosicao,
  sqlPinoDaVia,
  sqlPortaExata,
  sqlPortaVizinhos,
  viaCanonDaBusca,
} from './logistica-busca.sql';

/**
 * BUSCA DA PARADA AVULSA — F1 (12/08, PR12082026-PESQUISA-PAINEL-AVULSA).
 *
 * `GET /logistica/busca?q=&lat=&lng=` — UMA busca, TRÊS fontes, TODAS locais.
 * Este serviço só ORQUESTRA: as consultas, limiares e normalizações moram na
 * peça pura (logistica-busca.sql.ts) — é ela que a prova roda contra o VPS.
 *
 * ZERO chamada externa NESTE caminho: nada de Nominatim/Google aqui — quem
 * ainda usa Nominatim é o fallback do botão "não achei" (logistica-geo.service),
 * que este arquivo NÃO importa de propósito.
 *
 * Cada grupo é BEST-EFFORT independente: banco cnefe fora do ar → endereços
 * vêm vazios com a fonte marcada 'indisponivel', clientes e comércios seguem.
 * A tela nunca fica refém da pior fonte (mesma lição do "vitrine 504").
 *
 * Teto de espera por fonte: 1500 ms — busca interativa que passa disso já
 * perdeu a tecla seguinte do usuário; melhor grupo vazio honesto que espera.
 */

const BUSCA_TIMEOUT_FONTE_MS = 1500;

export type BuscaClienteItem = {
  id: string;
  nome: string;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  distM: number | null;
  /** ISO da última entrega CONCLUÍDA (a régua de logistica-ultima-entrega). */
  ultimaEntregaEm: string | null;
  score: number;
};

export type BuscaEnderecoItem = {
  /** forma canônica do banco ("av 84") — a F2 devolve isto em busca/porta. */
  via: string;
  codMunicipio: string;
  lat: number | null;
  lng: number | null;
  cep: string | null;
  /** quantas portas o Censo conhece nesta via (tamanho da rua). */
  portas: number;
  /** dispersão do pino em metros — spread alto = via longa, pino é referência. */
  spreadM: number | null;
  distM: number | null;
  exata: boolean;
};

export type BuscaComercioItem = {
  cnpj: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
  lat: number | null;
  lng: number | null;
  /** 1=porta 2=rua 3=bairro 4=cidade (CnpjGeo) — a tela TEM que diferenciar. */
  nivelGeo: number | null;
  cep: string | null;
  distM: number | null;
  score: number;
};

export type FonteStatus = 'ok' | 'vazio' | 'indisponivel' | 'sem_escopo';

export type BuscaResposta = {
  q: string;
  grupos: {
    clientes: BuscaClienteItem[];
    enderecos: BuscaEnderecoItem[];
    comercios: BuscaComercioItem[];
  };
  fontes: { clientes: FonteStatus; enderecos: FonteStatus; comercios: FonteStatus };
  escopo: {
    comGps: boolean;
    codMunicipio: string | null;
    cidade: string | null;
    uf: string | null;
  };
};

export type PortaResposta = {
  fonte: 'cnefe' | 'nenhum';
  precisao: 'porta' | 'rua' | 'via' | null;
  via: string;
  numero: number | null;
  lat: number | null;
  lng: number | null;
  cep: string | null;
};

@Injectable()
export class LogisticaBuscaService {
  private readonly logger = new Logger(LogisticaBuscaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Promessa com teto — a busca nunca espera a fonte lenta (grupo vazio > tela travada). */
  private comTeto<T>(p: Promise<T>, rotulo: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error(`${rotulo}: estourou ${BUSCA_TIMEOUT_FONTE_MS}ms`)), BUSCA_TIMEOUT_FONTE_MS);
        (t as any).unref?.();
      }),
    ]);
  }

  async buscar(companyId: number, qBruto: string, latBruto?: unknown, lngBruto?: unknown): Promise<BuscaResposta> {
    const q = String(qBruto ?? '').trim();
    const lat = coordDaQuery(latBruto);
    const lng = coordDaQuery(lngBruto);
    const comGps = parGpsValido(lat, lng);
    const gLat = comGps ? lat : null;
    const gLng = comGps ? lng : null;

    const vazia: BuscaResposta = {
      q,
      grupos: { clientes: [], enderecos: [], comercios: [] },
      fontes: { clientes: 'vazio', enderecos: 'vazio', comercios: 'vazio' },
      escopo: { comGps, codMunicipio: null, cidade: null, uf: null },
    };
    if (q.length < BUSCA_MIN_CHARS) return vazia;

    // Escopo geográfico primeiro (endereços e comércios dependem dele; clientes não).
    const escopo = await this.resolverEscopo(companyId, gLat, gLng);
    vazia.escopo = { comGps, ...escopo };

    const [clientes, enderecos, comercios] = await Promise.all([
      this.grupoClientes(companyId, q, gLat, gLng),
      this.grupoEnderecos(escopo.codMunicipio, q, gLat, gLng),
      this.grupoComercios(escopo.cidade, escopo.uf, q, gLat, gLng),
    ]);

    return {
      q,
      grupos: { clientes: clientes.itens, enderecos: enderecos.itens, comercios: comercios.itens },
      fontes: { clientes: clientes.fonte, enderecos: enderecos.fonte, comercios: comercios.fonte },
      escopo: vazia.escopo,
    };
  }

  /**
   * Posição → município (porta do Censo mais próxima; centroide de município
   * como rede). Sem GPS → cidade MODAL dos clientes do tenant (degrade honesto).
   * Tudo best-effort: cnefe fora → escopo nulo e os grupos dependentes avisam.
   */
  private async resolverEscopo(companyId: number, lat: number | null, lng: number | null): Promise<{
    codMunicipio: string | null;
    cidade: string | null;
    uf: string | null;
  }> {
    try {
      if (lat !== null && lng !== null) {
        const porPorta = sqlMunicipioPorPosicao(lat, lng);
        let rows = await cnefeQuery(porPorta.sql, porPorta.params, BUSCA_TIMEOUT_FONTE_MS);
        if (!rows.length) {
          const porMun = sqlMunicipioPorCentroide(lat, lng);
          rows = await cnefeQuery(porMun.sql, porMun.params, BUSCA_TIMEOUT_FONTE_MS);
        }
        const codMunicipio = rows.length ? String(rows[0].cod_municipio) : null;
        if (!codMunicipio) return { codMunicipio: null, cidade: null, uf: null };
        const cid = sqlCidadeDoMunicipio(codMunicipio);
        const cidRows = await cnefeQuery(cid.sql, cid.params, BUSCA_TIMEOUT_FONTE_MS);
        return {
          codMunicipio,
          cidade: cidRows.length ? String(cidRows[0].city_norm) : null,
          uf: cidRows.length ? String(cidRows[0].uf) : null,
        };
      }

      // Sem GPS: a cidade em que o tenant trabalha (modal dos cadastros dele).
      const modal = sqlCidadeModalDoTenant(companyId);
      const rows: Array<{ cidade: string; uf: string }> = await this.comTeto(
        this.prisma.$queryRawUnsafe(modal.sql, ...modal.params) as Promise<any[]>,
        'escopo/cidade-modal',
      );
      if (!rows.length) return { codMunicipio: null, cidade: null, uf: null };
      const cidade = normalizarBuscaTexto(rows[0].cidade);
      const uf = String(rows[0].uf ?? '').trim().toUpperCase();
      if (!cidade || !uf) return { codMunicipio: null, cidade: null, uf: null };
      let codMunicipio: string | null = null;
      try {
        const porCidade = sqlMunicipioPorCidade(uf, cidade);
        const munRows = await cnefeQuery(porCidade.sql, porCidade.params, BUSCA_TIMEOUT_FONTE_MS);
        codMunicipio = munRows.length ? String(munRows[0].cod_municipio) : null;
      } catch {
        // cnefe fora não derruba o escopo da RFB (cidade/uf seguem valendo).
      }
      return { codMunicipio, cidade, uf };
    } catch (e) {
      this.logger.warn(`busca: escopo geográfico indisponível: ${String((e as any)?.message || e)}`);
      return { codMunicipio: null, cidade: null, uf: null };
    }
  }

  private async grupoClientes(companyId: number, q: string, lat: number | null, lng: number | null): Promise<{
    itens: BuscaClienteItem[];
    fonte: FonteStatus;
  }> {
    try {
      const pronto = sqlBuscaClientes({ companyId, q, lat, lng });
      const rows: any[] = await this.comTeto(
        this.prisma.$queryRawUnsafe(pronto.sql, ...pronto.params) as Promise<any[]>,
        'busca/clientes',
      );
      const itens = rows.map((r): BuscaClienteItem => ({
        id: String(r.id),
        nome: String(r.name ?? ''),
        endereco: r.endereco ?? null,
        numero: r.numero ?? null,
        bairro: r.bairro ?? null,
        cidade: r.cidade ?? null,
        uf: r.uf ?? null,
        cep: r.cep ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        distM: r.dist_m == null ? null : Math.round(Number(r.dist_m)),
        ultimaEntregaEm: this.iso(r.quando),
        score: Number(r.score ?? 0),
      }));
      return { itens, fonte: itens.length ? 'ok' : 'vazio' };
    } catch (e) {
      this.logger.warn(`busca: grupo clientes falhou: ${String((e as any)?.message || e)}`);
      return { itens: [], fonte: 'indisponivel' };
    }
  }

  private async grupoEnderecos(codMunicipio: string | null, q: string, lat: number | null, lng: number | null): Promise<{
    itens: BuscaEnderecoItem[];
    fonte: FonteStatus;
  }> {
    if (!codMunicipio) return { itens: [], fonte: 'sem_escopo' };
    try {
      const pronto = sqlBuscaVias({ codMunicipio, q, lat, lng });
      const rows: any[] = await cnefeQuery(pronto.sql, pronto.params, BUSCA_TIMEOUT_FONTE_MS);
      const itens = rows.map((r): BuscaEnderecoItem => ({
        via: String(r.via),
        codMunicipio,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        cep: r.cep ?? null,
        portas: Number(r.n ?? 0),
        spreadM: r.spread_m == null ? null : Math.round(Number(r.spread_m)),
        distM: r.dist_m == null ? null : Math.round(Number(r.dist_m)),
        exata: !!r.exata,
      }));
      return { itens, fonte: itens.length ? 'ok' : 'vazio' };
    } catch (e) {
      this.logger.warn(`busca: grupo endereços falhou: ${String((e as any)?.message || e)}`);
      return { itens: [], fonte: 'indisponivel' };
    }
  }

  private async grupoComercios(cidade: string | null, uf: string | null, q: string, lat: number | null, lng: number | null): Promise<{
    itens: BuscaComercioItem[];
    fonte: FonteStatus;
  }> {
    // NUNCA varrer a RFB sem escopo — sem cidade resolvida o grupo nem consulta.
    if (!cidade || !uf) return { itens: [], fonte: 'sem_escopo' };
    try {
      const pronto = sqlBuscaComercios({ cityNorm: cidade, uf, q, lat, lng });
      // SET LOCAL na MESMA transação: o limiar do `<%` (word_similarity) é o
      // NOSSO (0.40 medido), não o default 0.6 do banco — e morre no COMMIT,
      // sem vazar pra conexão do pool.
      const [, rows] = await this.comTeto(
        this.prisma.$transaction([
          this.prisma.$executeRawUnsafe(
            `SET LOCAL pg_trgm.word_similarity_threshold = ${FUZZY_COMERCIO_MIN}`,
          ),
          this.prisma.$queryRawUnsafe(pronto.sql, ...pronto.params),
        ]) as Promise<[unknown, any[]]>,
        'busca/comercios',
      );
      const itens = (rows as any[]).map((r): BuscaComercioItem => ({
        cnpj: String(r.cnpj),
        nome: String(r.nome ?? ''),
        endereco: r.endereco ?? null,
        cidade: r.cidade ?? null,
        uf: r.uf ?? null,
        cnae: r.cnae ?? null,
        cnaeDescricao: r.cnaeDescricao ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        nivelGeo: r.nivelGeo == null ? null : Number(r.nivelGeo),
        cep: r.cep ?? null,
        distM: r.dist_m == null ? null : Math.round(Number(r.dist_m)),
        score: Number(r.sim ?? 0),
      }));
      return { itens, fonte: itens.length ? 'ok' : 'vazio' };
    } catch (e) {
      this.logger.warn(`busca: grupo comércios falhou: ${String((e as any)?.message || e)}`);
      return { itens: [], fonte: 'indisponivel' };
    }
  }

  /**
   * O PASSO DO NÚMERO (a F2 chama depois que o usuário escolheu a via):
   * (município, via, número) → pino de porta + CEP. Sem número → pino da via
   * ('via', ponto de conferência). Mesmas leis fail-closed do resolver de
   * cadastro (dispersão/vizinho) — ver escolherPortaDaBusca.
   */
  async resolverPorta(args: { codMunicipio: string; via: string; numero?: unknown }): Promise<PortaResposta> {
    const viaCanon = viaCanonDaBusca(args.via);
    const numero = Number(String(args.numero ?? '').replace(/\D+/g, ''));
    const semNumero = !Number.isInteger(numero) || numero <= 0;
    const base: PortaResposta = {
      fonte: 'nenhum', precisao: null, via: viaCanon, numero: null, lat: null, lng: null, cep: null,
    };
    if (!args.codMunicipio || !viaCanon) return base;

    try {
      if (!semNumero) {
        const pExata = sqlPortaExata(args.codMunicipio, viaCanon, numero);
        const pViz = sqlPortaVizinhos(args.codMunicipio, viaCanon, numero);
        const [exata, vizinhos] = await Promise.all([
          cnefeQuery(pExata.sql, pExata.params, BUSCA_TIMEOUT_FONTE_MS) as Promise<PortaRow[]>,
          cnefeQuery(pViz.sql, pViz.params, BUSCA_TIMEOUT_FONTE_MS) as Promise<PortaRow[]>,
        ]);
        const escolhida = escolherPortaDaBusca(exata, vizinhos, numero);
        if (escolhida) {
          return {
            fonte: 'cnefe', precisao: escolhida.precisao, via: viaCanon,
            numero: escolhida.numero, lat: escolhida.lat, lng: escolhida.lng, cep: escolhida.cep,
          };
        }
      }
      const pVia = sqlPinoDaVia(args.codMunicipio, viaCanon);
      const rows = await cnefeQuery(pVia.sql, pVia.params, BUSCA_TIMEOUT_FONTE_MS);
      if (rows.length && rows[0].lat != null && rows[0].lng != null) {
        return {
          fonte: 'cnefe', precisao: 'via', via: viaCanon, numero: null,
          lat: Number(rows[0].lat), lng: Number(rows[0].lng), cep: rows[0].cep ?? null,
        };
      }
      return base;
    } catch (e) {
      this.logger.warn(`busca/porta indisponível: ${String((e as any)?.message || e)}`);
      return base;
    }
  }

  /** ISO ou null — data inválida NUNCA vira string (mesma postura do util da
   *  última entrega; a régua da CONSULTA está documentada no sqlBuscaClientes). */
  private iso(quando: unknown): string | null {
    if (!quando) return null;
    const t = quando instanceof Date ? quando : new Date(quando as any);
    return Number.isFinite(t.getTime()) ? t.toISOString() : null;
  }
}
