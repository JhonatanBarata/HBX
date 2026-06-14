"use client";

// Tela Configurações (template docs/TEMAS/*/corporate/Configuracoes.html)
// ligada nos contratos reais:
//   - Perfil → GET /profile/current-user; salvar nome → PATCH /profile/display-name
//   - Empresa → company do current-user (somente leitura; sem PATCH no contrato)
//   - Equipe → GET /users/company (Admin; sem permissão mostra aviso);
//     Novo acesso → cadastro COMPLETO (components/hbx/novo-acesso-modal,
//     PR12062026005): POST /users/company/create + onboarding de documentos/
//     contrato do gerencial; aviso de assento via GET /users/company/seat-billing.
//     Gerenciar → PATCH /users/:id/role e PATCH /users/:id/active
//   - E-mail (Admin) → módulo de e-mail POR EMPRESA (PR12062026005,
//     components/hbx/company-email-section): SMTP próprio, templates com "+",
//     disparos manuais do cadastro. HBX admin compartilha só o transporte do
//     Master (decidido no backend — nenhum endpoint master no front).
//   - Plano e cobrança → GET /commercial-plans/me (ordem explícita do dono,
//     11/06/2026): plano vigente, estado de acesso, trial, entitlements e
//     catálogo real. PAGAMENTOS.md: vendedor NUNCA vê a seção (ocultada por
//     userKind); preço nunca é hardcoded — tudo vem do catálogo da API.
//     Troca de plano/checkout NÃO foi ligada (fluxo de pagamento ainda não
//     existe no front novo — "Gerenciar plano" segue visual, registrado).
// Notificações seguem visuais (sem contrato). Campos sem dado no contrato
// (CNPJ, segmento, cidade, telefone do perfil) mostram vazio/“—”.

import React, { useEffect, useState } from "react";

import { CargoAcessosEditor } from "@/components/hbx/cargo-acessos-editor";
import { CompanyEmailSection } from "@/components/hbx/company-email-section";
import { NovoAcessoModal } from "@/components/hbx/novo-acesso-modal";
import { Av, ConfirmDialog, I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { useTabParam } from "@/lib/use-tab-param";

const SECTIONS = ["Perfil", "Empresa", "Equipe", "E-mail", "Notificações", "Plano e cobrança"];
const SEC_IC: Record<string, string> = { "Perfil": "users", "Empresa": "cnpj", "Equipe": "users", "E-mail": "mail", "Notificações": "bell", "Plano e cobrança": "money" };

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  USER: "Vendas",
  MASTER: "Master",
};

type CurrentUser = {
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  userKind?: string | null;
  canViewBilling?: boolean | null;
  company?: { name?: string | null; contactPhone?: string | null } | null;
} | null;

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null; isActive?: boolean };

type CatalogPlan = {
  key: string;
  title: string;
  monthlyPrice: number | null;
  includedUsers?: number | null;
  headline?: string | null;
  badge?: string | null;
  recommended?: boolean;
  // Full: implantação assistida, sem self-checkout — o cliente PEDE e a HBX contata.
  requiresAssistedSetup?: boolean;
  features?: string[];
};

type CommercialPlansMe = {
  current?: {
    planKey?: string | null;
    entitlements?: Record<string, boolean>;
    accessState?: string | null;
    accessStateLabel?: string | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    isTrial?: boolean;
    assistedSetup?: { required?: boolean; status?: string | null; message?: string | null };
  };
  plans?: CatalogPlan[];
  permissions?: { canSelectPlan?: boolean };
} | null;

const ENTITLEMENT_LABEL: Record<string, string> = {
  vendas: "Vendas",
  radar: "Radar",
  webscraping: "Radar",
  atendimento: "Atendimento",
  bot_ia: "Bot IA",
  recovery: "Recovery",
};

function entitlementLabel(key: string) {
  return ENTITLEMENT_LABEL[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtPreco(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/mês`;
}

function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return <button className={"sw" + (on ? " on" : "")} onClick={() => set(!on)} role="switch" aria-checked={on}><i></i></button>;
}

function roleLabel(role?: string | null) {
  return ROLE_LABEL[String(role || "").toUpperCase()] || "Usuário";
}

export function ConfiguracoesClient() {
  const [sec, setSec] = useTabParam<string>("sec", "Perfil", SECTIONS);

  // aviso do sino → abre direto na seção (mesmo padrão do "+" → Novo lead)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const dica = sessionStorage.getItem("hbx:config-sec");
        if (dica && SECTIONS.includes(dica)) {
          sessionStorage.removeItem("hbx:config-sec");
          setSec(dica);
        }
      } catch { /* sem storage */ }
    }, 0);
    return () => clearTimeout(t);
  }, [setSec]);
  const [n1, setN1] = useState(true);
  const [n2, setN2] = useState(true);
  const [n3, setN3] = useState(false);
  const [n4, setN4] = useState(true);

  const [user, setUser] = useState<CurrentUser>(null);
  const [nome, setNome] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [team, setTeam] = useState<CompanyUser[]>([]);
  const [teamDenied, setTeamDenied] = useState(false);
  const [plansMe, setPlansMe] = useState<CommercialPlansMe>(null);
  // Troca de plano (PAGAMENTOS.md): só ADMIN (canSelectPlan vem do backend).
  // O backend é a fonte da regra — selecionar plano diferente cai em
  // pending_checkout/desativa; o front só dispara e mostra o veredito.
  const [planoBusy, setPlanoBusy] = useState(false);
  const [planoMsg, setPlanoMsg] = useState<string | null>(null);
  const [confirmPlano, setConfirmPlano] = useState<CatalogPlan | null>(null);
  const [confirmFull, setConfirmFull] = useState<CatalogPlan | null>(null);

  // Novo acesso (cadastro completo, PR12062026005) + gestão de membro.
  // Gerenciar abre a tela do vendedor (gerenciar-vendedor-modal) com os
  // documentos recebidos — ordem do dono 12/06: liberar é passo explícito.
  //
  // Ordem do dono 14/06: qual JANELA está aberta é estado de NAVEGAÇÃO, igual o
  // `sec` — então vive na URL (mesma regra do use-tab-param). Assim o F5 reabre a
  // janela que estava aberta, não só a aba. `?novo=1` = Novo acesso; `?membro=<id>`
  // = Gerenciar daquele vendedor. (O "sem perder" do Novo acesso é o rascunho em
  // localStorage dentro do próprio modal.)
  const [novoParam, setNovoParam] = useTabParam<string>("novo", "");
  const [membroParam, setMembroParam] = useTabParam<string>("membro", "");
  const novoAcessoOpen = novoParam === "1";
  const gerirMembro = team.find(m => String(m.id) === membroParam) || null;
  const [gerirBusy, setGerirBusy] = useState(false);

  function abrirNovoAcesso() {
    // abertura por clique = começa limpa (não ressuscita rascunho de outra vez)
    try { localStorage.removeItem("hbx:novo-acesso-draft"); } catch { /* sem storage */ }
    setMembroParam("");
    setNovoParam("1");
  }
  function abrirGerir(m: CompanyUser) {
    setNovoParam("");
    setMembroParam(String(m.id));
  }
  const [teamMsg, setTeamMsg] = useState<string | null>(null);
  const [confirmExcluir, setConfirmExcluir] = useState<CompanyUser | null>(null);

  function recarregarEquipe() {
    return apiFetch<CompanyUser[]>("/users/company")
      .then(res => setTeam(Array.isArray(res) ? res : []))
      .catch(() => setTeamDenied(true));
  }

  async function excluirMembro(m: CompanyUser) {
    if (gerirBusy) return;
    setGerirBusy(true);
    setTeamMsg(null);
    try {
      await apiFetch(`/users/${m.id}/delete`, { method: "DELETE" });
      setTeamMsg("✓ Usuário excluído.");
      setMembroParam("");
      await recarregarEquipe();
    } catch (err) {
      setTeamMsg(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setGerirBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    apiFetch<CurrentUser>("/profile/current-user")
      .then(res => {
        if (!alive || !res) return;
        setUser(res);
        setNome(res.name || res.username || "");
      })
      .catch(() => { /* sem sessão — AuthGate cuida */ });
    apiFetch<CompanyUser[]>("/users/company")
      .then(res => { if (alive) setTeam(Array.isArray(res) ? res : []); })
      .catch(() => { if (alive) setTeamDenied(true); });
    apiFetch<CommercialPlansMe>("/commercial-plans/me")
      .then(res => { if (alive) setPlansMe(res); })
      .catch(() => { /* sem acesso comercial — seção fica oculta/limitada */ });
    return () => { alive = false; };
  }, []);

  // aviso "documentos confirmados" → abre DIRETO a ficha do vendedor, não só a aba
  // (ordem do dono 14/06). O sino mandou o e-mail do vendedor em sessionStorage;
  // quando a equipe carrega, casamos o e-mail com o membro e abrimos o Gerenciar.
  useEffect(() => {
    if (team.length === 0) return;
    let alvo: string | null = null;
    try { alvo = sessionStorage.getItem("hbx:config-membro-email"); } catch { /* sem storage */ }
    if (!alvo) return;
    try { sessionStorage.removeItem("hbx:config-membro-email"); } catch { /* sem storage */ }
    const email = alvo.trim().toLowerCase();
    const m = team.find(x => (x.email || "").trim().toLowerCase() === email);
    if (m) setMembroParam(String(m.id));
  }, [team, setMembroParam]);

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

  async function selecionarPlano(plan: CatalogPlan) {
    if (planoBusy) return;
    setPlanoBusy(true);
    setPlanoMsg(null);
    try {
      // POST /commercial-plans/select — backend decide trial/troca/checkout.
      const res = await apiFetch<CommercialPlansMe>("/commercial-plans/select", {
        method: "POST",
        body: JSON.stringify({ planKey: plan.key }),
      });
      if (res) setPlansMe(res);
      setPlanoMsg(`✓ Plano alterado para ${plan.title}.`);
    } catch (err) {
      setPlanoMsg(err instanceof Error ? err.message : "Não foi possível alterar o plano.");
    } finally {
      setPlanoBusy(false);
    }
  }

  // HBX Full = implantação assistida, sem self-checkout: pede e a HBX entra em
  // contato (POST /commercial-plans/request-full). Não troca plano nem cobra.
  async function pedirFull() {
    if (planoBusy) return;
    setPlanoBusy(true);
    setPlanoMsg(null);
    try {
      const res = await apiFetch<{ message?: string }>("/commercial-plans/request-full", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPlanoMsg(`✓ ${res?.message || "Pedido enviado. Um especialista da HBX vai entrar em contato."}`);
    } catch (err) {
      setPlanoMsg(err instanceof Error ? err.message : "Não foi possível enviar o pedido agora.");
    } finally {
      setPlanoBusy(false);
    }
  }

  const displayName = user?.name || user?.username || "—";
  // PAGAMENTOS.md: vendedor (role USER) nunca vê tela/valores de cobrança.
  const isSeller = user?.userKind === "seller";
  // Régua única P3/P5: "gerente pra baixo ninguém vê o vínculo HBX×contratante".
  // Gerente = ADMIN com canViewBilling=false → esconde "Plano e cobrança" também.
  const canSeeBilling = user != null && !isSeller && user.canViewBilling !== false;
  // E-mail é seção do ADMIN (módulo por empresa, PR12062026005)
  const isAdminUser = Boolean(user && (String(user.role || "").toUpperCase() === "ADMIN" || user.userKind === "system_master"));
  const sections = SECTIONS
    .filter(s => s !== "Plano e cobrança" || canSeeBilling)
    .filter(s => s !== "E-mail" || isAdminUser);
  const current = plansMe?.current;
  const planos = plansMe?.plans || [];
  const planoAtual = planos.find(p => p.key === current?.planKey) || null;
  const entitlementsAtivos = Object.entries(current?.entitlements || {}).filter(([, on]) => on).map(([k]) => k);
  const canSelectPlan = Boolean(plansMe?.permissions?.canSelectPlan);

  return (
    <React.Fragment>
        <div className="work" style={{ flex: 1, gridTemplateColumns: "210px 1fr", display: "grid", alignItems: "start" }}>
          <nav className="set-nav panel" style={{ padding: 10 }}>
            {sections.map(s => (
              <button key={s} className={"set-link" + (sec === s ? " on" : "")} onClick={() => setSec(s)}>
                <I d={ICONS[SEC_IC[s]] || ICONS.config} size={15} />{s}
              </button>
            ))}
          </nav>

          <div style={{ display: "grid", gap: 14 }}>
            {sec === "Perfil" && (
              <section className="panel">
                <div className="panel-head">
                  <h2>Perfil</h2>
                  <div className="meta">
                    {saveMsg && <span style={{ fontWeight: 700, color: saveMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{saveMsg}</span>}
                    <button className="btn-teal" onClick={salvarPerfil} disabled={saveBusy || !nome.trim()}>{saveBusy ? "Salvando…" : "Salvar alterações"}</button>
                  </div>
                </div>
                <div style={{ padding: 18, display: "grid", gap: 16 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <Av name={displayName} size={56} />
                    <div style={{ display: "grid", gap: 6 }}>
                      <strong>Foto do perfil</strong>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem" }}>Alterar</button>
                        <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem", color: "var(--hbx-danger)" }}>Remover</button>
                      </div>
                    </div>
                  </div>
                  <div className="frow">
                    <div className="f"><label>Nome completo</label><input className="field-dark" value={nome} onChange={e => setNome(e.target.value)} /></div>
                    <div className="f"><label>Perfil de acesso</label><input className="field-dark" value={user ? roleLabel(user.role) : ""} readOnly /></div>
                    <div className="f"><label>E-mail</label><input className="field-dark" value={user?.email || ""} readOnly /></div>
                    <div className="f"><label>Telefone</label><input className="field-dark" defaultValue="" placeholder="—" readOnly /></div>
                  </div>
                </div>
              </section>
            )}

            {sec === "Empresa" && (
              <section className="panel">
                <div className="panel-head"><h2>Empresa</h2></div>
                <div style={{ padding: 18 }}>
                  <div className="frow">
                    <div className="f"><label>Razão social</label><input className="field-dark" value={user?.company?.name || ""} readOnly placeholder="—" /></div>
                    <div className="f"><label>CNPJ</label><input className="field-dark" value="" readOnly placeholder="—" /></div>
                    <div className="f"><label>Segmento</label><span className="select-dark">— <span style={{ opacity: 0.6 }}>▾</span></span></div>
                    <div className="f"><label>Telefone de contato</label><input className="field-dark" value={user?.company?.contactPhone || ""} readOnly placeholder="—" /></div>
                  </div>
                </div>
              </section>
            )}

            {sec === "Equipe" && (
              <React.Fragment>
              <section className="panel">
                <div className="panel-head">
                  <h2>Equipe</h2>
                  <div className="meta">
                    <button className="btn-teal" onClick={abrirNovoAcesso} disabled={teamDenied}><I d={ICONS.plus} size={13} /> Novo acesso</button>
                  </div>
                </div>
                {teamMsg && (
                  <div style={{ padding: "10px 16px 0", fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: teamMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{teamMsg}</div>
                )}
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Membro</th><th>E-mail</th><th>Perfil de acesso</th><th></th></tr></thead>
                    <tbody>
                      {teamDenied && (
                        <tr style={{ cursor: "default" }}>
                          <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px 12px" }}>
                            Lista de equipe visível apenas para Administrador.
                          </td>
                        </tr>
                      )}
                      {!teamDenied && team.length === 0 && (
                        <tr style={{ cursor: "default" }}>
                          <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "22px 12px" }}>
                            Nenhum membro carregado.
                          </td>
                        </tr>
                      )}
                      {team.map(m => {
                        const nomeMembro = m.name || m.username || m.email || `Usuário ${m.id}`;
                        const ehAdmin = String(m.role || "").toUpperCase() === "ADMIN";
                        return (
                          <tr key={m.id} style={{ cursor: "default" }}>
                            <td><div style={{ display: "flex", gap: 9, alignItems: "center" }}><Av name={nomeMembro} size={28} /><div><strong>{nomeMembro}</strong><div style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>{m.isActive === false ? "Inativo" : "Ativo"}</div></div></div></td>
                            <td>{m.email || "—"}</td>
                            <td><span className={"tag" + (ehAdmin ? " teal" : "")}>{roleLabel(m.role)}</span></td>
                            <td>
                              <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.68rem" }}
                                onClick={() => { setTeamMsg(null); abrirGerir(m); }}>Gerenciar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              {!teamDenied && <CargoAcessosEditor />}
              </React.Fragment>
            )}

            {sec === "E-mail" && isAdminUser && <CompanyEmailSection />}

            {sec === "Notificações" && (
              <section className="panel">
                <div className="panel-head"><h2>Notificações</h2></div>
                <div style={{ padding: "6px 18px 14px" }}>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Novo lead na esteira</strong><small>Receba um aviso quando um lead novo for captado.</small></div><Toggle on={n1} set={setN1} /></div>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Mensagens não respondidas</strong><small>Alerta quando uma conversa ficar sem resposta por mais de 30 min.</small></div><Toggle on={n2} set={setN2} /></div>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Resumo diário por e-mail</strong><small>Um resumo da operação às 8h, todos os dias úteis.</small></div><Toggle on={n3} set={setN3} /></div>
                  <div className="setting"><div style={{ flex: 1 }}><strong>Tarefas atrasadas</strong><small>Aviso quando uma tarefa passar do prazo.</small></div><Toggle on={n4} set={setN4} /></div>
                </div>
              </section>
            )}

            {sec === "Plano e cobrança" && canSeeBilling && (
              <React.Fragment>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Plano e cobrança</h2>
                    {(planoMsg || current?.accessStateLabel) && (
                      <div className="meta">
                        {planoMsg && <span className={"tag " + (planoMsg.startsWith("✓") ? "teal" : "red")}>{planoMsg}</span>}
                        {current?.accessStateLabel && <span className="tag teal">{current.accessStateLabel}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 18, display: "grid", gap: 16 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid color-mix(in srgb, var(--hbx-brand) 30%, transparent)", background: "var(--hbx-brand-soft)" }}>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: "0.94rem" }}>{planoAtual?.title || (current?.planKey ? current.planKey : "Sem plano ativo")}</strong>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 3 }}>
                          {current?.isTrial && current?.trialEndsAt
                            ? `Trial até ${new Date(current.trialEndsAt).toLocaleDateString("pt-BR")}${current?.trialRemainingDays != null ? ` · ${current.trialRemainingDays} dia(s) restantes` : ""}`
                            : planoAtual?.headline || "Escolha um plano no catálogo abaixo."}
                        </div>
                      </div>
                      {fmtPreco(planoAtual?.monthlyPrice) && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", fontWeight: 700 }}>{fmtPreco(planoAtual?.monthlyPrice)}</span>
                      )}
                      {canSelectPlan && planos.length > 0 && (
                        <button className="btn-teal" onClick={() => document.getElementById("hbx-catalogo-planos")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Gerenciar plano</button>
                      )}
                    </div>
                    <div className="kv">
                      <div className="row"><span className="k">Estado do acesso</span><span className="v">{current?.accessStateLabel || "—"}</span></div>
                      <div className="row"><span className="k">Usuários</span><span className="v">{team.length > 0 ? `${team.length}${planoAtual?.includedUsers ? ` de ${planoAtual.includedUsers} inclusos` : ""}` : "—"}</span></div>
                      {current?.assistedSetup?.required && (
                        <div className="row"><span className="k">Implantação assistida</span><span className="v">{current.assistedSetup.status === "completed" ? "Concluída" : "Pendente"}</span></div>
                      )}
                    </div>
                    {entitlementsAtivos.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>Módulos liberados:</span>
                        {entitlementsAtivos.map(k => <span key={k} className="tag teal">{entitlementLabel(k)}</span>)}
                      </div>
                    )}
                    {current?.assistedSetup?.message && (
                      <p style={{ margin: 0, fontSize: "0.7rem", lineHeight: 1.5, color: "var(--hbx-warning)" }}>{current.assistedSetup.message}</p>
                    )}
                  </div>
                </section>

                {planos.length > 0 && (
                  <section className="panel" id="hbx-catalogo-planos">
                    <div className="panel-head"><h2>Catálogo de planos HBX</h2></div>
                    <div style={{ padding: 18, display: "grid", gridTemplateColumns: `repeat(${Math.min(3, planos.length)}, 1fr)`, gap: 14 }}>
                      {planos.map(p => {
                        const atual = p.key === current?.planKey;
                        return (
                          <article key={p.key} style={{ display: "grid", gap: 10, alignContent: "start", padding: 16, borderRadius: "var(--radius-md)",
                            border: "1px solid " + (atual ? "var(--hbx-brand)" : p.recommended ? "color-mix(in srgb, var(--hbx-brand) 40%, transparent)" : "var(--border-hairline)"),
                            background: atual ? "var(--hbx-brand-soft)" : "var(--hbx-surface-soft)" }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <strong style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}>{p.title}</strong>
                              {atual ? <span className="tag teal">Plano atual</span> : p.badge ? <span className="tag">{p.badge}</span> : null}
                            </div>
                            {fmtPreco(p.monthlyPrice) && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "1.05rem", fontWeight: 700 }}>{fmtPreco(p.monthlyPrice)}</span>
                            )}
                            {p.headline && <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{p.headline}</p>}
                            {Array.isArray(p.features) && p.features.length > 0 && (
                              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
                                {p.features.slice(0, 5).map(f => (
                                  <li key={f} style={{ position: "relative", paddingLeft: 16, fontSize: "0.7rem", lineHeight: 1.45, color: "var(--text-body)" }}>
                                    <span style={{ position: "absolute", left: 0, color: "var(--hbx-brand-strong)" }}>•</span>{f}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {canSelectPlan && !atual && (
                              p.requiresAssistedSetup
                                ? <button className="btn-ghost" style={{ marginTop: 2 }} disabled={planoBusy} onClick={() => { setConfirmFull(p); setPlanoMsg(null); }}>Falar com a HBX</button>
                                : <button className="btn-ghost" style={{ marginTop: 2 }} disabled={planoBusy} onClick={() => { setConfirmPlano(p); setPlanoMsg(null); }}>Trocar para este plano</button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {!plansMe && (
                  <section className="panel">
                    <div style={{ padding: 18, fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Catálogo comercial indisponível no momento.
                    </div>
                  </section>
                )}
              </React.Fragment>
            )}
          </div>
        </div>

      {novoAcessoOpen && (
        <NovoAcessoModal
          onClose={() => setNovoParam("")}
          onDone={msg => { setTeamMsg(msg); recarregarEquipe(); }}
          team={team}
        />
      )}

      {gerirMembro && (
        <NovoAcessoModal
          member={gerirMembro}
          team={team}
          isSelf={Boolean(user?.email && gerirMembro.email && user.email === gerirMembro.email)}
          onClose={() => setMembroParam("")}
          onDone={msg => { setTeamMsg(msg); recarregarEquipe(); }}
          onRequestExcluir={m => setConfirmExcluir(m)}
        />
      )}

      <ConfirmDialog
        open={!!confirmExcluir}
        title="Excluir membro"
        message={<>Excluir <strong>{confirmExcluir?.name || confirmExcluir?.email || "este usuário"}</strong> em definitivo? Esta ação não tem volta.</>}
        confirmLabel="Excluir"
        danger
        busy={gerirBusy}
        onConfirm={async () => { const m = confirmExcluir; setConfirmExcluir(null); if (m) await excluirMembro(m); }}
        onCancel={() => setConfirmExcluir(null)}
      />

      <ConfirmDialog
        open={!!confirmPlano}
        title="Trocar de plano"
        message={<>Trocar para <strong>{confirmPlano?.title}</strong>? Um plano diferente do atual coloca o acesso em <strong>checkout pendente</strong> e pausa a empresa até a confirmação do pagamento. A trilha de pagamento ainda não está no ar — o acesso só volta quando for reativado.</>}
        confirmLabel="Trocar plano"
        busy={planoBusy}
        onConfirm={async () => { const p = confirmPlano; setConfirmPlano(null); if (p) await selecionarPlano(p); }}
        onCancel={() => setConfirmPlano(null)}
      />

      <ConfirmDialog
        open={!!confirmFull}
        title="HBX Full — implantação assistida"
        message={<>O <strong>{confirmFull?.title}</strong> é implantado pela HBX: você não paga por cartão aqui. Ao confirmar, um <strong>especialista da HBX entra em contato</strong> para configurar bot, automação e atendimento com você.</>}
        confirmLabel="Quero falar com a HBX"
        busy={planoBusy}
        onConfirm={async () => { setConfirmFull(null); await pedirFull(); }}
        onCancel={() => setConfirmFull(null)}
      />
    </React.Fragment>
  );
}
