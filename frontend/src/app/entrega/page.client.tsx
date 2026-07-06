"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CascaLoading, toggleCascaFullscreen } from "@/components/casca";
import { getToken } from "@/lib/api";

import { ArrivalSheet } from "./ArrivalSheet";
import { EntregaScaffold } from "./EntregaScaffold";
import { GestaoDia } from "./GestaoDia";
import { I, ICON_PATHS } from "./icons";
import { Onboarding, jaViuOnboarding } from "./Onboarding";
import {
  cancelarEntrega,
  enderecoCurto,
  getRota,
  hhmm,
  iniciarRota,
  mapsHref,
  paradasAbertas,
  resumoItens,
  type ReceiptMethod,
  type RotaItem,
  type RotaResult,
} from "./entrega-api";
import { buzz, getPosicaoUma, useGeofence, useOfflineSync, useWakeLock } from "./entrega-hooks";

// ================================================================
// LOGÍSTICA-MOBILE M4 — O APP DO ENTREGADOR (as 3 telas reais).
//  · "Hoje"   : lista do dia (GET /logistica/rota) → "Iniciar rota".
//  · "Rota"   : card da parada atual, swipe ←/→ (dots + X/N + término),
//               Navegar (deep-link mapa), geofence → vibra + folha de chegada.
//  · Chegada  : folha (stepper por item + Entregue) — ArrivalSheet.
// Dado REAL dos endpoints; estados de loading/vazio honestos. ZERO texto
// explicativo (Lei da seção 2): ícone + número + verbo.
// ================================================================

type View = "hoje" | "rota";

const DATA_HOJE = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const RAIO_CHEGADA_FALLBACK_M = 60; // default do LogisticaConfig (schema); geofence foreground.
const SWIPE_THRESHOLD_PX = 60;

export function EntregaHome() {
  const router = useRouter();
  const wakeLock = useWakeLock();
  const sync = useOfflineSync(); // M8 — fila offline + pendências no header.

  const [rota, setRota] = useState<RotaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [view, setView] = useState<View>("hoje");
  const [iniciando, setIniciando] = useState(false);
  const [indice, setIndice] = useState(0); // parada atual no carrossel
  const [sheetAberta, setSheetAberta] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // M9 — onboarding do 1º acesso (3 telas visuais). Começa null (indefinido no
  // SSR/1º paint) e decide no cliente pra não piscar: null=não sabe, true=mostra.
  const [onboarding, setOnboarding] = useState<boolean | null>(null);

  // AUTH: reusa a sessão do app. Sem token → login existente.
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  // M9 — decide o onboarding só no cliente (localStorage). Aparece 1× por device.
  useEffect(() => {
    setOnboarding(!jaViuOnboarding());
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await getRota();
      setRota(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a rota");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Paradas abertas na ordem da rota (fonte do carrossel + progresso).
  const abertas = useMemo(() => (rota ? paradasAbertas(rota) : []), [rota]);
  const totalDia = rota?.items.length ?? 0;
  const feitas = useMemo(() => (rota ? rota.items.filter((i) => i.status === "entregue").length : 0), [rota]);
  const termino = useMemo<string | null>(() => {
    // Término previsto = etaAt da última parada aberta com ETA (M3).
    const comEta = abertas.filter((p) => p.etaAt);
    return comEta.length > 0 ? comEta[comEta.length - 1].etaAt ?? null : null;
  }, [abertas]);

  const paradaAtual: RotaItem | null = abertas[indice] ?? null;

  // Geofence foreground na parada atual (só quando em "Rota" e a folha fechada).
  const alvo = useMemo(() => {
    if (!paradaAtual || typeof paradaAtual.cliente.lat !== "number" || typeof paradaAtual.cliente.lng !== "number") {
      return null;
    }
    return { id: paradaAtual.id, lat: paradaAtual.cliente.lat, lng: paradaAtual.cliente.lng, raioM: RAIO_CHEGADA_FALLBACK_M };
  }, [paradaAtual]);

  const onChegada = useCallback(() => {
    buzz([24, 40, 24]);
    setSheetAberta(true);
  }, []);

  useGeofence(alvo, view === "rota" && !sheetAberta, onChegada);

  // ── Iniciar rota (manda GPS de origem) ─────────────────────────────────────
  const onIniciar = useCallback(async () => {
    setIniciando(true);
    setErro(null);
    buzz(14);
    void wakeLock.enable(); // tela acesa durante a rota
    // LEI nº3 (fullscreen "especialmente no Rota"): oferece tela cheia em 1
    // toque ao iniciar — a lib central já emite o aviso ("deslize a borda de
    // cima pra sair"); se o device recusar/não suportar, segue sem travar o
    // fluxo (best-effort, igual ao wakeLock).
    void toggleCascaFullscreen();
    let origem: { lat: number; lng: number } | undefined;
    try {
      origem = await getPosicaoUma();
    } catch {
      origem = undefined; // sem GPS: o backend começa pela 1ª parada com coord
    }
    try {
      await iniciarRota(origem);
      await carregar(); // recarrega com rotaOrdem/etaAt já gravados
      setIndice(0);
      setView("rota");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao iniciar a rota");
    } finally {
      setIniciando(false);
    }
  }, [carregar, wakeLock]);

  // ── Swipe do carrossel ─────────────────────────────────────────────────────
  const dragStart = useRef<number | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const irPara = useCallback(
    (novo: number) => {
      const max = abertas.length - 1;
      const clamped = Math.max(0, Math.min(max, novo));
      if (clamped !== indice) buzz(8);
      setIndice(clamped);
    },
    [abertas.length, indice],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientX;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    setDragDx(e.clientX - dragStart.current);
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const dx = dragDx;
    dragStart.current = null;
    setDragging(false);
    setDragDx(0);
    if (dx <= -SWIPE_THRESHOLD_PX) irPara(indice + 1);
    else if (dx >= SWIPE_THRESHOLD_PX) irPara(indice - 1);
  };

  // ── Confirmar entrega (Entregue) ───────────────────────────────────────────
  const onEntregue = useCallback(
    async (payload: { itens: Array<{ id: string; qtdEntregue: number }>; receiptMethod?: ReceiptMethod }) => {
      if (!paradaAtual) return;
      setSubmitting(true);
      buzz([16, 20, 16]);
      let gps: { lat: number; lng: number } | undefined;
      try {
        gps = await getPosicaoUma();
      } catch {
        gps = undefined;
      }
      // M8 — OFFLINE-FIRST: enfileira a confirmação (gera idempotencyKey) e tenta enviar
      // já. Online → some da fila na hora; offline/falha → fica na fila e sincroniza ao
      // reconectar (teto + backoff). Nunca perde a entrega por falta de sinal. O servidor
      // dedupe pela key: reenviar o mesmo item não dispara WhatsApp/charge 2×.
      try {
        await sync.enqueueConfirmacao(paradaAtual.id, {
          lat: gps?.lat,
          lng: gps?.lng,
          receiptMethod: payload.receiptMethod,
          itens: payload.itens,
        });
        setSheetAberta(false);
        // Recarrega best-effort: online reflete 'entregue'; offline mantém a parada (o
        // sync a fecha depois). Erro de rede aqui NÃO reverte a confirmação enfileirada.
        await carregar().catch(() => {});
        // Avança para a próxima parada (o índice se mantém: a lista encurtou).
        setIndice((i) => Math.max(0, Math.min(i, abertas.length - 2)));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao confirmar");
      } finally {
        setSubmitting(false);
      }
    },
    [abertas.length, carregar, paradaAtual, sync],
  );

  const onNaoEntregue = useCallback(
    async (motivo: string) => {
      if (!paradaAtual) return;
      setSubmitting(true);
      try {
        await cancelarEntrega(paradaAtual.id, motivo);
        setSheetAberta(false);
        await carregar();
        setIndice((i) => Math.max(0, Math.min(i, abertas.length - 2)));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao registrar");
      } finally {
        setSubmitting(false);
      }
    },
    [abertas.length, carregar, paradaAtual],
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  // M9 — 1º acesso: cobre a tela com o onboarding de 3 telas até "Começar".
  if (onboarding) {
    return (
      <div className="ent-app">
        <Onboarding onDone={() => setOnboarding(false)} />
      </div>
    );
  }

  return (
    <EntregaScaffold
      title={view === "rota" ? "Rota" : "Hoje"}
      headerActions={
        <>
          {/* M8 — pendências não sincronizadas (fila offline). Ícone + número, sem texto
              (Lei nº1). Vira alerta quando algum item estourou o teto de tentativas. */}
          {sync.pendentes > 0 ? (
            <span
              className={`ent-pendencias${sync.precisamAtencao > 0 ? " is-attention" : ""}`}
              role="status"
              aria-label={`${sync.pendentes} confirmações não sincronizadas`}
              title={
                sync.precisamAtencao > 0
                  ? `${sync.pendentes} não sincronizadas (${sync.precisamAtencao} precisam de atenção)`
                  : `${sync.pendentes} aguardando sincronizar`
              }
            >
              <span aria-hidden="true">⇅</span>
              {sync.pendentes}
            </span>
          ) : null}
          {view === "rota" ? (
            <button type="button" className="casca-top__act" aria-label="Ver Hoje" onClick={() => setView("hoje")}>
              <I d={ICON_PATHS.route} size={18} />
            </button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <div className="ent-empty">
          <CascaLoading caption="Carregando" />
        </div>
      ) : erro ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            ⚠
          </div>
          <div className="ent-empty-title">Erro</div>
          <div>{erro}</div>
          <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      ) : view === "hoje" ? (
        <ViewHoje
          rota={rota}
          feitas={feitas}
          total={totalDia}
          termino={termino}
          abertas={abertas}
          iniciando={iniciando}
          onIniciar={onIniciar}
          onGerou={carregar}
        />
      ) : (
        <ViewRota
          abertas={abertas}
          indice={indice}
          feitas={feitas}
          total={totalDia}
          termino={termino}
          dragDx={dragging ? dragDx : 0}
          dragging={dragging}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDot={irPara}
          onChegar={() => {
            buzz(14);
            setSheetAberta(true);
          }}
        />
      )}

      <ArrivalSheet
        open={sheetAberta && !!paradaAtual}
        parada={paradaAtual}
        moduloFinanceiroAtivo={rota?.moduloFinanceiroAtivo ?? false}
        onEntregue={onEntregue}
        onNaoEntregue={onNaoEntregue}
        onClose={() => setSheetAberta(false)}
        submitting={submitting}
      />
    </EntregaScaffold>
  );
}

// ── TELA "Hoje" ────────────────────────────────────────────────────────────────
function ViewHoje({
  rota,
  feitas,
  total,
  termino,
  abertas,
  iniciando,
  onIniciar,
  onGerou,
}: {
  rota: RotaResult | null;
  feitas: number;
  total: number;
  termino: string | null;
  abertas: RotaItem[];
  iniciando: boolean;
  onIniciar: () => void;
  onGerou: () => void;
}) {
  // A4 — faixa de gestão do dia (gerar entregas + resumo) SEMPRE no topo, mesmo
  // sem entregas: é daqui que o dono do negócio materializa a rota do dia.
  if (!rota || total === 0) {
    return (
      <>
        <div className="ent-head-sub ent-head-sub--standalone">{DATA_HOJE}</div>
        <GestaoDia onGerou={onGerou} />
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            ✓
          </div>
          <div className="ent-empty-title">Sem entregas hoje</div>
        </div>
      </>
    );
  }
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  return (
    <>
      <div className="ent-head-sub ent-head-sub--standalone">{DATA_HOJE}</div>
      <GestaoDia onGerou={onGerou} />
      <section className="ent-progress" aria-label="Progresso do dia">
        <div className="ent-progress-row">
          <div className="ent-progress-count">
            <b>{feitas}</b>/{total}
          </div>
          <div className="ent-progress-eta">
            término
            <strong>{hhmm(termino)}</strong>
          </div>
        </div>
        <div className="ent-progress-bar">
          <div className="ent-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <div className="ent-list">
        {rota.items.map((it, i) => {
          const done = it.status === "entregue" || it.status === "cancelada";
          return (
            <div className={`ent-row${done ? " is-done" : ""}`} key={it.id}>
              <div className="ent-row-idx">{i + 1}</div>
              <div className="ent-row-main">
                <div className="ent-row-name">{it.cliente.nome ?? "Cliente"}</div>
                <div className="ent-row-sub">{resumoItens(it)}</div>
              </div>
              <div className={`ent-row-tag${it.status === "entregue" ? " is-done" : ""}`}>
                {it.status === "entregue" ? "✓" : it.status === "cancelada" ? "—" : hhmm(it.etaAt)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ent-actionbar">
        <button
          type="button"
          className="ent-btn ent-btn--primary"
          onClick={onIniciar}
          disabled={iniciando || abertas.length === 0}
        >
          {iniciando ? "Iniciando…" : abertas.length === 0 ? "Rota concluída" : "Iniciar rota"}
        </button>
      </div>
    </>
  );
}

// ── TELA "Rota" (card + swipe) ──────────────────────────────────────────────────
function ViewRota({
  abertas,
  indice,
  feitas,
  total,
  termino,
  dragDx,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDot,
  onChegar,
}: {
  abertas: RotaItem[];
  indice: number;
  feitas: number;
  total: number;
  termino: string | null;
  dragDx: number;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onDot: (i: number) => void;
  onChegar: () => void;
}) {
  if (abertas.length === 0) {
    return (
      <div className="ent-empty">
        <div className="ent-empty-icon" aria-hidden="true">
          ✓
        </div>
        <div className="ent-empty-title">Rota concluída</div>
      </div>
    );
  }
  const atual = abertas[indice] ?? abertas[0];
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  // translateX = índice + arraste em curso (px convertido pra % via container).
  const trackStyle = { transform: `translateX(calc(${-indice * 100}% + ${dragDx}px))` };

  return (
    <>
      <section className="ent-progress" aria-label="Progresso do dia">
        <div className="ent-progress-row">
          <div className="ent-progress-count">
            <b>{indice + 1}</b>/{abertas.length}
          </div>
          <div className="ent-progress-eta">
            término
            <strong>{hhmm(termino)}</strong>
          </div>
        </div>
        <div className="ent-progress-bar">
          <div className="ent-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <div
        className="ent-carousel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={`ent-track${dragging ? " is-dragging" : ""}`} style={trackStyle}>
          {abertas.map((p) => (
            <div className="ent-slide" key={p.id}>
              <article className="ent-stop-card">
                <span className="ent-stop-badge">Parada {(p.rotaOrdem ?? 0) + 1}</span>
                <div className="ent-stop-name">{p.cliente.nome ?? "Cliente"}</div>
                <div className="ent-stop-addr">{enderecoCurto(p.cliente)}</div>
                <div className="ent-stop-items">
                  <b>{p.itens.length > 0 ? p.itens.reduce((s, it) => s + it.qtdPrevista, 0) : p.quantidade}</b>
                  <span>{p.produto?.nome ?? p.itens[0]?.produto?.nome ?? "itens"}</span>
                </div>
                {p.etaAt ? (
                  <div className="ent-stop-eta">
                    chegada <strong>{hhmm(p.etaAt)}</strong>
                  </div>
                ) : null}
              </article>
            </div>
          ))}
        </div>
      </div>

      <div className="ent-dots" aria-hidden="true">
        {abertas.map((p, i) => (
          <span
            key={p.id}
            className={`ent-dot${i === indice ? " is-on" : ""}`}
            onClick={() => onDot(i)}
          />
        ))}
      </div>

      <div className="ent-actionbar">
        <a
          className="ent-btn ent-btn--secondary"
          href={mapsHref(atual.cliente)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Navegar
        </a>
        <button type="button" className="ent-btn ent-btn--primary" onClick={onChegar}>
          Cheguei
        </button>
      </div>
    </>
  );
}
