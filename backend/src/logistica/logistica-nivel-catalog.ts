/**
 * PR28072026 HÍBRIDO — CATÁLOGO COMERCIAL DOS 3 NÍVEIS DE ROTA (28/07).
 *
 * Decisão do dono (28/07, depois do brainstorm de preço): o Gerenciador de Rota
 * é vendido como ESCADA de 3 planos com **modelo híbrido**, o padrão do mercado
 * SaaS do nicho água/gás:
 *
 *   mensalidade FIXA (o cliente sabe quanto paga)  +
 *   FRANQUIA de paradas inclusa no mês             +
 *   excedente consome CRÉDITO (o custo variável que já roda desde sempre)
 *
 * Por que a mensalidade NÃO virou "consumo em crédito" (a pergunta do dono):
 *  1. dono de distribuidora compra mensalidade fixa — é assim que SGA e Gestor
 *     Gás vendem; preço que oscila com a operação vira medo de estourar a conta;
 *  2. receita de consumo é serrote (cai em feriado, cai em janeiro) — mensalidade
 *     é MRR previsível;
 *  3. crédito puro MATA O DEGRAU: o cliente nunca sobe de nível, só recarrega no
 *     mesmo — e o degrau (R$ 100 entre níveis) é o retorno da escada;
 *  4. crédito mede CUSTO marginal (parada, rastreio, IA). Misturar preço e custo
 *     na mesma unidade destrói a régua "quanto custa servir × quanto ele paga".
 *
 * A FRANQUIA é o motor de upgrade: quando o cliente estoura, ele compara
 * "recarregar crédito" com "subir de plano" — e sobe sozinho.
 *
 * ── DEFAULTS calibrados com PRODUÇÃO (julho/2026), não com chute ─────────────
 * Bloco de cobrança = 5 paradas = 1 crédito; crédito custa R$ 0,75–0,97 conforme
 * o pacote (Starter 100/R$97 · Growth 300/R$247 · Scale 800/R$597).
 *   - cia 41 (piloto):   424 paradas/mês ≈  85 créditos ≈ R$ 70
 *   - cia 48:          1.104 paradas/mês ≈ 221 créditos ≈ R$ 181
 * As franquias abaixo deixam o valor-em-crédito incluso perto de METADE da
 * mensalidade (margem preservada) e caem naturalmente na régua real: a 41
 * estoura o Basic e cabe no Advanced; operação pesada cabe no Full.
 *
 * Preço é decisão do DONO (99/199/299 batidos em 28/07) e TUDO aqui é editável
 * no Master — a base em código é só o ponto de partida, mesmo contrato do
 * credit-pack-catalog: base + overlay do banco, getters síncronos.
 */

import type { LogisticaNivel } from './logistica-config.service';

export const LOGISTICA_NIVEIS: LogisticaNivel[] = ['BASIC', 'ADVANCED', 'FULL'];

/**
 * 28/07 (dono) — A UNIDADE DE COBRANÇA DA ROTA SIMPLES É A PARADA, não mais um
 * bloco de 5. O bloco existia porque a carteira só cobrava inteiros; hoje ela
 * cobra até 3 casas decimais, então o preço do bloco (2) virou preço da parada
 * (2/5 = 0,4) e a conta ficou igual pra 5 paradas — mas honesta pras outras.
 * Ordem literal: "não quero logística Simples diferente, isso gera confusão".
 *
 * Fica como constante (em vez de sumir) porque é ela que amarra franquia do
 * plano e billing na MESMA unidade: mudar aqui move os dois juntos.
 */
export const PARADAS_POR_BLOCO = 1;

export type LogisticaNivelDefinition = {
  nivel: LogisticaNivel;
  titulo: string;
  /** Frase de venda do nível (a mesma do plano-mestre da frente). */
  slogan: string;
  /** Mensalidade em R$ (decisão do dono; editável no Master). */
  precoMensal: number;
  /** Paradas inclusas por mês. 0 = sem franquia (tudo consome crédito). */
  franquiaParadasMes: number;
};

const BASE: Record<LogisticaNivel, LogisticaNivelDefinition> = {
  BASIC: {
    nivel: 'BASIC',
    titulo: 'Rota Basic',
    slogan: 'Anota o dia inteiro e te leva até a porta',
    precoMensal: 99,
    franquiaParadasMes: 300,
  },
  ADVANCED: {
    nivel: 'ADVANCED',
    titulo: 'Rota Advanced',
    slogan: 'O app cobra por você',
    precoMensal: 199,
    franquiaParadasMes: 600,
  },
  FULL: {
    nivel: 'FULL',
    titulo: 'Rota Full',
    slogan: 'iFood da sua distribuidora',
    precoMensal: 299,
    franquiaParadasMes: 1000,
  },
};

export type LogisticaNivelOverride = {
  titulo?: string;
  slogan?: string;
  precoMensal?: number;
  franquiaParadasMes?: number;
};

const OVERRIDES = new Map<LogisticaNivel, LogisticaNivelOverride>();

export function normalizeLogisticaNivelKey(value: unknown): LogisticaNivel | null {
  const v = String(value || '').trim().toUpperCase();
  return v === 'BASIC' || v === 'ADVANCED' || v === 'FULL' ? v : null;
}

/**
 * Sanitiza um override cru (banco/API) — o MESMO filtro nos dois caminhos, pra
 * não existir "valor que entra pelo banco mas a API recusaria". Preço e franquia
 * têm teto: número absurdo é erro de digitação do master, não intenção.
 */
export function sanitizeLogisticaNivelOverride(raw: unknown): LogisticaNivelOverride {
  const ov = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const clean: LogisticaNivelOverride = {};
  if (typeof ov.titulo === 'string' && ov.titulo.trim()) clean.titulo = ov.titulo.trim().slice(0, 60);
  if (typeof ov.slogan === 'string' && ov.slogan.trim()) clean.slogan = ov.slogan.trim().slice(0, 160);
  const preco = Number(ov.precoMensal);
  if (Number.isFinite(preco) && preco >= 0 && preco <= 99999) clean.precoMensal = Math.round(preco * 100) / 100;
  const franquia = Number(ov.franquiaParadasMes);
  if (Number.isFinite(franquia) && franquia >= 0 && franquia <= 1000000) {
    clean.franquiaParadasMes = Math.trunc(franquia);
  }
  return clean;
}

/** Hidrata o overlay em memória (boot + cada edição do master). Idempotente. */
export function applyLogisticaNivelOverrides(
  entries: Array<{ nivel: unknown; override: LogisticaNivelOverride | null | undefined }>,
): void {
  OVERRIDES.clear();
  for (const entry of entries || []) {
    const nivel = normalizeLogisticaNivelKey(entry?.nivel);
    if (!nivel) continue;
    const clean = sanitizeLogisticaNivelOverride(entry?.override);
    if (Object.keys(clean).length > 0) OVERRIDES.set(nivel, clean);
  }
}

/** Definição EFETIVA (base + overlay). Nunca devolve undefined pra nível válido. */
export function getLogisticaNivelDefinition(value: unknown): LogisticaNivelDefinition {
  // Nível sujo cai em ADVANCED — a MESMA regra de grandfathering do storedNivel
  // (logistica-config.service): valor corrompido jamais rebaixa quem já opera.
  const nivel = normalizeLogisticaNivelKey(value) ?? 'ADVANCED';
  const base = BASE[nivel];
  const ov = OVERRIDES.get(nivel);
  if (!ov) return { ...base };
  return {
    ...base,
    ...(ov.titulo !== undefined ? { titulo: ov.titulo } : {}),
    ...(ov.slogan !== undefined ? { slogan: ov.slogan } : {}),
    ...(ov.precoMensal !== undefined ? { precoMensal: ov.precoMensal } : {}),
    ...(ov.franquiaParadasMes !== undefined ? { franquiaParadasMes: ov.franquiaParadasMes } : {}),
  };
}

export function getLogisticaNivelOverride(value: unknown): LogisticaNivelOverride | null {
  const nivel = normalizeLogisticaNivelKey(value);
  if (!nivel) return null;
  const ov = OVERRIDES.get(nivel);
  return ov ? { ...ov } : null;
}

export function listLogisticaNiveisCatalog(): LogisticaNivelDefinition[] {
  return LOGISTICA_NIVEIS.map((n) => getLogisticaNivelDefinition(n));
}

/**
 * Franquia convertida para a unidade que o billing da rota realmente debita.
 * Desde 28/07 essa unidade é a PARADA (PARADAS_POR_BLOCO = 1), então a conversão
 * é 1:1 e a franquia do plano ("300 paradas") passou a valer exatamente o que
 * está escrito na venda — antes, com bloco de 5, ela era arredondada pra baixo
 * em múltiplos de 5 e o cliente perdia o resto.
 */
export function franquiaEmBlocos(franquiaParadasMes: number): number {
  const paradas = Math.max(0, Math.trunc(Number(franquiaParadasMes) || 0));
  return Math.floor(paradas / PARADAS_POR_BLOCO);
}
