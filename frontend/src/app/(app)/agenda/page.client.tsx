"use client";

// Tela AGENDA do vendedor (WORM-12) — "o que eu faço hoje". Contratos reais:
//   - GET  /atividades/agenda?janela=&tipo=&incluirConcluidas= → { atrasadas, hoje, semana }
//   - POST /atividades                         → cria (leadId, tipo, titulo, vencimento)
//   - POST /atividades/:id/concluir            → 1 tap + resultado (sim|nao|remarcar)
//   - DELETE /atividades/:id                   → remove
// Seções: ATRASADAS (destaque perigo, --hbx-danger), HOJE, SEMANA. Concluir = 1 tap;
// abre a pergunta "atendeu? sim / não / remarcar" (reusa .btn-result central).
// Sem valor R$ nesta tela (LEI DO VENDEDOR não é acionada: atividade não tem preço).

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Atividade = {
  id: string;
  leadId: string;
  tipo: string;
  titulo: string;
  vencimento: string | null;
  duracao: number | null;
  diaInteiro: boolean;
  responsavelId: number | null;
  realizadaEm: string | null;
  resultado: string | null;
  pendente: boolean;
  atrasada: boolean;
  criadaPor: string;
};

type AgendaResponse = {
  ok?: boolean;
  counts?: { atrasadas: number; hoje: number; semana: number };
  atrasadas?: Atividade[];
  hoje?: Atividade[];
  semana?: Atividade[];
} | null;

const TIPO_META: Record<string, { label: string; icon: keyof typeof ICONS }> = {
  ligacao: { label: "Ligação", icon: "atend" },
  reuniao: { label: "Reunião", icon: "users" },
  visita: { label: "Visita", icon: "search" },
  mensagem: { label: "Mensagem", icon: "msg" },
};

const TIPOS = ["ligacao", "reuniao", "visita", "mensagem"] as const;

function tipoLabel(tipo: string) {
  return TIPO_META[tipo]?.label || tipo;
}

function fmtVenc(iso: string | null, diaInteiro: boolean) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (diaInteiro) return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// input datetime-local → ISO (mantém o fuso local do vendedor).
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function defaultVencInput(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AgendaClient() {
  useCurrentUser();
  const [data, setData] = useState<AgendaResponse>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tipoFilter, setTipoFilter] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  // Conclusão: qual atividade está com a pergunta de resultado aberta.
  const [concluindo, setConcluindo] = useState<Atividade | null>(null);
  const [remarcarInput, setRemarcarInput] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Nova atividade (modal simples).
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaLeadId, setNovaLeadId] = useState("");
  const [novaTitulo, setNovaTitulo] = useState("");
  const [novaTipo, setNovaTipo] = useState<string>("ligacao");
  const [novaVenc, setNovaVenc] = useState<string>(defaultVencInput());
  const [novaBusy, setNovaBusy] = useState(false);
  const [novaError, setNovaError] = useState<string | null>(null);

  const load = useCallback((tipo: string) => {
    setLoading(true);
    const qs = tipo ? `?tipo=${encodeURIComponent(tipo)}` : "";
    return apiFetch<AgendaResponse>(`/atividades/agenda${qs}`)
      .then((res) => {
        setData(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        const e = err as Error & { status?: number };
        setLoadError(e?.message || "Não foi possível carregar a agenda.");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(tipoFilter);
  }, [load, tipoFilter]);

  const atrasadas = data?.atrasadas || [];
  const hoje = data?.hoje || [];
  const semana = data?.semana || [];
  const total = atrasadas.length + hoje.length + semana.length;

  async function concluir(atividade: Atividade, resultado: "sim" | "nao" | "remarcar") {
    if (busyId) return;
    if (resultado === "remarcar" && !remarcarInput) {
      setMsg("Escolha a nova data para remarcar.");
      return;
    }
    setBusyId(atividade.id);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { resultado };
      if (resultado === "remarcar") body.remarcarPara = localInputToIso(remarcarInput);
      await apiFetch(`/atividades/${encodeURIComponent(atividade.id)}/concluir`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg(
        resultado === "remarcar"
          ? "✓ Atividade remarcada."
          : resultado === "sim"
            ? "✓ Concluída — atendeu."
            : "✓ Concluída — sem interesse.",
      );
      setConcluindo(null);
      setRemarcarInput("");
      await load(tipoFilter);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setBusyId(null);
    }
  }

  async function remover(atividade: Atividade) {
    if (busyId) return;
    setBusyId(atividade.id);
    setMsg(null);
    try {
      await apiFetch(`/atividades/${encodeURIComponent(atividade.id)}`, { method: "DELETE" });
      setMsg("✓ Atividade removida.");
      await load(tipoFilter);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  }

  async function criarNova() {
    if (novaBusy) return;
    setNovaError(null);
    const iso = localInputToIso(novaVenc);
    if (!novaLeadId.trim()) return setNovaError("Informe o ID do card (lead).");
    if (!novaTitulo.trim()) return setNovaError("Informe o título da atividade.");
    if (!iso) return setNovaError("Vencimento inválido.");
    setNovaBusy(true);
    try {
      await apiFetch(`/atividades`, {
        method: "POST",
        body: JSON.stringify({
          leadId: novaLeadId.trim(),
          titulo: novaTitulo.trim(),
          tipo: novaTipo,
          vencimento: iso,
        }),
      });
      setNovaOpen(false);
      setNovaLeadId("");
      setNovaTitulo("");
      setNovaTipo("ligacao");
      setNovaVenc(defaultVencInput());
      setMsg("✓ Atividade criada.");
      await load(tipoFilter);
    } catch (err) {
      setNovaError(err instanceof Error ? err.message : "Não foi possível criar a atividade.");
    } finally {
      setNovaBusy(false);
    }
  }

  const secoes = useMemo(
    () => [
      { key: "atrasadas", label: "Atrasadas", itens: atrasadas, danger: true },
      { key: "hoje", label: "Hoje", itens: hoje, danger: false },
      { key: "semana", label: "Próximas (semana)", itens: semana, danger: false },
    ],
    [atrasadas, hoje, semana],
  );

  return (
    <div className="work" style={{ flex: 1 }}>
      {/* Barra de topo: contadores + filtro por tipo + nova atividade. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            className="badge-win"
            style={atrasadas.length ? { color: "var(--hbx-danger)", borderColor: "color-mix(in srgb, var(--hbx-danger) 40%, transparent)", background: "color-mix(in srgb, var(--hbx-danger) 12%, transparent)" } : undefined}
          >
            {atrasadas.length} atrasada{atrasadas.length === 1 ? "" : "s"}
          </span>
          <span className="badge-win">{hoje.length} hoje</span>
          <span className="badge-win">{semana.length} na semana</span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
          <button className={"btn-ghost btn-xs"} onClick={() => setTipoFilter("")}
            style={tipoFilter === "" ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : undefined}>
            Todos
          </button>
          {TIPOS.map((t) => (
            <button key={t} className="btn-ghost btn-xs" onClick={() => setTipoFilter(t)}
              style={tipoFilter === t ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : undefined}>
              {tipoLabel(t)}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {msg && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-brand-strong)" }}>{msg}</span>}
          <button className="btn-teal" onClick={() => setNovaOpen(true)}>
            <I d={ICONS.plus} size={13} /> Nova atividade
          </button>
        </div>
      </div>

      {loadError && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
            <strong style={{ fontSize: "0.86rem", color: "var(--hbx-danger)" }}>A agenda não carregou</strong>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{loadError}</span>
            <button className="btn-ghost" onClick={() => load(tipoFilter)}>Tentar novamente</button>
          </div>
        </section>
      )}

      {!loadError && !loading && total === 0 && (
        <section className="panel">
          <div style={{ padding: 24, display: "grid", gap: 8, justifyItems: "start" }}>
            <strong style={{ fontSize: "0.9rem", color: "var(--text-strong)" }}>Nada na agenda</strong>
            <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Sem tarefas pendentes. Crie uma atividade a partir de um card ou pelo botão “Nova atividade”.
            </span>
          </div>
        </section>
      )}

      {secoes.map((sec) =>
        sec.itens.length === 0 ? null : (
          <section className="panel" key={sec.key}>
            <div className="panel-head">
              <h2 style={sec.danger ? { color: "var(--hbx-danger)" } : undefined}>{sec.label}</h2>
              <div className="meta"><span>{sec.itens.length}</span></div>
            </div>
            <div style={{ display: "grid", gap: 8, padding: "10px 16px 16px" }}>
              {sec.itens.map((a) => {
                const aberto = concluindo?.id === a.id;
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-hairline)",
                      background: sec.danger ? "color-mix(in srgb, var(--hbx-danger) 6%, transparent)" : "var(--hbx-surface)",
                      borderColor: sec.danger ? "color-mix(in srgb, var(--hbx-danger) 35%, transparent)" : "var(--border-hairline)",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: sec.danger ? "var(--hbx-danger)" : "var(--text-body)" }}>
                        <I d={ICONS[TIPO_META[a.tipo]?.icon || "clock"]} size={14} />
                        <span style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>{tipoLabel(a.tipo)}</span>
                      </span>
                      <strong style={{ fontSize: "0.85rem", color: "var(--text-strong)" }}>{a.titulo}</strong>
                      {a.criadaPor !== "user" && (
                        <span className="badge-win" style={{ fontSize: "0.56rem" }}>{a.criadaPor === "ia" ? "IA" : "Automação"}</span>
                      )}
                      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 700, color: sec.danger ? "var(--hbx-danger)" : "var(--text-muted)" }}>
                        <I d={ICONS.clock} size={12} /> {fmtVenc(a.vencimento, a.diaInteiro)}
                        {a.duracao != null && <span style={{ color: "var(--text-muted)" }}> · {a.duracao}min</span>}
                      </span>
                    </div>

                    {!aberto && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-teal btn-xs" onClick={() => { setConcluindo(a); setRemarcarInput(""); setMsg(null); }} disabled={busyId === a.id}>
                          <I d={ICONS.check} size={12} /> Concluir
                        </button>
                        <button className="btn-ghost btn-xs danger" onClick={() => remover(a)} disabled={busyId === a.id}>
                          Remover
                        </button>
                      </div>
                    )}

                    {aberto && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-strong)" }}>Como foi? Atendeu?</span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <button className="btn-result btn-result--ok" onClick={() => concluir(a, "sim")} disabled={busyId === a.id}>Sim</button>
                          <button className="btn-result btn-result--cold" onClick={() => concluir(a, "nao")} disabled={busyId === a.id}>Não</button>
                          <button className="btn-result" onClick={() => concluir(a, "remarcar")} disabled={busyId === a.id}>Remarcar</button>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label className="field-label" htmlFor={`remarcar-${a.id}`}>Nova data (p/ remarcar)</label>
                          <input
                            id={`remarcar-${a.id}`}
                            type="datetime-local"
                            className="field-dark"
                            style={{ width: "auto" }}
                            value={remarcarInput}
                            onChange={(e) => setRemarcarInput(e.target.value)}
                          />
                          <button className="btn-ghost btn-xs" onClick={() => { setConcluindo(null); setRemarcarInput(""); }} disabled={busyId === a.id}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ),
      )}

      {/* Modal central (pela classe .hbx-veil — Lei nº2). Nova atividade avulsa. */}
      {novaOpen && (
        <div className="hbx-veil" onClick={() => !novaBusy && setNovaOpen(false)}>
          <div className="hbx-modal" style={{ width: "min(440px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <h3>
              Nova atividade
              <button className="btn-ghost btn-xs" onClick={() => setNovaOpen(false)} disabled={novaBusy}>Fechar</button>
            </h3>
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <div style={{ display: "grid", gap: 5 }}>
                <label className="field-label" htmlFor="nova-lead">ID do card (lead)</label>
                <input id="nova-lead" className="field-dark" value={novaLeadId} onChange={(e) => setNovaLeadId(e.target.value)} placeholder="Cole o ID do card" />
              </div>
              <div style={{ display: "grid", gap: 5 }}>
                <label className="field-label" htmlFor="nova-titulo">Título</label>
                <input id="nova-titulo" className="field-dark" value={novaTitulo} onChange={(e) => setNovaTitulo(e.target.value)} placeholder="Ex.: Ligar para retorno" />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 5 }}>
                  <label className="field-label" htmlFor="nova-tipo">Tipo</label>
                  <select id="nova-tipo" className="field-dark" style={{ width: "auto" }} value={novaTipo} onChange={(e) => setNovaTipo(e.target.value)}>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>{tipoLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gap: 5, flex: 1 }}>
                  <label className="field-label" htmlFor="nova-venc">Vencimento</label>
                  <input id="nova-venc" type="datetime-local" className="field-dark" value={novaVenc} onChange={(e) => setNovaVenc(e.target.value)} />
                </div>
              </div>
              {novaError && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--hbx-danger)" }}>{novaError}</span>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn-ghost" onClick={() => setNovaOpen(false)} disabled={novaBusy}>Cancelar</button>
                <button className="btn-teal" onClick={criarNova} disabled={novaBusy}>{novaBusy ? "Criando…" : "Criar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
