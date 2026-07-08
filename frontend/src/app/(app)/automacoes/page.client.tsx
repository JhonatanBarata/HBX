"use client";

// Tela AUTOMAÇÕES (WORM-13, v2 07/07) — a EMBALAGEM: o cliente não monta fluxo,
// ESCOLHE uma PERSONALIDADE de cadência (Conservador/Moderado/Agressivo). 3 abas:
//   - Cadências: 3 cards de persona + aplicar a uma lista de leads / pesquisa salva.
//   - Gatilhos (13b): "lead respondeu WhatsApp" → mover etapa / criar atividade / notificar.
//   - Rotinas (13c): "toda segunda puxa N leads da pesquisa Y pro vendedor Z" (WORM-15).
// v2 (console): as 3 fontes carregam JUNTAS na raiz → hero com números reais +
// chip do estado do motor; grades auto-fit preenchem a largura; estado vazio é
// vitrine com CTA. Contratos reais (todos sob /cadencia, gate de módulo 'vendas'):
//   GET/POST/PATCH/DELETE /cadencia            · POST /cadencia/:id/aplicar
//   GET/POST/PATCH/DELETE /cadencia/gatilhos
//   GET/POST/PATCH/DELETE /cadencia/rotinas
// Regra de chip: o WhatsApp da cadência é ESPAÇADO e só dispara com o runner ligado
// pelo dono (flag OFF por default) — a tela mostra esse estado, nunca "força" envio.
// Sem R$ nesta tela (LEI DO VENDEDOR não é acionada). Visual 100% em classe central.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Passo = { dia: number; canal: "whats" | "email" | "atividade"; titulo?: string; corpo?: string; atividadeTipo?: string };
type Cadencia = {
  id: string; nome: string; persona: string; descricao: string | null;
  passos: Passo[]; passosCount: number; whatsSteps: number; ativa: boolean; isSeed: boolean; inscritos?: number;
};
type CadenciaResponse = { ok?: boolean; canManage?: boolean; runnerEnabled?: boolean; cadencias?: Cadencia[] } | null;

type AcaoGatilho = { tipo: string; status?: string; titulo?: string; atividadeTipo?: string; diasVencimento?: number; mensagem?: string };
type Gatilho = { id: string; nome: string; evento: string; acoes: AcaoGatilho[]; ativo: boolean; fireCount: number; lastFiredAt: string | null };
type GatilhoResponse = { ok?: boolean; canManage?: boolean; gatilhos?: Gatilho[] } | null;

type Rotina = {
  id: string; nome: string; savedSearchId: string; assignedSellerId: number | null; everyWeeks: number; weekdays: number[];
  maxLeads: number; startsAt: string | null; endsAt: string | null; visibleOnlyToOwner: boolean; ativa: boolean;
  lastRunAt: string | null; lastRunCount: number | null; lastRunStatus: string | null;
};
type RotinaResponse = { ok?: boolean; canManage?: boolean; runnerEnabled?: boolean; rotinas?: Rotina[] } | null;

type SavedSearch = { id: string; nome: string };

const CANAL_META: Record<string, { label: string; icon: keyof typeof ICONS }> = {
  whats: { label: "WhatsApp", icon: "msg" },
  email: { label: "E-mail", icon: "mail" },
  atividade: { label: "Atividade", icon: "check" },
};
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const STATUS_OPTS = ["novo", "contato", "retorno", "qualificado", "encerrado"];
const PERSONA_CLASSES = new Set(["conservador", "moderado", "agressivo"]);

function canalLabel(canal: string) {
  return CANAL_META[canal]?.label || canal;
}
function diaLabel(dia: number) {
  return dia === 0 ? "Dia 0" : `Dia ${dia}`;
}
function personaClass(persona: string) {
  const key = String(persona || "").toLowerCase();
  return "persona-card--" + (PERSONA_CLASSES.has(key) ? key : "custom");
}

type Tab = "cadencias" | "gatilhos" | "rotinas";

// ================================================================
// RAIZ — carrega as 3 fontes em paralelo (hero + contagem nas abas)
// ================================================================
export function AutomacoesClient() {
  useCurrentUser();
  const [tab, setTab] = useState<Tab>("cadencias");
  const tabPill = useGlassPill<HTMLButtonElement>(tab);

  const [cad, setCad] = useState<CadenciaResponse>(null);
  const [gat, setGat] = useState<GatilhoResponse>(null);
  const [rot, setRot] = useState<RotinaResponse>(null);
  const [loading, setLoading] = useState(true);
  const [errCad, setErrCad] = useState<string | null>(null);
  const [errGat, setErrGat] = useState<string | null>(null);
  const [errRot, setErrRot] = useState<string | null>(null);

  const loadCad = useCallback(async () => {
    try { setCad(await apiFetch<CadenciaResponse>("/cadencia")); setErrCad(null); }
    catch (err) { setErrCad(err instanceof Error ? err.message : "Não foi possível carregar."); }
  }, []);
  const loadGat = useCallback(async () => {
    try { setGat(await apiFetch<GatilhoResponse>("/cadencia/gatilhos")); setErrGat(null); }
    catch (err) { setErrGat(err instanceof Error ? err.message : "Não foi possível carregar."); }
  }, []);
  const loadRot = useCallback(async () => {
    try { setRot(await apiFetch<RotinaResponse>("/cadencia/rotinas")); setErrRot(null); }
    catch (err) { setErrRot(err instanceof Error ? err.message : "Não foi possível carregar."); }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([loadCad(), loadGat(), loadRot()]).then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadCad, loadGat, loadRot]);

  const cadencias = cad?.cadencias ?? [];
  const gatilhos = gat?.gatilhos ?? [];
  const rotinas = rot?.rotinas ?? [];
  const runnerEnabled = Boolean(cad?.runnerEnabled ?? rot?.runnerEnabled ?? false);

  const stats = useMemo(() => ({
    cadAtivas: cadencias.filter((c) => c.ativa).length,
    inscritos: cadencias.reduce((s, c) => s + (c.inscritos ?? 0), 0),
    gatAtivos: gatilhos.filter((g) => g.ativo).length,
    rotAtivas: rotinas.filter((r) => r.ativa).length,
  }), [cadencias, gatilhos, rotinas]);

  return (
    <div className="work" style={{ flex: 1 }}>
      <header className="auto-hero">
        <div className="auto-hero__id">
          <span className="auto-hero__badge"><I d={ICONS.automacao} size={22} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="auto-hero__title">Automações</div>
            <div className="auto-hero__sub">Cadências, gatilhos e rotinas trabalhando o funil por você — no ritmo seguro do chip.</div>
          </div>
        </div>
        <div className="auto-hero__stats">
          <div className={"auto-stat" + (stats.cadAtivas ? " is-hot" : "")}>
            <span className="auto-stat__n">{loading ? "—" : stats.cadAtivas}</span>
            <span className="auto-stat__l">Cadências ativas</span>
          </div>
          <div className={"auto-stat" + (stats.inscritos ? " is-hot" : "")}>
            <span className="auto-stat__n">{loading ? "—" : stats.inscritos}</span>
            <span className="auto-stat__l">Leads em cadência</span>
          </div>
          <div className={"auto-stat" + (stats.gatAtivos ? " is-hot" : "")}>
            <span className="auto-stat__n">{loading ? "—" : stats.gatAtivos}</span>
            <span className="auto-stat__l">Gatilhos ativos</span>
          </div>
          <div className={"auto-stat" + (stats.rotAtivas ? " is-hot" : "")}>
            <span className="auto-stat__n">{loading ? "—" : stats.rotAtivas}</span>
            <span className="auto-stat__l">Rotinas ativas</span>
          </div>
        </div>
        <div className="auto-engine">
          <span className={"auto-engine__chip " + (runnerEnabled ? "is-on" : "is-off")}>
            <span className="auto-engine__dot" />
            {runnerEnabled ? "Disparo automático ATIVO" : "Disparo em espera"}
          </span>
          <span className="auto-engine__hint">
            {runnerEnabled
              ? "Passos devidos disparam sozinhos, com teto diário de WhatsApp por empresa."
              : "Inscrever leads já funciona; os passos só disparam quando o suporte liga o motor."}
          </span>
        </div>
      </header>

      <div className="auto-tabs glass-pill-track">
        <GlassPill {...tabPill} />
        <button ref={tabPill.itemRef("cadencias")} className={"auto-tab" + (tab === "cadencias" ? " is-active" : "")} onClick={() => setTab("cadencias")}>
          <I d={ICONS.send} size={15} /> Cadências
          <span className="auto-tab__n">{cadencias.length}</span>
        </button>
        <button ref={tabPill.itemRef("gatilhos")} className={"auto-tab" + (tab === "gatilhos" ? " is-active" : "")} onClick={() => setTab("gatilhos")}>
          <I d={ICONS.bolt} size={15} /> Gatilhos
          <span className="auto-tab__n">{gatilhos.length}</span>
        </button>
        <button ref={tabPill.itemRef("rotinas")} className={"auto-tab" + (tab === "rotinas" ? " is-active" : "")} onClick={() => setTab("rotinas")}>
          <I d={ICONS.clock} size={15} /> Rotinas
          <span className="auto-tab__n">{rotinas.length}</span>
        </button>
      </div>

      {tab === "cadencias" && <CadenciasTab data={cad} loading={loading} error={errCad} reload={loadCad} />}
      {tab === "gatilhos" && <GatilhosTab data={gat} loading={loading} error={errGat} reload={loadGat} />}
      {tab === "rotinas" && <RotinasTab data={rot} loading={loading} error={errRot} reload={loadRot} runnerEnabled={runnerEnabled} />}
    </div>
  );
}

function LoadErrorPanel({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="panel">
      <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
        <strong>Não carregou</strong>
        <span className="hint">{error}</span>
        <button className="btn-ghost" onClick={retry}>Tentar novamente</button>
      </div>
    </section>
  );
}

// ================================================================
// 13a — CADÊNCIAS (personas)
// ================================================================
function CadenciasTab({ data, loading, error, reload }: {
  data: CadenciaResponse; loading: boolean; error: string | null; reload: () => Promise<void>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<Cadencia | null>(null);

  const cadencias = data?.cadencias ?? [];
  const canManage = data?.canManage ?? false;

  async function toggleAtiva(c: Cadencia) {
    try {
      await apiFetch(`/cadencia/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify({ ativa: !c.ativa }) });
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falhou.");
    }
  }

  return (
    <>
      <div className="auto-bar">
        <span className="hint">Escolha uma personalidade de cadência e aplique a uma lista de leads — o ritmo de toques segue sozinho.</span>
        {msg && <span className="link">{msg}</span>}
      </div>

      {error && <LoadErrorPanel error={error} retry={() => void reload()} />}

      {!error && loading && !data && (
        <div className="persona-grid">
          {[0, 1, 2].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && cadencias.length === 0 && (
        <div className="auto-empty">
          <span className="auto-empty__icon"><I d={ICONS.send} size={26} /></span>
          <h4>Nenhuma cadência ainda</h4>
          <p>As personalidades padrão são criadas automaticamente na primeira visita. Recarregue a tela — se não aparecerem, chame o suporte.</p>
          <button className="btn-ghost" onClick={() => void reload()}>Recarregar</button>
        </div>
      )}

      <div className="persona-grid">
        {cadencias.map((c) => (
          <div key={c.id} className={"persona-card " + personaClass(c.persona) + (c.ativa ? "" : " is-inactive")}>
            <div className="persona-card__head">
              <span className="persona-card__badge"><I d={ICONS.automacao} size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="persona-card__title">{c.nome}</div>
                <div className="persona-card__persona">{c.persona}</div>
              </div>
            </div>
            {c.descricao && <p className="persona-card__desc">{c.descricao}</p>}

            <div className="persona-card__touches">
              {(["whats", "email", "atividade"] as const).map((canal) => {
                const n = c.passos.filter((p) => p.canal === canal).length;
                if (!n) return null;
                return (
                  <span key={canal} className={"touch-badge" + (canal === "whats" ? " is-whats" : "")}>
                    <I d={ICONS[CANAL_META[canal].icon]} size={12} /> {n} {canalLabel(canal)}
                  </span>
                );
              })}
            </div>

            <div className="step-flow">
              {c.passos.map((p, idx) => (
                <div key={idx} className="step-row">
                  <span className="step-row__day">{diaLabel(p.dia)}</span>
                  <span className="step-row__node"><I d={ICONS[CANAL_META[p.canal]?.icon || "check"]} size={15} /></span>
                  <span className="step-row__body">
                    <span className="step-row__label">{p.titulo || canalLabel(p.canal)}</span>
                    {p.corpo && <span className="step-row__text">{p.corpo}</span>}
                  </span>
                </div>
              ))}
            </div>

            <div className="persona-card__foot">
              <span className="persona-card__count"><b>{c.inscritos ?? 0}</b><span>lead{(c.inscritos ?? 0) === 1 ? "" : "s"} dentro</span></span>
              {canManage && (
                <>
                  <button className="btn-ghost btn-xs" onClick={() => toggleAtiva(c)}>{c.ativa ? "Desativar" : "Ativar"}</button>
                  <button className="btn-teal btn-xs" onClick={() => { setAplicando(c); setMsg(null); }} disabled={!c.ativa}>
                    <I d={ICONS.send} size={12} /> Aplicar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {aplicando && (
        <AplicarModal
          cadencia={aplicando}
          onClose={() => setAplicando(null)}
          onDone={(txt) => { setAplicando(null); setMsg(txt); void reload(); }}
        />
      )}
    </>
  );
}

function AplicarModal({ cadencia, onClose, onDone }: { cadencia: Cadencia; onClose: () => void; onDone: (msg: string) => void }) {
  const [modo, setModo] = useState<"lista" | "pesquisa">("lista");
  const modoPill = useGlassPill<HTMLButtonElement>(modo);
  const [leadIdsRaw, setLeadIdsRaw] = useState("");
  const [savedSearchId, setSavedSearchId] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ searches?: SavedSearch[] }>("/saved-search")
      .then((r) => setSearches(r?.searches ?? []))
      .catch(() => setSearches([]));
  }, []);

  async function aplicar() {
    setError(null);
    const body: Record<string, unknown> = {};
    if (modo === "lista") {
      const ids = leadIdsRaw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return setError("Cole ao menos um ID de card (lead).");
      body.leadIds = ids;
    } else {
      if (!savedSearchId) return setError("Escolha uma pesquisa salva.");
      body.savedSearchId = savedSearchId;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ inscritos?: number; jaInscritos?: number; total?: number }>(
        `/cadencia/${encodeURIComponent(cadencia.id)}/aplicar`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onDone(`✓ ${res?.inscritos ?? 0} lead(s) inscrito(s)${res?.jaInscritos ? ` · ${res.jaInscritos} já estavam` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={() => !busy && onClose()}>
      <div className="hbx-modal" style={{ width: "min(460px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          Aplicar: {cadencia.nome}
          <button className="btn-ghost btn-xs" onClick={onClose} disabled={busy}>Fechar</button>
        </h3>
        <div className="auto-form" style={{ marginTop: 14 }}>
          <div className="auto-tabs glass-pill-track">
            <GlassPill {...modoPill} />
            <button ref={modoPill.itemRef("lista")} className={"auto-tab" + (modo === "lista" ? " is-active" : "")} onClick={() => setModo("lista")}>Lista de leads</button>
            <button ref={modoPill.itemRef("pesquisa")} className={"auto-tab" + (modo === "pesquisa" ? " is-active" : "")} onClick={() => setModo("pesquisa")}>Pesquisa salva</button>
          </div>

          {modo === "lista" ? (
            <div className="auto-form__row">
              <label className="field-label" htmlFor="apl-ids">IDs dos cards (um por linha ou separados por vírgula)</label>
              <textarea id="apl-ids" className="field-dark" rows={4} value={leadIdsRaw} onChange={(e) => setLeadIdsRaw(e.target.value)} placeholder="Cole os IDs dos cards do funil" />
            </div>
          ) : (
            <div className="auto-form__row">
              <label className="field-label" htmlFor="apl-search">Pesquisa salva (WORM-15)</label>
              <select id="apl-search" className="field-dark" value={savedSearchId} onChange={(e) => setSavedSearchId(e.target.value)}>
                <option value="">Selecione…</option>
                {searches.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <span className="hint">Inscreve os leads do funil que batem com o filtro (cidade/segmento) da pesquisa.</span>
            </div>
          )}

          {error && <span className="link">{error}</span>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal" onClick={aplicar} disabled={busy}>{busy ? "Aplicando…" : "Aplicar cadência"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 13b — GATILHOS (QUANDO → ENTÃO)
// ================================================================
const ACAO_META: Record<string, { icon: keyof typeof ICONS }> = {
  mover_status: { icon: "arrow" },
  criar_atividade: { icon: "agenda" },
  notificar_vendedor: { icon: "bell" },
};

function acaoLabel(a: AcaoGatilho): string {
  if (a.tipo === "mover_status") return `mover p/ ${a.status}`;
  if (a.tipo === "criar_atividade") return `criar atividade (${a.atividadeTipo || "ligacao"})`;
  if (a.tipo === "notificar_vendedor") return "notificar vendedor";
  return a.tipo;
}

function GatilhosTab({ data, loading, error, reload }: {
  data: GatilhoResponse; loading: boolean; error: string | null; reload: () => Promise<void>;
}) {
  const [novo, setNovo] = useState(false);

  const gatilhos = data?.gatilhos ?? [];
  const canManage = data?.canManage ?? false;

  async function toggle(g: Gatilho) {
    await apiFetch(`/cadencia/gatilhos/${encodeURIComponent(g.id)}`, { method: "PATCH", body: JSON.stringify({ ativo: !g.ativo }) }).catch(() => null);
    await reload();
  }
  async function remover(g: Gatilho) {
    await apiFetch(`/cadencia/gatilhos/${encodeURIComponent(g.id)}`, { method: "DELETE" }).catch(() => null);
    await reload();
  }

  return (
    <>
      <div className="auto-bar">
        <span className="hint">Quando o lead responde no WhatsApp, dispara ações no funil — sem enviar mensagem automática.</span>
        {canManage && gatilhos.length > 0 && (
          <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Novo gatilho</button>
        )}
      </div>

      {error && <LoadErrorPanel error={error} retry={() => void reload()} />}

      {!error && loading && !data && (
        <div className="auto-grid">
          {[0, 1].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && gatilhos.length === 0 && (
        <div className="auto-empty">
          <span className="auto-empty__icon"><I d={ICONS.bolt} size={26} /></span>
          <h4>Nenhum gatilho ainda</h4>
          <p>Gatilho é o reflexo do funil: o lead respondeu no WhatsApp e o sistema reage na hora — move a etapa, cria a atividade de retorno e avisa o vendedor. Nada de lead respondido ficar esquecido.</p>
          <div className="auto-empty__demo">
            <span className="auto-chip"><I d={ICONS.msg} size={12} /> Lead responde</span>
            <I d={ICONS.arrow} size={13} />
            <span className="auto-chip"><I d={ICONS.arrow} size={12} /> mover p/ retorno</span>
            <span className="auto-chip"><I d={ICONS.bell} size={12} /> notificar vendedor</span>
          </div>
          {canManage && (
            <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Criar meu primeiro gatilho</button>
          )}
        </div>
      )}

      {gatilhos.length > 0 && (
        <div className="auto-grid">
          {gatilhos.map((g) => (
            <div key={g.id} className={"auto-card" + (g.ativo ? "" : " is-inactive")}>
              <div className="auto-card__head">
                <span className="auto-card__ico"><I d={ICONS.bolt} size={16} /></span>
                <span className="auto-card__title">{g.nome}</span>
                <span className={"auto-state" + (g.ativo ? " is-on" : "")}>{g.ativo ? "Ativo" : "Pausado"}</span>
              </div>

              <div className="auto-rule">
                <span className="auto-rule__k">Quando</span>
                <span className="auto-rule__v">
                  <I d={ICONS.msg} size={14} />
                  {g.evento === "lead_respondeu_whatsapp" ? "Lead responde no WhatsApp" : "E-mail é lido"}
                </span>
              </div>
              <span className="auto-connector"><I d={ICONS.chevronDown} size={14} /></span>
              <div className="auto-rule is-then">
                <span className="auto-rule__k">Então</span>
                <div className="auto-rule__chips">
                  {g.acoes.length === 0 && <span className="auto-chip">sem ações</span>}
                  {g.acoes.map((a, i) => (
                    <span key={i} className="auto-chip">
                      <I d={ICONS[ACAO_META[a.tipo]?.icon || "check"]} size={12} /> {acaoLabel(a)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="auto-card__meta">
                <span>Disparos <b>{g.fireCount}</b></span>
                {g.lastFiredAt && <span>Último <b>{new Date(g.lastFiredAt).toLocaleDateString("pt-BR")}</b></span>}
              </div>

              {canManage && (
                <div className="auto-card__foot">
                  <button className="btn-ghost btn-xs" onClick={() => toggle(g)}>{g.ativo ? "Desativar" : "Ativar"}</button>
                  <button className="btn-ghost btn-xs danger" onClick={() => remover(g)}>Remover</button>
                </div>
              )}
            </div>
          ))}
          {canManage && (
            <button type="button" className="auto-add-card" onClick={() => setNovo(true)}>
              <I d={ICONS.plus} size={22} />
              <b>Novo gatilho</b>
              <span>Reaja na hora quando um lead responder no WhatsApp.</span>
            </button>
          )}
        </div>
      )}

      {novo && <NovoGatilhoModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); void reload(); }} />}
    </>
  );
}

function NovoGatilhoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState("");
  const [moverStatus, setMoverStatus] = useState("");
  const [criarAtiv, setCriarAtiv] = useState(false);
  const [notificar, setNotificar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar() {
    setError(null);
    if (!nome.trim()) return setError("Dê um nome ao gatilho.");
    const acoes: AcaoGatilho[] = [];
    if (moverStatus) acoes.push({ tipo: "mover_status", status: moverStatus });
    if (criarAtiv) acoes.push({ tipo: "criar_atividade", titulo: "Retornar contato", atividadeTipo: "ligacao", diasVencimento: 1 });
    if (notificar) acoes.push({ tipo: "notificar_vendedor", titulo: "Lead respondeu" });
    if (!acoes.length) return setError("Escolha ao menos uma ação.");
    setBusy(true);
    try {
      await apiFetch("/cadencia/gatilhos", {
        method: "POST",
        body: JSON.stringify({ nome: nome.trim(), evento: "lead_respondeu_whatsapp", acoes }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={() => !busy && onClose()}>
      <div className="hbx-modal" style={{ width: "min(460px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          Novo gatilho
          <button className="btn-ghost btn-xs" onClick={onClose} disabled={busy}>Fechar</button>
        </h3>
        <div className="auto-form" style={{ marginTop: 14 }}>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="g-nome">Nome</label>
            <input id="g-nome" className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Respondeu no WhatsApp" />
          </div>
          <span className="hint">Quando o lead responder no WhatsApp:</span>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="g-status">Mover para etapa</label>
            <select id="g-status" className="field-dark" value={moverStatus} onChange={(e) => setMoverStatus(e.target.value)}>
              <option value="">Não mover</option>
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={criarAtiv} onChange={(e) => setCriarAtiv(e.target.checked)} /> Criar atividade de retorno (amanhã)
          </label>
          <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} /> Notificar o vendedor
          </label>
          {error && <span className="link">{error}</span>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Criar gatilho"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 13c — ROTINAS (agenda semanal visual)
// ================================================================
function RotinasTab({ data, loading, error, reload, runnerEnabled }: {
  data: RotinaResponse; loading: boolean; error: string | null; reload: () => Promise<void>; runnerEnabled: boolean;
}) {
  const [novo, setNovo] = useState(false);

  const rotinas = data?.rotinas ?? [];
  const canManage = data?.canManage ?? false;

  async function toggle(r: Rotina) {
    await apiFetch(`/cadencia/rotinas/${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify({ ativa: !r.ativa }) }).catch(() => null);
    await reload();
  }
  async function remover(r: Rotina) {
    await apiFetch(`/cadencia/rotinas/${encodeURIComponent(r.id)}`, { method: "DELETE" }).catch(() => null);
    await reload();
  }

  return (
    <>
      <div className="auto-bar">
        <span className="hint">Recorrência sobre uma pesquisa salva: puxa leads pro funil nos dias escolhidos.</span>
        {canManage && rotinas.length > 0 && (
          <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Nova rotina</button>
        )}
      </div>

      {!runnerEnabled && rotinas.length > 0 && (
        <div className="auto-flag-note"><I d={ICONS.clock} size={15} /> Rotinas só rodam quando o motor está ligado pelo suporte.</div>
      )}

      {error && <LoadErrorPanel error={error} retry={() => void reload()} />}

      {!error && loading && !data && (
        <div className="auto-grid">
          {[0, 1].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && rotinas.length === 0 && (
        <div className="auto-empty">
          <span className="auto-empty__icon"><I d={ICONS.clock} size={26} /></span>
          <h4>Nenhuma rotina ainda</h4>
          <p>Rotina é o abastecimento automático do funil: toda segunda (ou nos dias que você marcar) ela puxa até N leads de uma pesquisa salva e entrega pro vendedor — sem ninguém precisar lembrar.</p>
          <div className="auto-empty__demo">
            <span className="auto-chip"><I d={ICONS.clock} size={12} /> Toda segunda</span>
            <I d={ICONS.arrow} size={13} />
            <span className="auto-chip"><I d={ICONS.search} size={12} /> Pesquisa salva</span>
            <I d={ICONS.arrow} size={13} />
            <span className="auto-chip"><I d={ICONS.vendas} size={12} /> 50 leads no funil</span>
          </div>
          {canManage && (
            <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Criar minha primeira rotina</button>
          )}
        </div>
      )}

      {rotinas.length > 0 && (
        <div className="auto-grid">
          {rotinas.map((r) => (
            <div key={r.id} className={"auto-card" + (r.ativa ? "" : " is-inactive")}>
              <div className="auto-card__head">
                <span className="auto-card__ico"><I d={ICONS.clock} size={16} /></span>
                <span className="auto-card__title">{r.nome}</span>
                <span className={"auto-state" + (r.ativa ? " is-on" : "")}>{r.ativa ? "Ativa" : "Pausada"}</span>
              </div>

              <div className="rot-week" title={r.weekdays.map((d) => WEEKDAY_FULL[d]).join(", ") || "Sem dias"}>
                {WEEKDAY_LABELS.map((lbl, d) => (
                  <span key={d} className={"rot-day" + (r.weekdays.includes(d) ? " is-on" : "")}>{lbl}</span>
                ))}
              </div>

              <div className="auto-card__meta">
                <span>Até <b>{r.maxLeads}</b> leads por execução</span>
                {r.everyWeeks > 1 && <span>a cada <b>{r.everyWeeks}</b> semanas</span>}
              </div>
              <div className="auto-card__meta">
                {r.lastRunAt ? (
                  <span className={"rot-status " + (r.lastRunStatus === "erro" ? "is-err" : "is-ok")}>
                    Última execução <b>{new Date(r.lastRunAt).toLocaleDateString("pt-BR")}</b> ({r.lastRunCount ?? 0} leads)
                  </span>
                ) : (
                  <span className="rot-status">Nunca rodou</span>
                )}
              </div>

              {canManage && (
                <div className="auto-card__foot">
                  <button className="btn-ghost btn-xs" onClick={() => toggle(r)}>{r.ativa ? "Desativar" : "Ativar"}</button>
                  <button className="btn-ghost btn-xs danger" onClick={() => remover(r)}>Remover</button>
                </div>
              )}
            </div>
          ))}
          {canManage && (
            <button type="button" className="auto-add-card" onClick={() => setNovo(true)}>
              <I d={ICONS.plus} size={22} />
              <b>Nova rotina</b>
              <span>Abasteça o funil sozinho nos dias que você escolher.</span>
            </button>
          )}
        </div>
      )}

      {novo && <NovaRotinaModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); void reload(); }} />}
    </>
  );
}

function NovaRotinaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState("");
  const [savedSearchId, setSavedSearchId] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [everyWeeks, setEveryWeeks] = useState(1);
  const [maxLeads, setMaxLeads] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ searches?: SavedSearch[] }>("/saved-search")
      .then((r) => setSearches(r?.searches ?? []))
      .catch(() => setSearches([]));
  }, []);

  function toggleDay(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function salvar() {
    setError(null);
    if (!nome.trim()) return setError("Dê um nome à rotina.");
    if (!savedSearchId) return setError("Escolha uma pesquisa salva.");
    if (!weekdays.length) return setError("Escolha ao menos um dia da semana.");
    setBusy(true);
    try {
      await apiFetch("/cadencia/rotinas", {
        method: "POST",
        body: JSON.stringify({ nome: nome.trim(), savedSearchId, weekdays, everyWeeks, maxLeads }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={() => !busy && onClose()}>
      <div className="hbx-modal" style={{ width: "min(480px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          Nova rotina
          <button className="btn-ghost btn-xs" onClick={onClose} disabled={busy}>Fechar</button>
        </h3>
        <div className="auto-form" style={{ marginTop: 14 }}>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="r-nome">Nome</label>
            <input id="r-nome" className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Carga automática segunda-feira" />
          </div>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="r-search">Pesquisa salva (WORM-15)</label>
            <select id="r-search" className="field-dark" value={savedSearchId} onChange={(e) => setSavedSearchId(e.target.value)}>
              <option value="">Selecione…</option>
              {searches.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div className="auto-form__row">
            <span className="field-label">Dias da semana</span>
            <div className="auto-weekdays">
              {WEEKDAY_LABELS.map((lbl, d) => (
                <button key={d} type="button" className={"auto-weekday" + (weekdays.includes(d) ? " is-on" : "")} onClick={() => toggleDay(d)} title={WEEKDAY_FULL[d]}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="auto-form__row" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="r-every">Repete a cada (semanas)</label>
              <input id="r-every" type="number" min={1} max={12} className="field-dark" value={everyWeeks} onChange={(e) => setEveryWeeks(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="auto-form__row" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="r-max">Máx. leads por execução</label>
              <input id="r-max" type="number" min={1} max={200} className="field-dark" value={maxLeads} onChange={(e) => setMaxLeads(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>
          {error && <span className="link">{error}</span>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Criar rotina"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
