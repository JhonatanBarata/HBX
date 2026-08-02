"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { MOBILE_APK_URL } from "@/lib/app-mobile";

import styles from "./mobile-device-panel.module.css";

// O NÍVEL (Administrador / Gerente / Membro operacional) NÃO se escolhe aqui:
// ele vem do cadastro da pessoa em Gerencial → Equipe. Esta tela escolhe DE QUEM
// é o código e MOSTRA o nível que o celular vai herdar — "mostra num lugar,
// edita num lugar".
type PairingTarget = {
  id: number;
  name: string;
  level: "dono" | "gerente" | "vendedor" | "user" | "master";
  levelLabel: string;
  operationalLabel: string;
  isSelf: boolean;
  activeDevices: number;
};

type PairingTargetsResponse = {
  canPairOthers: boolean;
  maxDevicesPerUser: number;
  targets: PairingTarget[];
};

type PairingCodeResponse = {
  code: string;
  expiresAt: string;
  expiresInSeconds: number;
  target?: (Omit<PairingTarget, "activeDevices"> & { activeDevices?: number }) | null;
};

type MobileDevice = {
  id: string;
  name?: string | null;
  platform?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  active: boolean;
  userId?: number;
  ownerName?: string | null;
  isSelf?: boolean;
};

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
  const [targets, setTargets] = useState<PairingTargetsResponse | null>(null);
  const [targetId, setTargetId] = useState<string>("");

  const canPairOthers = Boolean(targets?.canPairOthers && (targets?.targets?.length || 0) > 1);
  const selfTarget = targets?.targets.find(t => t.isSelf) || null;
  const selectedTarget = targets?.targets.find(t => String(t.id) === targetId) || selfTarget;
  const maxDevices = targets?.maxDevicesPerUser || 4;

  const loadDevices = useCallback(async (companyWide: boolean) => {
    try {
      const result = await apiFetch<MobileDevice[]>(`/mobile/devices${companyWide ? "?scope=company" : ""}`);
      setDevices(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os aparelhos.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Sem a lista de alvos (funcionário comum, ou falha) a tela segue exatamente
  // como era: gera o código da própria conta.
  const loadTargets = useCallback(async () => {
    try {
      const result = await apiFetch<PairingTargetsResponse>("/mobile/devices/pairing-targets");
      const list = Array.isArray(result?.targets) ? result.targets : [];
      setTargets({ ...result, targets: list });
      const self = list.find(t => t.isSelf);
      if (self) setTargetId(String(self.id));
      return Boolean(result?.canPairOthers && list.length > 1);
    } catch {
      setTargets(null);
      return false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTargets().then(companyWide => loadDevices(companyWide));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDevices, loadTargets]);

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
      const alvo = Number(targetId || 0);
      const paraOutro = canPairOthers && alvo > 0 && !selectedTarget?.isSelf;
      const result = await apiFetch<PairingCodeResponse>("/mobile/devices/pairing-code", {
        method: "POST",
        body: JSON.stringify(paraOutro ? { targetUserId: alvo } : {}),
      });
      setPairing(result);
      setNow(Date.now());
      setMessage(paraOutro
        ? `Código criado para ${result?.target?.name || selectedTarget?.name}. Entregue a ele e peça para digitar no aplicativo.`
        : "Código criado. Digite-o no aplicativo deste aparelho.");
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
    const dono = !device.isSelf && device.ownerName ? ` de ${device.ownerName}` : "";
    const confirmed = window.confirm(`Desconectar ${device.name || "este aparelho"}${dono}? Ele pedirá um novo código no próximo acesso.`);
    if (!confirmed) return;

    setRevokingId(device.id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/mobile/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" });
      setMessage("Aparelho desconectado.");
      await loadDevices(canPairOthers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desconectar o aparelho.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="work" style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <section className="panel">
        <div className="panel-head" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <I d={ICONS.phone} size={18} /> HBX Logística
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
              <strong>1. Instale o HBX Logística</strong>
              <p className={styles.description}>
                Um único aplicativo reúne Vendas e Logística. Ele não exibe o site HBX nem pede e-mail e senha.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                <a className="btn-ghost" href={MOBILE_APK_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "none", justifyContent: "center" }}>
                  Baixar HBX Logística
                </a>
              </div>
            </article>

            <article className={styles.setupCard}>
              <strong>2. Gere o código deste usuário</strong>
              <p className={styles.description}>
                O código vale por 10 minutos, funciona uma única vez e vincula o celular à conta escolhida.
              </p>

              {canPairOthers && (
                <div className={styles.targetField}>
                  <label className={styles.targetLabel} htmlFor="hbx-pairing-target">Gerar código para</label>
                  <select
                    id="hbx-pairing-target"
                    className="field-dark"
                    value={targetId}
                    disabled={busy}
                    onChange={e => { setTargetId(e.target.value); setPairing(null); setMessage(null); setError(null); }}
                  >
                    {(targets?.targets || []).map(t => (
                      <option key={t.id} value={String(t.id)}>
                        {t.isSelf ? `${t.name} (você)` : t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* O nível é do CADASTRO — aqui só se vê o que o celular vai herdar. */}
              {selectedTarget && (
                <p className={styles.levelLine}>
                  Entra como <strong>{selectedTarget.levelLabel}</strong> · {selectedTarget.operationalLabel}
                  {" · "}{selectedTarget.activeDevices} de {maxDevices} aparelhos
                </p>
              )}

              <button className="btn-teal" onClick={generateCode} disabled={busy}>
                {busy ? "Gerando…" : pairing && remainingSeconds > 0 ? "Gerar outro código" : "Gerar código de vinculação"}
              </button>

              {canPairOthers && (
                <Link className={styles.levelLink} href="/gerencial?aba=4&novo=1">
                  Mudar o nível ou cadastrar alguém novo → Gerencial · Equipe
                </Link>
              )}
            </article>
          </div>

          {pairing && remainingSeconds > 0 && (
            <article className={styles.pairingCard}>
              <span className={styles.pairingLabel}>
                {pairing.target && !pairing.target.isSelf
                  ? `Digite no aplicativo de ${pairing.target.name}`
                  : "Digite no aplicativo"}
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
              {canPairOthers
                ? `Aparelhos de toda a equipe. Cada usuário pode manter até ${maxDevices} aparelhos ativos. Desconectar corta o acesso imediatamente.`
                : `Cada usuário pode manter até ${maxDevices} aparelhos ativos. Desconectar corta o acesso imediatamente.`}
            </p>
          </div>
          <button className="btn-ghost" onClick={() => void loadDevices(canPairOthers)} disabled={loading}>
            Atualizar
          </button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 10 }}>
          {loading && <p className={styles.loading} style={{ margin: 0 }}>Carregando aparelhos…</p>}
          {!loading && devices.length === 0 && (
            <div className={styles.empty}>
              {canPairOthers
                ? "Nenhum aparelho foi vinculado nesta empresa."
                : "Nenhum aparelho foi vinculado a esta conta."}
            </div>
          )}
          {devices.map(device => (
            <article key={device.id} className={`${styles.device} ${device.active ? "" : styles.deviceInactive}`}>
              <div style={{ display: "grid", gap: 4 }}>
                <strong>
                  {device.name || "Aparelho Android"}
                  {canPairOthers && device.ownerName && (
                    <span className={styles.deviceOwner}>
                      {device.isSelf ? `${device.ownerName} (você)` : device.ownerName}
                    </span>
                  )}
                </strong>
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
