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

/**
 * ROTA INDICADA (29/07 + agendador 02/08) — a missão que o escritório mandou
 * pro celular de alguém. No cockpit ela deixa de ter painel próprio ("Missões
 * enviadas") e vira LINHA DO FEED: é a mesma pergunta dos outros avisos —
 * "tem algo pendente de mim hoje?" — e merecia a mesma moradia.
 */
export type MissaoIndicada = {
  id: string;
  nome: string;
  status: string;
  paraNome: string;
  porNome: string;
  avisoVisto: boolean;
  agendadaPara: string | null;
  alarmeArmado: boolean;
};

/** Linha do feed, seja ela vinda do vigia, da sentinela ou de uma missão. */
export type LinhaDoFeed = {
  chave: string;
  titulo: string;
  detalhe: string;
  grave: boolean;
  /** Só aviso do vigia/sentinela se dispensa (missão viva some sozinha). */
  dispensavelId: string | null;
};

export function getMissoes(): Promise<MissaoIndicada[]> {
  return apiFetch<MissaoIndicada[]>("/logistica/rota-indicadas");
}

/**
 * A frase da missão. `pendente`/`aceita` = está viva (o dono quer saber se o
 * celular recebeu); `negada`/`desfeita` = alguém devolveu e ele ficou sem
 * motorista — esse é o grave.
 */
export function fraseDaMissao(missao: MissaoIndicada): LinhaDoFeed | null {
  if (missao.status === "negada" || missao.status === "desfeita") {
    if (missao.avisoVisto) return null;
    return {
      chave: `missao:${missao.id}`,
      titulo: `Rota ${missao.nome} ${missao.status === "desfeita" ? "devolvida" : "negada"} por ${missao.paraNome}`,
      detalhe: "Ninguém está com ela agora.",
      grave: true,
      dispensavelId: null,
    };
  }
  if (missao.status !== "pendente" && missao.status !== "aceita") return null;

  const quando = missao.agendadaPara
    ? new Date(missao.agendadaPara).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "agora";

  if (missao.status === "aceita") {
    return {
      chave: `missao:${missao.id}`,
      titulo: `${missao.paraNome} aceitou a rota ${missao.nome}`,
      detalhe: `Marcada para ${quando}.`,
      grave: false,
      dispensavelId: null,
    };
  }
  // Pendente com hora marcada e SEM alarme armado é o único caso que alerta:
  // o escritório acha que mandou, e o celular nunca recebeu.
  const mudo = !!missao.agendadaPara && !missao.alarmeArmado;
  return {
    chave: `missao:${missao.id}`,
    titulo: `Rota ${missao.nome} esperando ${missao.paraNome}`,
    detalhe: mudo ? `Marcada para ${quando} — o celular ainda não recebeu.` : `Marcada para ${quando}.`,
    grave: mudo,
    dispensavelId: null,
  };
}

export function enviarRecado(input: {
  paraUserId?: number | null;
  texto: string;
  nivel: RecadoNivel;
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
