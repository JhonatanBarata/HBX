"use client";

// ============================================================
// CENTRAL DO LEAD — COLUNA DO CENTRO (a conversa).
//
// Escrita do ZERO em 28/07/2026 a partir de "Central do Lead — desenho
// aplicável". O que existia (lead-cockpit-history.tsx, 910 linhas) foi
// DELETADO por `git rm` junto com a folha dele — ordem do dono: "remova
// todos legados... não quero reaproveitado nada".
//
// O QUE O DESENHO MANDA AQUI (queixas 3, 6 e 8 da legenda da referência):
//  · ABA legível: 13,5px peso 650, ativa em azul com régua de 3px que
//    DESLIZA (a Glass Pill da Lei nº2 vestida de sublinhado).
//  · COPILOTO é UMA LINHA viva com 3 comandos em chip — não um bloco.
//  · SEM MONTANHA-RUSSA: a barra de modos e a área de escrita têm altura
//    reservada fixa. Trocar WhatsApp/E-mail/Observação/Atividade não muda
//    a altura do miolo, então o feed não pula.
//
// O CONTRATO DE DADOS é o do backend e não mudou: mesmas rotas, mesmos
// verbos. O que mudou é a FORMA.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CdlIcon } from "@/components/hbx/central-do-lead-icons";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { apiFetch } from "@/lib/api";

export type CdlComposerMode = "whatsapp" | "email" | "observacao" | "atividade";

/** Ordem vinda de fora (clicar num canal do topo foca o modo certo). */
export type CdlComposerCommand = {
  mode: CdlComposerMode;
  seq: number;
  draft?: string;
};

export type CdlTimelineEvent = {
  id: string;
  eventType?: string | null;
  title: string | null;
  description: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

export type CdlCopilotFicha = {
  nome?: string | null;
  razaoSocial?: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  segmento?: string | null;
  cidade?: string | null;
  uf?: string | null;
  situacao?: string | null;
};

type ConversationMessage = {
  id: string;
  direction: string;
  content: string;
  createdAt: string | null;
  messageType: string;
  senderType: string;
  sourceModule: string | null;
  status: string;
  error: string | null;
};

type LeadActivity = {
  id: string;
  tipo: string;
  titulo: string;
  vencimento: string | null;
  pendente: boolean;
  atrasada: boolean;
  createdAt: string | null;
};

type FeedItem =
  | { kind: "message"; id: string; at: string | null; message: ConversationMessage }
  | { kind: "event"; id: string; at: string | null; event: CdlTimelineEvent }
  | { kind: "activity"; id: string; at: string | null; activity: LeadActivity };

type EmailPreview = { subject: string; text: string; to: string };

type Aba = "conversa" | "tempo" | "emails" | "notas";

const ABAS: Array<{ key: Aba; label: string }> = [
  { key: "conversa", label: "Conversa" },
  { key: "tempo", label: "Linha do tempo" },
  { key: "emails", label: "E-mails" },
  { key: "notas", label: "Notas" },
];

const MODOS: Array<{ key: CdlComposerMode; label: string; icon: string }> = [
  { key: "whatsapp", label: "WhatsApp", icon: "wa" },
  { key: "email", label: "E-mail", icon: "mail" },
  { key: "observacao", label: "Observação", icon: "doc" },
  { key: "atividade", label: "Atividade", icon: "clock" },
];

const TIPOS_ATIVIDADE: Array<[string, string]> = [
  ["ligacao", "Ligação"],
  ["reuniao", "Reunião"],
  ["visita", "Visita"],
  ["mensagem", "Mensagem"],
];

// ---- Leitura defensiva do payload (o backend às vezes aninha em `data`) ----
function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function payloadSource(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  const nested = asRecord(root.data);
  return ("messages" in nested || "conversation" in nested || "atividades" in nested) ? nested : root;
}
function normalizeMessage(value: unknown, index: number): ConversationMessage {
  const raw = asRecord(value);
  const createdAt = raw.createdAt ?? raw.timestamp ?? null;
  return {
    id: String(raw.id ?? `m-${index}`),
    direction: String(raw.direction || "").trim().toLowerCase(),
    content: String(raw.content ?? raw.body ?? ""),
    createdAt: createdAt == null ? null : String(createdAt),
    messageType: String(raw.messageType || "text").trim().toLowerCase(),
    senderType: String(raw.senderType || "system").trim().toLowerCase(),
    sourceModule: raw.sourceModule == null ? null : String(raw.sourceModule).trim().toLowerCase(),
    status: String(raw.status || "").trim().toUpperCase(),
    error: raw.error == null ? null : String(raw.error),
  };
}
function normalizeActivity(value: unknown, index: number): LeadActivity {
  const raw = asRecord(value);
  return {
    id: String(raw.id ?? `a-${index}`),
    tipo: String(raw.tipo || "ligacao").trim().toLowerCase(),
    titulo: String(raw.titulo || "Atividade"),
    vencimento: raw.vencimento == null ? null : String(raw.vencimento),
    pendente: Boolean(raw.pendente),
    atrasada: Boolean(raw.atrasada),
    createdAt: raw.createdAt == null ? null : String(raw.createdAt),
  };
}
function conversationIdOf(value: unknown): string | null {
  const source = payloadSource(value);
  const id = asRecord(source.conversation).id ?? source.conversationId ?? null;
  return id == null ? null : String(id);
}

// ---- Texto ---------------------------------------------------------------
function horaCurta(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function dataHora(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function entregaLabel(status: string): string | null {
  const key = String(status || "").toUpperCase();
  if (key === "QUEUED" || key === "PENDING") return "Na fila";
  if (key === "SENDING" || key === "PROCESSING") return "Enviando";
  if (key === "SENT") return "Enviado";
  if (key === "DELIVERED") return "Entregue";
  if (key === "READ") return "Lida";
  if (key === "FAILED") return "Falha no envio";
  if (key === "CANCELED" || key === "CANCELLED") return "Envio cancelado";
  return null;
}
/** Códigos internos e texto sem acento nunca chegam na tela. */
function textoVisivel(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\bApresentacao\b/g, "Apresentação")
    .replace(/\bapresentacao\b/g, "apresentação")
    .replace(/\bCadencia ativa\b/g, "Robô ativo");
}
function iniciais(name: string | null | undefined): string {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
function subtipoEvento(event: CdlTimelineEvent): "email" | "robot" | "note" | "activity" | "system" {
  if (event.eventType?.includes("email")) return "email";
  if (event.eventType?.includes("robo")) return "robot";
  if (event.eventType === "note") return "note";
  if (event.eventType?.includes("atividade")) return "activity";
  return "system";
}
function dataAtividadePadrao(): string {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function paraIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function CentralDoLeadConversa({
  leadId,
  leadName,
  phone,
  email,
  currentNote,
  conversationId: conversationIdInicial,
  timeline,
  whatsappOk,
  whatsappRecipientStatus,
  emailReady,
  copilotoEnabled,
  copilotoFicha,
  templateText,
  command,
  onConnectWhatsapp,
  onConfigureEmail,
  onChanged,
}: {
  leadId: string;
  leadName: string | null;
  phone: string | null;
  email: string | null;
  currentNote: string | null;
  conversationId?: string | number | null;
  timeline?: CdlTimelineEvent[] | null;
  whatsappOk: boolean | null;
  whatsappRecipientStatus: "confirmed" | "unavailable" | "unconfirmed";
  emailReady: boolean | null;
  copilotoEnabled: boolean;
  copilotoFicha: CdlCopilotFicha;
  templateText: string;
  command: CdlComposerCommand;
  onConnectWhatsapp: () => void;
  onConfigureEmail: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [aba, setAba] = useState<Aba>("conversa");
  const abaPill = useGlassPill<HTMLButtonElement>(aba, ABAS.length);
  const [modo, setModo] = useState<CdlComposerMode>("whatsapp");
  const modoPill = useGlassPill<HTMLButtonElement>(modo, MODOS.length);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [eventosLocais, setEventosLocais] = useState<CdlTimelineEvent[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    conversationIdInicial == null ? null : String(conversationIdInicial),
  );
  const [temMais, setTemMais] = useState(false);
  const [antesDe, setAntesDe] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroFeed, setErroFeed] = useState<string | null>(null);
  const [antigasBusy, setAntigasBusy] = useState(false);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(() => new Set());

  const [rascunho, setRascunho] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [optOutBusy, setOptOutBusy] = useState(false);

  const [nota, setNota] = useState(currentNote || "");
  const [notaSalva, setNotaSalva] = useState(currentNote || "");
  const [notaBusy, setNotaBusy] = useState(false);
  const [notaMsg, setNotaMsg] = useState<string | null>(null);

  const [ativTitulo, setAtivTitulo] = useState("");
  const [ativTipo, setAtivTipo] = useState("ligacao");
  const [ativData, setAtivData] = useState(dataAtividadePadrao);
  const [ativBusy, setAtivBusy] = useState(false);
  const [ativMsg, setAtivMsg] = useState<string | null>(null);

  const [copBusy, setCopBusy] = useState<string | null>(null);
  const [copMsg, setCopMsg] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const pollBusy = useRef(false);
  const seqRef = useRef(0);

  const aplicarPayload = useCallback((payload: unknown, noTopo = false) => {
    const source = payloadSource(payload);
    if ("messages" in source) {
      const parsed = Array.isArray(source.messages) ? source.messages.map(normalizeMessage) : [];
      setMessages((atual) => noTopo ? [...parsed, ...atual] : parsed);
      setTemMais(Boolean(source.hasMore));
      setAntesDe(source.nextBefore == null
        ? (Boolean(source.hasMore) ? parsed[0]?.createdAt || null : null)
        : String(source.nextBefore));
    }
    const id = conversationIdOf(payload);
    if (id) setConversationId(id);
  }, []);

  const carregarMensagens = useCallback(async (silencioso = false) => {
    if (pollBusy.current) return;
    pollBusy.current = true;
    if (!silencioso) { setCarregando(true); setErroFeed(null); }
    try {
      const res = await apiFetch<unknown>(`/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=30`);
      aplicarPayload(res);
    } catch (error) {
      if (!silencioso) setErroFeed(error instanceof Error ? error.message : "Não foi possível carregar as mensagens.");
    } finally {
      pollBusy.current = false;
      if (!silencioso) setCarregando(false);
    }
  }, [aplicarPayload, leadId]);

  const carregarAtividades = useCallback(async () => {
    try {
      const res = await apiFetch<unknown>(`/atividades/lead/${encodeURIComponent(leadId)}`);
      const source = payloadSource(res);
      setActivities(Array.isArray(source.atividades) ? source.atividades.map(normalizeActivity) : []);
    } catch {
      setActivities([]);
    }
  }, [leadId]);

  useEffect(() => {
    void (async () => { await Promise.all([carregarMensagens(), carregarAtividades()]); })();
  }, [carregarAtividades, carregarMensagens]);

  useEffect(() => {
    const id = window.setInterval(() => { void carregarMensagens(true); }, 9_000);
    return () => window.clearInterval(id);
  }, [carregarMensagens]);

  // Ordem de fora: clicar no canal do topo troca o modo (e pode trazer texto).
  useEffect(() => {
    if (command.seq === seqRef.current) return;
    seqRef.current = command.seq;
    queueMicrotask(() => {
      setModo(command.mode);
      if (command.mode === "whatsapp" && command.draft) setRascunho(command.draft);
    });
  }, [command]);

  const itens = useMemo(() => {
    const porChave = new Map<string, FeedItem>();
    messages.forEach((message) => {
      porChave.set(`m:${message.id}`, { kind: "message", id: `m:${message.id}`, at: message.createdAt, message });
    });
    [...eventosLocais, ...(timeline || [])]
      .filter((event) => event.eventType !== "inbound_reply")
      .forEach((event) => {
        porChave.set(`e:${event.id}`, {
          kind: "event",
          id: `e:${event.id}`,
          at: event.createdAt || event.returnAt || null,
          event,
        });
      });
    activities.filter((a) => a.pendente).forEach((activity) => {
      porChave.set(`a:${activity.id}`, {
        kind: "activity",
        id: `a:${activity.id}`,
        at: activity.createdAt || activity.vencimento,
        activity,
      });
    });
    return [...porChave.values()].sort((left, right) => {
      const l = left.at ? new Date(left.at).getTime() : 0;
      const r = right.at ? new Date(right.at).getTime() : 0;
      return l - r;
    });
  }, [activities, eventosLocais, messages, timeline]);

  const itensDaAba = useMemo(() => {
    if (aba === "conversa") return itens.filter((item) => item.kind === "message");
    if (aba === "emails") return itens.filter((item) => item.kind === "event" && subtipoEvento(item.event) === "email");
    if (aba === "notas") return itens.filter((item) => item.kind === "event" && subtipoEvento(item.event) === "note");
    return itens;
  }, [itens, aba]);

  const contagens = useMemo(() => ({
    conversa: itens.filter((i) => i.kind === "message").length,
    tempo: itens.length,
    emails: itens.filter((i) => i.kind === "event" && subtipoEvento(i.event) === "email").length,
    notas: itens.filter((i) => i.kind === "event" && subtipoEvento(i.event) === "note").length,
  }), [itens]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [itensDaAba.length, aba]);

  async function carregarAntigas() {
    if (!antesDe || antigasBusy) return;
    setAntigasBusy(true);
    try {
      const res = await apiFetch<unknown>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=30&before=${encodeURIComponent(antesDe)}`,
      );
      aplicarPayload(res, true);
    } finally {
      setAntigasBusy(false);
    }
  }

  async function garantirConversa(): Promise<string> {
    if (conversationId) return conversationId;
    const criada = await apiFetch<unknown>(
      `/vendas/lead/${encodeURIComponent(leadId)}/conversation`,
      { method: "POST", body: JSON.stringify({}) },
    );
    const id = conversationIdOf(criada);
    if (!id) throw new Error("Não foi possível abrir a conversa.");
    setConversationId(id);
    return id;
  }

  async function enviarWhatsapp() {
    const texto = rascunho.trim();
    if (!texto || enviando || !phone || whatsappRecipientStatus !== "confirmed") return;
    setEnviando(true);
    setErroEnvio(null);
    const idOtimista = `queued-${Date.now()}`;
    setMessages((atual) => [...atual, {
      id: idOtimista,
      direction: "outbound",
      content: texto,
      createdAt: new Date().toISOString(),
      messageType: "text",
      senderType: "user",
      sourceModule: "vendas_human",
      status: "QUEUED",
      error: null,
    }]);
    try {
      await garantirConversa();
      const res = await apiFetch<unknown>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/message`,
        { method: "POST", body: JSON.stringify({ body: texto }) },
      );
      setRascunho("");
      aplicarPayload(res);
      await onChanged?.();
      window.setTimeout(() => { void carregarMensagens(true); }, 1_500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Não foi possível enviar a mensagem.";
      setMessages((atual) => atual.map((item) => item.id === idOtimista
        ? { ...item, status: "FAILED", error: msg }
        : item));
      setErroEnvio(msg);
    } finally {
      setEnviando(false);
    }
  }

  async function gerarPreviaEmail() {
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const res = await apiFetch<{ subject?: string; text?: string; recipientEmail?: string }>(
        `/vendas/leads/${encodeURIComponent(leadId)}/email/presentation/preview`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setEmailPreview({ subject: res?.subject || "", text: res?.text || "", to: res?.recipientEmail || email || "" });
      await onChanged?.();
    } catch (error) {
      setEmailMsg(error instanceof Error ? error.message : "Não foi possível gerar a prévia.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function enviarEmail() {
    if (!emailPreview || emailBusy) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(leadId)}/email/presentation/send`, {
        method: "POST",
        body: JSON.stringify({ subject: emailPreview.subject, text: emailPreview.text }),
      });
      setEmailMsg(`✓ E-mail enviado${emailPreview.to ? ` para ${emailPreview.to}` : ""}.`);
      setEmailPreview(null);
      await onChanged?.();
    } catch (error) {
      setEmailMsg(error instanceof Error ? error.message : "Não foi possível enviar o e-mail.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function registrarOptOut() {
    if (optOutBusy) return;
    setOptOutBusy(true);
    setEmailMsg(null);
    try {
      await apiFetch(`/vendas/leads/${encodeURIComponent(leadId)}/email/opt-out`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setEmailMsg("Registro feito. Este contato não receberá novos e-mails comerciais.");
      setEmailPreview(null);
      await onChanged?.();
    } catch (error) {
      setEmailMsg(error instanceof Error ? error.message : "Não foi possível registrar.");
    } finally {
      setOptOutBusy(false);
    }
  }

  async function salvarObservacao() {
    const texto = nota.trim();
    if (!texto || notaBusy) return;
    if (texto === notaSalva.trim()) { setNotaMsg("A observação não mudou."); return; }
    setNotaBusy(true);
    setNotaMsg(null);
    try {
      const res = await apiFetch<{ event?: CdlTimelineEvent }>(
        `/vendas/lead/${encodeURIComponent(leadId)}/note`,
        { method: "POST", body: JSON.stringify({ note: texto }) },
      );
      await apiFetch(`/vendas/lead/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        body: JSON.stringify({ shortNote: texto.slice(0, 280) }),
      });
      if (res?.event?.id) setEventosLocais((atual) => [res.event!, ...atual]);
      setNotaSalva(texto);
      setNotaMsg("✓ Observação registrada na história.");
      await onChanged?.();
    } catch (error) {
      setNotaMsg(error instanceof Error ? error.message : "Não foi possível registrar a observação.");
    } finally {
      setNotaBusy(false);
    }
  }

  async function criarAtividade() {
    const titulo = ativTitulo.trim();
    const vencimento = paraIso(ativData);
    if (!titulo || !vencimento || ativBusy) return;
    setAtivBusy(true);
    setAtivMsg(null);
    try {
      await apiFetch("/atividades", {
        method: "POST",
        body: JSON.stringify({ leadId, titulo, tipo: ativTipo, vencimento }),
      });
      setAtivTitulo("");
      setAtivData(dataAtividadePadrao());
      setAtivMsg("✓ Atividade criada.");
      await carregarAtividades();
      await onChanged?.();
    } catch (error) {
      setAtivMsg(error instanceof Error ? error.message : "Não foi possível criar a atividade.");
    } finally {
      setAtivBusy(false);
    }
  }

  // ---- COPILOTO ----------------------------------------------------------
  // Guardrail que veio do desenho antigo e continua valendo: o Copiloto NUNCA
  // envia. "Rascunhar" só PREENCHE o campo; quem aperta enviar é o humano.
  async function ultimasMensagens() {
    return messages.slice(-20).map((m) => ({
      direcao: m.direction === "outbound" ? "voce" : "lead",
      texto: String(m.content || "").trim(),
    })).filter((m) => m.texto);
  }

  async function copiloto(acao: "rascunho" | "resumo" | "sugestao") {
    if (copBusy) return;
    setCopBusy(acao);
    setCopMsg(null);
    try {
      const mensagens = await ultimasMensagens();
      const res = await apiFetch<{
        ok?: boolean; rascunho?: string; bullets?: string[];
        titulo?: string; prazoDias?: number; motivo?: string; error?: string;
      }>(`/assistente/copiloto/${acao}`, {
        method: "POST",
        body: JSON.stringify({ mensagens, ficha: copilotoFicha }),
      });
      if (!res?.ok) { setCopMsg(res?.error || "Copiloto indisponível."); return; }
      if (acao === "rascunho" && res.rascunho) {
        setModo("whatsapp");
        setRascunho(res.rascunho);
        setCopMsg("Rascunho no campo de escrever — quem envia é você.");
      } else if (acao === "resumo" && Array.isArray(res.bullets) && res.bullets.length) {
        setModo("observacao");
        setNota(res.bullets.map((b) => `• ${b}`).join("\n").slice(0, 280));
        setCopMsg("Resumo em Observação — revise e registre.");
      } else if (acao === "sugestao" && res.titulo) {
        setModo("atividade");
        setAtivTitulo(res.titulo);
        setCopMsg(res.motivo || "Sugestão em Atividade — confira a data e crie.");
      } else {
        setCopMsg("Copiloto não devolveu resposta.");
      }
    } catch (error) {
      setCopMsg(error instanceof Error ? error.message : "Copiloto indisponível.");
    } finally {
      setCopBusy(null);
    }
  }

  // ---- Desenho de um item do feed ---------------------------------------
  function renderItem(item: FeedItem) {
    if (item.kind === "message") {
      const m = item.message;
      const saiu = m.direction === "outbound";
      const falhou = m.status === "FAILED" || m.status === "CANCELED" || m.status === "CANCELLED";
      const automatico = m.sourceModule === "vendas_prospeccao_bot" || m.senderType === "bot";
      const entrega = saiu ? entregaLabel(m.status) : null;
      return (
        <div key={item.id} className={`cdl-msg${saiu ? " is-out" : ""}${falhou ? " is-failed" : ""}`}>
          {!saiu && <span className="cdl-msg__av">{iniciais(leadName)}</span>}
          <div className="cdl-bubble" title={m.error || undefined}>
            <span className="cdl-bubble__who">{saiu ? (automatico ? "Robô" : "Você") : (leadName || "Lead")}</span>
            <p>{m.content || (m.messageType !== "text" ? `[${m.messageType}]` : "")}</p>
            <time>{horaCurta(m.createdAt)}{entrega ? ` · ${entrega}` : ""}</time>
          </div>
        </div>
      );
    }

    if (item.kind === "activity") {
      const a = item.activity;
      const rotulo = TIPOS_ATIVIDADE.find(([key]) => key === a.tipo)?.[1] || "Atividade";
      return (
        <div key={item.id} className="cdl-event" data-kind="activity">
          <span className="cdl-event__icon"><CdlIcon name="clock" /></span>
          <span className="cdl-event__copy">
            <strong>{rotulo} agendada</strong>
            <span>{a.titulo}</span>
            <small>
              {dataHora(a.createdAt)}
              {a.vencimento ? ` · prevista para ${dataHora(a.vencimento)}` : ""}
              {a.atrasada ? " · atrasada" : ""}
            </small>
          </span>
        </div>
      );
    }

    const e = item.event;
    const tipo = subtipoEvento(e);
    const icone = tipo === "email" ? "mail" : tipo === "robot" ? "bolt" : tipo === "activity" ? "clock" : "doc";
    const descricao = textoVisivel(e.description || e.resultLabel || "");
    return (
      <div key={item.id} className="cdl-event" data-kind={tipo}>
        <span className="cdl-event__icon"><CdlIcon name={icone} /></span>
        <span className="cdl-event__copy">
          <strong>{textoVisivel(e.title) || "Atualização"}</strong>
          {descricao && <span>{descricao}</span>}
          <small>{dataHora(item.at)}</small>
        </span>
      </div>
    );
  }

  // Linha do tempo: registros de sistema CONSECUTIVOS viram um grupo
  // colapsado ("N registros do sistema") — 1 sozinho não vale grupo.
  function renderLinhaDoTempo(lista: FeedItem[]) {
    const nodes: React.ReactNode[] = [];
    let grupo: FeedItem[] = [];
    const despeja = () => {
      if (grupo.length === 0) return;
      if (grupo.length === 1) {
        nodes.push(renderItem(grupo[0]));
      } else {
        const chave = grupo[0].id;
        const aberto = gruposAbertos.has(chave);
        const bloco = [...grupo];
        nodes.push(
          <React.Fragment key={`sys-${chave}`}>
            <button
              type="button"
              className="cdl-sys"
              aria-expanded={aberto}
              onClick={() => setGruposAbertos((atual) => {
                const proximo = new Set(atual);
                if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave);
                return proximo;
              })}
            >
              {bloco.length} registros do sistema {aberto ? "▴" : "▾"}
            </button>
            {aberto && (
              <ul className="cdl-sys-list">
                {bloco.map((item) => item.kind === "event" ? (
                  <li key={item.id}>
                    <span>{textoVisivel(item.event.title) || "Atualização"}</span>
                    <small>{dataHora(item.at)}</small>
                  </li>
                ) : null)}
              </ul>
            )}
          </React.Fragment>,
        );
      }
      grupo = [];
    };
    lista.forEach((item) => {
      if (item.kind === "event" && subtipoEvento(item.event) === "system") grupo.push(item);
      else { despeja(); nodes.push(renderItem(item)); }
    });
    despeja();
    return nodes;
  }

  const vazio: Record<Aba, string> = {
    conversa: "Nenhuma mensagem ainda.",
    tempo: "Sem registros.",
    emails: "Nenhum e-mail.",
    notas: "Nenhuma nota.",
  };

  return (
    <main className="cdl-card cdl-talk">
      <nav className="cdl-tabs glass-pill-track" role="tablist" aria-label="Visões da história">
        <GlassPill {...abaPill} />
        {ABAS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            ref={abaPill.itemRef(item.key)}
            aria-selected={aba === item.key}
            className={`cdl-tab glass-pill-item${aba === item.key ? " is-on" : ""}`}
            onClick={() => setAba(item.key)}
          >
            {item.label}
            <span className="cdl-tab__n">{contagens[item.key]}</span>
          </button>
        ))}
      </nav>

      {/* Copiloto: UMA linha viva. A inteligência é do backend; aqui é a forma
          e o guardrail — nenhum destes 3 comandos envia nada sozinho. */}
      <div className="cdl-copilot">
        <span className="cdl-copilot__spark"><CdlIcon name="spark" /></span>
        <b>Copiloto</b>
        {copilotoEnabled ? (
          <>
            <button type="button" className="cdl-chip" disabled={Boolean(copBusy)} onClick={() => void copiloto("rascunho")}>
              {copBusy === "rascunho" ? "Rascunhando…" : "Rascunhar resposta"}
            </button>
            <button type="button" className="cdl-chip" disabled={Boolean(copBusy)} onClick={() => void copiloto("resumo")}>
              {copBusy === "resumo" ? "Resumindo…" : "Resumir conversa"}
            </button>
            <button type="button" className="cdl-chip" disabled={Boolean(copBusy)} onClick={() => void copiloto("sugestao")}>
              {copBusy === "sugestao" ? "Pensando…" : "Próxima ação"}
            </button>
          </>
        ) : (
          <span className="cdl-mut">Desligado nas Automações.</span>
        )}
        {templateText && (
          <button
            type="button"
            className="cdl-copilot__model"
            title={templateText}
            onClick={() => { setModo("whatsapp"); setRascunho(templateText); }}
          >
            Usar modelo de mensagem ▸
          </button>
        )}
      </div>

      <div className="cdl-feed" ref={feedRef}>
        {temMais && (aba === "conversa" || aba === "tempo") && (
          <button type="button" className="cdl-feed__more" onClick={carregarAntigas} disabled={antigasBusy}>
            {antigasBusy ? "Carregando…" : "Carregar mensagens anteriores"}
          </button>
        )}
        {carregando && itensDaAba.length === 0 ? (
          <span className="cdl-feed__empty">Carregando história…</span>
        ) : erroFeed && itensDaAba.length === 0 ? (
          <span className="cdl-feed__empty">{erroFeed}</span>
        ) : itensDaAba.length === 0 ? (
          <span className="cdl-feed__empty">{vazio[aba]}</span>
        ) : aba === "tempo" ? renderLinhaDoTempo(itensDaAba) : itensDaAba.map(renderItem)}
      </div>

      {/* ALTURA RESERVADA: os quatro modos ocupam a mesma caixa, então trocar
          de modo não empurra o feed pra cima nem pra baixo. */}
      <footer className="cdl-composer">
        <nav className="cdl-modes glass-pill-track" aria-label="Tipo de interação">
          <GlassPill {...modoPill} />
          {MODOS.map((item) => (
            <button
              key={item.key}
              type="button"
              ref={modoPill.itemRef(item.key)}
              aria-pressed={modo === item.key}
              className={`cdl-mode glass-pill-item${modo === item.key ? " is-on" : ""}${item.key === "whatsapp" ? " is-wa" : ""}`}
              onClick={() => setModo(item.key)}
            >
              <CdlIcon name={item.icon} /> {item.label}
            </button>
          ))}
        </nav>

        <div className="cdl-composer__slot">
          {modo === "whatsapp" && (
            !phone ? (
              <div className="cdl-composer__note">Este lead não tem telefone cadastrado.</div>
            ) : whatsappRecipientStatus === "unavailable" ? (
              <div className="cdl-composer__note">Este telefone não possui WhatsApp confirmado.</div>
            ) : whatsappRecipientStatus !== "confirmed" ? (
              <div className="cdl-composer__note">Não foi possível confirmar o WhatsApp deste contato.</div>
            ) : whatsappOk === false ? (
              <div className="cdl-composer__note">
                <span>WhatsApp da empresa não está conectado.</span>
                <button type="button" className="cdl-chip" onClick={onConnectWhatsapp}>Conectar WhatsApp</button>
              </div>
            ) : (
              <div className="cdl-send">
                <textarea
                  value={rascunho}
                  maxLength={4000}
                  placeholder="Escreva uma mensagem…"
                  aria-label="Mensagem de WhatsApp"
                  disabled={enviando}
                  onChange={(event) => setRascunho(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void enviarWhatsapp();
                    }
                  }}
                />
                <button
                  type="button"
                  className="cdl-send__btn"
                  title="Enviar (Enter)"
                  aria-label="Enviar mensagem"
                  disabled={enviando || !rascunho.trim()}
                  onClick={() => void enviarWhatsapp()}
                >
                  <CdlIcon name="send" />
                </button>
              </div>
            )
          )}

          {modo === "email" && (
            !email ? (
              <div className="cdl-composer__note">Este lead não tem e-mail cadastrado.</div>
            ) : emailReady === false ? (
              <div className="cdl-composer__note">
                <span>O e-mail da empresa ainda não está configurado.</span>
                <button type="button" className="cdl-chip" onClick={onConfigureEmail}>Configurar e-mail</button>
              </div>
            ) : emailReady == null ? (
              <div className="cdl-composer__note">Verificando configuração de e-mail…</div>
            ) : emailPreview ? (
              <div className="cdl-preview">
                <span>Para {emailPreview.to || email} · {emailPreview.subject || "Sem assunto"}</span>
                <p>{emailPreview.text || "—"}</p>
                <div className="cdl-composer__row">
                  <button type="button" className="cdl-chip" disabled={emailBusy} onClick={gerarPreviaEmail}>Gerar de novo</button>
                  <button type="button" className="cdl-pop__go" disabled={emailBusy} onClick={enviarEmail}>
                    {emailBusy ? "Enviando…" : "Enviar e-mail"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="cdl-composer__row">
                <button type="button" className="cdl-pop__go" disabled={emailBusy} onClick={gerarPreviaEmail}>
                  {emailBusy ? "Gerando…" : "Gerar prévia de apresentação"}
                </button>
                <button type="button" className="cdl-chip" disabled={optOutBusy} onClick={registrarOptOut}>
                  {optOutBusy ? "Registrando…" : "Contato pediu remoção"}
                </button>
              </div>
            )
          )}

          {modo === "observacao" && (
            <div className="cdl-composer__body">
              <textarea
                value={nota}
                maxLength={280}
                placeholder="Registre o contexto importante deste lead…"
                aria-label="Observação do lead"
                onChange={(event) => setNota(event.target.value)}
              />
              <div className="cdl-composer__row">
                <span className="cdl-composer__grow" />
                <button type="button" className="cdl-pop__go" disabled={notaBusy || !nota.trim()} onClick={salvarObservacao}>
                  {notaBusy ? "Registrando…" : "Registrar observação"}
                </button>
              </div>
            </div>
          )}

          {modo === "atividade" && (
            <div className="cdl-composer__row">
              <select value={ativTipo} aria-label="Tipo da atividade" onChange={(event) => setAtivTipo(event.target.value)}>
                {TIPOS_ATIVIDADE.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <input
                className="cdl-composer__grow"
                maxLength={160}
                value={ativTitulo}
                placeholder="O que precisa ser feito?"
                aria-label="Título da atividade"
                onChange={(event) => setAtivTitulo(event.target.value)}
              />
              <input
                type="datetime-local"
                value={ativData}
                aria-label="Data da atividade"
                onChange={(event) => setAtivData(event.target.value)}
              />
              <button
                type="button"
                className="cdl-pop__go"
                disabled={ativBusy || !ativTitulo.trim() || !ativData}
                onClick={criarAtividade}
              >
                {ativBusy ? "Criando…" : "Criar"}
              </button>
            </div>
          )}
        </div>

        {(erroEnvio || emailMsg || notaMsg || ativMsg || copMsg) && (
          <span className={`cdl-msg-line${erroEnvio ? " is-err" : ""}`}>
            {erroEnvio || emailMsg || notaMsg || ativMsg || copMsg}
          </span>
        )}
      </footer>
    </main>
  );
}
