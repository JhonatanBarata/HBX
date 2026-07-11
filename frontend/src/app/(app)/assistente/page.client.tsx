"use client";

// WORM-14 — ASSISTENTE IA. A EXPERIENCIA de criar/testar um assistente sem
// programar (o motor ja existe e e gratis: IA local via Ollama, mesmo pipeline
// do bot). Tres momentos:
//   1. WIZARD 3 passos: (a) nome + tom + preview de frase; (b) perfil
//      Vendas x Suporte + produtos + empresa; (c) template Agil/Flexivel/Avancado.
//   2. FLUXO EM TRILHO vertical (v1, SEM canvas): mensagem -> condicao, com
//      EXEMPLOS editaveis por condicao ("frases que significam SIM" = few-shots).
//   3. CELULAR DE TESTE ("Teste sua IA"): o MESMO <WhatsAppPreview> do bot —
//      o dono conversa com o assistente como o cliente veria no WhatsApp, SEM
//      tocar chip nenhum (zero WhatsApp). Numera o teste (Teste nº) como eles.
// Contratos reais (todos sob /assistente, gate de modulo 'bot'):
//   GET /assistente · GET /assistente/templates?perfil · POST /assistente
//   POST /assistente/sandbox · POST /assistente/publish
// Publicar no chip fica atras de flag (default OFF) — a tela mostra o estado.
// Visual 100% em classe central (assistente.css + whatsapp.css) — zero hex/inline.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import { apiFetch } from "@/lib/api";

// ── Tipos (espelham o backend) ───────────────────────────────────────────────
type Tom = "formal" | "normal" | "descontraido";
type Perfil = "vendas" | "suporte";
type FluxoPasso = { id: string; tipo: "mensagem"; texto: string };
type FluxoCondicao = { id: string; rotulo: string; comportamento: string; exemplos: string[]; proximoPassoId?: string | null };
type Fluxo = { entradaPassoId?: string | null; passos: FluxoPasso[]; condicoes: FluxoCondicao[] };
type Assistente = {
  id: string; nome: string; tom: Tom; perfil: Perfil; produtos: string; empresaNome: string;
  fluxo: Fluxo; published: boolean; testCounter: number;
};
type GetResponse = { ok?: boolean; publishEnabled?: boolean; assistente: Assistente | null } | null;
type TemplateItem = { key: "agil" | "flexivel" | "avancado"; label: string; passos: number; condicoes: number; fluxo: Fluxo };

const TONS: { key: Tom; title: string; desc: string; frase: string }[] = [
  { key: "formal", title: "Formal", desc: "Respeitoso, sem gírias", frase: "Olá! Como posso ajudá-lo hoje? Fico à disposição para atendê-lo." },
  { key: "normal", title: "Normal", desc: "Cordial e direto", frase: "Oi! Tudo bem? Me conta como posso te ajudar." },
  { key: "descontraido", title: "Descontraído", desc: "Leve e amigável", frase: "E aí! Bora resolver isso rapidinho? 😄 Me diz o que você precisa!" },
];
const PERFIS: { key: Perfil; title: string; desc: string }[] = [
  { key: "vendas", title: "Vendas", desc: "Desperta interesse e conduz para o próximo passo" },
  { key: "suporte", title: "Suporte", desc: "Entende o problema e ajuda ou encaminha" },
];
const TPL_ICONS: Record<TemplateItem["key"], string[]> = {
  agil: ICONS.bolt,
  flexivel: ICONS.arrow,
  avancado: ICONS.crown,
};

function emptyFluxo(): Fluxo { return { entradaPassoId: null, passos: [], condicoes: [] }; }

function nowTime(): string {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

export function AssistenteClient() {
  const user = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [publishEnabled, setPublishEnabled] = useState(false);
  const [assistente, setAssistente] = useState<Assistente | null>(null);
  // "wizard" enquanto nao ha assistente OU o usuario clicou em refazer; "editor" depois.
  const [mode, setMode] = useState<"wizard" | "editor">("wizard");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<GetResponse>("/assistente");
      setPublishEnabled(Boolean(res?.publishEnabled));
      if (res?.assistente) {
        setAssistente(res.assistente);
        setMode("editor");
      } else {
        setAssistente(null);
        setMode("wizard");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar, não estado derivado.
  useEffect(() => { void load(); }, [load]);

  const empresaPadrao = user?.company?.name || "";

  return (
    <div className="work ia-work">
      <div className="ia-wrap">
        <div className="ia-head">
          <span className="ia-head__badge"><I d={ICONS.assistente} size={20} /></span>
          <div>
            <div className="ia-head__title">Assistente IA</div>
            <div className="ia-head__sub">Crie um assistente com nome e personalidade — e teste sem gastar chip.</div>
          </div>
          <span className="ia-hot">Novo</span>
        </div>

        {msg && <div className="auto-flag-note"><I d={ICONS.help} size={14} />{msg}</div>}

        {loading ? (
          <div className="hint">Carregando…</div>
        ) : mode === "wizard" ? (
          <Wizard
            empresaPadrao={empresaPadrao}
            onCancel={assistente ? () => setMode("editor") : undefined}
            onCreated={(a) => { setAssistente(a); setMode("editor"); setMsg(null); }}
          />
        ) : assistente ? (
          <Editor
            assistente={assistente}
            publishEnabled={publishEnabled}
            onRefazer={() => setMode("wizard")}
            onSaved={(a) => setAssistente(a)}
          />
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// WIZARD — 3 passos
// ============================================================================
function Wizard({ empresaPadrao, onCreated, onCancel }: {
  empresaPadrao: string;
  onCreated: (a: Assistente) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [tom, setTom] = useState<Tom>("normal");
  const [perfil, setPerfil] = useState<Perfil>("vendas");
  const [produtos, setProdutos] = useState("");
  const [empresaNome, setEmpresaNome] = useState(empresaPadrao);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateKey, setTemplateKey] = useState<TemplateItem["key"]>("agil");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stepPill = useGlassPill<HTMLSpanElement>(String(step));
  const tomPill = useGlassPill<HTMLButtonElement>(tom);
  const perfilPill = useGlassPill<HTMLButtonElement>(perfil);
  const tplPill = useGlassPill<HTMLButtonElement>(templateKey, templates.length);

  // carrega os seeds do perfil escolhido (passo 3)
  useEffect(() => {
    let alive = true;
    apiFetch<{ templates?: TemplateItem[] }>(`/assistente/templates?perfil=${encodeURIComponent(perfil)}`)
      .then((res) => { if (alive) setTemplates(res?.templates ?? []); })
      .catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, [perfil]);

  const fraseExemplo = useMemo(() => TONS.find((t) => t.key === tom)?.frase ?? "", [tom]);
  const canNext1 = nome.trim().length >= 2;

  async function finalizar() {
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch<{ ok?: boolean; assistente: Assistente }>("/assistente", {
        method: "POST",
        body: JSON.stringify({ nome, tom, perfil, produtos, empresaNome, template: templateKey }),
      });
      if (res?.assistente) onCreated(res.assistente);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel ia-form-panel">
      <div className="ia-steps">
        <GlassPill {...stepPill} />
        {[1, 2, 3].map((n, i) => (
          <React.Fragment key={n}>
            {i > 0 && <span className="ia-step-sep" />}
            <span ref={step === n ? stepPill.itemRef(String(n)) : undefined}
              className={"ia-step-pill" + (step === n ? " is-active" : step > n ? " is-done" : "")}>
              <span className="ia-step-pill__num">{step > n ? "✓" : n}</span>
              {n === 1 ? "Identidade" : n === 2 ? "Negócio" : "Fluxo inicial"}
            </span>
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="ia-form">
          <div className="ia-field">
            <label className="field-label">Nome do assistente</label>
            <input className="field-dark" maxLength={60} placeholder="Ex.: Júlia, Leonardo, Bia…"
              value={nome} onChange={(e) => setNome(e.target.value)} />
            <span className="ia-field__hint">Seus clientes vão conversar com esse nome — dá personalidade e retenção.</span>
          </div>
          <div className="ia-field">
            <label className="field-label">Estilo de comunicação</label>
            <div className="ia-choice-row">
              <GlassPill {...tomPill} />
              {TONS.map((t) => (
                <button key={t.key} ref={tomPill.itemRef(t.key)} type="button" className={"ia-choice" + (tom === t.key ? " is-on" : "")} onClick={() => setTom(t.key)}>
                  <span className="ia-choice__title">{t.title}</span>
                  <span className="ia-choice__desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ia-field">
            <label className="field-label">Como soa no WhatsApp</label>
            <div className="ia-style-preview">
              <div className="wa-msg wa-msg--in">
                <div className="wa-bubble">
                  <span className="wa-bubble__text">{fraseExemplo}</span>
                  <span className="wa-bubble__meta"><span className="wa-bubble__time">{nowTime()}</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="ia-actions">
            {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancelar</button>}
            <button className="btn-teal ia-spacer" disabled={!canNext1} onClick={() => setStep(2)}>Continuar</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="ia-form">
          <div className="ia-field">
            <label className="field-label">Perfil do assistente</label>
            <div className="ia-choice-row">
              <GlassPill {...perfilPill} />
              {PERFIS.map((p) => (
                <button key={p.key} ref={perfilPill.itemRef(p.key)} type="button" className={"ia-choice" + (perfil === p.key ? " is-on" : "")} onClick={() => setPerfil(p.key)}>
                  <span className="ia-choice__title">{p.title}</span>
                  <span className="ia-choice__desc">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ia-form__grid">
            <div className="ia-field">
              <label className="field-label">Nome da empresa</label>
              <input className="field-dark" maxLength={120} placeholder="Ex.: Colsani Ar-Condicionado"
                value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} />
            </div>
          </div>
          <div className="ia-field">
            <label className="field-label">Produtos ou serviços</label>
            <textarea className="field-dark" rows={3} maxLength={600} placeholder="Ex.: instalação e manutenção de ar-condicionado, PMOC, contratos para empresas…"
              value={produtos} onChange={(e) => setProdutos(e.target.value)} />
            <span className="ia-field__hint">O assistente usa isso para falar do que vocês vendem — não invente o que não estiver aqui.</span>
          </div>
          <div className="ia-actions">
            <button className="btn-ghost" onClick={() => setStep(1)}>Voltar</button>
            <button className="btn-teal ia-spacer" onClick={() => setStep(3)}>Continuar</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="ia-form">
          <div className="ia-field">
            <label className="field-label">Escolha um modelo de fluxo</label>
            <span className="ia-field__hint">Começa pronto — você ajusta cada mensagem e condição na próxima tela.</span>
          </div>
          <div className="ia-tpl-grid">
            <GlassPill {...tplPill} />
            {templates.map((t) => (
              <button key={t.key} ref={tplPill.itemRef(t.key)} type="button" className={"ia-tpl-card" + (templateKey === t.key ? " is-on" : "")} onClick={() => setTemplateKey(t.key)}>
                <span className="ia-tpl-card__icon"><I d={TPL_ICONS[t.key]} size={17} /></span>
                <span className="ia-tpl-card__name">{t.label}</span>
                <span className="ia-tpl-card__meta">{t.passos} mensagem{t.passos > 1 ? "s" : ""} · {t.condicoes} condiç{t.condicoes > 1 ? "ões" : "ão"}</span>
                <span className="ia-tpl-card__desc">
                  {t.key === "agil" ? "Abertura direta com uma condição — rápido de configurar."
                    : t.key === "flexivel" ? "Abertura + resposta guiada com caminhos alternativos."
                    : "Fluxo completo: abertura, aprofundamento, fechamento e desvios."}
                </span>
              </button>
            ))}
          </div>
          {err && <div className="auto-flag-note"><I d={ICONS.help} size={14} />{err}</div>}
          <div className="ia-actions">
            <button className="btn-ghost" onClick={() => setStep(2)}>Voltar</button>
            <button className="btn-teal ia-spacer" disabled={saving} onClick={finalizar}>
              {saving ? "Criando…" : "Criar assistente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EDITOR — fluxo em trilho + celular de teste
// ============================================================================
function Editor({ assistente, publishEnabled, onRefazer, onSaved }: {
  assistente: Assistente;
  publishEnabled: boolean;
  onRefazer: () => void;
  onSaved: (a: Assistente) => void;
}) {
  const [fluxo, setFluxo] = useState<Fluxo>(assistente.fluxo || emptyFluxo());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(assistente.published);
  const [note, setNote] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza o editor quando a prop `assistente` muda; efeito legítimo
  useEffect(() => { setFluxo(assistente.fluxo || emptyFluxo()); setPublished(assistente.published); }, [assistente]);

  const mutate = useCallback((next: Fluxo) => { setFluxo(next); setDirty(true); }, []);

  function updatePasso(id: string, texto: string) {
    mutate({ ...fluxo, passos: fluxo.passos.map((p) => (p.id === id ? { ...p, texto } : p)) });
  }
  function addPasso() {
    const id = `passo_${Date.now().toString(36)}`;
    mutate({ ...fluxo, passos: [...fluxo.passos, { id, tipo: "mensagem", texto: "" }] });
  }
  function removePasso(id: string) {
    mutate({ ...fluxo, passos: fluxo.passos.filter((p) => p.id !== id) });
  }
  function updateCond(id: string, patch: Partial<FluxoCondicao>) {
    mutate({ ...fluxo, condicoes: fluxo.condicoes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function addCond() {
    const id = `cond_${Date.now().toString(36)}`;
    mutate({ ...fluxo, condicoes: [...fluxo.condicoes, { id, rotulo: "Nova condição", comportamento: "", exemplos: [] }] });
  }
  function removeCond(id: string) {
    mutate({ ...fluxo, condicoes: fluxo.condicoes.filter((c) => c.id !== id) });
  }
  function addExemplo(condId: string, frase: string) {
    const f = frase.trim();
    if (!f) return;
    const c = fluxo.condicoes.find((x) => x.id === condId);
    if (!c || c.exemplos.includes(f)) return;
    updateCond(condId, { exemplos: [...c.exemplos, f] });
  }
  function removeExemplo(condId: string, frase: string) {
    const c = fluxo.condicoes.find((x) => x.id === condId);
    if (!c) return;
    updateCond(condId, { exemplos: c.exemplos.filter((e) => e !== frase) });
  }

  async function salvar() {
    setSaving(true);
    setNote(null);
    try {
      const res = await apiFetch<{ ok?: boolean; assistente: Assistente }>("/assistente", {
        method: "POST",
        body: JSON.stringify({
          nome: assistente.nome, tom: assistente.tom, perfil: assistente.perfil,
          produtos: assistente.produtos, empresaNome: assistente.empresaNome, fluxo,
        }),
      });
      if (res?.assistente) { onSaved(res.assistente); setDirty(false); setNote("Fluxo salvo."); }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    try {
      const res = await apiFetch<{ ok?: boolean; published?: boolean; publishEnabled?: boolean; message?: string }>("/assistente/publish", {
        method: "POST",
        body: JSON.stringify({ on: !published }),
      });
      if (res?.message) setNote(res.message);
      setPublished(Boolean(res?.published));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível publicar.");
    }
  }

  return (
    <>
      <div className="ia-toolbar">
        <span className="ia-toolbar__avatar">{(assistente.nome || "A").trim().charAt(0).toUpperCase()}</span>
        <div className="ia-toolbar__id">
          <span className="ia-toolbar__name">{assistente.nome}</span>
          <span className="ia-toolbar__meta">
            {assistente.perfil === "vendas" ? "Vendas" : "Suporte"} · {assistente.empresaNome || "empresa"}
          </span>
        </div>
        <span className={"ia-pub-pill" + (published ? " is-on" : "")}>
          <I d={published ? ICONS.check : ICONS.edit} size={11} />
          {published ? "Publicado no chip" : "Rascunho"}
        </span>
        <div className="ia-toolbar__actions">
          <button className="btn-ghost btn-xs" onClick={onRefazer}>Refazer no assistente</button>
          <button className="btn-ghost btn-xs" disabled={saving || !dirty} onClick={salvar}>{saving ? "Salvando…" : "Salvar fluxo"}</button>
          <button className={"btn-teal btn-xs" + (published ? " danger" : "")} onClick={togglePublish}>
            {published ? "Desativar no chip" : "Publicar no chip"}
          </button>
        </div>
      </div>
      {!publishEnabled && (
        <div className="auto-flag-note">
          <I d={ICONS.help} size={14} />
          Publicação no chip está desligada nesta instalação (liberada pelo responsável). Teste à vontade no sandbox — nada é enviado no WhatsApp.
        </div>
      )}
      {note && <div className="auto-flag-note"><I d={ICONS.check} size={14} />{note}</div>}

      <div className="ia-split has-chat">
        <div className="ia-flow">
          <div className="ia-rail">
            <div className="ia-rail__sec">
              <span className="ia-rail__sec-tag"><I d={ICONS.msg} size={12} /> Mensagens</span>
              <span className="ia-rail__sec-sub">o que {assistente.nome} fala, na ordem</span>
            </div>
            {fluxo.passos.map((p, i) => (
              <div key={p.id} className="ia-rail__item">
                <span className="ia-rail__dot">{i + 1}</span>
                <div className="ia-flow-node">
                  <div className="ia-flow-node__head">
                    <span className="ia-flow-node__tag">Mensagem {i + 1}</span>
                    <span className="ia-flow-node__title">para o cliente</span>
                    <div className="ia-flow-node__actions">
                      <button className="btn-ghost btn-xs danger" onClick={() => removePasso(p.id)} aria-label="Remover mensagem"><I d={ICONS.trash} size={13} /></button>
                    </div>
                  </div>
                  <div className="ia-flow-node__body">
                    <textarea className="field-dark" rows={2} maxLength={1500} placeholder="Escreva a mensagem. Use [[Seu nome]] e [[nome da empresa]]."
                      value={p.texto} onChange={(e) => updatePasso(p.id, e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
            <div className="ia-rail__item is-add">
              <span className="ia-rail__dot is-add"><I d={ICONS.plus} size={12} /></span>
              <button className="ia-rail__add" onClick={addPasso}>Adicionar mensagem</button>
            </div>
          </div>

          <div className="ia-rail is-cond">
            <div className="ia-rail__sec">
              <span className="ia-rail__sec-tag is-cond"><I d={ICONS.filter} size={12} /> Condições</span>
              <span className="ia-rail__sec-sub">como interpretar a resposta do cliente</span>
            </div>
            {fluxo.condicoes.map((c) => (
              <div key={c.id} className="ia-rail__item">
                <span className="ia-rail__dot is-cond"><I d={ICONS.reply} size={12} /></span>
                <CondicaoEditor
                  cond={c}
                  passos={fluxo.passos}
                  onChange={(patch) => updateCond(c.id, patch)}
                  onRemove={() => removeCond(c.id)}
                  onAddExemplo={(frase) => addExemplo(c.id, frase)}
                  onRemoveExemplo={(frase) => removeExemplo(c.id, frase)}
                />
              </div>
            ))}
            <div className="ia-rail__item is-add">
              <span className="ia-rail__dot is-add is-cond"><I d={ICONS.plus} size={12} /></span>
              <button className="ia-rail__add" onClick={addCond}>Adicionar condição</button>
            </div>
          </div>
        </div>

        <SandboxChat assistente={assistente} liveFluxo={fluxo} />
      </div>
    </>
  );
}

function CondicaoEditor({ cond, passos, onChange, onRemove, onAddExemplo, onRemoveExemplo }: {
  cond: FluxoCondicao;
  passos: FluxoPasso[];
  onChange: (patch: Partial<FluxoCondicao>) => void;
  onRemove: () => void;
  onAddExemplo: (frase: string) => void;
  onRemoveExemplo: (frase: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="ia-flow-node">
      <div className="ia-flow-node__head">
        <span className="ia-flow-node__tag is-cond">Condição</span>
        <input className="field-dark" maxLength={120} value={cond.rotulo}
          onChange={(e) => onChange({ rotulo: e.target.value })} placeholder="Ex.: Cliente confirmou" />
        <div className="ia-flow-node__actions">
          <button className="btn-ghost btn-xs danger" onClick={onRemove} aria-label="Remover condição"><I d={ICONS.trash} size={13} /></button>
        </div>
      </div>
      <div className="ia-flow-node__body">
        <div className="ia-field">
          <label className="field-label">Comportamento esperado</label>
          <input className="field-dark" maxLength={400} value={cond.comportamento}
            onChange={(e) => onChange({ comportamento: e.target.value })} placeholder="O que o cliente demonstra nessa resposta" />
        </div>
        <div className="ia-field">
          <label className="field-label">Frases que significam isso</label>
          <div className="ia-fewshots">
            {cond.exemplos.map((ex) => (
              <span key={ex} className="ia-fewshot">{ex}
                <button onClick={() => onRemoveExemplo(ex)} aria-label="Remover exemplo"><I d={ICONS.x} size={11} /></button>
              </span>
            ))}
          </div>
          <div className="ia-fewshot-add">
            <input className="field-dark" value={draft} maxLength={200} placeholder='Ex.: "quero sim", "pode falar"'
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { onAddExemplo(draft); setDraft(""); } }} />
            <button className="btn-ghost btn-xs" onClick={() => { onAddExemplo(draft); setDraft(""); }} aria-label="Adicionar exemplo"><I d={ICONS.plus} size={13} /></button>
          </div>
        </div>
        {passos.length > 1 && (
          <div className="ia-field">
            <label className="field-label">Próximo passo quando casar</label>
            <select className="field-dark" value={cond.proximoPassoId ?? ""} onChange={(e) => onChange({ proximoPassoId: e.target.value || null })}>
              <option value="">— seguir a conversa —</option>
              {passos.map((p, i) => <option key={p.id} value={p.id}>Mensagem {i + 1}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SANDBOX — "Teste sua IA" num celular WhatsApp fiel (<WhatsAppPreview>, o
// mesmo do bot). NUNCA envia WhatsApp real (backend garante: dispatched=false).
// ============================================================================
const SOURCE_LABEL: Record<string, string> = {
  ia: "respondido pela IA local",
  roteiro: "abertura do roteiro (sem IA)",
  fallback: "roteiro de reserva — IA indisponível",
};

function SandboxChat({ assistente, liveFluxo }: { assistente: Assistente; liveFluxo: Fluxo }) {
  const [msgs, setMsgs] = useState<WAMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastTestNo, setLastTestNo] = useState<number | null>(null);
  const [lastSource, setLastSource] = useState<{ source: string; ms: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    // Historico p/ o backend: só balões reais (sem notas de sistema).
    const history = msgs
      .filter((m) => !m.system)
      .map((m) => ({ role: m.dir === "out" ? "user" : "assistant", content: m.text }));
    setMsgs((prev) => [...prev, { dir: "out", text, time: nowTime(), status: "read" }]);
    setBusy(true);
    scrollDown();
    try {
      const res = await apiFetch<{ ok?: boolean; testNumber?: number; reply?: string; source?: string; latencyMs?: number; dispatched?: boolean }>("/assistente/sandbox", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          history,
          // Testa o FLUXO EM EDICAO (mesmo antes de salvar).
          config: {
            nome: assistente.nome, tom: assistente.tom, perfil: assistente.perfil,
            produtos: assistente.produtos, empresaNome: assistente.empresaNome, fluxo: liveFluxo,
          },
        }),
      });
      setLastTestNo(res?.testNumber ?? null);
      setLastSource(res?.source ? { source: res.source, ms: res.latencyMs ?? 0 } : null);
      setMsgs((prev) => [...prev, { dir: "in", text: res?.reply || "…", time: nowTime() }]);
    } catch (e) {
      setMsgs((prev) => [...prev, { dir: "in", system: true, tone: "red", text: e instanceof Error ? e.message : "Falhou." }]);
      setLastSource(null);
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  const srcLabel = lastSource
    ? (SOURCE_LABEL[lastSource.source] || lastSource.source) + (lastSource.source === "ia" && lastSource.ms > 0 ? ` · ${(lastSource.ms / 1000).toFixed(1)}s` : "")
    : null;

  return (
    <div className="ia-chat-dock">
      <div className="ia-chat-dock__bar">
        <I d={ICONS.smile} size={15} />
        <span className="ia-chat-dock__title">Teste sua IA</span>
        <span className="ia-chat-dock__no">{lastTestNo != null ? `Teste nº ${lastTestNo}` : ""}</span>
        <span className="ia-chat-dock__safe"><I d={ICONS.check} size={11} /> Sem chip</span>
      </div>

      <WhatsAppPreview
        className="ia-chat-phone"
        messages={msgs}
        typing={busy}
        bodyRef={bodyRef}
        header={{ name: assistente.nome, status: "online" }}
        emptyHint={`Mande um "oi" para ver a ${assistente.nome} responder. Nenhuma mensagem sai para o WhatsApp.`}
        footer={
          <form className="wa-composer-row" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input
              className="field-dark wa-composer-input"
              value={input}
              placeholder="Escreva como um cliente…"
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              aria-label="Mensagem de teste"
            />
            <button type="submit" className="wa-send" disabled={busy || !input.trim()} aria-label="Enviar">
              <I d={ICONS.send} size={16} />
            </button>
          </form>
        }
      />

      <div className="ia-chat-dock__src">
        {srcLabel ? <><I d={ICONS.bolt} size={11} /> {srcLabel}</> : "O teste roda a IA local — nada é enviado no WhatsApp."}
      </div>
    </div>
  );
}
