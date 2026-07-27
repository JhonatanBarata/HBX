// PONTE CADASTRO→AGENDA (26/07) — o combinado do negócio é dia da semana por
// CLIENTE/visita (LogisticaPlanoEntrega), não por produto. Desde que a Agenda V2
// ligou (agendaV2Ativa=true, 25/07), o cadastro que grava dia no vínculo
// (ClienteProduto.diasSemana/frequenciaDias/proximaData) ficava INVISÍVEL pro
// generateDay — cliente novo nunca entrava na rota. Este util é a parte PURA da
// ponte: dado o vínculo antes/depois, decide o que espelhar nos planos.
//
// Leis (as mesmas do matcher da sequência e do pino):
// 1. Dado ambíguo NUNCA vira verdade — 2+ planos/itens candidatos = aviso, não chute.
// 2. Fail-closed com sobra visível — o que não casou vira aviso no retorno.
// 3. Tudo aditivo — nada aqui apaga plano; esvaziar = pausar (ativo=false).

export type EspelhoFrequencia = 'SEMANAL' | 'QUINZENAL' | 'INTERVALO';

export interface EspelhoVinculoSnapshot {
  id: string;
  customerProfileId: string;
  localId: string | null;
  productId: number;
  qtdPadrao: number;
  ativo: boolean;
  diasSemana: string | null;
  frequenciaDias: number | null;
  proximaData: Date | null;
  /** Já resolvido (precoAcordado > catálogo > precoPadrao do cliente). */
  valorUnit: number;
}

export interface EspelhoCadencia {
  frequencia: EspelhoFrequencia;
  intervaloDias: number | null;
  /** Âncora do modo por-data (QUINZENAL/INTERVALO); null no semanal. */
  proximaData: Date | null;
}

export interface EspelhoPlanoItem {
  productId: number;
  qtd: number;
  valorUnit: number;
}

export interface EspelhoPlanoCandidato {
  id: string;
  ativo: boolean;
  frequencia: string;
  intervaloDias: number | null;
  proximaData: Date | null;
  itens: EspelhoPlanoItem[];
}

// ── leitura do vínculo ──────────────────────────────────────────────────────────

/** "1,3,5" → [1,3,5] (ISO 1=seg…7=dom); lixo é descartado. */
export function parseDiasSemanaEspelho(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return Array.from(new Set(
    String(raw)
      .split(',')
      .map((s) => Math.trunc(Number(s.trim())))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7),
  )).sort((a, b) => a - b);
}

function isoWeekdayLocal(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/**
 * Dias de visita que o vínculo representa. Vínculo inativo ou sem agenda
 * (o "de sempre" da Leitura de Rota) = nenhum dia — invisível pra agenda,
 * mesmo contrato do gerar-dia legado.
 */
export function diasDoVinculo(v: Pick<EspelhoVinculoSnapshot, 'ativo' | 'diasSemana' | 'proximaData'> | null): number[] {
  if (!v || v.ativo === false) return [];
  const explicit = parseDiasSemanaEspelho(v.diasSemana);
  if (explicit.length) return explicit;
  if (v.proximaData instanceof Date && !Number.isNaN(v.proximaData.getTime())) {
    return [isoWeekdayLocal(v.proximaData)];
  }
  return [];
}

/**
 * Cadência do vínculo — ESPELHO de `legacyCadence` do "Organizar agora"
 * (logistica-agenda.service.ts): semanal explícito vence; 14 dias = QUINZENAL;
 * outro intervalo vira INTERVALO arredondado pra semanas completas (7..364).
 */
export function cadenciaDoVinculo(
  v: Pick<EspelhoVinculoSnapshot, 'diasSemana' | 'frequenciaDias' | 'proximaData'> | null,
): EspelhoCadencia {
  if (v && parseDiasSemanaEspelho(v.diasSemana).length) {
    return { frequencia: 'SEMANAL', intervaloDias: null, proximaData: null };
  }
  const days = Math.trunc(Number(v?.frequenciaDias));
  const anchor = v?.proximaData instanceof Date && !Number.isNaN(v.proximaData.getTime())
    ? v.proximaData
    : null;
  if (days === 14) return { frequencia: 'QUINZENAL', intervaloDias: null, proximaData: anchor };
  if (days > 0 && days !== 7) {
    return {
      frequencia: 'INTERVALO',
      intervaloDias: Math.min(364, Math.max(7, Math.ceil(days / 7) * 7)),
      proximaData: anchor,
    };
  }
  return { frequencia: 'SEMANAL', intervaloDias: null, proximaData: anchor };
}

// ── plano de espelhamento (diff antes/depois) ──────────────────────────────────

export interface EspelhoPlanejado {
  /** Dias em que o item do vínculo precisa ENTRAR (plano do local ATUAL). */
  adicionar: number[];
  /** Dias de onde o item precisa SAIR (plano do local ANTERIOR). */
  remover: number[];
  /** Dias em que o item continua — atualizar qtd/valor se divergirem. */
  manter: number[];
}

function mesmaCadencia(a: EspelhoCadencia, b: EspelhoCadencia): boolean {
  if (a.frequencia !== b.frequencia) return false;
  if (a.frequencia === 'SEMANAL') return true;
  if (a.frequencia === 'INTERVALO' && a.intervaloDias !== b.intervaloDias) return false;
  const ka = a.proximaData ? dateKeyLocal(a.proximaData) : '';
  const kb = b.proximaData ? dateKeyLocal(b.proximaData) : '';
  if (a.frequencia === 'QUINZENAL') {
    return !a.proximaData || !b.proximaData
      ? ka === kb
      : quinzenalPhase(a.proximaData) === quinzenalPhase(b.proximaData);
  }
  return ka === kb;
}

/**
 * Diff de dias entre o vínculo anterior e o atual. Troca de LOCAL ou de
 * CADÊNCIA zera a interseção: tudo sai do plano antigo e entra no novo —
 * plano é por (cliente, local, dia, cadência); "manter" num plano de cadência
 * diferente duplicaria o item em duas visitas do mesmo dia.
 */
export function planejarEspelho(
  anterior: EspelhoVinculoSnapshot | null,
  atual: EspelhoVinculoSnapshot | null,
): EspelhoPlanejado {
  const diasAntes = diasDoVinculo(anterior);
  const diasDepois = diasDoVinculo(atual);
  const mudouLocal = Boolean(anterior && atual && (anterior.localId ?? null) !== (atual.localId ?? null));
  const mudouCadencia = Boolean(
    anterior && atual && !mesmaCadencia(cadenciaDoVinculo(anterior), cadenciaDoVinculo(atual)),
  );
  if (mudouLocal || mudouCadencia) {
    return { adicionar: diasDepois, remover: diasAntes, manter: [] };
  }
  const antes = new Set(diasAntes);
  const depois = new Set(diasDepois);
  return {
    adicionar: diasDepois.filter((d) => !antes.has(d)),
    remover: diasAntes.filter((d) => !depois.has(d)),
    manter: diasDepois.filter((d) => antes.has(d)),
  };
}

// ── escolha do plano-alvo num dia (fail-closed) ────────────────────────────────

export interface EscolhaPlano {
  plano: EspelhoPlanoCandidato | null;
  /** true = nenhum candidato compatível: criar plano novo. */
  criar: boolean;
  aviso: string | null;
}

function dateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Paridade da semana (mesma conta do `legacyCadencePhase` do Organizar agora). */
function quinzenalPhase(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return String(Math.floor(x.getTime() / (7 * 86_400_000)) % 2);
}

/**
 * Entre os planos do MESMO (cliente, local, dia), escolhe onde o item do
 * vínculo vive:
 *  - SEMANAL: candidatos SEMANAL; 1 ativo vence; 0 ativo e 1 pausado → reativa;
 *    2+ no mesmo estado = AMBÍGUO (aviso, nem cria nem chuta).
 *  - QUINZENAL: exige mesma paridade de semana da âncora; sem par → criar.
 *  - INTERVALO: exige mesmo intervaloDias E mesma data-âncora; sem par → criar.
 */
export function escolherPlanoDoDia(
  candidatos: EspelhoPlanoCandidato[],
  cadencia: EspelhoCadencia,
): EscolhaPlano {
  let compativeis: EspelhoPlanoCandidato[];
  if (cadencia.frequencia === 'SEMANAL') {
    compativeis = candidatos.filter((p) => p.frequencia === 'SEMANAL');
  } else if (cadencia.frequencia === 'QUINZENAL') {
    compativeis = candidatos.filter((p) =>
      p.frequencia === 'QUINZENAL'
      && (
        !cadencia.proximaData
        || !p.proximaData
        || quinzenalPhase(p.proximaData) === quinzenalPhase(cadencia.proximaData)
      ));
  } else {
    compativeis = candidatos.filter((p) =>
      p.frequencia === 'INTERVALO'
      && p.intervaloDias === cadencia.intervaloDias
      && (
        !cadencia.proximaData
        || !p.proximaData
        || dateKeyLocal(p.proximaData) === dateKeyLocal(cadencia.proximaData)
      ));
  }

  if (!compativeis.length) return { plano: null, criar: true, aviso: null };
  const ativos = compativeis.filter((p) => p.ativo);
  const pool = ativos.length ? ativos : compativeis;
  if (pool.length > 1) {
    return {
      plano: null,
      criar: false,
      aviso: `AMBIGUO: ${pool.length} planos compatíveis no mesmo dia — nada foi alterado nesse dia.`,
    };
  }
  return { plano: pool[0], criar: false, aviso: null };
}

// ── mescla/remoção de item dentro do plano (fail-closed) ───────────────────────

export interface AplicarItemResultado {
  /** null = nada a escrever (já idêntico ou ambíguo — ver aviso). */
  itens: EspelhoPlanoItem[] | null;
  aviso: string | null;
}

/** Insere/atualiza o item do vínculo na lista de itens do plano. */
export function aplicarItemNoPlano(
  itens: EspelhoPlanoItem[],
  item: EspelhoPlanoItem,
): AplicarItemResultado {
  const matches = itens.filter((i) => i.productId === item.productId);
  if (matches.length > 1) {
    return { itens: null, aviso: 'AMBIGUO: o produto aparece mais de uma vez na visita — ajuste pela Agenda.' };
  }
  if (matches.length === 1) {
    const alvo = matches[0];
    if (alvo.qtd === item.qtd && alvo.valorUnit === item.valorUnit) {
      return { itens: null, aviso: null }; // já espelhado — nada a escrever
    }
    return {
      itens: itens.map((i) => (i === alvo ? { ...i, qtd: item.qtd, valorUnit: item.valorUnit } : { ...i })),
      aviso: null,
    };
  }
  if (itens.length >= 50) {
    return { itens: null, aviso: 'A visita já tem 50 itens — ajuste pela Agenda.' };
  }
  return { itens: [...itens.map((i) => ({ ...i })), { ...item }], aviso: null };
}

export interface RemoverItemResultado {
  /** null = nada a escrever (produto não estava lá, ou ambíguo). */
  itens: EspelhoPlanoItem[] | null;
  /** true quando a remoção deixaria a visita sem itens → pausar o plano. */
  esvaziou: boolean;
  aviso: string | null;
}

/** Tira o produto do plano; se for o último item, sinaliza pausa (nunca delete). */
export function removerItemDoPlano(
  itens: EspelhoPlanoItem[],
  productId: number,
): RemoverItemResultado {
  const matches = itens.filter((i) => i.productId === productId);
  if (!matches.length) return { itens: null, esvaziou: false, aviso: null };
  if (matches.length > 1) {
    return {
      itens: null,
      esvaziou: false,
      aviso: 'AMBIGUO: o produto aparece mais de uma vez na visita — ajuste pela Agenda.',
    };
  }
  const restantes = itens.filter((i) => i !== matches[0]).map((i) => ({ ...i }));
  if (!restantes.length) return { itens: null, esvaziou: true, aviso: null };
  return { itens: restantes, esvaziou: false, aviso: null };
}
