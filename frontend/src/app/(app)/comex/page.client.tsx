"use client";

// COMEX — vendas/radar internacional (módulo NOVO 31/07, isolado do /vendas).
// Mapa do mercado por produto (SH4): totais, série mensal, municípios, origens
// com bandeira, vias — e o Radar Internacional: PROVÁVEIS importadores/
// exportadores (inferência de dados públicos; payload sem valor por empresa —
// embalagem jurídica, ver backend/src/comex/comex.service.ts).
// Contratos (gate 'comex'): GET /comex/status · /comex/busca?q= ·
// /comex/mercado?sh4=&fluxo= · /comex/radar?sh4=&fluxo=
// Visual 100% em classe central (comex.css + kit) — zero hex/inline visual.

import "flag-icons/css/flag-icons.min.css";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { apiFetch } from "@/lib/api";
import { iso3ToIso2 } from "@/lib/iso-flags";

type Fluxo = "IMP" | "EXP";
type Aba = "mercado" | "radar";

type BuscaItem = { sh4: string; descricao: string };
type Mercado = {
  disponivel: boolean;
  descricao?: { pt: string } | null;
  totais?: { fobUsd: number | null; kg: number | null; usdPorKg: number | null; municipios: number | null } | null;
  serieMensal?: { ano: number; mes: number; fobUsd: number }[];
  topMunicipios?: { municipio: string | null; uf: string; fobUsd: number; sharePct: number }[];
  topPaises?: { pais: string | null; iso3: string | null; fobUsd: number; sharePct: number; usdPorKg: number | null }[];
  vias?: { via: string | null; sharePct: number }[];
};
type Candidato = {
  cnpj: string;
  empresa: string;
  municipio: string | null;
  uf: string | null;
  cnae: string | null;
  ultimoAnoNaLista: number;
  perfil: "cnae_do_produto" | "trading_atacado" | "regiao_do_fluxo";
  score: number;
};
type Radar = { disponivel: boolean; descricao?: string | null; candidatos: Candidato[] };

const nfUsd = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat("pt-BR");

function fmtCnpj(cnpj: string): string {
  const d = String(cnpj || "").replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function Bandeira({ iso3 }: { iso3: string | null }) {
  const a2 = iso3ToIso2(iso3);
  if (!a2) return <span className="cmx-noflag">{iso3 || "—"}</span>;
  return <span className={`fi fi-${a2}`} aria-hidden />;
}

const PERFIL_LABEL: Record<Candidato["perfil"], { cls: string; label: string }> = {
  cnae_do_produto: { cls: "cmx-perfil produto", label: "CNAE do produto" },
  trading_atacado: { cls: "cmx-perfil trading", label: "Trading / atacado" },
  regiao_do_fluxo: { cls: "cmx-perfil", label: "Região do fluxo" },
};

export function ComexClient() {
  const [q, setQ] = useState("");
  const [sugestoes, setSugestoes] = useState<BuscaItem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [sh4, setSh4] = useState<string>("4011");
  const [fluxo, setFluxo] = useState<Fluxo>("IMP");
  const [aba, setAba] = useState<Aba>("mercado");
  const [mercado, setMercado] = useState<Mercado | null>(null);
  const [radar, setRadar] = useState<Radar | null>(null);
  const [carregando, setCarregando] = useState(false);
  const buscaRef = useRef<number>(0);

  const gpFluxo = useGlassPill<HTMLButtonElement>(fluxo);
  const gpAba = useGlassPill<HTMLButtonElement>(aba);

  // Busca com debounce simples — sugestões de SH4 por código ou descrição.
  // (todo setState dentro do timeout — regra react-hooks/set-state-in-effect)
  useEffect(() => {
    const termo = q.trim();
    const id = ++buscaRef.current;
    const t = setTimeout(
      async () => {
        if (termo.length < 2) {
          if (id === buscaRef.current) setSugestoes([]);
          return;
        }
        try {
          const r = await apiFetch<{ itens: BuscaItem[] }>(`/comex/busca?q=${encodeURIComponent(termo)}`);
          if (id === buscaRef.current) {
            setSugestoes(r?.itens || []);
            setAberto(true);
          }
        } catch {
          /* busca é acessório — silêncio */
        }
      },
      termo.length < 2 ? 0 : 250,
    );
    return () => clearTimeout(t);
  }, [q]);

  const carregar = useCallback(async (alvo: string, f: Fluxo) => {
    setCarregando(true);
    try {
      const [m, r] = await Promise.all([
        apiFetch<Mercado>(`/comex/mercado?sh4=${alvo}&fluxo=${f}`),
        apiFetch<Radar>(`/comex/radar?sh4=${alvo}&fluxo=${f}`),
      ]);
      setMercado(m);
      setRadar(r);
    } catch {
      setMercado({ disponivel: false });
      setRadar({ disponivel: false, candidatos: [] });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // adiado pro próximo tick: setCarregando não dispara síncrono no effect.
    const t = setTimeout(() => void carregar(sh4, fluxo), 0);
    return () => clearTimeout(t);
  }, [sh4, fluxo, carregar]);

  const maxFobMes = Math.max(1, ...(mercado?.serieMensal || []).map((s) => s.fobUsd || 0));
  const totais = mercado?.totais;

  return (
    <div className="cmx-page">
      <div className="cmx-head">
        <div className="cmx-search">
          <input
            value={q}
            placeholder="Produto ou NCM/SH4 — ex.: pneus, 4011, bomba de água…"
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => sugestoes.length && setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 150)}
          />
          {aberto && sugestoes.length > 0 && (
            <div className="cmx-suggest">
              {sugestoes.slice(0, 8).map((s) => (
                <button
                  key={s.sh4}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSh4(s.sh4);
                    setQ("");
                    setAberto(false);
                  }}
                >
                  <span className="code">{s.sh4}</span>
                  <span>{s.descricao}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-pill-track" style={{ display: "flex", gap: 4 }}>
          <GlassPill {...gpFluxo} />
          {(["IMP", "EXP"] as Fluxo[]).map((f) => (
            <button
              key={f}
              type="button"
              ref={gpFluxo.itemRef(f)}
              className={"glass-pill-item btn-ghost btn-xs" + (fluxo === f ? " active" : "")}
              onClick={() => setFluxo(f)}
            >
              {f === "IMP" ? "Importação" : "Exportação"}
            </button>
          ))}
        </div>

        <div className="glass-pill-track" style={{ display: "flex", gap: 4 }}>
          <GlassPill {...gpAba} />
          {(
            [
              ["mercado", "Mercado"],
              ["radar", "Radar Internacional"],
            ] as [Aba, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              ref={gpAba.itemRef(key)}
              className={"glass-pill-item btn-ghost btn-xs" + (aba === key ? " active" : "")}
              onClick={() => setAba(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: "10px 14px" }}>
        <strong>{sh4}</strong>{" "}
        <span style={{ marginLeft: 8 }}>
          {mercado?.descricao?.pt || (carregando ? "Carregando…" : "—")}
        </span>
      </div>

      {aba === "mercado" && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">{fluxo === "IMP" ? "Importado (FOB)" : "Exportado (FOB)"}</div>
              <div className="kpi-value">{totais?.fobUsd != null ? `US$ ${nfUsd.format(totais.fobUsd)}` : "—"}</div>
              <div className="kpi-foot">2024 → hoje</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Peso líquido</div>
              <div className="kpi-value">{totais?.kg != null ? `${nfUsd.format(totais.kg)} kg` : "—"}</div>
              <div className="kpi-foot">mesmo período</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Preço médio</div>
              <div className="kpi-value">{totais?.usdPorKg != null ? `US$ ${totais.usdPorKg}/kg` : "—"}</div>
              <div className="kpi-foot">FOB ÷ kg</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Municípios no fluxo</div>
              <div className="kpi-value">{totais?.municipios != null ? nfInt.format(totais.municipios) : "—"}</div>
              <div className="kpi-foot">com registro no período</div>
            </div>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div className="panel-head">Movimento mensal (US$ FOB)</div>
            <div className="cmx-bars">
              {(mercado?.serieMensal || []).map((s, i, arr) => (
                <i
                  key={`${s.ano}-${s.mes}`}
                  className={i >= arr.length - 3 ? "hot" : undefined}
                  style={{ height: `${Math.max(3, Math.round((100 * (s.fobUsd || 0)) / maxFobMes))}%` }}
                  title={`${String(s.mes).padStart(2, "0")}/${s.ano} — US$ ${nfUsd.format(s.fobUsd || 0)}`}
                />
              ))}
            </div>
          </div>

          <div className="cmx-grid">
            <div className="panel" style={{ padding: 14 }}>
              <div className="panel-head">
                {fluxo === "IMP" ? "De onde vem" : "Para onde vai"} — países
              </div>
              <table className="cmx-tbl">
                <thead>
                  <tr>
                    <th>País</th>
                    <th className="num">US$ FOB</th>
                    <th className="num">US$/kg</th>
                    <th style={{ width: 110 }}>Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {(mercado?.topPaises || []).map((p) => (
                    <tr key={`${p.iso3}-${p.pais}`}>
                      <td>
                        <span className="cmx-pais">
                          <Bandeira iso3={p.iso3} />
                          {p.pais || "—"}
                        </span>
                      </td>
                      <td className="num">{nfUsd.format(p.fobUsd || 0)}</td>
                      <td className="num">{p.usdPorKg != null ? p.usdPorKg : "—"}</td>
                      <td>
                        <span className="cmx-share">
                          <i style={{ width: `${Math.min(100, p.sharePct || 0)}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel" style={{ padding: 14 }}>
              <div className="panel-head">Onde {fluxo === "IMP" ? "entra" : "sai"} — municípios</div>
              <table className="cmx-tbl">
                <thead>
                  <tr>
                    <th>Município</th>
                    <th className="num">US$ FOB</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(mercado?.topMunicipios || []).map((m) => (
                    <tr key={`${m.municipio}-${m.uf}`}>
                      <td>
                        {m.municipio || "—"} <span style={{ opacity: 0.6 }}>· {m.uf}</span>
                      </td>
                      <td className="num">{nfUsd.format(m.fobUsd || 0)}</td>
                      <td className="num">{m.sharePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {(mercado?.vias || []).map((v) => (
                  <span key={v.via || "?"} className="tag">
                    {v.via || "—"} · {v.sharePct}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {aba === "radar" && (
        <div className="panel" style={{ padding: 14 }}>
          <div className="panel-head">
            Prováveis {fluxo === "IMP" ? "importadores" : "exportadores"} — {radar?.descricao || sh4}
          </div>
          <p className="cmx-nota">
            Inferência de dados públicos (fluxo por município + cadastro oficial + RFB). Indica
            probabilidade, não afirmação de operação — valores só aparecem agregados, nunca por empresa.
          </p>
          <table className="cmx-tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>CNPJ</th>
                <th>Cidade</th>
                <th>Perfil</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {(radar?.candidatos || []).map((c) => {
                const perfil = PERFIL_LABEL[c.perfil] || PERFIL_LABEL.regiao_do_fluxo;
                return (
                  <tr key={c.cnpj}>
                    <td>
                      {c.empresa}
                      <div style={{ opacity: 0.6 }}>{c.cnae || ""}</div>
                    </td>
                    <td className="num">{fmtCnpj(c.cnpj)}</td>
                    <td>
                      {c.municipio || "—"} <span style={{ opacity: 0.6 }}>· {c.uf || ""}</span>
                    </td>
                    <td>
                      <span className={perfil.cls}>{perfil.label}</span>
                    </td>
                    <td className="num">{c.score}</td>
                  </tr>
                );
              })}
              {!carregando && (radar?.candidatos || []).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.6 }}>
                    {radar?.disponivel === false
                      ? "Base analítica indisponível neste ambiente."
                      : "Nenhum candidato para este produto/fluxo."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
