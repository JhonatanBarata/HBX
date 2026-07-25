// Matcher de "importar sequência pronta" (S2) — reusado por S3 (conferência de
// divergência) para o MESMO casamento parada-do-modelo × plano-do-dia. Função
// pura (sem Prisma/tx) para ficar testável e idêntica nas duas sprints.

export interface SequenciaMatchPlano {
  id: string;
  customerProfileId: string;
  localId: string | null;
}

export interface SequenciaMatchParada {
  customerProfileId: string;
  localId?: string | null;
}

export interface SequenciaMatchResultado {
  /** Planos casados, na ordem do modelo (posicao 1..N). */
  ordem: Array<{ planoId: string; posicao: number }>;
  /** Planos do dia sem parada correspondente no modelo — vão para o fim, ordem relativa atual preservada. */
  foraDaSequencia: string[];
  /** Planos não casados por ambiguidade (nunca chutados). */
  ambiguos: Array<{ planoId: string; motivo: string }>;
  /** Paradas do modelo sem plano no dia — só informativo, nada é criado a partir daqui. */
  semPlano: Array<{ customerProfileId: string; localId: string | null }>;
}

/**
 * Casa as paradas de uma rota salva (`LogisticaRotaModelo.paradasJson`) com os
 * planos do dia. Lei anti-erro-grave nº1: dado ambíguo nunca vira verdade —
 * cliente com 2+ planos no dia sem `localId` que desempate cai em `ambiguos`,
 * nunca casa sozinho (mesma lei do incidente do pino: errado é pior que vazio).
 *
 * Passe 1 resolve só pelo par exato (customerProfileId+localId). Passe 2 tenta
 * o fallback por customerProfileId sozinho, mas SÓ quando sobra exatamente um
 * plano não usado daquele cliente — dois ou mais nesse ponto = ambiguidade.
 *
 * Invariante garantido: `ordem` + `foraDaSequencia` + `ambiguos` (por planoId)
 * cobrem TODOS os `planos` recebidos, sem repetição — é o que o
 * `PATCH dias/:dia/ordem` exige para aceitar a lista.
 */
export function matchSequenciaImportada(
  planos: SequenciaMatchPlano[],
  paradasModelo: SequenciaMatchParada[],
): SequenciaMatchResultado {
  const porCliente = new Map<string, SequenciaMatchPlano[]>();
  for (const plano of planos) {
    const lista = porCliente.get(plano.customerProfileId) ?? [];
    lista.push(plano);
    porCliente.set(plano.customerProfileId, lista);
  }

  const usados = new Set<string>();
  const assignedIndex = new Map<number, string>();
  const ambiguosCandidatos = new Set<string>();
  const semPlanoIndexes = new Set<number>();

  // Passe 1 — casamento exato (customerProfileId + localId). É a ÚNICA forma
  // de casar um cliente com 2+ planos no dia sem depender de contagem.
  paradasModelo.forEach((parada, index) => {
    const localId = parada.localId ?? null;
    if (!localId) return;
    const candidatos = (porCliente.get(parada.customerProfileId) ?? []).filter(
      (plano) => !usados.has(plano.id) && (plano.localId ?? null) === localId,
    );
    if (candidatos.length === 1) {
      usados.add(candidatos[0].id);
      assignedIndex.set(index, candidatos[0].id);
    }
  });

  // Passe 2 — fallback por customerProfileId sozinho, só quando não sobra
  // ambiguidade (exatamente 1 plano não usado daquele cliente neste momento).
  paradasModelo.forEach((parada, index) => {
    if (assignedIndex.has(index)) return;
    const restantes = (porCliente.get(parada.customerProfileId) ?? []).filter(
      (plano) => !usados.has(plano.id),
    );
    if (restantes.length === 1) {
      usados.add(restantes[0].id);
      assignedIndex.set(index, restantes[0].id);
    } else if (restantes.length === 0) {
      semPlanoIndexes.add(index);
    } else {
      // 2+ planos do mesmo cliente sobrando e nada que desempate = ambíguo.
      // Nunca escolher um dos dois — fica de fora até o usuário decidir.
      restantes.forEach((plano) => ambiguosCandidatos.add(plano.id));
    }
  });

  const ordem = [...assignedIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, planoId], posicaoIndex) => ({ planoId, posicao: posicaoIndex + 1 }));

  const foraDaSequencia: string[] = [];
  const ambiguos: Array<{ planoId: string; motivo: string }> = [];
  for (const plano of planos) {
    if (usados.has(plano.id)) continue;
    if (ambiguosCandidatos.has(plano.id)) {
      ambiguos.push({
        planoId: plano.id,
        motivo: 'Mais de um plano deste cliente hoje — a sequência não indica qual endereço é este.',
      });
    } else {
      foraDaSequencia.push(plano.id);
    }
  }

  const semPlano = [...semPlanoIndexes].map((index) => {
    const parada = paradasModelo[index];
    return { customerProfileId: parada.customerProfileId, localId: parada.localId ?? null };
  });

  return { ordem, foraDaSequencia, ambiguos, semPlano };
}

/** Lê `paradasJson` (formato livre, gravado por Leitura de Rota ou pelo espelho da Agenda) sem confiar cegamente no shape. */
export function parseParadasModeloJson(raw: unknown): SequenciaMatchParada[] {
  if (!Array.isArray(raw)) return [];
  const paradas: SequenciaMatchParada[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const customerProfileId = String((item as any).customerProfileId ?? '').trim();
    if (!customerProfileId) continue;
    const localIdRaw = (item as any).localId;
    const localId = localIdRaw ? String(localIdRaw).trim() || null : null;
    paradas.push({ customerProfileId, localId });
  }
  return paradas;
}
