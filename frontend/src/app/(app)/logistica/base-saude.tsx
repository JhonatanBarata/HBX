"use client";

// ENDEREÇOS DO COCKPIT — diagnóstico da logística + edição no mesmo lugar.
// A lista continua usando o semáforo canônico de GET /logistica/base-saude.
// Ao selecionar um cliente, a ficha completa vem de GET /nucleo/clientes/:id:
// assim nenhum LocalEntrega secundário some e a correção grava no local exato.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  criarLocal,
  editarLocal,
  getCliente,
  type ClienteDetail,
  type CriarLocalPayload,
  type LocalCliente,
} from "./clientes-api";
import { buscarCep, formatarCep, geocodar, reverseGeocodar, soDigitos } from "./geo";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Semaforo = "verde" | "amarelo" | "vermelho";
type Motivo =
  | "sem_pino"
  | "endereco_repetido"
  | "fora_do_casulo"
  | "perna_outlier"
  | "diverge_gps_ouro"
  | "geocode_nao_provado_em_campo"
  | "fonte_nao_confiavel"
  | "nunca_entregue"
  | "rota_degradada";

type BaseSaudeCliente = {
  id: string;
  nome: string | null;
  semaforo: Semaforo;
  motivos: Motivo[];
  localId: string | null;
  localApelido: string | null;
  resolveSozinho: boolean;
  /** Outras contas na MESMA PORTA (mesmo número, sem apartamento que as separe). */
  mesmaPortaCom?: Array<{ id: string; nome: string }>;
  mesmaPortaComTotal?: number;
};

type BaseSaudeResult = {
  totalClientes: number;
  verdes: number;
  amarelos: number;
  vermelhos: number;
  resolvemSozinhos: number;
  percentVerde: number;
  clientes: BaseSaudeCliente[];
};

type LocalDraft = {
  apelido: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  lat: string;
  lng: string;
  geoFonte: "geocode" | "gps_cadastro" | "";
  gpsAccuracy: number | null;
};

type Filtro = "todos" | Semaforo;

const TAMANHO_PAGINA = 120;

/** Quantos lotes o botão "Resolver endereços" encadeia antes de devolver a mão pro
 *  dono. Teto existe pra base gigante não virar uma tela girando sem fim — sobrou,
 *  ele aperta de novo (e o carimbo do servidor faz cada volta começar de onde parou). */
const VOLTAS_MAXIMAS_RESOLVER = 12;

/** Espelha LimpezaResult de backend/src/logistica/logistica-base-limpeza.service.ts. */
type LimpezaCliente = { id: string; nome: string | null; endereco: string; motivo: string };
type LimpezaResult = {
  duplicados: LimpezaCliente[];
  semEndereco: LimpezaCliente[];
  apagados: number;
  executado: boolean;
};

const FILTROS: Array<{ key: Filtro; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "vermelho", label: "Corrigir" },
  { key: "amarelo", label: "Revisar" },
  { key: "verde", label: "Prontos" },
];

const MOTIVO_LABEL: Record<Motivo, string> = {
  sem_pino: "Sem localização cadastrada",
  endereco_repetido: "Mesmo endereço de outro cliente",
  fora_do_casulo: "Fora do agrupamento do dia",
  perna_outlier: "Trecho fora do padrão",
  diverge_gps_ouro: "Local diverge da última entrega",
  geocode_nao_provado_em_campo: "Endereço nunca confirmado no campo",
  fonte_nao_confiavel: "Fonte de localização não confiável",
  nunca_entregue: "Nunca recebeu entrega",
  rota_degradada: "Rota calculada sem motor de ruas",
};

function motivosTexto(motivos: Motivo[]): string {
  if (motivos.length === 0) return "Sem pendência";
  return motivos.map((motivo) => MOTIVO_LABEL[motivo] || motivo).join(" · ");
}

// 06/08 (dono, olhando a Adriana): "eu não sei o q ele tem de errado, e se é
// repetido o q tem de repetido". A linha mostrava as 3 frases empilhadas, com o
// mesmo peso — e duas delas ("nunca confirmado no campo", "nunca recebeu
// entrega") são o estado NORMAL de cliente novo, exatamente o ruído que a
// conferência da rota já tinha matado em 26/07. Aqui a tela passa a separar:
// o que ele precisa CORRIGIR na frente, o que é normal fica embaixo, escrito
// como aviso e não como defeito. A COR continua sendo a do servidor.
const MOTIVOS_CORRIGIR: Motivo[] = ["sem_pino", "endereco_repetido", "diverge_gps_ouro"];

/** Cada motivo em duas partes: o que é + o que fazer. Sem jargão (nada de "pino").
 *  LEI (06/08): a frase só pode mandar fazer o que ESTA tela faz — "marque o ponto
 *  certo desta casa" saiu daqui porque não existe mapa pra marcar, e o dono ficou
 *  preso numa ordem impossível. */
const MOTIVO_AJUDA: Partial<Record<Motivo, string>> = {
  sem_pino: "Confira o CEP e o número; depois use Localizar endereço e salve.",
  endereco_repetido: "Mesmo número, sem apartamento. Se for prédio, escreva o apartamento no Complemento; se não for, um dos dois cadastros está repetido.",
  diverge_gps_ouro: "A última entrega foi longe daqui — confirme o endereço.",
  geocode_nao_provado_em_campo: "O ponto veio do endereço digitado — a 1ª entrega confirma a porta sozinha.",
  fonte_nao_confiavel: "O ponto veio de uma origem sem confirmação.",
  nunca_entregue: "Ainda não houve entrega neste endereço.",
  fora_do_casulo: "Fica longe do agrupamento do dia.",
  perna_outlier: "O trecho até aqui foge do padrão da rota.",
  rota_degradada: "A rota do dia foi calculada sem o motor de ruas.",
};

/** "Adriana e Marcos" · "Adriana, Marcos e mais 3" — nome é o que resolve. */
function listaDeNomes(nomes: string[], total: number): string {
  if (!nomes.length) return "";
  const sobra = Math.max(0, total - nomes.length);
  if (sobra > 0) return `${nomes.join(", ")} e mais ${sobra}`;
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** O título do motivo já com o NOME de quem está junto, quando existe. */
function tituloDoMotivo(motivo: Motivo, cliente: BaseSaudeCliente): string {
  if (motivo === "endereco_repetido") {
    const nomes = listaDeNomes((cliente.mesmaPortaCom ?? []).map((g) => g.nome), cliente.mesmaPortaComTotal ?? 0);
    return nomes ? `Mesmo endereço de ${nomes}` : MOTIVO_LABEL[motivo];
  }
  return MOTIVO_LABEL[motivo] || motivo;
}

/** A linha da fila: só o que precisa de mão. Sem nada a corrigir, o aviso mais
 *  brando — nunca as duas coisas juntas com o mesmo peso. */
function resumoDaLinha(cliente: BaseSaudeCliente): string {
  const corrigir = cliente.motivos.filter((motivo) => MOTIVOS_CORRIGIR.includes(motivo));
  if (corrigir.length) return corrigir.map((motivo) => tituloDoMotivo(motivo, cliente)).join(" · ");
  if (!cliente.motivos.length) return "Endereço pronto";
  return cliente.motivos.map((motivo) => MOTIVO_LABEL[motivo] || motivo).join(" · ");
}

function humanError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function numeroComoTexto(valor: number | null | undefined): string {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : "";
}

function draftDoLocal(detalhe: ClienteDetail, local: LocalCliente | null): LocalDraft {
  const geoFonte = local ? local.geoFonte : detalhe.geoFonte;
  return {
    apelido: local?.apelido || "",
    endereco: (local ? local.endereco : detalhe.endereco) || "",
    numero: (local ? local.numero : detalhe.numero) || "",
    complemento: (local ? local.complemento : detalhe.complemento) || "",
    bairro: (local ? local.bairro : detalhe.bairro) || "",
    cidade: (local ? local.cidade : detalhe.cidade) || "",
    uf: ((local ? local.uf : detalhe.uf) || "").toUpperCase(),
    cep: formatarCep((local ? local.cep : detalhe.cep) || ""),
    lat: numeroComoTexto(local ? local.lat : detalhe.lat),
    lng: numeroComoTexto(local ? local.lng : detalhe.lng),
    geoFonte: geoFonte === "gps_cadastro" ? "gps_cadastro" : geoFonte === "geocode" ? "geocode" : "",
    gpsAccuracy: null,
  };
}

function payloadDoDraft(draft: LocalDraft): CriarLocalPayload {
  const lat = Number(draft.lat.replace(",", "."));
  const lng = Number(draft.lng.replace(",", "."));
  const temCoordenada = Number.isFinite(lat) && Number.isFinite(lng) && draft.lat.trim() !== "" && draft.lng.trim() !== "";
  return {
    apelido: draft.apelido.trim(),
    endereco: draft.endereco.trim(),
    numero: draft.numero.trim(),
    complemento: draft.complemento.trim(),
    bairro: draft.bairro.trim(),
    cidade: draft.cidade.trim(),
    uf: draft.uf.trim().toUpperCase(),
    cep: draft.cep.replace(/\D/g, ""),
    ...(temCoordenada ? { lat, lng } : {}),
    ...(temCoordenada && draft.geoFonte ? { geoFonte: draft.geoFonte } : {}),
    ...(temCoordenada && draft.gpsAccuracy !== null ? { gpsAccuracy: draft.gpsAccuracy } : {}),
  };
}

function nomeDoLocal(local: LocalCliente): string {
  return local.apelido || [local.endereco, local.numero].filter(Boolean).join(", ") || "Local de entrega";
}

export function BaseSaude() {
  const [dados, setDados] = useState<BaseSaudeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ClienteDetail | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [detalheError, setDetalheError] = useState<string | null>(null);
  const [localSelecionadoId, setLocalSelecionadoId] = useState("");
  const [draft, setDraft] = useState<LocalDraft | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [resolvendo, setResolvendo] = useState(false);
  const [resolvidoParcial, setResolvidoParcial] = useState(0);
  const [limpando, setLimpando] = useState(false);
  const [juntando, setJuntando] = useState(false);
  const complementoRef = useRef<HTMLInputElement | null>(null);
  const [previa, setPrevia] = useState<LimpezaResult | null>(null);
  const filtroPill = useGlassPill<HTMLButtonElement>(filtro);

  const load = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    return apiFetch<BaseSaudeResult>("/logistica/base-saude")
      .then((res) => { setDados(res); setError(null); })
      .catch((err: unknown) => { setError(humanError(err, "Não foi possível carregar os endereços.")); })
      .finally(() => { if (!silencioso) setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura inicial da API.
  useEffect(() => { void load(); }, [load]);

  // DEEP-LINK `?cliente=<id>` (06/08): o portão "Endereços com erro" da montagem
  // manda o operador PRA CÁ já no cliente que ele clicou. Sem isto ele cairia na
  // primeira linha da fila e teria que caçar o nome numa lista de centenas — e o
  // cliente pode nem estar na primeira página, por isso a página vai junto.
  const alvoDaUrlAplicado = useRef(false);
  useEffect(() => {
    if (alvoDaUrlAplicado.current || !dados || typeof window === "undefined") return;
    alvoDaUrlAplicado.current = true;
    const id = new URLSearchParams(window.location.search).get("cliente");
    if (!id) return;
    const indice = (dados.clientes ?? []).findIndex((cliente) => cliente.id === id);
    if (indice < 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seleção vinda da URL, uma vez só, depois que a fila carregou.
    setSelecionadoId(id);
    setPagina(Math.floor(indice / TAMANHO_PAGINA));
  }, [dados]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (dados?.clientes ?? []).filter((cliente) => {
      if (filtro !== "todos" && cliente.semaforo !== filtro) return false;
      if (!termo) return true;
      return [cliente.nome, cliente.localApelido, motivosTexto(cliente.motivos)]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [busca, dados, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / TAMANHO_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);
  const clientesDaPagina = clientesFiltrados.slice(
    paginaSegura * TAMANHO_PAGINA,
    (paginaSegura + 1) * TAMANHO_PAGINA,
  );
  const clienteSelecionado = clientesFiltrados.find((cliente) => cliente.id === selecionadoId)
    ?? clientesDaPagina[0]
    ?? null;
  // A ficha anterior continua em memória enquanto a próxima carrega, mas nunca
  // pode ser apresentada como se pertencesse ao novo cliente.
  const detalheAtual = detalhe?.id === clienteSelecionado?.id ? detalhe : null;

  useEffect(() => {
    const clienteId = clienteSelecionado?.id;
    if (!clienteId) return undefined;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de cliente inicia uma leitura externa e precisa exibir o estado de carregamento.
    setDetalheLoading(true);
    setDetalheError(null);
    setMensagem(null);
    getCliente(clienteId)
      .then((res) => {
        if (!vivo) return;
        const locais = (res.locais ?? []).filter((local) => local.ativo !== false);
        const local = locais.find((item) => item.id === clienteSelecionado.localId)
          ?? locais.find((item) => item.isPrincipal)
          ?? locais[0]
          ?? null;
        setDetalhe(res);
        setLocalSelecionadoId(local?.id || "");
        setDraft(draftDoLocal(res, local));
      })
      .catch((err: unknown) => {
        if (vivo) setDetalheError(humanError(err, "Não foi possível abrir este endereço."));
      })
      .finally(() => { if (vivo) setDetalheLoading(false); });
    return () => { vivo = false; };
  }, [clienteSelecionado?.id, clienteSelecionado?.localId]);

  /**
   * 🔴 RESOLVER ENDEREÇOS (06/08) — o botão que faz o trabalho no lugar do dono.
   *
   * O servidor tem a base de endereços do IBGE (CNEFE) com a coordenada de cada
   * PORTA. Quem estava com o ponto do CEP (o caso da Adriana: 5 casas da Avenida 74
   * no mesmo ponto) ou sem ponto nenhum passa a ser resolvido por (CEP + número) —
   * medido na base do André: 79 dos 130 cadastros com CEP e número têm porta exata
   * lá. Antes disso, a tela mandava marcar 115 pontos na mão.
   *
   * Vai em LOTES e repete sozinho enquanto `restantes` não zerar — o servidor tem
   * teto por chamada de propósito (requisição pendurada é pior que duas chamadas).
   */
  const resolverEnderecos = useCallback(async () => {
    if (resolvendo) return;
    setResolvendo(true);
    setError(null);
    setMensagem(null);
    let resolvidos = 0;
    try {
      for (let volta = 0; volta < VOLTAS_MAXIMAS_RESOLVER; volta += 1) {
        const res = await apiFetch<{ curados: number; tentados: number; restantes: number }>(
          "/logistica/base-saude/resolver",
          { method: "POST" },
        );
        resolvidos += Number(res?.curados) || 0;
        setResolvidoParcial(resolvidos);
        if (!Number(res?.restantes)) break;
      }
      await load(true);
      setMensagem(
        resolvidos > 0
          ? `${resolvidos} ${resolvidos === 1 ? "endereço resolvido" : "endereços resolvidos"} pela base de endereços.`
          : "Nenhum endereço novo deu para resolver automaticamente — os que sobraram precisam de CEP e número certos.",
      );
    } catch (err: unknown) {
      setError(humanError(err, "Não foi possível resolver os endereços agora."));
    } finally {
      setResolvendo(false);
      setResolvidoParcial(0);
    }
  }, [load, resolvendo]);

  /**
   * 🔴 FAXINA (06/08, regras do dono) — cadastro duplicado na mesma porta e cadastro
   * sem endereço fechado saem da base, mas SÓ quem não tem movimento nenhum.
   *
   * Duas etapas de propósito: a 1ª chamada é PRÉVIA e devolve a lista; a tela mostra
   * os nomes e só então o dono confirma. Apagar cadastro de cliente sem ver a lista
   * antes é o tipo de botão que a gente não constrói.
   */
  const limparBase = useCallback(async (executar: boolean) => {
    if (limpando) return;
    setLimpando(true);
    setError(null);
    try {
      const res = await apiFetch<LimpezaResult>("/logistica/base-saude/limpar", {
        method: "POST",
        body: JSON.stringify(executar ? { executar: true } : {}),
      });
      const total = (res.duplicados?.length || 0) + (res.semEndereco?.length || 0);
      if (!executar) {
        setPrevia(res);
        if (!total) setMensagem("Nada a limpar: todo cadastro sem endereço fechado tem entrega ou rota ativa.");
        return;
      }
      setPrevia(null);
      setMensagem(`${res.apagados} ${res.apagados === 1 ? "cadastro arquivado" : "cadastros arquivados"}. Dá pra restaurar pelo histórico de exclusões.`);
      await load(true);
    } catch (err: unknown) {
      setError(humanError(err, "Não foi possível limpar a base agora."));
    } finally {
      setLimpando(false);
    }
  }, [limpando, load]);

  /**
   * "É o mesmo cliente" — JUNTA os dois cadastros (merge do núcleo), que migra as
   * entregas/telefones/planos pro vencedor e arquiva o perdedor com snapshot. É a
   * saída certa pro par que é a MESMA pessoa cadastrada duas vezes: apagar um deles
   * perderia o histórico dele, e foi por isso que a faxina automática não encosta
   * em quem tem movimento.
   */
  const juntarCadastros = useCallback(async (alvo: BaseSaudeCliente, gemeo: { id: string; nome: string }) => {
    if (juntando) return;
    const nome = alvo.nome || "este cliente";
    if (typeof window !== "undefined"
      && !window.confirm(`Juntar "${nome}" e "${gemeo.nome}" num cadastro só? As entregas e telefones dos dois ficam juntos, e nada é perdido.`)) return;
    setJuntando(true);
    setDetalheError(null);
    try {
      // O MAIS NOVO manda (regra do dono): o gêmeo entra no cliente aberto.
      await apiFetch(`/nucleo/contas/${encodeURIComponent(gemeo.id)}/merge`, {
        method: "POST",
        body: JSON.stringify({ into: alvo.id, motivo: "Mesmo endereço: cadastro repetido" }),
      });
      setMensagem(`"${gemeo.nome}" virou o mesmo cadastro de "${nome}".`);
      setSelecionadoId(alvo.id);
      await load(true);
    } catch (err: unknown) {
      setDetalheError(humanError(err, "Não foi possível juntar os cadastros."));
    } finally {
      setJuntando(false);
    }
  }, [juntando, load]);

  const locais = useMemo(
    () => (detalheAtual?.locais ?? []).filter((local) => local.ativo !== false),
    [detalheAtual],
  );
  const localAtual = locais.find((local) => local.id === localSelecionadoId) ?? null;

  const selecionarLocal = useCallback((id: string) => {
    if (!detalheAtual) return;
    const local = locais.find((item) => item.id === id) ?? null;
    setLocalSelecionadoId(id);
    setDraft(draftDoLocal(detalheAtual, local));
    setMensagem(null);
    setDetalheError(null);
  }, [detalheAtual, locais]);

  const setCampo = useCallback((campo: keyof LocalDraft, valor: string) => {
    setDraft((atual) => atual ? { ...atual, [campo]: valor } : atual);
    setMensagem(null);
  }, []);

  // BUG 04/08 (dono): corrigir o CEP AQUI gravava só o TEXTO — o pino ficava o
  // velho e o semáforo seguia vermelho no APK; no celular, digitar o CEP refaz
  // o pino (lookupClientCep). Espelho do comportamento do aparelho: ViaCEP
  // preenche as partes, o pino velho MORRE (pino errado é pior que pino vazio)
  // e o geocode fail-closed tenta provar um novo. Sem prova → fica sem ponto e
  // a tela mostra "Sem ponto confirmado" (Localizar/posição atual resolvem).
  const cepReqRef = useRef(0);
  const resolverCep = useCallback(async (cepValor: string, numeroAtual: string) => {
    const requestId = ++cepReqRef.current;
    setMensagem("Buscando CEP…");
    setDetalheError(null);
    const end = await buscarCep(cepValor);
    if (requestId !== cepReqRef.current) return;
    if (!end) {
      setMensagem(null);
      setDetalheError("CEP não encontrado. Confira os campos ou use Localizar endereço.");
      return;
    }
    setDraft((atual) => atual ? {
      ...atual,
      endereco: end.logradouro || atual.endereco,
      bairro: end.bairro || atual.bairro,
      cidade: end.cidade || atual.cidade,
      uf: end.uf || atual.uf,
      lat: "",
      lng: "",
      geoFonte: "",
      gpsAccuracy: null,
    } : atual);
    setMensagem("Endereço preenchido pelo CEP. Localizando o ponto…");
    const ponto = await geocodar({
      logradouro: end.logradouro,
      numero: numeroAtual,
      bairro: end.bairro,
      cidade: end.cidade,
      uf: end.uf,
      cep: end.cep,
    });
    if (requestId !== cepReqRef.current) return;
    if (ponto) {
      setDraft((atual) => atual ? {
        ...atual,
        lat: String(ponto.lat),
        lng: String(ponto.lng),
        geoFonte: "geocode",
        gpsAccuracy: null,
      } : atual);
      setMensagem("Ponto localizado pelo CEP. Salve para confirmar a alteração.");
    } else {
      setMensagem("CEP preenchido, mas sem ponto provado — use Localizar endereço ou a posição atual antes de salvar.");
    }
  }, []);

  const localizarPeloEndereco = useCallback(async () => {
    if (!draft) return;
    setLocalizando(true);
    setDetalheError(null);
    try {
      const ponto = await geocodar({
        logradouro: draft.endereco,
        numero: draft.numero,
        bairro: draft.bairro,
        cidade: draft.cidade,
        uf: draft.uf,
        cep: draft.cep,
      });
      if (!ponto) throw new Error("Não achei um ponto confiável. Use a localização atual ou confirme os campos.");
      setDraft((atual) => atual ? {
        ...atual,
        lat: String(ponto.lat),
        lng: String(ponto.lng),
        geoFonte: "geocode",
        gpsAccuracy: null,
      } : atual);
      setMensagem("Ponto localizado. Salve para confirmar a alteração.");
    } catch (err: unknown) {
      setDetalheError(humanError(err, "Não foi possível localizar o endereço."));
    } finally {
      setLocalizando(false);
    }
  }, [draft]);

  const usarPosicaoAtual = useCallback(async () => {
    if (!draft || typeof navigator === "undefined" || !navigator.geolocation) {
      setDetalheError("Localização indisponível neste computador.");
      return;
    }
    setLocalizando(true);
    setDetalheError(null);
    try {
      const posicao = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 0,
        });
      });
      const ponto = { lat: posicao.coords.latitude, lng: posicao.coords.longitude };
      const endereco = await reverseGeocodar(ponto);
      setDraft((atual) => atual ? {
        ...atual,
        ...(endereco ? {
          endereco: endereco.logradouro || atual.endereco,
          numero: endereco.numero || atual.numero,
          bairro: endereco.bairro || atual.bairro,
          cidade: endereco.cidade || atual.cidade,
          uf: endereco.uf || atual.uf,
          cep: endereco.cep || atual.cep,
        } : {}),
        lat: String(ponto.lat),
        lng: String(ponto.lng),
        geoFonte: "gps_cadastro",
        gpsAccuracy: posicao.coords.accuracy,
      } : atual);
      setMensagem("Ponto atual capturado. Salve para confirmar a alteração.");
    } catch {
      setDetalheError("Não consegui obter a localização atual.");
    } finally {
      setLocalizando(false);
    }
  }, [draft]);

  async function salvar() {
    if (!clienteSelecionado || !detalheAtual || !draft || salvando) return;
    if (!draft.endereco.trim() || !draft.cidade.trim() || draft.uf.trim().length !== 2) {
      setDetalheError("Informe endereço, cidade e UF.");
      return;
    }
    setSalvando(true);
    setDetalheError(null);
    setMensagem(null);
    try {
      const payload = payloadDoDraft(draft);
      const salvo = localAtual
        ? await editarLocal(localAtual.id, payload)
        : await criarLocal(clienteSelecionado.id, { ...payload, isPrincipal: true });
      const atualizado = await getCliente(clienteSelecionado.id);
      const locaisAtualizados = (atualizado.locais ?? []).filter((local) => local.ativo !== false);
      const local = locaisAtualizados.find((item) => item.id === salvo.id)
        ?? locaisAtualizados.find((item) => item.isPrincipal)
        ?? locaisAtualizados[0]
        ?? null;
      setDetalhe(atualizado);
      setLocalSelecionadoId(local?.id || "");
      setDraft(draftDoLocal(atualizado, local));
      setMensagem("Endereço salvo.");
      await load(true);
    } catch (err: unknown) {
      setDetalheError(humanError(err, "Não foi possível salvar o endereço."));
    } finally {
      setSalvando(false);
    }
  }

  const trocarFiltro = useCallback((next: Filtro) => {
    setFiltro(next);
    setPagina(0);
    setSelecionadoId(null);
  }, []);

  return (
    <section id="logistica-view-saude" className="log-agenda log-saude hbx-page-mobile-enter" role="tabpanel" aria-labelledby="log-tab-saude">
      {loading && !dados && (
        <div className="log-agenda__surface log-saude__loading">
          <div className="log-agenda__feedback"><strong>Conferindo os endereços…</strong></div>
        </div>
      )}

      {error && !dados && (
        <div className="log-agenda__surface log-saude__loading">
          <div className="log-agenda__feedback is-error">
            <strong>Não carregou</strong>
            <span>{error}</span>
            <button type="button" className="btn-ghost" onClick={() => void load()}>Tentar novamente</button>
          </div>
        </div>
      )}

      {dados && (
        <>
          <header className="log-saude__bar">
            <div className="log-saude__bar-copy">
              <strong>Endereços da operação</strong>
              <small>
                {dados.totalClientes} clientes conferidos
                {dados.resolvemSozinhos > 0 ? ` · ${dados.resolvemSozinhos} confirmam pelo GPS na próxima entrega` : ""}
              </small>
            </div>
            <div className="log-saude__stats" role="list" aria-label="Situação dos endereços">
              <span role="listitem"><b className="is-danger">{dados.vermelhos}</b><small>corrigir</small></span>
              <span role="listitem"><b className="is-warn">{dados.amarelos}</b><small>revisar</small></span>
              <span role="listitem"><b className="is-ok">{dados.verdes}</b><small>prontos</small></span>
            </div>
            <button type="button" className="btn-teal btn-xs" onClick={() => void resolverEnderecos()} disabled={resolvendo || loading}>
              <I d={ICONS.mapin} size={13} />
              {resolvendo
                ? (resolvidoParcial > 0 ? `Resolvendo… ${resolvidoParcial}` : "Resolvendo…")
                : "Resolver endereços"}
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={() => void limparBase(false)} disabled={limpando || resolvendo || loading}>
              <I d={ICONS.trash} size={13} /> {limpando ? "Conferindo…" : "Limpar cadastros mortos"}
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={() => void load()} disabled={loading || resolvendo || limpando}>
              <span aria-hidden>↻</span> {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </header>

          {mensagem && !clienteSelecionado && <p className="log-saude__notice is-ok" role="status">{mensagem}</p>}

          {/* PRÉVIA da faxina: os nomes ANTES de qualquer exclusão (06/08). */}
          {previa && (previa.duplicados.length > 0 || previa.semEndereco.length > 0) && (
            <div className="log-saude__previa" role="group" aria-label="Cadastros que serão arquivados">
              <strong>
                {previa.duplicados.length + previa.semEndereco.length} cadastro(s) sem nenhum movimento — nenhuma entrega, nenhuma rota, nenhuma cobrança
              </strong>
              <ul>
                {[...previa.duplicados, ...previa.semEndereco].map((item) => (
                  <li key={item.id}>
                    <b>{item.nome || "Cliente"}</b>
                    <small>{item.endereco || "sem endereço"} · {item.motivo}</small>
                  </li>
                ))}
              </ul>
              <div className="log-saude__previa-acoes">
                <button type="button" className="btn-ghost btn-xs" onClick={() => setPrevia(null)} disabled={limpando}>Cancelar</button>
                <button type="button" className="btn-teal btn-xs" onClick={() => void limparBase(true)} disabled={limpando}>
                  {limpando ? "Arquivando…" : "Arquivar estes cadastros"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="log-saude__notice is-error" role="status">{error}</p>}

          <div className="log-saude__workspace">
            <section className="log-agenda__surface log-saude__queue" aria-label="Fila de endereços">
              <div className="log-saude__filtro glass-pill-track" role="tablist" aria-label="Filtrar endereços">
                <GlassPill {...filtroPill} />
                {FILTROS.map((item) => (
                  <button
                    key={item.key}
                    ref={filtroPill.itemRef(item.key)}
                    type="button"
                    role="tab"
                    aria-selected={filtro === item.key}
                    className={`log-saude__filtro-tab glass-pill-item${filtro === item.key ? " is-active" : ""}`}
                    onClick={() => trocarFiltro(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="log-saude__search">
                <I d={ICONS.search} size={14} />
                <input
                  value={busca}
                  onChange={(event) => { setBusca(event.target.value); setPagina(0); setSelecionadoId(null); }}
                  placeholder="Buscar cliente, local ou problema"
                />
              </label>

              {clientesDaPagina.length === 0 ? (
                <div className="log-agenda__feedback">
                  <strong>Nada por aqui</strong>
                  <span>Nenhum endereço neste filtro.</span>
                </div>
              ) : (
                <div className="log-saude__lista">
                  {clientesDaPagina.map((cliente) => (
                    <button
                      type="button"
                      className={`log-saude__row${clienteSelecionado?.id === cliente.id ? " is-active" : ""}`}
                      aria-pressed={clienteSelecionado?.id === cliente.id}
                      key={cliente.id}
                      onClick={() => setSelecionadoId(cliente.id)}
                    >
                      <span className={`log-saude__semaforo log-saude__semaforo--${cliente.semaforo}`} aria-hidden />
                      <span className="log-saude__copy">
                        <span className="log-agenda-stop__name hbx-1linha">
                          {cliente.nome || "Cliente"}{cliente.localApelido ? ` · ${cliente.localApelido}` : ""}
                        </span>
                        <span className="log-agenda-import__row-sub hbx-2linhas">
                          {resumoDaLinha(cliente)}{cliente.resolveSozinho ? " · confirma pelo GPS" : ""}
                        </span>
                      </span>
                      <span className="log-saude__chevron" aria-hidden>›</span>
                    </button>
                  ))}
                </div>
              )}

              {clientesFiltrados.length > TAMANHO_PAGINA && (
                <footer className="log-saude__pager">
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    disabled={paginaSegura === 0}
                    onClick={() => { setPagina((atual) => Math.max(0, atual - 1)); setSelecionadoId(null); }}
                  >
                    Anterior
                  </button>
                  <span>{paginaSegura * TAMANHO_PAGINA + 1}–{Math.min((paginaSegura + 1) * TAMANHO_PAGINA, clientesFiltrados.length)} de {clientesFiltrados.length}</span>
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    disabled={paginaSegura >= totalPaginas - 1}
                    onClick={() => { setPagina((atual) => Math.min(totalPaginas - 1, atual + 1)); setSelecionadoId(null); }}
                  >
                    Próxima
                  </button>
                </footer>
              )}
            </section>

            <aside className="log-agenda__surface log-saude__editor" aria-label="Editar endereço selecionado">
              {!clienteSelecionado && (
                <div className="log-agenda__feedback"><strong>Selecione um endereço</strong></div>
              )}

              {clienteSelecionado && detalheLoading && (
                <div className="log-agenda__feedback"><strong>Abrindo {clienteSelecionado.nome || "cliente"}…</strong></div>
              )}

              {clienteSelecionado && !detalheLoading && detalheAtual && draft && (
                <>
                  <header className="log-agenda__head">
                    <div className="log-agenda__head-copy">
                      <h2>{detalheAtual.name || clienteSelecionado.nome || "Cliente"}</h2>
                      <p>{resumoDaLinha(clienteSelecionado)}</p>
                    </div>
                  </header>

                  {locais.length > 1 && (
                    <label className="log-agenda-form__field">
                      <span>Local de entrega</span>
                      <select className="field-dark" value={localSelecionadoId} onChange={(event) => selecionarLocal(event.target.value)}>
                        {locais.map((local) => (
                          <option value={local.id} key={local.id}>
                            {nomeDoLocal(local)}{local.isPrincipal ? " · principal" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="log-saude__editor-scroll">
                    {/* O QUE ESTÁ ERRADO, item a item — dentro da área que já rola
                        (o grid do editor tem linhas fixas; filho novo lá fora
                        desalinharia a linha flexível e cortaria os botões). */}
                    {clienteSelecionado.motivos.length > 0 && (
                      <ul className="log-saude__pendencias" aria-label="O que está errado neste endereço">
                        {[...clienteSelecionado.motivos]
                          .sort((a, b) => Number(MOTIVOS_CORRIGIR.includes(b)) - Number(MOTIVOS_CORRIGIR.includes(a)))
                          .map((motivo) => (
                            <li
                              key={motivo}
                              className={`log-saude__pendencia${MOTIVOS_CORRIGIR.includes(motivo) ? " is-corrigir" : " is-aviso"}`}
                            >
                              <b>{tituloDoMotivo(motivo, clienteSelecionado)}</b>
                              {MOTIVO_AJUDA[motivo] ? <small>{MOTIVO_AJUDA[motivo]}</small> : null}
                              {/* AS DUAS SAÍDAS (06/08): o sistema não pode escolher
                                  entre "é apartamento" e "é o mesmo cliente" — mas o
                                  dono escolhe em 1 clique, sem caçar o gêmeo na mão. */}
                              {motivo === "endereco_repetido" && (clienteSelecionado.mesmaPortaCom ?? []).length > 0 && (
                                <span className="log-saude__pendencia-acoes">
                                  <button
                                    type="button"
                                    className="btn-ghost btn-xs"
                                    onClick={() => complementoRef.current?.focus()}
                                    disabled={juntando}
                                  >
                                    É outro apartamento
                                  </button>
                                  {(clienteSelecionado.mesmaPortaCom ?? []).map((gemeo) => (
                                    <button
                                      key={gemeo.id}
                                      type="button"
                                      className="btn-ghost btn-xs"
                                      onClick={() => void juntarCadastros(clienteSelecionado, gemeo)}
                                      disabled={juntando}
                                    >
                                      {juntando ? "Juntando…" : `É o mesmo cliente que ${gemeo.nome} — juntar`}
                                    </button>
                                  ))}
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                    )}

                    <div className="log-saude__fields">
                      <label className="log-agenda-form__field log-saude__field-wide">
                        <span>Nome do local</span>
                        <input className="field-dark" value={draft.apelido} onChange={(event) => setCampo("apelido", event.target.value)} placeholder="Casa, loja, depósito…" />
                      </label>
                      <label className="log-agenda-form__field log-saude__field-wide">
                        <span>Endereço</span>
                        <input className="field-dark" value={draft.endereco} onChange={(event) => setCampo("endereco", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Número</span>
                        <input className="field-dark" value={draft.numero} onChange={(event) => setCampo("numero", event.target.value)} />
                      </label>
                      {/* 06/08 (dono): é aqui que se responde "é apartamento?" —
                          sem este campo, dois vizinhos de prédio ficavam
                          indistinguíveis e o condomínio inteiro virava defeito. */}
                      <label className="log-agenda-form__field">
                        <span>Complemento</span>
                        <input
                          ref={complementoRef}
                          className="field-dark"
                          value={draft.complemento}
                          onChange={(event) => setCampo("complemento", event.target.value)}
                          placeholder="Apto, bloco, sala…"
                        />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Bairro</span>
                        <input className="field-dark" value={draft.bairro} onChange={(event) => setCampo("bairro", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>Cidade</span>
                        <input className="field-dark" value={draft.cidade} onChange={(event) => setCampo("cidade", event.target.value)} />
                      </label>
                      <label className="log-agenda-form__field">
                        <span>UF</span>
                        <input className="field-dark" maxLength={2} value={draft.uf} onChange={(event) => setCampo("uf", event.target.value.toUpperCase())} />
                      </label>
                      <label className="log-agenda-form__field log-saude__field-wide">
                        <span>CEP</span>
                        <input
                          className="field-dark"
                          inputMode="numeric"
                          value={draft.cep}
                          onChange={(event) => {
                            const f = formatarCep(event.target.value);
                            const antes = soDigitos(draft.cep);
                            setCampo("cep", f);
                            // Mesmo gatilho do APK: CEP completo E diferente do que estava → refaz o pino.
                            if (soDigitos(f).length === 8 && soDigitos(f) !== antes) void resolverCep(f, draft.numero);
                          }}
                        />
                      </label>
                    </div>

                    <div className="log-saude__point">
                      <span className="log-saude__point-icon" aria-hidden><I d={ICONS.mapin} size={16} /></span>
                      <span>
                        <b>{draft.lat && draft.lng ? "Ponto definido" : "Sem ponto confirmado"}</b>
                        <small>
                          {draft.lat && draft.lng
                            ? `${Number(draft.lat).toFixed(5)}, ${Number(draft.lng).toFixed(5)} · ${draft.geoFonte === "gps_cadastro" ? "GPS" : "endereço"}`
                            : "Localize pelo endereço ou use a posição atual."}
                        </small>
                      </span>
                    </div>
                  </div>

                  {detalheError && <p className="log-saude__notice is-error" role="alert">{detalheError}</p>}
                  {mensagem && <p className="log-saude__notice is-ok" role="status">{mensagem}</p>}

                  <footer className="log-saude__editor-actions">
                    <button type="button" className="btn-ghost btn-xs" onClick={() => void localizarPeloEndereco()} disabled={localizando || salvando}>
                      <I d={ICONS.search} size={13} /> Localizar endereço
                    </button>
                    <button type="button" className="btn-ghost btn-xs" onClick={() => void usarPosicaoAtual()} disabled={localizando || salvando}>
                      <I d={ICONS.mapin} size={13} /> Usar posição atual
                    </button>
                    <button type="button" className="btn-teal" onClick={() => void salvar()} disabled={salvando || localizando}>
                      <I d={ICONS.check} size={14} /> {salvando ? "Salvando…" : localAtual ? "Salvar endereço" : "Criar local"}
                    </button>
                  </footer>
                </>
              )}

              {clienteSelecionado && !detalheLoading && detalheError && !detalheAtual && (
                <div className="log-agenda__feedback is-error">
                  <strong>Não abriu o endereço</strong>
                  <span>{detalheError}</span>
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
