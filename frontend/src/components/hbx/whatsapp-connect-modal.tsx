"use client";

// Modal de conexão WhatsApp (R2.9 — entra junto com a tela de Atendimento).
// Usa o fluxo canônico de src/lib/whatsapp-connection-flow.ts:
// status → start (gera QR) → leitura → connected → bootstrap (espelha
// conversas/contatos) → onConnected().
//
// Store-on-arrival: sem LEI de reconexão / sem cleanup popup / sem supressão.
// Webhooks gravam no banco; inbox lê do banco. Wipe = DELETE real no banco
// + apaga instâncias do motor + desconecta sessão.
//
// BOTÃO DEBUG "Limpar dados": apaga TODAS as mensagens/conversas da company,
// desconecta sessão e apaga instâncias do motor. Chama /inbox/whatsapp-sessions/wipe-all.

import { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import {
  bootstrapWhatsAppAfterConnect,
  disconnectWhatsAppModalSession,
  fetchWhatsAppModalQr,
  fetchWhatsAppModalStatus,
  requestWhatsAppPairingCode,
  restartWhatsAppModalSession,
  startWhatsAppModalSession,
  wipeAllWhatsAppData,
} from "@/lib/whatsapp-connection-flow";
import { formatWhatsAppDateTime, whatsappModalStatusLabel, type WhatsAppModalPayload, type WhatsAppPairingCodePayload } from "@/lib/whatsapp-center";
import { brPhoneToE164, formatBrPhone, isBrPhoneComplete, toLocalDigits } from "@/lib/br-phone";

// Nunca deixar um JID técnico (5519920121720@s.whatsapp.net, @lid, @g.us...) vazar pra tela.
// De um JID/telefone, extrai os dígitos e formata bonito (+55 (DD) XXXXX-XXXX). JID técnico
// (lid/grupo/broadcast) vira null — não é número.
function prettyPhone(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/@(lid|g\.us|broadcast|newsletter)/i.test(s)) return null;
  const m = s.match(/^\+?(\d{8,15})(?:@(?:s\.whatsapp\.net|c\.us))?$/i);
  const digits = m ? m[1] : s.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const mid = rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+55 (${ddd}) ${mid}`;
  }
  return `+${digits}`;
}

// Limpa JIDs crus de dentro das mensagens vindas do backend ("Sessão conectada ao número
// 5519920121720@s.whatsapp.net" → "...ao número +55 (19) 92012-1720").
function sanitizeJidsInText(text: string | null | undefined): string {
  return String(text || "")
    .replace(/\+?(\d{8,15})@(?:s\.whatsapp\.net|c\.us)/gi, (_full, d: string) => prettyPhone(d) || `+${d}`)
    .replace(/\s*\S+@(?:lid|g\.us|broadcast|newsletter)/gi, "")
    .trim();
}

export function WhatsAppConnectModal({ open, onClose, onConnected, onDisconnected, initialMethod = "qr" }: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  initialMethod?: "qr" | "code";
}) {
  const [payload, setPayload] = useState<WhatsAppModalPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [method, setMethod] = useState<"qr" | "code">(initialMethod);
  const [phone, setPhone] = useState("");
  const [pairing, setPairing] = useState<WhatsAppPairingCodePayload | null>(null);
  const bootstrappedKey = useRef<string | null>(null);
  const statusRef = useRef<string | null>(null);

  // DEBUG — confirmação antes de limpar tudo
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeMsg, setWipeMsg] = useState<string | null>(null);

  // Enquanto o vendedor pareia (waiting_qr/starting após clicar Conectar), o poll vai no /qr
  // (getCompanyQrCode) — mantém o QR vivo e detecta a conexão — em vez do /status (leitura pura
  // do banco, que diria "desconectado" e apagaria o QR). O motor só é tocado AQUI, no pareamento
  // ativo dentro do modal; a pill da tela continua lendo só o banco. statusRef espelha o status
  // exibido para escolher o endpoint.
  const refresh = useCallback(() => {
    const pollingQr = method === "qr" && (statusRef.current === "waiting_qr" || statusRef.current === "starting");
    const primary = pollingQr ? fetchWhatsAppModalQr() : fetchWhatsAppModalStatus();
    return primary
      .then(async res => {
        let next = res;
        if (!pollingQr && method === "qr" && res?.status === "waiting_qr" && !res?.data?.qrCodeDataUrl) {
          next = await fetchWhatsAppModalQr().catch(() => res);
        }
        statusRef.current = next?.status ?? null;
        setPayload(next);
        setError(null);
        return next;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Falha ao consultar o status do WhatsApp.");
        return null;
      });
  }, [method]);

  // abre → consulta status; enquanto starting/waiting_qr/reconnecting, poll 4s
  useEffect(() => {
    if (!open) return;
    let alive = true;
    statusRef.current = null; // reabrir/trocar método não herda waiting_qr antigo
    refresh();
    const timer = setInterval(async () => {
      if (!alive) return;
      const res = await refresh();
      if (!res) return;
      if (res.status === "connected") {
        const key = `${res.data.companyId}:${res.data.connectedAt || res.data.phone || "connected"}`;
        if (bootstrappedKey.current !== key) {
          bootstrappedKey.current = key;
          try {
            const boot = await bootstrapWhatsAppAfterConnect(res);
            if (!alive) return;
            if (boot) {
              setBootstrapMsg(`✓ Conectado — ${boot.syncedConversations} conversas e ${boot.syncedContacts} contatos espelhados.`);
              onConnected?.();
            }
          } catch (err) {
            if (alive) setBootstrapMsg(err instanceof Error ? err.message : "Conectado, mas o espelhamento falhou.");
          }
        }
      }
    }, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [open, refresh, onConnected]);

  if (!open) return null;

  const status = payload?.status || "offline";
  const qr = payload?.data?.qrCodeDataUrl || null;
  const canStart = !busy && ["offline", "disconnected", "error"].includes(status);
  const canRestart = !busy && ["error", "reconnecting", "waiting_qr", "starting"].includes(status);
  const connected = status === "connected";
  const sessionId = payload?.data?.tenantKey || "";
  const phoneOk = isBrPhoneComplete(phone);

  async function run(action: () => Promise<WhatsAppModalPayload>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setBootstrapMsg(null);
    try {
      const res = await action();
      statusRef.current = res?.status ?? null; // clicar Conectar marca waiting_qr → próximo poll vai no /qr
      setPayload(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectAndNotify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setBootstrapMsg(null);
    try {
      const res = await disconnectWhatsAppModalSession();
      statusRef.current = res?.status ?? null; // desconectar volta o poll pro /status
      setPayload(res);
      bootstrappedKey.current = null;
      onDisconnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePairing() {
    if (busy) return;
    if (!sessionId) { setError("Sessão WhatsApp ainda não carregou — clique em Atualizar status."); return; }
    if (!phoneOk) { setError("Informe o telefone com DDD."); return; }
    setBusy(true);
    setError(null);
    setBootstrapMsg(null);
    try {
      const res = await requestWhatsAppPairingCode(sessionId, brPhoneToE164(phone));
      setPairing(res);
      if (!res.success || !res.code) {
        setError(res.message || "Não foi possível gerar o código de pareamento.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o código de pareamento.");
    } finally {
      setBusy(false);
    }
  }

  // DEBUG — limpa tudo (mensagens + conversas) e avisa o parent para recarregar
  async function handleWipeAll() {
    setWipeBusy(true);
    setWipeMsg(null);
    setConfirmWipe(false);
    try {
      const res = await wipeAllWhatsAppData();
      setWipeMsg(`✓ Dados limpos — ${res.deletedMessages} msgs, ${res.deletedConversations} conversas. Sessão continua ativa.`);
      onConnected?.(); // recarrega lista no parent (aparecerá vazia)
    } catch (err) {
      setWipeMsg(err instanceof Error ? err.message : "Falha ao limpar dados.");
    } finally {
      setWipeBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-modal" style={{ width: "min(420px, 100%)", display: "grid", gap: 14, padding: 24, position: "relative", overflow: "hidden" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Conexão WhatsApp
          <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={onClose}>✕</span>
        </h3>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={"tag" + (connected ? " teal" : status === "error" ? " red" : " warn")}>
            {whatsappModalStatusLabel(status)}
          </span>
          {prettyPhone(payload?.data?.phone) && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}>{prettyPhone(payload?.data?.phone)}</span>}
        </div>

        {!connected && (
          <div className="seg-toggle" style={{ justifySelf: "start" }} role="tablist" aria-label="Forma de conexão">
            <button className={"seg" + (method === "qr" ? " on" : "")} onClick={() => { setMethod("qr"); setError(null); }}>QR Code</button>
            <button className={"seg" + (method === "code" ? " on" : "")} onClick={() => { setMethod("code"); setError(null); setPairing(null); }}>Código</button>
          </div>
        )}

        {payload?.message && (
          <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{sanitizeJidsInText(payload.message)}</p>
        )}
        {error && (
          <p style={{ margin: 0, fontSize: "0.74rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{error}</p>
        )}
        {bootstrapMsg && (
          <p style={{ margin: 0, fontSize: "0.74rem", fontWeight: 700, color: bootstrapMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{bootstrapMsg}</p>
        )}

        {method === "qr" && status === "waiting_qr" && (
          <div style={{ display: "grid", justifyItems: "center", gap: 8, padding: 12, borderRadius: "var(--radius-md)", border: "1px dashed var(--border-strong)", background: "var(--hbx-surface-soft)" }}>
            {qr
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qr} alt="QR Code do WhatsApp" width={220} height={220} style={{ borderRadius: 8, background: "#fff", padding: 6 }} />
              : <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Gerando QR…</span>}
            <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", textAlign: "center" }}>
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.
            </span>
          </div>
        )}

        {method === "code" && !connected && (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              className="field-dark"
              inputMode="tel"
              placeholder="(19)99702-4884"
              value={formatBrPhone(phone)}
              onChange={e => setPhone(toLocalDigits(e.target.value))}
            />
            {pairing?.code ? (
              <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: 8 }}>
                <span style={{ fontSize: "1.7rem", fontWeight: 800, letterSpacing: "0.2em" }}>{pairing.code}</span>
                <span className="badge-win">Código válido por {pairing.expiresInSeconds}s</span>
                <span className="hint" style={{ textAlign: "center" }}>
                  No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone, e digite este código.
                </span>
              </div>
            ) : (
              <span className="hint">
                Geramos um código para você digitar no WhatsApp do celular — sem precisar da câmera.
              </span>
            )}
            <button className="btn-teal" disabled={busy || !phoneOk} onClick={generatePairing}>
              <I d={ICONS.msg} size={14} /> {busy ? "Gerando…" : pairing?.code ? "Gerar novo código" : "Gerar código de pareamento"}
            </button>
          </div>
        )}

        {connected && (
          <>
            <span className="hbx-approve-wash is-on ok" aria-hidden="true" />
            <span className="hbx-approve-pulse" aria-hidden="true" />
            <span className="hbx-approve-pulse d2" aria-hidden="true" />
            <span className="badge-win">✓ WhatsApp conectado — pronto para receber e responder aqui</span>
            <div className="kv">
              <div className="row"><span className="k">Conectado em</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{formatWhatsAppDateTime(payload?.data?.connectedAt)}</span></div>
              <div className="row"><span className="k">Atualizado em</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>{formatWhatsAppDateTime(payload?.data?.updatedAt)}</span></div>
            </div>
          </>
        )}

        {payload?.data?.lastError && !connected && (
          <p style={{ margin: 0, fontSize: "var(--hbx-font-min)", color: "var(--hbx-danger)" }}>{payload.data.lastError}</p>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {method === "qr" && canStart && (
            <button className="btn-teal" disabled={busy} onClick={() => run(startWhatsAppModalSession)}>
              <I d={ICONS.msg} size={14} /> {busy ? "Iniciando…" : "Conectar / gerar QR"}
            </button>
          )}
          <div style={{ display: "grid", gridTemplateColumns: (!connected && canRestart) ? "1fr 1fr" : "1fr", gap: 8 }}>
            {!connected && (
              <button className="btn-ghost" disabled={busy} onClick={() => refresh()}>Atualizar status</button>
            )}
            {canRestart && (
              <button className="btn-ghost" disabled={busy} onClick={() => run(restartWhatsAppModalSession)}>Reiniciar sessão</button>
            )}
            {connected && (
              confirmDisconnect ? (
                <button className="btn-ghost danger" disabled={busy}
                  onClick={() => { setConfirmDisconnect(false); disconnectAndNotify(); }}>
                  Confirmar desconexão
                </button>
              ) : (
                <button className="btn-ghost" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Desconectar</button>
              )
            )}
          </div>

          {/* DEBUG — visível apenas quando conectado */}
          {connected && (
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px dashed var(--border-strong)", display: "grid", gap: 6 }}>
              <span style={{ fontSize: "var(--hbx-font-min)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>debug</span>
              {wipeMsg && (
                <p style={{ margin: 0, fontSize: "0.72rem", color: wipeMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{wipeMsg}</p>
              )}
              {confirmWipe ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-ghost danger" disabled={wipeBusy} onClick={handleWipeAll}>
                    {wipeBusy ? "Limpando…" : "Confirmar — apagar tudo"}
                  </button>
                  <button className="btn-ghost" disabled={wipeBusy} onClick={() => setConfirmWipe(false)}>Cancelar</button>
                </div>
              ) : (
                <button className="btn-ghost" disabled={wipeBusy} onClick={() => { setWipeMsg(null); setConfirmWipe(true); }}
                  style={{ color: "var(--hbx-danger)", borderColor: "var(--hbx-danger)" }}>
                  Limpar dados
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Pareamento guiado do concierge: uma única ação humana abre o QR. O código
// usa os mesmos endpoints canônicos do modal completo, acompanha o estado real
// e fecha sozinho apenas quando o backend confirma `connected`.
export function WhatsAppSetupQrModal({ open, onClose, onConnected }: {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const pairingRef = useRef(false);
  const pollingRef = useRef(false);
  const finishedRef = useRef(false);
  const pausedRef = useRef(false);
  const deadlineRef = useRef(0);
  const generationRef = useRef(0);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const finish = useCallback((res: WhatsAppModalPayload, generation: number) => {
    if (generation !== generationRef.current || finishedRef.current) return;
    finishedRef.current = true;
    // Espelhamento é best-effort aqui: a confirmação da conexão não pode ficar
    // presa a uma etapa posterior de sincronização de conversas.
    void bootstrapWhatsAppAfterConnect(res).catch(() => null);
    onConnected();
    onClose();
  }, [onClose, onConnected]);

  const tick = useCallback(async (generation: number) => {
    if (generation !== generationRef.current || pollingRef.current || finishedRef.current || pausedRef.current) return;
    if (Date.now() >= deadlineRef.current) {
      pausedRef.current = true;
      setLoading(false);
      setError("Não foi possível gerar o QR Code agora.");
      return;
    }
    pollingRef.current = true;
    try {
      const pollingQr = pairingRef.current;
      let res = pollingQr ? await fetchWhatsAppModalQr() : await fetchWhatsAppModalStatus();
      if (generation !== generationRef.current) return;

      const healthyConnection = res.status === "connected"
        && res.data.enabled
        && res.data.configured
        && res.data.available
        && res.data.providerHealth === "healthy";
      if (healthyConnection) {
        finish(res, generation);
        return;
      }

      if (res.status === "connected" && res.data.providerHealth !== "healthy") {
        pausedRef.current = true;
        setError(sanitizeJidsInText(res.message) || "Não foi possível confirmar a conexão agora.");
        return;
      }

      if (!res.data.enabled || !res.data.configured || !res.data.available) {
        pausedRef.current = true;
        setError(sanitizeJidsInText(res.message) || "A conexão por QR Code não está disponível agora.");
        return;
      }

      if (["offline", "disconnected", "error"].includes(res.status) && !startedRef.current) {
        startedRef.current = true;
        res = await startWhatsAppModalSession();
        if (generation !== generationRef.current) return;
      }

      const connectedAfterStart = res.status === "connected"
        && res.data.enabled
        && res.data.configured
        && res.data.available
        && res.data.providerHealth === "healthy";
      if (connectedAfterStart) {
        finish(res, generation);
        return;
      }

      if (!pollingQr && !res.data.qrCodeDataUrl && (res.status === "waiting_qr" || res.status === "starting")) {
        res = await fetchWhatsAppModalQr();
        if (generation !== generationRef.current) return;
        const connectedFromQr = res.status === "connected"
          && res.data.enabled
          && res.data.configured
          && res.data.available
          && res.data.providerHealth === "healthy";
        if (connectedFromQr) {
          finish(res, generation);
          return;
        }
      }

      const qrStillStarting = res.errorCode === "WHATSAPP_MODAL_QR_UNAVAILABLE"
        && (res.status === "waiting_qr" || res.status === "starting");
      const terminalFailure = (!res.success && !qrStillStarting)
        || res.status === "error"
        || (startedRef.current && (res.status === "offline" || res.status === "disconnected"));
      if (terminalFailure) {
        pairingRef.current = false;
        pausedRef.current = true;
        setQr(null);
        setError(sanitizeJidsInText(res.data?.lastError || res.message) || "Não foi possível gerar o QR Code.");
        return;
      }

      pairingRef.current = res.status === "waiting_qr" || res.status === "starting";
      setQr(res.data?.qrCodeDataUrl || null);
      setError(null);
    } catch (err) {
      if (generation === generationRef.current) {
        pausedRef.current = true;
        setError(err instanceof Error ? err.message : "Não foi possível gerar o QR Code.");
      }
    } finally {
      if (generation === generationRef.current) {
        pollingRef.current = false;
        setLoading(false);
      }
    }
  }, [finish]);

  useEffect(() => {
    if (!open) return;
    const generation = ++generationRef.current;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    startedRef.current = false;
    pairingRef.current = false;
    finishedRef.current = false;
    pausedRef.current = false;
    pollingRef.current = false;
    deadlineRef.current = Date.now() + 120_000;
    let timer: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      setQr(null);
      setError(null);
      setLoading(true);
      closeButtonRef.current?.focus();
      void tick(generation);
      timer = window.setInterval(() => { void tick(generation); }, 4000);
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (focusable.length === 1 || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      window.cancelAnimationFrame(frame);
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("keydown", handleKeyDown);
      const previousFocus = previousFocusRef.current;
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [onClose, open, tick]);

  if (!open) return null;

  function retry() {
    startedRef.current = false;
    pairingRef.current = false;
    pausedRef.current = false;
    deadlineRef.current = Date.now() + 120_000;
    setError(null);
    setLoading(true);
    void tick(generationRef.current);
  }

  return (
    <div className="hbx-veil wa-setup-veil" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={modalRef} className="hbx-modal wa-setup-modal" role="dialog" aria-modal="true" aria-label="Conectar WhatsApp por QR Code">
        <button ref={closeButtonRef} type="button" className="wa-setup-close" onClick={onClose} aria-label="Fechar">×</button>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="wa-setup-qr" src={qr} alt="QR Code para conectar o WhatsApp" width={240} height={240} />
        ) : error ? (
          <div className="wa-setup-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn-teal" onClick={retry}>Tentar novamente</button>
          </div>
        ) : (
          <span className="wa-setup-loading" aria-label={loading ? "Gerando QR Code" : "Aguardando QR Code"} />
        )}
      </div>
    </div>
  );
}
