"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function buildWhatsAppUrl(phone?: string | null, leadName?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const message = leadName
    ? `Olá, ${leadName}. Estou retomando nosso contato pelo HBX.`
    : "Olá. Estou retomando nosso contato pelo HBX.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

export default function PremiumVendas() {
  const hasToken = useRequireAuth();
  const [board, setBoard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

  async function loadBoard() {
    setError(null);
    setLoading(true);
    try {
      const payload = await apiFetch("/vendas/board");
      setBoard(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    void loadBoard();
  }, [hasToken]);

  const dates = useMemo(() => {
    const out: { iso: string; label: string }[] = [];
    const today = new Date();
    for (let i = -3; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      out.push({ iso: d.toISOString().slice(0, 10), label });
    }
    // default select today
    if (!selectedDateIso) setSelectedDateIso(out[3].iso);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leads = useMemo(() => {
    if (!board) return [] as any[];
    const arr: any[] = [];
    for (const key of Object.keys(board.blocks || {})) {
      for (const lead of board.blocks[key] || []) arr.push(lead);
    }
    return arr;
  }, [board]);

  function toIsoDate(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  const todayIso = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.toISOString().slice(0, 10);
  }, []);

  const overdueLeads = useMemo(() => {
    return leads.filter((l: any) => {
      const r = toIsoDate(l.returnAt);
      return r ? r < todayIso : false;
    });
  }, [leads, todayIso]);

  const filteredLeads = useMemo(() => {
    if (!selectedDateIso) return [] as any[];
    return leads.filter((l: any) => toIsoDate(l.returnAt) === selectedDateIso);
  }, [leads, selectedDateIso]);

  async function patchLead(leadId: string, patch: any) {
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${leadId}`, { method: "PATCH", body: JSON.stringify(patch) });
      await loadBoard();
      setSelectedLead((prev: any) => (prev && prev.id === leadId ? null : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function formatShortDate(value?: string | null) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  function buildClientValue(lead: any) {
    if (lead.attemptCount && lead.attemptCount > 0) return `${lead.attemptCount} interações hoje`;
    if (lead.lastResult) return String(lead.lastResult).slice(0, 40);
    return "Sem interações recentes";
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Vendas" description="Carregando sessão do CRM comercial.">
        <section className="p-6">Carregando...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Vendas" description="Central inteligente (Premium UI)">
      <div className="min-h-screen bg-transparent text-foreground">
        <div className="relative z-10 px-6 py-6 md:px-10 lg:px-12">
          <header className="mb-8 flex flex-col gap-6 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-xl shadow-[0_0_80px_rgba(0,0,0,0.35)] lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-cyan-200">
                Atendimento Premium
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">Central inteligente de clientes e operações</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">Painel com foco em distribuição limpa dos cartões e visão detalhada por cliente.</p>
            </div>

            <div className="grid grid-cols-3 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right shadow-lg">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Total ativos</div>
                <div className="mt-1 text-lg font-semibold text-white md:text-xl">{board?.summary?.total ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right shadow-lg">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Atrasados</div>
                <div className="mt-1 text-lg font-semibold text-white md:text-xl">{board?.summary?.overdue ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right shadow-lg">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Hoje</div>
                <div className="mt-1 text-lg font-semibold text-white md:text-xl">{board?.summary?.today ?? 0}</div>
              </div>
            </div>
          </header>

          <section className="mb-8 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Filtro interativo</div>
                <h2 className="mt-1 text-lg font-medium text-white">Datas no topo, compactas e elegantes</h2>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Hoje selecionado</div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {dates.map((d, index) => (
                <button
                  key={d.iso}
                  className={`group min-w-[92px] rounded-2xl border px-4 py-3 text-left transition-all duration-300 ${
                    d.iso === selectedDateIso
                      ? "border-cyan-300/30 bg-cyan-300/15 shadow-[0_0_24px_rgba(34,211,238,0.18)]"
                      : "border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/10"
                  }`}
                  onClick={() => setSelectedDateIso(d.iso)}
                >
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Data</div>
                  <div className="mt-1 text-sm font-semibold text-white">{d.label}</div>
                  <div className="mt-1 text-[11px] text-slate-400 group-hover:text-slate-300">Ver clientes</div>
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[30px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_25px_100px_rgba(0,0,0,0.35)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Clientes do período</div>
                  <h2 className="mt-1 text-xl font-semibold">Cartões bem distribuídos</h2>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Todos</button>
                  <button className="rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-3 py-2 text-xs text-cyan-100">Em alta</button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {(selectedDateIso === null ? leads : filteredLeads).map((lead: any, index: number) => (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`group rounded-[24px] border p-4 text-left transition-all duration-300 ${
                      index === 0
                        ? "border-cyan-300/30 bg-[linear-gradient(180deg,rgba(22,34,64,0.95),rgba(9,15,29,0.95))] shadow-[0_0_30px_rgba(34,211,238,0.12)]"
                        : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{lead.name || 'Lead sem nome'}</div>
                        <div className="mt-1 text-xs text-slate-400">{lead.segment || 'Sem segmento'}</div>
                      </div>
                      <div className="h-10 w-10 rounded-2xl bg-[linear-gradient(135deg,#22d3ee,#2563eb)] opacity-90 shadow-lg" />
                    </div>

                    <div className="mb-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                      <div className="mt-1 text-sm text-white">{lead.statusLabel || lead.status || '—'}</div>
                    </div>

                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Resumo</div>
                        <div className="mt-1 text-sm text-slate-200">{buildClientValue(lead)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Retorno</div>
                        <div className="mt-1 text-sm text-slate-200">{formatShortDate(lead.returnAt)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(lead._tags || [lead.sourceType || 'Sem origem']).map((tag: string) => (
                        <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{tag}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_25px_100px_rgba(0,0,0,0.35)]">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Visão do cliente</div>
                  <h2 className="mt-1 text-xl font-semibold">Detalhes do cliente selecionado</h2>
                </div>
                <div className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs text-violet-100">Cliente selecionado</div>
              </div>

              {selectedLead ? (
                <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,30,0.95),rgba(7,11,21,0.95))] p-4 shadow-inner">
                  <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{selectedLead.name}</div>
                      <div className="mt-1 text-sm text-slate-400">Centro de ações, timeline e automações do cliente</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300" onClick={() => { navigator.clipboard.writeText(selectedLead.phone || ''); }}>Copiar telefone</button>
                      <a className="rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-3 py-2 text-xs text-cyan-100" href={buildWhatsAppUrl(selectedLead.phone, selectedLead.name)} target="_blank" rel="noreferrer">WhatsApp</a>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                        <div className="mb-3 text-sm font-medium text-white">Opções do cliente</div>
                        <div className="grid gap-3">
                          <button className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10" onClick={() => patchLead(selectedLead.id, { status: 'contato', nextAction: 'Abrir atendimento humano' })}>Abrir atendimento humano</button>
                          <button className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10" onClick={() => patchLead(selectedLead.id, { status: 'retorno', nextAction: 'Executar automação Recovery' })}>Executar automação Recovery</button>
                          <a className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10" href={buildWhatsAppUrl(selectedLead.phone, selectedLead.name)} target="_blank" rel="noreferrer">Enviar template WhatsApp</a>
                          <button className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10" onClick={() => { navigator.clipboard.writeText(`https://hbx.pay/lead/${selectedLead.id}`); }}>Gerar link de pagamento</button>
                          <button className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10" onClick={() => setSelectedLead(null)}>Fechar visão</button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-medium text-white">Indicadores</div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                            <span className="text-sm text-slate-300">Tentativas</span>
                            <span className="text-sm font-semibold text-white">{selectedLead.attemptCount ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                            <span className="text-sm text-slate-300">Último contato</span>
                            <span className="text-sm font-semibold text-white">{selectedLead.lastContactAt ? new Date(selectedLead.lastContactAt).toLocaleString() : '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">Tudo acontecendo aqui</div>
                          <div className="mt-1 text-xs text-slate-400">Timeline, mensagens, eventos e tarefas</div>
                        </div>
                        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">Ao vivo</div>
                      </div>

                      <div className="space-y-3">
                        {(selectedLead.timeline || []).map((ev: any) => (
                          <div key={ev.id || Math.random()} className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs uppercase tracking-[0.18em] text-cyan-200">{ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString() : '—'}</span>
                              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">{ev.eventType || 'Evento'}</span>
                            </div>
                            <div className="text-sm text-slate-100">{ev.title || ev.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-foreground/60">Selecione um cliente para ver detalhes e opções.</div>
              )}
            </section>
          </div>

          {error ? <div className="mt-4 text-sm text-amber-400">{error}</div> : null}
        </div>
      </div>
    </DashboardScaffold>
  );
}
