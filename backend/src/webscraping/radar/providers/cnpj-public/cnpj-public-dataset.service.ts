import { Injectable } from '@nestjs/common';
import type { NormalizedSearchInput } from '../../shared/radar-types';
import { buildSegmentTextMatcher, segmentPhraseTokenGroups } from '../../shared/radar-segment-match.util';
import { buildRadarSegmentCnaeMatcher, buildRadarSegmentCnaePrismaMatchers } from '../../shared/radar-segment-cnae-map.util';
import { normalizeLegacyBrCellphone } from './cnpj-public-types';
import type {
  CnpjPublicCompanyRecord,
  CnpjPublicDatasetPage,
  CnpjPublicDrainCursor,
  CnpjPublicDrainPhase,
} from './cnpj-public-types';

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRawJson(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * LOTE 2 (17/08): tamanho da página da drenagem. 500 é o número do plano — grande o bastante
 * pra não fazer 100 idas ao banco por lote, pequeno o bastante pra não prender a conexão. Piso
 * e teto existem porque o env é digitado na mão na VPS.
 */
function tamanhoDaPagina(pageSize?: number) {
  const bruto = Number(pageSize) || Number(process.env.HBX_RADAR_RFB_PAGE_SIZE) || 500;
  return Math.max(50, Math.min(1000, Math.trunc(bruto) || 500));
}

@Injectable()
export class CnpjPublicDatasetService {
  /**
   * Monta o WHERE do pedido (as duas camadas: com contato / sem contato) e o filtro fino em
   * memória UMA vez por consulta. Extraído do corpo do `fetchRecords` no LOTE 2 porque a
   * drenagem paginada tem de rodar EXATAMENTE o mesmo WHERE em todas as páginas — cursor que
   * anda sobre filtro diferente pula ou repete empresa caladamente.
   */
  private montarConsulta(normalized: NormalizedSearchInput) {
    const city = normalizeText(normalized?.city);
    const state = String(normalized?.state || '').trim().toUpperCase();
    // Match de segmento pela lei única de radar-segment-match.util (28/07): lista = OR entre
    // frases, AND entre as palavras de cada frase — o OR plano antigo fazia "distribuidora de
    // agua" casar a cidade inteira ("agua" batia em "AGUAS DE LINDOIA"/"AGUAI" no nome e em
    // "agua doce" na descrição de CNAE).
    const phraseGroups = segmentPhraseTokenGroups(normalized?.segment);
    // Segmento pode vir como código CNAE (4-7 dígitos, ex. "5611" ou "5611203") — com o dump
    // da RFB carregado, cidade×CNAE resolve direto no índice (normalizedCity, cnae).
    const cnaeCode = (normalizeText(normalized?.segment).match(/\b\d{4,7}\b/) || [])[0] || null;

    const where: Record<string, any> = {};
    if (city) where.normalizedCity = city;
    if (state) where.state = state;
    const matchers: Array<Record<string, any>> = phraseGroups.map((groups) => ({
      AND: groups.map((group) => ({ OR: group.map((token) => ({ searchText: { contains: token } })) })),
    }));
    if (cnaeCode) matchers.push({ cnae: { startsWith: cnaeCode } });
    // LOTE 1 (17/08): mapa curado segmento→CNAE. O CNAE real de distribuidora de água é
    // 4723-7/00 "Comércio varejista de bebidas" — a descrição não tem 'distribuidora' nem
    // 'agua', então o match textual sozinho nunca alcançava (Valinhos: 54 empresas com água
    // na base → found=15). Entrada com sinal exigido já chega com o AND do searchText de
    // dentro do util: o `take` abaixo corta ANTES do filtro fino, e 4723700 solto traria
    // todo bar/adega da cidade pras 200-2000 vagas.
    matchers.push(...buildRadarSegmentCnaePrismaMatchers(normalized?.segment));
    if (matchers.length) where.OR = matchers;

    // FURO PROVADO NA VPS (04/07 — 37.922 restaurantes SP, 97,6% COM telefone, mas o
    // motor recebia 199/200 SEM telefone → accepted=0 → "0 Receita/0 Fusão"): a carga do
    // dump é EM LOTE, então `updatedAt` é IDÊNTICO pra base inteira. `orderBy: updatedAt desc`
    // vira empate total e o Postgres, no empate, sobe justamente a minoria SEM contato — que
    // o gate mata como "Contato publico ausente" antes de virar card. A base tinha o telefone
    // o tempo todo; o SELECT do passo 2 da árvore-mestra é que servia o lixo.
    //
    // Correção na FONTE (não no gate): priorizar quem TEM canal de contato utilizável (a lane
    // grátis do cliente não vira card sem contato — RFB sem contato é trabalho da fábrica de
    // enriquecimento, não da vitrine imediata). `phoneShareCount asc` desempata pelo telefone
    // MENOS compartilhado (evita a linha do contador dividida por milhares de CNPJs). Só
    // completo o `take` com registros sem contato quando o nicho tem pouca cobertura, pra a
    // busca nunca voltar vazia.
    const hasContact: Array<Record<string, any>> = [
      { AND: [{ phone: { not: null } }, { phone: { not: '' } }] },
      { AND: [{ email: { not: null } }, { email: { not: '' } }] },
    ];
    const withContactWhere = { AND: [where, { OR: hasContact }] };
    const withoutContactWhere = { AND: [where, { NOT: { OR: hasContact } }] };

    // Filtro fino em memória (o `contains` do WHERE é substring, sem fronteira de palavra):
    // palavra inteira + frase da cidade fora do texto. Quem entrou por código CNAE explícito
    // não passa pelo texto — o código já É o pedido.
    const segmentMatcher = buildSegmentTextMatcher(normalized?.segment, normalized?.city);
    // LOTE 1 (17/08): sem este passe-livre o WHERE destravado não entrega nada — ACQUARELLA,
    // VEGAS e RICCI & RICCI entram pelo CNAE do mapa e morriam AQUI, porque nenhum dos três
    // tem 'distribuidora' + 'agua' como palavra inteira no texto. Mesma lei do código CNAE
    // digitado acima: o código do mapa JÁ É o pedido (com o sinal textual quando a entrada
    // exige — por isso o haystack é calculado antes).
    const cnaeAllowlistMatcher = buildRadarSegmentCnaeMatcher(normalized?.segment, normalized?.city);
    const filtrarLinhas = (rows: any[]) => (rows || []).filter((row) => {
      if (cnaeCode && String(row.cnae || '').replace(/\D/g, '').startsWith(cnaeCode)) return true;
      const haystack = row.searchText
        || [row.nomeFantasia, row.razaoSocial, row.cnae, row.cnaeDescription].filter(Boolean).join(' ');
      if (cnaeAllowlistMatcher({ cnae: row.cnae, haystack })) return true;
      return segmentMatcher(haystack);
    });

    return { withContactWhere, withoutContactWhere, filtrarLinhas };
  }

  /** Linha do dump → registro da fonte. Mesma tradução nas duas leituras (inteira e paginada). */
  private mapearLinhas(rows: any[]): CnpjPublicCompanyRecord[] {
    return (rows || []).map((row) => ({
      cnpj: row.cnpj || null,
      nomeFantasia: row.nomeFantasia || null,
      razaoSocial: row.razaoSocial || null,
      city: row.city || null,
      state: row.state || null,
      cnae: row.cnae || null,
      cnaeDescription: row.cnaeDescription || null,
      situacao: row.situacao || 'ativa',
      porte: row.porte || null,
      matrizFilial: row.matrizFilial || null,
      email: row.email || null,
      // Linha pode ter sido gravada com celular legado (10 dig, 3º dígito 6-9) antes deste
      // fix — normaliza na leitura pra nono-dígito atual da Anatel, na FONTE cnpj_public.
      phone: row.phone ? (normalizeLegacyBrCellphone(row.phone) || row.phone) : null,
      website: row.website || null,
      address: row.address || null,
      ownerName: row.ownerName || null,
      ownerQualification: row.ownerQualification || null,
      raw: parseRawJson(row.rawJson),
    }));
  }

  /**
   * Leitura INTEIRA (sem cursor), do jeito que sempre foi: uma página grande derivada do
   * `limit`. Continua sendo o caminho do executor de lanes e de quem injeta registros. O run
   * de cliente passou a usar `fetchRecordsPage` (LOTE 2) — quem precisa DRENAR não cabe aqui.
   */
  async fetchRecords(input: {
    prisma?: any;
    normalized: NormalizedSearchInput;
    limit?: number;
  }): Promise<CnpjPublicCompanyRecord[]> {
    const prisma = input.prisma;
    if (!prisma?.cnpjPublicCompany?.findMany) {
      throw new Error('CnpjPublicCompany indisponível neste processo.');
    }

    const consulta = this.montarConsulta(input.normalized);
    const take = Math.max(200, Math.min(2000, (Number(input.limit) || 20) * 25));

    let rows: any[] = [];
    try {
      rows = await prisma.cnpjPublicCompany.findMany({
        where: consulta.withContactWhere,
        take,
        orderBy: [{ phoneShareCount: 'asc' }, { openedAt: 'desc' }],
      });
      if (rows.length < take) {
        const fill = await prisma.cnpjPublicCompany.findMany({
          where: consulta.withoutContactWhere,
          take: take - rows.length,
          orderBy: { openedAt: 'desc' },
        });
        rows = rows.concat(fill || []);
      }
    } catch (error) {
      // Ausência real de linhas é `[]`; erro de delegate/schema precisa subir para a fonte
      // marcar partial_error. Silenciar aqui acionava discovery e fingia base vazia.
      throw new Error(`Falha ao consultar CnpjPublicCompany: ${String((error as any)?.message || error)}`);
    }

    return this.mapearLinhas(consulta.filtrarLinhas(rows));
  }

  /**
   * A5 do LOTE 2 (17/08) — DRENAGEM. "Entregar tudo o que a Receita tem" era impossível por
   * construção: um `findMany` só, sem cursor. Aqui a base é lida em páginas, sempre com o MESMO
   * WHERE, e a fonte chama de novo até secar.
   *
   * Duas fases, na mesma ordem de prioridade do `fetchRecords`: primeiro quem TEM contato
   * (`with_contact`), e só depois o resto (`without_contact`) — a lane grátis do cliente não
   * vira card sem contato.
   *
   * DESEMPATE OBRIGATÓRIO: o orderBy de produção (`phoneShareCount asc, openedAt desc`) empata
   * em MASSA — a carga do dump é em lote, então openedAt/phoneShareCount se repetem às
   * centenas (é o mesmo empate que causou o furo de 04/07 documentado acima). Cursor sobre
   * ordenação ambígua PULA ou REPETE linha calada, então o `cnpj` (único no schema) entra como
   * último critério: ordem estável e âncora do cursor no mesmo campo.
   *
   * SECA nunca se mede por `records.length` — o filtro fino em memória zera páginas inteiras
   * enquanto a base ainda tem milhões de linhas. Quem manda é o `rawCount` (linhas devolvidas
   * pelo Postgres, antes do filtro).
   */
  async fetchRecordsPage(input: {
    prisma?: any;
    normalized: NormalizedSearchInput;
    pageSize?: number;
    cursor?: CnpjPublicDrainCursor | null;
  }): Promise<CnpjPublicDatasetPage> {
    const prisma = input.prisma;
    if (!prisma?.cnpjPublicCompany?.findMany) {
      throw new Error('CnpjPublicCompany indisponível neste processo.');
    }

    const consulta = this.montarConsulta(input.normalized);
    const pageSize = tamanhoDaPagina(input.pageSize);
    const fase: CnpjPublicDrainPhase = input.cursor?.phase === 'without_contact' ? 'without_contact' : 'with_contact';
    const ancora = input.cursor?.cnpj ? String(input.cursor.cnpj) : null;

    let rows: any[] = [];
    try {
      rows = await prisma.cnpjPublicCompany.findMany({
        where: fase === 'with_contact' ? consulta.withContactWhere : consulta.withoutContactWhere,
        take: pageSize,
        orderBy: fase === 'with_contact'
          ? [{ phoneShareCount: 'asc' }, { openedAt: 'desc' }, { cnpj: 'asc' }]
          : [{ openedAt: 'desc' }, { cnpj: 'asc' }],
        // `skip: 1` porque o cursor do Prisma inclui a própria âncora — sem ele a última
        // empresa de cada página voltaria duplicada na página seguinte.
        ...(ancora ? { cursor: { cnpj: ancora }, skip: 1 } : {}),
      });
    } catch (error) {
      throw new Error(`Falha ao consultar CnpjPublicCompany: ${String((error as any)?.message || error)}`);
    }

    rows = rows || [];
    const rawCount = rows.length;
    const registros = this.mapearLinhas(consulta.filtrarLinhas(rows));
    const ultimoCnpj = rawCount ? String(rows[rawCount - 1]?.cnpj || '') || null : null;
    // Sem âncora utilizável (linha sem cnpj) a página seguinte repetiria esta pra sempre —
    // fecha a fase em vez de girar em falso.
    const temProximaPagina = rawCount >= pageSize && Boolean(ultimoCnpj);

    // O `nextCursor` daqui é a âncora de quem LEU A PÁGINA INTEIRA — a última linha CRUA, e o
    // fechamento da fase quando a página veio curta. Isso vale enquanto o consumidor de fato
    // percorre tudo o que recebeu; quando o provider para no meio (meta batida), quem re-ancora
    // é a fonte (radar-cnpj-public-source.service), com o `consumedCount` do provider e a
    // `phase` que vai junto aqui embaixo. O dataset não tem como saber disso sozinho: ele
    // devolve a página e não vê o que o consumidor fez com ela.
    if (temProximaPagina) {
      return { records: registros, rawCount, phase: fase, nextCursor: { phase: fase, cnpj: ultimoCnpj }, exhausted: false };
    }
    if (fase === 'with_contact') {
      // Acabou quem tem contato: a fase 2 começa do zero (outro WHERE, outra ordenação).
      return { records: registros, rawCount, phase: fase, nextCursor: { phase: 'without_contact', cnpj: null }, exhausted: false };
    }
    return { records: registros, rawCount, phase: fase, nextCursor: null, exhausted: true };
  }
}
