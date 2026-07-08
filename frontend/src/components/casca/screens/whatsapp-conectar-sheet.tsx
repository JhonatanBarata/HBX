"use client";

// MOBILE-CASCA — folha "Conexão WhatsApp" (chamada pela faixa de aviso da
// tela Conversas quando o chip está desconectado/reconectando). Reusa o
// fluxo canônico de src/lib/whatsapp-connection-flow.ts — ZERO mecanismo de
// conexão novo, só apresentação nova (5 Leis: classes centrais, sem hex/
// inline). Comportamento espelha o modal desktop
// (components/hbx/whatsapp-connect-modal.tsx):
//   status → start (gera QR) OU pairing-code → leitura → connected →
//   bootstrap (espelha conversas/contatos) → onConnected().
//
// Diferença de apresentação (mobile): Código é o método PADRÃO (não dá pra
// escanear a própria tela no celular); QR fica como método secundário para
// quem vai conectar por um 2º aparelho.
//
// Regra dura (docs/Rules/WHATSAPP.md): o motor só é tocado durante o
// pareamento ATIVO dentro desta folha, com poll 4s limitado, SÓ enquanto a
// folha está aberta (cleanup no unmount/fechar). Sem retry automático fora
// disso. Nunca API crua do motor — só as funções do fluxo canônico.

import { useCallback, useEffect, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import {
  bootstrapWhatsAppAfterConnect,
  disconnectWhatsAppModalSession,
  fetchWhatsAppModalQr,
  fetchWhatsAppModalStatus,
  requestWhatsAppPairingCode,
  startWhatsAppModalSession,
} from "@/lib/whatsapp-connection-flow";
import {
  formatWhatsAppDateTime,
  whatsappModalStatusLabel,
  type WhatsAppModalPayload,
  type WhatsAppPairingCodePayload,
} from "@/lib/whatsapp-center";

import { CascaSheet } from "../transitions";
import { brPhoneToE164, formatBrPhone, isBrPhoneComplete, toLocalDigits } from "@/lib/br-phone";

// Nunca deixar um JID técnico (5519999999999@s.whatsapp.net, @lid, @g.us...)
// vazar pra tela — mesmos helpers do modal desktop (não exportados de lá,
// replicados aqui 1:1).
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

function sanitizeJidsInText(text: string | null | undefined): string {
  return String(text || "")
    .replace(/\+?(\d{8,15})@(?:s\.whatsapp\.net|c\.us)/gi, (_full, d: string) => prettyPhone(d) || `+${d}`)
    .replace(/\s*\S+@(?:lid|g\.us|broadcast|newsletter)/gi, "")
    .trim();
}

type Method = "code" | "qr";

export function WhatsAppConectarSheet({ open, onClose, onConnected, defaultPhoneDigits }: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
  defaultPhoneDigits?: string;
}) {
  const [payload, setPayload] = useState<WhatsAppModalPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);
  // Código é o método PADRÃO no mobile (sem câmera pra escanear a própria tela).
  const [method, setMethod] = useState<Method>("code");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [pairing, setPairing] = useState<WhatsAppPairingCodePayload | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const bootstrappedKey = useRef<string | null>(null);
  const statusRef = useRef<string | null>(null);

  // Mesmo padrão do modal desktop: enquanto pareando ativamente por QR
  // (waiting_qr/starting), o poll vai no /qr (mantém o QR vivo); fora disso
  // vai no /status (leitura pura do banco). O motor só é tocado AQUI, dentro
  // da folha aberta — a faixa da tela de Conversas segue lendo só o banco.
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

  // Poll 4s SÓ enquanto a folha está aberta — limpo no unmount/fechar. Sem
  // retry infinito fora disso (regra dura de WhatsApp).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    statusRef.current = null; // reabrir/trocar método não herda waiting_qr antigo
    void refresh();
    const timer = setInterval(async () => {
      if (!alive) return;
      const res = await refresh();
      if (!res || !alive) return;
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

  const status = payload?.status || "offline";
  const qr = payload?.data?.qrCodeDataUrl || null;
  const connected = status === "connected";
  const sessionId = payload?.data?.tenantKey || "";
  // Enquanto o usuário não digitou, mostra o telefone pré-preenchido (entrega
  // passa o contato da empresa em dígitos locais). Sem useEffect → sem setState
  // dentro de efeito.
  const effectiveDigits = phoneTouched ? phone : toLocalDigits(defaultPhoneDigits ?? "");
  const phoneOk = isBrPhoneComplete(effectiveDigits);
  const canStartQr = !busy && ["offline", "disconnected", "error"].includes(status);

  async function generatePairing() {
    if (busy) return;
    if (!sessionId) { setError("Sessão WhatsApp ainda não carregou — clique em Atualizar status."); return; }
    if (!phoneOk) { setError("Informe o telefone com DDD, ex.: (19)99702-4884."); return; }
    setBusy(true);
    setError(null);
    setBootstrapMsg(null);
    try {
      const res = await requestWhatsAppPairingCode(sessionId, brPhoneToE164(effectiveDigits));
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

  async function startQr() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setBootstrapMsg(null);
    try {
      const res = await startWhatsAppModalSession();
      statusRef.current = res?.status ?? null;
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
      statusRef.current = res?.status ?? null;
      setPayload(res);
      bootstrappedKey.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CascaSheet open={open} title="Conexão WhatsApp" onClose={onClose}>
      <div className="wa-conectar">
        <div className="wa-conectar__status">
          <span className={"tag" + (connected ? " teal" : status === "error" ? " red" : " warn")}>
            {whatsappModalStatusLabel(status)}
          </span>
          {prettyPhone(payload?.data?.phone) ? (
            <span className="wa-conectar__phone">{prettyPhone(payload?.data?.phone)}</span>
          ) : null}
        </div>

        {payload?.message ? (
          <p className="wa-conectar__msg">{sanitizeJidsInText(payload.message)}</p>
        ) : null}
        {error ? <p className="wa-conectar__err">{error}</p> : null}
        {bootstrapMsg ? (
          <p className={"wa-conectar__boot" + (bootstrapMsg.startsWith("✓") ? " is-ok" : " is-err")}>{bootstrapMsg}</p>
        ) : null}

        {connected ? (
          <div className="wa-conectar__connected">
            <span className="badge-win">✓ WhatsApp conectado — pronto para receber e responder aqui</span>
            <div className="kv">
              <div className="row"><span className="k">Conectado em</span><span className="v wa-conectar__mono">{formatWhatsAppDateTime(payload?.data?.connectedAt)}</span></div>
              <div className="row"><span className="k">Atualizado em</span><span className="v wa-conectar__mono">{formatWhatsAppDateTime(payload?.data?.updatedAt)}</span></div>
            </div>
            {confirmDisconnect ? (
              <button type="button" className="btn-ghost danger" disabled={busy} onClick={() => { setConfirmDisconnect(false); void disconnectAndNotify(); }}>
                Confirmar desconexão
              </button>
            ) : (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Desconectar</button>
            )}
          </div>
        ) : (
          <>
            <div className="seg-toggle wa-conectar__seg" role="tablist" aria-label="Forma de conexão">
              <button type="button" role="tab" aria-selected={method === "code"} className={"seg" + (method === "code" ? " on" : "")} onClick={() => { setMethod("code"); setError(null); }}>
                Código
              </button>
              <button type="button" role="tab" aria-selected={method === "qr"} className={"seg" + (method === "qr" ? " on" : "")} onClick={() => { setMethod("qr"); setError(null); }}>
                QR Code
              </button>
            </div>

            {method === "code" ? (
              <div className="wa-conectar__code">
                <input
                  className="field-dark"
                  inputMode="tel"
                  placeholder="(19)99702-4884"
                  value={formatBrPhone(effectiveDigits)}
                  onChange={e => { setPhoneTouched(true); setPhone(toLocalDigits(e.target.value)); }}
                />
                {pairing?.code ? (
                  <div className="wa-conectar__codebox">
                    <span className="wa-conectar__codebig">{pairing.code}</span>
                    <span className="badge-win">Código válido por {pairing.expiresInSeconds}s</span>
                    <span className="hint wa-conectar__center">
                      No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone, e digite este código.
                    </span>
                  </div>
                ) : (
                  <span className="hint">
                    Geramos um código para você digitar no WhatsApp do celular — sem precisar da câmera.
                  </span>
                )}
                <button type="button" className="btn-teal" disabled={busy || !phoneOk} onClick={generatePairing}>
                  <I d={ICONS.msg} size={14} /> {busy ? "Gerando…" : pairing?.code ? "Gerar novo código" : "Gerar código de pareamento"}
                </button>
              </div>
            ) : (
              <div className="wa-conectar__qr">
                {status === "waiting_qr" ? (
                  <div className="wa-conectar__qrbox">
                    {qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qr} alt="QR Code do WhatsApp" className="wa-conectar__qrimg" />
                    ) : (
                      <span className="hint">Gerando QR…</span>
                    )}
                    <span className="hint wa-conectar__center">
                      Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.
                    </span>
                  </div>
                ) : null}
                <button type="button" className="btn-teal" disabled={!canStartQr} onClick={startQr}>
                  <I d={ICONS.msg} size={14} /> {busy ? "Iniciando…" : "Conectar / gerar QR"}
                </button>
              </div>
            )}
          </>
        )}

        {payload?.data?.lastError && !connected ? (
          <p className="wa-conectar__lasterror">{payload.data.lastError}</p>
        ) : null}

        {!connected ? (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void refresh()}>Atualizar status</button>
        ) : null}
      </div>
    </CascaSheet>
  );
}
