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
// 🔴 O TABULEIRO NÃO FOI REESCRITO: `RouteBoard` continua desenhando as faixas
// e o arrasto (mesmo PATCH de sempre). Ele foi RE-EMOLDURADO. Reescrever
// jogaria fora a régua de `rotaOrdem` e o drop na faixa órfã, que já custaram
// bug pra ficar certos.
// ============================================================================

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

import {
  atribuirLote,
  fraseDaMissao,
  fraseDoAviso,
  getMissoes,
  getRecadosNaoLidos,
  type LinhaDoFeed,
  type MissaoIndicada,
  type RotaAviso,
} from "./cockpit-api";
import { CockpitElenco, montarLinha } from "./cockpit-elenco";
import { CockpitInspetor, type FarolEstado } from "./cockpit-inspetor";
import { RouteBoard, type BoardEntregador, type BoardStop } from "./route-board";
import {
  getTrackingHistory,
  getTrackingLive,
  type TrackingHistoryResponse,
  type TrackingLiveResponse,
} from "./rastreamento/tracking-live-api";

const TrackingLiveMap = dynamic(
  () => import("./rastreamento/TrackingLiveMap").then((m) => m.TrackingLiveMap),
  { ssr: false },
);

type Palco = "dividido" | "mapa" | "tabuleiro";

/** Recomendação do fable, aceita pelo dono: Dividido é o default. */
const PALCO_PADRAO: Palco = "dividido";
const TICK_AVISOS_MS = 60_000;
const TICK_MAPA_MS = 20_000;

export type CockpitEntrega = BoardStop & {
  cliente: BoardStop["cliente"] & { nome: string | null };
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
  abas,
  menu,
  onRecarregar,
  onAbrirParada,
  onMontarRota,
  onParadaAvulsa,
  onAtribuido,
}: {
  stops: CockpitEntrega[];
  drivers: BoardEntregador[];
  entreguesHoje: number;
  aReceber: number;
  carregando: boolean;
  atualizadoEm: Date | null;
  /** Hoje/Semana/Saúde — entram no MESMO topo: duas barras seriam a pilha de volta. */
  abas?: React.ReactNode;
  /** O "⋯": estoque, importar, regras, app, gerar entregas, fechar mês. */
  menu?: React.ReactNode;
  onRecarregar: () => void;
  onAbrirParada: (stop: BoardStop) => void;
  onMontarRota: () => void;
  onParadaAvulsa: () => void;
  onAtribuido: (stopId: string, entregador: BoardEntregador | null) => void;
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

  // ── Avisos (vigia + sentinela) e não-lidos: o pulso do cockpit ───────────
  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      apiFetch<RotaAviso[]>("/logistica/rota-avisos")
        .then((linhas) => { if (vivo) setAvisos(Array.isArray(linhas) ? linhas : []); })
        .catch(() => { /* acessório: rede fora não derruba a tela */ });
      getMissoes()
        .then((linhas) => { if (vivo) setMissoes(Array.isArray(linhas) ? linhas : []); })
        .catch(() => { /* idem */ });
      getRecadosNaoLidos()
        .then((mapa) => { if (vivo) setNaoLidos(mapa || {}); })
        .catch(() => { /* idem */ });
    };
    carregar();
    const timer = setInterval(carregar, TICK_AVISOS_MS);
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
   * "Dar todas para…" — o que mata as 51 arrastadas da tela do dono.
   * Pergunta quem pelo mesmo `prompt` simples do resto do módulo: um seletor
   * bonito aqui seria a 4ª forma de escolher motorista na mesma tela.
   */
  const darTodasPara = useCallback(() => {
    if (typeof window === "undefined" || !orfas.length) return;
    if (!drivers.length) { setErro("Ninguém com capacidade de entrega pra receber as paradas."); return; }
    const menu = drivers.map((d, i) => `${i + 1}) ${d.nome || d.email || `Motorista ${d.id}`}`).join("\n");
    const escolha = window.prompt(`Dar as ${orfas.length} paradas sem dono para quem?\n\n${menu}\n\nDigite o número:`);
    if (escolha === null) return;
    const indice = Math.trunc(Number(escolha.trim())) - 1;
    const alvo = drivers[indice];
    if (!alvo) { setErro("Número inválido — ninguém foi escolhido."); return; }
    setErro(null);
    atribuirLote(orfas.map((s) => s.id), alvo.id)
      .then((res) => {
        onRecarregar();
        if (res.ignoradas > 0) {
          setErro(`${res.atribuidas} atribuída(s). ${res.ignoradas} ficaram de fora (já concluídas ou canceladas).`);
        }
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível atribuir as paradas."));
  }, [drivers, onRecarregar, orfas]);

  /** ⇄ do inspetor: passa UMA parada pra outra pessoa. */
  const trocarDono = useCallback((stop: BoardStop) => {
    if (typeof window === "undefined") return;
    const outros = drivers.filter((d) => d.id !== Number(stop.entregador?.id));
    if (!outros.length) { setErro("Não há outro motorista pra receber esta parada."); return; }
    const menu = outros.map((d, i) => `${i + 1}) ${d.nome || d.email || `Motorista ${d.id}`}`).join("\n");
    const escolha = window.prompt(`Passar ${stop.cliente.nome || "esta parada"} para quem?\n\n${menu}\n\nDigite o número:`);
    if (escolha === null) return;
    const alvo = outros[Math.trunc(Number(escolha.trim())) - 1];
    if (!alvo) { setErro("Número inválido — ninguém foi escolhido."); return; }
    setErro(null);
    atribuirLote([stop.id], alvo.id)
      .then(() => onRecarregar())
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível trocar o motorista."));
  }, [drivers, onRecarregar]);

  const dispensarAviso = useCallback((id: string) => {
    setAvisos((atual) => atual.filter((a) => a.id !== id));
    apiFetch(`/logistica/rota-avisos/${encodeURIComponent(id)}/visto`, { method: "POST", body: JSON.stringify({}) })
      .catch(() => { /* se falhar, o aviso volta no próximo tick */ });
  }, []);

  const abrirMotorista = useCallback((motorista: BoardEntregador) => {
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

        {abas}

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
        onDarTodas={darTodasPara}
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
              ? "posição ao vivo de quem está com rota rastreada"
              : "arraste uma parada pra trocar de motorista"}
          </span>
          {erro && <span className="cok__palco-dica" role="status">{erro}</span>}
        </div>

        <div className={`cok__mapa${palco === "tabuleiro" ? " is-oculto" : ""}`}>
          {rotaDele || (live?.routes ?? []).length > 0 ? (
            <TrackingLiveMap
              sessionId={rotaDele?.sessionId || "cockpit"}
              driverName={motoristaAtivo?.nome || "Operação"}
              points={trilhaEmFoco?.points ?? []}
              currentPosition={rotaDele?.lastPosition ?? null}
            />
          ) : (
            <div className="cok__vazio">
              <I d={ICONS.mapin} size={20} />
              <strong>Ninguém emitindo posição agora</strong>
              <span>
                Só rota no modo Rastreada manda GPS. O modo trava no dia — trocar agora vale da próxima.
              </span>
              <Link href="/logistica/config" className="btn-ghost btn-xs">Ver regras</Link>
            </div>
          )}
        </div>

        <div className={`cok__faixas${palco === "mapa" ? " is-oculto" : ""}`}>
          <RouteBoard
            stops={stops}
            drivers={drivers}
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
          onMudou={onRecarregar}
        />
      )}
    </div>
  );
}
