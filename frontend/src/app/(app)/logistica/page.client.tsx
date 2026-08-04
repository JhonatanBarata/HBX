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
import { ConfirmDialog, I, ICONS, useCurrentUser } from "@/components/hbx/shell";
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

const VIEW_QUERY: Record<LogisticsView, string> = {
  today: "hoje",
  weekly: "semana",
  saude: "enderecos",
};

function viewFromUrl(): LogisticsView {
  if (typeof window === "undefined") return "today";
  const valor = new URLSearchParams(window.location.search).get("visao");
  if (valor === "semana") return "weekly";
  if (valor === "enderecos") return "saude";
  return "today";
}

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
  const [urlSincronizada, setUrlSincronizada] = useState(false);
  const [viewsVisitadas, setViewsVisitadas] = useState<Set<LogisticsView>>(() => new Set(["today"]));
  const [acaoPendente, setAcaoPendente] = useState<"gerar" | "fechar" | null>(null);
  const [fechando, setFechando] = useState(false);
  const viewPill = useGlassPill<HTMLButtonElement>(admin ? view : "today", admin);
  const menuRef = useRef<HTMLSpanElement | null>(null);

  // A visão faz parte da URL: refresh mantém a tela e Voltar desfaz a troca.
  // As visões já abertas continuam montadas, preservando mapa, dia, filtros e
  // inspetor; uma tela pesada só nasce depois da primeira visita.
  useEffect(() => {
    const sincronizar = () => {
      const next = viewFromUrl();
      setView(next);
      setViewsVisitadas((atuais) => atuais.has(next) ? atuais : new Set(atuais).add(next));
      setUrlSincronizada(true);
    };
    sincronizar();
    window.addEventListener("popstate", sincronizar);
    return () => window.removeEventListener("popstate", sincronizar);
  }, []);

  const abrirVisao = useCallback((next: LogisticsView) => {
    setView(next);
    setViewsVisitadas((atuais) => atuais.has(next) ? atuais : new Set(atuais).add(next));
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "today") url.searchParams.delete("visao");
    else url.searchParams.set("visao", VIEW_QUERY[next]);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

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
      })
      .finally(() => setLoading(false));
  }, []);

  // Os 2 números de dinheiro do topo. Antes isto era um CARTÃO inteiro no meio
  // da tela; virou dois KPIs, e o resto dele (fechar mês) foi pro menu "⋯".
  const carregarResumo = useCallback(() => {
    return apiFetch<ResumoDia>("/logistica/resumo-dia")
      .then(setResumo)
      .catch(() => { /* preserva a última leitura; sem leitura inicial o topo mostra “—” */ });
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
      .catch(() => { /* mantém a última equipe conhecida; falha não vira equipe vazia */ });
  }, [admin]);

  // 04/08 — O MENU NÃO SE RECOLHE MAIS SOZINHO AQUI (ordem do dono).
  // Esta tela recolhia o rail ao montar e devolvia ao sair. Duas coisas davam
  // errado: o estado do menu é ESCOLHA do usuário (mora em localStorage
  // "hbx:rail") e uma tela não pode mexer nele por conta própria; e, com o rail
  // em "min", o verso dos módulos some (useCostasDisponivel exige rail !== min),
  // então o interruptor "»" da marca ficava mudo justamente na Logística.
  // Quem quiser mais palco recolhe no botão «/» — como em qualquer outra tela.

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
  const gerarDia = useCallback(async () => {
    setGerando(true);
    setGerarMsg(null);
    try {
      const res = await apiFetch<GerarDiaResult>("/logistica/gerar-dia", { method: "POST", body: JSON.stringify({}) });
      setGerarMsg(
        res.criadas > 0
          ? `${res.criadas} entrega(s) gerada(s).`
          : res.candidatos > 0
            ? "Nada novo a gerar hoje (já estava tudo criado)."
            : "Nenhum produto recorrente vencido hoje.",
      );
      await load();
    } catch (err: unknown) {
      setGerarMsg(err instanceof Error ? err.message : "Não foi possível gerar as entregas.");
    } finally {
      setGerando(false);
    }
  }, [load]);

  const fecharMes = useCallback(async () => {
    setFechando(true);
    setGerarMsg(null);
    try {
      const res = await apiFetch<FecharMesResult>("/logistica/fechar-mes", { method: "POST", body: JSON.stringify({}) });
      setGerarMsg(res.chargesCriados > 0 ? `${res.chargesCriados} fatura(s) gerada(s).` : "Nada a fechar hoje.");
      await carregarResumo();
      await load();
    } catch (err: unknown) {
      setGerarMsg(err instanceof Error ? err.message : "Não foi possível fechar o mês.");
    } finally {
      setFechando(false);
    }
  }, [carregarResumo, load]);

  const executarAcaoPendente = useCallback(async () => {
    if (acaoPendente === "gerar") await gerarDia();
    if (acaoPendente === "fechar") await fecharMes();
    setAcaoPendente(null);
  }, [acaoPendente, fecharMes, gerarDia]);

  const items = rota?.items ?? [];
  const pendentes = items.filter((e) => e.status === "agendada" || e.status === "em_rota").length;
  const isEmpty = !loading && !error && items.length === 0;

  // Uma navegação só, persistente nas três visões. O id é o contrato dos
  // tabpanels de Semana/Endereços; antes o aria-labelledby apontava para um
  // elemento que não existia.
  const abas = admin ? (
    <div className="log-guide glass-pill-track" role="tablist" aria-label="Visão da logística">
      <GlassPill {...viewPill} />
      {(["today", "weekly", "saude"] as LogisticsView[]).map((chave) => (
        <button
          key={chave}
          ref={viewPill.itemRef(chave)}
          id={`log-tab-${chave}`}
          type="button"
          role="tab"
          aria-selected={view === chave}
          tabIndex={view === chave ? 0 : -1}
          className={`log-guide__tab glass-pill-item${view === chave ? " is-active" : ""}`}
          onClick={() => abrirVisao(chave)}
        >
          {chave === "today" ? "Hoje" : chave === "weekly" ? "Semana" : "Endereços"}
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
          <button type="button" className="cok__menu-item" role="menuitem" onClick={() => { setMenuAberto(false); setAcaoPendente("gerar"); }} disabled={gerando}>
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
          <button type="button" className="cok__menu-item" role="menuitem" onClick={() => { setMenuAberto(false); setAcaoPendente("fechar"); }} disabled={fechando}>
            <I d={ICONS.check} size={13} /> Fechar mês
          </button>
        </div>
      )}
    </span>
  ) : null;

  return (
    <div className="work log-work log-cockpit-host">
      {admin && (
        <section className={`log-admin-shell is-${view}`}>
          <header className="log-admin-shell__nav">
            {abas}
          </header>

          <div className="log-admin-shell__content">
            {viewsVisitadas.has("today") && (
              <div className="log-admin-shell__view" hidden={view !== "today"}>
                <Cockpit
                  ativo={urlSincronizada && view === "today"}
                  stops={items}
                  drivers={entregadores}
                  entreguesHoje={resumo?.entregues ?? null}
                  aReceber={resumo?.aReceber ?? null}
                  carregando={loading}
                  atualizadoEm={atualizadoEm}
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
                {error && (
                  <div className="emp-empty log-admin-shell__error">
                    <strong className="emp-empty__title">Não carregou</strong>
                    <span className="emp-empty__text">{error}</span>
                    <button className="btn-ghost" onClick={() => load()}>Tentar novamente</button>
                  </div>
                )}
              </div>
            )}

            {viewsVisitadas.has("weekly") && (
              <div className="log-admin-shell__view" hidden={view !== "weekly"}>
                <WeeklyAgenda onOpenRouteBuilder={() => setRouteBuilderOpen(true)} />
              </div>
            )}

            {viewsVisitadas.has("saude") && (
              <div className="log-admin-shell__view" hidden={view !== "saude"}>
                <BaseSaude />
              </div>
            )}
          </div>
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

      {gerarMsg && (
        <div className="hbx-toast" role="status" aria-live="polite" data-hbx-motion="toast">
          {gerarMsg}
        </div>
      )}

      <ConfirmDialog
        open={acaoPendente !== null}
        title={acaoPendente === "fechar" ? "Fechar o mês?" : "Gerar entregas de hoje?"}
        message={acaoPendente === "fechar"
          ? "Será criada uma fatura por cliente mensal com as entregas do período."
          : "Serão criadas agora as entregas recorrentes vencidas que ainda não existem na rota de hoje."}
        confirmLabel={acaoPendente === "fechar" ? "Fechar mês" : "Gerar entregas"}
        busy={gerando || fechando}
        onConfirm={() => { void executarAcaoPendente(); }}
        onCancel={() => setAcaoPendente(null)}
      />
    </div>
  );
}
