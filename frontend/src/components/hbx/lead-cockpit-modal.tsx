"use client";

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ LEAD-COCKPIT (PR11072026) — detalhe avançado do lead no Pipeline de Vendas │
// │                                                                             │
// │ Overlay grande no CENTRO (.hbx-veil central; a moldura .lead-cockpit só    │
// │ dimensiona — Lei nº2, proibido re-centralizar/z-index inline) com 3 guias  │
// │ em Glass Pill:                                                              │
// │  · Atendimento — WhatsApp embutido (ConversationPanel, rotina NORMAL do    │
// │    Atendimento — zero chamada nova ao motor) + e-mail de apresentação      │
// │    (endpoints já existentes do card) + abordagem (leadIntelligence) +      │
// │    agenda do lead (AgendaLeadPanel).                                        │
// │  · Cadastro — ficha "CNPJ biz": contato copy-1-clique, empresa RFB rica    │
// │    (GET /vendas/lead/:id/cockpit — W1), origem & sinais, responsável +     │
// │    histórico resumido.                                                      │
// │  · Financeiro — SÓ admin (canViewValues; LEI DO VENDEDOR — a guia nem      │
// │    monta): venda do card + extrato do cliente (financeiro-tenant) +        │
// │    gerar cobrança (idempotente) e baixa manual por título.                 │
// │                                                                             │
// │ Regras: dado sem contrato = "—" (nunca fake); todo fetch é fail-soft       │
// │ (seção com erro mostra vazio, nunca quebra o modal); visual 100% em        │
// │ classes centrais (.lead-cockpit-* em screens.css + kit) — check-pele.      │
// └─────────────────────────────────────────────────────────────────────────────┘

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Av, I, ICONS, WhatsAppMark, useCurrentUser, useEntitlements, useMyModules, isModuleVisible } from "@/components/hbx/shell";
import { AgendaLeadPanel, ConversationPanel, LockGate, humanize } from "@/components/hbx/detalhes-negocio";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { CopilotoPanel, type CopilotoFicha } from "@/app/(app)/leads/[id]/copiloto-panel";
import { apiFetch } from "@/lib/api";
import { formatBrPhone, onlyDigits } from "@/lib/br-phone";
import type { VendasLead } from "@/app/(app)/vendas/page.client";

// ── Contratos dos extras (fail-soft: erro → "—"/estado vazio) ────────────────

// GET /vendas/lead/:leadId/cockpit (W1) — RFB rica lida do banco local.
type CockpitCompany = {
  found?: boolean;
  locked?: boolean;
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  situacao?: string | null;
  cnae?: string | null;
  cnaeDescription?: string | null;
  porte?: string | null;
  capitalSocial?: number | null;
  naturezaJuridica?: string | null;
  openedAt?: string | null;
  simples?: boolean | null;
  mei?: boolean | null;
  matrizFilial?: string | null;
  partners?: Array<{ name?: string | null; qualification?: string | null }> | null;
} | null;

// GET /financeiro-tenant/clientes/:customerProfileId/extrato (só admin).
type ExtratoCharge = {
  id: string;
  amount: number;
  currency?: string | null;
  description?: string | null;
  status?: string | null;
  lifecycle?: string | null;
  sourceModule?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};
type Extrato = {
  clienteId: string;
  nome?: string | null;
  saldoAberto: number;
  total: number;
  charges: ExtratoCharge[];
} | null;

type Guia = "atendimento" | "cadastro" | "financeiro";

// ── Helpers (formatação local — máscara de telefone vem de lib/br-phone) ─────

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function yearsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 ? years : null;
}

const CHARGE_STATUS_LABEL: Record<string, string> = {
  pending: "Em aberto",
  paid: "Pago",
  canceled: "Cancelado",
  cancelled: "Cancelado",
  failed: "Falhou",
};

function chargeStatusLabel(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  return CHARGE_STATUS_LABEL[key] || (status ? humanize(status) : "—");
}

function chargeTagCls(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  if (key === "paid") return "tag teal";
  if (key === "pending") return "tag warn";
  if (key === "canceled" || key === "cancelled" || key === "failed") return "tag red";
  return "tag";
}

function sourceModuleLabel(sourceModule?: string | null): string {
  const key = String(sourceModule || "").toLowerCase();
  if (!key) return "—";
  if (key.startsWith("logistica")) return "Logística";
  if (key.startsWith("vendas")) return "Vendas";
  return humanize(key);
}

// ── Linhas de ficha (padrão CopyField de /leads/[id] — copy 1-clique) ─────────

function KvRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row dn-kv-row">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

function CopyRow({ label, value, mono = true, badge }: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  badge?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="row dn-kv-row">
        <span className="k">{label}</span>
        <span className="v muted-note">—</span>
      </div>
    );
  }
  function copiar() {
    navigator.clipboard?.writeText(value as string).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => undefined,
    );
  }
  return (
    <div className="row dn-kv-row">
      <span className="k">{label}</span>
      <span className="v lead-cockpit__copy">
        <span className={mono ? "hbx-mono" : undefined}>{value}</span>
        {badge}
        <button type="button" className="btn-ghost btn-xs" onClick={copiar} title={copied ? "Copiado" : "Copiar"} aria-label={`Copiar ${label}`}>
          <I d={copied ? ICONS.check : ICONS.doc} size={12} />
        </button>
      </span>
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function LeadCockpitModal({ lead, canViewValues, open, onClose, onConversationChanged }: {
  lead: VendasLead;
  canViewValues: boolean;
  open: boolean;
  onClose: () => void;
  onConversationChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const ent = useEntitlements();
  const user = useCurrentUser();
  const mods = useMyModules();
  // Mesmo default do DetalhesNegocio: enquanto não carrega assume liberado.
  const canIntel = !ent.loaded || ent.canSeeLeadIntelligence;
  // Atalho "Buscar parecidos" (Concierge): fail-closed por módulo (Lei do
  // FRONTEND.md — módulo sem acesso some da navegação, nunca aparece e barra no
  // clique). Só entra no header quando /modules/me afirma accessible:true.
  const conciergeVisible = isModuleVisible("concierge", ent, user, mods);

  const [tab, setTab] = useState<Guia>("atendimento");
  const guias: Array<{ key: Guia; label: string; icon: string[] }> = canViewValues
    ? [
        { key: "atendimento", label: "Atendimento", icon: ICONS.msg },
        { key: "cadastro", label: "Cadastro", icon: ICONS.doc },
        { key: "financeiro", label: "Financeiro", icon: ICONS.money },
      ]
    : [
        { key: "atendimento", label: "Atendimento", icon: ICONS.msg },
        { key: "cadastro", label: "Cadastro", icon: ICONS.doc },
      ];
  const pill = useGlassPill<HTMLButtonElement>(tab, guias.length);

  // Empresa RFB rica (W1) — null enquanto carrega/erro; fail-soft pro card.
  const [company, setCompany] = useState<CockpitCompany>(null);
  const [companyLoading, setCompanyLoading] = useState(true);

  // Conexão WhatsApp (mesmo check de /leads/[id]): null = verificando.
  const [waOk, setWaOk] = useState<boolean | null>(null);
  const [waConnectOpen, setWaConnectOpen] = useState(false);

  // E-mail de apresentação (preview/send já existentes no card de vendas).
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; text: string; to: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  // Financeiro — extrato do cliente. cpId pode nascer do card ou da resposta
  // do gerar-cobranca (que cria/associa o CustomerProfile).
  const [cpId, setCpId] = useState<string | null>(lead.customerProfileId || null);
  const [extrato, setExtrato] = useState<Extrato>(null);
  const [extratoError, setExtratoError] = useState(false);
  const [finBusyId, setFinBusyId] = useState<string | null>(null);
  const [finMsg, setFinMsg] = useState<string | null>(null);

  // Copiar (header + template de mensagem)
  const [cnpjCopied, setCnpjCopied] = useState(false);
  const [tplCopied, setTplCopied] = useState(false);

  // Copiloto do lead (ADENDO LEAD-COCKPIT) — flag do backend (fail-closed: erro/
  // ausente/false → o painel nem monta, igual /leads/[id]).
  const [copilotoEnabled, setCopilotoEnabled] = useState(false);
  // Rascunho do Copiloto → campo de digitação do ConversationPanel (só PREENCHE,
  // nunca envia). `seq` muda a cada rascunho pra re-disparar o efeito no painel.
  const [draftSignal, setDraftSignal] = useState<{ text: string; seq: number }>({ text: "", seq: 0 });
  // Anotações salvas nesta sessão (resumo/próxima ação do Copiloto). O modal é
  // remontado por lead (key={sel.id} no board) → começa vazio e nunca vaza entre
  // cards; a timeline exibida = as novas + as que vieram no card.
  const [addedNotes, setAddedNotes] = useState<NonNullable<VendasLead["timeline"]>>([]);

  // Esc fecha (veil e ✕ também fecham — padrão do overlay central).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Extras do cockpit — todos fail-soft; setState só nos callbacks async.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    apiFetch<{ company?: CockpitCompany }>(`/vendas/lead/${encodeURIComponent(lead.id)}/cockpit`)
      .then(res => { if (alive) { setCompany(res?.company ?? null); setCompanyLoading(false); } })
      .catch(() => { if (alive) { setCompany(null); setCompanyLoading(false); } });
    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then(res => { if (alive) setWaOk(res?.whatsappSession?.accessible === true); })
      .catch(() => { if (alive) setWaOk(false); });
    apiFetch<{ enabled?: boolean; ready?: boolean }>("/company-email/status")
      .then(res => { if (alive) setEmailReady(res?.ready === true); })
      .catch(() => { if (alive) setEmailReady(false); });
    // Flag do Copiloto (fail-closed: erro/ausente → painel some).
    apiFetch<{ ok?: boolean; enabled?: boolean }>("/assistente/copiloto")
      .then(res => { if (alive) setCopilotoEnabled(res?.enabled === true); })
      .catch(() => { if (alive) setCopilotoEnabled(false); });
    return () => { alive = false; };
  }, [open, lead.id]);

  const loadExtrato = useCallback(async (clienteId: string) => {
    try {
      const res = await apiFetch<Extrato>(`/financeiro-tenant/clientes/${encodeURIComponent(clienteId)}/extrato`);
      setExtrato(res ?? null);
      setExtratoError(res == null);
    } catch {
      setExtrato(null);
      setExtratoError(true);
    }
  }, []);

  // LEI DO VENDEDOR: o front NUNCA chama o financeiro sem canViewValues.
  useEffect(() => {
    if (!open || !canViewValues || !cpId) return;
    void (async () => { await loadExtrato(cpId); })();
  }, [open, canViewValues, cpId, loadExtrato]);

  // ── Ações ─────────────────────────────────────────────────────────────────

  async function gerarPrevia() {
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const res = await apiFetch<{ subject?: string; text?: string; recipientEmail?: string }>(
        `/vendas/leads/${encodeURIComponent(lead.id)}/email/presentation/preview`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setEmailPreview({
        subject: res?.subject || "",
        text: res?.text || "",
        to: res?.recipientEmail || lead.email || "",
      });
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : "Não foi possível gerar a prévia.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function enviarEmail() {
    if (!emailPreview || emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(lead.id)}/email/presentation/send`, {
        method: "POST",
        body: JSON.stringify({ subject: emailPreview.subject, text: emailPreview.text }),
      });
      setEmailMsg(`✓ E-mail enviado${emailPreview.to ? ` para ${emailPreview.to}` : ""}.`);
      setEmailPreview(null);
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : "Não foi possível enviar o e-mail.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function marcarPago(chargeId: string) {
    if (finBusyId || !cpId) return;
    setFinBusyId(chargeId);
    setFinMsg(null);
    try {
      await apiFetch(`/financeiro-tenant/charges/${encodeURIComponent(chargeId)}/quitar`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setFinMsg("✓ Título marcado como pago.");
      await loadExtrato(cpId);
    } catch (err) {
      setFinMsg(err instanceof Error ? err.message : "Não foi possível dar baixa no título.");
    } finally {
      setFinBusyId(null);
    }
  }

  async function gerarCobranca() {
    if (finBusyId) return;
    setFinBusyId("gerar");
    setFinMsg(null);
    try {
      const res = await apiFetch<{ customerProfileId?: string; alreadyExists?: boolean }>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/gerar-cobranca`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setFinMsg(res?.alreadyExists ? "✓ Cobrança já existia — extrato atualizado." : "✓ Cobrança gerada.");
      if (res?.customerProfileId) setCpId(res.customerProfileId); // o efeito recarrega o extrato
      else if (cpId) await loadExtrato(cpId);
    } catch (err) {
      setFinMsg(err instanceof Error ? err.message : "Não foi possível gerar a cobrança.");
    } finally {
      setFinBusyId(null);
    }
  }

  // Copiloto → rascunho: preenche o campo de digitação do WhatsApp (o painel já
  // está na guia Atendimento em vista). NUNCA envia — o humano aperta enviar.
  const handleCopilotoDraft = useCallback((text: string) => {
    setDraftSignal((cur) => ({ text, seq: cur.seq + 1 }));
  }, []);

  // Copiloto → salvar resumo / próxima ação como anotação neutra (W3).
  // POST /vendas/lead/:leadId/note → { ok, event }; prepende o evento na timeline
  // local (a guia Cadastro mostra na hora, sem refetch do card). Erro sobe pro
  // CopilotoPanel, que exibe "Não consegui salvar." (fail-soft).
  const handleSaveNote = useCallback(async (text: string) => {
    const res = await apiFetch<{ ok?: boolean; event?: {
      id: string; eventType?: string | null; title?: string | null; description?: string | null; createdAt?: string | null;
    } }>(`/vendas/lead/${encodeURIComponent(lead.id)}/note`, {
      method: "POST",
      body: JSON.stringify({ note: text }),
    });
    const ev = res?.event;
    if (ev?.id) {
      setAddedNotes((cur) => [{
        id: ev.id,
        eventType: ev.eventType ?? "note",
        title: ev.title ?? "Anotação",
        description: ev.description ?? text,
        createdAt: ev.createdAt ?? new Date().toISOString(),
      }, ...cur]);
    }
  }, [lead.id]);

  // Atalho Concierge — semeia o segmento/cidade do lead e leva pra /concierge.
  // Só grava a semente + navega; a busca só dispara no Confirmar do Concierge.
  const buscarParecidos = useCallback(() => {
    try {
      sessionStorage.setItem("hbx:concierge-seed", JSON.stringify({
        targetSegment: lead.segment || "",
        city: lead.city || "",
        state: lead.state || "",
      }));
    } catch { /* sem storage — segue pra tela mesmo assim */ }
    router.push("/concierge");
  }, [lead.segment, lead.city, lead.state, router]);

  // ── Dados derivados ───────────────────────────────────────────────────────

  const cityUf = lead.city ? `${lead.city}${lead.state ? "/" + lead.state : ""}` : null;
  const cnpjShown = (company?.found && company?.cnpj) || lead.cnpj || null;

  function copiarCnpj() {
    if (!cnpjShown) return;
    navigator.clipboard?.writeText(cnpjShown).then(
      () => { setCnpjCopied(true); setTimeout(() => setCnpjCopied(false), 1500); },
      () => undefined,
    );
  }

  const li = lead.leadIntelligence;
  // `messageTemplate` pode vir string OU objeto {id,context,tone,text} (o board
  // expõe templates[0] do enrichment). Só o texto vira React child — renderizar
  // o objeto cru estoura React #31. Extrai o texto dos dois formatos.
  const templateText =
    typeof li?.messageTemplate === "string"
      ? li.messageTemplate
      : String((li?.messageTemplate as { text?: string } | null | undefined)?.text || "");
  const temAbordagem = Boolean(
    li && (li.recommendedChannel || li.painType || li.painPitch || templateText || li.opportunityReason),
  );

  function copiarTemplate() {
    const text = templateText;
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => { setTplCopied(true); setTimeout(() => setTplCopied(false), 1500); },
      () => undefined,
    );
  }

  // Telefones/e-mails: principal + extras, dedup (badge WhatsApp ✓ pelo mapa).
  const phones = [lead.phone, ...(Array.isArray(lead.phones) ? lead.phones : [])]
    .filter((p): p is string => Boolean(p))
    .filter((p, i, a) => a.findIndex(x => onlyDigits(x) === onlyDigits(p)) === i);
  const emails = [lead.email, ...(Array.isArray(lead.emails) ? lead.emails : [])]
    .filter((e): e is string => Boolean(e))
    .filter((e, i, a) => a.indexOf(e) === i);
  const waMap = lead.phonesWhatsapp || {};
  const hasExistingConversation = Boolean(lead.conversation?.id || lead.conversation?.exists);

  const historico = [...addedNotes, ...(lead.timeline || [])].slice(0, 8);

  // Ficha do Copiloto: preferir a RFB rica (endpoint /cockpit) quando houver
  // match; senão, cair no que o card já traz. Segmento/cidade/UF são sempre do
  // lead (o endpoint não os devolve).
  const copilotoFicha: CopilotoFicha = {
    nome: lead.name,
    razaoSocial: (company?.found && company?.razaoSocial) || lead.razaoSocial || null,
    cnpj: (company?.found && company?.cnpj) || lead.cnpj || null,
    cnae: (company?.found && company?.cnae) || lead.cnae || null,
    segmento: lead.segment,
    cidade: lead.city,
    uf: lead.state,
    situacao: (company?.found && company?.situacao) || lead.companySituation || null,
  };

  if (!open) return null;

  // ── Guias ─────────────────────────────────────────────────────────────────

  function renderAtendimento() {
    return (
      <div className="lead-cockpit__grid">
        <div className="lead-cockpit__col">
          <section className="lead-cockpit__box">
            {copilotoEnabled && (
              <CopilotoPanel
                leadId={lead.id}
                ficha={copilotoFicha}
                onDraft={handleCopilotoDraft}
                onSaveNote={handleSaveNote}
              />
            )}
            <h4 className="lead-cockpit__box-title"><I d={ICONS.msg} size={12} /> WhatsApp</h4>
            {!lead.phone ? (
              <p className="muted-note">Lead sem telefone.</p>
            ) : waOk === false && !hasExistingConversation ? (
              <div className="lead-cockpit__noconn">
                <p className="hint">Conecte o WhatsApp da empresa pra conversar com este lead sem sair do funil.</p>
                <button type="button" className="btn-teal" onClick={() => setWaConnectOpen(true)}>
                  <WhatsAppMark size={14} /> Conectar WhatsApp
                </button>
              </div>
            ) : waOk === true || hasExistingConversation ? (
              <ConversationPanel
                key={lead.id}
                phone={lead.phone}
                name={lead.name}
                draftSignal={draftSignal}
                leadId={lead.id}
                conversationId={lead.conversation?.id}
                conversationSnapshot={{ conversation: lead.conversation, engagement: lead.engagement }}
                onConversationChanged={onConversationChanged}
              />
            ) : (
              <p className="muted-note">Verificando conexão…</p>
            )}
          </section>
        </div>

        <div className="lead-cockpit__col">
          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.mail} size={12} /> E-mail</h4>
            {!lead.email ? (
              <p className="muted-note">Lead sem e-mail.</p>
            ) : emailReady === false ? (
              <div className="lead-cockpit__noconn">
                <p className="hint">O e-mail da empresa ainda não está configurado.</p>
                <button type="button" className="btn-ghost" onClick={() => router.push("/configuracoes")}>
                  Configurar e-mail
                </button>
              </div>
            ) : emailReady === true ? (
              <React.Fragment>
                <div className="kv">
                  <KvRow label="Para">{lead.email}</KvRow>
                </div>
                {emailPreview ? (
                  <div className="lead-cockpit__preview">
                    <span className="lead-cockpit__preview-subj">{emailPreview.subject || "—"}</span>
                    <p className="lead-cockpit__txt">{emailPreview.text || "—"}</p>
                    <div className="lead-cockpit__row-acts">
                      <button type="button" className="btn-ghost btn-xs" onClick={gerarPrevia} disabled={emailBusy}>
                        Gerar de novo
                      </button>
                      <button type="button" className="btn-teal btn-xs" onClick={enviarEmail} disabled={emailBusy}>
                        <I d={ICONS.send} size={12} /> {emailBusy ? "Enviando…" : "Enviar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn-ghost" onClick={gerarPrevia} disabled={emailBusy}>
                    <I d={ICONS.mail} size={13} /> {emailBusy ? "Gerando…" : "Gerar prévia de apresentação"}
                  </button>
                )}
                {emailMsg && <span className={"ctx-msg " + (emailMsg.startsWith("✓") ? "ok" : "err")}>{emailMsg}</span>}
              </React.Fragment>
            ) : (
              <p className="muted-note">Verificando configuração…</p>
            )}
          </section>

          {temAbordagem && (
            <LockGate locked={!canIntel} ctaText="Disponível no HBX Lead+/Pro">
              <section className="lead-cockpit__box">
                <h4 className="lead-cockpit__box-title"><I d={ICONS.bolt} size={12} /> Abordagem</h4>
                {(li?.recommendedChannel || li?.painType) && (
                  <div className="kv">
                    {li?.recommendedChannel && <KvRow label="Canal recomendado">{humanize(li.recommendedChannel)}</KvRow>}
                    {li?.painType && <KvRow label="Dor">{humanize(li.painType)}</KvRow>}
                  </div>
                )}
                {li?.painPitch && <p className="lead-cockpit__txt">{li.painPitch}</p>}
                {li?.opportunityReason && (
                  <div className="lead-cockpit__block">
                    <span className="dn-section-head">Por que é oportunidade</span>
                    <p className="lead-cockpit__txt">{li.opportunityReason}</p>
                  </div>
                )}
                {templateText && (
                  <div className="lead-cockpit__block">
                    <span className="dn-section-head">Modelo de mensagem</span>
                    <p className="lead-cockpit__txt">{templateText}</p>
                    <button type="button" className="btn-ghost btn-xs" onClick={copiarTemplate}>
                      <I d={tplCopied ? ICONS.check : ICONS.doc} size={12} /> {tplCopied ? "Copiado" : "Copiar mensagem"}
                    </button>
                  </div>
                )}
              </section>
            </LockGate>
          )}

          <section className="lead-cockpit__box">
            {lead.returnAt && (
              <div className="kv">
                <KvRow label="Próximo retorno"><span className="tag warn">{fmtDate(lead.returnAt)}</span></KvRow>
              </div>
            )}
            <AgendaLeadPanel key={lead.id} leadId={lead.id} />
          </section>
        </div>
      </div>
    );
  }

  function renderEmpresa() {
    if (companyLoading) {
      return (
        <div className="kv">
          {["CNPJ", "Razão social", "Capital social"].map(k => (
            <div className="row dn-kv-row" key={k}>
              <span className="k">{k}</span>
              <span className="v"><span className="dn-skel dn-skel-sm dn-skel-w45" /></span>
            </div>
          ))}
        </div>
      );
    }
    const c = company;
    // Fallback: sem endpoint/sem match na RFB → só o que o card já tem.
    const fallbackRows = (
      <div className="kv">
        <CopyRow label="CNPJ" value={c?.cnpj || lead.cnpj} />
        <CopyRow label="Razão social" value={c?.razaoSocial || lead.razaoSocial} mono={false} />
        <KvRow label="CNAE">{lead.cnae || "—"}</KvRow>
        <KvRow label="Situação">{lead.companySituation ? humanize(lead.companySituation) : "—"}</KvRow>
      </div>
    );
    if (c?.locked) {
      return (
        <LockGate locked ctaText="Disponível no HBX Pro">
          {fallbackRows}
        </LockGate>
      );
    }
    if (!c?.found) {
      return (
        <React.Fragment>
          {fallbackRows}
          <p className="hint">Sem ficha completa da Receita pra este card{lead.cnpj ? "" : " — lead sem CNPJ"}.</p>
        </React.Fragment>
      );
    }
    const idade = yearsSince(c.openedAt);
    return (
      <React.Fragment>
        <div className="kv">
          <CopyRow label="CNPJ" value={c.cnpj || lead.cnpj} />
          <CopyRow label="Razão social" value={c.razaoSocial || lead.razaoSocial} mono={false} />
          <KvRow label="Nome fantasia">{c.nomeFantasia || "—"}</KvRow>
          <KvRow label="Situação">
            {c.situacao
              ? <span className={"tag" + (String(c.situacao).toLowerCase().includes("ativa") ? " teal" : " warn")}>{humanize(c.situacao)}</span>
              : "—"}
          </KvRow>
          <KvRow label="CNAE">{c.cnae ? `${c.cnae}${c.cnaeDescription ? ` — ${c.cnaeDescription}` : ""}` : (lead.cnae || "—")}</KvRow>
          <KvRow label="Porte">{c.porte || "—"}</KvRow>
          <KvRow label="Capital social">{c.capitalSocial != null ? fmtMoney(c.capitalSocial) : "—"}</KvRow>
          <KvRow label="Natureza jurídica">{c.naturezaJuridica || "—"}</KvRow>
          <KvRow label="Abertura">
            {c.openedAt ? `${fmtDate(c.openedAt)}${idade != null ? ` · ${idade} ano${idade === 1 ? "" : "s"}` : ""}` : "—"}
          </KvRow>
          <KvRow label="Simples Nacional">{c.simples == null ? "—" : c.simples ? "Sim" : "Não"}</KvRow>
          <KvRow label="MEI">{c.mei == null ? "—" : c.mei ? "Sim" : "Não"}</KvRow>
          <KvRow label="Unidade">{c.matrizFilial ? humanize(c.matrizFilial) : "—"}</KvRow>
        </div>
        {Array.isArray(c.partners) && c.partners.length > 0 && (
          <div className="lead-cockpit__block">
            <span className="dn-section-head"><I d={ICONS.users} size={11} /> Quadro societário</span>
            <div className="kv">
              {c.partners.map((p, i) => (
                <div className="row dn-kv-row" key={`p-${i}`}>
                  <span className="k">{p.qualification ? humanize(p.qualification) : "Sócio"}</span>
                  <span className="v">{p.name || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  function renderCadastro() {
    return (
      <div className="lead-cockpit__grid">
        <div className="lead-cockpit__col">
          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.phone} size={12} /> Contato</h4>
            <div className="kv">
              {phones.length === 0 && <KvRow label="Telefone"><span className="muted-note">—</span></KvRow>}
              {phones.map((p, i) => (
                <CopyRow
                  key={`ph-${i}`}
                  label={i === 0 ? "Telefone" : `Telefone ${i + 1}`}
                  value={formatBrPhone(p) || p}
                  badge={waMap[onlyDigits(p)] === true ? <span className="tag teal">WhatsApp ✓</span> : undefined}
                />
              ))}
              {emails.length === 0 && <KvRow label="E-mail"><span className="muted-note">—</span></KvRow>}
              {emails.map((em, i) => (
                <CopyRow key={`em-${i}`} label={i === 0 ? "E-mail" : `E-mail ${i + 1}`} value={em} mono={false} />
              ))}
              <KvRow label="Site">
                {lead.website ? (
                  <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
                    {lead.website}
                  </a>
                ) : "—"}
              </KvRow>
              <KvRow label="Endereço">{lead.address || "—"}</KvRow>
              <KvRow label="Cidade/UF">{cityUf || "—"}</KvRow>
            </div>
          </section>

          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.scrape} size={12} /> Origem &amp; sinais</h4>
            <div className="kv">
              <KvRow label="Fonte">{(lead.primarySource || lead.sourceType) ? humanize(lead.primarySource || lead.sourceType) : "—"}</KvRow>
              {lead.timesSeen != null && lead.timesSeen > 1 && <KvRow label="Visto">{`${lead.timesSeen}×`}</KvRow>}
              {lead.rating != null && (
                <KvRow label="Avaliação">{`★ ${lead.rating.toFixed(1)}${lead.reviews ? ` · ${lead.reviews} avaliações` : ""}`}</KvRow>
              )}
              {lead.isFreshCompany && (
                <KvRow label="Recém-aberta">
                  <span className="tag teal">
                    {lead.daysSinceOpened != null
                      ? `🐣 Aberta há ${Math.max(0, Math.trunc(lead.daysSinceOpened))} dia${Math.max(0, Math.trunc(lead.daysSinceOpened)) === 1 ? "" : "s"}`
                      : "🐣 Aberta há pouco"}
                  </span>
                </KvRow>
              )}
              {lead.createdAt && <KvRow label="Criado em">{fmtDateTime(lead.createdAt)}</KvRow>}
              {lead.updatedAt && <KvRow label="Atualizado em">{fmtDateTime(lead.updatedAt)}</KvRow>}
            </div>
          </section>

          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.users} size={12} /> Responsável &amp; histórico</h4>
            <div className="kv">
              <KvRow label="Responsável">
                {lead.owner?.name ? (
                  <span className="lead-cockpit__owner"><Av name={lead.owner.name} size={18} /> {lead.owner.name}</span>
                ) : "—"}
              </KvRow>
            </div>
            {historico.length === 0 ? (
              <p className="muted-note">Sem histórico ainda.</p>
            ) : (
              <ul className="ctx-timeline">
                {historico.map(ev => (
                  <li className="ctx-tl-item" key={ev.id}>
                    <span className="ctx-tl-dot" aria-hidden="true" />
                    <div className="ctx-tl-body">
                      <span className="ctx-tl-title">{ev.title || "Atualização"}</span>
                      {ev.description && <span className="ctx-tl-desc">{ev.description}</span>}
                      <div className="ctx-tl-foot">
                        {ev.resultLabel && <span className="tag teal">{ev.resultLabel}</span>}
                        {ev.returnAt && <span className="tag warn">Retorno {fmtDate(ev.returnAt)}</span>}
                        <span className="ctx-tl-when">{fmtDate(ev.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="lead-cockpit__col">
          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.empresas} size={12} /> Empresa</h4>
            {renderEmpresa()}
          </section>
        </div>
      </div>
    );
  }

  function renderFinanceiro() {
    return (
      <div className="lead-cockpit__grid">
        <div className="lead-cockpit__col">
          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.money} size={12} /> Venda do card</h4>
            <div className="kv">
              <KvRow label="Status">
                {lead.saleStatusLabel
                  ? <span className={"tag" + (lead.saleStatus === "sale_confirmed" ? " teal" : "")}>{lead.saleStatusLabel}</span>
                  : "—"}
              </KvRow>
              <KvRow label="Valor fechado">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "—"}</KvRow>
              <KvRow label="Produto">{lead.product?.name || "—"}</KvRow>
              <KvRow label="Comissão">
                {lead.commissionAmount != null || lead.commissionStatusLabel
                  ? `${lead.commissionAmount != null ? fmtMoney(lead.commissionAmount) : ""}${lead.commissionAmount != null && lead.commissionStatusLabel ? " · " : ""}${lead.commissionStatusLabel || ""}`
                  : "—"}
              </KvRow>
              {lead.commissionDueAt && <KvRow label="Vence">{fmtDate(lead.commissionDueAt)}</KvRow>}
              {lead.commissionRecurring != null && <KvRow label="Recorrente">{lead.commissionRecurring ? "Sim" : "Não"}</KvRow>}
              {lead.setupValue != null && lead.setupValue > 0 && <KvRow label="Implantação">{fmtMoney(lead.setupValue)}</KvRow>}
              {lead.setupCommissionAmount != null && (
                <KvRow label="Comissão implantação">
                  {`${fmtMoney(lead.setupCommissionAmount)}${lead.setupCommissionStatusLabel ? ` · ${lead.setupCommissionStatusLabel}` : ""}`}
                </KvRow>
              )}
            </div>
          </section>
        </div>

        <div className="lead-cockpit__col">
          <section className="lead-cockpit__box">
            <h4 className="lead-cockpit__box-title"><I d={ICONS.relat} size={12} /> Extrato do cliente</h4>
            {finMsg && <span className={"ctx-msg " + (finMsg.startsWith("✓") ? "ok" : "err")}>{finMsg}</span>}
            {!cpId ? (
              <div className="lead-cockpit__noconn">
                <p className="muted-note">Sem movimentações — este card ainda não tem cliente no financeiro.</p>
                {(lead.saleValue ?? 0) > 0 ? (
                  <button type="button" className="btn-teal" onClick={gerarCobranca} disabled={finBusyId != null}>
                    {finBusyId === "gerar" ? "Gerando…" : "Gerar cobrança da venda"}
                  </button>
                ) : (
                  <p className="hint">Defina o valor da venda no card pra gerar a primeira cobrança.</p>
                )}
              </div>
            ) : extratoError ? (
              <p className="muted-note">Não foi possível carregar o extrato.</p>
            ) : extrato == null ? (
              <p className="muted-note">Carregando extrato…</p>
            ) : (
              <React.Fragment>
                <div className="lead-cockpit__saldo">
                  <span className="lead-cockpit__saldo-lbl">Saldo em aberto</span>
                  <span className="lead-cockpit__saldo-val">{fmtMoney(extrato.saldoAberto)}</span>
                </div>
                {extrato.charges.length === 0 ? (
                  <p className="muted-note">Nenhum título ainda.</p>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr><th>Título</th><th>Origem</th><th>Status</th><th>Valor</th><th>Vencimento</th><th /></tr>
                      </thead>
                      <tbody>
                        {extrato.charges.map(ch => (
                          <tr key={ch.id}>
                            <td>{ch.description || "—"}</td>
                            <td>{sourceModuleLabel(ch.sourceModule)}</td>
                            <td>
                              <span className={chargeTagCls(ch.status)} title={ch.paidAt ? `Pago em ${fmtDate(ch.paidAt)}` : undefined}>
                                {chargeStatusLabel(ch.status)}
                              </span>
                            </td>
                            <td className="hbx-mono">{fmtMoney(ch.amount)}</td>
                            <td className="hbx-mono">{fmtDate(ch.dueDate)}</td>
                            <td>
                              {String(ch.status || "").toLowerCase() === "pending" && (
                                <button type="button" className="btn-ghost btn-xs" onClick={() => marcarPago(ch.id)} disabled={finBusyId != null}>
                                  {finBusyId === ch.id ? "Baixando…" : "Marcar pago"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(lead.saleValue ?? 0) > 0 && (
                  <button
                    type="button"
                    className="btn-ghost btn-xs"
                    onClick={gerarCobranca}
                    disabled={finBusyId != null}
                    title="Gera o título da venda deste card (idempotente)"
                  >
                    <I d={ICONS.plus} size={12} /> {finBusyId === "gerar" ? "Gerando…" : "Gerar cobrança da venda"}
                  </button>
                )}
              </React.Fragment>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <React.Fragment>
      <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="hbx-modal lead-cockpit" role="dialog" aria-modal="true" aria-label={`Cockpit do lead ${lead.name || ""}`}>
          <div className="lead-cockpit__head">
            <Av name={lead.name || "—"} size={46} />
            <div className="lead-cockpit__id">
              <h3 className="lead-cockpit__name">{lead.name || "—"}</h3>
              <span className="lead-cockpit__sub">
                {[lead.razaoSocial, lead.segment, cityUf].filter(Boolean).join(" • ") || "—"}
              </span>
              <div className="lead-cockpit__badges">
                {lead.statusLabel && <span className="tag">{lead.statusLabel}</span>}
                {lead.leadTemperature && (
                  <span className={"tag" + (lead.leadTemperature === "quente" ? " red" : lead.leadTemperature === "morno" ? " warn" : "")}>
                    {humanize(lead.leadTemperature)}
                  </span>
                )}
                {lead.opportunityScore != null && lead.opportunityScore > 0 && (
                  <span className="lead-cockpit__score" title="Score de oportunidade">Score {lead.opportunityScore}/100</span>
                )}
              </div>
            </div>
            <div className="lead-cockpit__acts">
              {lead.phone && (
                <a className="btn-ghost btn-xs" href={`tel:${onlyDigits(lead.phone)}`}>
                  <I d={ICONS.phone} size={13} /> Ligar
                </a>
              )}
              {cnpjShown && (
                <button type="button" className="btn-ghost btn-xs" onClick={copiarCnpj}>
                  <I d={cnpjCopied ? ICONS.check : ICONS.doc} size={13} /> {cnpjCopied ? "Copiado" : "Copiar CNPJ"}
                </button>
              )}
              {conciergeVisible && (
                <button type="button" className="btn-ghost btn-xs" onClick={buscarParecidos} title="Achar mais empresas parecidas com o Concierge IA">
                  <I d={ICONS.concierge} size={13} /> Buscar parecidos
                </button>
              )}
              <button type="button" className="lead-cockpit__close" onClick={onClose} aria-label="Fechar cockpit">✕</button>
            </div>
          </div>

          <div className="glass-pill-track lead-cockpit__tabs" role="tablist" aria-label="Guias do cockpit">
            <GlassPill {...pill} />
            {guias.map(g => (
              <button
                key={g.key}
                type="button"
                ref={pill.itemRef(g.key)}
                role="tab"
                aria-selected={tab === g.key}
                className={"glass-pill-item lead-cockpit__tab" + (tab === g.key ? " active" : "")}
                onClick={() => setTab(g.key)}
              >
                <I d={g.icon} size={14} /> {g.label}
              </button>
            ))}
          </div>

          <div className="lead-cockpit__body">
            {tab === "atendimento" && renderAtendimento()}
            {tab === "cadastro" && renderCadastro()}
            {tab === "financeiro" && canViewValues && renderFinanceiro()}
          </div>
        </div>
      </div>

      {waConnectOpen && (
        <WhatsAppConnectModal
          open={waConnectOpen}
          onClose={() => setWaConnectOpen(false)}
          onConnected={() => { setWaOk(true); setWaConnectOpen(false); }}
          onDisconnected={() => setWaOk(false)}
        />
      )}
    </React.Fragment>
  );
}
