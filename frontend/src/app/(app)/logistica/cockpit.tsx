"use client";

// ============================================================================
// COCKPIT DA LOGÍSTICA (03/08, ordem do dono: "refaça esse painel inteiro").
//
// A tela anterior era uma PILHA vertical de 7 cartões no mesmo volume, com
// texto de manual dentro e um painel direito MUDO. Nada do DADO estava errado —
// a hierarquia estava. Aqui vira 1 PALCO, 1 ELENCO, 1 INSPETOR.
//
// O QUE MUDOU DE LUGAR (nada foi jogado fora — tudo tem moradia nova):
//   · banner de rota negada/devolvida  → feed do sino
//   · banner de rota abandonada/parada → feed do sino (+ sentinela nova)
//   · "Missões enviadas"               → feed do sino
//   · "Precisa de você" (triagem)      → feed do sino
//   · resumo do dia + créditos         → 4 KPIs do topo e o menu "⋯"
//   · "Fechar mês"                     → menu "⋯" (ação MENSAL não mora na
//                                        tela do DIA)
//   · /logistica/rastreamento          → aba "Mapa"/"Dividido" do palco
//   · painel direito de leitura        → inspetor com MÃOS (cancelar, trocar,
//                                        recado)
//
// 🔴 03/08, segunda passada — O PALCO FOI REESCRITO. A primeira versão deste
// arquivo re-emoldurava o `RouteBoard` velho e eu ainda documentei isso como
// virtude; o dono cobrou ("só realocou as coisas... eu pedi para não usar a
// base") e ele tinha razão. O tabuleiro agora é próprio (`cockpit-tabuleiro`,
// com seleção múltipla), o mapa é próprio (`cockpit-mapa`, pinos numerados +
// trilha + chip de sem-ponto) e o trilho de módulos colapsa sozinho ao entrar.
// As 3 regras que custaram bug foram COPIADAS pro código novo, não herdadas
// por import: eixo = rotaOrdem, drop na órfã desatribui, sem ordem = "—".
// ============================================================================

import dynamic from "next/dynamic";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

import {
  atribuirLote,
  cancelarEntrega,
  fraseDaMissao,
  fraseDoAviso,
  getMissoes,
  getRecadosNaoLidos,
  type Entregador,
  type LinhaDoFeed,
  type MissaoIndicada,
  type Parada,
  type RotaAviso,
} from "./cockpit-api";
import { CockpitElenco, montarLinha } from "./cockpit-elenco";
import { FolhaCancelarParada, FolhaEscolherMotorista, FolhaRecadoTodos } from "./cockpit-folhas";
import { CockpitInspetor, type FarolEstado } from "./cockpit-inspetor";
import { CockpitTabuleiro } from "./cockpit-tabuleiro";
import {
  getTrackingHistory,
  getTrackingLive,
  type TrackingHistoryResponse,
  type TrackingLiveResponse,
} from "./rastreamento/tracking-live-api";

// O mapa importa maplibre no topo do módulo — só existe no navegador.
const CockpitMapa = dynamic(
  () => import("./cockpit-mapa").then((m) => m.CockpitMapa),
  { ssr: false },
);

type Palco = "dividido" | "mapa" | "tabuleiro";

/** Recomendação do fable, aceita pelo dono: Dividido é o default. */
const PALCO_PADRAO: Palco = "dividido";
const TICK_AVISOS_MS = 60_000;
const TICK_RECADOS_MS = 3_000;
const TICK_MAPA_MS = 20_000;

export type CockpitEntrega = Parada & {
  cliente: Parada["cliente"] & { nome: string | null };
};

function fmtMoeda(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

export function Cockpit({
  stops,
  drivers,
  entreguesHoje,
  aReceber,
  carregando,
  atualizadoEm,
  menu,
  onRecarregar,
  onAbrirParada,
  onMontarRota,
  onParadaAvulsa,
  onAtribuido,
}: {
  stops: CockpitEntrega[];
  drivers: Entregador[];
  entreguesHoje: number;
  aReceber: number;
  carregando: boolean;
  atualizadoEm: Date | null;
  /** O "⋯": estoque, importar, regras, app, gerar entregas, fechar mês. */
  menu?: React.ReactNode;
  onRecarregar: () => void;
  onAbrirParada: (stop: Parada) => void;
  onMontarRota: () => void;
  onParadaAvulsa: () => void;
  onAtribuido: (stopId: string, entregador: Entregador | null) => void;
}) {
  const [palco, setPalco] = useState<Palco>(PALCO_PADRAO);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [avisos, setAvisos] = useState<RotaAviso[]>([]);
  const [missoes, setMissoes] = useState<MissaoIndicada[]>([]);
  const [naoLidos, setNaoLidos] = useState<Record<string, number>>({});
  const [sinoAberto, setSinoAberto] = useState(false);
  const [live, setLive] = useState<TrackingLiveResponse | null>(null);
  const [trilha, setTrilha] = useState<TrackingHistoryResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const sinoRef = useRef<HTMLSpanElement | null>(null);

  const palcoPill = useGlassPill<HTMLButtonElement>(palco, true);

  // ── Avisos (vigia + sentinela): pulso lento do cockpit ──────────────────
  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      apiFetch<RotaAviso[]>("/logistica/rota-avisos")
        .then((linhas) => { if (vivo) setAvisos(Array.isArray(linhas) ? linhas : []); })
        .catch(() => { /* acessório: rede fora não derruba a tela */ });
      getMissoes()
        .then((linhas) => { if (vivo) setMissoes(Array.isArray(linhas) ? linhas : []); })
        .catch(() => { /* idem */ });
    };
    carregar();
    const timer = setInterval(carregar, TICK_AVISOS_MS);
    return () => { vivo = false; clearInterval(timer); };
  }, []);

  // Resposta do motorista é conversa: o badge não pode esperar o relógio de
  // avisos/rotas (60 s). O fio aberto usa 2 s; o elenco fechado percebe em 3 s.
  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      getRecadosNaoLidos()
        .then((mapa) => { if (vivo) setNaoLidos(mapa || {}); })
        .catch(() => { /* rede fora: mantém o último badge conhecido */ });
    };
    carregar();
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") carregar();
    }, TICK_RECADOS_MS);
    return () => { vivo = false; clearInterval(timer); };
  }, []);

  // ── Mapa ao vivo: só busca quando o palco mostra mapa (a página de
  // rastreamento morreu, mas o custo dela não pode vir junto de graça). ────
  const precisaDeMapa = palco === "dividido" || palco === "mapa";
  useEffect(() => {
    if (!precisaDeMapa) return undefined;
    let vivo = true;
    const carregar = () => {
      getTrackingLive()
        .then((res) => { if (vivo) setLive(res); })
        .catch(() => { /* mapa é acessório: a operação segue pelas faixas */ });
    };
    carregar();
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") carregar();
    }, TICK_MAPA_MS);
    return () => { vivo = false; clearInterval(timer); };
  }, [precisaDeMapa]);

  // Fecha o sino ao clicar fora — pop-up que não fecha sozinho vira estorvo.
  useEffect(() => {
    if (!sinoAberto) return undefined;
    const fora = (ev: MouseEvent) => {
      if (sinoRef.current && !sinoRef.current.contains(ev.target as Node)) setSinoAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [sinoAberto]);

  // ── Derivados ────────────────────────────────────────────────────────────
  const abertas = stops.filter((s) => s.status === "agendada" || s.status === "em_rota");
  const orfas = abertas.filter((s) => !s.entregador?.id);

  const linhas = useMemo(
    () => drivers.map((driver) => montarLinha(driver, stops, avisos, Number(naoLidos[String(driver.id)] || 0))),
    [avisos, drivers, naoLidos, stops],
  );

  /**
   * O FEED — uma lista só, ordenada por gravidade. Os três banners empilhados
   * e o painel "Missões enviadas" viravam quatro caixas competindo pelo mesmo
   * olhar; aqui é uma pergunta ("o que precisa de mim?") com uma resposta.
   */
  const feed = useMemo<LinhaDoFeed[]>(() => {
    const doVigia: LinhaDoFeed[] = avisos.map((aviso) => {
      const frase = fraseDoAviso(aviso);
      return {
        chave: `aviso:${aviso.id}`,
        titulo: frase.titulo,
        detalhe: frase.detalhe,
        grave: frase.grave,
        dispensavelId: aviso.id,
      };
    });
    const dasMissoes = missoes
      .map(fraseDaMissao)
      .filter((linha): linha is LinhaDoFeed => linha !== null);
    // Grave primeiro: quem sumiu do mapa não pode ficar abaixo de "aceitou a rota".
    return [...doVigia, ...dasMissoes].sort((a, b) => Number(b.grave) - Number(a.grave));
  }, [avisos, missoes]);

  const motoristaAtivo = selecionado == null
    ? null
    : drivers.find((d) => d.id === selecionado)
      ?? stops.find((s) => s.entregador?.id === selecionado)?.entregador
      ?? null;

  const linhaAtiva = linhas.find((l) => l.motorista.id === selecionado) ?? null;
  const paradasDele = motoristaAtivo
    ? stops.filter((s) => Number(s.entregador?.id) === motoristaAtivo.id)
    : [];

  // Sessão de rastreamento da pessoa aberta no inspetor (pra "onde está").
  const rotaDele = motoristaAtivo
    ? (live?.routes ?? []).find((r) => r.driver.id === motoristaAtivo.id) ?? null
    : null;

  // A trilha só do selecionado — o mapa desenha o caminho de quem está em foco.
  const sessaoEmFoco = precisaDeMapa ? rotaDele?.sessionId ?? null : null;
  useEffect(() => {
    if (!sessaoEmFoco) return undefined;
    let vivo = true;
    getTrackingHistory(sessaoEmFoco)
      .then((res) => { if (vivo) setTrilha(res); })
      .catch(() => { /* trilha é enfeite do mapa: o pino atual já basta */ });
    return () => { vivo = false; };
  }, [sessaoEmFoco]);

  // A trilha guardada só vale se for DESTA sessão. Casar na leitura (em vez de
  // limpar o estado quando a seleção muda) evita o piscar do mapa e o setState
  // dentro do efeito — é o mesmo padrão que /rastreamento já usava.
  const trilhaEmFoco = trilha && sessaoEmFoco && trilha.sessionId === sessaoEmFoco ? trilha : null;

  const ondeEstaEle = rotaDele?.lastPosition
    ? `${rotaDele.lastPosition.latitude.toFixed(5)}, ${rotaDele.lastPosition.longitude.toFixed(5)} · ${new Date(
        rotaDele.lastPosition.capturedAt,
      ).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : null;

  // ── Ações ────────────────────────────────────────────────────────────────
  /**
   * A folha de escolher motorista serve aos DOIS gestos — atribuir as órfãs
   * em lote e passar UMA parada. `alvo` guarda qual deles está aberto: null =
   * folha fechada; `"orfas"` = o lote; um stop = aquela parada.
   *
   * 🔴 Diálogo nativo (`window.prompt`) NÃO entra aqui: é caixa do sistema
   * operacional, ignora a pele, o modo escuro e a régua de letra. Lei nº2 —
   * pop-up é sempre pela central (`.hbx-veil` + `.hbx-modal`).
   */
  const [alvoDaAtribuicao, setAlvoDaAtribuicao] = useState<"orfas" | "selecao" | Parada | null>(null);
  const [paradaPraCancelar, setParadaPraCancelar] = useState<Parada | null>(null);
  const [recadoTodosAberto, setRecadoTodosAberto] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  // ── SELEÇÃO MÚLTIPLA (mock, item que faltava) ────────────────────────────
  // A bolinha de cada tira marca; a barra "N selecionadas" age. O conjunto
  // guarda ids, mas quem vale é a INTERSEÇÃO com as paradas abertas de agora —
  // uma parada que foi entregue no meio tempo sai do lote sozinha, sem estado
  // fantasma pra limpar.
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const selecaoViva = useMemo(
    () => abertas.filter((s) => selecionadas.has(s.id)).map((s) => s.id),
    [abertas, selecionadas],
  );
  const toggleSelecao = useCallback((id: string) => {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }, []);
  const limparSelecao = useCallback(() => setSelecionadas(new Set()), []);

  const abrirAtribuicaoDasOrfas = useCallback(() => {
    if (!orfas.length) return;
    setErro(null);
    setAlvoDaAtribuicao("orfas");
  }, [orfas.length]);

  const trocarDono = useCallback((stop: Parada) => {
    setErro(null);
    setAlvoDaAtribuicao(stop);
  }, []);

  /** Aplica a escolha da folha: órfãs, seleção da barra, ou a parada única. */
  const aplicarAtribuicao = useCallback((motorista: Entregador) => {
    const alvo = alvoDaAtribuicao;
    if (!alvo || aplicando) return;
    const ids = alvo === "orfas"
      ? orfas.map((s) => s.id)
      : alvo === "selecao"
        ? selecaoViva
        : [alvo.id];
    if (!ids.length) { setAlvoDaAtribuicao(null); return; }
    setAplicando(true);
    setErro(null);
    atribuirLote(ids, motorista.id)
      .then((res) => {
        setAlvoDaAtribuicao(null);
        if (alvo === "selecao") limparSelecao();
        onRecarregar();
        if (res.ignoradas > 0) {
          setErro(`${res.atribuidas} atribuída(s). ${res.ignoradas} ficaram de fora (já concluídas ou canceladas).`);
        }
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível atribuir."))
      .finally(() => setAplicando(false));
  }, [alvoDaAtribuicao, aplicando, limparSelecao, onRecarregar, orfas, selecaoViva]);

  /** Quem pode receber: em lote é todo mundo; pra UMA parada, todos menos o dono atual. */
  const candidatos = alvoDaAtribuicao && alvoDaAtribuicao !== "orfas" && alvoDaAtribuicao !== "selecao"
    ? drivers.filter((d) => d.id !== Number((alvoDaAtribuicao as Parada).entregador?.id))
    : drivers;

  const dispensarAviso = useCallback((id: string) => {
    setAvisos((atual) => atual.filter((a) => a.id !== id));
    apiFetch(`/logistica/rota-avisos/${encodeURIComponent(id)}/visto`, { method: "POST", body: JSON.stringify({}) })
      .catch(() => { /* se falhar, o aviso volta no próximo tick */ });
  }, []);

  const abrirMotorista = useCallback((motorista: Entregador) => {
    setSelecionado((atual) => (atual === motorista.id ? null : motorista.id));
  }, []);

  const farolAtivo: FarolEstado = linhaAtiva?.farol ?? "ok";

  return (
    <div className={`cok${motoristaAtivo ? " tem-inspetor" : ""}`}>
      {/* ── TOPO ───────────────────────────────────────────────────────── */}
      <header className="cok__topo">
        <span className="cok__quem">
          <b>Operação</b>
          <small>
            {atualizadoEm
              ? `atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : carregando ? "sincronizando…" : "sem leitura"}
          </small>
        </span>

        <div className="cok__kpis" role="list" aria-label="Números do dia">
          <div className="cok__kpi" role="listitem">
            <b>{entreguesHoje}</b>
            <span>entregues</span>
          </div>
          <div className="cok__kpi" role="listitem">
            <b>{abertas.length}</b>
            <span>abertas</span>
          </div>
          {orfas.length > 0 && (
            <div className="cok__kpi is-alerta" role="listitem">
              <b>{orfas.length}</b>
              <span>sem dono</span>
            </div>
          )}
          <div className="cok__kpi is-dinheiro" role="listitem">
            <b>{fmtMoeda(aReceber)}</b>
            <span>a receber</span>
          </div>
        </div>

        <span className="cok__sino" ref={sinoRef}>
          <button
            type="button"
            className="btn-ghost btn-xs"
            aria-label={feed.length ? `${feed.length} aviso(s)` : "Avisos"}
            aria-expanded={sinoAberto}
            onClick={() => setSinoAberto((v) => !v)}
          >
            <I d={ICONS.bell} size={15} />
            {feed.length > 0 && <span className="cok__sino-bolha">{feed.length}</span>}
          </button>

          {sinoAberto && (
            <div className="cok__avisos" role="status">
              <span className="cok__avisos-titulo">Avisos de hoje</span>
              {feed.length === 0 && <p className="cok__avisos-vazio">Nada travando o dia agora.</p>}
              {feed.map((linha) => (
                <div className={`cok-aviso ${linha.grave ? "is-grave" : "is-atencao"}`} key={linha.chave}>
                  <i className="cok-aviso__pino" aria-hidden />
                  <span className="cok-aviso__corpo">
                    <b>{linha.titulo}</b>
                    {linha.detalhe && <span>{linha.detalhe}</span>}
                  </span>
                  {linha.dispensavelId && (
                    <button
                      type="button"
                      className="cok-aviso__x"
                      aria-label="Dispensar aviso"
                      onClick={() => dispensarAviso(linha.dispensavelId as string)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <span className="cok__avisos-rodape">
                Missão some sozinha quando a pessoa responde. Aviso dispensado fica no histórico.
              </span>
            </div>
          )}
        </span>

        <button
          type="button"
          className="btn-ghost btn-xs"
          onClick={onRecarregar}
          disabled={carregando}
          aria-label="Atualizar"
          title="Atualizar"
        >
          <span aria-hidden>↻</span>
        </button>

        {/* F3 — o broadcast que o backend já sabia fazer e não tinha botão. */}
        {drivers.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-xs"
            onClick={() => setRecadoTodosAberto(true)}
            title="Recado pra todos na rua"
          >
            <I d={ICONS.bell} size={13} /> Recado a todos
          </button>
        )}

        <button type="button" className="btn-teal btn-xs" onClick={onMontarRota}>
          <I d={ICONS.logistica} size={13} /> Montar rota
        </button>

        {menu}
      </header>

      {/* ── ELENCO ─────────────────────────────────────────────────────── */}
      <CockpitElenco
        linhas={linhas}
        selecionado={selecionado}
        orfas={orfas.length}
        onSelecionar={abrirMotorista}
        onAtribuirTodas={abrirAtribuicaoDasOrfas}
        onParadaAvulsa={onParadaAvulsa}
      />

      {/* ── PALCO ──────────────────────────────────────────────────────── */}
      <section className="cok__palco" aria-label="Operação de hoje">
        <div className="cok__palco-topo">
          <div className="glass-pill-track" role="tablist" aria-label="Visão do palco">
            <GlassPill {...palcoPill} />
            {(["dividido", "mapa", "tabuleiro"] as Palco[]).map((chave) => (
              <button
                key={chave}
                ref={palcoPill.itemRef(chave)}
                type="button"
                role="tab"
                aria-selected={palco === chave}
                tabIndex={palco === chave ? 0 : -1}
                className={`glass-pill-item log-guide__tab${palco === chave ? " is-active" : ""}`}
                onClick={() => setPalco(chave)}
              >
                {chave === "dividido" ? "Dividido" : chave === "mapa" ? "Mapa" : "Tabuleiro"}
              </button>
            ))}
          </div>
          <span className="cok__palco-dica">
            {palco === "mapa"
              ? "toque num pino abre a parada"
              : "arraste uma tira ou marque várias e atribua de uma vez"}
          </span>
          {erro && <span className="cok__palco-dica" role="status">{erro}</span>}

          {/* A barra da SELEÇÃO — só existe com algo marcado. */}
          {selecaoViva.length > 0 && (
            <span className="cok__selecao" role="status">
              {selecaoViva.length} selecionada(s)
              <button
                type="button"
                className="btn-teal btn-xs"
                onClick={() => { setErro(null); setAlvoDaAtribuicao("selecao"); }}
              >
                Atribuir para…
              </button>
              <button type="button" className="cok__selecao-x" aria-label="Limpar seleção" onClick={limparSelecao}>×</button>
            </span>
          )}
        </div>

        <div className={`cok__mapa${palco === "tabuleiro" ? " is-oculto" : ""}`}>
          <CockpitMapa
            stops={stops}
            liveRoutes={live?.routes ?? []}
            trilha={trilhaEmFoco?.points ?? []}
            selecionadoId={selecionado}
            onOpenStop={(id) => {
              const stop = stops.find((s) => s.id === id);
              if (stop) onAbrirParada(stop);
            }}
          />
        </div>

        <div className={`cok__faixas${palco === "mapa" ? " is-oculto" : ""}`}>
          <CockpitTabuleiro
            stops={stops}
            drivers={drivers}
            selecionadas={selecionadas}
            onToggleSelecao={toggleSelecao}
            onOpen={onAbrirParada}
            onDriverSelect={abrirMotorista}
            onAssigned={onAtribuido}
          />
        </div>
      </section>

      {/* ── INSPETOR ───────────────────────────────────────────────────── */}
      {motoristaAtivo && (
        <CockpitInspetor
          /* `key` REMONTA ao trocar de pessoa: o fio de recados nasce vazio
             sem precisar limpar estado dentro de efeito. */
          key={motoristaAtivo.id}
          motorista={motoristaAtivo}
          paradas={paradasDele}
          farol={farolAtivo}
          situacao={linhaAtiva?.situacao || "Sem rota hoje"}
          onde={ondeEstaEle}
          onFechar={() => setSelecionado(null)}
          onTrocarDono={trocarDono}
          onCancelarParada={setParadaPraCancelar}
        />
      )}

      {/* ── FOLHAS (Lei nº2: pop-up é sempre pela central) ──────────────── */}
      {alvoDaAtribuicao && (
        <FolhaEscolherMotorista
          titulo="Atribuir para qual motorista?"
          descricao={
            alvoDaAtribuicao === "orfas"
              ? `${orfas.length} parada(s) sem motorista vão para quem você escolher.`
              : alvoDaAtribuicao === "selecao"
                ? `${selecaoViva.length} parada(s) marcada(s) vão para quem você escolher.`
                : `${(alvoDaAtribuicao as Parada).cliente.nome || "Esta parada"} passa para quem você escolher.`
          }
          motoristas={candidatos}
          ocupado={aplicando}
          onEscolher={aplicarAtribuicao}
          onFechar={() => setAlvoDaAtribuicao(null)}
        />
      )}

      {recadoTodosAberto && (
        <FolhaRecadoTodos
          onFechar={() => setRecadoTodosAberto(false)}
          onEnviado={(mensagem) => {
            setRecadoTodosAberto(false);
            setErro(mensagem);
          }}
        />
      )}

      {paradaPraCancelar && (
        <FolhaCancelarParada
          clienteNome={paradaPraCancelar.cliente.nome || "Este cliente"}
          ocupado={aplicando}
          onFechar={() => setParadaPraCancelar(null)}
          onConfirmar={(motivo) => {
            setAplicando(true);
            setErro(null);
            cancelarEntrega(paradaPraCancelar.id, motivo)
              .then(() => { setParadaPraCancelar(null); onRecarregar(); })
              .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível cancelar a parada."))
              .finally(() => setAplicando(false));
          }}
        />
      )}
    </div>
  );
}
