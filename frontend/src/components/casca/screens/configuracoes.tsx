"use client";

// MOBILE-CASCA/W5 — Configurações mobile (registrada em /configuracoes).
// Whitelist CURADA (docs/PLANEJAMENTOS/MOBILE-CASCA/W5-MAIS-CONFIG.md): Conta
// (nome/e-mail/senha em sheets), WhatsApp (status + conectar/desconectar SÓ
// pelo fluxo canônico whatsapp-connection-flow.ts/WhatsAppConnectModal —
// NUNCA API crua do motor), Equipe (lista leitura), Aparência (modo+pele).
// FORA da whitelist (não renderizado nunca): bot builder, IA/assistente,
// automações, integrações, cobrança/planos, webhooks, avançados — quem cair
// por URL nessas rotas vê o CascaFallback central (não registradas aqui).
//
// Gate de papel igual desktop: isTenantAdmin/isCompanySeller (lib/roles) —
// vendedor não vê Equipe nem edita nada fora do próprio perfil.
// Zero backend novo — mesmos endpoints do desktop.

import { useEffect, useState } from "react";

import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { Av, I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";
import { fetchWhatsAppModalStatus } from "@/lib/whatsapp-connection-flow";
import { whatsappPillLabel, whatsappPillVariant, type WhatsAppModalPayload } from "@/lib/whatsapp-center";

import { CascaLoading, CascaSheet } from "../index";
import { TemaSection } from "./mais-sheet";
import { type MaisCurrentUser, roleLabel, type TeamMember, useMaisCurrentUser } from "./mais-types";

// ---------------------------------------------------------------
// Sheet "Conta": nome (editável), e-mail (leitura), senha (editável).
// ---------------------------------------------------------------
function ContaSheet({ open, onClose, user }: {
  open: boolean;
  onClose: () => void;
  user: MaisCurrentUser;
}) {
  const [nome, setNome] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [senhaBusy, setSenhaBusy] = useState(false);
  const [senhaMsg, setSenhaMsg] = useState<string | null>(null);

  // Reset do form ao abrir — ajuste de state DURANTE o render (mesmo padrão
  // do useCascaExitGate central), sem useEffect/set-state-in-effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setNome(user?.name || user?.username || ""); setSaveMsg(null); setSenha(""); setSenhaMsg(null); }
  }

  async function salvarNome() {
    if (saveBusy || !nome.trim()) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      await apiFetch<MaisCurrentUser>("/profile/display-name", {
        method: "PATCH",
        body: JSON.stringify({ name: nome }),
      });
      setSaveMsg("Nome atualizado.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function salvarSenha() {
    if (senhaBusy || senha.trim().length < 6) return;
    setSenhaBusy(true);
    setSenhaMsg(null);
    try {
      await apiFetch("/profile/password", { method: "PATCH", body: JSON.stringify({ newPassword: senha }) });
      setSenhaMsg("Senha atualizada.");
      setSenha("");
    } catch (err) {
      setSenhaMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSenhaBusy(false);
    }
  }

  return (
    <CascaSheet open={open} title="Conta" onClose={onClose}>
      <div className="cfg-m__form">
        <label className="cfg-m__label">Nome completo</label>
        <input className="cfg-m__input" value={nome} onChange={e => setNome(e.target.value)} />
        <button className="cfg-m__save" onClick={salvarNome} disabled={saveBusy || !nome.trim()}>
          {saveBusy ? "Salvando…" : "Salvar nome"}
        </button>
        {saveMsg && <p className="cfg-m__msg">{saveMsg}</p>}

        <label className="cfg-m__label cfg-m__label--sp">E-mail</label>
        <input className="cfg-m__input" value={user?.email || ""} readOnly />

        <label className="cfg-m__label cfg-m__label--sp">Nova senha</label>
        <input className="cfg-m__input" type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} />
        <button className="cfg-m__save" onClick={salvarSenha} disabled={senhaBusy || senha.trim().length < 6}>
          {senhaBusy ? "Salvando…" : "Salvar senha"}
        </button>
        {senhaMsg && <p className="cfg-m__msg">{senhaMsg}</p>}
      </div>
    </CascaSheet>
  );
}

// ---------------------------------------------------------------
// Sheet "WhatsApp": status do chip (verde/vermelho + nome da instância) +
// conectar/desconectar. TODO o fluxo passa pelo WhatsAppConnectModal, que já
// usa exclusivamente src/lib/whatsapp-connection-flow.ts (status/start/qr/
// disconnect via /companies/me/whatsapp-modal/*) — NUNCA API crua do motor.
// ---------------------------------------------------------------
function WhatsAppSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<WhatsAppModalPayload["status"] | null>(null);
  const [companyName, setCompanyNameLocal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetchWhatsAppModalStatus();
      setStatus(res?.status || null);
      setCompanyNameLocal(res?.data?.companyName || null);
    } catch {
      setStatus(null);
      setCompanyNameLocal(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    async function load() { await refresh(); }
    void load();
  }, [open]);

  const connected = status === "connected";

  return (
    <>
      <CascaSheet open={open && !modalOpen} title="WhatsApp" onClose={onClose}>
        <div className="cfg-m__wa">
          {loading ? (
            <CascaLoading />
          ) : (
            <>
              <div className="cfg-m__wa-status">
                <span className={"cfg-m__wa-dot" + (connected ? " is-on" : "")} aria-hidden="true" />
                <div className="cfg-m__wa-status-main">
                  <strong>{whatsappPillLabel(status)}</strong>
                  {companyName && <span className="cfg-m__wa-sub">{companyName}</span>}
                </div>
                <span className={"tag" + whatsappPillVariant(status)}>{whatsappPillLabel(status)}</span>
              </div>
              <button className="cfg-m__wa-btn" onClick={() => setModalOpen(true)}>
                {connected ? "Gerenciar conexão" : "Conectar WhatsApp"}
              </button>
            </>
          )}
        </div>
      </CascaSheet>

      <WhatsAppConnectModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); refresh(); }}
        onConnected={() => refresh()}
        onDisconnected={() => refresh()}
      />
    </>
  );
}

// ---------------------------------------------------------------
// Sheet "Equipe": lista simples de membros (leitura; gestão fina = desktop
// em /gerencial). Mesmo endpoint GET /users/company que o desktop usa.
// ---------------------------------------------------------------
function EquipeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!open || team !== null) return;
    apiFetch<TeamMember[]>("/users/company")
      .then(res => setTeam(Array.isArray(res) ? res : []))
      .catch(() => setDenied(true));
  }, [open, team]);

  return (
    <CascaSheet open={open} title="Equipe" onClose={onClose}>
      <div className="cfg-m__equipe">
        {denied && <p className="cfg-m__msg">Sem permissão para ver a equipe.</p>}
        {!denied && team === null && <CascaLoading />}
        {!denied && team !== null && team.length === 0 && <p className="cfg-m__msg">Nenhum membro cadastrado.</p>}
        {!denied && team !== null && team.map(m => (
          <div key={m.id} className="cfg-m__equipe-row">
            <Av name={m.name || m.username || "?"} size={34} />
            <div className="cfg-m__equipe-main">
              <strong>{m.name || m.username || "—"}</strong>
              <span>{roleLabel(m.role)}{m.isActive === false ? " · inativo" : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </CascaSheet>
  );
}

// ---------------------------------------------------------------
// Linha 52px de grupo (mesma densidade da folha "Mais").
// ---------------------------------------------------------------
function CfgRow({ icon, label, sub, onClick }: { icon: string; label: string; sub?: string; onClick: () => void }) {
  return (
    <button className="cfg-m__row" onClick={onClick}>
      <span className="cfg-m__row-ico"><I d={ICONS[icon]} size={17} /></span>
      <span className="cfg-m__row-main">
        <span className="cfg-m__row-label">{label}</span>
        {sub && <span className="cfg-m__row-sub">{sub}</span>}
      </span>
      <I d={ICONS.arrow} size={14} />
    </button>
  );
}

export function ConfiguracoesMobile() {
  const user = useMaisCurrentUser();
  const admin = isTenantAdmin(user);

  const [contaOpen, setContaOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [equipeOpen, setEquipeOpen] = useState(false);
  const [aparenciaOpen, setAparenciaOpen] = useState(false);

  return (
    <div className="cfg-m__body">
      <section className="cfg-m__group">
        <h2 className="cfg-m__group-title">Conta</h2>
        <CfgRow icon="users" label="Perfil" sub={user?.email || undefined} onClick={() => setContaOpen(true)} />
      </section>

      <section className="cfg-m__group">
        <h2 className="cfg-m__group-title">WhatsApp</h2>
        <CfgRow icon="msg" label="Conexão" sub="Status e conectar/desconectar" onClick={() => setWaOpen(true)} />
      </section>

      {admin && (
        <section className="cfg-m__group">
          <h2 className="cfg-m__group-title">Equipe</h2>
          <CfgRow icon="users" label="Membros" sub="Lista de leitura" onClick={() => setEquipeOpen(true)} />
        </section>
      )}

      <section className="cfg-m__group">
        <h2 className="cfg-m__group-title">Aparência</h2>
        <CfgRow icon="config" label="Modo e pele" onClick={() => setAparenciaOpen(true)} />
      </section>

      <ContaSheet open={contaOpen} onClose={() => setContaOpen(false)} user={user} />
      <WhatsAppSheet open={waOpen} onClose={() => setWaOpen(false)} />
      {admin && <EquipeSheet open={equipeOpen} onClose={() => setEquipeOpen(false)} />}
      <CascaSheet open={aparenciaOpen} title="Aparência" onClose={() => setAparenciaOpen(false)}>
        <TemaSection />
      </CascaSheet>
    </div>
  );
}
