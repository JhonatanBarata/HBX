"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — faixa de GESTÃO DO DIA no topo da aba Rota (home).
// TASK 7 (08/07) — "Gerar entregas de hoje" deixou de gerar direto: agora ABRE
// um pop-up (CascaSheet, mesmo padrão de folha usado no resto do app) com:
//   1) uma linha ÚNICA de dias (SEG..DOM), só os permitidos em Ajustes, hoje
//      pré-marcado, multiselect (dá pra incluir dia anterior não trabalhado);
//   2) a prévia dos clientes/itens que cairiam nesses dias (getDiaPreview,
//      read-only) com busca por nome;
//   3) "Começar Rota" — gera os dias marcados (gerarDia) e encadeia o MESMO
//      fluxo de início de rota que já existia (onComecarRota = onIniciar do
//      EntregaHome: GPS + iniciarRota + carregar + setView("rota")).
// O resumo do dia (3 stats) continua fora do pop-up, no corpo, como estava.
// Toda cor/forma vive em entrega.css (.ent-gestao/.ent-stats/.ent-gerar-* —
// 5 Leis). ZERO texto explicativo (Lei do plano): só os elementos pedidos.
// ================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CascaSheet } from "@/components/casca";

import { DIAS_SEMANA, dataLocalDoDiaSemana, diasPermitidos, isoDiaSemana } from "./entrega-api";
import {
  type DiaPreview,
  type DiaPreviewCliente,
  type ResumoDia,
  fmtMoney,
  gerarDia,
  getConfig,
  getDiaPreview,
  getResumoDia,
} from "./gestao-api";

export function GestaoDia({ onGerou, onComecarRota }: { onGerou: () => void; onComecarRota: () => void }) {
  const [resumo, setResumo] = useState<ResumoDia | null>(null);
  const [popupAberto, setPopupAberto] = useState(false);

  const carregarResumo = useCallback(async () => {
    try {
      setResumo(await getResumoDia());
    } catch {
      /* resumo é aditivo: falhou, não mostra os stats (não polui) */
    }
  }, []);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  return (
    <section className="ent-gestao" aria-label="Gestão do dia">
      <button
        type="button"
        className="ent-btn ent-btn--secondary ent-gestao-gerar"
        onClick={() => setPopupAberto(true)}
      >
        Gerar entregas de hoje
      </button>

      {resumo ? (
        <div className="ent-stats">
          <div className="ent-stat">
            <span className="ent-stat-num">{resumo.entregues}</span>
            <span className="ent-stat-lbl">Entregues</span>
          </div>
          <div className="ent-stat">
            <span className="ent-stat-num is-ok">{fmtMoney(resumo.recebidoHoje)}</span>
            <span className="ent-stat-lbl">Recebido</span>
          </div>
          <div className="ent-stat">
            <span className="ent-stat-num is-due">{fmtMoney(resumo.aReceber)}</span>
            <span className="ent-stat-lbl">A receber</span>
          </div>
        </div>
      ) : null}

      <CascaSheet open={popupAberto} title="Gerar entregas" onClose={() => setPopupAberto(false)}>
        <GerarEntregasPopup
          onFechar={() => setPopupAberto(false)}
          onGerou={onGerou}
          onComecarRota={onComecarRota}
          onFinalizado={carregarResumo}
        />
      </CascaSheet>
    </section>
  );
}

// Junta a prévia de vários dias num só (soma qtd por produto quando o mesmo
// cliente cai em mais de um dia selecionado) — evita listar o mesmo nome 2×.
function mesclarPreview(previews: DiaPreview[]): DiaPreviewCliente[] {
  const porCliente = new Map<
    string,
    { customerProfileId: string; nome: string; itens: Map<number, { productId: number; nome: string; qtd: number }> }
  >();
  for (const prev of previews) {
    for (const c of prev.clientes) {
      let entry = porCliente.get(c.customerProfileId);
      if (!entry) {
        entry = { customerProfileId: c.customerProfileId, nome: c.nome, itens: new Map() };
        porCliente.set(c.customerProfileId, entry);
      }
      for (const it of c.itens) {
        const atual = entry.itens.get(it.productId);
        if (atual) atual.qtd += it.qtd;
        else entry.itens.set(it.productId, { ...it });
      }
    }
  }
  return Array.from(porCliente.values()).map((e) => ({
    customerProfileId: e.customerProfileId,
    nome: e.nome,
    itens: Array.from(e.itens.values()),
  }));
}

// ── Conteúdo do pop-up "Gerar entregas" ──────────────────────────────────────
function GerarEntregasPopup({
  onFechar,
  onGerou,
  onComecarRota,
  onFinalizado,
}: {
  onFechar: () => void;
  onGerou: () => void;
  onComecarRota: () => void;
  onFinalizado: () => void;
}) {
  const hojeIso = useMemo(() => isoDiaSemana(new Date()), []);
  const inicializadoRef = useRef(false);

  const [permitidos, setPermitidos] = useState(DIAS_SEMANA);
  const [dias, setDias] = useState<number[]>([]);
  const [busca, setBusca] = useState("");
  const [preview, setPreview] = useState<DiaPreviewCliente[]>([]);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [comecando, setComecando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Dias permitidos (Ajustes) + seleção inicial = hoje, SE hoje for um dia
  // permitido (senão fica vazio — nada de default pra marcar).
  useEffect(() => {
    let vivo = true;
    void getConfig()
      .then((cfg) => {
        if (!vivo) return;
        const lista = diasPermitidos(cfg.diasTrabalho);
        setPermitidos(lista);
        if (!inicializadoRef.current) {
          inicializadoRef.current = true;
          setDias(lista.some((d) => d.n === hojeIso) ? [hojeIso] : []);
        }
      })
      .catch(() => {
        if (!inicializadoRef.current) {
          inicializadoRef.current = true;
          setDias([hojeIso]);
        }
      });
    return () => {
      vivo = false;
    };
  }, [hojeIso]);

  // Prévia: 1 getDiaPreview por dia marcado, mesclados — recalcula a cada
  // mudança de seleção. Falha isolada de 1 data não derruba as outras.
  useEffect(() => {
    if (dias.length === 0) {
      setPreview([]);
      return;
    }
    let vivo = true;
    setCarregandoPreview(true);
    const datas = dias.map((n) => dataLocalDoDiaSemana(n));
    void Promise.all(datas.map((d) => getDiaPreview(d).catch((): DiaPreview => ({ date: d, clientes: [] }))))
      .then((resultados) => {
        if (vivo) setPreview(mesclarPreview(resultados));
      })
      .finally(() => {
        if (vivo) setCarregandoPreview(false);
      });
    return () => {
      vivo = false;
    };
  }, [dias]);

  const toggleDia = useCallback((n: number) => {
    setDias((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }, []);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return preview;
    return preview.filter((c) => c.nome.toLowerCase().includes(q));
  }, [preview, busca]);

  // "Começar Rota": gera os dias marcados e encadeia o fluxo de início que já
  // existe no EntregaHome (GPS + iniciarRota + carregar + setView("rota")).
  const comecarRota = useCallback(async () => {
    if (dias.length === 0) return;
    setComecando(true);
    setErro(null);
    try {
      const datas = dias.map((n) => dataLocalDoDiaSemana(n));
      await Promise.all(datas.map((d) => gerarDia(d)));
      onGerou();
      onFinalizado();
      onFechar();
      onComecarRota();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar as entregas");
    } finally {
      setComecando(false);
    }
  }, [dias, onGerou, onFinalizado, onFechar, onComecarRota]);

  return (
    <div className="ent-gerar-pop">
      <div className="ent-chips ent-chips--fit">
        {permitidos.map((d) => {
          const on = dias.includes(d.n);
          return (
            <button
              type="button"
              key={d.n}
              className={`ent-chip${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => toggleDia(d.n)}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <input
        className="ent-input"
        type="search"
        inputMode="search"
        placeholder="Buscar cliente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar cliente"
      />

      {carregandoPreview ? (
        <div className="ent-hint">Carregando…</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="ent-hint">{dias.length === 0 ? "Escolha ao menos um dia" : "Nenhum cliente nesses dias"}</div>
      ) : (
        <div className="ent-gerar-lista">
          {listaFiltrada.map((c) => (
            <div className="ent-row" key={c.customerProfileId}>
              <div className="ent-row-main">
                <div className="ent-row-name">{c.nome}</div>
                <div className="ent-row-sub">{c.itens.map((it) => `${it.qtd} ${it.nome}`).join(" · ") || "Sem itens"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {erro ? <div className="ent-erro">{erro}</div> : null}

      <div className="ent-sheet-actions">
        <button
          type="button"
          className="ent-btn ent-btn--primary"
          onClick={() => void comecarRota()}
          disabled={comecando || dias.length === 0}
        >
          {comecando ? "Gerando…" : "Começar Rota"}
        </button>
      </div>
    </div>
  );
}
