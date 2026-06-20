"use client";

// Painel "Modelo de atendimento" (só admin).
// Consumido em /atendimento — botão abre este drawer via hbx-veil.
// Endpoints:
//   GET  /inbox/whatsapp/admin-panel
//   POST /inbox/whatsapp/attendance-mode { mode, confirm? }
//   POST /inbox/whatsapp/seller-connect-permission { userId, allowed }

import React, { useCallback, useEffect, useRef, useState } from "react";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

// ---- tipos ---------------------------------------------------------------

type TeamMember = {
  userId: number;
  name: string | null;
  role: string | null;
  canAttendSharedInbox?: boolean | null;
  canConnectWhatsapp?: boolean | null;
  whatsappConnected?: boolean | null;
  whatsappPhone?: string | null;
  openConversations?: number | null;
  currentAssignedConversations?: number | null;
};

type CompanyWhatsapp = {
  connected?: boolean | null;
  phone?: string | null;
  connectedByName?: string | null;
  lastActivityAt?: string | null;
  sessionId?: string | null;
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
  const [permBusy, setPermBusy] = useState<number | null>(null);

  // confirmação de troca de modo (vai desconectar chips)
  const [confirmData, setConfirmData] = useState<ConfirmPayload | null>(null);
  const pendingModeRef = useRef<"shared" | "individual" | null>(null);

  // confirmação de revogação de permissão de chip (vai desconectar o vendedor)
  const [revokeTarget, setRevokeTarget] = useState<TeamMember | null>(null);

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

  async function togglePermission(userId: number, allowed: boolean) {
    setPermBusy(userId);
    setMsg(null);
    try {
      await apiFetch("/inbox/whatsapp/seller-connect-permission", {
        method: "POST",
        body: JSON.stringify({ userId, allowed }),
      });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível atualizar a permissão.");
    } finally {
      setPermBusy(null);
    }
  }

  function requestRevoke(member: TeamMember) {
    if (member.whatsappConnected) {
      setRevokeTarget(member);
    } else {
      togglePermission(member.userId, false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    await togglePermission(target.userId, false);
  }

  const isShared = panel?.mode === "shared";
  const isIndividual = panel?.mode === "individual";
  const isNull = panel?.mode == null;

  // ---- render confirm overlay ------------------------------------------
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

  // ---- render revoke confirm overlay ------------------------------------
  if (revokeTarget) {
    return (
      <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setRevokeTarget(null); }}>
        <div className="hbx-modal at-confirm-modal">
          <h3>
            Revogar permissão de chip
            <span className="hbx-x" onClick={() => setRevokeTarget(null)}>✕</span>
          </h3>
          <p className="at-confirm-body">
            Revogar a permissão vai <strong>desconectar</strong> o WhatsApp do atendente abaixo. Ele precisará reconectar quando a permissão for restaurada.
          </p>
          <div className="at-confirm-list">
            <div className="at-confirm-row">
              <strong>{revokeTarget.name || "—"}</strong>
              {revokeTarget.whatsappPhone && <span className="tag">{revokeTarget.whatsappPhone}</span>}
            </div>
          </div>
          {msg && <span className="tag red">{msg}</span>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => setRevokeTarget(null)} disabled={permBusy === revokeTarget.userId}>Cancelar</button>
            <button className="btn-teal" onClick={confirmRevoke} disabled={permBusy === revokeTarget.userId}>
              {permBusy === revokeTarget.userId ? "Revogando…" : "Confirmar e revogar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- render main drawer -----------------------------------------------
  return (
    <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-drawer at-panel-drawer" onClick={e => e.stopPropagation()}>
        {/* cabeçalho */}
        <div className="at-panel-head">
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <I d={ICONS.atend} size={17} />
            <strong>Modelo de atendimento</strong>
          </span>
          <button className="icon-ghost" onClick={onClose} aria-label="Fechar painel"><I d={ICONS.x} size={17} /></button>
        </div>

        {loading && <div className="at-panel-note">Carregando…</div>}
        {!loading && !panel && <div className="at-panel-note">Não foi possível carregar as informações.</div>}

        {!loading && panel && (
          <div className="at-panel-body">

            {/* ---- BLOCO 1: Card do modelo atual ---- */}
            <div className="at-block">
              <div className="at-block-head">
                <span className="at-block-title">Modelo atual</span>
                {isNull && <span className="tag warn">Não definido</span>}
                {isShared && <span className="tag teal">Compartilhado</span>}
                {isIndividual && <span className="tag">Individual</span>}
              </div>

              <div className="at-mode-desc muted-note">
                {isNull && <span>Escolha o modelo de atendimento. Esta escolha define como as conversas do WhatsApp são distribuídas para a equipe.</span>}
                {isShared && <span><strong>Compartilhado:</strong> Todas as conversas entram em um pool da empresa. Qualquer atendente pode puxar e responder usando o número da empresa.</span>}
                {isIndividual && <span><strong>Individual:</strong> Cada atendente conecta seu próprio chip de WhatsApp e responde apenas pelas suas conversas.</span>}
              </div>

              {msg && <span className="tag red" style={{ marginBottom: 8 }}>{msg}</span>}

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

            {/* ---- BLOCO 2: WhatsApp da empresa (destaque no shared) ---- */}
            <div className={"at-block" + (isShared ? " at-block-highlight" : "")}>
              <div className="at-block-head">
                <span className="at-block-title">WhatsApp da empresa</span>
                {panel.companyWhatsapp?.connected
                  ? <span className="tag teal">Conectado</span>
                  : <span className="tag red">Desconectado</span>}
              </div>

              <div className="kv" style={{ marginBottom: 12 }}>
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

            {/* ---- BLOCO 3: Tabela da equipe ---- */}
            <div className="at-block">
              <div className="at-block-head">
                <span className="at-block-title">Equipe</span>
                <span className="at-team-count">{panel.team?.length ?? 0} membros</span>
              </div>

              {(!panel.team || panel.team.length === 0) && (
                <span className="muted-note">Nenhum membro na equipe ainda.</span>
              )}

              {panel.team && panel.team.length > 0 && (
                <div className="tbl-wrap">
                  <table className="tbl at-team-tbl">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Cargo</th>
                        {isIndividual && <th>Pode conectar chip?</th>}
                        {isIndividual && <th>Chip</th>}
                        {isIndividual && <th>Conversas</th>}
                        {isShared && <th>Abertas</th>}
                        {isShared && <th>Atendimento atual</th>}
                        {isNull && <th>Conversas</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {panel.team.map(m => (
                        <tr key={m.userId}>
                          <td><strong className="at-team-name">{m.name || "—"}</strong></td>
                          <td><span className="tag">{m.role || "—"}</span></td>

                          {isIndividual && (
                            <td>
                              {/* toggle can-connect */}
                              <button
                                className={"seg-toggle at-perm-toggle" + (m.canConnectWhatsapp ? " at-perm-on" : "")}
                                disabled={permBusy === m.userId}
                                onClick={() => m.canConnectWhatsapp ? requestRevoke(m) : togglePermission(m.userId, true)}
                                title={m.canConnectWhatsapp ? "Revogar permissão" : "Conceder permissão"}
                              >
                                <span className={"seg" + (m.canConnectWhatsapp ? " on" : "")}>
                                  {permBusy === m.userId ? "…" : (m.canConnectWhatsapp ? "Sim" : "Não")}
                                </span>
                              </button>
                            </td>
                          )}

                          {isIndividual && (
                            <td>
                              {m.whatsappConnected
                                ? <span className="tag teal">● Conectado</span>
                                : <span className="tag red">○ Desconectado</span>}
                            </td>
                          )}

                          {isIndividual && (
                            <td className="at-team-num">
                              {m.openConversations ?? "—"}
                            </td>
                          )}

                          {isShared && (
                            <td className="at-team-num">
                              {m.openConversations ?? "—"}
                            </td>
                          )}

                          {isShared && (
                            <td className="at-team-num">
                              {m.currentAssignedConversations ?? "—"}
                              {/* TODO: coluna "bloquear atendimento" (canAttendSharedInbox) — em breve */}
                            </td>
                          )}

                          {isNull && (
                            <td className="at-team-num">
                              {m.openConversations ?? "—"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
