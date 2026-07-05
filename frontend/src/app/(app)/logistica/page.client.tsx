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

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

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
  cliente: Cliente;
  contato: { id: string; nome: string; whatsapp: string | null; phone: string | null } | null;
  produto: { id: number; nome: string; unidade: string | null } | null;
};

type Rota = { date: string; total: number; effectsEnabled: boolean; items: Entrega[] };

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
  onClose,
  onDone,
}: {
  entrega: Entrega;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

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

  return (
    <div className="hbx-veil to-bottom" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-drawer-bottom log-detail" role="dialog" aria-label="Detalhe da entrega" aria-modal="true">
        <div className="hbx-drawer-bottom__handle" aria-hidden />

        <div className="log-detail__head">
          <strong className="log-detail__name">{c.nome || "Cliente"}</strong>
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

function fmtMoneyLog(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

// M6 — card "Resumo do dia" (admin): entregues / recebido hoje / a receber +
// botão "Fechar mês" (chama POST /logistica/fechar-mes com confirmação simples).
function ResumoDiaCard({ onFecharMes }: { onFecharMes: () => void }) {
  const [resumo, setResumo] = useState<ResumoDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);
  const [fecharMsg, setFecharMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<ResumoDia>("/logistica/resumo-dia")
      .then((res) => { setResumo(res); setError(null); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Não foi possível carregar o resumo."); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const fecharMes = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm("Fechar o mês dos clientes mensais? Gera uma fatura por cliente com as entregas do período.")) return;
    setFechando(true);
    setFecharMsg(null);
    apiFetch<FecharMesResult>("/logistica/fechar-mes", { method: "POST", body: JSON.stringify({}) })
      .then((res) => {
        setFecharMsg(res.chargesCriados > 0 ? `${res.chargesCriados} fatura(s) gerada(s).` : "Nada a fechar hoje.");
        onFecharMes();
        return load();
      })
      .catch((err: unknown) => { setFecharMsg(err instanceof Error ? err.message : "Não foi possível fechar o mês."); })
      .finally(() => setFechando(false));
  }, [load, onFecharMes]);

  if (error) return null; // resumo é aditivo; se falhar, não polui a tela.

  return (
    <div className="log-resumo">
      <div className="log-resumo__stats">
        <div className="log-resumo__stat">
          {loading && !resumo
            ? <span className="log-resumo__num log-resumo__skel" aria-hidden />
            : <span className="log-resumo__num">{resumo?.entregues ?? 0}</span>}
          <span className="log-resumo__lbl">Entregues hoje</span>
        </div>
        <div className="log-resumo__stat">
          {loading && !resumo
            ? <span className="log-resumo__num log-resumo__skel" aria-hidden />
            : <span className="log-resumo__num is-ok">{fmtMoneyLog(resumo?.recebidoHoje ?? 0)}</span>}
          <span className="log-resumo__lbl">Recebido hoje</span>
        </div>
        <div className="log-resumo__stat">
          {loading && !resumo
            ? <span className="log-resumo__num log-resumo__skel" aria-hidden />
            : <span className="log-resumo__num is-due">{fmtMoneyLog(resumo?.aReceber ?? 0)}</span>}
          <span className="log-resumo__lbl">A receber</span>
        </div>
      </div>
      <div className="log-resumo__acts">
        {fecharMsg && <span className="emp-count">{fecharMsg}</span>}
        <button type="button" className="btn-ghost btn-xs" onClick={fecharMes} disabled={fechando}>
          <I d={ICONS.check} size={13} /> {fechando ? "Fechando…" : "Fechar mês"}
        </button>
      </div>
    </div>
  );
}

export function LogisticaClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const [rota, setRota] = useState<Rota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Entrega | null>(null);
  const [gerando, setGerando] = useState(false);
  const [gerarMsg, setGerarMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<Rota>("/logistica/rota")
      .then((res) => {
        setRota(res);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar a rota.");
        setRota(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // "Gerar entregas de hoje" (admin): materializa as entregas recorrentes vencidas.
  // Idempotente no backend — clicar 2× não duplica. Recarrega a rota ao terminar.
  const gerarDia = useCallback(() => {
    setGerando(true);
    setGerarMsg(null);
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

  const items = rota?.items ?? [];
  const pendentes = items.filter((e) => e.status === "agendada" || e.status === "em_rota").length;
  const isEmpty = !loading && !error && items.length === 0;

  return (
    <div className="work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Rota de hoje</h2>
          <div className="meta" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {gerarMsg && <span className="emp-count">{gerarMsg}</span>}
            <span>{pendentes} pendente(s) · {items.length} no dia</span>
            {admin && (
              <button type="button" className="btn-ghost btn-xs" onClick={gerarDia} disabled={gerando}>
                <I d={ICONS.plus} size={13} /> {gerando ? "Gerando…" : "Gerar entregas de hoje"}
              </button>
            )}
            {admin && (
              <Link href="/logistica/config" className="btn-ghost btn-xs">
                <I d={ICONS.config} size={13} /> Regras
              </Link>
            )}
            {admin && (
              <Link href="/logistica/instalar" className="btn-ghost btn-xs">
                <I d={ICONS.phone} size={13} /> Instalar app
              </Link>
            )}
          </div>
        </div>

        {/* M6 — resumo financeiro do dia + fechar mês (admin). */}
        {admin && <ResumoDiaCard onFecharMes={load} />}

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
                  <span className={`log-badge log-badge--${e.status}`}>{STATUS_LABEL[e.status] || e.status}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {open && (
        <EntregaDetail
          entrega={open}
          onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); load(); }}
        />
      )}
    </div>
  );
}
