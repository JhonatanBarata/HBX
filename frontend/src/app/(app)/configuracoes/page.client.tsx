"use client";

// Tela Configurações (template docs/TEMAS/*/corporate/Configuracoes.html)
// ligada nos contratos reais:
//   - Perfil → GET /profile/current-user; salvar nome → PATCH /profile/display-name
//   - Empresa → company do current-user (somente leitura; sem PATCH no contrato)
//   - Equipe → GET /users/company (Admin; sem permissão mostra aviso);
//     Novo acesso → cadastro COMPLETO (components/hbx/novo-acesso-modal,
//     PR12062026005): POST /users/company/create + onboarding de documentos/
//     contrato do gerencial. Assento é GRÁTIS (CRÉDITOS FASE 2/R4) — sem aviso
//     de custo no convite.
//     Gerenciar → PATCH /users/:id/role e PATCH /users/:id/active
//   - E-mail (Admin) → módulo de e-mail POR EMPRESA (PR12062026005,
//     components/hbx/company-email-section): SMTP próprio, templates com "+",
//     disparos manuais do cadastro. HBX admin compartilha só o transporte do
//     Master (decidido no backend — nenhum endpoint master no front).
//   - Créditos (CRÉDITOS FASE 2 — REMOÇÃO) → GET /commercial-plans/me (estado
//     de acesso/módulos liberados) + GET /credits/me (carteira, via
//     CreditsWalletSection). O modelo de plano/tier/checkout de assinatura
//     mensal SAIU daqui: HBX agora é carteira de créditos pré-paga (1 crédito
//     = 1 lead); não há mais vitrine de planos, upgrade/downgrade com cobrança
//     proporcional nem assento pago (assento é grátis). PAGAMENTOS.md:
//     vendedor NUNCA vê a seção (ocultada por canViewBilling).
// Notificações seguem visuais (sem contrato). Campos sem dado no contrato
// (CNPJ, segmento, cidade, telefone do perfil) mostram vazio/“—”.

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CompanyEmailSection } from "@/components/hbx/company-email-section";
import { EmailAccountForm } from "@/components/hbx/email-account-form";
import { CreditsWalletSection } from "@/components/hbx/credits-wallet-section";
import { IndicacaoCard } from "./indicacao-card";
import { MetaLeadAdsSection } from "@/components/hbx/meta-lead-ads-section";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { Av, I, ICONS, useMyModules } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isCompanySeller, isTenantAdmin } from "@/lib/roles";
import { useTabParam } from "@/lib/use-tab-param";

// Equipe saiu de Configurações → vive agora em Gerencial → aba Equipe.
// "Integrações" (ARQ11 S2 item 3) — hoje só Meta Ads (Leads); admin da empresa configura
// pageId/token/webhook direto na tela em vez de curl na API.
// "Módulos" (PR10072026 W3): o dono liga/desliga as categorias de módulo da
// empresa (mesmas do OOBE) — GET /profile/module-categories/options + POST
// /profile/module-categories. Categoria travada pelo master (locked) não aparece.
const SECTIONS = ["Perfil & Empresa", "Meu e-mail", "E-mail", "Integrações", "Módulos", "Notificações", "Créditos"];
const SEC_IC: Record<string, string> = { "Perfil & Empresa": "users", "Meu e-mail": "send", "E-mail": "mail", "Integrações": "bolt", "Módulos": "grid", "Notificações": "bell", "Créditos": "money" };

type CurrentUser = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  userKind?: string | null;
  canViewBilling?: boolean | null;
  avatarUrl?: string | null;
  company?: { name?: string | null; contactPhone?: string | null; prospectingSegments?: string[] | null } | null;
} | null;

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  USER: "Vendas",
  MASTER: "Master",
};

// CRÉDITOS FASE 2: sobrou só o que ainda é lido (estado de acesso + módulos
// liberados) — catálogo de planos/preço/trial/cartão saiu (não há mais
// vitrine de plano nem checkout de assinatura nesta tela).
type CommercialPlansMe = {
  current?: {
    accessStateLabel?: string | null;
  };
} | null;

function Toggle({ on, set, disabled }: { on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return <button className={"sw" + (on ? " on" : "")} disabled={disabled} onClick={() => set(!on)} role="switch" aria-checked={on}><i></i></button>;
}

// Categorias de módulo — mesmos labels do OOBE (oobe-gate.tsx); o mapa
// categoria→módulos é fonte única no backend (modules/module-categories.ts).
const CATEGORIA_LABEL: Record<string, string> = {
  radar: "Radar de empresas",
  vendas: "Vendas e Agenda",
  whatsapp: "WhatsApp e IA",
  logistica: "Logística",
  website: "Website",
};

type CategoriaOpt = { key: string; enabled: boolean; locked: boolean };

function roleLabel(role?: string | null) {
  return ROLE_LABEL[String(role || "").toUpperCase()] || "Usuário";
}

export function ConfiguracoesClient() {
  const router = useRouter();
  const [sec, setSec] = useTabParam<string>("sec", "Perfil & Empresa", SECTIONS);
  const secGlassPill = useGlassPill<HTMLButtonElement>(sec);
  const mods = useMyModules();

  // aviso do sino → abre direto na seção (mesmo padrão do "+" → Novo lead).
  // "Equipe" saiu daqui — redireciona para /gerencial?aba=4 (aba Equipe lá).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const dica = sessionStorage.getItem("hbx:config-sec");
        if (dica) {
          sessionStorage.removeItem("hbx:config-sec");
          if (dica === "Equipe") {
            // Equipe migrou para Gerencial → aba 4
            const email = sessionStorage.getItem("hbx:config-membro-email");
            try { sessionStorage.removeItem("hbx:config-membro-email"); } catch { /* sem storage */ }
            if (email) {
              try { sessionStorage.setItem("hbx:gerencial-membro-email", email); } catch { /* sem storage */ }
            }
            router.replace("/gerencial?aba=4");
            return;
          }
          if (SECTIONS.includes(dica)) {
            setSec(dica);
          }
        }
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(t);
  }, [setSec, router]);
  const [n1, setN1] = useState(true);
  const [n2, setN2] = useState(true);
  const [n3, setN3] = useState(false);
  const [n4, setN4] = useState(true);

  const [user, setUser] = useState<CurrentUser>(null);
  const [nome, setNome] = useState("");
  const [nichoInput, setNichoInput] = useState("");
  const [nichoBusy, setNichoBusy] = useState(false);
  const [nichoMsg, setNichoMsg] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [plansMe, setPlansMe] = useState<CommercialPlansMe>(null);

  // Módulos (PR10072026 W3): estado por categoria vindo do backend.
  const [catOpts, setCatOpts] = useState<CategoriaOpt[] | null>(null);
  const [catBusy, setCatBusy] = useState(false);

  // E-mail v1 (LEADS-FINAL/06): a seção "Meu e-mail" só aparece com o recurso
  // ligado no backend (secret de cifra presente). Vendedor também conecta a
  // própria conta — sem gate de cobrança aqui.
  const [personalEmailEnabled, setPersonalEmailEnabled] = useState(false);

  // Equipe saiu desta tela — sem novoAcesso/gerirMembro/excluirMembro aqui.
  // Gestão de membros vive em Gerencial → aba Equipe.

  useEffect(() => {
    let alive = true;
    apiFetch<CurrentUser>("/profile/current-user")
      .then(res => {
        if (!alive || !res) return;
        setUser(res);
        setNome(res.name || res.username || "");
        setNichoInput((res.company?.prospectingSegments || []).join(", "));
      })
      .catch(() => { /* sem sessão — AuthGate cuida */ });
    apiFetch<CommercialPlansMe>("/commercial-plans/me")
      .then(res => { if (alive) setPlansMe(res); })
      .catch(() => { /* sem acesso comercial — seção fica oculta/limitada */ });
    apiFetch<{ prefs: { novoLead: boolean; semResposta: boolean; resumoDiario: boolean; tarefasAtrasadas: boolean } }>("/profile/notification-prefs")
      .then(res => {
        if (!alive || !res?.prefs) return;
        setN1(Boolean(res.prefs.novoLead));
        setN2(Boolean(res.prefs.semResposta));
        setN3(Boolean(res.prefs.resumoDiario));
        setN4(Boolean(res.prefs.tarefasAtrasadas));
      })
      .catch(() => { /* mantém defaults locais */ });
    apiFetch<{ ok?: boolean; enabled?: boolean }>("/lead-email/status")
      .then(res => { if (alive) setPersonalEmailEnabled(res?.enabled === true); })
      .catch(() => { /* recurso off/erro — seção fica escondida */ });
    return () => { alive = false; };
  }, []);

  async function salvarPerfil() {
    if (saveBusy) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const updated = await apiFetch<CurrentUser>("/profile/display-name", {
        method: "PATCH",
        body: JSON.stringify({ name: nome }),
      });
      if (updated) setUser(updated);
      setSaveMsg("✓ Nome atualizado.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaveBusy(false);
    }
  }

  // Faz downscale da imagem no canvas e envia como data URL JPEG ao backend.
  async function handleAvatarFile(file: File) {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setSaveMsg(null);
    try {
      const MAX_PX = 256;
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(MAX_PX / bitmap.width, MAX_PX / bitmap.height, 1);
      const w = Math.round(bitmap.width * ratio);
      const h = Math.round(bitmap.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas não disponível.");
      ctx.drawImage(bitmap, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const updated = await apiFetch<CurrentUser>("/profile/avatar", {
        method: "PATCH",
        body: JSON.stringify({ dataUrl }),
      });
      if (updated) setUser(updated);
      setSaveMsg("✓ Foto atualizada.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Não foi possível atualizar a foto.");
    } finally {
      setAvatarBusy(false);
      // Limpa o value para permitir reselecionar o mesmo arquivo
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function removerAvatar() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setSaveMsg(null);
    try {
      const updated = await apiFetch<CurrentUser>("/profile/avatar", { method: "DELETE" });
      if (updated) setUser(updated);
      setSaveMsg("✓ Foto removida.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Não foi possível remover a foto.");
    } finally {
      setAvatarBusy(false);
    }
  }

  // Persiste uma preferência de notificação individualmente (otimista + rollback).
  async function saveNotif(patch: Partial<{ novoLead: boolean; semResposta: boolean; resumoDiario: boolean; tarefasAtrasadas: boolean }>) {
    await apiFetch("/profile/notification-prefs", {
      method: "PATCH",
      body: JSON.stringify({ prefs: patch }),
    });
  }

  // Módulos (PR10072026 W3): mesmo gate de dono do backend (profile.controller
  // exige ADMIN/USERMASTER com canViewBilling ≠ false) — gerente sem cobrança
  // não vê a seção (a chamada devolveria 400 "Apenas o dono...").
  const canSeeModulos = isTenantAdmin(user) && user?.canViewBilling !== false;

  useEffect(() => {
    if (!canSeeModulos) return;
    let alive = true;
    apiFetch<{ categories: CategoriaOpt[] }>("/profile/module-categories/options")
      .then(res => { if (alive && Array.isArray(res?.categories)) setCatOpts(res.categories); })
      .catch(() => { /* sem acesso — seção fica sem conteúdo */ });
    return () => { alive = false; };
  }, [canSeeModulos]);

  // Toggle de categoria: otimista + rollback (padrão das notification-prefs).
  // POST manda a lista COMPLETA de categorias ligadas; mínimo 1 ligada (o
  // switch da última trava via disabled). Após salvar OK, reload — a sidebar
  // lê /modules/me com cache de 60s no shell (mesmo padrão do OOBE).
  async function alternarCategoria(key: string, on: boolean) {
    if (!catOpts || catBusy) return;
    const prev = catOpts;
    const next = catOpts.map(c => (c.key === key ? { ...c, enabled: on } : c));
    const ligadas = next.filter(c => c.enabled && !c.locked).map(c => c.key);
    if (ligadas.length === 0) return;
    setCatOpts(next);
    setCatBusy(true);
    try {
      await apiFetch("/profile/module-categories", {
        method: "POST",
        body: JSON.stringify({ categories: ligadas }),
      });
      window.location.reload();
    } catch {
      setCatOpts(prev);
      setCatBusy(false);
    }
  }



  const displayName = user?.name || user?.username || "—";
  // PAGAMENTOS.md: vendedor (role USER) nunca vê tela/valores de cobrança.
  // Régua canônica (lib/roles) — admin/USERMASTER nunca é seller.
  const isSeller = isCompanySeller(user);
  // Régua única P3/P5: "gerente pra baixo ninguém vê o vínculo HBX×contratante".
  // Gerente = ADMIN com canViewBilling=false → esconde "Plano e cobrança" também.
  const canSeeBilling = user != null && !isSeller && user.canViewBilling !== false;
  // E-mail: gate pelo módulo "email" de /modules/me (fail-closed até mods.loaded).
  // Master sempre acessa (backend devolve accessible:true; userKind é o sinal já
  // usado nesta tela). Enquanto mods não carregou, esconde (sem flicker).
  const canSeeEmail = mods.loaded && Boolean(
    user?.userKind === "system_master" || mods.byKey["email"]?.accessible === true
  );
  // Integrações (Meta Ads): admin do tenant (inclui USERMASTER) — vendedor
  // nunca vê a aba. Régua canônica; o backend (requireCompanyAdmin) deve tratar
  // USERMASTER como admin, senão a aba aparece mas a chamada barra (403).
  const canSeeIntegracoes = isTenantAdmin(user);
  // Créditos: mesma régua de "Plano e cobrança" (LEI DO VENDEDOR) — o vendedor
  // e o gerente sem cobrança não veem a seção. O shape neutro de /credits/me
  // já existe pra eles (leadsDisponiveis), mas por decisão de escopo do S6 a
  // seção fica só na audiência de cobrança nesta tela (o vendedor enxerga seu
  // "leads disponíveis" em outro lugar do produto, não aqui).
  const sections = SECTIONS
    .filter(s => s !== "Créditos" || canSeeBilling)
    .filter(s => s !== "E-mail" || canSeeEmail)
    .filter(s => s !== "Meu e-mail" || personalEmailEnabled)
    .filter(s => s !== "Integrações" || canSeeIntegracoes)
    .filter(s => s !== "Módulos" || canSeeModulos);
  const current = plansMe?.current;

  return (
    <React.Fragment>
        <div className="work cfg-page" style={{ flex: 1, gridTemplateColumns: "210px 1fr", display: "grid", alignItems: "start" }}>
          <nav className="set-nav panel glass-pill-track" style={{ padding: 10 }}>
            <GlassPill {...secGlassPill} />
            {sections.map(s => (
              <button key={s} ref={secGlassPill.itemRef(s)} className={"set-link" + (sec === s ? " on" : "")} onClick={() => setSec(s)}>
                <I d={ICONS[SEC_IC[s]] || ICONS.config} size={15} />{s}
              </button>
            ))}
            <Link className="set-link set-link-shortcut" href="/configuracoes/aplicativo">
              <I d={ICONS.phone} size={15} />
              <span>Aplicativo móvel</span>
              <I d={ICONS.arrow} size={13} />
            </Link>
          </nav>

          <div className="cfg-body" style={{ display: "grid", gap: 14 }}>
            {sec === "Perfil & Empresa" && (
              <React.Fragment>
                {/* Seção Perfil */}
                <section className="panel cfg-section">
                  <div className="panel-head">
                    <h2>Perfil</h2>
                    <div className="meta">
                      {saveMsg && <span style={{ fontWeight: 700, color: saveMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{saveMsg}</span>}
                      <button className="btn-teal cfg-save-desktop" onClick={salvarPerfil} disabled={saveBusy || !nome.trim()}>{saveBusy ? "Salvando…" : "Salvar alterações"}</button>
                    </div>
                  </div>
                  <div className="cfg-panel-body" style={{ padding: 18, display: "grid", gap: 16 }}>
                    <div className="cfg-avatar-hero" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      {/* Input oculto para seleção de arquivo de avatar */}
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); }}
                      />
                      <Av name={displayName} src={user?.avatarUrl} size={56} />
                      <div style={{ display: "grid", gap: 6 }}>
                        <strong>{displayName}</strong>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn-ghost"
                            style={{ minHeight: 30, fontSize: "0.7rem" }}
                            disabled={avatarBusy}
                            onClick={() => avatarInputRef.current?.click()}
                          >{avatarBusy ? "Aguarde…" : "Alterar"}</button>
                          <button
                            className="btn-ghost cfg-danger-btn"
                            style={{ minHeight: 30, fontSize: "0.7rem", color: "var(--hbx-danger)" }}
                            disabled={avatarBusy || !user?.avatarUrl}
                            onClick={removerAvatar}
                          >Remover</button>
                        </div>
                      </div>
                    </div>
                    <div className="frow cfg-fields">
                      <div className="f"><label>Nome completo</label><input className="field-dark" value={nome} onChange={e => setNome(e.target.value)} /></div>
                      <div className="f"><label>Perfil de acesso</label><input className="field-dark" value={user ? roleLabel(user.role) : ""} readOnly /></div>
                      <div className="f"><label>E-mail</label><input className="field-dark" value={user?.email || ""} readOnly /></div>
                      <div className="f"><label>Telefone</label><input className="field-dark" defaultValue="" placeholder="—" readOnly /></div>
                    </div>
                    <div className="cfg-save-mobile">
                      {saveMsg && <span className={"cfg-save-msg" + (saveMsg.startsWith("✓") ? " ok" : " err")}>{saveMsg}</span>}
                      <button className="btn-teal" onClick={salvarPerfil} disabled={saveBusy || !nome.trim()}>{saveBusy ? "Salvando…" : "Salvar alterações"}</button>
                    </div>
                  </div>
                </section>

                {/* Seção Empresa (empilhada abaixo do Perfil) */}
                <section className="panel cfg-section">
                  <div className="panel-head"><h2>Empresa</h2></div>
                  <div className="cfg-sec-body" style={{ padding: 18 }}>
                    <div className="frow">
                      <div className="f"><label>Razão social</label><input className="field-dark" value={user?.company?.name || ""} readOnly placeholder="—" /></div>
                      <div className="f"><label>CNPJ</label><input className="field-dark" value="" readOnly placeholder="—" /></div>
                      <div className="f"><label>Telefone de contato</label><input className="field-dark" value={user?.company?.contactPhone || ""} readOnly placeholder="—" /></div>
                    </div>
                    {isTenantAdmin(user) && (
                      <div className="cfg-nicho">
                        <p className="ttl">Nicho da empresa (alimenta o Radar e os sinais de oportunidade)</p>
                        <p className="dica">Segmentos que a empresa quer prospectar, separados por vírgula. Ex.: Odontologia, Estética, Advocacia.</p>
                        <div className="row">
                          <input
                            className="field-dark"
                            value={nichoInput}
                            placeholder="Odontologia, Estética…"
                            onChange={e => setNichoInput(e.target.value)}
                          />
                          <button
                            className="btn-teal"
                            disabled={nichoBusy || !nichoInput.trim()}
                            onClick={async () => {
                              setNichoBusy(true);
                              setNichoMsg(null);
                              try {
                                const segments = nichoInput.split(",").map(s => s.trim()).filter(Boolean);
                                await apiFetch("/profile/prospecting-segments", {
                                  method: "POST",
                                  body: JSON.stringify({ segments }),
                                });
                                setNichoMsg("✓ Nicho salvo.");
                              } catch (err) {
                                setNichoMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
                              } finally {
                                setNichoBusy(false);
                              }
                            }}
                          >
                            {nichoBusy ? "Salvando…" : "Salvar nicho"}
                          </button>
                        </div>
                        {nichoMsg && <p className="msg">{nichoMsg}</p>}
                      </div>
                    )}
                  </div>
                </section>
              </React.Fragment>
            )}

            {sec === "Meu e-mail" && personalEmailEnabled && (
              <section className="panel cfg-section">
                <div className="panel-head"><h2>Meu e-mail</h2></div>
                <div className="cfg-sec-body" style={{ padding: 18, display: "grid", gap: 12 }}>
                  <p className="lead-email__note">
                    Conecte a sua conta de e-mail (SMTP) para enviar e-mails direto da página do lead. A mesma conta é usada lá e aqui.
                  </p>
                  <EmailAccountForm />
                </div>
              </section>
            )}

            {sec === "E-mail" && canSeeEmail && <CompanyEmailSection />}

            {sec === "Integrações" && canSeeIntegracoes && <MetaLeadAdsSection />}

            {sec === "Módulos" && canSeeModulos && (
              <section className="panel cfg-section">
                <div className="panel-head"><h2>Módulos</h2></div>
                <div className="cfg-notif-body" style={{ padding: "6px 18px 14px" }}>
                  {/* Categoria travada pelo master (locked) NUNCA aparece; o
                      switch da última ligada trava (mínimo 1 categoria). */}
                  {(catOpts || []).filter(c => !c.locked).map(c => {
                    const ligadas = (catOpts || []).filter(o => o.enabled && !o.locked).length;
                    const ultima = c.enabled && ligadas <= 1;
                    return (
                      <div className="setting" key={c.key}>
                        <div style={{ flex: 1 }}><strong>{CATEGORIA_LABEL[c.key] || c.key}</strong></div>
                        <Toggle on={c.enabled} disabled={catBusy || ultima} set={v => alternarCategoria(c.key, v)} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {sec === "Notificações" && (
              <section className="panel cfg-section">
                <div className="panel-head"><h2>Notificações</h2></div>
                <div className="cfg-notif-body" style={{ padding: "6px 18px 14px" }}>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Novo lead na esteira</strong><small>Receba um aviso quando um lead novo for captado.</small></div><Toggle on={n1} set={(v) => { setN1(v); saveNotif({ novoLead: v }).catch(() => setN1(!v)); }} /></div>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Mensagens não respondidas</strong><small>Alerta quando uma conversa ficar sem resposta por mais de 30 min.</small></div><Toggle on={n2} set={(v) => { setN2(v); saveNotif({ semResposta: v }).catch(() => setN2(!v)); }} /></div>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Resumo diário por e-mail</strong><small>Um resumo da operação às 8h, todos os dias úteis.</small></div><Toggle on={n3} set={(v) => { setN3(v); saveNotif({ resumoDiario: v }).catch(() => setN3(!v)); }} /></div>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Tarefas atrasadas</strong><small>Aviso quando uma tarefa passar do prazo.</small></div><Toggle on={n4} set={(v) => { setN4(v); saveNotif({ tarefasAtrasadas: v }).catch(() => setN4(!v)); }} /></div>
                </div>
              </section>
            )}

            {sec === "Créditos" && canSeeBilling && (
              <React.Fragment>
                {/* CRÉDITOS FASE 2: HBX não vende mais plano/tier — o acesso é
                    módulo (kill-switch do master) + RBAC + saldo de crédito.
                    Esta seção resume o estado da conta; a carteira em si vem
                    logo abaixo (CreditsWalletSection). */}
                {current?.accessStateLabel && (
                  <section className="panel cfg-section">
                    <div className="panel-head"><h2>Acesso da conta</h2></div>
                    <div style={{ padding: 18, display: "grid", gap: 12 }}>
                      <div className="kv">
                        <div className="row"><span className="k">Estado do acesso</span><span className="v">{current.accessStateLabel}</span></div>
                      </div>
                    </div>
                  </section>
                )}
                <CreditsWalletSection />
                {/* S5 INDICAÇÃO — card "Indique e ganhe" DORMENTE: o componente só
                    renderiza se GET /credits/indicacao/me responder 200 (flag OFF ⇒
                    404 ⇒ nada aparece). */}
                <IndicacaoCard />
              </React.Fragment>
            )}
          </div>
        </div>

    </React.Fragment>
  );
}
