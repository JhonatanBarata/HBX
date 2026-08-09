/**
 * F3 — O MOLDE DA ROTA SAI DO JSON E VIRA LINHA (09/08).
 *
 * Peça PURA (zero Prisma) do backfill `scripts/backfill-rota-modelo-paradas.js`.
 * Ela existe separada por um motivo só: a decisão de QUEM VENCE quando as duas
 * cópias da mesma lista discordam tem que ser testável sem banco — é ela que
 * decide se a rota salva do dono continua sendo a mesma rota depois da faxina.
 *
 * O QUE FOI MEDIDO EM PRODUÇÃO (09/08, hbx_prod):
 * - 19 modelos SEMANAL: têm as DUAS cópias (JSON e tabela);
 * - 9 modelos LIVRE: têm SÓ o JSON (0 linhas relacionais);
 * - 1 já divergente: `cms0xmqd00004h9po56ft9ui4` (empresa 41), 9 no JSON × 7 na
 *   tabela.
 *
 * AS DUAS REGRAS DE CONFLITO (decididas, não inventadas aqui):
 * - **LIVRE → o JSON vence.** É a única fonte que esse modelo tem; a tabela dele
 *   está vazia ou é resto de escrita parcial.
 * - **SEMANAL → a tabela vence.** É a lista que a Agenda usa de verdade
 *   (`getDay`/`reorderDay` leem `LogisticaRotaModeloParada`, nunca o JSON). É
 *   assim que o 9≠7 se resolve.
 *
 * E a lei que amarra as duas: **diferença descartada NUNCA some calada** — cada
 * parada que existia numa cópia e não na vencedora sai daqui em `reparos`, e o
 * script grava uma linha em `LogisticaAgendaEvento` (origem `reparo`) na ficha
 * do cliente. Best-effort que engole erro precisa de ALARME.
 */

export interface ParadaBackfill {
  customerProfileId: string;
  localId: string | null;
}

export interface ParadaBackfillOrdenada extends ParadaBackfill {
  ordem: number;
}

export interface ModeloParaBackfill {
  id: string;
  companyId: number;
  nome: string;
  /** 'LIVRE' | 'SEMANAL' */
  tipo: string;
  /** A 4ª cópia da agenda: o array que morre nesta frente. */
  paradasJson: unknown;
  /** As linhas que JÁ existem em `LogisticaRotaModeloParada`, em `ordem`. */
  paradasTabela: Array<{ customerProfileId: string | null; localId: string | null }>;
}

export type AcaoBackfill =
  /** LIVRE sem JSON e sem tabela — não há lista pra migrar. */
  | 'vazio'
  /** A tabela já é igualzinha ao JSON: rodar de novo não escreve nada. */
  | 'ja-migrado'
  /** LIVRE com tabela vazia: o JSON entra como está. */
  | 'migrar'
  /** LIVRE com tabela DIFERENTE: o JSON vence e a tabela é reescrita. */
  | 'json-vence'
  /** SEMANAL: a tabela manda; o JSON só rende reparo do que ele tinha a mais. */
  | 'tabela-vence';

export interface ReparoBackfill {
  customerProfileId: string;
  /** Vai pro `paraTexto` do evento — o motivo em português, pro dono ler na ficha. */
  motivo: string;
}

export interface PlanoBackfillModelo {
  modeloId: string;
  companyId: number;
  nome: string;
  tipo: string;
  totalJson: number;
  totalTabela: number;
  /** Entradas do JSON sem cliente nenhum — não viram linha nem evento; só relatório. */
  ignoradas: number;
  acao: AcaoBackfill;
  /** A lista final a gravar, já numerada 1..N. Vazia quando a ação não escreve. */
  paradas: ParadaBackfillOrdenada[];
  /** Apagar as linhas atuais antes de gravar (só quando o JSON vence sobre tabela). */
  limparAntes: boolean;
  reparos: ReparoBackfill[];
}

/** Cliente + porta é a identidade da parada — a mesma dupla que o app usa pra casar. */
function chave(parada: ParadaBackfill): string {
  return `${parada.customerProfileId}::${parada.localId ?? ''}`;
}

/**
 * Lê as duas formas que o `paradasJson` tem em produção sem confiar no shape:
 * - LIVRE (salvo pelo app/desktop): `{ customerProfileId, localId? }`;
 * - SEMANAL (escrito pelo espelho da Agenda): o mesmo + `horaRef`, `itens[]` e
 *   `planoEntregaId`.
 * Do molde só sobrevivem CLIENTE e PORTA: item e janela moram no plano (G5).
 */
export function lerParadasJson(raw: unknown): { paradas: ParadaBackfill[]; ignoradas: number } {
  if (!Array.isArray(raw)) return { paradas: [], ignoradas: 0 };
  const paradas: ParadaBackfill[] = [];
  let ignoradas = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') { ignoradas += 1; continue; }
    const customerProfileId = String((item as any).customerProfileId ?? '').trim();
    if (!customerProfileId) { ignoradas += 1; continue; }
    const localIdRaw = (item as any).localId;
    const localId = localIdRaw ? String(localIdRaw).trim() || null : null;
    paradas.push({ customerProfileId, localId });
  }
  return { paradas, ignoradas };
}

function normalizarTabela(
  rows: Array<{ customerProfileId: string | null; localId: string | null }>,
): ParadaBackfill[] {
  const paradas: ParadaBackfill[] = [];
  for (const row of rows ?? []) {
    const customerProfileId = String(row?.customerProfileId ?? '').trim();
    if (!customerProfileId) continue;
    paradas.push({ customerProfileId, localId: row.localId ? String(row.localId) : null });
  }
  return paradas;
}

/** Mesma gente, na MESMA ORDEM. Ordem diferente é lista diferente: é a rota do dono. */
function mesmaLista(a: ParadaBackfill[], b: ParadaBackfill[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((parada, index) => chave(parada) === chave(b[index]));
}

function numerar(paradas: ParadaBackfill[]): ParadaBackfillOrdenada[] {
  return paradas.map((parada, index) => ({ ...parada, ordem: index + 1 }));
}

export function planejarBackfillModelo(modelo: ModeloParaBackfill): PlanoBackfillModelo {
  const { paradas: doJson, ignoradas } = lerParadasJson(modelo.paradasJson);
  const daTabela = normalizarTabela(modelo.paradasTabela);
  const tipo = String(modelo.tipo || 'LIVRE').trim().toUpperCase();
  const base = {
    modeloId: modelo.id,
    companyId: modelo.companyId,
    nome: modelo.nome,
    tipo,
    totalJson: doJson.length,
    totalTabela: daTabela.length,
    ignoradas,
  };

  if (tipo === 'SEMANAL') {
    // A TABELA VENCE. Ela é a lista que a Agenda lê (getDay/reorderDay) e a que
    // o `planoEntregaId` amarra na visita — o JSON aqui era só espelho. Nada é
    // escrito; o que o JSON tinha A MAIS vira reparo, senão o 9≠7 sumiria calado.
    const naTabela = new Set(daTabela.map(chave));
    const sobras = doJson.filter((parada) => !naTabela.has(chave(parada)));
    return {
      ...base,
      acao: 'tabela-vence',
      paradas: [],
      limparAntes: false,
      reparos: sobras.map((parada) => ({
        customerProfileId: parada.customerProfileId,
        motivo: 'Parada só existia na cópia antiga da rota salva; a sequência da Agenda venceu.',
      })),
    };
  }

  // LIVRE — o JSON é a ÚNICA fonte que ele tem (9 modelos com 0 linhas na tabela).
  //
  // 🔴 JSON VAZIO NÃO É FONTE. Sem nada pra migrar, o backfill NÃO ENCOSTA na
  // tabela: "o JSON vence" existe pra trazer a lista que só ele tinha, não pra
  // esvaziar rota do dono porque uma cópia morta estava em branco. Apagar aqui
  // seria a faxina destruindo justamente o que ela veio salvar.
  if (!doJson.length) {
    return { ...base, acao: 'vazio', paradas: [], limparAntes: false, reparos: [] };
  }
  if (mesmaLista(doJson, daTabela)) {
    // IDEMPOTÊNCIA: 2ª rodada cai aqui e não escreve nada.
    return { ...base, acao: 'ja-migrado', paradas: [], limparAntes: false, reparos: [] };
  }
  if (!daTabela.length) {
    return { ...base, acao: 'migrar', paradas: numerar(doJson), limparAntes: false, reparos: [] };
  }

  const noJson = new Set(doJson.map(chave));
  const perdidas = daTabela.filter((parada) => !noJson.has(chave(parada)));
  return {
    ...base,
    acao: 'json-vence',
    paradas: numerar(doJson),
    limparAntes: true,
    reparos: perdidas.map((parada) => ({
      customerProfileId: parada.customerProfileId,
      motivo: 'Parada estava só na tabela da rota LIVRE; a lista salva do modelo venceu.',
    })),
  };
}

/** O que a rota salva devolve DEPOIS da migração: a lista que o app aplica. */
export function listaAplicavel(paradas: ParadaBackfillOrdenada[]): ParadaBackfill[] {
  return [...paradas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((parada) => ({ customerProfileId: parada.customerProfileId, localId: parada.localId }));
}
