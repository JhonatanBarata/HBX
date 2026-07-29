"use client";

// ============================================================
// CENTRAL DO LEAD — o Detalhes do /vendas.
//
// Escrita do ZERO em 28/07/2026 a partir de "Central do Lead — desenho
// aplicável". O Detalhes anterior (lead-cockpit-modal.tsx, 1.521 linhas +
// lead-cockpit-history.tsx, 910 + vendas-details2.css, 3.109) foi DELETADO
// por `git rm` — ordem do dono: "remova todos legados, e faça outro premium
// novamente. não quero reaproveitado nada". Não há aqui um nome de classe,
// uma medida ou uma estrutura daquele conjunto.
//
// O QUE O DESENHO RESOLVE (as 9 queixas da legenda da referência):
//  1 · funil = UMA peça em setas, não 5 botões com número dentro de aro;
//  2 · Score/Prontidão/Último contato = UMA régua no topo escuro;
//  3 · abas legíveis (13,5/650) com régua de 3px na ativa;
//  4 · ícone de canal 24px em caixa de 40 (60% — regra ótica);
//  5 · régua tipográfica única, e o CNPJ existe num LUGAR SÓ;
//  6 · Copiloto é uma linha viva, não um bloco;
//  7 · robô = cartão branco com listra e LED âmbar + grade de 3 campos;
//  8 · composer com altura reservada (o feed não pula ao trocar de modo);
//  9 · "Fechar venda" é o único botão verde-dinheiro, grande, no canto.
//
// O BACKEND NÃO MUDOU: mesmas rotas, mesmos verbos, mesmas permissões.
// O que mudou é a forma — e é só isso que estava sendo pedido.
// ============================================================

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import type { VendasLead } from "@/app/(app)/vendas/page.client";
import { AgendaLeadPanel } from "@/components/hbx/detalhes-negocio";
import {
  CentralDoLeadConversa,
  type CdlComposerCommand,
  type CdlComposerMode,
} from "@/components/hbx/central-do-lead-conversa";
import { CANAL_LABEL, CanalIcon } from "@/components/hbx/canal-icon";
import { CdlIcon } from "@/components/hbx/central-do-lead-icons";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { isModuleVisible, useCurrentUser, useEntitlements, useMyModules } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { formatBrPhone, onlyDigits } from "@/lib/br-phone";
import { formatBrCnae, formatBrCnpj } from "@/lib/br-document";
import type { RadarChannel } from "@/lib/radar-channel-presence";
import { vendasCanais } from "@/lib/vendas-channels";

type Etapa = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";

// Nomes das etapas — ordem do dono 27/07, ao pé da letra.
const ETAPAS: Array<{ key: Etapa; label: string }> = [
  { key: "novo", label: "Planejar" },
  { key: "contato", label: "Automação" },
  { key: "retorno", label: "Retorno" },
  { key: "qualificado", label: "Negociação" },
  { key: "encerrado", label: "Fechado" },
];

const MOTIVOS_ENCERRAMENTO = [
  { key: "convertido", label: "Convertido" },
  { key: "sem_interesse", label: "Sem interesse" },
  { key: "nao_atendeu", label: "Não atendeu" },
  { key: "contato_invalido", label: "Contato inválido" },
  { key: "outro", label: "Outro motivo" },
];

const MOTIVOS_DESINTERESSE = [
  { key: "sem_interesse", label: "Sem interesse geral" },
  { key: "ja_tem", label: "Já tem solução" },
  { key: "preco", label: "Preço alto demais" },
  { key: "sem_perfil", label: "Fora do perfil" },
  { key: "nao_ligar", label: "Não ligar mais" },
];

// Código interno NUNCA aparece na tela.
const MOTIVOS_RADAR: Record<string, string> = {
  cnae_compativel: "CNAE compatível com o segmento",
  nome_combina_segmento: "Nome combina com o segmento pedido",
  sem_segmento_pedido: "Sem segmento pedido (não filtrado)",
  cidade_uf_ok: "Cidade e UF batem com o pedido",
  telefone_presente: "Telefone presente",
  whatsapp_confirmado: "WhatsApp confirmado",
  website_proprio: "Site próprio",
  multiplas_fontes: "Confirmado por mais de uma fonte",
};

const CONFLITOS: Record<string, string> = {
  fora_da_janela: "Fora do horário de disparo",
  slot_ocupado: "Horário ocupado",
  sem_config: "Sem configuração de disparo",
};

type PreVooPasso = { dia: number; canal: string; titulo: string | null };
type PreVooPersona = { key: string; nome: string; descricao: string; recomendado: boolean; passos: PreVooPasso[] };

type PreVoo = {
  ok: boolean;
  locked: boolean;
  prontidao?: { confirmados: string[]; duvidosos: string[]; faltantes: string[] };
  personas?: PreVooPersona[];
  enrichment?: { enabled: boolean; podeBuscar: boolean };
  robo?: { ligado: boolean; status: string | null; currentStep: number };
  roboBloqueado?: {
    motivo: string;
    acao: string;
    codigo: "config_ausente" | "whatsapp_desconectado" | "lead_sem_canal";
  } | null;
} | null;

type Empresa = {
  found?: boolean;
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

type Cobranca = {
  id: string;
  amount: number;
  description?: string | null;
  status?: string | null;
  dueDate?: string | null;
};
type Extrato = { saldoAberto: number; charges: Cobranca[] } | null;
type ProximoSlot = { slot: string; conflito: boolean; motivoConflito: string | null } | null;

// ---- Texto ---------------------------------------------------------------
function humanizar(raw: string | null | undefined): string {
  const texto = String(raw || "").replace(/[_-]+/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase() : "";
}
function dinheiro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBr(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}
function dataHoraBr(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
/** "2h atrás" — a forma do desenho. Sem lib, sem fuso: só diferença. */
function tempoAtras(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutos = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos}min atrás`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas}h atrás`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `${dias}d atrás`;
  return dataBr(value);
}
function anosDesde(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const anos = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return anos >= 0 ? anos : null;
}
function iniciais(name: string | null | undefined): string {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function linkExterno(value: string | null | undefined): string | null {
  const link = String(value || "").trim();
  if (!link) return null;
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}
function linkRede(value: string | null | undefined, rede: "instagram" | "facebook"): string | null {
  const link = String(value || "").trim();
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  return `https://${rede}.com/${link.replace(/^@/, "")}`;
}
function etapaValida(value: string | null | undefined): Etapa {
  return value === "contato" || value === "retorno" || value === "qualificado" || value === "encerrado"
    ? value
    : "novo";
}
function rotuloConflito(value: string): string {
  const t = value.trim();
  if (!t) return "";
  return t.includes(" ") ? t : CONFLITOS[t] || humanizar(t);
}
function statusCobranca(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  if (key === "pending") return "Em aberto";
  if (key === "paid") return "Pago";
  if (key === "canceled" || key === "cancelled") return "Cancelado";
  if (key === "failed") return "Falhou";
  return status ? humanizar(status) : "—";
}

// ---- Peças do desenho ----------------------------------------------------

/** Linha chave-valor: a régua tipográfica única do dossiê. */
function Linha({ k, children, mono = false, off = false, acoes }: {
  k: string;
  children: React.ReactNode;
  mono?: boolean;
  off?: boolean;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="cdl-kv">
      <small>{k}</small>
      <span className={`cdl-kv__val${mono ? " is-mono" : ""}${off ? " is-off" : ""}`}>
        {children}
        {acoes && <span className="cdl-kv__act">{acoes}</span>}
      </span>
    </div>
  );
}

function BotaoCopiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title={copiado ? "Copiado" : rotulo}
      aria-label={rotulo}
      onClick={() => {
        navigator.clipboard?.writeText(valor).then(
          () => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1_400); },
          () => undefined,
        );
      }}
    >
      <CdlIcon name={copiado ? "check" : "copy"} />
    </button>
  );
}

/** Anel do score: número no meio, arco na temperatura do lead. */
function Anel({ valor, tom }: { valor: number; tom: string }) {
  const raio = 21;
  const volta = 2 * Math.PI * raio;
  const preenchido = volta * (1 - Math.max(0, Math.min(100, valor)) / 100);
  return (
    <svg className="cdl-ring" viewBox="0 0 52 52" aria-hidden="true">
      <circle className="cdl-ring__track" cx="26" cy="26" r={raio} fill="none" strokeWidth="5" />
      <circle
        className={`cdl-ring__value is-${tom}`}
        cx="26"
        cy="26"
        r={raio}
        fill="none"
        strokeWidth="5"
        strokeDasharray={volta.toFixed(1)}
        strokeDashoffset={preenchido.toFixed(1)}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="31" textAnchor="middle">{Math.round(valor)}</text>
    </svg>
  );
}

export function CentralDoLead({ lead, canViewValues, open, onClose, onConversationChanged }: {
  lead: VendasLead;
  canViewValues: boolean;
  open: boolean;
  onClose: () => void;
  onConversationChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const entitlements = useEntitlements();
  const currentUser = useCurrentUser();
  const modules = useMyModules();
  const conciergeVisivel = isModuleVisible("concierge", entitlements, currentUser, modules);

  const [etapa, setEtapa] = useState<Etapa>(() => etapaValida(lead.status));
  const [etapaBusy, setEtapaBusy] = useState(false);

  const [empresa, setEmpresa] = useState<Empresa>(null);
  const [empresaCarregando, setEmpresaCarregando] = useState(true);
  const [preVoo, setPreVoo] = useState<PreVoo>(null);
  const [preVooCarregando, setPreVooCarregando] = useState(true);
  const [personaKey, setPersonaKey] = useState<string | null>(null);
  const [enriquecerBusy, setEnriquecerBusy] = useState(false);
  const [roboBusy, setRoboBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [waOk, setWaOk] = useState<boolean | null>(null);
  const [waConnectOpen, setWaConnectOpen] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [copilotoEnabled, setCopilotoEnabled] = useState(false);
  const [motivosRadar, setMotivosRadar] = useState<string[]>([]);
  const [proximoSlot, setProximoSlot] = useState<ProximoSlot>(null);

  const [customerProfileId, setCustomerProfileId] = useState<string | null>(lead.customerProfileId || null);
  const [extrato, setExtrato] = useState<Extrato>(null);
  const [extratoErro, setExtratoErro] = useState(false);
  const [financeBusy, setFinanceBusy] = useState<string | null>(null);

  // Config de disparo INLINE: o bloqueio "config_ausente" se resolve DENTRO
  // da ficha — nunca mandar o dono pra outra tela pra destravar Automação.
  const [configIni, setConfigIni] = useState("08:00");
  const [configFim, setConfigFim] = useState("18:00");
  const [configTeto, setConfigTeto] = useState("40");
  const [configBusy, setConfigBusy] = useState(false);

  const [comando, setComando] = useState<CdlComposerCommand>({ mode: "whatsapp", seq: 0 });
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [agoraOpen, setAgoraOpen] = useState(false);
  const [acaoDraft, setAcaoDraft] = useState(lead.nextAction || "");
  const [quandoDraft, setQuandoDraft] = useState("");
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [semInteresseOpen, setSemInteresseOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [fecharVendaOpen, setFecharVendaOpen] = useState(false);

  const carregarPreVoo = useCallback(async () => {
    const res = await apiFetch<PreVoo>(`/vendas/lead/${encodeURIComponent(lead.id)}/pre-voo`);
    setPreVoo(res ?? null);
    setPersonaKey((atual) => atual
      || res?.personas?.find((p) => p.recomendado)?.key
      || res?.personas?.[0]?.key
      || null);
    setPreVooCarregando(false);
    return res;
  }, [lead.id]);

  const carregarExtrato = useCallback(async (id: string) => {
    try {
      const res = await apiFetch<Extrato>(`/financeiro-tenant/clientes/${encodeURIComponent(id)}/extrato`);
      setExtrato(res ?? null);
      setExtratoErro(res == null);
    } catch {
      setExtrato(null);
      setExtratoErro(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let vivo = true;

    apiFetch<{ company?: Empresa }>(`/vendas/lead/${encodeURIComponent(lead.id)}/cockpit`)
      .then((res) => { if (vivo) { setEmpresa(res?.company ?? null); setEmpresaCarregando(false); } })
      .catch(() => { if (vivo) { setEmpresa(null); setEmpresaCarregando(false); } });

    void (async () => {
      try { await carregarPreVoo(); }
      catch { if (vivo) { setPreVoo(null); setPreVooCarregando(false); } }
    })();

    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then((res) => { if (vivo) setWaOk(res?.whatsappSession?.accessible === true); })
      .catch(() => { if (vivo) setWaOk(false); });

    apiFetch<{ ready?: boolean }>("/company-email/status")
      .then((res) => { if (vivo) setEmailReady(res?.ready === true); })
      .catch(() => { if (vivo) setEmailReady(false); });

    apiFetch<{ enabled?: boolean }>("/assistente/copiloto")
      .then((res) => { if (vivo) setCopilotoEnabled(res?.enabled === true); })
      .catch(() => { if (vivo) setCopilotoEnabled(false); });

    apiFetch<Exclude<ProximoSlot, null>>("/vendas/agenda-disparo/proximo-slot")
      .then((res) => { if (vivo) setProximoSlot(res ?? null); })
      .catch(() => { if (vivo) setProximoSlot(null); });

    if (lead.radarLeadId) {
      apiFetch<{ item?: { inclusionReasons?: string[] | null } }>(
        `/webscraping/radar/leads/${encodeURIComponent(lead.radarLeadId)}`,
      )
        .then((res) => {
          if (vivo) setMotivosRadar(Array.isArray(res?.item?.inclusionReasons)
            ? res.item.inclusionReasons.filter(Boolean)
            : []);
        })
        .catch(() => { if (vivo) setMotivosRadar([]); });
    }

    return () => { vivo = false; };
  }, [carregarPreVoo, lead.id, lead.radarLeadId, open]);

  useEffect(() => {
    if (!open || !canViewValues || !customerProfileId) return;
    void (async () => { await carregarExtrato(customerProfileId); })();
  }, [canViewValues, customerProfileId, carregarExtrato, open]);

  useEffect(() => {
    if (!open) return;
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (agendaOpen) setAgendaOpen(false);
      else if (encerrarOpen) setEncerrarOpen(false);
      else if (agoraOpen) setAgoraOpen(false);
      else if (semInteresseOpen) setSemInteresseOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [agendaOpen, agoraOpen, encerrarOpen, onClose, open, semInteresseOpen]);

  useEffect(() => {
    queueMicrotask(() => {
      setEtapa(etapaValida(lead.status));
      setAcaoDraft(lead.nextAction || "");
    });
  }, [lead.nextAction, lead.status]);

  function focarComposer(mode: CdlComposerMode, draft?: string) {
    setComando((atual) => ({ mode, draft, seq: atual.seq + 1 }));
  }

  // ---- Ações -------------------------------------------------------------
  async function trocarEtapa(proxima: Etapa, motivo?: string) {
    if (!lead.id || etapaBusy) return;
    if (proxima === "encerrado" && !motivo) { setEncerrarOpen(true); return; }
    if (proxima === etapa && proxima !== "encerrado") return;
    const anterior = etapa;
    setEtapa(proxima);
    setEtapaBusy(true);
    setAviso(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: proxima, ...(motivo ? { closureReason: motivo } : {}) }),
      });
      setEncerrarOpen(false);
      if (proxima === "qualificado" || proxima === "encerrado") await carregarPreVoo();
      await onConversationChanged?.();
    } catch (error) {
      setEtapa(anterior);
      setAviso(error instanceof Error ? error.message : "Não foi possível atualizar a etapa.");
    } finally {
      setEtapaBusy(false);
    }
  }

  async function salvarAgora() {
    if (!lead.id || acaoBusy) return;
    setAcaoBusy(true);
    setAviso(null);
    try {
      const corpo: Record<string, unknown> = {};
      if (acaoDraft.trim() !== (lead.nextAction || "").trim()) corpo.nextAction = acaoDraft.trim() || null;
      if (quandoDraft) corpo.returnAt = new Date(`${quandoDraft}T09:00:00`).toISOString();
      if (Object.keys(corpo).length) {
        await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
          method: "PATCH",
          body: JSON.stringify(corpo),
        });
        await onConversationChanged?.();
      }
      setQuandoDraft("");
      setAgoraOpen(false);
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function marcarSemInteresse(motivo: string) {
    if (!lead.id || acaoBusy) return;
    setAcaoBusy(true);
    setAviso(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/negativar`, {
        method: "POST",
        body: JSON.stringify({ status: motivo }),
      });
      setSemInteresseOpen(false);
      await onConversationChanged?.();
      onClose();
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível finalizar o lead.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function salvarConfigDisparo() {
    if (configBusy) return;
    setConfigBusy(true);
    setAviso(null);
    try {
      await apiFetch("/vendas/agenda-disparo/config", {
        method: "PATCH",
        body: JSON.stringify({
          workingHoursStart: configIni,
          workingHoursEnd: configFim,
          dailyLimitPerSender: Math.max(1, Math.min(200, Number(configTeto) || 40)),
        }),
      });
      await carregarPreVoo();
      setAviso("✓ Configuração salva pra empresa toda.");
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
    } finally {
      setConfigBusy(false);
    }
  }

  async function ligarRobo() {
    if (!lead.id || roboBusy || !personaKey) return;
    setRoboBusy(true);
    setAviso(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/robo`, {
        method: "POST",
        body: JSON.stringify({ personaKey }),
      });
      await carregarPreVoo();
      setEtapa("contato");
      await onConversationChanged?.();
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível ligar a Automação agora.");
    } finally {
      setRoboBusy(false);
    }
  }

  async function desligarRobo() {
    if (!lead.id || roboBusy) return;
    setRoboBusy(true);
    setAviso(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/robo`, { method: "DELETE" });
      await carregarPreVoo();
      await onConversationChanged?.();
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível desligar a Automação agora.");
    } finally {
      setRoboBusy(false);
    }
  }

  async function buscarMaisDados() {
    if (!lead.id || enriquecerBusy) return;
    setEnriquecerBusy(true);
    setAviso(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/enrichment`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await carregarPreVoo();
      setAviso("✓ Dados atualizados.");
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível buscar mais dados agora.");
    } finally {
      setEnriquecerBusy(false);
    }
  }

  async function gerarCobranca() {
    if (financeBusy) return;
    setFinanceBusy("create");
    setAviso(null);
    try {
      const res = await apiFetch<{ customerProfileId?: string; alreadyExists?: boolean }>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/gerar-cobranca`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setAviso(res?.alreadyExists ? "✓ Cobrança já existia — extrato atualizado." : "✓ Cobrança gerada.");
      if (res?.customerProfileId) setCustomerProfileId(res.customerProfileId);
      else if (customerProfileId) await carregarExtrato(customerProfileId);
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível gerar a cobrança.");
    } finally {
      setFinanceBusy(null);
    }
  }

  async function quitar(chargeId: string) {
    if (!customerProfileId || financeBusy) return;
    setFinanceBusy(chargeId);
    setAviso(null);
    try {
      await apiFetch(`/financeiro-tenant/charges/${encodeURIComponent(chargeId)}/quitar`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await carregarExtrato(customerProfileId);
      setAviso("✓ Título marcado como pago.");
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "Não foi possível dar baixa no título.");
    } finally {
      setFinanceBusy(null);
    }
  }

  function buscarParecidos() {
    try {
      sessionStorage.setItem("hbx:concierge-seed", JSON.stringify({
        targetSegment: lead.segment || "",
        city: lead.city || "",
        state: lead.state || "",
      }));
    } catch {
      // Sem storage a busca segue, só não vem pré-preenchida.
    }
    router.push("/concierge");
  }

  if (!open) return null;

  // ---- Dados derivados ---------------------------------------------------
  const fonte = empresa?.found ? empresa : null;
  const cnpj = fonte?.cnpj || lead.cnpj || null;
  const cnpjFmt = cnpj ? (formatBrCnpj(cnpj) || cnpj) : null;
  const situacao = fonte?.situacao || lead.companySituation || null;
  const rfbAtiva = situacao ? String(situacao).toLowerCase().includes("ativa") : null;
  const cidadeUf = lead.city ? `${lead.city}${lead.state ? `/${lead.state}` : ""}` : null;
  const idade = anosDesde(fonte?.openedAt);

  const score = Math.max(0, Math.min(100, Math.round(Number(lead.opportunityScore) || 0)));
  const tomScore = score >= 67 ? "hot" : score >= 34 ? "warm" : "cold";
  const palavraScore = lead.leadTemperature
    ? String(lead.leadTemperature).toLowerCase()
    : (score >= 67 ? "quente" : score >= 34 ? "morno" : "frio");

  const prontidao = preVoo?.prontidao;
  const totalDados = prontidao
    ? prontidao.confirmados.length + prontidao.duvidosos.length + prontidao.faltantes.length
    : 0;
  const confirmados = prontidao?.confirmados.length || 0;

  const ultimoContato = tempoAtras(lead.lastContactAt);

  const socio = fonte?.partners?.[0];
  const nomeChave = socio?.name || lead.ownerName || lead.ownerNames?.[0] || null;
  const cargoChave = socio?.qualification ? humanizar(socio.qualification) : (nomeChave ? "Pessoa-chave" : null);
  const telefoneDono = lead.ownerPhone || (nomeChave ? lead.phone : null);
  const mapaWhats = lead.phonesWhatsapp || {};

  const camposCadastro = [
    lead.phone, lead.email, cnpj, fonte?.razaoSocial || lead.razaoSocial,
    fonte?.cnae || lead.cnae, lead.city, lead.state, nomeChave, lead.address, lead.website,
  ];
  const cadastroPct = Math.round((camposCadastro.filter(Boolean).length / camposCadastro.length) * 100);

  const inteligencia = lead.leadIntelligence;
  const templateText = typeof inteligencia?.messageTemplate === "string" ? inteligencia.messageTemplate : "";
  const canalSugerido = String(inteligencia?.recommendedChannel || "").toLowerCase().includes("mail")
    ? "email"
    : "whatsapp";

  const robo = preVoo?.robo;
  const bloqueio = preVoo?.roboBloqueado;
  const personas = preVoo?.personas || [];
  const persona = personas.find((p) => p.key === personaKey) || personas.find((p) => p.recomendado) || personas[0] || null;
  const roboLigado = Boolean(robo?.ligado);

  const telefonePrincipal = lead.phone || lead.phones?.find(Boolean) || null;
  const emailPrincipal = lead.email || lead.emails?.find(Boolean) || null;
  const numeroWhatsApp = Object.entries(lead.phonesWhatsapp || {}).find(([, confirmado]) => confirmado)?.[0]
    || (lead.leadIntelligence?.whatsappStatus === "confirmed" ? telefonePrincipal : null);
  const digitosWhatsApp = onlyDigits(numeroWhatsApp || "");
  const waLink = digitosWhatsApp
    ? `https://wa.me/${digitosWhatsApp.length > 11 ? digitosWhatsApp : `55${digitosWhatsApp}`}`
    : null;
  const canais = vendasCanais(lead);
  const linksCanais: Partial<Record<RadarChannel, string | null>> = {
    whatsapp: waLink,
    telefone: telefonePrincipal ? `tel:${onlyDigits(telefonePrincipal)}` : null,
    email: emailPrincipal ? `mailto:${emailPrincipal}` : null,
    instagram: linkRede(lead.leadIntelligence?.instagramUrl || lead.ownerInstagram, "instagram"),
    facebook: linkRede(lead.leadIntelligence?.facebookUrl || lead.ownerFacebook, "facebook"),
    site: linkExterno(lead.website),
  };

  const indiceEtapa = ETAPAS.findIndex((item) => item.key === etapa);

  return (
    <>
      <div className="hbx-veil" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section className="cdl" role="dialog" aria-modal="true" aria-label={`Central do lead ${lead.name || ""}`}>

          {/* ══════════ TOPO ESCURO: comando ══════════ */}
          <header className="cdl-cockpit">
            <div className="cdl-cockpit__row">
              <span className="cdl-av">{iniciais(lead.name)}</span>

              <div className="cdl-id">
                <h1 title={lead.name || "—"}>{lead.name || "—"}</h1>
                <p>
                  {lead.segment && <b>{lead.segment}</b>}
                  {cidadeUf && <span>{lead.segment ? "· " : ""}{cidadeUf}</span>}
                  {situacao && (
                    <>
                      <span className={`cdl-dot${rfbAtiva ? "" : " is-warn"}`} />
                      {rfbAtiva ? "RFB ativa" : humanizar(situacao)}
                    </>
                  )}
                  {!lead.website && (<><span className="cdl-dot is-warn" />Sem site</>)}
                </p>
              </div>

              {/* Funil: UMA peça contínua em setas. A forma já diz a ordem, por
                  isso não há número dentro do passo. É o único grupo "com um
                  ativo" da tela que NÃO usa a pílula deslizante da Lei nº2: o
                  destaque aqui não é uma peça que viaja por cima — a seta atual
                  ACENDE e as passadas ficam tingidas, que é o desenho aprovado
                  (e o padrão de funil do mercado). Abas e modos, esses sim,
                  usam a pílula. */}
              <div className="cdl-funnel" aria-label="Etapa atual do lead">
                {ETAPAS.map((item, index) => (
                  <span
                    key={item.key}
                    aria-current={etapa === item.key ? "step" : undefined}
                    className={`cdl-step${etapa === item.key ? " is-current" : index < indiceEtapa ? " is-done" : ""}`}
                    title={item.label}
                  >
                    <span className="cdl-step__dot" />
                    <span className="cdl-step__label">{item.label}</span>
                  </span>
                ))}
              </div>

              <span className="cdl-channels">
                {canais.map((canal) => {
                  const href = linksCanais[canal];
                  const externo = canal === "whatsapp" || canal === "instagram" || canal === "facebook" || canal === "site";
                  const conteudo = <CanalIcon canal={canal} size="lg" />;
                  return href ? (
                    <a
                      key={canal}
                      className="cdl-chan"
                      href={href}
                      target={externo ? "_blank" : undefined}
                      rel={externo ? "noopener noreferrer" : undefined}
                      title={CANAL_LABEL[canal]}
                      aria-label={`Abrir ${CANAL_LABEL[canal]}`}
                    >
                      {conteudo}
                    </a>
                  ) : (
                    <span key={canal} className="cdl-chan is-static" title={CANAL_LABEL[canal]}>
                      {conteudo}
                    </span>
                  );
                })}
              </span>

              <div className="cdl-cockpit__actions">
                {canViewValues && (
                  <button type="button" className="cdl-close-sale" onClick={() => setFecharVendaOpen(true)}>
                    <CdlIcon name="money" />Fechar venda
                  </button>
                )}
                {conciergeVisivel && (
                  <button type="button" className="cdl-ghost" title="Buscar parecidos" onClick={buscarParecidos}>
                    <CdlIcon name="search" />
                  </button>
                )}
                <button type="button" className="cdl-ghost" title="Fechar" aria-label="Fechar" onClick={onClose}>✕</button>
              </div>
            </div>

            {/* Régua de vitais: mesma gramática nas 3 células + AGORA. */}
            <div className="cdl-vitals">
              <div className="cdl-vit" title={inteligencia?.opportunityReason || undefined}>
                <Anel valor={score} tom={tomScore} />
                <div>
                  <span className="cdl-vit__k">Score</span>
                  <div className={`cdl-vit__v cdl-state is-${tomScore}`}>{palavraScore}</div>
                </div>
              </div>

              <div className="cdl-vit">
                <div>
                  <span className="cdl-vit__k">Prontidão</span>
                  <div className="cdl-vit__v is-sm">
                    {totalDados ? `${confirmados} de ${totalDados} dados` : "—"}
                    {totalDados ? <small>confirmados</small> : null}
                  </div>
                  {totalDados > 0 && (
                    <div className="cdl-seg" aria-hidden="true">
                      {Array.from({ length: totalDados }, (_, index) => (
                        <i key={index} className={index < confirmados ? "is-on" : undefined} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="cdl-vit">
                <div>
                  <span className="cdl-vit__k">Último contato</span>
                  <div className="cdl-vit__v is-md">
                    {ultimoContato || "sem contato"}
                    {ultimoContato && lead.conversation ? <small>WhatsApp</small> : null}
                  </div>
                </div>
              </div>

              <div className="cdl-vit is-now">
                <span className="cdl-pulse" aria-hidden="true" />
                <div>
                  <span className="cdl-vit__k">Indicado</span>
                  <div className="cdl-vit__what">{lead.nextAction || "Primeiro contato"}</div>
                </div>
                <div className="cdl-vit__cta">
                  <button type="button" className="cdl-do" onClick={() => focarComposer(canalSugerido)}>
                    Fazer agora
                  </button>
                  <button type="button" className="cdl-when" title="Reagendar" aria-label="Reagendar" onClick={() => setAgoraOpen(true)}>
                    <CdlIcon name="cal" />
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* ══════════ CORPO ══════════ */}
          <div className="cdl-body">

            {/* ── ESQUERDA: dossiê ── */}
            <aside className="cdl-col cdl-col--dossie" aria-label="Dossiê do lead">
              <section className="cdl-card">
                {/* O CNPJ existe num LUGAR SÓ da tela: aqui. */}
                <div className="cdl-cnpj">
                  {situacao && (
                    <span className={`cdl-badge cdl-cnpj__rfb ${rfbAtiva ? "is-ok" : "is-warn"}`}>
                      {rfbAtiva ? "RFB · ativa" : humanizar(situacao)}
                    </span>
                  )}
                  <span className="cdl-cnpj__k">CNPJ</span>
                  <div className="cdl-cnpj__num">
                    {cnpjFmt || "—"}
                    {cnpjFmt && (
                      <button
                        type="button"
                        className="cdl-copy"
                        onClick={() => navigator.clipboard?.writeText(cnpjFmt).catch(() => undefined)}
                      >
                        copiar
                      </button>
                    )}
                  </div>
                  <Linha k="Razão social">{fonte?.razaoSocial || lead.razaoSocial || "—"}</Linha>
                  <Linha k="Abertura">
                    {fonte?.openedAt
                      ? `${dataBr(fonte.openedAt)}${idade != null ? ` · ${idade} ano${idade === 1 ? "" : "s"}` : ""}`
                      : "—"}
                  </Linha>
                  <Linha k="Porte">
                    {[fonte?.porte, fonte?.simples ? "Simples Nacional" : null, fonte?.mei ? "MEI" : null]
                      .filter(Boolean).join(" · ") || "—"}
                  </Linha>
                </div>
                <div className="cdl-card__b cdl-card__b--tight">
                  {empresaCarregando ? (
                    <span className="cdl-mut">Carregando Receita Federal…</span>
                  ) : (
                    <>
                      <Linha k="Fantasia">{fonte?.nomeFantasia || "—"}</Linha>
                      <Linha k="CNAE">
                        {fonte?.cnae
                          ? `${formatBrCnae(fonte.cnae)}${fonte.cnaeDescription ? ` — ${fonte.cnaeDescription}` : ""}`
                          : (formatBrCnae(lead.cnae) || "—")}
                      </Linha>
                      <Linha k="Natureza">{fonte?.naturezaJuridica || "—"}</Linha>
                      <Linha k="Capital social" mono>
                        {fonte?.capitalSocial != null ? dinheiro(fonte.capitalSocial) : "—"}
                      </Linha>
                      <Linha k="Unidade">{fonte?.matrizFilial ? humanizar(fonte.matrizFilial) : "—"}</Linha>
                    </>
                  )}
                </div>
              </section>

              <section className="cdl-card">
                <div className="cdl-card__h">
                  Dono da empresa
                  {fonte?.partners?.length ? (
                    <span className="cdl-badge is-mute cdl-card__st">
                      {fonte.partners.length} sócio{fonte.partners.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <div className="cdl-card__b">
                  <div className="cdl-person">
                    <span className="cdl-person__av">{iniciais(nomeChave || lead.name)}</span>
                    <span>
                      <b>{nomeChave || "Responsável não identificado"}</b>
                      <small>{cargoChave || "Não identificada"}</small>
                    </span>
                  </div>
                  <Linha
                    k="Telefone"
                    mono={Boolean(telefoneDono)}
                    off={!telefoneDono}
                    acoes={telefoneDono ? (
                      <>
                        <a href={`tel:${onlyDigits(telefoneDono)}`} title="Ligar" aria-label="Ligar">
                          <CdlIcon name="phone" />
                        </a>
                        <BotaoCopiar valor={formatBrPhone(telefoneDono)} rotulo="Copiar telefone" />
                      </>
                    ) : undefined}
                  >
                    {telefoneDono ? formatBrPhone(telefoneDono) : "—"}
                    {telefoneDono && mapaWhats[onlyDigits(telefoneDono)] === true && (
                      <span className="cdl-wa-ok">Whats ✓</span>
                    )}
                  </Linha>
                  <Linha k="Instagram" off={!lead.ownerInstagram}>{lead.ownerInstagram || "não localizado"}</Linha>
                  <Linha k="Facebook" off={!lead.ownerFacebook}>{lead.ownerFacebook || "não localizado"}</Linha>
                </div>
              </section>

              <section className="cdl-card">
                <div className="cdl-card__h">Contatos da empresa</div>
                <div className="cdl-card__b">
                  <Linha
                    k="Telefone"
                    mono={Boolean(lead.phone)}
                    off={!lead.phone}
                    acoes={lead.phone ? <BotaoCopiar valor={formatBrPhone(lead.phone)} rotulo="Copiar telefone" /> : undefined}
                  >
                    {lead.phone ? formatBrPhone(lead.phone) : "—"}
                  </Linha>
                  <Linha
                    k="E-mail"
                    off={!lead.email}
                    acoes={lead.email ? <BotaoCopiar valor={lead.email} rotulo="Copiar e-mail" /> : undefined}
                  >
                    {lead.email || "—"}
                  </Linha>
                  <Linha k="Site" off={!lead.website}>
                    {lead.website || <span className="cdl-badge is-warn">sem site · argumento de venda</span>}
                  </Linha>
                  <Linha k="Endereço" off={!lead.address}>{lead.address || "—"}</Linha>
                </div>
              </section>

              <section className="cdl-card">
                <div className="cdl-card__h">Por que entrou no radar</div>
                <div className="cdl-card__b">
                  {motivosRadar.length ? (
                    <ul className="cdl-why">
                      {motivosRadar.map((motivo) => (
                        <li key={motivo}>{MOTIVOS_RADAR[motivo] || humanizar(motivo)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="cdl-mut">Motivo de inclusão não informado.</span>
                  )}
                  <Linha k="Cadastro">{cadastroPct}% completo</Linha>
                  {lead.timesSeen != null && lead.timesSeen > 1 && (
                    <Linha k="Visto no Radar">{lead.timesSeen} vezes</Linha>
                  )}
                  {preVoo?.enrichment?.enabled && preVoo.enrichment.podeBuscar && (
                    <button type="button" className="cdl-btn-line" disabled={enriquecerBusy} onClick={buscarMaisDados}>
                      {enriquecerBusy ? "Buscando…" : "Buscar mais dados"}
                    </button>
                  )}
                </div>
              </section>
            </aside>

            {/* ── CENTRO: a conversa ── */}
            <div className="cdl-col cdl-col--talk">
              <CentralDoLeadConversa
                leadId={lead.id}
                leadName={lead.name}
                phone={lead.phone}
                email={lead.email}
                currentNote={lead.shortNote}
                conversationId={lead.conversation?.id}
                timeline={lead.timeline}
                whatsappOk={waOk}
                emailReady={emailReady}
                copilotoEnabled={copilotoEnabled}
                copilotoFicha={{
                  nome: lead.name,
                  razaoSocial: fonte?.razaoSocial || lead.razaoSocial || null,
                  cnpj,
                  cnae: fonte?.cnae || lead.cnae || null,
                  segmento: lead.segment,
                  cidade: lead.city,
                  uf: lead.state,
                  situacao,
                }}
                templateText={templateText}
                command={comando}
                onConnectWhatsapp={() => setWaConnectOpen(true)}
                onConfigureEmail={() => router.push("/configuracoes")}
                onChanged={onConversationChanged}
              />
            </div>

            {/* ── DIREITA: a decisão ── */}
            <aside className="cdl-col cdl-col--decisao" aria-label="Operação do lead">
              <section className="cdl-card is-robot">
                <div className="cdl-card__h">
                  <span className={`cdl-led${roboLigado ? " is-on" : ""}`} />
                  Robô de cadência
                  <span className={`cdl-badge cdl-card__st ${roboLigado ? "is-ok" : bloqueio ? "is-warn" : "is-mute"}`}>
                    {roboLigado ? "rodando" : bloqueio ? "parado" : "pronto"}
                  </span>
                </div>
                <div className="cdl-card__b">
                  {preVooCarregando ? (
                    <span className="cdl-mut">Carregando plano…</span>
                  ) : !preVoo || preVoo.locked ? (
                    <span className="cdl-mut">Plano indisponível para este lead.</span>
                  ) : roboLigado ? (
                    <>
                      <div className="cdl-warn">
                        {persona ? `Plano ${persona.nome.split(" (")[0]}` : "Robô ativo"}
                        <small>
                          Passo {(robo?.currentStep ?? 0) + 1}
                          {persona ? ` de ${persona.passos.length}` : ""} · assuma quando houver resposta.
                        </small>
                      </div>
                      {persona && (
                        <div className="cdl-steps">
                          {persona.passos.map((passo, index) => (
                            <span
                              key={`${passo.canal}-${passo.dia}-${index}`}
                              className={index < (robo?.currentStep ?? 0) ? "is-done" : undefined}
                            >
                              {passo.titulo || humanizar(passo.canal)}
                              <small>{passo.dia === 0 ? "hoje" : `D+${passo.dia}`}</small>
                            </span>
                          ))}
                        </div>
                      )}
                      <button type="button" className="cdl-btn-full" disabled={etapaBusy} onClick={() => void trocarEtapa("qualificado")}>
                        Assumir atendimento
                      </button>
                      <button type="button" className="cdl-btn-line" disabled={roboBusy} onClick={desligarRobo}>
                        {roboBusy ? "Desligando…" : "Desligar robô"}
                      </button>
                    </>
                  ) : bloqueio?.codigo === "config_ausente" ? (
                    <>
                      <div className="cdl-warn">
                        Falta configurar horário e teto
                        <small>Vale pra empresa toda — configura uma vez e libera.</small>
                      </div>
                      <div className="cdl-form3">
                        <label>Início<input type="time" value={configIni} onChange={(e) => setConfigIni(e.target.value)} /></label>
                        <label>Fim<input type="time" value={configFim} onChange={(e) => setConfigFim(e.target.value)} /></label>
                        <label>Teto/dia<input type="number" min={1} max={200} value={configTeto} onChange={(e) => setConfigTeto(e.target.value)} /></label>
                      </div>
                      <button type="button" className="cdl-btn-full" disabled={configBusy} onClick={salvarConfigDisparo}>
                        {configBusy ? "Salvando…" : "Salvar e liberar Automação"}
                      </button>
                    </>
                  ) : bloqueio ? (
                    <>
                      <div className="cdl-warn">
                        {bloqueio.motivo}
                        <small>{bloqueio.acao}</small>
                      </div>
                      {bloqueio.codigo === "whatsapp_desconectado" && (
                        <button type="button" className="cdl-btn-full" onClick={() => setWaConnectOpen(true)}>
                          Conectar WhatsApp
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {personas.length > 1 && (
                        <div className="cdl-personas">
                          {personas.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              aria-pressed={personaKey === item.key}
                              className={`cdl-persona${personaKey === item.key ? " is-on" : ""}`}
                              onClick={() => setPersonaKey(item.key)}
                            >
                              {item.nome.split(" (")[0]}{item.recomendado ? <small> ★</small> : null}
                            </button>
                          ))}
                        </div>
                      )}
                      {persona && (
                        <>
                          <div className="cdl-warn">
                            Pronto para ligar
                            <small>{persona.descricao}</small>
                          </div>
                          <div className="cdl-steps">
                            {persona.passos.map((passo, index) => (
                              <span key={`${passo.canal}-${passo.dia}-${index}`}>
                                {passo.titulo || humanizar(passo.canal)}
                                <small>{passo.dia === 0 ? "hoje" : `D+${passo.dia}`}</small>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {proximoSlot?.slot && (
                        <Linha k="Próximo horário">
                          {dataHoraBr(proximoSlot.slot)}
                          {proximoSlot.conflito && proximoSlot.motivoConflito
                            ? ` · ${rotuloConflito(proximoSlot.motivoConflito)}`
                            : ""}
                        </Linha>
                      )}
                      <button type="button" className="cdl-btn-full" disabled={roboBusy || !personaKey} onClick={ligarRobo}>
                        {roboBusy ? "Ligando…" : "Ligar robô"}
                      </button>
                    </>
                  )}
                </div>
              </section>

              {canViewValues && (
                <section className="cdl-card">
                  <div className="cdl-card__h">
                    Negócio
                    <span className={`cdl-badge cdl-card__st ${lead.saleStatus === "sale_confirmed" ? "is-ok" : "is-mute"}`}>
                      {lead.saleStatusLabel || "sem venda"}
                    </span>
                  </div>
                  <div className="cdl-card__b">
                    <span className="cdl-money-big">
                      {lead.saleValue != null ? dinheiro(lead.saleValue) : "R$ 0,00"}<small> /mês</small>
                    </span>
                    <div className="cdl-mgrid">
                      <div className="cdl-mcell">
                        <small>Produto</small>
                        <b className={lead.product?.name ? undefined : "is-off"}>{lead.product?.name || "Não definido"}</b>
                      </div>
                      <div className="cdl-mcell">
                        <small>Implantação</small>
                        <b>{lead.setupValue != null ? dinheiro(lead.setupValue) : "R$ 0,00"}</b>
                      </div>
                      <div className="cdl-mcell">
                        <small>Comissão</small>
                        <b>
                          {lead.commissionAmount != null
                            ? `${dinheiro(lead.commissionAmount)}${lead.commissionRecurring ? " /mês" : ""}`
                            : "R$ 0,00"}
                        </b>
                      </div>
                      <div className="cdl-mcell">
                        <small>Responsável</small>
                        <b className={lead.owner?.name ? undefined : "is-off"}>{lead.owner?.name || "—"}</b>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {canViewValues && (
                <section className="cdl-card">
                  <div className="cdl-card__h">
                    Financeiro do cliente
                    {extrato && (
                      <span className={`cdl-badge cdl-card__st ${extrato.saldoAberto > 0 ? "is-warn" : "is-ok"}`}>
                        {extrato.saldoAberto > 0 ? "em aberto" : "em dia"}
                      </span>
                    )}
                  </div>
                  <div className="cdl-card__b">
                    {!customerProfileId ? (
                      <>
                        <span className="cdl-mut">Sem cobranças.</span>
                        {(lead.saleValue ?? 0) > 0 && (
                          <button type="button" className="cdl-btn-line" disabled={financeBusy != null} onClick={gerarCobranca}>
                            {financeBusy === "create" ? "Gerando…" : "Gerar cobrança"}
                          </button>
                        )}
                      </>
                    ) : extratoErro ? (
                      <span className="cdl-mut">Não foi possível carregar o extrato.</span>
                    ) : extrato == null ? (
                      <span className="cdl-mut">Carregando extrato…</span>
                    ) : extrato.charges.length === 0 ? (
                      <span className="cdl-mut">Sem cobranças.</span>
                    ) : (
                      <>
                        <Linha k="Saldo em aberto" mono>{dinheiro(extrato.saldoAberto)}</Linha>
                        {extrato.charges.slice(0, 6).map((cobranca) => (
                          <div className="cdl-charge" key={cobranca.id}>
                            <span>
                              <strong>{cobranca.description || "Título"}</strong>
                              <small>{statusCobranca(cobranca.status)} · {dataBr(cobranca.dueDate)}</small>
                            </span>
                            <span className="cdl-charge__val">{dinheiro(cobranca.amount)}</span>
                            {String(cobranca.status || "").toLowerCase() === "pending" && (
                              <button
                                type="button"
                                className="cdl-btn-line"
                                disabled={financeBusy != null}
                                onClick={() => quitar(cobranca.id)}
                              >
                                {financeBusy === cobranca.id ? "Baixando…" : "Marcar pago"}
                              </button>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </section>
              )}

              {aviso && <span className={`cdl-msg-line${aviso.startsWith("✓") ? "" : " is-err"}`}>{aviso}</span>}

              <div className="cdl-foot">
                <button type="button" onClick={() => setAgendaOpen(true)}>
                  <CdlIcon name="cal" />Agenda do lead
                </button>
                <button type="button" onClick={() => setSemInteresseOpen(true)}>Sem interesse…</button>
              </div>
            </aside>
          </div>

          {/* ══════════ DECISÕES — contidas na ficha ══════════
              O `.hbx-veil` central já centraliza (Lei nº2); `.cdl-inner-veil`
              só troca `fixed` por `absolute` pra não cobrir a tela inteira. */}
          {encerrarOpen && (
            <div
              className="hbx-veil cdl-inner-veil"
              onClick={(event) => { if (event.target === event.currentTarget) setEncerrarOpen(false); }}
            >
              <div className="cdl-pop" role="dialog" aria-modal="true" aria-label="Motivo do encerramento">
                <strong>Por que está encerrando?</strong>
                <div className="cdl-pop__list">
                  {MOTIVOS_ENCERRAMENTO.map((motivo) => (
                    <button key={motivo.key} type="button" disabled={etapaBusy} onClick={() => void trocarEtapa("encerrado", motivo.key)}>
                      {motivo.label}
                    </button>
                  ))}
                </div>
                <div className="cdl-pop__acts">
                  <button type="button" className="cdl-pop__cancel" onClick={() => setEncerrarOpen(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {agoraOpen && (
            <div
              className="hbx-veil cdl-inner-veil"
              onClick={(event) => { if (event.target === event.currentTarget) setAgoraOpen(false); }}
            >
              {/* Mostra num lugar (a célula AGORA), edita num lugar (aqui). */}
              <div className="cdl-pop" role="dialog" aria-modal="true" aria-label="Próxima ação do lead">
                <strong>Próxima ação · {lead.name || "lead"}</strong>
                <input
                  maxLength={140}
                  value={acaoDraft}
                  placeholder="O que fazer com este lead"
                  aria-label="Próxima ação do lead"
                  onChange={(event) => setAcaoDraft(event.target.value)}
                />
                <input
                  type="date"
                  value={quandoDraft}
                  aria-label="Quando retomar"
                  onChange={(event) => setQuandoDraft(event.target.value)}
                />
                {proximoSlot?.slot && (
                  <span className="cdl-mut">
                    Próximo horário livre: {dataHoraBr(proximoSlot.slot)}
                    {proximoSlot.conflito && proximoSlot.motivoConflito
                      ? ` · ${rotuloConflito(proximoSlot.motivoConflito)}`
                      : ""}
                  </span>
                )}
                <div className="cdl-pop__acts">
                  <button type="button" className="cdl-pop__cancel" onClick={() => setAgoraOpen(false)}>Cancelar</button>
                  <button type="button" className="cdl-pop__go" disabled={acaoBusy} onClick={salvarAgora}>
                    {acaoBusy ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {semInteresseOpen && (
            <div
              className="hbx-veil cdl-inner-veil"
              onClick={(event) => { if (event.target === event.currentTarget) setSemInteresseOpen(false); }}
            >
              <div className="cdl-pop" role="dialog" aria-modal="true" aria-label="Motivo de desinteresse">
                <strong>Sem interesse · {lead.name || "lead"}</strong>
                <div className="cdl-pop__list">
                  {MOTIVOS_DESINTERESSE.map((motivo) => (
                    <button key={motivo.key} type="button" disabled={acaoBusy} onClick={() => marcarSemInteresse(motivo.key)}>
                      {motivo.label}
                    </button>
                  ))}
                </div>
                <div className="cdl-pop__acts">
                  <button type="button" className="cdl-pop__cancel" onClick={() => setSemInteresseOpen(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {agendaOpen && (
            <div
              className="hbx-veil cdl-inner-veil"
              onClick={(event) => { if (event.target === event.currentTarget) setAgendaOpen(false); }}
            >
              {/* AgendaLeadPanel é painel de DADOS compartilhado com /leads e
                  /atendimento — duplicá-lo criaria justamente o legado que a
                  regra "duas telas vivas pra mesma função" proíbe. O desenho
                  da gaveta é desta folha; o miolo é o painel único. */}
              <aside className="cdl-drawer" aria-label="Agenda do lead">
                <header className="cdl-drawer__h">
                  <span>
                    <strong>Agenda do lead</strong>
                    <small>{lead.name}</small>
                  </span>
                  <button type="button" aria-label="Fechar agenda" onClick={() => setAgendaOpen(false)}>✕</button>
                </header>
                <div className="cdl-drawer__b"><AgendaLeadPanel key={lead.id} leadId={lead.id} /></div>
              </aside>
            </div>
          )}
        </section>
      </div>

      {waConnectOpen && (
        <WhatsAppConnectModal
          open={waConnectOpen}
          onClose={() => setWaConnectOpen(false)}
          onConnected={() => { setWaOk(true); setWaConnectOpen(false); }}
          onDisconnected={() => setWaOk(false)}
        />
      )}

      {fecharVendaOpen && (
        <FecharVendaModal
          mode={{ kind: "lead", leadId: lead.id }}
          leadName={lead.name}
          phone={lead.phone}
          onClose={() => setFecharVendaOpen(false)}
          onDone={() => { setFecharVendaOpen(false); onConversationChanged?.(); }}
        />
      )}
    </>
  );
}
