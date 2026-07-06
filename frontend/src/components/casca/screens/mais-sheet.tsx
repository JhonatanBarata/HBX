"use client";

// MOBILE-CASCA/W5 — folha "MAIS" (CascaSheet aberta pela tab bar, transição de
// baixo). Linhas 52px (densidade própria desta folha — mais compacta que as
// listas irmãs de 56-64px, porque aqui é um menu de itens curtos, não uma
// lista de registros). Perfil no topo, Notificações (sheet simples),
// Relatórios (fallback central), Tutorial, Configurações (navega, transição
// IR), Tema (modo + pele, controles compactos), Tela cheia (toggle + toast
// central LEI do dono), Sair (vermelho, confirmação em sheet).
//
// Zero backend novo — mesmos endpoints do desktop (shell.tsx / theme-attributes).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Av, I, ICONS, subscribeToThemeMode, useCurrentUser } from "@/components/hbx/shell";
import { applyThemeSoft, DEFAULT_PELE, getActivePele, PELES, setAppTheme, setThemeMode } from "@/components/hbx/theme-attributes";
import { apiFetch, clearToken } from "@/lib/api";

import { CascaSheet, toggleCascaFullscreen } from "../index";
import { companyName, displayName, fmtWhen, type MasterNotice } from "./mais-types";

// ---------------------------------------------------------------
// Sub-sheet: Notificações (lê o mesmo /vendas/master-notices que o sino do
// desktop consome; ack por clique, mesmo contrato).
// ---------------------------------------------------------------
function NotificacoesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notices, setNotices] = useState<MasterNotice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    apiFetch<{ notices?: MasterNotice[] }>("/vendas/master-notices")
      .then(res => { if (alive) setNotices(Array.isArray(res?.notices) ? res.notices : []); })
      .catch(() => { if (alive) setNotices([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  async function ack(n: MasterNotice) {
    setNotices(prev => prev.map(x => x.id === n.id ? { ...x, acknowledged: true } : x));
    try {
      await apiFetch(`/vendas/master-notices/${encodeURIComponent(n.id)}/ack`, { method: "POST", body: JSON.stringify({}) });
    } catch { /* otimista — mantém marcado localmente */ }
  }

  return (
    <CascaSheet open={open} title="Notificações" onClose={onClose}>
      <div className="mais-m__notif">
        {loading && <p className="mais-m__notif-msg">Carregando…</p>}
        {!loading && notices.length === 0 && <p className="mais-m__notif-msg">Nenhum aviso no momento.</p>}
        {!loading && notices.map(n => (
          <button
            key={n.id}
            className={"mais-m__notif-row" + (n.acknowledged ? "" : " is-unread")}
            onClick={() => ack(n)}
          >
            <span className="mais-m__notif-title">{n.title}</span>
            {n.body && <span className="mais-m__notif-body">{n.body}</span>}
            {n.createdAt && <span className="mais-m__notif-when">{fmtWhen(n.createdAt)}</span>}
          </button>
        ))}
      </div>
    </CascaSheet>
  );
}

// ---------------------------------------------------------------
// Controles compactos de Tema (modo claro/escuro + pele) — reusa
// setThemeMode/setAppTheme/PELES de theme-attributes (mesma fonte única do
// desktop), apresentação nova da casca (segmented + chips de pele). Exportado
// como TemaSection: a tela Configuracoes (Aparência) reusa o MESMO controle,
// sem duplicar lógica de tema.
// ---------------------------------------------------------------
export function TemaSection() {
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => (typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme-mode") : null),
    () => null,
  );
  const isDark = modeAttr === "dark";
  const [pele, setPele] = useState<string>(DEFAULT_PELE);

  useEffect(() => {
    setPele(getActivePele());
  }, []);

  function flipMode(next: "light" | "dark") {
    if ((next === "dark") === isDark) return;
    applyThemeSoft(() => setThemeMode(next));
  }

  function escolherPele(key: string) {
    setPele(key);
    setAppTheme(key);
  }

  return (
    <div className="mais-m__tema">
      <div className="mais-m__tema-row">
        <span className="mais-m__tema-label">Modo</span>
        <div className="casca-segment mais-m__mode-seg">
          <button
            className={"casca-segment__item" + (!isDark ? " is-on" : "")}
            onClick={() => flipMode("light")}
          >
            <I d={ICONS.sun} size={13} /> Claro
          </button>
          <button
            className={"casca-segment__item" + (isDark ? " is-on" : "")}
            onClick={() => flipMode("dark")}
          >
            <I d={ICONS.moon} size={13} /> Escuro
          </button>
        </div>
      </div>
      <div className="mais-m__tema-row">
        <span className="mais-m__tema-label">Pele</span>
        <div className="mais-m__pele-chips">
          {PELES.map(p => (
            <button
              key={p.key}
              className={"mais-m__pele-chip" + (pele === p.key ? " is-on" : "")}
              onClick={() => escolherPele(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Linha 52px reusável do menu "Mais".
// ---------------------------------------------------------------
function MaisRow({ icon, label, danger, onClick }: { icon: string; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button className={"mais-m__row" + (danger ? " is-danger" : "")} onClick={onClick}>
      <span className="mais-m__row-ico"><I d={ICONS[icon]} size={17} /></span>
      <span className="mais-m__row-label">{label}</span>
      <I d={ICONS.arrow} size={14} />
    </button>
  );
}

export function MaisSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [notifOpen, setNotifOpen] = useState(false);
  const [sairConfirm, setSairConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [fsOn, setFsOn] = useState(false);

  useEffect(() => {
    if (!open) { setNotifOpen(false); setSairConfirm(false); }
  }, [open]);

  const irConfiguracoes = useCallback(() => {
    onClose();
    router.push("/configuracoes");
  }, [onClose, router]);

  async function sair() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch { /* sessão já inválida — segue limpando o cliente */ }
    clearToken();
    try { localStorage.removeItem("hbx:brain:session-start"); } catch { /* sem storage */ }
    router.replace("/login");
  }

  async function alternarTelaCheia() {
    const active = await toggleCascaFullscreen();
    setFsOn(active);
  }

  return (
    <>
      <CascaSheet open={open && !sairConfirm} title="Mais" onClose={onClose}>
        <div className="mais-m">
          {/* Perfil */}
          <div className="mais-m__perfil">
            <Av name={displayName(user)} src={user?.avatarUrl} size={44} />
            <div className="mais-m__perfil-main">
              <strong className="mais-m__perfil-nome">{displayName(user)}</strong>
              <span className="mais-m__perfil-empresa">{companyName(user)}</span>
            </div>
          </div>

          <div className="mais-m__list">
            <MaisRow icon="bell" label="Notificações" onClick={() => setNotifOpen(true)} />
            <MaisRow icon="relat" label="Relatórios" onClick={() => { onClose(); router.push("/relatorios"); }} />
            <MaisRow icon="help" label="Tutorial" onClick={() => { onClose(); router.push("/tutorial"); }} />
            <MaisRow icon="config" label="Configurações" onClick={irConfiguracoes} />
          </div>

          <TemaSection />

          <button className="mais-m__row mais-m__fs" onClick={alternarTelaCheia}>
            <span className="mais-m__row-ico"><I d={ICONS.grid} size={17} /></span>
            <span className="mais-m__row-label">Tela cheia</span>
            <span className={"mais-m__fs-sw" + (fsOn ? " is-on" : "")} aria-hidden="true" />
          </button>

          <button className="mais-m__row is-danger mais-m__sair" onClick={() => setSairConfirm(true)}>
            <span className="mais-m__row-ico"><I d={ICONS.x} size={17} /></span>
            <span className="mais-m__row-label">Sair</span>
          </button>
        </div>
      </CascaSheet>

      <CascaSheet open={sairConfirm} title="Sair da conta" onClose={() => setSairConfirm(false)}>
        <div className="mais-m__confirm">
          <p>Tem certeza que quer sair? Você precisará entrar de novo para acessar o HBX.</p>
          <div className="mais-m__confirm-acts">
            <button className="mais-m__confirm-cancel" onClick={() => setSairConfirm(false)} disabled={signingOut}>Cancelar</button>
            <button className="mais-m__confirm-ok" onClick={sair} disabled={signingOut}>{signingOut ? "Saindo…" : "Sair"}</button>
          </div>
        </div>
      </CascaSheet>

      <NotificacoesSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
