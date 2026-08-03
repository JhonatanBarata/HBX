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

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { Av, I, ICONS, type SignalState, subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, getCascaAtiva, getCorAtiva, getMaterialAtivo, hexDaCor, setCor, setMaterial, setThemeMode } from "@/components/hbx/theme-attributes";
import { CORES, MATERIAIS, escolheModo, getCasca, type MaterialKey } from "@/lib/aparencia";
import { apiFetch } from "@/lib/api";
import { getInitialGeoState, hasStoredGeo, subscribeGeoUpdated, toggleGeoRadar } from "@/lib/geo-radar";
import { logout } from "@/lib/logout";

import { CascaSheet, toggleCascaFullscreen } from "../index";
import { companyName, displayName, fmtWhen, type MasterNotice, useMaisCurrentUser } from "./mais-types";

// ---------------------------------------------------------------
// Localização: MESMO mecanismo/estado do pin "Usar minha localização no
// Radar" do desktop (shell.tsx ~linha 1467, geoState/toggleGeo) — reusado via
// lib/geo-radar.ts (fonte única, nunca duplicar a lógica). Linha 52px com os
// 3 estados visíveis (ativo verde-marca / aguardando amarelo / inativo cinza).
// ---------------------------------------------------------------
function LocalizacaoRow() {
  const [geoState, setGeoState] = useState<SignalState>(getInitialGeoState());

  // Pós-montagem: acende se já havia localização salva (mesmo padrão do
  // desktop — requestAnimationFrame, não no corpo do effect).
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      if (hasStoredGeo()) setGeoState("active");
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, []);

  // Se outra tela (ex.: Buscar em Vendas) também mexer no estado global,
  // esta linha reflete sem precisar de 2ª lógica.
  useEffect(() => subscribeGeoUpdated(() => {
    setGeoState(hasStoredGeo() ? "active" : "off");
  }), []);

  const label = geoState === "active" ? "Ativa" : geoState === "error" ? "Aguardando…" : "Desligada";

  return (
    <button
      type="button"
      className="mais-m__row"
      onClick={() => toggleGeoRadar(geoState, setGeoState)}
      aria-pressed={geoState === "active"}
    >
      <span className="mais-m__row-ico"><I d={ICONS.mapin} size={17} /></span>
      <span className="mais-m__row-label">Localização no Radar</span>
      <span className={"tag" + (geoState === "active" ? " teal" : geoState === "error" ? " warn" : "")}>{label}</span>
    </button>
  );
}

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
    async function load() {
      if (!alive) return;
      setLoading(true);
      try {
        const res = await apiFetch<{ notices?: MasterNotice[] }>("/vendas/master-notices");
        if (alive) setNotices(Array.isArray(res?.notices) ? res.notices : []);
      } catch {
        if (alive) setNotices([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
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

type ComissaoSummary = {
  totals?: {
    activeClients?: number;
    pendingActivation?: number;
    payableAmount?: number;
    pendingAmount?: number;
    paidAmount?: number;
    nextDueAt?: string | null;
  };
  payouts?: Array<{
    id: string;
    status?: string | null;
    leadCount?: number | null;
    totalAmount?: number | null;
    referenceLabel?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
  }>;
};

function fmtComissao(value?: number | null): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ComissoesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [summary, setSummary] = useState<ComissaoSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function carregar() {
      setLoading(true);
      setErro(null);
      try {
        const res = await apiFetch<ComissaoSummary>("/vendas/commission/summary");
        if (alive) setSummary(res);
      } catch (err: unknown) {
        if (!alive) return;
        setSummary(null);
        setErro(err instanceof Error ? err.message : "Não foi possível carregar suas comissões.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void carregar();
    return () => { alive = false; };
  }, [open]);

  const totals = summary?.totals;
  const payouts = Array.isArray(summary?.payouts) ? summary.payouts : [];
  return (
    <CascaSheet open={open} title="Minhas comissões" onClose={onClose}>
      <div className="mais-m__commission">
        {loading ? <p className="mais-m__notif-msg">Carregando…</p> : null}
        {!loading && erro ? <p className="mais-m__commission-error">{erro}</p> : null}
        {!loading && !erro && totals ? (
          <>
            <div className="mais-m__commission-kpis">
              <div className="mais-m__commission-kpi">
                <span>A receber</span>
                <strong>{fmtComissao(totals.payableAmount)}</strong>
              </div>
              <div className="mais-m__commission-kpi">
                <span>Em ativação</span>
                <strong>{fmtComissao(totals.pendingAmount)}</strong>
              </div>
              <div className="mais-m__commission-kpi">
                <span>Já recebido</span>
                <strong>{fmtComissao(totals.paidAmount)}</strong>
              </div>
            </div>
            <div className="mais-m__commission-meta">
              <span>{totals.activeClients || 0} cliente{totals.activeClients === 1 ? " ativo" : "s ativos"}</span>
              <span>{totals.pendingActivation || 0} aguardando ativação</span>
            </div>
            <div className="mais-m__commission-title">Histórico</div>
            {payouts.length === 0 ? (
              <p className="mais-m__notif-msg">Nenhum pagamento registrado.</p>
            ) : (
              <div className="mais-m__commission-list">
                {payouts.map((payout) => (
                  <div className="mais-m__commission-row" key={payout.id}>
                    <div>
                      <strong>{payout.referenceLabel || "Comissão"}</strong>
                      <span>{payout.leadCount || 0} venda{payout.leadCount === 1 ? "" : "s"} · {fmtWhen(payout.paidAt || payout.createdAt)}</span>
                    </div>
                    <b>{fmtComissao(payout.totalAmount)}</b>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </CascaSheet>
  );
}

// ---------------------------------------------------------------
// Controles compactos de Tema (modo claro/escuro + cor) — reusa
// setThemeMode/setTema de theme-attributes (mesma fonte única do desktop),
// apresentação nova da casca (segmented + chips). Exportado como TemaSection:
// a tela Configuracoes (Aparência) reusa o MESMO controle, sem duplicar lógica.
//
// 28/07: passou a ler as capacidades da CASCA ativa (lib/aparencia.ts). Na
// Corporativa — clara fixa, um tema só — as duas linhas somem em vez de
// oferecer escolha que o contrato desfaz no próximo boot. A escolha de casca
// em si vive no menu Aparência do desktop; aqui é só cor e modo.
// ---------------------------------------------------------------
export function TemaSection() {
  const cascaKey = useSyncExternalStore(
    subscribeToThemeMode,
    () => (typeof document !== "undefined" ? getCascaAtiva() : "backup" as const),
    () => "backup" as const,
  );
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => (typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme-mode") : null),
    () => null,
  );
  const isDark = modeAttr === "dark";
  const modeKey = isDark ? "dark" : "light";
  const casca = getCasca(cascaKey);
  // lazy init: leitura síncrona do atributo já aplicado no <html> (boot inline
  // do layout.tsx já rodou antes da hidratação) — sem useEffect, sem
  // set-state-in-effect. Troca local (escolherCor) já mantém o state em dia.
  const [cor, setCorLocal] = useState<string | null>(() => (typeof document !== "undefined" ? getCorAtiva() : null));
  const [material, setMaterialLocal] = useState<MaterialKey>(() => (typeof document !== "undefined" ? getMaterialAtivo() : "vidro"));
  const [hexLivre, setHexLivre] = useState<string>(() => (typeof document !== "undefined" ? hexDaCor(getCorAtiva()) : "#000000"));

  // Seleção ativa = SEMPRE Glass Pill deslizante (Lei nº2, docs/Rules/FRONTEND.md)
  // — mesmo par hook+componente que Conversas (conversas-lista.tsx) já usa.
  const modeGp = useGlassPill<HTMLButtonElement>(modeKey);
  const materialGp = useGlassPill<HTMLButtonElement>(material, MATERIAIS.length);

  function flipMode(next: "light" | "dark") {
    if ((next === "dark") === isDark) return;
    applyThemeSoft(() => setThemeMode(next));
  }

  function escolherCor(valor: string) {
    setCorLocal(valor);
    setCor(valor);
  }

  function escolherMaterial(key: MaterialKey) {
    setMaterialLocal(key);
    setMaterial(key);
  }

  return (
    <div className="mais-m__tema">
      {escolheModo(casca) && (
      <div className="mais-m__tema-row">
        <span className="mais-m__tema-label">Modo</span>
        <div className="casca-segment mais-m__mode-seg glass-pill-track" role="tablist" aria-label="Modo claro ou escuro">
          <GlassPill {...modeGp} />
          <button
            type="button"
            role="tab"
            aria-selected={!isDark}
            ref={modeGp.itemRef("light")}
            className={"casca-segment__item glass-pill-item" + (!isDark ? " is-on" : "")}
            onClick={() => flipMode("light")}
          >
            <I d={ICONS.sun} size={13} /> Claro
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isDark}
            ref={modeGp.itemRef("dark")}
            className={"casca-segment__item glass-pill-item" + (isDark ? " is-on" : "")}
            onClick={() => flipMode("dark")}
          >
            <I d={ICONS.moon} size={13} /> Escuro
          </button>
        </div>
      </div>
      )}
      {/* COR — a MESMA grade do desktop (classes .aparencia__*), não uma
          segunda versão dela. A fila de chips com nome que vivia aqui servia
          6 cores; com a grade livre ela viraria uma tira de 17 nomes rolando
          de lado. Bolinha resolve em um toque e cabe na largura do celular. */}
      <div className="mais-m__tema-row">
        <span className="mais-m__tema-label">Cor</span>
        <div className="aparencia__grade" role="radiogroup" aria-label="Cor do sistema">
          {CORES.map(c => (
            <button
              type="button"
              role="radio"
              aria-checked={c.key === cor}
              aria-label={c.nome}
              key={c.key}
              data-cor-key={c.key}
              className={"aparencia__cor" + (c.key === cor ? " is-on" : "")}
              onClick={() => escolherCor(c.key)}
            />
          ))}
          {/* A 6ª bolinha: o seletor livre, na MESMA fila (ver kit.css). */}
          <span
            className={"aparencia__cor aparencia__cor--livre" + (cor && !CORES.some(c => c.key === cor) ? " is-on" : "")}
            title="Escolher outra cor"
          >
            <input
              type="color"
              value={hexLivre}
              aria-label="Escolher outra cor"
              onChange={e => { setHexLivre(e.target.value); escolherCor(e.target.value); }}
            />
          </span>
          {cor && !CORES.some(c => c.key === cor) && (
            <span className="aparencia__cor-hex hbx-mono">{cor.toUpperCase()}</span>
          )}
        </div>
      </div>

      {/* MATERIAL — aqui aplica NA HORA, como o modo. O celular não tem o
          botão Aplicar do desktop: esta folha é de ajuste direto. */}
      <div className="mais-m__tema-row">
        <span className="mais-m__tema-label">Material</span>
        <div className="casca-segment mais-m__mode-seg glass-pill-track" role="tablist" aria-label="Material das superfícies">
          <GlassPill {...materialGp} />
          {MATERIAIS.map(m => (
            <button
              type="button"
              role="tab"
              aria-selected={material === m.key}
              key={m.key}
              ref={materialGp.itemRef(m.key)}
              className={"casca-segment__item glass-pill-item" + (material === m.key ? " is-on" : "")}
              onClick={() => escolherMaterial(m.key)}
            >
              {m.label}
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
  const user = useMaisCurrentUser();
  const [notifOpen, setNotifOpen] = useState(false);
  const [comissoesOpen, setComissoesOpen] = useState(false);
  const [sairConfirm, setSairConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [fsOn, setFsOn] = useState(false);

  // Reset das sub-sheets ao fechar "Mais" — ajuste de state DURANTE o render
  // (padrão oficial React "adjust state while rendering", mesmo usado no
  // useCascaExitGate central), sem useEffect/set-state-in-effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (!open) { setNotifOpen(false); setComissoesOpen(false); setSairConfirm(false); }
  }

  const capabilities = user?.operationalCapabilities;
  const podeVerComissoes = Array.isArray(capabilities)
    ? capabilities.includes("SELLER")
    : user?.userKind === "seller" || String(user?.role || "").toUpperCase() === "USER";

  const irConfiguracoes = useCallback(() => {
    onClose();
    router.push("/configuracoes");
  }, [onClose, router]);

  async function sair() {
    if (signingOut) return;
    setSigningOut(true);
    // Helper único (lib/logout.ts): POST best-effort + limpeza + transição de
    // saída + landing.
    await logout();
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
            {podeVerComissoes ? <MaisRow icon="money" label="Minhas comissões" onClick={() => setComissoesOpen(true)} /> : null}
            <MaisRow icon="relat" label="Relatórios" onClick={() => { onClose(); router.push("/relatorios"); }} />
            <MaisRow icon="help" label="Tutorial" onClick={() => { onClose(); router.push("/tutorial"); }} />
            <MaisRow icon="config" label="Configurações" onClick={irConfiguracoes} />
          </div>

          <TemaSection />

          <button type="button" className="mais-m__row mais-m__fs" onClick={alternarTelaCheia}>
            <span className="mais-m__row-ico"><I d={ICONS.grid} size={17} /></span>
            <span className="mais-m__row-label">Tela cheia</span>
            <span className={"mais-m__fs-sw" + (fsOn ? " is-on" : "")} aria-hidden="true" />
          </button>

          <LocalizacaoRow />

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
      <ComissoesSheet open={comissoesOpen} onClose={() => setComissoesOpen(false)} />
    </>
  );
}
