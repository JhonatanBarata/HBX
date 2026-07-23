"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { CopilotoPanel, type CopilotoFicha } from "@/app/(app)/leads/[id]/copiloto-panel";
import type { VendasLead } from "@/app/(app)/vendas/page.client";
import {
  AgendaLeadPanel,
  ConversationPanel,
  clientTimelineDescription,
  LockGate,
  formatPhoneDisplay,
  humanize,
  vendasEngagementMeta,
} from "@/components/hbx/detalhes-negocio";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { RadarAiBadge } from "@/components/hbx/radar-ai-badge";
import { CANAL_LABEL, CanalIcon, type Canal } from "@/components/hbx/canal-icon";
import {
  Av,
  I,
  ICONS,
  WhatsAppMark,
  isModuleVisible,
  useCurrentUser,
  useEntitlements,
  useMyModules,
} from "@/components/hbx/shell";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { apiFetch } from "@/lib/api";
import { onlyDigits } from "@/lib/br-phone";
import { formatBrCnae, formatBrCnpj } from "@/lib/br-document";
import type { RadarAiLeadStatus } from "@/lib/radar-ai-status";

type Guia = "atendimento" | "cadastro" | "financeiro";
type CanalAtendimento = "whatsapp" | "email";

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

type ExtratoCharge = {
  id: string;
  amount: number;
  description?: string | null;
  status?: string | null;
  sourceModule?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
};

type Extrato = {
  clienteId: string;
  nome?: string | null;
  saldoAberto: number;
  total: number;
  charges: ExtratoCharge[];
} | null;

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function yearsSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const years = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 ? years : null;
}

function chargeStatusLabel(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  if (key === "pending") return "Em aberto";
  if (key === "paid") return "Pago";
  if (["canceled", "cancelled"].includes(key)) return "Cancelado";
  if (key === "failed") return "Falhou";
  return status ? humanize(status) : "—";
}

function chargeTagClass(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  if (key === "paid") return "tag teal";
  if (key === "pending") return "tag warn";
  if (["canceled", "cancelled", "failed"].includes(key)) return "tag red";
  return "tag";
}

function sourceModuleLabel(source?: string | null): string {
  const key = String(source || "").toLowerCase();
  if (!key) return "—";
  if (key.startsWith("logistica")) return "Logística";
  if (key.startsWith("vendas")) return "Vendas";
  return humanize(key);
}

function TypewriterText({ text, speed = 14, delay = 90, className = "" }: {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
}) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
      const frame = window.requestAnimationFrame(() => {
        setShown(text);
        setDone(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = window.setTimeout(() => {
      let index = 0;
      interval = setInterval(() => {
        index += 1;
        setShown(text.slice(0, index));
        if (index >= text.length) {
          if (interval) clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [delay, speed, text]);

  return (
    <span className={`lead-cockpit__typed${done ? " is-done" : ""}${className ? ` ${className}` : ""}`} title={text}>
      {shown}
    </span>
  );
}

function AnimatedScore({ score, suffix = "/100", compact = false }: {
  score: number;
  suffix?: string;
  compact?: boolean;
}) {
  const target = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
      const frame = window.requestAnimationFrame(() => setValue(target));
      return () => window.cancelAnimationFrame(frame);
    }

    let frame = 0;
    let started = 0;
    const duration = 1350;
    const tick = (time: number) => {
      if (!started) started = time;
      const progress = Math.min(1, (time - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target]);

  const style = { "--lead-cockpit-score": `${value}%` } as React.CSSProperties;
  return (
    <span className={`lead-cockpit__animated-score${compact ? " is-compact" : ""}`} style={style} title={`Score: ${target}${suffix}`}>
      <strong>{value}</strong>
      <small>{suffix}</small>
    </span>
  );
}

function InfoRow({ label, children, mono = false }: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="lead-cockpit__kv-row">
      <span className="lead-cockpit__kv-key">{label}</span>
      <span className={`lead-cockpit__kv-value${mono ? " hbx-mono" : ""}`}>{children}</span>
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
  const display = value || "—";

  function copy() {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }

  return (
    <div className="lead-cockpit__kv-row">
      <span className="lead-cockpit__kv-key">{label}</span>
      <span className="lead-cockpit__copy-value">
        <span className={mono ? "hbx-mono" : ""} title={value || undefined}>{display}</span>
        {badge}
        {value && (
          <button type="button" className="lead-cockpit__copy-button" onClick={copy} aria-label={`Copiar ${label}`}>
            <I d={copied ? ICONS.check : ICONS.doc} size={11} />
          </button>
        )}
      </span>
    </div>
  );
}

function CardTitle({ icon, title, action }: {
  icon: string[];
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="lead-cockpit__compact-card-head">
      <span><I d={icon} size={12} /> {title}</span>
      {action}
    </div>
  );
}

export function LeadCockpitModal({ lead, aiStatus, canViewValues, open, onClose, onConversationChanged }: {
  lead: VendasLead;
  aiStatus?: RadarAiLeadStatus | null;
  canViewValues: boolean;
  open: boolean;
  onClose: () => void;
  onConversationChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const entitlements = useEntitlements();
  const currentUser = useCurrentUser();
  const modules = useMyModules();
  const canSeeIntelligence = !entitlements.loaded || entitlements.canSeeLeadIntelligence;
  const conciergeVisible = isModuleVisible("concierge", entitlements, currentUser, modules);

  const [tab, setTab] = useState<Guia>("atendimento");
  const [channel, setChannel] = useState<CanalAtendimento>("whatsapp");
  const [company, setCompany] = useState<CockpitCompany>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [waOk, setWaOk] = useState<boolean | null>(null);
  const [waConnectOpen, setWaConnectOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; text: string; to: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [copilotoEnabled, setCopilotoEnabled] = useState(false);
  const [draftSignal, setDraftSignal] = useState<{ text: string; seq: number }>({ text: "", seq: 0 });
  const [addedNotes, setAddedNotes] = useState<NonNullable<VendasLead["timeline"]>>([]);
  const [cnpjCopied, setCnpjCopied] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [customerProfileId, setCustomerProfileId] = useState<string | null>(lead.customerProfileId || null);
  const [extrato, setExtrato] = useState<Extrato>(null);
  const [extratoError, setExtratoError] = useState(false);
  const [financeBusy, setFinanceBusy] = useState<string | null>(null);
  const [financeMessage, setFinanceMessage] = useState<string | null>(null);

  // ── Painel de ações do lead (religado do antigo card lateral morto, 23/07):
  //    Observações + Fechar venda / Reagendar / Sem interesse. Reusa endpoints
  //    já existentes da tela Vendas — PATCH /vendas/lead/:id (shortNote/returnAt),
  //    POST /vendas/lead/:id/negativar. Zero backend novo.
  const [obsDraft, setObsDraft] = useState<string>(lead.shortNote || "");
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [reagendarData, setReagendarData] = useState("");
  const [reagendarOpen, setReagendarOpen] = useState(false);
  const [semInteresseOpen, setSemInteresseOpen] = useState(false);
  const [fecharOpen, setFecharOpen] = useState(false);

  async function salvarObs() {
    if (!lead.id || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ shortNote: obsDraft.trim().slice(0, 280) }),
      });
      setAcaoMsg("✓ Observação salva.");
      await onConversationChanged?.();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível salvar a observação.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function reagendarContato() {
    if (!lead.id || !reagendarData || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      const body: Record<string, unknown> = { returnAt: new Date(`${reagendarData}T09:00:00`).toISOString() };
      if (obsDraft.trim()) body.shortNote = obsDraft.trim().slice(0, 280);
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setAcaoMsg("✓ Contato reagendado.");
      setReagendarData("");
      setReagendarOpen(false);
      await onConversationChanged?.();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Falha ao reagendar o contato.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function marcarSemInteresse(motivo: string) {
    if (!lead.id || !motivo || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/negativar`, {
        method: "POST",
        body: JSON.stringify({ status: motivo }),
      });
      setSemInteresseOpen(false);
      await onConversationChanged?.();
      onClose();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível finalizar o lead.");
    } finally {
      setAcaoBusy(false);
    }
  }

  const guides: Array<{ key: Guia; label: string; icon: string[] }> = canViewValues
    ? [
        { key: "atendimento", label: "Atendimento", icon: ICONS.msg },
        { key: "cadastro", label: "Cadastro", icon: ICONS.doc },
        { key: "financeiro", label: "Financeiro", icon: ICONS.money },
      ]
    : [
        { key: "atendimento", label: "Atendimento", icon: ICONS.msg },
        { key: "cadastro", label: "Cadastro", icon: ICONS.doc },
      ];
  const tabPill = useGlassPill<HTMLButtonElement>(tab, guides.length);

  const channelTargets: Partial<Record<Canal, string>> = {
    whatsapp: lead.phone || undefined,
    telefone: lead.phone ? `tel:${onlyDigits(lead.phone)}` : undefined,
    email: lead.email || undefined,
    instagram: lead.leadIntelligence?.instagramUrl || lead.ownerInstagram || undefined,
    facebook: lead.leadIntelligence?.facebookUrl || lead.ownerFacebook || undefined,
    site: lead.website ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`) : undefined,
  };
  // Ordem da fileira do topo: LIGAR sempre primeiro (ordem do dono), o resto
  // depois. Só entra canal que o lead realmente tem — o filtro abaixo é o que
  // garante isso, então a fileira nunca mostra um ícone que não leva a lugar
  // nenhum.
  const availableChannels = (["telefone", "whatsapp", "email", "instagram", "facebook", "site"] as Canal[])
    .filter((canal) => Boolean(channelTargets[canal]));

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (agendaOpen) setAgendaOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agendaOpen, onClose, open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    apiFetch<{ company?: CockpitCompany }>(`/vendas/lead/${encodeURIComponent(lead.id)}/cockpit`)
      .then((response) => {
        if (!alive) return;
        setCompany(response?.company ?? null);
        setCompanyLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setCompany(null);
        setCompanyLoading(false);
      });

    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then((response) => { if (alive) setWaOk(response?.whatsappSession?.accessible === true); })
      .catch(() => { if (alive) setWaOk(false); });

    apiFetch<{ ready?: boolean }>("/company-email/status")
      .then((response) => { if (alive) setEmailReady(response?.ready === true); })
      .catch(() => { if (alive) setEmailReady(false); });

    apiFetch<{ enabled?: boolean }>("/assistente/copiloto")
      .then((response) => { if (alive) setCopilotoEnabled(response?.enabled === true); })
      .catch(() => { if (alive) setCopilotoEnabled(false); });

    return () => { alive = false; };
  }, [lead.id, open]);

  const loadExtrato = useCallback(async (id: string) => {
    try {
      const response = await apiFetch<Extrato>(`/financeiro-tenant/clientes/${encodeURIComponent(id)}/extrato`);
      setExtrato(response ?? null);
      setExtratoError(response == null);
    } catch {
      setExtrato(null);
      setExtratoError(true);
    }
  }, []);

  useEffect(() => {
    if (!open || !canViewValues || !customerProfileId) return;
    void loadExtrato(customerProfileId);
  }, [canViewValues, customerProfileId, loadExtrato, open]);

  const cityState = lead.city ? `${lead.city}${lead.state ? `/${lead.state}` : ""}` : "—";
  const cnpj = (company?.found && company.cnpj) || lead.cnpj || null;
  const intelligence = lead.leadIntelligence;
  const templateText = typeof intelligence?.messageTemplate === "string"
    ? intelligence.messageTemplate
    : String((intelligence?.messageTemplate as { text?: string } | null | undefined)?.text || "");
  const opportunityScore = Math.max(0, Math.min(100, Math.round(Number(lead.opportunityScore) || 0)));
  const conversationState = vendasEngagementMeta(lead.engagement, lead.conversation).state;
  const hasConversation = conversationState !== "no_conversation" && conversationState !== "no_messages";
  const phones = [lead.phone, ...(Array.isArray(lead.phones) ? lead.phones : [])]
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.findIndex((other) => onlyDigits(other) === onlyDigits(item)) === index);
  const emails = [lead.email, ...(Array.isArray(lead.emails) ? lead.emails : [])]
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index);
  const whatsappMap = lead.phonesWhatsapp || {};
  const history = [...addedNotes, ...(lead.timeline || [])].slice(0, 6);
  const primaryPartner = company?.partners?.[0];
  const keyPersonName = primaryPartner?.name || lead.ownerName || lead.ownerNames?.[0] || "—";
  const keyPersonRole = primaryPartner?.qualification || (keyPersonName !== "—" ? "Pessoa-chave" : "Não identificada");

  const registrationValues = [
    lead.phone,
    lead.email,
    cnpj,
    company?.razaoSocial || lead.razaoSocial,
    company?.cnae || lead.cnae,
    lead.city,
    lead.state,
    keyPersonName !== "—" ? keyPersonName : null,
    lead.address,
    lead.website,
  ];
  const registrationQuality = Math.round((registrationValues.filter(Boolean).length / registrationValues.length) * 100);

  const recommendedChannel = intelligence?.recommendedChannel ? humanize(intelligence.recommendedChannel) : (lead.email ? "E-mail" : "WhatsApp");
  const pain = intelligence?.painType ? humanize(intelligence.painType) : (lead.website ? "Atendimento" : "Sem site");
  const smartTitle = recommendedChannel.toLowerCase().includes("mail")
    ? "Próxima melhor ação: e-mail curto, WhatsApp no retorno"
    : `Próxima melhor ação: iniciar por ${recommendedChannel}`;
  const smartReason = intelligence?.painPitch
    || intelligence?.opportunityReason
    || "Use o contato confirmado e uma mensagem curta para abrir a conversa sem parecer invasivo.";
  const approachReason = intelligence?.opportunityReason
    || "Contato confirmado e sinais comerciais suficientes para uma abordagem consultiva e objetiva.";

  const copilotoFicha: CopilotoFicha = {
    nome: lead.name,
    razaoSocial: (company?.found && company.razaoSocial) || lead.razaoSocial || null,
    cnpj: (company?.found && company.cnpj) || lead.cnpj || null,
    cnae: (company?.found && company.cnae) || lead.cnae || null,
    segmento: lead.segment,
    cidade: lead.city,
    uf: lead.state,
    situacao: (company?.found && company.situacao) || lead.companySituation || null,
  };

  function handleCopilotoDraft(text: string) {
    setDraftSignal((current) => ({ text, seq: current.seq + 1 }));
    setChannel("whatsapp");
  }

  async function saveCopilotoNote(text: string) {
    const response = await apiFetch<{ event?: NonNullable<VendasLead["timeline"]>[number] }>(
      `/vendas/lead/${encodeURIComponent(lead.id)}/note`,
      { method: "POST", body: JSON.stringify({ note: text }) },
    );
    if (response?.event?.id) setAddedNotes((current) => [response.event as NonNullable<VendasLead["timeline"]>[number], ...current]);
  }

  async function generateEmailPreview() {
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const response = await apiFetch<{ subject?: string; text?: string; recipientEmail?: string }>(
        `/vendas/leads/${encodeURIComponent(lead.id)}/email/presentation/preview`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setEmailPreview({
        subject: response?.subject || "",
        text: response?.text || "",
        to: response?.recipientEmail || lead.email || "",
      });
    } catch (error) {
      setEmailMsg(error instanceof Error ? error.message : "Não foi possível gerar a prévia.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function sendEmail() {
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
    } catch (error) {
      setEmailMsg(error instanceof Error ? error.message : "Não foi possível enviar o e-mail.");
    } finally {
      setEmailBusy(false);
    }
  }

  function copyCnpj() {
    if (!cnpj) return;
    navigator.clipboard?.writeText(cnpj).then(
      () => {
        setCnpjCopied(true);
        window.setTimeout(() => setCnpjCopied(false), 1500);
      },
      () => undefined,
    );
  }

  function copyTemplate() {
    if (!templateText) return;
    navigator.clipboard?.writeText(templateText).then(
      () => {
        setTemplateCopied(true);
        window.setTimeout(() => setTemplateCopied(false), 1500);
      },
      () => undefined,
    );
  }

  function searchSimilar() {
    try {
      sessionStorage.setItem("hbx:concierge-seed", JSON.stringify({
        targetSegment: lead.segment || "",
        city: lead.city || "",
        state: lead.state || "",
      }));
    } catch { /* segue sem storage */ }
    router.push("/concierge");
  }

  async function markPaid(chargeId: string) {
    if (!customerProfileId || financeBusy) return;
    setFinanceBusy(chargeId);
    setFinanceMessage(null);
    try {
      await apiFetch(`/financeiro-tenant/charges/${encodeURIComponent(chargeId)}/quitar`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setFinanceMessage("✓ Título marcado como pago.");
      await loadExtrato(customerProfileId);
    } catch (error) {
      setFinanceMessage(error instanceof Error ? error.message : "Não foi possível dar baixa no título.");
    } finally {
      setFinanceBusy(null);
    }
  }

  async function createCharge() {
    if (financeBusy) return;
    setFinanceBusy("create");
    setFinanceMessage(null);
    try {
      const response = await apiFetch<{ customerProfileId?: string; alreadyExists?: boolean }>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/gerar-cobranca`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setFinanceMessage(response?.alreadyExists ? "✓ Cobrança já existia — extrato atualizado." : "✓ Cobrança gerada.");
      if (response?.customerProfileId) setCustomerProfileId(response.customerProfileId);
      else if (customerProfileId) await loadExtrato(customerProfileId);
    } catch (error) {
      setFinanceMessage(error instanceof Error ? error.message : "Não foi possível gerar a cobrança.");
    } finally {
      setFinanceBusy(null);
    }
  }

  function renderWhatsapp() {
    if (!lead.phone) return <div className="lead-cockpit__empty-state">Lead sem telefone.</div>;
    if (waOk === false && !hasConversation) {
      return (
        <div className="lead-cockpit__empty-state">
          <strong>WhatsApp ainda não conectado</strong>
          <span>Conecte a sessão da empresa para conversar sem sair do funil.</span>
          <button type="button" className="btn-teal btn-xs" onClick={() => setWaConnectOpen(true)}>
            <WhatsAppMark size={13} /> Conectar WhatsApp
          </button>
        </div>
      );
    }
    if (waOk == null && !hasConversation) return <div className="lead-cockpit__empty-state">Verificando conexão…</div>;
    return (
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
    );
  }

  function renderEmail() {
    if (!lead.email) return <div className="lead-cockpit__empty-state">Lead sem e-mail.</div>;
    if (emailReady === false) {
      return (
        <div className="lead-cockpit__empty-state">
          <strong>E-mail da empresa não configurado</strong>
          <button type="button" className="btn-ghost btn-xs" onClick={() => router.push("/configuracoes")}>Configurar e-mail</button>
        </div>
      );
    }
    if (emailReady == null) return <div className="lead-cockpit__empty-state">Verificando configuração…</div>;
    return (
      <div className="lead-cockpit__email-workspace">
        <InfoRow label="Para">{lead.email}</InfoRow>
        {emailPreview ? (
          <div className="lead-cockpit__email-preview">
            <strong>{emailPreview.subject || "Sem assunto"}</strong>
            <TypewriterText key={emailPreview.text} text={emailPreview.text || "—"} className="lead-cockpit__email-preview-text" />
            <div className="lead-cockpit__inline-actions">
              <button type="button" className="btn-ghost btn-xs" onClick={generateEmailPreview} disabled={emailBusy}>Gerar de novo</button>
              <button type="button" className="btn-teal btn-xs" onClick={sendEmail} disabled={emailBusy}>
                <I d={ICONS.send} size={11} /> {emailBusy ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="lead-cockpit__email-generate" onClick={generateEmailPreview} disabled={emailBusy}>
            <I d={ICONS.mail} size={13} /> {emailBusy ? "Gerando…" : "Gerar prévia de apresentação"}
          </button>
        )}
        {emailMsg && <span className={`ctx-msg ${emailMsg.startsWith("✓") ? "ok" : "err"}`}>{emailMsg}</span>}
      </div>
    );
  }

  function renderAtendimento() {
    return (
      <div className="lead-cockpit__approved-grid lead-cockpit__approved-grid--service">
        <div className="lead-cockpit__service-left">
          <section className="lead-cockpit__smart-card">
            <span className="lead-cockpit__smart-icon"><I d={ICONS.bolt} size={17} /></span>
            <span className="lead-cockpit__smart-copy">
              <strong>{smartTitle}</strong>
              <TypewriterText key={`${lead.id}-smart`} text={smartReason} />
            </span>
            <span className="lead-cockpit__smart-actions">
              {copilotoEnabled ? (
                <CopilotoPanel
                  leadId={lead.id}
                  ficha={copilotoFicha}
                  onDraft={handleCopilotoDraft}
                  onSaveNote={saveCopilotoNote}
                />
              ) : (
                <span className="muted-note">Copiloto indisponível</span>
              )}
            </span>
          </section>

          <section className="lead-cockpit__chat-card">
            <div className="lead-cockpit__channel-tabs">
              <button type="button" className={channel === "whatsapp" ? "is-active" : ""} onClick={() => setChannel("whatsapp")}>
                <WhatsAppMark size={13} /> WhatsApp
              </button>
              <button type="button" className={channel === "email" ? "is-active" : ""} onClick={() => setChannel("email")}>
                <I d={ICONS.mail} size={12} /> E-mail
              </button>
              <span className="lead-cockpit__channel-status">
                {channel === "whatsapp" ? (hasConversation ? "Conversa existente" : "Sem mensagens") : (lead.email ? "E-mail disponível" : "Sem e-mail")}
              </span>
            </div>
            <div className="lead-cockpit__channel-body">
              {channel === "whatsapp" ? renderWhatsapp() : renderEmail()}
            </div>
          </section>
        </div>

        <div className="lead-cockpit__service-right">
          <div className="lead-cockpit__service-top-two">
            <section className="lead-cockpit__compact-card">
              {/* S00 (PADRAO-MERCADO) — B1: selo só com prova real (whatsappMap), não por telefone
                  preenchido; mesma condição da linha ~771 deste arquivo (evita "check" falso). */}
              <CardTitle icon={ICONS.phone} title="Contato rápido" action={whatsappMap[onlyDigits(lead.phone)] === true ? <span className="tag teal">WhatsApp ✓</span> : undefined} />
              <InfoRow label="Telefone" mono>{lead.phone ? formatPhoneDisplay(lead.phone) : "—"}</InfoRow>
              <InfoRow label="E-mail">{lead.email || "—"}</InfoRow>
            </section>

            <section className="lead-cockpit__compact-card lead-cockpit__agenda-summary">
              <CardTitle
                icon={ICONS.clock}
                title="Agenda"
                action={<button type="button" className="lead-cockpit__micro-button" onClick={() => setAgendaOpen(true)}>Agendar</button>}
              />
              <InfoRow label="Próximo passo">{lead.nextAction || "Primeiro contato"}</InfoRow>
              <InfoRow label="Prazo">{lead.returnAt ? fmtDateTime(lead.returnAt) : "Hoje"}</InfoRow>
            </section>
          </div>

          {/* Painel religado (23/07) — Observações + ações do lead, abaixo da
              Agenda. Voltou o que morreu junto do card lateral: Fechar venda,
              Reagendar e Sem interesse (finalizar). */}
          <section className="lead-cockpit__compact-card lead-cockpit__acoes-card">
            <CardTitle icon={ICONS.doc} title="Observações" />
            <textarea
              className="field-dark"
              rows={3}
              maxLength={280}
              placeholder="Anotações deste lead…"
              value={obsDraft}
              onChange={(e) => setObsDraft(e.target.value)}
              style={{ resize: "vertical", width: "100%", paddingTop: 8, paddingBottom: 8 }}
            />
            {acaoMsg && <div className={"ctx-msg " + (acaoMsg.startsWith("✓") ? "ok" : "err")}>{acaoMsg}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button className="btn-ghost" disabled={acaoBusy} onClick={salvarObs}>
                {acaoBusy ? "Salvando…" : "Salvar observação"}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <button className="btn-teal" disabled={acaoBusy} onClick={() => setFecharOpen(true)}>
                <I d={ICONS.money} size={13} /> Fechar venda
              </button>
              <button className={"btn-ghost" + (reagendarOpen ? " is-active" : "")} disabled={acaoBusy} onClick={() => { setReagendarOpen((o) => !o); setSemInteresseOpen(false); }}>
                <I d={ICONS.clock} size={13} /> Reagendar
              </button>
              <button className={"btn-ghost" + (semInteresseOpen ? " is-active" : "")} disabled={acaoBusy} onClick={() => { setSemInteresseOpen((o) => !o); setReagendarOpen(false); }}>
                Sem interesse {semInteresseOpen ? "▴" : "▾"}
              </button>
            </div>
          </section>
        </div>

        {/* 3ª coluna (22/07): Inteligência + Mensagem saíram de baixo do Contato/
            Agenda e vieram pro lado. Empilhadas em 0.88fr elas espremiam a letra
            até 4px; deitadas em 3 colunas sobra altura pra escala legível sem
            estourar a moldura (que continua com o clamp adaptativo da S1/S2). */}
        <div className="lead-cockpit__service-far">
          <LockGate locked={!canSeeIntelligence} ctaText="Disponível no HBX Lead+/Pro">
            <section className="lead-cockpit__compact-card lead-cockpit__intelligence-card">
              <CardTitle icon={ICONS.scrape} title="Inteligência do lead" action={<span className="tag">Enriquecido</span>} />
              <div className="lead-cockpit__intelligence-main">
                <AnimatedScore score={opportunityScore} />
                <span>
                  <strong>Boa oportunidade de abordagem</strong>
                  <TypewriterText key={`${lead.id}-reason`} text={approachReason} delay={130} />
                </span>
              </div>
              <div className="lead-cockpit__signals">
                <span><small>Canal</small><strong>{recommendedChannel}</strong></span>
                <span><small>Dor</small><strong>{pain}</strong></span>
                <span><small>Contato</small><strong>{lead.phone || lead.email ? "Confirmado" : "Parcial"}</strong></span>
                <span><small>Temperatura</small><strong>{lead.leadTemperature ? humanize(lead.leadTemperature) : "Morno"}</strong></span>
              </div>
            </section>
          </LockGate>

          <section className="lead-cockpit__compact-card lead-cockpit__template-card">
            <CardTitle
              icon={ICONS.mail}
              title="Mensagem sugerida"
              action={templateText ? (
                <button type="button" className="lead-cockpit__micro-button" onClick={copyTemplate}>
                  <I d={templateCopied ? ICONS.check : ICONS.doc} size={10} /> {templateCopied ? "Copiado" : "Copiar"}
                </button>
              ) : undefined}
            />
            <blockquote>
              <TypewriterText
                key={`${lead.id}-template`}
                text={templateText || "Use uma mensagem curta, personalizada e consultiva para validar a dor antes de apresentar a solução."}
                delay={180}
              />
            </blockquote>
            <div className="lead-cockpit__chips">
              <span className="tag teal">Curta</span>
              <span className="tag teal">Personalizada</span>
              <span className="tag">Tom consultivo</span>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderCompanyRows() {
    if (companyLoading) return <div className="lead-cockpit__empty-state">Carregando Receita Federal…</div>;
    const source = company?.found ? company : null;
    const age = yearsSince(source?.openedAt);
    return (
      <>
        <CopyRow label="Razão social" value={source?.razaoSocial || lead.razaoSocial} mono={false} />
        <CopyRow label="CNPJ" value={formatBrCnpj(source?.cnpj || lead.cnpj)} />
        <InfoRow label="Nome fantasia">{source?.nomeFantasia || "—"}</InfoRow>
        <InfoRow label="Situação">
          {(source?.situacao || lead.companySituation)
            ? <span className={`tag${String(source?.situacao || lead.companySituation).toLowerCase().includes("ativa") ? " teal" : " warn"}`}>{humanize(source?.situacao || lead.companySituation)}</span>
            : "—"}
        </InfoRow>
        <InfoRow label="CNAE">{source?.cnae ? `${formatBrCnae(source.cnae)}${source.cnaeDescription ? ` — ${source.cnaeDescription}` : ""}` : (formatBrCnae(lead.cnae) || "—")}</InfoRow>
        <InfoRow label="Natureza">{source?.naturezaJuridica || "—"}</InfoRow>
        <InfoRow label="Porte">{source?.porte || "—"}</InfoRow>
        <InfoRow label="Capital social">{source?.capitalSocial != null ? fmtMoney(source.capitalSocial) : "—"}</InfoRow>
        <InfoRow label="Abertura">{source?.openedAt ? `${fmtDate(source.openedAt)}${age != null ? ` · ${age} ano${age === 1 ? "" : "s"}` : ""}` : "—"}</InfoRow>
        <InfoRow label="Simples Nacional">{source?.simples == null ? "—" : source.simples ? "Sim" : "Não"}</InfoRow>
        <InfoRow label="MEI">{source?.mei == null ? "—" : source.mei ? "Sim" : "Não"}</InfoRow>
        <InfoRow label="Unidade">{source?.matrizFilial ? humanize(source.matrizFilial) : "—"}</InfoRow>
      </>
    );
  }

  function renderCadastro() {
    return (
      <div className="lead-cockpit__approved-grid lead-cockpit__approved-grid--registration">
        <div className="lead-cockpit__registration-left">
          <section className="lead-cockpit__compact-card">
            <CardTitle icon={ICONS.phone} title="Contatos" />
            {phones.length ? phones.slice(0, 2).map((phone, index) => (
              <CopyRow
                key={phone}
                label={index === 0 ? "Telefone" : `Telefone ${index + 1}`}
                value={formatPhoneDisplay(phone)}
                badge={whatsappMap[onlyDigits(phone)] === true ? <span className="tag teal">WhatsApp ✓</span> : undefined}
              />
            )) : <InfoRow label="Telefone">—</InfoRow>}
            {emails.length ? emails.slice(0, 2).map((email, index) => (
              <CopyRow key={email} label={index === 0 ? "E-mail" : `E-mail ${index + 1}`} value={email} mono={false} />
            )) : <InfoRow label="E-mail">—</InfoRow>}
            <InfoRow label="Cidade/UF">{cityState}</InfoRow>
            <InfoRow label="Site">{lead.website || "Não encontrado"}</InfoRow>
          </section>

          <section className="lead-cockpit__compact-card">
            <CardTitle icon={ICONS.users} title="Pessoa-chave" />
            <div className="lead-cockpit__person">
              <Av name={keyPersonName} size={30} />
              <span><strong>{keyPersonName}</strong><small>{humanize(keyPersonRole)}</small></span>
            </div>
            <InfoRow label="Telefone" mono>{lead.ownerPhone ? formatPhoneDisplay(lead.ownerPhone) : (lead.phone ? formatPhoneDisplay(lead.phone) : "—")}</InfoRow>
            <InfoRow label="Instagram">{lead.ownerInstagram || "Não localizado"}</InfoRow>
            <InfoRow label="Facebook">{lead.ownerFacebook || "Não localizado"}</InfoRow>
          </section>

          <section className="lead-cockpit__compact-card lead-cockpit__origin-card">
            <CardTitle icon={ICONS.scrape} title="Origem" action={<span className="tag">Radar</span>} />
            <div className="lead-cockpit__chips">
              {lead.phone && <span className="tag teal">Telefone confirmado</span>}
              {lead.email && <span className="tag teal">E-mail confirmado</span>}
              {!lead.website && <span className="tag">Sem site</span>}
              {lead.timesSeen != null && lead.timesSeen > 1 && <span className="tag">Visto {lead.timesSeen}×</span>}
            </div>
          </section>
        </div>

        <section className="lead-cockpit__compact-card lead-cockpit__company-card">
          <CardTitle icon={ICONS.empresas} title="Empresa" action={<span className="tag">Receita Federal</span>} />
          <div className="lead-cockpit__company-kv">{renderCompanyRows()}</div>
          <div className="lead-cockpit__company-partners">
            <CardTitle icon={ICONS.users} title="Quadro societário" action={<span className="tag">{company?.partners?.length || 0} pessoa(s)</span>} />
            {company?.partners?.length ? company.partners.slice(0, 3).map((partner, index) => (
              <div className="lead-cockpit__person" key={`${partner.name || "partner"}-${index}`}>
                <Av name={partner.name || "—"} size={28} />
                <span><strong>{partner.name || "—"}</strong><small>{partner.qualification ? humanize(partner.qualification) : "Sócio"}</small></span>
              </div>
            )) : <span className="muted-note">Sem quadro societário disponível.</span>}
          </div>
        </section>

        <div className="lead-cockpit__registration-right">
          <section className="lead-cockpit__compact-card lead-cockpit__quality-card">
            <CardTitle icon={ICONS.check} title="Qualidade" action={<span className="tag">{registrationQuality}% completo</span>} />
            <div className="lead-cockpit__quality-main">
              <AnimatedScore score={registrationQuality} suffix="%" />
              <span><strong>Cadastro utilizável</strong><small>Contato, Receita e pessoa-chave organizados para o primeiro contato.</small></span>
            </div>
          </section>

          <section className="lead-cockpit__compact-card lead-cockpit__history-card">
            <CardTitle icon={ICONS.relat} title="Responsável e histórico" />
            <div className="lead-cockpit__person">
              <Av name={lead.owner?.name || "Sem responsável"} size={28} />
              <span><strong>{lead.owner?.name || "Sem responsável"}</strong><small>Responsável pelo lead</small></span>
            </div>
            <div className="lead-cockpit__compact-timeline">
              {history.length ? history.map((event) => (
                <span key={event.id}>
                  <i aria-hidden="true" />
                  <strong>{event.title || "Atualização"}</strong>
                  <small>{clientTimelineDescription(event.description) || event.resultLabel || fmtDateTime(event.createdAt)}</small>
                </span>
              )) : <span className="muted-note">Sem histórico ainda.</span>}
            </div>
          </section>
        </div>
      </div>
    );
  }

  function renderFinanceiro() {
    return (
      <div className="lead-cockpit__approved-grid lead-cockpit__approved-grid--finance">
        <div className="lead-cockpit__finance-left">
          <section className="lead-cockpit__compact-card lead-cockpit__commercial-summary">
            <CardTitle icon={ICONS.money} title="Resumo comercial" action={<span className={`tag${lead.saleStatus === "sale_confirmed" ? " teal" : " warn"}`}>{lead.saleStatusLabel || "Sem venda"}</span>} />
            <strong className="lead-cockpit__money">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "R$ 0"}</strong>
            <small>Valor fechado neste card</small>
            <div className="lead-cockpit__metrics">
              <span><small>Produto</small><strong>{lead.product?.name || "Não definido"}</strong></span>
              <span><small>Etapa</small><strong>{lead.statusLabel || "Prospecção"}</strong></span>
              <span><small>Comissão</small><strong>{lead.commissionAmount != null ? fmtMoney(lead.commissionAmount) : "—"}</strong></span>
              <span><small>Recorrência</small><strong>{lead.commissionRecurring == null ? "—" : lead.commissionRecurring ? "Sim" : "Não"}</strong></span>
            </div>
          </section>

          <section className="lead-cockpit__compact-card lead-cockpit__proposal-card">
            <CardTitle icon={ICONS.doc} title="Proposta" />
            <InfoRow label="Produto sugerido">{lead.product?.name || "HBX Atendimento + Vendas"}</InfoRow>
            <InfoRow label="Implantação">{lead.setupValue != null ? fmtMoney(lead.setupValue) : "Não definida"}</InfoRow>
            <InfoRow label="Mensalidade">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "Não definida"}</InfoRow>
            <InfoRow label="Responsável">{lead.owner?.name || "—"}</InfoRow>
          </section>
        </div>

        <section className="lead-cockpit__compact-card lead-cockpit__statement-card">
          <CardTitle icon={ICONS.relat} title="Extrato do cliente" action={<span className="tag">{extrato?.charges.length || 0} títulos</span>} />
          {financeMessage && <span className={`ctx-msg ${financeMessage.startsWith("✓") ? "ok" : "err"}`}>{financeMessage}</span>}
          {!customerProfileId ? (
            <div className="lead-cockpit__finance-empty">
              <span className="lead-cockpit__coin">$</span>
              <strong>Ainda não há movimentação financeira</strong>
              <small>O extrato nasce quando a venda é confirmada e o primeiro título é gerado.</small>
              {(lead.saleValue ?? 0) > 0 && (
                <button type="button" className="btn-teal btn-xs" onClick={createCharge} disabled={financeBusy != null}>
                  {financeBusy === "create" ? "Gerando…" : "Gerar cobrança"}
                </button>
              )}
            </div>
          ) : extratoError ? (
            <div className="lead-cockpit__empty-state">Não foi possível carregar o extrato.</div>
          ) : extrato == null ? (
            <div className="lead-cockpit__empty-state">Carregando extrato…</div>
          ) : extrato.charges.length === 0 ? (
            <div className="lead-cockpit__finance-empty"><strong>Nenhum título ainda</strong><small>O cliente já existe no financeiro, mas não possui cobranças.</small></div>
          ) : (
            <div className="lead-cockpit__charges">
              <div className="lead-cockpit__balance"><span>Saldo em aberto</span><strong>{fmtMoney(extrato.saldoAberto)}</strong></div>
              {extrato.charges.slice(0, 6).map((charge) => (
                <div className="lead-cockpit__charge-row" key={charge.id}>
                  <span><strong>{charge.description || "Título"}</strong><small>{sourceModuleLabel(charge.sourceModule)} · {fmtDate(charge.dueDate)}</small></span>
                  <span className={chargeTagClass(charge.status)}>{chargeStatusLabel(charge.status)}</span>
                  <strong className="hbx-mono">{fmtMoney(charge.amount)}</strong>
                  {String(charge.status || "").toLowerCase() === "pending" && (
                    <button type="button" className="lead-cockpit__micro-button" onClick={() => markPaid(charge.id)} disabled={financeBusy != null}>
                      {financeBusy === charge.id ? "Baixando…" : "Marcar pago"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="lead-cockpit__finance-right">
          <section className="lead-cockpit__compact-card">
            <CardTitle icon={ICONS.check} title="Próximos passos" />
            <div className="lead-cockpit__steps">
              <span><i>1</i><b>Qualificar interesse</b><small>Registrar resposta e dor real.</small></span>
              <span><i>2</i><b>Definir produto e valor</b><small>Plano, implantação e condição comercial.</small></span>
              <span><i>3</i><b>Confirmar a venda</b><small>Gerar cobrança e vincular o cliente.</small></span>
            </div>
          </section>

          <section className="lead-cockpit__compact-card">
            <CardTitle icon={ICONS.money} title="Comissão" action={<span className="tag">{lead.commissionStatusLabel || "Pendente"}</span>} />
            <InfoRow label="Valor">{lead.commissionAmount != null ? fmtMoney(lead.commissionAmount) : "—"}</InfoRow>
            <InfoRow label="Vencimento">{lead.commissionDueAt ? fmtDate(lead.commissionDueAt) : "—"}</InfoRow>
            <InfoRow label="Recorrente">{lead.commissionRecurring == null ? "—" : lead.commissionRecurring ? "Sim" : "Não"}</InfoRow>
            <InfoRow label="Implantação">{lead.setupCommissionAmount != null ? fmtMoney(lead.setupCommissionAmount) : "—"}</InfoRow>
          </section>
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <>
      <div className="hbx-veil lead-cockpit__veil" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section className="hbx-modal lead-cockpit lead-cockpit--approved" role="dialog" aria-modal="true" aria-label={`Detalhes do lead ${lead.name || ""}`}>
          {/* Topo em três zonas de largura simétrica: identidade à esquerda,
              fileira de canais no CENTRO da ficha, ações à direita. As zonas
              laterais são 1fr cada, então o centro é o centro de verdade —
              não desloca quando o nome do lead é longo ou curto. */}
          <header className="lead-cockpit__approved-head">
            <div className="lead-cockpit__approved-identity">
              <Av name={lead.name || "—"} size={44} />
              <div className="lead-cockpit__approved-id">
                <span className="lead-cockpit__approved-title-row">
                  <h2>{lead.name || "—"}</h2>
                  <span className="lead-cockpit__approved-badges">
                    <RadarAiBadge status={aiStatus} />
                  </span>
                </span>
                <p title={[lead.razaoSocial, lead.segment, cityState].filter(Boolean).join(" • ")}>
                  {[lead.razaoSocial, lead.segment, cityState].filter(Boolean).join(" • ") || "—"}
                </p>
              </div>
            </div>
            {availableChannels.length > 0 && (
              <span className="lead-cockpit__approved-channels" aria-label="Canais do lead">
                {availableChannels.map((canal) => {
                  if (canal === "whatsapp" || canal === "email") {
                    return (
                      <button key={canal} type="button" title={CANAL_LABEL[canal]} aria-label={`Abrir ${CANAL_LABEL[canal]}`}
                        onClick={() => { setTab("atendimento"); setChannel(canal); }}>
                        <CanalIcon canal={canal} size="xl" />
                      </button>
                    );
                  }
                  const href = channelTargets[canal]!;
                  const external = canal === "instagram" || canal === "facebook" || canal === "site";
                  return (
                    <a key={canal} href={href} title={CANAL_LABEL[canal]} aria-label={`Abrir ${CANAL_LABEL[canal]}`}
                      target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                      <CanalIcon canal={canal} size="xl" />
                    </a>
                  );
                })}
              </span>
            )}
            <div className="lead-cockpit__approved-actions">
              {cnpj && <button type="button" className="btn-ghost btn-xs" onClick={copyCnpj}><I d={cnpjCopied ? ICONS.check : ICONS.doc} size={12} /> <span>{cnpjCopied ? "Copiado" : "Copiar CNPJ"}</span></button>}
              {conciergeVisible && <button type="button" className="btn-ghost btn-xs" onClick={searchSimilar}><I d={ICONS.concierge} size={12} /> <span>Buscar parecidos</span></button>}
              <button type="button" className="lead-cockpit__approved-close" onClick={onClose} aria-label="Fechar">×</button>
            </div>
          </header>

          <nav className="glass-pill-track lead-cockpit__approved-tabs" role="tablist" aria-label="Guias dos detalhes">
            <GlassPill {...tabPill} />
            {guides.map((guide) => (
              <button
                key={guide.key}
                type="button"
                ref={tabPill.itemRef(guide.key)}
                role="tab"
                aria-selected={tab === guide.key}
                className={`glass-pill-item lead-cockpit__approved-tab${tab === guide.key ? " is-active" : ""}`}
                onClick={() => setTab(guide.key)}
              >
                <I d={guide.icon} size={13} /> {guide.label}
              </button>
            ))}
          </nav>

          <div className="lead-cockpit__approved-body">
            <div className={`lead-cockpit__approved-panel${tab === "atendimento" ? " is-active" : ""}`} aria-hidden={tab !== "atendimento"}>
              {tab === "atendimento" && renderAtendimento()}
            </div>
            <div className={`lead-cockpit__approved-panel${tab === "cadastro" ? " is-active" : ""}`} aria-hidden={tab !== "cadastro"}>
              {tab === "cadastro" && renderCadastro()}
            </div>
            {canViewValues && (
              <div className={`lead-cockpit__approved-panel${tab === "financeiro" ? " is-active" : ""}`} aria-hidden={tab !== "financeiro"}>
                {tab === "financeiro" && renderFinanceiro()}
              </div>
            )}
          </div>
        </section>
      </div>

      {agendaOpen && (
        <div className="lead-cockpit__agenda-popover" role="dialog" aria-modal="true" aria-label="Agenda do lead">
          <div className="lead-cockpit__agenda-popover-head">
            <strong>Agenda · {lead.name}</strong>
            <button type="button" onClick={() => setAgendaOpen(false)} aria-label="Fechar agenda">×</button>
          </div>
          <div className="lead-cockpit__agenda-popover-body">
            <AgendaLeadPanel key={lead.id} leadId={lead.id} />
          </div>
        </div>
      )}

      {waConnectOpen && (
        <WhatsAppConnectModal
          open={waConnectOpen}
          onClose={() => setWaConnectOpen(false)}
          onConnected={() => { setWaOk(true); setWaConnectOpen(false); }}
          onDisconnected={() => setWaOk(false)}
        />
      )}

      {fecharOpen && (
        <FecharVendaModal
          mode={{ kind: "lead", leadId: lead.id }}
          leadName={lead.name}
          phone={lead.phone}
          onClose={() => setFecharOpen(false)}
          onDone={() => { setFecharOpen(false); onConversationChanged?.(); }}
        />
      )}

      {/* Overlay flutuante — Reagendar / Sem interesse abrem POR CIMA (fora do
          card que corta), com fundo pra fechar. Assim dá pra rolar e clicar. */}
      {(reagendarOpen || semInteresseOpen) && (
        <div
          className="hbx-veil"
          style={{ zIndex: 80 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setReagendarOpen(false); setSemInteresseOpen(false); } }}
        >
          <div className="hbx-pop" style={{ width: "min(340px, 92vw)", maxHeight: "80vh", overflowY: "auto", padding: 14, display: "grid", gap: 10 }}>
            {reagendarOpen && (
              <>
                <strong style={{ fontSize: "0.85rem" }}>Reagendar contato · {lead.name}</strong>
                <input className="field-dark" type="date" value={reagendarData} onChange={(e) => setReagendarData(e.target.value)} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn-ghost" onClick={() => setReagendarOpen(false)}>Cancelar</button>
                  <button className="btn-teal" disabled={!reagendarData || acaoBusy} onClick={reagendarContato}>
                    {acaoBusy ? "Salvando…" : "Confirmar"}
                  </button>
                </div>
              </>
            )}
            {semInteresseOpen && (
              <>
                <strong style={{ fontSize: "0.85rem" }}>Sem interesse · {lead.name}</strong>
                <div style={{ display: "grid", gap: 2 }}>
                  {[
                    { key: "sem_interesse", label: "Sem interesse geral" },
                    { key: "ja_tem", label: "Já tem solução" },
                    { key: "preco", label: "Preço alto demais" },
                    { key: "sem_perfil", label: "Fora do perfil" },
                    { key: "nao_ligar", label: "Não ligar mais" },
                  ].map(({ key, label }) => (
                    <button key={key} className="nav-item" style={{ minHeight: 34, textAlign: "left" }} disabled={acaoBusy} onClick={() => marcarSemInteresse(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn-ghost" onClick={() => setSemInteresseOpen(false)}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
