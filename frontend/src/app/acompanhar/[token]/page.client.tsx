"use client";

// F3 FULL-POLIDO (27/07, PR27072026-ROTA-3-NIVEIS) — "Acompanhe sua entrega":
// tela PÚBLICA (sem login) do link /acompanhar/<token>. Contrato real:
//   GET /public/tracking/:token → PublicTrackingStatus | 404 genérico
// (token inválido/adulterado, entrega sumida e segredo não configurado
// respondem o MESMO 404 — nunca dá pista de qual foi).
//
// Gate de nível (Basic/Advanced/Full) é decidido no BACKEND (campo `full` +
// `live` ausente/presente na resposta) — este componente só RENDERIZA o que
// chegou; nunca decide sozinho se mostra mapa/ETA. Fora do Full, `live` é
// sempre null e a tela mostra só o estado estático (nunca erro feio).
//
// Mobile-first, leve: SEM libs de mapa (maplibre-gl já existe no projeto, mas
// só no painel admin autenticado — aqui o pedido explícito era distância/ETA
// textual + barra de progresso simples, pra carregar rápido em rede fraca).
//
// Design system (5 Leis): visual próprio em hbx-theme/tracking-publico.css
// (escopo .trk-pub, zero hex — só var()/color-mix()), igual à cara de outras
// páginas públicas soltas (login/confirm-email reusam .card do kit; aqui o
// produto pede algo mais "app de entrega", por isso a folha própria).

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

type PublicDeliveryStatus = "AGENDADA" | "A_CAMINHO" | "CHEGANDO" | "ENTREGUE" | "CANCELADA";

interface PublicTrackingLive {
  etaLabel: string | null;
  progresso: { concluidas: number; total: number } | null;
  atualizadoHaSegundos: number | null;
}

interface PublicTrackingStatus {
  empresaNome: string;
  clienteNome: string | null;
  status: PublicDeliveryStatus;
  agendadaEm: string | null;
  entregueEm: string | null;
  full: boolean;
  live: PublicTrackingLive | null;
}

const POLL_INTERVAL_MS = 15_000;

const STEPS: Array<{ key: PublicDeliveryStatus; label: string }> = [
  { key: "AGENDADA", label: "Na fila" },
  { key: "A_CAMINHO", label: "A caminho" },
  { key: "CHEGANDO", label: "Chegando" },
  { key: "ENTREGUE", label: "Entregue" },
];

const STEP_ORDER: Record<PublicDeliveryStatus, number> = {
  AGENDADA: 0,
  A_CAMINHO: 1,
  CHEGANDO: 2,
  ENTREGUE: 3,
  CANCELADA: -1,
};

const HERO_TITLE: Record<PublicDeliveryStatus, string> = {
  AGENDADA: "Sua entrega está agendada",
  A_CAMINHO: "Sua entrega está a caminho",
  CHEGANDO: "O entregador está chegando",
  ENTREGUE: "Entrega concluída",
  CANCELADA: "Pedido cancelado",
};

// "Na fila" reaproveita o mesmo tom neutro de "a caminho" — só CHEGANDO (alerta),
// ENTREGUE (sucesso) e CANCELADA (erro) têm cor própria.
const HERO_MODIFIER: Record<PublicDeliveryStatus, string> = {
  AGENDADA: "a-caminho",
  A_CAMINHO: "a-caminho",
  CHEGANDO: "chegando",
  ENTREGUE: "entregue",
  CANCELADA: "cancelada",
};

function formatDia(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // timeZone FIXO (America/Sao_Paulo): o dispositivo do cliente final pode
  // estar em qualquer fuso — nunca deixar o relógio local do navegador decidir.
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function formatHora(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function heroSubtitle(data: PublicTrackingStatus): string | null {
  if (data.status === "ENTREGUE" && data.entregueEm) {
    return `Entregue às ${formatHora(data.entregueEm)} de ${formatDia(data.entregueEm)}`;
  }
  if (data.status === "AGENDADA" && data.agendadaEm) {
    return `Prevista para ${formatDia(data.agendadaEm)}`;
  }
  if (data.status === "CANCELADA") {
    return "Fale com a empresa se você não reconhece este cancelamento.";
  }
  return null;
}

function relativeSeconds(seconds: number | null): string {
  if (seconds == null) return "agora há pouco";
  if (seconds < 10) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  return `há ${Math.floor(seconds / 60)} min`;
}

export function AcompanharEntregaClient({ token }: { token: string }) {
  const [data, setData] = useState<PublicTrackingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (silent: boolean) => {
    const requestId = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch<PublicTrackingStatus>(`/public/tracking/${encodeURIComponent(token)}`);
      if (requestRef.current !== requestId) return;
      setData(res);
      setNotFound(false);
      setError(null);
    } catch (caught: unknown) {
      if (requestRef.current !== requestId) return;
      const status = (caught as { status?: number } | null)?.status;
      if (status === 404) setNotFound(true);
      else setError(caught instanceof Error ? caught.message : "Não foi possível carregar o acompanhamento.");
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização inicial com API pública ao montar.
    void load(false);
  }, [load]);

  // Polling só quando há algo "vivo" pra atualizar (nível Full + sessão TRACKED
  // ativa) — página estática (fora do Full, ou entrega parada) não fica
  // martelando o backend à toa.
  useEffect(() => {
    if (!data?.full || !data.live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [data?.full, data?.live, load]);

  const stepIndex = data ? STEP_ORDER[data.status] : -1;
  const progresso = data?.live?.progresso ?? null;
  const progressoPct = progresso && progresso.total > 0
    ? Math.min(100, Math.round((progresso.concluidas / progresso.total) * 100))
    : 0;

  return (
    <div className="trk-pub">
      <header className="trk-pub__header">
        <span className="trk-pub__empresa">{data?.empresaNome || "Acompanhe sua entrega"}</span>
      </header>

      <main className="trk-pub__main">
        {loading && !data && (
          <div className="trk-pub__center">
            <span className="trk-pub__spinner" aria-hidden="true" />
            <span className="trk-pub__center-text">Carregando o acompanhamento…</span>
          </div>
        )}

        {!loading && notFound && (
          <div className="trk-pub__center">
            <strong className="trk-pub__center-title">Não encontramos esta entrega</strong>
            <span className="trk-pub__center-text">Confira se o link está completo, ou fale com quem te enviou.</span>
          </div>
        )}

        {!loading && error && !notFound && (
          <div className="trk-pub__center">
            <strong className="trk-pub__center-title">Não foi possível abrir o acompanhamento</strong>
            <span className="trk-pub__center-text">{error}</span>
          </div>
        )}

        {data && !notFound && (
          <>
            <section className={`trk-pub__hero trk-pub__hero--${HERO_MODIFIER[data.status]}`}>
              <span className="trk-pub__hero-dot" aria-hidden="true" />
              <strong className="trk-pub__hero-title">
                {data.clienteNome ? `Oi, ${data.clienteNome}! ` : ""}
                {HERO_TITLE[data.status]}
              </strong>
              {heroSubtitle(data) && <span className="trk-pub__hero-sub">{heroSubtitle(data)}</span>}
            </section>

            {data.status !== "CANCELADA" && (
              <ol className="trk-pub__stepper" aria-label="Etapas da entrega">
                {STEPS.map((step, index) => (
                  <li
                    key={step.key}
                    className={`trk-pub__step${index < stepIndex ? " is-done" : ""}${index === stepIndex ? " is-current" : ""}`}
                  >
                    <span className="trk-pub__step-bar" aria-hidden="true" />
                    <span className="trk-pub__step-label">{step.label}</span>
                  </li>
                ))}
              </ol>
            )}

            {data.live && (
              <section className="trk-pub__live" aria-label="Acompanhamento ao vivo">
                <div className="trk-pub__eta">
                  <span className="trk-pub__eta-label">Chegada estimada</span>
                  <strong className="trk-pub__eta-value">{data.live.etaLabel ?? "Calculando…"}</strong>
                </div>
                {progresso && progresso.total > 0 && (
                  <div className="trk-pub__progress">
                    <div className="trk-pub__progress-bar" aria-hidden="true">
                      <div className="trk-pub__progress-fill" style={{ width: `${progressoPct}%` }} />
                    </div>
                    <span className="trk-pub__progress-text">
                      {progresso.concluidas} de {progresso.total} entregas concluídas na rota
                    </span>
                  </div>
                )}
                <span className="trk-pub__updated">
                  Posição atualizada {relativeSeconds(data.live.atualizadoHaSegundos)}
                </span>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="trk-pub__footer">
        <span className="trk-pub__footer-brand">Rastreamento HBX</span>
      </footer>
    </div>
  );
}
