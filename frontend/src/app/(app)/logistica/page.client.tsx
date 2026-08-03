"use client";

// NÚCLEO-CRM N6 — módulo Logística (app de entrega, cliente água), mobile-first.
// "Rota de hoje": lista de entregas (cliente / endereço / produto / status).
// Tocar → detalhe: endereço + [Navegar] (deep-link Google Maps/Waze NATIVO, custo
// R$0) + [Confirmar entrega] (captura GPS via navigator.geolocation e posta lat/lng
// em /logistica/entregas/:id/confirmar). Contratos reais (company-scoped, JWT):
//   - GET  /logistica/rota?date=YYYY-MM-DD             → { date, items[] }
//   - POST /logistica/entregas/:id/confirmar {lat,lng} → { status:'entregue', ... }
//   - POST /logistica/entregas/:id/cancelar {motivo}   → { id }
//
// WhatsApp "entregue" + cobrança rodam SÓ com HBX_LOGISTICA_ENABLED ON no backend
// (default OFF). O front sempre chama /confirmar; o backend decide os efeitos.
//
// Design system (5 Leis): visual todo em classe central (.log-*/.emp-* em
// screens.css + kit .field-dark/.btn-teal/.btn-ghost). Inline aqui = só layout.

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

import { RouteBuilderDialog } from "./route-builder";
import { Cockpit } from "./cockpit";
import { WeeklyAgenda } from "./weekly-agenda";
import { BaseSaude } from "./base-saude";

type Cliente = {
  id: string;
  nome: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
};

type Entrega = {
  id: string;
  status: string;
  quantidade: number;
  valor: number;
  scheduledAt: string | null;
  deliveredAt: string | null;
  cobrancaStatus: string;
  notes: string | null;
  // PR27072026 F2 (ROTA 3 NÍVEIS) — PARADA AMARELA DE DEVEDOR: presente e true
  // quando o cliente desta parada está devedor E a config da empresa é
  // 'COBRANCA' (modo EXCLUIR nem chega aqui — some da lista no backend).
  // Ausente/false = comportamento de sempre.
  somenteCobranca?: boolean;
  motivoCobranca?: string | null;
  // PR29072026 (O TABULEIRO) — a ordem/ETA planejadas SEMPRE voltaram no payload
  // (logistica.service.ts:201 seleciona rotaOrdem/etaAt; :532 devolve), só não
  // estavam declaradas aqui. É `rotaOrdem` que dita o eixo do tabuleiro — hora
  // não serve, `scheduledAt` pode ser null no dia mais comum.
  rotaOrdem?: number | null;
  etaAt?: string | null;
  cliente: Cliente;
  contato: { id: string; nome: string; whatsapp: string | null; phone: string | null } | null;
  produto: { id: number; nome: string; unidade: string | null } | null;
  entregador: Entregador | null;
  comprovante?: {
    fotoEnviada: boolean;
    assinaturaEnviada: boolean;
    codigoGerado: boolean;
    confirmadoAt: string | null;
  };
};

type Entregador = { id: number; nome: string | null; email: string | null };

type Rota = {
  date: string;
  total: number;
  effectsEnabled: boolean;
  comprovante?: { fotoObrigatoria: boolean; assinaturaObrigatoria: boolean; codigoObrigatorio: boolean };
  items: Entrega[];
};

type LogisticsView = "today" | "weekly" | "saude";

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_rota: "Em rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

function fmtEndereco(c: Cliente): string {
  return [c.endereco, [c.cidade, c.uf].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Sem endereço cadastrado";
}

// Deep-link de navegação NATIVO (custo R$0): por coordenada se houver lat/lng,
// senão por endereço textual. O app abre Google Maps / Waze do celular.
function navUrl(c: Cliente): string {
  if (typeof c.lat === "number" && typeof c.lng === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  }
  const q = encodeURIComponent(fmtEndereco(c));
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

// ── Detalhe de UMA entrega (sheet) ───────────────────────────────────────────
function EntregaDetail({
  entrega,
  admin,
  entregadores,
  codigoObrigatorio,
  onClose,
  onDone,
  onAssigned,
}: {
  entrega: Entrega;
  admin: boolean;
  entregadores: Entregador[];
  codigoObrigatorio: boolean;
  onClose: () => void;
  onDone: () => void;
  onAssigned: (entregador: Entregador | null) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [atribuindo, setAtribuindo] = useState(false);
  const [entregador, setEntregador] = useState<Entregador | null>(entrega.entregador);
  const [gerandoCodigo, setGerandoCodigo] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);

  const c = entrega.cliente;
  const jaEntregue = entrega.status === "entregue";
  const cancelada = entrega.status === "cancelada";

  async function postConfirmar(lat: number | null, lng: number | null) {
    try {
      await apiFetch(`/logistica/entregas/${entrega.id}/confirmar`, {
        method: "POST",
        body: JSON.stringify(lat !== null && lng !== null ? { lat, lng } : {}),
      });
      setOk(true);
      // dá um respiro pro feedback "entregue" antes de fechar/recarregar.
      setTimeout(() => onDone(), 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível confirmar a entrega.");
    } finally {
      setConfirming(false);
    }
  }

  function confirmar() {
    setError(null);
    setConfirming(true);
    // Captura o GPS do celular (custo R$0). Se o usuário negar/der erro, confirma
    // sem coordenada (o backend aceita confirmar sem lat/lng).
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => postConfirmar(pos.coords.latitude, pos.coords.longitude),
        () => postConfirmar(null, null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    } else {
      postConfirmar(null, null);
    }
  }

  async function atribuir(entregadorId: number | null) {
    setAtribuindo(true);
    setError(null);
    try {
      const res = await apiFetch<{ entregador: Entregador | null }>(`/logistica/entregas/${entrega.id}/atribuir`, {
        method: "PATCH",
        body: JSON.stringify({ entregadorId }),
      });
      setEntregador(res.entregador);
      onAssigned(res.entregador);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível atribuir o entregador.");
    } finally {
      setAtribuindo(false);
    }
  }

  async function gerarCodigo() {
    setGerandoCodigo(true);
    setCodigo(null);
    setError(null);
    try {
      const res = await apiFetch<{ codigo: string }>(`/logistica/entregas/${entrega.id}/comprovante-codigo`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCodigo(res.codigo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o código.");
    } finally {
      setGerandoCodigo(false);
    }
  }

  return (
    <div className="hbx-veil to-bottom" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-drawer-bottom log-detail" role="dialog" aria-label="Detalhe da entrega" aria-modal="true">
        <div className="hbx-drawer-bottom__handle" aria-hidden />

        <div className="log-detail__head">
          <strong className="log-detail__name hbx-1linha">{c.nome || "Cliente"}</strong>
          <span className={`log-badge log-badge--${entrega.status}`}>{STATUS_LABEL[entrega.status] || entrega.status}</span>
        </div>

        <div className="log-detail__addr">
          <I d={ICONS.mapin} size={15} /> {fmtEndereco(c)}
        </div>

        <div className="log-detail__meta">
          {entrega.produto && (
            <span>{entrega.quantidade}× {entrega.produto.nome}{entrega.produto.unidade ? ` (${entrega.produto.unidade})` : ""}</span>
          )}
          {entrega.contato && <span>Recebe: {entrega.contato.nome}</span>}
        </div>

        {entrega.notes && <p className="log-detail__notes">{entrega.notes}</p>}

        {admin && !jaEntregue && !cancelada && (
          <div className="log-detail__admin">
            <label className="f">
              <span>Entregador responsável</span>
              <select
                className="field-dark"
                value={entregador?.id ?? ""}
                onChange={(e) => void atribuir(e.target.value ? Number(e.target.value) : null)}
                disabled={atribuindo}
              >
                <option value="">Ainda não atribuído</option>
                {entregadores.map((item) => (
                  <option value={item.id} key={item.id}>{item.nome || item.email || `Usuário ${item.id}`}</option>
                ))}
              </select>
            </label>

            {codigoObrigatorio && (
              <div className="log-detail__code">
                <button type="button" className="btn-ghost btn-xs" onClick={() => void gerarCodigo()} disabled={gerandoCodigo}>
                  {gerandoCodigo ? "Gerando…" : entrega.comprovante?.codigoGerado ? "Gerar novo código" : "Gerar código do cliente"}
                </button>
                {codigo && (
                  <div className="log-detail__code-value" role="status">
                    <span><strong>{codigo}</strong> · exibido somente agora</span>
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={() => void navigator.clipboard?.writeText(codigo)}
                    >
                      Copiar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {ok && <p className="log-detail__ok"><I d={ICONS.check} size={14} /> Entrega confirmada!</p>}
        {error && <p className="hint log-detail__err">{error}</p>}

        <div className="log-detail__acts">
          <a
            className="btn-ghost log-nav"
            href={navUrl(c)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <I d={ICONS.mapin} size={15} /> Navegar
          </a>
          {!jaEntregue && !cancelada && (
            <button className="btn-teal log-confirm" onClick={confirmar} disabled={confirming || ok}>
              <I d={ICONS.check} size={15} /> {confirming ? "Confirmando…" : "Confirmar entrega"}
            </button>
          )}
        </div>

        <button type="button" className="btn-ghost btn-xs log-detail__close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

// Resultado do POST /logistica/gerar-dia (LOGÍSTICA-MOBILE M2).
type GerarDiaResult = { date: string; criadas: number; puladas: number; avancados: number; candidatos: number };

// LOGÍSTICA-MOBILE M6 — resumo financeiro do dia (card do admin).
type ResumoDia = { date: string; entregues: number; recebidoHoje: number; aReceber: number };

// Resultado do POST /logistica/fechar-mes (R2 — modelo mensal).
type FecharMesResult = { companyId: number; mesRef: string; faturas: unknown[]; chargesCriados: number };
export function LogisticaClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const [rota, setRota] = useState<Rota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Entrega | null>(null);
  const [gerando, setGerando] = useState(false);
  const [gerarMsg, setGerarMsg] = useState<string | null>(null);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [routeBuilderOpen, setRouteBuilderOpen] = useState(false);
  const [resumo, setResumo] = useState<ResumoDia | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [view, setView] = useState<LogisticsView>("today");
  const viewPill = useGlassPill<HTMLButtonElement>(admin ? view : "today", admin);
  const menuRef = useRef<HTMLSpanElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<Rota>("/logistica/rota")
      .then((res) => {
        setRota(res);
        setError(null);
        setAtualizadoEm(new Date());
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar a rota.");
        setRota(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Os 2 números de dinheiro do topo. Antes isto era um CARTÃO inteiro no meio
  // da tela; virou dois KPIs, e o resto dele (fechar mês) foi pro menu "⋯".
  const carregarResumo = useCallback(() => {
    return apiFetch<ResumoDia>("/logistica/resumo-dia")
      .then(setResumo)
      .catch(() => { /* aditivo: sem resumo o topo mostra 0, nunca quebra */ });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!admin) return;
    void carregarResumo();
  }, [admin, carregarResumo]);

  useEffect(() => {
    if (!admin) return;
    apiFetch<Entregador[]>("/logistica/entregadores")
      .then(setEntregadores)
      .catch(() => setEntregadores([]));
  }, [admin]);

  // Fecha o "⋯" ao clicar fora — menu que não fecha sozinho vira estorvo.
  useEffect(() => {
    if (!menuAberto) return undefined;
    const fora = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menuAberto]);

  // "Gerar entregas de hoje" (admin): materializa as entregas recorrentes vencidas.
  // Idempotente no backend — clicar 2× não duplica. Recarrega a rota ao terminar.
  const gerarDia = useCallback(() => {
    setGerando(true);
    setGerarMsg(null);
    setMenuAberto(false);
    apiFetch<GerarDiaResult>("/logistica/gerar-dia", { method: "POST", body: JSON.stringify({}) })
      .then((res) => {
        setGerarMsg(
          res.criadas > 0
            ? `${res.criadas} entrega(s) gerada(s).`
            : res.candidatos > 0
              ? "Nada novo a gerar hoje (já estava tudo criado)."
              : "Nenhum produto recorrente vencido hoje.",
        );
        return load();
      })
      .catch((err: unknown) => {
        setGerarMsg(err instanceof Error ? err.message : "Não foi possível gerar as entregas.");
      })
      .finally(() => setGerando(false));
  }, [load]);

  const fecharMes = useCallback(() => {
    setMenuAberto(false);
    if (typeof window !== "undefined" && !window.confirm("Fechar o mês dos clientes mensais? Gera uma fatura por cliente com as entregas do período.")) return;
    apiFetch<FecharMesResult>("/logistica/fechar-mes", { method: "POST", body: JSON.stringify({}) })
      .then((res) => {
        setGerarMsg(res.chargesCriados > 0 ? `${res.chargesCriados} fatura(s) gerada(s).` : "Nada a fechar hoje.");
        void carregarResumo();
        return load();
      })
      .catch((err: unknown) => setGerarMsg(err instanceof Error ? err.message : "Não foi possível fechar o mês."));
  }, [carregarResumo, load]);

  const items = rota?.items ?? [];
  const pendentes = items.filter((e) => e.status === "agendada" || e.status === "em_rota").length;
  const isEmpty = !loading && !error && items.length === 0;

  // As 3 abas entram no MESMO topo do cockpit — duas barras seriam a pilha de
  // volta. Fora do admin não existe escolha de visão.
  const abas = admin ? (
    <div className="log-guide glass-pill-track" role="tablist" aria-label="Visão da logística">
      <GlassPill {...viewPill} />
      {(["today", "weekly", "saude"] as LogisticsView[]).map((chave) => (
        <button
          key={chave}
          ref={viewPill.itemRef(chave)}
          type="button"
          role="tab"
          aria-selected={view === chave}
          tabIndex={view === chave ? 0 : -1}
          className={`log-guide__tab glass-pill-item${view === chave ? " is-active" : ""}`}
          onClick={() => setView(chave)}
        >
          {chave === "today" ? "Hoje" : chave === "weekly" ? "Semana" : "Saúde"}
        </button>
      ))}
    </div>
  ) : null;

  // O "⋯": tudo que NÃO é a operação do dia. Antes eram 6 atalhos e um botão de
  // fechar mês ocupando duas faixas inteiras no meio da tela.
  const menu = admin ? (
    <span className="cok__sino" ref={menuRef}>
      <button
        type="button"
        className="btn-ghost btn-xs"
        aria-label="Mais ações"
        aria-expanded={menuAberto}
        onClick={() => setMenuAberto((v) => !v)}
      >
        <span aria-hidden>⋯</span>
      </button>
      {menuAberto && (
        <div className="cok__avisos cok__menu" role="menu">
          <span className="cok__avisos-titulo">Ações</span>
          <button type="button" className="cok__menu-item" role="menuitem" onClick={gerarDia} disabled={gerando}>
            <I d={ICONS.plus} size={13} /> {gerando ? "Gerando…" : "Gerar entregas de hoje"}
          </button>
          <Link href="/logistica/estoque" className="cok__menu-item" role="menuitem">
            <I d={ICONS.produtos} size={13} /> Estoque
          </Link>
          <Link href="/logistica/importar" className="cok__menu-item" role="menuitem">
            <I d={ICONS.upload} size={13} /> Importar
          </Link>
          <Link href="/logistica/config" className="cok__menu-item" role="menuitem">
            <I d={ICONS.config} size={13} /> Regras
          </Link>
          <Link href="/logistica/instalar" className="cok__menu-item" role="menuitem">
            <I d={ICONS.phone} size={13} /> App do entregador
          </Link>
          <button type="button" className="cok__menu-item" role="menuitem" onClick={fecharMes}>
            <I d={ICONS.check} size={13} /> Fechar mês
          </button>
          {gerarMsg && <span className="cok__avisos-rodape">{gerarMsg}</span>}
        </div>
      )}
    </span>
  ) : null;

  return (
    <div className="work log-work log-cockpit-host">
      {admin && view === "today" && (
        <Cockpit
          stops={items}
          drivers={entregadores}
          entreguesHoje={resumo?.entregues ?? 0}
          aReceber={resumo?.aReceber ?? 0}
          carregando={loading}
          atualizadoEm={atualizadoEm}
          abas={abas}
          menu={menu}
          onRecarregar={() => { void load(); void carregarResumo(); }}
          onAbrirParada={(stop) => setOpen(items.find((item) => item.id === stop.id) ?? null)}
          onMontarRota={() => setRouteBuilderOpen(true)}
          onParadaAvulsa={() => setRouteBuilderOpen(true)}
          onAtribuido={(stopId, entregador) => {
            setRota((atual) => atual
              ? { ...atual, items: atual.items.map((item) => item.id === stopId ? { ...item, entregador } : item) }
              : atual);
            setOpen((atual) => atual && atual.id === stopId ? { ...atual, entregador } : atual);
          }}
        />
      )}

      {admin && view === "weekly" && (
        <section className="panel log-today-panel hbx-page-mobile-enter">
          <header className="log-command">{abas}</header>
          <WeeklyAgenda onOpenRouteBuilder={() => setRouteBuilderOpen(true)} />
        </section>
      )}

      {admin && view === "saude" && (
        <section className="panel log-today-panel hbx-page-mobile-enter">
          <header className="log-command">{abas}</header>
          <BaseSaude />
        </section>
      )}

      {/* O ENTREGADOR (não-admin) continua na LISTA — é a tela dele no celular.
          UMA representação por público: o cockpit é a mesa de quem despacha. */}
      {!admin && (
        <section className="panel log-today-panel hbx-page-mobile-enter">
          <header className="log-command">
            <div className="log-command__identity">
              <span className="log-command__icon" aria-hidden><I d={ICONS.logistica} size={17} /></span>
              <span className="log-command__copy">
                <strong>Rota de hoje</strong>
                <small>{items.length} parada(s) · {pendentes} aberta(s)</small>
              </span>
            </div>
            <button
              type="button"
              className="btn-ghost log-command__refresh"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Atualizar rota"
            >
              <span aria-hidden>↻</span>
            </button>
          </header>

          {loading && <div className="emp-empty"><span className="emp-empty__text">Carregando rota…</span></div>}

          {error && (
            <div className="emp-empty">
              <strong className="emp-empty__title">Não carregou</strong>
              <span className="emp-empty__text">{error}</span>
              <button className="btn-ghost" onClick={() => load()}>Tentar novamente</button>
            </div>
          )}

          {isEmpty && (
            <div className="emp-empty">
              <strong className="emp-empty__title">Nenhuma entrega hoje</strong>
              <span className="emp-empty__text">
                As entregas agendadas para hoje aparecem aqui. Toque numa parada para navegar até o cliente e confirmar a entrega com o GPS.
              </span>
            </div>
          )}

          {!error && items.length > 0 && (
            <div className="emp-list">
              {items.map((e) => (
                <button
                  type="button"
                  className={`emp-row log-row log-row--${e.status}`}
                  key={e.id}
                  onClick={() => setOpen(e)}
                >
                  <span className="emp-row__ico"><I d={ICONS.logistica} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">{e.cliente.nome || "Cliente"}</span>
                    <span className="emp-row__sub">
                      {[
                        fmtEndereco(e.cliente),
                        e.produto ? `${e.quantidade}× ${e.produto.nome}` : "",
                      ].filter(Boolean).join("  ·  ")}
                    </span>
                  </span>
                  <span className="emp-row__side">
                    {/* PR27072026 F2 — parada amarela de devedor: "só cobrar", sem
                        esconder o cliente. */}
                    {e.somenteCobranca && (
                      <span className="tag warn" title={e.motivoCobranca || undefined}>Só cobrar</span>
                    )}
                    <span className={`log-badge log-badge--${e.status}`}>{STATUS_LABEL[e.status] || e.status}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Erro do ADMIN: o cockpit desenha as zonas mesmo sem parada (elenco e
          mapa continuam valendo), então o recado vem como faixa por baixo. */}
      {admin && view === "today" && error && (
        <div className="emp-empty">
          <strong className="emp-empty__title">Não carregou</strong>
          <span className="emp-empty__text">{error}</span>
          <button className="btn-ghost" onClick={() => load()}>Tentar novamente</button>
        </div>
      )}

      {open && (
        <EntregaDetail
          entrega={open}
          admin={admin}
          entregadores={entregadores}
          codigoObrigatorio={!!rota?.comprovante?.codigoObrigatorio}
          onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); load(); void carregarResumo(); }}
          onAssigned={(entregador) => {
            setOpen((atual) => atual ? { ...atual, entregador } : atual);
            setRota((atual) => atual
              ? { ...atual, items: atual.items.map((item) => item.id === open.id ? { ...item, entregador } : item) }
              : atual);
          }}
        />
      )}

      {routeBuilderOpen && (
        <RouteBuilderDialog
          admin={admin}
          onClose={() => setRouteBuilderOpen(false)}
          onCompleted={(message) => {
            setRouteBuilderOpen(false);
            setGerarMsg(message);
            void load();
            void carregarResumo();
          }}
        />
      )}
    </div>
  );
}
