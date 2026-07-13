"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type PairingCodeResponse = {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
};

type MobileDevice = {
  id: string;
  name?: string | null;
  platform?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  active: boolean;
};

const APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

function formatDate(value?: string | null) {
  if (!value) return "Ainda não usado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function MobileDevicePanel() {
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingCodeResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const result = await apiFetch<MobileDevice[]>("/mobile/devices");
      setDevices(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os aparelhos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  const remainingSeconds = useMemo(() => {
    if (!pairing) return 0;
    return Math.max(0, Math.ceil((new Date(pairing.expiresAt).getTime() - now) / 1_000));
  }, [now, pairing]);

  const groupedCode = pairing?.code
    ? `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}`
    : null;

  async function generateCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<PairingCodeResponse>("/mobile/devices/pairing-code", {
        method: "POST",
      });
      setPairing(result);
      setNow(Date.now());
      setMessage("Código criado. Digite-o no aplicativo deste aparelho.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o código.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!pairing?.code) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
      setMessage("Código copiado.");
    } catch {
      setMessage("Selecione o código e copie manualmente.");
    }
  }

  async function revokeDevice(device: MobileDevice) {
    if (revokingId) return;
    const confirmed = window.confirm(`Desconectar ${device.name || "este aparelho"}? Ele pedirá um novo código no próximo acesso.`);
    if (!confirmed) return;

    setRevokingId(device.id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/mobile/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      setMessage("Aparelho desconectado.");
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desconectar o aparelho.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="work" style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-head" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <I d={ICONS.phone} size={18} /> Aplicativo móvel
            </h2>
            <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: ".78rem" }}>
              Este aparelho será ligado à mesma conta que você já usa no HBX web.
            </p>
          </div>
          <Link className="btn-ghost" href="/configuracoes" style={{ textDecoration: "none" }}>
            Voltar às configurações
          </Link>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <article style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, display: "grid", gap: 10, background: "var(--panel-2, transparent)" }}>
              <strong>1. Instale o aplicativo</strong>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.5, fontSize: ".78rem" }}>
                Use o APK de testes do HBX. O aplicativo não exibirá a página pública nem pedirá e-mail e senha.
              </p>
              {APK_URL ? (
                <a className="btn-ghost" href={APK_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none", justifyContent: "center" }}>
                  Baixar aplicativo Android
                </a>
              ) : (
                <small style={{ color: "var(--text-muted)" }}>
                  O link de download será exibido aqui quando NEXT_PUBLIC_ANDROID_APK_URL estiver configurada.
                </small>
              )}
            </article>

            <article style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, display: "grid", gap: 10, background: "var(--panel-2, transparent)" }}>
              <strong>2. Gere o código deste usuário</strong>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.5, fontSize: ".78rem" }}>
                O código vale por 10 minutos, funciona uma única vez e vincula o celular à sua própria conta.
              </p>
              <button className="btn-teal" onClick={generateCode} disabled={busy}>
                {busy ? "Gerando…" : pairing && remainingSeconds > 0 ? "Gerar outro código" : "Gerar código de vinculação"}
              </button>
            </article>
          </div>

          {pairing && remainingSeconds > 0 && (
            <article style={{ border: "1px solid var(--hbx-brand)", borderRadius: 18, padding: 20, textAlign: "center", display: "grid", gap: 10, background: "color-mix(in srgb, var(--hbx-brand) 9%, transparent)" }}>
              <span style={{ color: "var(--text-muted)", fontSize: ".75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
                Digite no aplicativo
              </span>
              <button
                type="button"
                onClick={copyCode}
                title="Copiar código"
                style={{ border: 0, background: "transparent", color: "var(--text)", fontSize: "clamp(2rem, 8vw, 3.8rem)", fontWeight: 900, letterSpacing: ".15em", cursor: "pointer" }}
              >
                {groupedCode}
              </button>
              <span style={{ color: remainingSeconds <= 60 ? "var(--hbx-danger)" : "var(--text-muted)", fontWeight: 800 }}>
                Expira em {formatCountdown(remainingSeconds)}
              </span>
            </article>
          )}

          {pairing && remainingSeconds <= 0 && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14, color: "var(--text-muted)" }}>
              O código expirou. Gere outro para vincular o aparelho.
            </div>
          )}

          {(message || error) && (
            <div style={{ borderRadius: 12, padding: "10px 12px", fontWeight: 700, color: error ? "var(--hbx-danger)" : "var(--hbx-brand-strong)", background: error ? "color-mix(in srgb, var(--hbx-danger) 9%, transparent)" : "color-mix(in srgb, var(--hbx-brand) 9%, transparent)" }}>
              {error || message}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Aparelhos vinculados</h2>
            <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: ".78rem" }}>
              Cada usuário pode manter até 3 aparelhos ativos. Desconectar corta o acesso imediatamente.
            </p>
          </div>
          <button className="btn-ghost" onClick={() => void loadDevices()} disabled={loading}>
            Atualizar
          </button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 10 }}>
          {loading && <p style={{ margin: 0, color: "var(--text-muted)" }}>Carregando aparelhos…</p>}
          {!loading && devices.length === 0 && (
            <div style={{ border: "1px dashed var(--line)", borderRadius: 14, padding: 18, color: "var(--text-muted)" }}>
              Nenhum aparelho foi vinculado a esta conta.
            </div>
          )}
          {devices.map(device => (
            <article key={device.id} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", opacity: device.active ? 1 : .62 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong>{device.name || "Aparelho Android"}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: ".74rem" }}>
                  {device.active ? "Ativo" : "Desconectado"} · Último acesso: {formatDate(device.lastUsedAt)}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: ".7rem" }}>
                  Vinculado em {formatDate(device.createdAt)}
                </span>
              </div>
              {device.active && (
                <button
                  className="btn-ghost"
                  style={{ color: "var(--hbx-danger)" }}
                  disabled={revokingId === device.id}
                  onClick={() => void revokeDevice(device)}
                >
                  {revokingId === device.id ? "Desconectando…" : "Desconectar"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
