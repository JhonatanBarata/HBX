import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CNAE_NCM_CURADA } from './cnae-ncm-curada';
import { ComexDataService } from './comex-data.service';
import {
  ComexAchado,
  ComexDetectoresService,
} from './comex-detectores.service';

/**
 * HBX COMEX — O ANALISTA, F2a: pipeline DETERMINÍSTICO do dossiê.
 *
 * Desenho cravado no PLANO-COMEX-ANALISTA §3.0: a IA não dirige a
 * investigação — código dirige, em segundos, e a IA (F2b) só entra pra
 * deduzir substância nova e narrar por cima dos achados prontos. Este
 * serviço é o degrau 1 da escada: funciona COMPLETO sem nenhum modelo no ar.
 *
 * Fontes: parquet (SECEX/Comex Stat/matrizes) + leitura best-effort da RFB
 * pública (CnpjPublicCompany via Prisma — dado público, não é dado do CRM;
 * o isolamento do módulo proíbe importar /vendas, não a ficha cadastral).
 * RFB ausente (dev local) NUNCA derruba o dossiê: SECEX cobre.
 */

const FLUXOS = new Set(['IMP', 'EXP']);

function cnpjValido(raw: string): string {
  const v = String(raw || '').replace(/\D/g, '');
  if (v.length !== 14) throw new BadRequestException('cnpj deve ter 14 dígitos');
  return v;
}

function fluxoValido(raw: string): string {
  const v = String(raw || 'IMP').trim().toUpperCase();
  if (!FLUXOS.has(v)) throw new BadRequestException('fluxo deve ser IMP ou EXP');
  return v;
}

function textoSeguro(q: string, max = 80): string {
  return String(q || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().slice(0, max);
}

/** Compara razões sociais ignorando acento, pontuação e sufixo societário. */
function nomeNucleo(nome: string): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(LTDA|SA|S A|EIRELI|ME|EPP|EM RECUPERACAO JUDICIAL|INDUSTRIA|COMERCIO|E|DE|DO|DA)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class ComexAnalistaService {
  private readonly logger = new Logger('ComexAnalista');

  constructor(
    private readonly data: ComexDataService,
    private readonly detectores: ComexDetectoresService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * LEI 1 — "código NCM é sempre do servidor": busca oficial substância→código
   * nas 13,7k descrições (PT+EN, a dedução da IA pode vir em inglês). Dígitos
   * viram busca por prefixo de código.
   */
  async buscaNcmOficial(qRaw: string) {
    if (!this.data.available()) return { disponivel: false, itens: [] };
    const termo = textoSeguro(qRaw);
    if (!termo) return { disponivel: true, itens: [] };

    if (/^\d+$/.test(termo)) {
      const itens = await this.data.query(`
        SELECT CO_NCM AS codigo, NO_NCM_POR AS descricao, NO_NCM_ING AS descricaoEn
        FROM aux_ncm WHERE CO_NCM LIKE '${termo}%' ORDER BY codigo LIMIT 10
      `);
      return { disponivel: true, itens };
    }

    // Mesmo ranking da busca SH4 (OR com peso 2 no 1º token), agora no nível
    // NCM e casando PT ou EN — "phenol" e "fenol" chegam no mesmo 2907.11.00.
    const tokens = termo.toLowerCase().split(/\s+/).filter((t) => t.length >= 4).slice(0, 5);
    if (!tokens.length) return { disponivel: true, itens: [] };
    const hits = tokens
      .map(
        (t, i) =>
          `(CASE WHEN lower(strip_accents(NO_NCM_POR)) LIKE '%${t}%'
                   OR lower(strip_accents(NO_NCM_ING)) LIKE '%${t}%'
             THEN ${i === 0 ? 2 : 1} ELSE 0 END)`,
      )
      .join(' + ');

    const itens = await this.data.query(`
      SELECT codigo, descricao, descricaoEn FROM (
        SELECT CO_NCM AS codigo, NO_NCM_POR AS descricao, NO_NCM_ING AS descricaoEn,
               ${hits} AS casados
        FROM aux_ncm
      ) WHERE casados > 0 ORDER BY casados DESC, codigo LIMIT 10
    `);
    return { disponivel: true, itens };
  }

  /**
   * O DOSSIÊ POR CNPJ — a demo Ask Crios virando botão. Pipeline:
   * SECEX → RFB (best-effort) → NCMs prováveis (curada → matrizes) →
   * mercados compactos → detectores. Tudo determinístico, segundos.
   */
  async dossie(cnpjRaw: string, fluxoRaw: string) {
    if (!this.data.available()) return { disponivel: false };
    const cnpj = cnpjValido(cnpjRaw);
    const fluxo = fluxoValido(fluxoRaw);

    // 1. SECEX — a confirmação oficial (parquet, sempre presente)
    const secexRows = await this.data.query(`
      SELECT fluxo, empresa, municipio, uf, cnae,
             ultimo_ano_na_lista AS ultimoAno, anos_na_lista AS anosNaLista
      FROM cadastro_atual WHERE cnpj = '${cnpj}'
    `);

    // 2. RFB pública — best-effort: dev local sem o dump segue só com SECEX
    let rfb: Record<string, any> | null = null;
    try {
      rfb = await (this.prisma as any).cnpjPublicCompany.findFirst({
        where: { cnpj },
        select: {
          razaoSocial: true, nomeFantasia: true, situacao: true, porte: true,
          cnae: true, cnaeDescription: true, city: true, state: true,
          phone: true, email: true, openedAt: true,
        },
      });
    } catch (error) {
      this.logger.warn(`RFB indisponível para o dossiê (${String((error as any)?.message || error).slice(0, 120)})`);
    }

    const secex0 = secexRows[0] || null;
    const cnae4 =
      String(rfb?.cnae || '').replace(/\D/g, '').slice(0, 4) ||
      String(secex0?.cnae || '').replace(/\D/g, '').slice(0, 4) ||
      null;
    const ficha = {
      origem: rfb ? 'rfb' : secex0 ? 'secex' : null,
      empresa: rfb?.razaoSocial || rfb?.nomeFantasia || secex0?.empresa || null,
      municipio: rfb?.city || secex0?.municipio || null,
      uf: rfb?.state || secex0?.uf || null,
      cnae4,
      cnaeDescricao: rfb?.cnaeDescription || secex0?.cnae || null,
      situacao: rfb?.situacao || null,
      porte: rfb?.porte || null,
      contato: rfb ? { phone: rfb.phone || null, email: rfb.email || null } : null,
    };
    if (!ficha.empresa) {
      return {
        disponivel: true, cnpj, fluxo, encontrada: false,
        aviso: 'CNPJ fora da RFB carregada e fora da lista oficial SECEX 2018–2020.',
      };
    }

    // 3. NCMs prováveis: tabela curada primeiro; matriz como complemento
    const curada = cnae4 ? CNAE_NCM_CURADA[cnae4] : undefined;
    const provaveis: Array<{ codigo: string; nome: string; origem: string }> = (
      curada?.insumos || []
    ).map((i) => ({ codigo: i.ncm, nome: i.nome, origem: 'curada' }));
    const produtoSh4 = curada?.produtoSh4;
    const sh4Provaveis = [...new Set(provaveis.map((p) => p.codigo.slice(0, 4)))];

    if (!sh4Provaveis.length && cnae4 && (await this.data.ensureOptional('cnae_sh4_stat'))) {
      const daMatriz = await this.data.query(`
        SELECT m.sh4, any_value(s.NO_SH4_POR) AS nome
        FROM cnae_sh4_stat m LEFT JOIN aux_ncm_sh s ON s.CO_SH4 = m.sh4
        WHERE m.cnae4 = '${cnae4}' AND m.fluxo = '${fluxo}'
        GROUP BY m.sh4, m.score ORDER BY m.score DESC LIMIT 5
      `);
      for (const r of daMatriz) {
        provaveis.push({ codigo: String(r.sh4), nome: String(r.nome || ''), origem: 'matriz_cnae' });
        sh4Provaveis.push(String(r.sh4));
      }
    }

    // 4. Mercado compacto de cada SH4 provável (teto 6 — dossiê, não relatório)
    const mercados = [] as Array<Record<string, unknown>>;
    for (const sh4 of sh4Provaveis.slice(0, 6)) {
      const [totais] = await this.data.query(`
        SELECT CAST(sum(VL_FOB) AS DOUBLE) AS fobUsd,
               CASE WHEN sum(KG_LIQUIDO) > 0
                    THEN round(sum(VL_FOB) / sum(KG_LIQUIDO), 2) END AS usdPorKg
        FROM flow_ncm WHERE substr(CO_NCM, 1, 4) = '${sh4}' AND fluxo = '${fluxo}'
      `);
      const [desc] = await this.data.query(`
        SELECT NO_SH4_POR AS pt FROM aux_ncm_sh WHERE CO_SH4 = '${sh4}' LIMIT 1
      `);
      mercados.push({
        sh4,
        descricao: desc?.pt || null,
        totais: totais || null,
        topOrigens: (await this.detectores.origens(sh4, fluxo, 3)) || [],
      });
    }

    // 5. Achados: detectores por SH4 (top 3) + contexto da empresa (1 vez)
    const jobs: Array<Promise<{ achados: ComexAchado[] }>> = sh4Provaveis
      .slice(0, 3)
      .map((sh4) =>
        this.detectores.achados({
          sh4, fluxo,
          uf: ficha.uf || undefined,
          excluirSh4s: [],
        }),
      );
    if (ficha.municipio || produtoSh4 || cnae4) {
      jobs.push(
        this.detectores.achados({
          fluxo,
          municipio: ficha.municipio || undefined,
          uf: ficha.uf || undefined,
          cnae4: cnae4 || undefined,
          produtoSh4,
          excluirSh4s: sh4Provaveis,
        }),
      );
    }
    const blocos = await Promise.all(jobs.map((j) => j.catch(() => ({ achados: [] as ComexAchado[] }))));
    const achados = blocos.flatMap((b) => b.achados);

    // 6. Nome antigo (o "SI Group → ASK" da demo) — só quando temos os 2 lados
    if (rfb?.razaoSocial && secex0?.empresa) {
      const antigo = nomeNucleo(String(secex0.empresa));
      const atual = nomeNucleo(String(rfb.razaoSocial));
      if (antigo && atual && !antigo.includes(atual) && !atual.includes(antigo)) {
        achados.push({
          tipo: 'nome_antigo',
          forca: 55,
          frase:
            `Na lista oficial SECEX (${secex0.ultimoAno}) esta operação aparecia como ` +
            `"${secex0.empresa}" — hoje a RFB registra "${rfb.razaoSocial}". Histórico de ` +
            `comex anterior à marca atual conta a favor da conversa.`,
          dados: { nomeSecex: secex0.empresa, nomeRfb: rfb.razaoSocial, ultimoAno: secex0.ultimoAno },
          fonte: 'SECEX 2018–2020 × RFB',
        });
      }
    }
    achados.sort((a, b) => b.forca - a.forca);

    return {
      disponivel: true,
      cnpj,
      fluxo,
      encontrada: true,
      ficha,
      secex: {
        presente: secexRows.length > 0,
        rotulo: 'PROVÁVEL operador de comércio exterior (inferência de dados públicos)',
        fluxos: secexRows,
      },
      ncmsProvaveis: {
        origem: provaveis[0]?.origem || null,
        setor: curada?.setor || null,
        produtoSh4: produtoSh4 || null,
        itens: provaveis,
      },
      mercados,
      achados: achados.slice(0, 12),
      fonteJanela: await this.detectores.fonteStat(),
    };
  }
}
