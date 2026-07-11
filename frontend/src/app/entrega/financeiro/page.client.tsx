"use client";

// ================================================================
// W4 (PR10072026) — tela FINANCEIRO do app /entrega (fase 1).
//
//  · GATE = moduloFinanceiroAtivo (vem no próprio GET /logistica/financeiro/
//    saldos — fail-closed no backend: OFF devolve lista vazia + flag false).
//    OFF → estado vazio padrão, dinheiro não aparece em lugar nenhum.
//  · LISTA "quem me deve": nome + saldo aberto + aguardando fechamento.
//  · Toque no cliente → DETALHE (CascaView, mesmo padrão de clientes/):
//    resumo (.ent-saldo, o mesmo da ficha) + extrato de ENTREGAS (data/hora,
//    itens, valor, ✓/✗/– do WhatsApp, "carregar mais" por cursor) + extrato
//    de COBRANÇAS com "Marcar pago" nas pendentes (admin-only, confirmação
//    de 1 toque, otimista + rollback → POST /logistica/charges/:id/quitar).
//  · ?cliente=ID (vindo do botão Financeiro da ficha) abre direto o detalhe.
//
// Visual 100% nas classes .ent-*/tokens (entrega.css) — zero hex/inline.
// ================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CascaLoading, CascaView } from "@/components/casca";

import {
  type ClienteEntrega,
  type ExtratoCharge,
  type ExtratoResult,
  getExtrato,
  listEntregasCliente,
} from "../clientes-api";
import { EntregaScaffold } from "../EntregaScaffold";
import { getIsAdmin } from "../entrega-user";
import {
  type SaldoClienteFin,
  type SaldosFinanceiroResult,
  fmtMoney,
  getSaldosFinanceiro,
  quitarCharge,
} from "../gestao-api";
import { I, ICON_PATHS } from "../icons";

const ENTREGAS_PAGE = 15;

type View = { tela: "lista" } | { tela: "detalhe"; id: string; nome: string | null };

/** "10/07 14:32" a partir do ISO (deliveredAt/scheduledAt). */
function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

export function EntregaFinanceiro() {
  const router = useRouter();
  const params = useSearchParams();
  const clienteParam = params.get("cliente");

  const [dados, setDados] = useState<SaldosFinanceiroResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  // Deep-link da ficha do cliente: abre já no detalhe daquele cliente.
  const [view, setView] = useState<View>(() =>
    clienteParam ? { tela: "detalhe", id: clienteParam, nome: null } : { tela: "lista" },
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await getSaldosFinanceiro();
      setDados(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    // setTimeout(0) — mesmo padrão do Ajustes: nada de setState síncrono no
    // corpo do efeito (react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => {
      void carregar();
      void getIsAdmin().then((v) => {
        if (vivo) setAdmin(v);
      });
    }, 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [carregar]);

  const fecharDetalhe = useCallback(() => {
    setView({ tela: "lista" });
    // Limpa o ?cliente= do deep-link (senão reabrir a rota volta pro detalhe).
    if (clienteParam) router.replace("/entrega/financeiro");
  }, [clienteParam, router]);

  // Nome do cliente no título do detalhe (o deep-link chega sem nome — o
  // extrato devolve; a lista já passa direto).
  const onNome = useCallback((nome: string) => {
    setView((v) => (v.tela === "detalhe" && !v.nome ? { ...v, nome } : v));
  }, []);

  const gateOn = dados?.moduloFinanceiroAtivo === true;

  return (
    <EntregaScaffold title="Financeiro">
      {dados === null && !erro ? (
        <div className="ent-empty">
          <CascaLoading caption="Carregando" />
        </div>
      ) : erro ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">⚠</div>
          <div className="ent-empty-title">Erro</div>
          <div>{erro}</div>
          <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      ) : !gateOn ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            <I d={ICON_PATHS.financeiro} size={40} />
          </div>
          <div className="ent-empty-title">Financeiro desligado</div>
        </div>
      ) : dados!.clientes.length === 0 ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            <I d={ICON_PATHS.financeiro} size={40} />
          </div>
          <div className="ent-empty-title">Ninguém devendo</div>
        </div>
      ) : (
        <SaldosLista
          clientes={dados!.clientes}
          onAbrir={(c) => setView({ tela: "detalhe", id: c.customerProfileId, nome: c.nome })}
        />
      )}

      {gateOn && view.tela === "detalhe" ? (
        <CascaView title={view.nome || "Cliente"} onClose={fecharDetalhe}>
          <FinanceiroDetalhe id={view.id} admin={admin} onNome={onNome} onMudou={carregar} />
        </CascaView>
      ) : null}
    </EntregaScaffold>
  );
}

// ── LISTA "quem me deve" ──────────────────────────────────────────────────────
function SaldosLista({
  clientes,
  onAbrir,
}: {
  clientes: SaldoClienteFin[];
  onAbrir: (c: SaldoClienteFin) => void;
}) {
  return (
    <div className="ent-list">
      {clientes.map((c) => (
        <div
          role="button"
          tabIndex={0}
          className="ent-card"
          key={c.customerProfileId}
          onClick={() => onAbrir(c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAbrir(c);
            }
          }}
        >
          <div className="ent-card-main">
            <div className="ent-card-name">{c.nome || "Cliente"}</div>
            <div className="ent-card-sub">
              {c.aguardandoFechamento > 0
                ? `${fmtMoney(c.aguardandoFechamento)} fecham no mês`
                : "Em aberto"}
            </div>
          </div>
          <b className="ent-fin-valor">{fmtMoney(c.saldoAberto)}</b>
          <span className="ent-card-chevron" aria-hidden="true">›</span>
        </div>
      ))}
    </div>
  );
}

// ── DETALHE do cliente (resumo + entregas + cobranças) ────────────────────────
function FinanceiroDetalhe({
  id,
  admin,
  onNome,
  onMudou,
}: {
  id: string;
  admin: boolean;
  onNome: (nome: string) => void;
  onMudou: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [extrato, setExtrato] = useState<ExtratoResult | null>(null);
  const [entregas, setEntregas] = useState<ClienteEntrega[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [maisLoading, setMaisLoading] = useState(false);

  useEffect(() => {
    let vivo = true;
    // setTimeout(0) — nada de setState síncrono no corpo do efeito.
    const t = window.setTimeout(() => {
      setCarregando(true);
      void (async () => {
        const [ext, ents] = await Promise.allSettled([
          getExtrato(id),
          listEntregasCliente(id, ENTREGAS_PAGE),
        ]);
        if (!vivo) return;
        if (ext.status === "fulfilled") {
          setExtrato(ext.value);
          if (ext.value.nome) onNome(ext.value.nome);
        } else {
          setErro("Falha ao carregar a conta");
        }
        if (ents.status === "fulfilled") {
          setEntregas(ents.value.items);
          setCursor(ents.value.nextCursor ?? null);
        } else {
          // Fail-soft: sem histórico de entregas, a conta continua de pé.
          setEntregas([]);
        }
        setCarregando(false);
      })();
    }, 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [id, onNome]);

  const carregarMais = useCallback(async () => {
    if (!cursor || maisLoading) return;
    setMaisLoading(true);
    try {
      const r = await listEntregasCliente(id, ENTREGAS_PAGE, cursor);
      setEntregas((prev) => [...(prev ?? []), ...r.items]);
      setCursor(r.nextCursor ?? null);
    } catch {
      /* mantém o cursor — o botão fica pra tentar de novo */
    } finally {
      setMaisLoading(false);
    }
  }, [id, cursor, maisLoading]);

  // "Marcar pago" — confirmação de 1 toque (arma → Confirmar), otimista +
  // rollback; depois re-lê o extrato (verdade do backend) e avisa a lista.
  const [armadoId, setArmadoId] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);

  const marcarPago = useCallback(
    async (c: ExtratoCharge) => {
      if (armadoId !== c.id) {
        setArmadoId(c.id);
        return;
      }
      setArmadoId(null);
      setQuitandoId(c.id);
      setErro(null);
      const anterior = extrato;
      setExtrato((e) =>
        e
          ? {
              ...e,
              saldoAberto: Math.max(0, Math.round((e.saldoAberto - c.amount) * 100) / 100),
              charges: e.charges.map((x) =>
                x.id === c.id
                  ? { ...x, status: "approved", lifecycle: "paid", paidAt: new Date().toISOString() }
                  : x,
              ),
            }
          : e,
      );
      try {
        await quitarCharge(c.id);
        onMudou();
        const fresco = await getExtrato(id).catch(() => null);
        if (fresco) setExtrato(fresco);
      } catch (e) {
        setExtrato(anterior);
        setErro(e instanceof Error ? e.message : "Falha ao marcar pago");
      } finally {
        setQuitandoId(null);
      }
    },
    [armadoId, extrato, id, onMudou],
  );

  if (carregando) {
    return (
      <div className="ent-empty">
        <CascaLoading caption="Carregando" />
      </div>
    );
  }

  return (
    <div className="ent-form">
      {/* RESUMO — mesmo bloco .ent-saldo da ficha do cliente. */}
      {extrato ? (
        <div className={`ent-saldo${extrato.saldoAberto > 0 ? " is-devendo" : ""}`}>
          <div className="ent-saldo-main">
            <span className="ent-saldo-label">{extrato.saldoAberto > 0 ? "Em aberto" : "Em dia"}</span>
            <b className="ent-saldo-valor">{fmtMoney(extrato.saldoAberto)}</b>
          </div>
          {extrato.aguardandoFechamento > 0 ? (
            <div className="ent-saldo-sub">{fmtMoney(extrato.aguardandoFechamento)} fecham no mês</div>
          ) : null}
        </div>
      ) : null}

      {/* EXTRATO DE ENTREGAS — data/hora, itens, valor, desfecho do WhatsApp. */}
      <div className="ent-field-label ent-section">Entregas</div>
      {!entregas || entregas.length === 0 ? (
        <div className="ent-hint">Nenhuma entrega ainda.</div>
      ) : (
        <>
          <div className="ent-extrato">
            {entregas.map((en) => {
              const itensTxt = en.itens.map((i) => `${i.qtd}× ${i.produtoNome || "Produto"}`).join(", ");
              const wa = en.whatsappStatus;
              return (
                <div className="ent-extrato-row" key={en.id}>
                  <div className="ent-extrato-main">
                    <div className="ent-extrato-desc">{itensTxt || "Entrega"}</div>
                    <div className="ent-extrato-data">{fmtDataHora(en.deliveredAt ?? en.scheduledAt)}</div>
                  </div>
                  <div className="ent-extrato-valor">
                    <b>{fmtMoney(en.valor)}</b>
                    <span
                      className={`ent-fin-wa${wa === "enviado" ? " is-ok" : wa === "falhou" ? " is-falha" : ""}`}
                      title={wa === "falhou" && en.whatsappMotivo ? en.whatsappMotivo : undefined}
                      aria-label={wa === "enviado" ? "Aviso enviado" : wa === "falhou" ? "Aviso falhou" : "Sem aviso"}
                    >
                      {wa === "enviado" ? "✓" : wa === "falhou" ? "✗" : "–"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {cursor ? (
            <button
              type="button"
              className="ent-btn ent-btn--ghost"
              onClick={() => void carregarMais()}
              disabled={maisLoading}
            >
              {maisLoading ? "Carregando…" : "Carregar mais"}
            </button>
          ) : null}
        </>
      )}

      {/* EXTRATO DE COBRANÇAS — "Marcar pago" nas pendentes (admin). */}
      {extrato && extrato.charges.length > 0 ? (
        <>
          <div className="ent-field-label ent-section">Cobranças</div>
          <div className="ent-extrato">
            {extrato.charges.map((c) => {
              const pago = c.lifecycle === "paid" || c.status === "approved";
              const data = (c.paidAt ?? c.dueDate ?? c.createdAt ?? "").slice(0, 10).split("-").reverse().join("/");
              const baixavel = admin && !pago && c.status === "pending";
              return (
                <div className={`ent-extrato-row${pago ? " is-pago" : ""}`} key={c.id}>
                  <div className="ent-extrato-main">
                    <div className="ent-extrato-desc">{c.description}</div>
                    <div className="ent-extrato-data">{data}</div>
                    {baixavel ? (
                      <button
                        type="button"
                        className={`ent-chip${armadoId === c.id ? " is-on" : ""}`}
                        onClick={() => void marcarPago(c)}
                        disabled={quitandoId === c.id}
                      >
                        {quitandoId === c.id ? "Marcando…" : armadoId === c.id ? "Confirmar" : "Marcar pago"}
                      </button>
                    ) : null}
                  </div>
                  <div className="ent-extrato-valor">
                    <b>{fmtMoney(c.amount)}</b>
                    <span className="ent-extrato-tag">{pago ? "pago" : "aberto"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {erro ? <div className="ent-erro">{erro}</div> : null}
    </div>
  );
}
