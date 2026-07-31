"use client";

// Pop-up "Modelo de atendimento" (só admin). Centralizado pela central (.hbx-veil
// + .hbx-modal — Lei 2). Consumido em /conversas.
// Duas guias: "Modelo atual" (escolher compartilhado × individual + WhatsApp da
// empresa) e "Equipe" (lista de atendentes → toca num e abre o WhatsApp DELE:
// número, tempo conectado e a opção de DERRUBAR a conexão).
// Quem tem o Atendimento conecta o próprio chip (individual) ou herda o número da
// empresa (compartilhado) — NÃO existe permissão "pode conectar chip" separada.
// Endpoints:
//   GET  /inbox/whatsapp/admin-panel
//   POST /inbox/whatsapp/attendance-mode    { mode, confirm? }
//   POST /inbox/whatsapp/member-disconnect  { userId }

import React, { useCallback, useEffect, useRef, useState } from "react";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

// ---- tipos ---------------------------------------------------------------

type TeamMember = {
  userId: number | string;
  name: string | null;
  role: string | null;
  canAttendSharedInbox?: boolean | null;
  whatsappConnected?: boolean | null;
  // WEBWHATS-ARQ3 S3 — projeção canônica: sessão ativa (mesmo órfã) + frescor do carimbo.
  whatsappHasSession?: boolean | null;
  whatsappSeenAgoSeconds?: number | null;
  whatsappMotorState?: string | null;
  whatsappStale?: boolean | null;
  whatsappPhone?: string | null;
  whatsappConnectedAt?: string | null;
  openConversations?: number | null;
  currentAssignedConversations?: number | null;
};

type CompanyWhatsapp = {
  connected?: boolean | null;
  phone?: string | null;
  connectedByName?: string | null;
  lastActivityAt?: string | null;
  sessionId?: string | null;
  // WEBWHATS-ARQ3 S3 — frescor da projeção do número da empresa.
  seenAgoSeconds?: number | null;
  motorState?: string | null;
  stale?: boolean | null;
};

type AdminPanel = {
  mode: "shared" | "individual" | null;
  effectiveMode?: string | null;
  companyWhatsapp?: CompanyWhatsapp | null;
  team?: TeamMember[];
};

type ConfirmPayload = {
  requiresConfirm: true;
  affected: Array<{ userId: number; name: string | null; phone: string | null }>;
};

type ModeResult = { ok: true; mode: string } | ConfirmPayload;

// ---- helpers -------------------------------------------------------------

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// "há 2 dias" / "há 3 h" / "há 12 min" / "agora" — tempo desde a conexão.
function fmtSince(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

// WEBWHATS-ARQ3 S3 — "visto há Xs/min": frescor do carimbo da projeção (quando o app confirmou
// o estado contra o motor ao vivo). Diz ao admin se o "Conectado" é fresco ou uma projeção velha.
function fmtSeen(seconds?: number | null): string | null {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `visto há ${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `visto há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `visto há ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `visto há ${days} ${days === 1 ? "dia" : "dias"}`;
}

// ---- component -----------------------------------------------------------

type Props = {
  onClose: () => void;
  onConnectWhatsApp?: () => void; // abre modal QR existente
};

export function ModeloAtendimentoPanel({ onClose, onConnectWhatsApp }: Props) {
  const [panel, setPanel] = useState<AdminPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [tab, setTab] = useState<"modelo" | "equipe">("modelo");

  // detalhe do atendente selecionado na guia Equipe + derrubada em 2 passos
  const [selUserId, setSelUserId] = useState<string | null>(null);
  const [dropArm, setDropArm] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);

  // confirmação de troca de modo (vai desconectar chips)
  const [confirmData, setConfirmData] = useState<ConfirmPayload | null>(null);
  const pendingModeRef = useRef<"shared" | "individual" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<AdminPanel>("/inbox/whatsapp/admin-panel")
      .then(res => { setPanel(res || null); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    loadRef.current();
  }, []);

  function goEquipe() {
    setTab("equipe");
    setSelUserId(null);
    setDropArm(false);
    setMsg(null);
  }

  function selecionar(userId: string) {
    setSelUserId(userId);
    setDropArm(false);
    setMsg(null);
  }

  async function setMode(mode: "shared" | "individual", confirm?: boolean) {
    setModeBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<ModeResult>("/companies/me/whatsapp-modal/attendance-mode", {
        method: "POST",
        body: JSON.stringify({ mode, ...(confirm ? { confirm: true } : {}) }),
      });
      if ("requiresConfirm" in res && res.requiresConfirm) {
        pendingModeRef.current = mode;
        setConfirmData(res);
        setModeBusy(false);
        return;
      }
      setConfirmData(null);
      pendingModeRef.current = null;
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível trocar o modelo.");
    } finally {
      setModeBusy(false);
    }
  }

  async function confirmMode() {
    const mode = pendingModeRef.current;
    if (!mode) return;
    setConfirmData(null);
    await setMode(mode, true);
  }

  async function derrubar(userId: string) {
    setDropBusy(true);
    setMsg(null);
    try {
      await apiFetch("/inbox/whatsapp/member-disconnect", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setDropArm(false);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível derrubar a conexão.");
    } finally {
      setDropBusy(false);
    }
  }

  const isShared = panel?.mode === "shared";
  const isIndividual = panel?.mode === "individual";
  const isNull = panel?.mode == null;
  const sel = (panel?.team || []).find(m => String(m.userId) === selUserId) || null;

  // ---- render confirm overlay (troca de modo) --------------------------
  if (confirmData) {
    return (
      <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setConfirmData(null); }}>
        <div className="hbx-modal at-confirm-modal">
          <h3>
            Confirmar troca de modelo
            <span className="hbx-x" onClick={() => setConfirmData(null)}>✕</span>
          </h3>
          <p className="at-confirm-body">
            Trocar o modelo vai <strong>desconectar</strong> o WhatsApp dos atendentes abaixo. Eles precisarão reconectar.
          </p>
          {confirmData.affected.length > 0 && (
            <div className="at-confirm-list">
              {confirmData.affected.map(a => (
                <div key={a.userId} className="at-confirm-row">
                  <strong>{a.name || "—"}</strong>
                  <span className="tag">{a.phone || "—"}</span>
                </div>
              ))}
            </div>
          )}
          {msg && <span className="tag red">{msg}</span>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => setConfirmData(null)} disabled={modeBusy}>Cancelar</button>
            <button className="btn-teal" onClick={confirmMode} disabled={modeBusy}>
              {modeBusy ? "Trocando…" : "Confirmar e trocar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- render pop-up central -------------------------------------------
  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="hbx-modal"
        style={{ width: "min(560px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* cabeçalho */}
        <div className="at-panel-head">
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <I d={ICONS.atend} size={17} />
            <strong>Modelo de atendimento</strong>
          </span>
          <button className="icon-ghost" onClick={onClose} aria-label="Fechar painel"><I d={ICONS.x} size={17} /></button>
        </div>

        {/* guias */}
        <div className="at-tabs">
          <div className="seg-toggle">
            <button className={"seg" + (tab === "modelo" ? " on" : "")} onClick={() => setTab("modelo")}>Modelo atual</button>
            <button className={"seg" + (tab === "equipe" ? " on" : "")} onClick={goEquipe}>Equipe</button>
          </div>
        </div>

        <div className="at-panel-body">
          {loading && <span className="muted-note">Carregando…</span>}
          {!loading && !panel && <span className="muted-note">Não foi possível carregar as informações.</span>}

          {/* ====== GUIA: MODELO ATUAL ====== */}
          {!loading && panel && tab === "modelo" && (
            <React.Fragment>
              <div className="at-block">
                <div className="at-block-head">
                  <span className="at-block-title">Modelo atual</span>
                  {isNull && <span className="tag warn">Não definido</span>}
                  {isShared && <span className="tag teal">Compartilhado</span>}
                  {isIndividual && <span className="tag">Individual</span>}
                </div>

                <div className="at-mode-desc muted-note">
                  {isNull && <span>Escolha o modelo de atendimento. Esta escolha define como as conversas do WhatsApp são distribuídas para a equipe.</span>}
                  {isShared && <span><strong>Compartilhado:</strong> Todas as conversas entram em um pool da empresa. Qualquer atendente puxa e responde usando o número da empresa.</span>}
                  {isIndividual && <span><strong>Individual:</strong> Cada atendente conecta seu próprio chip de WhatsApp e responde apenas pelas suas conversas.</span>}
                </div>

                {msg && <span className="tag red">{msg}</span>}

                <div className="at-mode-btns">
                  <button
                    className={"btn-ghost" + (isShared ? " at-mode-active" : "")}
                    disabled={modeBusy || isShared}
                    onClick={() => setMode("shared")}
                  >
                    <I d={ICONS.users} size={14} /> Número compartilhado
                  </button>
                  <button
                    className={"btn-ghost" + (isIndividual ? " at-mode-active" : "")}
                    disabled={modeBusy || isIndividual}
                    onClick={() => setMode("individual")}
                  >
                    <I d={ICONS.phone} size={14} /> Chips individuais
                  </button>
                </div>
              </div>

              <div className={"at-block" + (isShared ? " at-block-highlight" : "")}>
                <div className="at-block-head">
                  <span className="at-block-title">WhatsApp da empresa</span>
                  {panel.companyWhatsapp?.connected
                    ? <span className="tag teal">Conectado</span>
                    : <span className="tag red">Desconectado</span>}
                  {/* WEBWHATS-ARQ3 S3 — frescor da projeção do número da empresa (visto há Xs). */}
                  {fmtSeen(panel.companyWhatsapp?.seenAgoSeconds) && (
                    <span className="tag">{fmtSeen(panel.companyWhatsapp?.seenAgoSeconds)}</span>
                  )}
                </div>

                <div className="kv">
                  <div className="row">
                    <span className="k">Número</span>
                    <span className="v">{panel.companyWhatsapp?.phone || "—"}</span>
                  </div>
                  <div className="row">
                    <span className="k">Conectado por</span>
                    <span className="v">{panel.companyWhatsapp?.connectedByName || "—"}</span>
                  </div>
                  <div className="row">
                    <span className="k">Última atividade</span>
                    <span className="v">{fmtDate(panel.companyWhatsapp?.lastActivityAt)}</span>
                  </div>
                </div>

                {onConnectWhatsApp && (
                  <button className="btn-ghost btn-xs" onClick={onConnectWhatsApp}>
                    <I d={ICONS.msg} size={13} />
                    {panel.companyWhatsapp?.connected ? "Reconectar / Desconectar" : "Conectar WhatsApp"}
                  </button>
                )}
              </div>
            </React.Fragment>
          )}

          {/* ====== GUIA: EQUIPE — lista ====== */}
          {!loading && panel && tab === "equipe" && !sel && (
            <div className="at-block">
              <div className="at-block-head">
                <span className="at-block-title">Equipe</span>
                <span className="at-team-count">{panel.team?.length ?? 0} membros</span>
              </div>

              {(!panel.team || panel.team.length === 0) && (
                <span className="muted-note">Nenhum membro na equipe ainda.</span>
              )}

              {panel.team && panel.team.length > 0 && (
                <React.Fragment>
                  <div className="tbl-wrap">
                    <table className="tbl at-team-tbl">
                      <thead>
                        <tr>
                          <th>Nome</th>
                          <th>Cargo</th>
                          <th>Chip</th>
                        </tr>
                      </thead>
                      <tbody>
                        {panel.team.map(m => (
                          <tr
                            key={String(m.userId)}
                            className={String(m.userId) === selUserId ? "sel" : undefined}
                            onClick={() => selecionar(String(m.userId))}
                          >
                            <td><strong className="at-team-name">{m.name || "—"}</strong></td>
                            <td><span className="tag">{m.role || "—"}</span></td>
                            <td>
                              {m.whatsappConnected
                                ? <span className="tag teal">● Conectado</span>
                                : m.whatsappHasSession
                                  ? <span className="tag warn">◐ Sem confirmação</span>
                                  : <span className="tag red">○ Desconectado</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </React.Fragment>
              )}
            </div>
          )}

          {/* ====== GUIA: EQUIPE — WhatsApp do atendente ====== */}
          {!loading && panel && tab === "equipe" && sel && (
            <div className="at-block">
              <div className="at-block-head">
                <button className="btn-ghost btn-xs" onClick={() => { setSelUserId(null); setDropArm(false); setMsg(null); }}>‹ Equipe</button>
                <span className="at-block-title" style={{ textAlign: "right" }}>{sel.name || "—"}</span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="tag">{sel.role || "—"}</span>
                {sel.whatsappConnected
                  ? <span className="tag teal">● Conectado</span>
                  // Órfão (RUIM#2): banco diz sessão ativa mas a projeção não confirma vivo →
                  // rótulo honesto "Sem confirmação" (e o botão Derrubar fica disponível abaixo).
                  : sel.whatsappHasSession
                    ? <span className="tag warn">◐ Sem confirmação</span>
                    : <span className="tag red">○ Desconectado</span>}
                {/* Frescor do carimbo da projeção (visto há Xs): mostra ao admin o quão fresco é o estado. */}
                {fmtSeen(sel.whatsappSeenAgoSeconds) && (
                  <span className="tag">{fmtSeen(sel.whatsappSeenAgoSeconds)}</span>
                )}
              </div>

              <div className="kv">
                <div className="row">
                  <span className="k">WhatsApp</span>
                  <span className="v">{sel.whatsappPhone || "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Conectado</span>
                  <span className="v">{sel.whatsappConnected ? (fmtSince(sel.whatsappConnectedAt) || "—") : "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Desde</span>
                  <span className="v">{sel.whatsappConnected ? fmtDate(sel.whatsappConnectedAt) : "—"}</span>
                </div>
                <div className="row">
                  <span className="k">Conversas abertas</span>
                  <span className="v">{sel.openConversations ?? 0}</span>
                </div>
              </div>

              {msg && <span className="tag red">{msg}</span>}

              {/* WEBWHATS-ARQ3 S3 — "Derrubar conexão" visível sempre que HÁ uma sessão ativa no
                  banco (viva OU órfã). Antes só aparecia com whatsappConnected=true → o órfão
                  (chip morto que ficou 'active') ficava sem como ser limpo justamente quando mais
                  precisava (RUIM#2). disconnectCompanySession limpa motor + projeção juntos. */}
              {(sel.whatsappConnected || sel.whatsappHasSession) ? (
                dropArm ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-ghost btn-danger" disabled={dropBusy} onClick={() => derrubar(String(sel.userId))}>
                      {dropBusy ? "Derrubando…" : "Confirmar — derrubar conexão"}
                    </button>
                    <button className="btn-ghost btn-xs" disabled={dropBusy} onClick={() => setDropArm(false)}>Cancelar</button>
                  </div>
                ) : (
                  <button className="btn-ghost btn-danger" onClick={() => setDropArm(true)}>
                    Derrubar conexão
                  </button>
                )
              ) : (
                <span className="muted-note">Este atendente não tem um chip próprio conectado.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
