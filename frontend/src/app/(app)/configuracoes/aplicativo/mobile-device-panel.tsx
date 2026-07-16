"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import styles from "./mobile-device-panel.module.css";

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

const MOBILE_APK_URL = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "/download/android-logistica").trim();

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
    const timer = window.setTimeout(() => {
      void loadDevices();
    }, 0);
    return () => window.clearTimeout(timer);
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
            <p className={styles.description} style={{ margin: "5px 0 0" }}>
              Este aparelho será ligado à mesma conta que você já usa no HBX web.
            </p>
          </div>
          <Link className="btn-ghost" href="/configuracoes" style={{ textDecoration: "none" }}>
            Voltar às configurações
          </Link>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 18 }}>
          <div className={styles.setupGrid}>
            <article className={styles.setupCard}>
              <strong>1. Instale o aplicativo HBX</strong>
              <p className={styles.description}>
                Um único aplicativo reúne Vendas e Logística. Ele não exibe o site HBX nem pede e-mail e senha.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                <a className="btn-ghost" href={MOBILE_APK_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none", justifyContent: "center" }}>
                  Baixar aplicativo HBX
                </a>
              </div>
            </article>

            <article className={styles.setupCard}>
              <strong>2. Gere o código deste usuário</strong>
              <p className={styles.description}>
                O código vale por 10 minutos, funciona uma única vez e vincula o celular à sua própria conta.
              </p>
              <button className="btn-teal" onClick={generateCode} disabled={busy}>
                {busy ? "Gerando…" : pairing && remainingSeconds > 0 ? "Gerar outro código" : "Gerar código de vinculação"}
              </button>
            </article>
          </div>

          {pairing && remainingSeconds > 0 && (
            <article className={styles.pairingCard}>
              <span className={styles.pairingLabel}>
                Digite no aplicativo
              </span>
              <button
                type="button"
                onClick={copyCode}
                title="Copiar código"
                className={styles.pairingCode}
              >
                {groupedCode}
              </button>
              <span className={`${styles.countdown} ${remainingSeconds <= 60 ? styles.countdownUrgent : ""}`}>
                Expira em {formatCountdown(remainingSeconds)}
              </span>
            </article>
          )}

          {pairing && remainingSeconds <= 0 && (
            <div className={styles.expired}>
              O código expirou. Gere outro para vincular o aparelho.
            </div>
          )}

          {(message || error) && (
            <div className={`${styles.message} ${error ? styles.messageError : ""}`}>
              {error || message}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Aparelhos vinculados</h2>
            <p className={styles.description} style={{ margin: "5px 0 0" }}>
              Cada usuário pode manter até 4 aparelhos ativos. Desconectar corta o acesso imediatamente.
            </p>
          </div>
          <button className="btn-ghost" onClick={() => void loadDevices()} disabled={loading}>
            Atualizar
          </button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 10 }}>
          {loading && <p className={styles.loading} style={{ margin: 0 }}>Carregando aparelhos…</p>}
          {!loading && devices.length === 0 && (
            <div className={styles.empty}>
              Nenhum aparelho foi vinculado a esta conta.
            </div>
          )}
          {devices.map(device => (
            <article key={device.id} className={`${styles.device} ${device.active ? "" : styles.deviceInactive}`}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong>{device.name || "Aparelho Android"}</strong>
                <span className={styles.deviceMeta}>
                  {device.active ? "Ativo" : "Desconectado"} · Último acesso: {formatDate(device.lastUsedAt)}
                </span>
                <span className={styles.deviceCreated}>
                  Vinculado em {formatDate(device.createdAt)}
                </span>
              </div>
              {device.active && (
                <button
                  className={`btn-ghost ${styles.revoke}`}
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
