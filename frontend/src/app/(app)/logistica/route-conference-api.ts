"use client";

// PR29072026 — PARIDADE DO MONTADOR (/logistica no COMPUTADOR).
// Ordem do dono (29/07): "/logistica tem q ter tudo q o celular tem, distancia,
// tudo bem feito, para não virar bagunça. e quem está montando saber o q está
// acontecendo".
//
// Diagnóstico que gerou este arquivo: o montador do site NUNCA chamava
// `rota/conferir`, `rota/custo-preview` nem `rota/checar-enderecos` — disparava
// `rota/planejar` e escrevia "Rota planejada.". Quem montava não sabia de nada:
// nem km, nem previsão, nem crédito, nem endereço quebrado. O motor já devolvia
// tudo isso e estava OCIOSO. Aqui é só o tipo + o fetcher; nenhuma regra nova de
// negócio nasce no front (a régua continua sendo o backend).
//
// PADRONIZAR = IGUALAR: as frases de motivo, o formato da perna ("↓ 1,2 km ·
// 5 min") e as duas linhas do resumo são CÓPIA do que o APK mostra
// (EntregaShell/app/src/logistica/assets/app/app.js). Mudou lá, muda aqui.

import { apiFetch } from "@/lib/api";

// ── Contratos (espelham backend/src/logistica/logistica-conferencia.service.ts) ──

export type SemaforoCor = "verde" | "vermelho";

export type ConferirRotaParada = {
  id: string;
  nome: string | null;
  customerProfileId: string | null;
  localId: string | null;
  rotaOrdem: number;
  lat: number | null;
  lng: number | null;
  etaAt: string | null;
  legDistanceM: number | null;
  legDurationS: number | null;
  semaforo: SemaforoCor;
  /** O que o operador VÊ: só impeditivos, já ordenados por gravidade. */
  motivosVisiveis: string[];
};

export type ConferirRotaResult = {
  date: string;
  engine: string;
  degradedReason: string | null;
  total: number;
  comAviso: number;
  verdes: number;
  vermelhas: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  paradas: ConferirRotaParada[];
};

export type ConferirRotaPayload = {
  date: string;
  deliveryIds?: string[];
  ordemManual?: string[];
};

/** backend/src/logistica/logistica-custo-preview.service.ts */
export type CustoPreviewResult = {
  blocosTotais: number;
  blocosJaDebitados: number;
  creditosAIniciar: number;
  saldoAtual: number;
  saldoCobre: boolean;
};

export type ChecagemEnderecoCampo = {
  campo: "cep" | "numero" | "endereco" | "localizacao";
  /** 2-4 palavras, já em português de operador (Lei nº8: dado em linha, nunca parágrafo). */
  problema: string;
};

export type ChecagemEnderecoCliente = {
  customerProfileId: string;
  localId: string | null;
  nome: string;
  endereco: {
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
  };
  campos: ChecagemEnderecoCampo[];
};

export type ChecarEnderecosResult = {
  dias: number[];
  total: number;
  ok: number;
  problemas: ChecagemEnderecoCliente[];
};

// ── Fetchers ────────────────────────────────────────────────────────────────

/**
 * DRY-RUN ABSOLUTO (Lei nº3 da frente ROTA-CONFERIDA): roda o motor em memória
 * e devolve o semáforo + distância. NUNCA grava ordem, NUNCA debita.
 */
export function conferirRota(payload: ConferirRotaPayload): Promise<ConferirRotaResult> {
  return apiFetch<ConferirRotaResult>("/logistica/rota/conferir", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Quanto o Aceitar VAI debitar, antes do operador apertar. 100% leitura.
 *
 * Degrada sem travar a tela (igual ao APK), mas NÃO degrada MUDO: o `motivo`
 * carrega a frase do backend. Bug do dono (29/07): ele cancelou uma rota
 * indicada e a tela passou a não mostrar custo NENHUM, sem dizer por quê —
 * "fiquei preso, sem enxergar o q falta fazer". A régua de bloqueio é a mesma;
 * a frase agora diz qual dos 4 estados é (ver logistica-motorista-unico.util.ts
 * no backend: dia vazio · seleção velha · sem motorista · motoristas divididos).
 */
export type CustoPreviewResposta = {
  custo: CustoPreviewResult | null;
  motivo: string | null;
};

export async function getCustoPreview(date: string, deliveryIds?: string[]): Promise<CustoPreviewResposta> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (deliveryIds?.length) params.set("deliveryIds", deliveryIds.join(","));
  const query = params.toString();
  try {
    return { custo: await apiFetch<CustoPreviewResult>(`/logistica/rota/custo-preview${query ? `?${query}` : ""}`), motivo: null };
  } catch (error: unknown) {
    const mensagem = error instanceof Error && error.message ? error.message : null;
    return { custo: null, motivo: mensagem };
  }
}

/** Portão do dono (28/07): confere ANTES de montar. Não materializa, não debita. */
export function checarEnderecos(dias: number[], dates: string[]): Promise<ChecarEnderecosResult> {
  return apiFetch<ChecarEnderecosResult>("/logistica/rota/checar-enderecos", {
    method: "POST",
    body: JSON.stringify({ dias, dates }),
  });
}

/** Tira o DIA do cadastro do cliente (porta canônica + espelho da agenda). */
export function tirarDoDia(dias: number[], customerProfileIds: string[]): Promise<{ success: boolean; removidos: number; falhas: number }> {
  return apiFetch("/logistica/rota/tirar-do-dia", {
    method: "POST",
    body: JSON.stringify({ dias, customerProfileIds }),
  });
}

/**
 * A saída de quem NÃO aceitou. DEVOLVE a ocorrência da agenda (sem isto, montar
 * e desistir consumia o dia do cliente — a `proximaData` pulava a semana).
 * Ponte de transição igual à do APK: servidor sem o endpoint cai no encerrar.
 */
export async function descartarMontagem(date: string, motivo: string): Promise<void> {
  const body = JSON.stringify({ date, motivo });
  try {
    await apiFetch("/logistica/rota/descartar-montagem", { method: "POST", body });
  } catch (error: unknown) {
    const status = (error as { status?: number } | null)?.status;
    if (status !== 404 && status !== 405) throw error;
    await apiFetch("/logistica/rota/encerrar", { method: "POST", body });
  }
}

/** Traçado viário real pelo proxy OSRM do backend (`/logistica/osrm/route`). */
export async function getRoadGeometry(points: Array<{ lat: number; lng: number }>): Promise<Array<[number, number]> | null> {
  if (points.length < 2) return null;
  const coords = points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
  try {
    const result = await apiFetch<{ routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }> }>(
      `/logistica/osrm/route?coords=${encodeURIComponent(coords)}`,
    );
    const line = result?.routes?.[0]?.geometry?.coordinates;
    return Array.isArray(line) && line.length > 1 ? line : null;
  } catch {
    return null; // mapa cai na linha reta; nunca é ponto único de falha.
  }
}

// ── Texto (CÓPIA do APK — padronizar é IGUALAR, não redecorar) ───────────────

/**
 * Código que não estiver neste mapa NÃO vira texto na tela: o backend pode
 * ganhar motivo novo antes de a tela ter uma frase de gente pra ele — melhor
 * calado que críptico. Jargão proibido: nenhuma frase fala de "pino".
 */
const MOTIVO_FRASE: Record<string, string> = {
  cep_endereco_divergente: "CEP e endereço não batem",
  sem_pino: "Não sei onde fica este endereço",
  // 06/08 — a identidade da porta é CEP + número + complemento (Correios/DNE,
  // USPS/DPV). Coordenada igual entre casas de números diferentes é geocode que não
  // chegou na porta — some daqui, porque nunca foi problema de cadastro de ninguém.
  endereco_repetido: "Mesmo endereço de outro cliente",
  diverge_gps_ouro: "Diferente de onde você já entregou",
  // Os dois motivos de distância dizem a MESMA coisa pro operador — então dizem
  // com a MESMA frase (o dedupe abaixo evita repetir quando a parada acumula os dois).
  fora_do_casulo: "Muito longe das outras paradas",
  perna_outlier: "Muito longe das outras paradas",
};

export function motivosTexto(parada: ConferirRotaParada): string {
  const frases: string[] = [];
  (parada.motivosVisiveis || []).forEach((motivo) => {
    const frase = MOTIVO_FRASE[motivo];
    if (frase && !frases.includes(frase)) frases.push(frase);
  });
  return frases.join(" · ");
}

/** "↓ 1,2 km · 5 min" — mesmo formato do conector de perna do APK. */
export function legLabel(parada: ConferirRotaParada): string | null {
  if (!Number.isFinite(parada.legDistanceM)) return null;
  const metros = Number(parada.legDistanceM);
  const distancia = metros < 1000
    ? `${Math.round(metros)} m`
    : `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
  const minutos = Number.isFinite(parada.legDurationS)
    ? ` · ${Math.round(Number(parada.legDurationS) / 60)} min`
    : "";
  return `↓ ${distancia}${minutos}`;
}

export function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** As DUAS linhas do resumo, no formato que o dono cravou. */
export function resumoLinhas(data: ConferirRotaResult): [string, string] {
  const total = Number(data.total) || 0;
  const comAvisoBruto = Number(data.comAviso);
  const comAviso = Number.isFinite(comAvisoBruto)
    ? comAvisoBruto
    : (data.paradas || []).filter((parada) => parada.semaforo === "vermelho").length;
  const km = Math.round(Number(data.distanciaTotalKm) || 0);
  const fim = horaCurta(data.terminoPrevisto);
  return [
    `${total} ${total === 1 ? "parada" : "paradas"}, ${comAviso} com aviso${comAviso === 1 ? "" : "s"}.`,
    fim ? `Total ${km} km. Previsão de finalizar: ${fim}.` : `Total ${km} km.`,
  ];
}

/** Endereço em LINHA com a parte quebrada marcada — Lei nº8: dado, nunca parágrafo. */
export type EnderecoPedaco = { texto: string; ruim: boolean };

export function enderecoPedacos(item: ChecagemEnderecoCliente): EnderecoPedaco[] {
  const campos = new Set((item.campos || []).map((campo) => campo.campo));
  const endereco = item.endereco || {};
  const pedacos: EnderecoPedaco[] = [];
  // Endereço legado vem COMPOSTO ("Rua 3a, 1354 - Jd. Ypê"): repetir número e
  // bairro depois dele escreveria a mesma coisa duas vezes na linha.
  const semAcento = (texto: string | null) => String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const jaEscrito = (trecho: string | null) => !!trecho && semAcento(endereco.logradouro).includes(semAcento(trecho));

  if (endereco.logradouro) pedacos.push({ texto: endereco.logradouro, ruim: campos.has("endereco") });
  else pedacos.push({ texto: "sem rua", ruim: true });

  if (endereco.numero && !jaEscrito(endereco.numero)) pedacos.push({ texto: endereco.numero, ruim: false });
  else if (!endereco.numero && campos.has("numero")) pedacos.push({ texto: "sem número", ruim: true });

  if (endereco.bairro && !jaEscrito(endereco.bairro)) pedacos.push({ texto: endereco.bairro, ruim: false });

  if (campos.has("cep")) {
    pedacos.push({ texto: endereco.cep ? `CEP ${endereco.cep} é de outra rua` : "sem CEP", ruim: true });
  }
  if (campos.has("localizacao") && !campos.has("numero") && !campos.has("endereco")) {
    pedacos.push({ texto: "não achei no mapa", ruim: true });
  }
  return pedacos;
}
