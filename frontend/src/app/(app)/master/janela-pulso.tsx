"use client";

// Janela "Pulso" — PULSO DO APP (PR04082026-PULSO-DO-APP, 04/08).
//
// O dono queria ver a tela real dos clientes sem depender de ninguém: até aqui
// isso só existia lendo log de nginx na mão. Aqui é uma linha por aparelho —
// empresa · pessoa · 🟢/⚪ · tela atual · há quanto tempo · trilha do dia.
//
// NÃO é espelho de tela: é o NOME da tela + a hora, telemetria do nosso app.
// Vocabulário: ⚪ é "fora do app", NUNCA "offline" — o painel lê o pulso do
// aplicativo, não o estado do celular no mundo.
//
// Backend: GET /master/pulso e GET /master/pulso/:deviceId/trilha (JWT +
// MasterGuard). Visual: só classes centrais (.panel/.tbl/.ckm-*) — nada de
// cor/borda/fonte nesta tela (5 Leis do design system).

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

type PulsoAparelho = {
  deviceId: string;
  companyId: number;
  companyName: string;
  userName: string;
  ultimaTela: string | null;
  ultimaTelaAt: string | null;
  abertoAgora: boolean;
  appVersion: string | null;
};

type TrilhaPonto = { tela: string; at: string };

// 10s: o app pulsa a cada 5s, então duas janelas de poll cabem entre dois
// refreshes — a bolinha nunca apaga por causa do relógio do painel.
const REFRESH_MS = 10000;

function haQuantoTempo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function JanelaPulso() {
  const [linhas, setLinhas] = useState<PulsoAparelho[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [trilha, setTrilha] = useState<TrilhaPonto[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mesmo padrão da janela "Quem está online": nada de setState síncrono aqui,
  // pra poder rodar dentro de efeito/intervalo sem cascading render.
  const carregar = useCallback(() => {
    return apiFetch<PulsoAparelho[]>("/master/pulso")
      .then(res => {
        setLinhas(Array.isArray(res) ? res : []);
        setErro(null);
      })
      .catch((err: unknown) => {
        setErro(err instanceof Error ? err.message : "Falha ao ler o pulso dos aparelhos.");
      });
  }, []);

  const carregarTrilha = useCallback((deviceId: string) => {
    return apiFetch<TrilhaPonto[]>(`/master/pulso/${encodeURIComponent(deviceId)}/trilha`)
      .then(res => setTrilha(Array.isArray(res) ? res : []))
      .catch(() => setTrilha([]));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh só enquanto a janela está montada — o clearInterval no unmount
  // é o que impede o painel de continuar batendo depois que o dono saiu daqui.
  useEffect(() => {
    timer.current = setInterval(() => {
      carregar();
      if (aberto) carregarTrilha(aberto);
    }, REFRESH_MS);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [carregar, carregarTrilha, aberto]);

  function expandir(deviceId: string) {
    if (aberto === deviceId) {
      setAberto(null);
      setTrilha(null);
      return;
    }
    setAberto(deviceId);
    setTrilha(null);
    carregarTrilha(deviceId);
  }

  const lista = linhas || [];
  const noApp = lista.filter(l => l.abertoAgora).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pulso ({noApp} com o app aberto de {lista.length})</h2>
        <div className="meta" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {erro && <span className="ckm-error">{erro}</span>}
          <span className="ckm-feed-meta">atualiza sozinho a cada 10s</span>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Empresa e pessoa</th>
              <th>Situação</th>
              <th>Tela</th>
              <th>Pulso</th>
              <th>Versão</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linhas === null && <tr><td colSpan={6} className="ckm-muted-cell">Carregando…</td></tr>}
            {linhas !== null && lista.length === 0 && (
              <tr><td colSpan={6} className="ckm-muted-cell">Nenhum aparelho pareado.</td></tr>
            )}
            {lista.map(l => (
              <React.Fragment key={l.deviceId}>
                <tr className={aberto === l.deviceId ? "sel" : undefined} onClick={() => expandir(l.deviceId)}>
                  <td>
                    <div className="co">
                      <strong>{l.companyName}</strong>
                      <span className="sub2">{l.userName}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span className={"ckm-dot" + (l.abertoAgora ? " ok" : "")} />
                      {l.abertoAgora ? "no app" : "fora do app"}
                    </span>
                  </td>
                  <td>{l.ultimaTela || <span className="ckm-muted-cell">—</span>}</td>
                  <td>{haQuantoTempo(l.ultimaTelaAt)}</td>
                  <td className="ckm-feed-meta">{l.appVersion || "—"}</td>
                  <td className="ckm-muted-cell">{aberto === l.deviceId ? "▾" : "▸"}</td>
                </tr>
                {aberto === l.deviceId && (
                  <tr>
                    <td colSpan={6}>
                      {trilha === null && <span className="ckm-muted-cell">Carregando a trilha…</span>}
                      {trilha !== null && trilha.length === 0 && (
                        <span className="ckm-muted-cell">Sem trilha hoje.</span>
                      )}
                      {trilha !== null && trilha.length > 0 && (
                        <span className="ckm-feed-meta">
                          {trilha.map(p => `${hora(p.at)} ${p.tela}`).join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
