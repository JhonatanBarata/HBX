// COCKPIT (03/08) — contratos do canal de recado, dos avisos e do lote.
// Uma moradia só pros tipos que o cockpit troca com o backend: tela não
// redeclara forma de dado (foi assim que `rotaOrdem` ficou 2 meses fora do
// tipo enquanto o backend já mandava).

import { apiFetch } from "@/lib/api";

// ── Tipos de DOMÍNIO do cockpit ──────────────────────────────────────────────
// Moravam em route-board.tsx (o tabuleiro velho). Quando o palco foi reescrito
// (03/08, ordem do dono: "eu pedi para não usar a base"), os tipos vieram pra
// cá — o contrato sobrevive à tela, nunca o contrário.

export type Entregador = { id: number; nome: string | null; email: string | null };

/** Forma mínima de uma parada do dia — o item de GET /logistica/rota é compatível. */
export type Parada = {
  id: string;
  status: string;
  quantidade: number;
  scheduledAt: string | null;
  etaAt?: string | null;
  /**
   * 🔴 O EIXO DO PALCO É `rotaOrdem`, NUNCA relógio: `scheduledAt` pode ser
   * null no dia mais comum (entrega aberta sem hora) e um eixo por hora
   * nasceria vazio. Sem `rotaOrdem` a sequência mostra "—" — inventar número
   * pela posição do array seria prometer uma ordem que o entregador não segue.
   */
  rotaOrdem?: number | null;
  somenteCobranca?: boolean;
  motivoCobranca?: string | null;
  cliente: {
    nome: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    lat: number | null;
    lng: number | null;
  };
  produto: { nome: string; unidade: string | null } | null;
  entregador: Entregador | null;
};

/** Seletores canônicos da operação. Mapa, tabuleiro e inspetor não decidem
 * separadamente qual parada está aberta, em qual ordem ou qual é a próxima. */
export function ehParadaAberta(parada: Parada): boolean {
  return parada.status === "agendada" || parada.status === "em_rota";
}

export function ordenarParadas(paradas: Parada[]): Parada[] {
  return [...paradas].sort((a, b) => {
    const ordemA = typeof a.rotaOrdem === "number" ? a.rotaOrdem : Number.MAX_SAFE_INTEGER;
    const ordemB = typeof b.rotaOrdem === "number" ? b.rotaOrdem : Number.MAX_SAFE_INTEGER;
    if (ordemA !== ordemB) return ordemA - ordemB;
    const quandoA = a.etaAt || a.scheduledAt || "";
    const quandoB = b.etaAt || b.scheduledAt || "";
    if (quandoA !== quandoB) return quandoA.localeCompare(quandoB);
    return a.id.localeCompare(b.id);
  });
}

export function proximaParada(paradas: Parada[]): Parada | null {
  const abertas = ordenarParadas(paradas.filter(ehParadaAberta));
  return abertas.find((parada) => parada.status === "em_rota") ?? abertas[0] ?? null;
}

export type RecadoNivel = "normal" | "urgente" | "alarme";
export type RecadoEstado = "enviado" | "no_aparelho" | "visto" | "entendido";

/**
 * RECADO COM ROTA/PARADA EMBUTIDA (12/08) — o trabalho grudado no texto.
 *
 * Só o ID viaja no envio; `nome`/`detalhe` são resolvidos pelo servidor na
 * LEITURA (congelá-los faria o celular mostrar o endereço de antes da correção
 * do cadastro, e é pelo endereço que o motorista decide se encaixa).
 */
export type RecadoAnexoTipo = "parada" | "rota";
export type RecadoAnexoEstado = "pendente" | "encaixada" | "negada";

export type RecadoAnexo = {
  tipo: RecadoAnexoTipo;
  contaId: string | null;
  rotaModeloId: string | null;
  /** vazio = a referência saiu do cadastro depois do envio */
  nome: string;
  /** "R. das Orquídeas, 55" · "6 paradas" */
  detalhe: string;
  paradas: number | null;
  estado: RecadoAnexoEstado;
};

/** o que a tela MANDA: um id e o tipo dele, nada mais */
export type RecadoAnexoEnvio =
  | { tipo: "parada"; contaId: string }
  | { tipo: "rota"; rotaModeloId: string };

/** Uma rota salva (LogisticaRotaModelo) — o outro alvo possível do anexo. */
export type RotaSalva = {
  id: string;
  nome: string;
  diaSemana: number | null;
  paradas: Array<{ customerProfileId: string; localId?: string | null }>;
};

export function listarRotasSalvas(signal?: AbortSignal): Promise<RotaSalva[]> {
  return apiFetch<RotaSalva[]>("/logistica/rota-modelos", { signal });
}

export type Recado = {
  id: string;
  motoristaUserId: number;
  origem: "escritorio" | "motorista";
  autorNome: string;
  texto: string;
  nivel: RecadoNivel;
  loteId: string | null;
  criadoEm: string;
  entregueEm: string | null;
  vistoEm: string | null;
  ackEm: string | null;
  estado: RecadoEstado;
  /** null = recado só de texto (todo o fio de antes de 12/08). */
  anexo?: RecadoAnexo | null;
};

/** Tipos do vigia + os 3 da sentinela (03/08). */
export type AvisoTipo =
  | "abandonada"
  | "parcial"
  | "parada"
  | "sem_sinal"
  | "parado_demais"
  | "atraso";

export type RotaAviso = {
  id: string;
  tipo: AvisoTipo;
  motoristaNome: string;
  motoristaUserId: number;
  rotaNome: string | null;
  total: number;
  entregues: number;
  abertas: number;
  detalhe: string | null;
  createdAt: string;
};

export type AtribuirLoteResult = {
  atribuidas: number;
  ignoradas: number;
  entregador: { id: number; nome: string } | null;
};

/** Linha do feed, vinda do vigia ou da sentinela. */
export type LinhaDoFeed = {
  chave: string;
  titulo: string;
  detalhe: string;
  grave: boolean;
  /** Aviso do vigia/sentinela que se dispensa. */
  dispensavelId: string | null;
};

/**
 * APARELHO DO TURNO (08/08) — em qual celular o recado cai. Celular de entrega
 * é ferramenta da empresa: a pessoa pode ter mais de um pareado (o da rua, o
 * que ficou na base, o de teste). O servidor já devolve qual recebe (`doTurno`)
 * — a tela mostra, não pergunta.
 */
export type AparelhoDoRecado = {
  deviceId: string;
  nome: string;
  ultimoSinalEm: string | null;
  recebeOperacao: boolean;
  fixado: boolean;
  doTurno: boolean;
};

export function getAparelhosDoRecado(
  motoristaUserId: number,
  signal?: AbortSignal,
): Promise<AparelhoDoRecado[]> {
  return apiFetch<AparelhoDoRecado[]>(`/logistica/recados/aparelhos/${motoristaUserId}`, { signal });
}

export function enviarRecado(input: {
  paraUserId?: number | null;
  texto: string;
  nivel: RecadoNivel;
  /** Ausente = o servidor manda pro aparelho do turno. */
  deviceId?: string | null;
  /**
   * O trabalho grudado no texto. Só em recado individual — o servidor recusa
   * anexo em broadcast (cinco motoristas encaixando a mesma parada seriam cinco
   * visitas ao mesmo cliente).
   */
  anexo?: RecadoAnexoEnvio;
}): Promise<Recado[]> {
  return apiFetch<Recado[]>("/logistica/recados", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getFioRecados(motoristaUserId: number, signal?: AbortSignal): Promise<Recado[]> {
  return apiFetch<Recado[]>(`/logistica/recados/${motoristaUserId}`, { signal });
}

export function getRecadosNaoLidos(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>("/logistica/recados-nao-lidos");
}

export function atribuirLote(ids: string[], entregadorId: number | null): Promise<AtribuirLoteResult> {
  return apiFetch<AtribuirLoteResult>("/logistica/entregas/atribuir-lote", {
    method: "PATCH",
    body: JSON.stringify({ ids, entregadorId }),
  });
}

export function cancelarEntrega(id: string, motivo: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/logistica/entregas/${id}/cancelar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

/**
 * A frase do aviso, em UMA linha, já com o número que decide.
 *
 * Mora aqui (e não no componente) porque o feed do sino e qualquer futuro
 * lugar que mostre aviso precisam dizer a MESMA coisa — dois textos pro mesmo
 * fato é o começo de "a tela mente".
 */
export function fraseDoAviso(aviso: RotaAviso): { titulo: string; detalhe: string; grave: boolean } {
  const quem = aviso.motoristaNome;
  const esperando = aviso.abertas > 0 ? `${aviso.abertas} cliente(s) esperando.` : "";
  switch (aviso.tipo) {
    case "sem_sinal":
      return {
        titulo: `${quem} sumiu do mapa`,
        detalhe: [aviso.detalhe, esperando].filter(Boolean).join(" · "),
        grave: true,
      };
    case "parado_demais":
      return {
        titulo: `${quem} está parado fora de cliente`,
        detalhe: [aviso.detalhe, esperando].filter(Boolean).join(" · "),
        grave: false,
      };
    case "atraso":
      return {
        titulo: `${quem} está atrasado no plano`,
        detalhe: [aviso.detalhe, esperando].filter(Boolean).join(" · "),
        grave: false,
      };
    case "abandonada":
      return {
        titulo: `${quem} encerrou sem entregar nada`,
        detalhe: `Saiu pra rua${aviso.rotaNome ? ` na rota ${aviso.rotaNome}` : ""}. ${esperando}`.trim(),
        grave: true,
      };
    case "parcial":
      return {
        titulo: `${quem} encerrou a rota no meio`,
        detalhe: `${aviso.entregues} de ${aviso.total} entregues. ${esperando}`.trim(),
        grave: true,
      };
    case "parada":
    default:
      return {
        titulo: `${quem} iniciou e não entregou nada`,
        detalhe: `Sem sinal de vida há mais de 1h30. ${esperando}`.trim(),
        grave: true,
      };
  }
}

/** O estado da bolha, na escrita que o dono lê ("✓✓ entendido"). */
export function rotuloDoEstado(recado: Recado): string {
  const hora = new Date(recado.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (recado.origem === "motorista") return hora;
  switch (recado.estado) {
    case "entendido":
      return "✓✓ entendido";
    case "visto":
      return "✓✓ visto";
    case "no_aparelho":
      return "✓✓ no aparelho";
    default:
      return "✓ enviado";
  }
}
