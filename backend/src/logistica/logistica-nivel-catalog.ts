/**
 * PR28072026 HÍBRIDO — CATÁLOGO COMERCIAL DOS NÍVEIS DE ROTA (28/07).
 *
 * Decisão do dono (28/07): o Gerenciador de Rota é vendido como ESCADA de
 * planos com mensalidade FIXA (o cliente sabe quanto paga) — receita de consumo
 * é serrote; mensalidade é MRR previsível e preserva o degrau de upgrade.
 *
 * 24/08/2026 (decisão do dono) — a FRANQUIA de paradas saiu do catálogo: era
 * vitrine morta desde ROTA v2 (10/08, plano com nível = rota ILIMITADA; o que
 * limita é ASSENTO). Hoje os níveis diferem por Nº DE ASSENTOS — preço, título
 * e slogan são material de vitrine.
 *
 * Preço é decisão do DONO (99/199/299 batidos em 28/07) e TUDO aqui é editável
 * no Master — a base em código é só o ponto de partida, mesmo contrato do
 * credit-pack-catalog: base + overlay do banco, getters síncronos.
 */

import type { LogisticaNivel } from './logistica-config.service';

// ROTA v2 F2b (10/08) — CREDITO entra na lista: o 4º nível ("Rota Avulsa"),
// berço de toda empresa nova. Ordem importa pras telas (master/site) que
// iteram este array — CREDITO primeiro, é o degrau mais barato da escada.
export const LOGISTICA_NIVEIS: LogisticaNivel[] = ['CREDITO', 'BASIC', 'ADVANCED', 'FULL'];

// ⚰️ 24/08/2026 — `franquiaParadasMes`, `franquiaEmBlocos` e PARADAS_POR_BLOCO
// MORRERAM: a franquia era vitrine morta desde ROTA v2 (10/08, plano com nível
// virou rota ILIMITADA) e nenhum gate de cobrança lia esses números. Plano
// difere SÓ por nº de assentos (+ preço/título/slogan de vitrine).

export type LogisticaNivelDefinition = {
  nivel: LogisticaNivel;
  titulo: string;
  /** Frase de venda do nível (a mesma do plano-mestre da frente). */
  slogan: string;
  /** Mensalidade em R$ (decisão do dono; editável no Master). */
  precoMensal: number;
  /**
   * ROTA v2 F2b (10/08) — quantos motoristas simultâneos o nível inclui SEM
   * pagar passe extra (ver `assertAssentoDoDia`, logistica-nivel-plano.service.ts
   * ou o util correspondente da onda 3). Plano com nível (BASIC/ADVANCED/FULL)
   * é rota ILIMITADA — o limite é só de ASSENTO; CREDITO paga o dia inteiro,
   * então 1 assento já é folgado pra quem começa sozinho.
   */
  assentosInclusos: number;
};

const BASE: Record<LogisticaNivel, LogisticaNivelDefinition> = {
  // ROTA v2 F2b (10/08) — o nível novo: sem mensalidade — só o
  // débito único "dia de rota" por empresa+data (logistica_dia_de_rota no
  // catálogo de crédito). É o berço de toda empresa nova (grandfathering
  // continua ADVANCED pra quem já tinha linha antes disto existir).
  CREDITO: {
    nivel: 'CREDITO',
    titulo: 'Rota Avulsa',
    slogan: 'Pague só o dia que rodar',
    precoMensal: 0,
    assentosInclusos: 1,
  },
  BASIC: {
    nivel: 'BASIC',
    titulo: 'Rota Basic',
    slogan: 'Anota o dia inteiro e te leva até a porta',
    precoMensal: 99,
    assentosInclusos: 1,
  },
  ADVANCED: {
    nivel: 'ADVANCED',
    titulo: 'Rota Advanced',
    slogan: 'O app cobra por você',
    precoMensal: 199,
    assentosInclusos: 2,
  },
  FULL: {
    nivel: 'FULL',
    titulo: 'Rota Full',
    slogan: 'iFood da sua distribuidora',
    precoMensal: 299,
    assentosInclusos: 3,
  },
};

export type LogisticaNivelOverride = {
  titulo?: string;
  slogan?: string;
  precoMensal?: number;
  assentosInclusos?: number;
};

const OVERRIDES = new Map<LogisticaNivel, LogisticaNivelOverride>();

export function normalizeLogisticaNivelKey(value: unknown): LogisticaNivel | null {
  const v = String(value || '').trim().toUpperCase();
  return v === 'BASIC' || v === 'ADVANCED' || v === 'FULL' || v === 'CREDITO' ? v : null;
}

/**
 * Sanitiza um override cru (banco/API) — o MESMO filtro nos dois caminhos, pra
 * não existir "valor que entra pelo banco mas a API recusaria". Preço tem teto:
 * número absurdo é erro de digitação do master, não intenção.
 */
export function sanitizeLogisticaNivelOverride(raw: unknown): LogisticaNivelOverride {
  const ov = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const clean: LogisticaNivelOverride = {};
  if (typeof ov.titulo === 'string' && ov.titulo.trim()) clean.titulo = ov.titulo.trim().slice(0, 60);
  if (typeof ov.slogan === 'string' && ov.slogan.trim()) clean.slogan = ov.slogan.trim().slice(0, 160);
  const preco = Number(ov.precoMensal);
  if (Number.isFinite(preco) && preco >= 0 && preco <= 99999) clean.precoMensal = Math.round(preco * 100) / 100;
  // ROTA v2 F2b (10/08) — assentos inclusos do nível. 1–999: zero/negativo não
  // existe (motorista precisa de PELO MENOS 1 assento pra rodar) e 999 é teto
  // de digitação, não limite de produto real.
  const assentos = Number(ov.assentosInclusos);
  if (Number.isFinite(assentos) && assentos >= 1 && assentos <= 999) {
    clean.assentosInclusos = Math.trunc(assentos);
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
    ...(ov.assentosInclusos !== undefined ? { assentosInclusos: ov.assentosInclusos } : {}),
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

