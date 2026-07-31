"use client";

// COMEX — vendas/radar internacional (módulo NOVO 31/07, isolado do /vendas).
// N2: Mercado (mapa do SH4) + Radar (prováveis, SEM valor por empresa — embalagem
// jurídica no backend). N3: Notícias (RSS 3 idiomas, fonte nomeada + link out),
// PTAX oficial no cabeçalho e i18n PT/EN/ES restrito a ESTE módulo (i18n.ts).
// Contratos (gate 'comex'): GET /comex/status · /comex/busca?q= ·
// /comex/mercado?sh4=&fluxo= · /comex/radar?sh4=&fluxo= · /comex/noticias?lang= ·
// /comex/cambio
// Visual 100% em classe central (comex.css + kit) — zero hex/inline visual.

import "flag-icons/css/flag-icons.min.css";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { apiFetch } from "@/lib/api";
import { iso3ToIso2 } from "@/lib/iso-flags";

import { COMEX_LANGS, type ComexLang, comexT } from "./i18n";

type Fluxo = "IMP" | "EXP";
type Aba = "mercado" | "radar" | "noticias";

type BuscaItem = { sh4: string; descricao: string; descricaoEn?: string | null; descricaoEs?: string | null };
type Mercado = {
  disponivel: boolean;
  descricao?: { pt: string; en?: string | null; es?: string | null } | null;
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
type Noticia = { titulo: string; link: string; fonte: string; lang: "pt" | "en" | "es"; data: string | null; tags: string[] };
type Cambio = { moedas: Array<{ moeda: string; venda: number; dataCotacao: string }> };

const nfUsd = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const nfInt = new Intl.NumberFormat("pt-BR");
const nfBrl = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

const LANG_STORAGE_KEY = "hbx-comex-lang";

export function ComexClient() {
  const [q, setQ] = useState("");
  const [sugestoes, setSugestoes] = useState<BuscaItem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [sh4, setSh4] = useState<string>("4011");
  const [fluxo, setFluxo] = useState<Fluxo>("IMP");
  const [aba, setAba] = useState<Aba>("mercado");
  const [lang, setLang] = useState<ComexLang>("pt");
  const [mercado, setMercado] = useState<Mercado | null>(null);
  const [radar, setRadar] = useState<Radar | null>(null);
  const [noticias, setNoticias] = useState<Noticia[] | null>(null);
  const [filtroNoticias, setFiltroNoticias] = useState<"all" | ComexLang>("all");
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const buscaRef = useRef<number>(0);

  const t = comexT(lang);
  const gpFluxo = useGlassPill<HTMLButtonElement>(fluxo);
  const gpAba = useGlassPill<HTMLButtonElement>(aba, lang);
  const gpLang = useGlassPill<HTMLButtonElement>(lang);

  // Idioma persistido por usuário deste navegador (só do módulo Comex).
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LANG_STORAGE_KEY) : null;
    if (saved === "en" || saved === "es") {
      const timer = setTimeout(() => setLang(saved), 0);
      return () => clearTimeout(timer);
    }
  }, []);
  const trocarLang = (novo: ComexLang) => {
    setLang(novo);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, novo);
    } catch {
      /* modo anônimo */
    }
  };

  // Busca com debounce — todo setState dentro do timeout (regra do lint).
  useEffect(() => {
    const termo = q.trim();
    const id = ++buscaRef.current;
    const timer = setTimeout(
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
    return () => clearTimeout(timer);
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
    const timer = setTimeout(() => void carregar(sh4, fluxo), 0);
    return () => clearTimeout(timer);
  }, [sh4, fluxo, carregar]);

  // Notícias + câmbio: uma carga por visita (cache do backend segura o resto).
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const n = await apiFetch<{ itens: Noticia[] }>(`/comex/noticias`);
        setNoticias(n?.itens || []);
      } catch {
        setNoticias([]);
      }
      try {
        setCambio(await apiFetch<Cambio>(`/comex/cambio`));
      } catch {
        /* régua fica em "—" */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const maxFobMes = Math.max(1, ...(mercado?.serieMensal || []).map((s) => s.fobUsd || 0));
  const totais = mercado?.totais;
  const descProduto =
    (lang === "en" && mercado?.descricao?.en) ||
    (lang === "es" && mercado?.descricao?.es) ||
    mercado?.descricao?.pt;

  const PERFIL_LABEL: Record<Candidato["perfil"], { cls: string; label: string }> = {
    cnae_do_produto: { cls: "cmx-perfil produto", label: t("cnaeDoProduto") },
    trading_atacado: { cls: "cmx-perfil trading", label: t("tradingAtacado") },
    regiao_do_fluxo: { cls: "cmx-perfil", label: t("regiaoDoFluxo") },
  };

  const noticiasVisiveis = (noticias || []).filter((n) => filtroNoticias === "all" || n.lang === filtroNoticias);

  return (
    <div className="cmx-page">
      <div className="cmx-head">
        <div className="cmx-search">
          <input
            value={q}
            placeholder={t("buscaPlaceholder")}
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
                  <span>
                    {(lang === "en" && s.descricaoEn) || (lang === "es" && s.descricaoEs) || s.descricao}
                  </span>
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
              {f === "IMP" ? t("importacao") : t("exportacao")}
            </button>
          ))}
        </div>

        <div className="glass-pill-track" style={{ display: "flex", gap: 4 }}>
          <GlassPill {...gpAba} />
          {(
            [
              ["mercado", t("mercado")],
              ["radar", t("radar")],
              ["noticias", t("noticias")],
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

        <div className="glass-pill-track" style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <GlassPill {...gpLang} />
          {COMEX_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              ref={gpLang.itemRef(l)}
              className={"glass-pill-item btn-ghost btn-xs" + (lang === l ? " active" : "")}
              onClick={() => trocarLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="panel cmx-titlebar" style={{ padding: "10px 14px" }}>
        <span>
          <strong>{sh4}</strong>{" "}
          <span style={{ marginLeft: 8 }}>{descProduto || (carregando ? t("carregando") : "—")}</span>
        </span>
        <span className="cmx-cambio" title={t("ptaxLegenda")}>
          {(cambio?.moedas || []).map((m) => (
            <span key={m.moeda}>
              {m.moeda} <strong>{nfBrl.format(m.venda)}</strong>
            </span>
          ))}
          {!cambio?.moedas?.length && <span>—</span>}
        </span>
      </div>

      {aba === "mercado" && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">{fluxo === "IMP" ? t("importadoFob") : t("exportadoFob")}</div>
              <div className="kpi-value">{totais?.fobUsd != null ? `US$ ${nfUsd.format(totais.fobUsd)}` : "—"}</div>
              <div className="kpi-foot">{t("periodoDesde")}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">{t("pesoLiquido")}</div>
              <div className="kpi-value">{totais?.kg != null ? `${nfUsd.format(totais.kg)} kg` : "—"}</div>
              <div className="kpi-foot">{t("mesmoPeriodo")}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">{t("precoMedio")}</div>
              <div className="kpi-value">{totais?.usdPorKg != null ? `US$ ${totais.usdPorKg}/kg` : "—"}</div>
              <div className="kpi-foot">{t("fobPorKg")}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">{t("municipiosNoFluxo")}</div>
              <div className="kpi-value">{totais?.municipios != null ? nfInt.format(totais.municipios) : "—"}</div>
              <div className="kpi-foot">{t("comRegistro")}</div>
            </div>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div className="panel-head">{t("movimentoMensal")}</div>
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
              <div className="panel-head">{fluxo === "IMP" ? t("deOndeVem") : t("paraOndeVai")}</div>
              <table className="cmx-tbl">
                <thead>
                  <tr>
                    <th>{t("pais")}</th>
                    <th className="num">US$ FOB</th>
                    <th className="num">US$/kg</th>
                    <th style={{ width: 110 }}>{t("participacao")}</th>
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
              <div className="panel-head">{fluxo === "IMP" ? t("ondeEntra") : t("ondeSai")}</div>
              <table className="cmx-tbl">
                <thead>
                  <tr>
                    <th>{t("municipio")}</th>
                    <th className="num">US$ FOB</th>
                    <th className="num">%</th>
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
            {fluxo === "IMP" ? t("provaveisImportadores") : t("provaveisExportadores")} — {radar?.descricao || sh4}
          </div>
          <p className="cmx-nota">{t("notaInferencia")}</p>
          <table className="cmx-tbl">
            <thead>
              <tr>
                <th>{t("empresa")}</th>
                <th>CNPJ</th>
                <th>{t("cidade")}</th>
                <th>{t("perfil")}</th>
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
                    {radar?.disponivel === false ? t("baseIndisponivel") : t("semCandidatos")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {aba === "noticias" && (
        <div className="panel" style={{ padding: 14 }}>
          <div className="panel-head cmx-titlebar">
            <span>{t("noticias")}</span>
            <span style={{ display: "flex", gap: 6 }}>
              {(["all", ...COMEX_LANGS] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={"tag cmx-tagbtn" + (filtroNoticias === f ? " active" : "")}
                  onClick={() => setFiltroNoticias(f)}
                >
                  {f === "all" ? t("todas") : f.toUpperCase()}
                </button>
              ))}
            </span>
          </div>
          <p className="cmx-nota">{t("fonteAviso")}</p>
          <div className="cmx-news">
            {noticias === null && <span style={{ opacity: 0.6 }}>{t("carregando")}</span>}
            {noticias !== null && noticiasVisiveis.length === 0 && <span style={{ opacity: 0.6 }}>—</span>}
            {noticiasVisiveis.slice(0, 40).map((n) => (
              <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="cmx-news-item">
                <span className="cmx-news-fonte">
                  {n.fonte}
                  {n.data ? ` · ${new Date(n.data).toLocaleDateString()}` : ""}
                </span>
                <span className="cmx-news-titulo">{n.titulo}</span>
                {n.tags.length > 0 && (
                  <span className="cmx-news-tags">
                    {n.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
