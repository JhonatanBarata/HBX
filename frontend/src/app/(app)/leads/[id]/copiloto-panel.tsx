"use client";

// LEADS-FINAL/05 — COPILOTO NO LEAD (front). Painel no topo do miolo da página do
// lead com 3 ações da IA local (rascunho/resumo/próxima ação). Naming NOSSO
// ("Copiloto"), não "Assistente IA".
//
// GUARDRAILS DUROS (do plano):
//  - NUNCA envia WhatsApp: "Rascunhar resposta" só PREENCHE o campo de digitação
//    (via onDraft); quem aperta enviar é o humano.
//  - 1 clique = 1 chamada; sem loop, sem polling; falha = "Copiloto indisponível"
//    e a tela segue 100% funcional (a IA é acessório).
//  - No cockpit de Vendas, coleta as últimas mensagens somente pela fachada GET
//    canônica do lead. Sem conversa = histórico vazio; nunca cria/muta conversa.
//  - Desligar a flag (HBX_COPILOTO_ENABLED) → o pai nem monta este painel.

import { useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

export type CopilotoFicha = {
  nome?: string | null;
  razaoSocial?: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  segmento?: string | null;
  cidade?: string | null;
  uf?: string | null;
  situacao?: string | null;
};

type CopilotoMensagem = { direcao: string; texto: string };

type RascunhoResp = { ok?: boolean; rascunho?: string; error?: string };
type ResumoResp = { ok?: boolean; bullets?: string[]; error?: string };
type SugestaoResp = { ok?: boolean; titulo?: string; prazoDias?: number; tipo?: string; motivo?: string; error?: string };

type ConvoMsg = { direction?: string; content?: string | null };
type ConvoMessagesResponse = { messages?: ConvoMsg[] };

type Acao = "rascunho" | "resumo" | "sugestao";

const TIPO_LABEL: Record<string, string> = {
  ligacao: "ligação",
  whatsapp: "WhatsApp",
  email: "e-mail",
  reuniao: "reunião",
  visita: "visita",
};

export function CopilotoPanel({
  leadId,
  ficha,
  onDraft,
  onSaveNote,
}: {
  leadId: string;
  ficha: CopilotoFicha;
  // Preenche o campo de digitação do WhatsApp (NUNCA envia).
  onDraft: (text: string) => void;
  // Salva como anotação — reusa o POST radar/leads/:id/event { eventType:'note' }.
  onSaveNote: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<Acao | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string[] | null>(null);
  const [sugestao, setSugestao] = useState<{ titulo: string; prazoDias: number; tipo: string; motivo: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // Coleta best-effort das últimas mensagens pela leitura pura do Vendas.
  // Falha/sem conversa → [] (a IA rascunha/sugere só com a ficha). Zero envio.
  async function gatherMensagens(): Promise<CopilotoMensagem[]> {
    try {
      const res = await apiFetch<ConvoMessagesResponse>(
        `/vendas/lead/${encodeURIComponent(leadId)}/conversation/messages?limit=20`,
      );
      const msgs = Array.isArray(res?.messages) ? res.messages : [];
      return msgs
        .map((m) => ({ direcao: m.direction === "outbound" ? "voce" : "lead", texto: String(m.content || "").trim() }))
        .filter((m) => m.texto);
    } catch {
      return [];
    }
  }

  async function rascunhar() {
    if (busy) return;
    setBusy("rascunho");
    setError(null);
    try {
      const mensagens = await gatherMensagens();
      const res = await apiFetch<RascunhoResp>("/assistente/copiloto/rascunho", {
        method: "POST",
        body: JSON.stringify({ mensagens, ficha }),
      });
      if (res?.ok && res.rascunho) {
        onDraft(res.rascunho);
      } else {
        setError(res?.error || "Copiloto indisponível.");
      }
    } catch {
      setError("Copiloto indisponível.");
    } finally {
      setBusy(null);
    }
  }

  async function resumir() {
    if (busy) return;
    setBusy("resumo");
    setError(null);
    setResumo(null);
    setSaveMsg(null);
    try {
      const mensagens = await gatherMensagens();
      const res = await apiFetch<ResumoResp>("/assistente/copiloto/resumo", {
        method: "POST",
        body: JSON.stringify({ mensagens, ficha }),
      });
      if (res?.ok && Array.isArray(res.bullets) && res.bullets.length) {
        setResumo(res.bullets);
      } else {
        setError(res?.error || "Copiloto indisponível.");
      }
    } catch {
      setError("Copiloto indisponível.");
    } finally {
      setBusy(null);
    }
  }

  async function sugerir() {
    if (busy) return;
    setBusy("sugestao");
    setError(null);
    setSugestao(null);
    setSaveMsg(null);
    try {
      const mensagens = await gatherMensagens();
      const res = await apiFetch<SugestaoResp>("/assistente/copiloto/sugestao", {
        method: "POST",
        body: JSON.stringify({ mensagens, ficha }),
      });
      if (res?.ok && res.titulo) {
        setSugestao({
          titulo: res.titulo,
          prazoDias: Number(res.prazoDias ?? 0),
          tipo: String(res.tipo || "ligacao"),
          motivo: String(res.motivo || ""),
        });
      } else {
        setError(res?.error || "Copiloto indisponível.");
      }
    } catch {
      setError("Copiloto indisponível.");
    } finally {
      setBusy(null);
    }
  }

  async function salvarResumo() {
    if (!resumo || saveBusy) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const texto = ["Resumo (Copiloto):", ...resumo.map((b) => `• ${b}`)].join("\n");
      await onSaveNote(texto);
      setResumo(null);
      setSaveMsg("Salvo nas anotações.");
    } catch {
      setSaveMsg("Não consegui salvar.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function salvarSugestao() {
    if (!sugestao || saveBusy) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const via = TIPO_LABEL[sugestao.tipo] || sugestao.tipo;
      const prazo = sugestao.prazoDias <= 0 ? "hoje" : `em ${sugestao.prazoDias} dia(s)`;
      const texto = [
        `Próxima ação sugerida (Copiloto): ${sugestao.titulo}`,
        `Quando: ${prazo} · Via: ${via}`,
        sugestao.motivo ? `Motivo: ${sugestao.motivo}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await onSaveNote(texto);
      setSugestao(null);
      setSaveMsg("Salvo nas anotações.");
    } catch {
      setSaveMsg("Não consegui salvar.");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="copiloto">
      <div className="copiloto__head">
        <span className="copiloto__spark" aria-hidden="true">
          <I d={ICONS.bolt} size={15} />
        </span>
        <h3 className="copiloto__title">Copiloto</h3>
        <button
          type="button"
          className="btn-ghost btn-xs copiloto__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? "Recolher Copiloto" : "Abrir Copiloto"}
        >
          {open ? "Recolher" : "Abrir"}
        </button>
      </div>

      {open && (
        <div className="copiloto__body">
          <div className="copiloto__actions">
            <button type="button" className="btn-ghost btn-xs" onClick={rascunhar} disabled={Boolean(busy)}>
              {busy === "rascunho" ? "Rascunhando…" : "Rascunhar resposta"}
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={resumir} disabled={Boolean(busy)}>
              {busy === "resumo" ? "Resumindo…" : "Resumir conversa"}
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={sugerir} disabled={Boolean(busy)}>
              {busy === "sugestao" ? "Pensando…" : "Próxima ação"}
            </button>
          </div>

          {error && <div className="dn-convo__err copiloto__err">{error}</div>}

          {resumo && (
            <div className="copiloto__result">
              <ul className="copiloto__bullets">
                {resumo.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className="copiloto__result-foot">
                {saveMsg && <span className="muted-note copiloto__savemsg">{saveMsg}</span>}
                <button type="button" className="btn-teal btn-xs" onClick={salvarResumo} disabled={saveBusy}>
                  {saveBusy ? "Salvando…" : "Salvar como anotação"}
                </button>
              </div>
            </div>
          )}

          {sugestao && (
            <div className="copiloto__result">
              <div className="copiloto__sugestao">
                <strong>{sugestao.titulo}</strong>
                <span className="hint">
                  {sugestao.prazoDias <= 0 ? "Hoje" : `Em ${sugestao.prazoDias} dia(s)`}
                  {" · "}
                  {TIPO_LABEL[sugestao.tipo] || sugestao.tipo}
                </span>
                {sugestao.motivo && <span className="muted-note copiloto__motivo">{sugestao.motivo}</span>}
              </div>
              <div className="copiloto__result-foot">
                {saveMsg && <span className="muted-note copiloto__savemsg">{saveMsg}</span>}
                <button type="button" className="btn-teal btn-xs" onClick={salvarSugestao} disabled={saveBusy}>
                  {saveBusy ? "Salvando…" : "Salvar como anotação"}
                </button>
              </div>
            </div>
          )}

          {!error && !resumo && !sugestao && saveMsg && (
            <span className="muted-note copiloto__savemsg">{saveMsg}</span>
          )}
        </div>
      )}
    </div>
  );
}
