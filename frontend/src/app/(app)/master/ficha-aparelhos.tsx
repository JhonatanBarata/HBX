"use client";

// PAINEL DO CLIENTE — os APARELHOS da empresa (PR05082026-VER-TELA, 05/08).
//
// Substitui a janela "Pulso" (frota inteira numa tabela solta) e a janela "Quem
// está online" (que MENTIA: lia sessão WEB, e o cliente que importa só vive no
// APK). A pergunta real do dono não é "quem está no app agora?", é "o André
// está no app agora?" — e ela nasce dentro da ficha DELE.
//
// Vocabulário: ⚪ é "fora do app", NUNCA "offline" — a gente lê o pulso do
// APLICATIVO, não o estado do celular no mundo.
//
// 🔴 E "NÃO REPORTA" NÃO É "FORA DO APP" (08/08). O pulso morreu na fusão de
// 07/08 junto com o `app.js`, então todo APK publicado tem `ultimaTelaAt` NULL —
// e esta coluna dizia "fora do app" com o heartbeat do mesmo aparelho de 2
// minutos atrás no banco. O dono viu no e22: "fala que está offline! e não
// está". Ausência de dado tem nome próprio; ela nunca vira uma afirmação.
//
// Backend (JWT + MasterGuard):
//   GET  /master/empresas/:companyId/aparelhos
//   GET  /master/pulso/:deviceId/trilha         (lazy, só ao expandir)
//   GET  /master/aparelhos/:deviceId/erros      (lazy, só ao expandir)
//   POST /master/aparelhos/:deviceId/derrubar   (2 cliques, com o NOME)
//   POST /master/aparelhos/:deviceId/remover    (2 cliques, com o NOME)
//   POST /master/aparelhos/:deviceId/espelho    (renova a janela de 60s)
//   GET  /master/aparelhos/:deviceId/espelho    (o último quadro)
//
// Visual: só classes centrais (.panel/.tbl/.ckm-*/.tag/.btn-*) — nada de cor,
// borda ou fonte solta nesta tela (5 Leis do design system).

import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

export type Aparelho = {
  deviceId: string;
  deviceName: string | null;
  pareadoEm: string | null;
  userId: number;
  userName: string;
  appVersion: string | null;
  ultimaTela: string | null;
  ultimaTelaAt: string | null;
  abertoAgora: boolean;
  falouEm: string | null;
  situacao: "no_app" | "fora_do_app" | "sem_pulso";
};

type TrilhaPonto = { tela: string; at: string };
type ErroDoCliente = { tela: string; msg: string; at: string };
type Quadro = {
  ativo: boolean;
  tela: string | null;
  html: string | null;
  tema: string | null;
  bodyClass: string | null;
  css: string | null;
  at: string | null;
};

// 10s: o app pulsa a cada 5s, então duas janelas de poll cabem entre dois
// refreshes — a bolinha nunca apaga por causa do relógio do painel.
const REFRESH_MS = 10000;
// O aparelho manda quadro a cada ~2s; buscar no mesmo ritmo é o "ao vivo".
const ESPELHO_QUADRO_MS = 2000;
// A janela do espelho no servidor vive 60s. Renovar a cada 20s dá três chances
// antes de expirar — fechar a aba (ou o notebook dormir) desliga sozinho.
const ESPELHO_RENOVA_MS = 20000;

function haQuantoTempo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function diaMes(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** O nome que a confirmação mostra — derrubar o celular errado é tirar alguém da rua. */
export function nomeDoAparelho(a: Aparelho): string {
  return a.deviceName || "aparelho sem nome";
}

/** Valor de atributo vindo do aparelho: nunca entra cru na marcação do iframe. */
function attr(valor: string | null): string {
  return String(valor || "").replace(/[<>"'&]/g, "");
}

/**
 * A MEDIDA DA TELA DO APARELHO (05/08) — o que faz o espelho ser 1:1.
 *
 * Sem ela o painel desenhava o app na largura do MONITOR: o dono via 4 clientes
 * onde o motorista via 6, e "ver a tela do cliente" mostrava OUTRA tela. O app
 * carimba `data-espelho-vw/vh/sy` na raiz da marcação; aqui a gente lê e passa
 * a desenhar num viewport do tamanho exato do celular, escalado pra caber.
 *
 * Aparelho velho não manda nada → 360×800, o retrato Android mais comum. É
 * palpite declarado, e um palpite de tamanho é melhor que o tamanho do monitor.
 */
export const ESPELHO_PADRAO = { vw: 360, vh: 800, sy: 0 };

export function lerMedidasEspelho(html: string | null): { vw: number; vh: number; sy: number } {
  const ler = (nome: string, fallback: number, teto: number) => {
    const achado = new RegExp(`data-espelho-${nome}="(-?[\\d.]+)"`).exec(String(html || ""));
    const n = achado ? Math.round(Number(achado[1])) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= teto && n > 0 ? n : fallback;
  };
  return {
    vw: ler("vw", ESPELHO_PADRAO.vw, 4000),
    vh: ler("vh", ESPELHO_PADRAO.vh, 4000),
    // Rolagem pode ser 0 legitimamente (topo da tela) — por isso lê separado.
    sy: (() => {
      const achado = /data-espelho-sy="(\d+)"/.exec(String(html || ""));
      const n = achado ? Math.round(Number(achado[1])) : NaN;
      return Number.isFinite(n) && n >= 0 && n <= 200000 ? n : 0;
    })(),
  };
}

/**
 * A réplica da tela, montada como documento completo. Vai num iframe
 * `sandbox=""` — sem script, sem formulário, sem navegação: o quadro é
 * MARCAÇÃO, e marcação de terceiro só é segura dentro de uma caixa fechada.
 *
 * A rolagem do aparelho é reproduzida com `margin-top` negativo no `html`:
 * dentro de um sandbox sem script não há como chamar `scrollTo`, e o negativo
 * empurra só o conteúdo do fluxo — a barra de cima e as abas de baixo são
 * `position: fixed` e ficam onde estão, exatamente como no celular.
 */
export function montarEspelho(q: Quadro): string {
  const html = q.html || "";
  const css = q.css || "";
  const { vw, sy } = lerMedidasEspelho(q.html);
  const ajuste = `html{width:${vw}px;overflow:hidden;}`
    + (sy > 0 ? `html{margin-top:-${sy}px;}` : "");
  /* 🔴 `data-luz` JUNTO COM `data-theme`. O app novo pinta claro/escuro por
     `data-luz` no <html> (é o que a folha do mock lê); o antigo usava
     `data-theme`. O campo do contrato é UM só (`tema`) — carimbar os dois
     atributos com ele custa 20 bytes e evita um espelho sempre escuro. */
  return `<!doctype html><html data-theme="${attr(q.tema)}" data-luz="${attr(q.tema)}"><head><meta charset="utf-8">`
    + `<style>${css}</style><style>${ajuste}</style></head>`
    + `<body class="${attr(q.bodyClass)}">${html}</body></html>`;
}

type Expandido = { deviceId: string; modo: "trilha" | "erros" } | null;

export function FichaAparelhos({ companyId }: { companyId: number }) {
  const [linhas, setLinhas] = useState<Aparelho[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<Expandido>(null);
  const [trilha, setTrilha] = useState<TrilhaPonto[] | null>(null);
  const [erros, setErros] = useState<ErroDoCliente[] | null>(null);
  // Confirmação de 2 cliques (emenda 4 do plano): `${deviceId}:${acao}`.
  const [armado, setArmado] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // VER TELA: o aparelho espelhado agora (null = ninguém).
  const [espelhando, setEspelhando] = useState<Aparelho | null>(null);
  const [quadro, setQuadro] = useState<Quadro | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A caixa onde o espelho cabe. Medida de verdade (ResizeObserver) porque a
  // escala do 1:1 é uma DIVISÃO: sem o tamanho real não dá pra saber o quanto
  // aumentar sem cortar. Redimensionar a janela do navegador reescala sozinho.
  const caixaEspelho = useRef<HTMLDivElement | null>(null);
  const [caixa, setCaixa] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = caixaEspelho.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(entradas => {
      const r = entradas[0]?.contentRect;
      if (r) setCaixa({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [espelhando, quadro?.html ? true : false]);

  // Nada de setState síncrono aqui (só dentro do then/catch), pra rodar dentro
  // de efeito/intervalo sem cascading render — mesmo padrão das outras janelas.
  const carregar = useCallback(() => {
    return apiFetch<Aparelho[]>(`/master/empresas/${companyId}/aparelhos`)
      .then(res => {
        setLinhas(Array.isArray(res) ? res : []);
        setErro(null);
      })
      .catch((err: unknown) => {
        setErro(err instanceof Error ? err.message : "Falha ao ler os aparelhos desta empresa.");
      });
  }, [companyId]);

  const carregarTrilha = useCallback((deviceId: string) => {
    return apiFetch<TrilhaPonto[]>(`/master/pulso/${encodeURIComponent(deviceId)}/trilha`)
      .then(res => setTrilha(Array.isArray(res) ? res : []))
      .catch(() => setTrilha([]));
  }, []);

  const carregarErros = useCallback((deviceId: string) => {
    return apiFetch<ErroDoCliente[]>(`/master/aparelhos/${encodeURIComponent(deviceId)}/erros`)
      .then(res => setErros(Array.isArray(res) ? res : []))
      .catch(() => setErros([]));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh só enquanto o painel está montado — o clearInterval no unmount
  // é o que impede o /master de continuar batendo depois que a ficha fechou.
  useEffect(() => {
    timer.current = setInterval(() => {
      carregar();
      if (expandido?.modo === "trilha") carregarTrilha(expandido.deviceId);
    }, REFRESH_MS);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [carregar, carregarTrilha, expandido]);

  // VER TELA: dois relógios enquanto a janela está aberta — um RENOVA a permissão
  // no servidor (60s de vida), o outro busca o quadro. Sair daqui (fechar, trocar
  // de aba, fechar a ficha) para os dois, e em 60s o aparelho para de mandar.
  useEffect(() => {
    if (!espelhando) return;
    const deviceId = espelhando.deviceId;
    let vivo = true;
    const renovar = () => { apiFetch(`/master/aparelhos/${encodeURIComponent(deviceId)}/espelho`, { method: "POST" }).catch(() => {}); };
    const puxar = () => {
      apiFetch<Quadro>(`/master/aparelhos/${encodeURIComponent(deviceId)}/espelho`)
        .then(res => { if (vivo) setQuadro(res || null); })
        .catch(() => {});
    };
    renovar();
    puxar();
    const tRenova = setInterval(renovar, ESPELHO_RENOVA_MS);
    const tQuadro = setInterval(puxar, ESPELHO_QUADRO_MS);
    return () => { vivo = false; clearInterval(tRenova); clearInterval(tQuadro); };
  }, [espelhando]);

  function expandir(deviceId: string, modo: "trilha" | "erros") {
    setArmado(null);
    if (expandido && expandido.deviceId === deviceId && expandido.modo === modo) {
      setExpandido(null);
      return;
    }
    setExpandido({ deviceId, modo });
    if (modo === "trilha") { setTrilha(null); carregarTrilha(deviceId); }
    else { setErros(null); carregarErros(deviceId); }
  }

  function verTela(a: Aparelho) {
    setArmado(null);
    setAviso(null);
    setQuadro(null);
    setEspelhando(a);
  }

  function fecharEspelho() {
    setEspelhando(null);
    setQuadro(null);
  }

  async function agir(a: Aparelho, acao: "derrubar" | "remover") {
    const chave = `${a.deviceId}:${acao}`;
    if (armado !== chave) { setArmado(chave); setAviso(null); return; }
    setBusy(chave);
    try {
      await apiFetch(`/master/aparelhos/${encodeURIComponent(a.deviceId)}/${acao}`, { method: "POST" });
      setAviso(`✓ ${nomeDoAparelho(a)} — ${acao === "derrubar" ? "sessão derrubada (volta pela tela de pareamento)" : "removido da lista"}.`);
      setArmado(null);
      if (expandido?.deviceId === a.deviceId) setExpandido(null);
      if (espelhando?.deviceId === a.deviceId) fecharEspelho();
      await carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Falha ao executar a ação no aparelho.");
    } finally {
      setBusy(null);
    }
  }

  const lista = linhas || [];
  const noApp = lista.filter(l => l.abertoAgora).length;
  const acaoStyle: React.CSSProperties = { minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" };

  return (
    <React.Fragment>
      <div className="panel-head">
        <h2>Aparelhos ({noApp} com o app aberto de {lista.length})</h2>
        <div className="meta" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {erro && <span className="ckm-error">{erro}</span>}
          <span className="ckm-feed-meta">atualiza sozinho a cada 10s</span>
        </div>
      </div>
      {aviso && (
        <div style={{ padding: "10px 16px 0", fontSize: "var(--fz-m1)", fontWeight: 700, color: aviso.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{aviso}</div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Aparelho e pessoa</th>
              <th>Situação</th>
              <th>Tela</th>
              <th>Pulso</th>
              <th>Versão</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas === null && <tr><td colSpan={6} className="ckm-muted-cell">Carregando…</td></tr>}
            {linhas !== null && lista.length === 0 && (
              <tr><td colSpan={6} className="ckm-muted-cell">Nenhum aparelho pareado nesta empresa.</td></tr>
            )}
            {lista.map(l => {
              const armDerrubar = armado === `${l.deviceId}:derrubar`;
              const armRemover = armado === `${l.deviceId}:remover`;
              const ocupado = busy != null && busy.startsWith(l.deviceId);
              const aberto = expandido?.deviceId === l.deviceId ? expandido.modo : null;
              return (
                <React.Fragment key={l.deviceId}>
                  <tr className={aberto ? "sel" : undefined}>
                    <td onClick={() => expandir(l.deviceId, "trilha")} style={{ cursor: "pointer" }}>
                      <div className="co">
                        <strong>{nomeDoAparelho(l)}</strong>
                        <span className="sub2">{l.userName} · pareado {diaMes(l.pareadoEm)}</span>
                      </div>
                    </td>
                    <td>
                      {/* 🔴 TRÊS ESTADOS, não dois. "sem_pulso" = o app deste celular
                          não reporta tela (APK anterior ao conserto de 08/08): a
                          presença é DESCONHECIDA, e escrever "fora do app" ali era o
                          painel afirmando o que não sabe — com o heartbeat do mesmo
                          aparelho de minutos atrás na linha ao lado. */}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                        title={l.situacao === "sem_pulso"
                          ? `Este app não manda o pulso de tela. O aparelho falou com o servidor ${haQuantoTempo(l.falouEm)} — atualize o app para saber se ele está aberto.`
                          : undefined}>
                        <span className={"ckm-dot" + (l.abertoAgora ? " ok" : "")} />
                        {l.situacao === "no_app" ? "no app" : l.situacao === "sem_pulso" ? "não reporta" : "fora do app"}
                      </span>
                    </td>
                    <td>{l.ultimaTela || <span className="ckm-muted-cell">—</span>}</td>
                    <td>
                      {l.situacao === "sem_pulso"
                        ? <span className="ckm-muted-cell">falou {haQuantoTempo(l.falouEm)}</span>
                        : haQuantoTempo(l.ultimaTelaAt)}
                    </td>
                    <td className="ckm-feed-meta">{l.appVersion || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {/* Ver tela só existe com o app ABERTO: espelho de app fechado
                            seria um retrato velho com cara de ao vivo. */}
                        <button className="btn-teal" style={acaoStyle} disabled={!l.abertoAgora || ocupado}
                          title={l.abertoAgora ? "Ver a tela deste aparelho agora" : "Só com o app aberto"}
                          onClick={() => verTela(l)}>
                          Ver tela
                        </button>
                        <button className={"btn-ghost" + (armDerrubar ? " btn-danger" : "")} style={acaoStyle} disabled={ocupado}
                          onClick={() => agir(l, "derrubar")}>
                          {ocupado && armDerrubar ? "…" : armDerrubar ? `Derrubar ${nomeDoAparelho(l)}?` : "Derrubar"}
                        </button>
                        <button className={"btn-ghost" + (armRemover ? " btn-danger" : "")} style={acaoStyle} disabled={ocupado}
                          onClick={() => agir(l, "remover")}>
                          {ocupado && armRemover ? "…" : armRemover ? `Remover ${nomeDoAparelho(l)}?` : "Remover"}
                        </button>
                        <button className="btn-ghost" style={acaoStyle} onClick={() => expandir(l.deviceId, "trilha")}>
                          {aberto === "trilha" ? "▾ trilha" : "▸ trilha"}
                        </button>
                        <button className="btn-ghost" style={acaoStyle} onClick={() => expandir(l.deviceId, "erros")}>
                          {aberto === "erros" ? "▾ erros" : "▸ erros"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {aberto === "trilha" && (
                    <tr>
                      <td colSpan={6} className="ckm-detalhe-cell">
                        {trilha === null && <span className="ckm-muted-cell">Carregando a trilha…</span>}
                        {trilha !== null && trilha.length === 0 && (
                          <span className="ckm-muted-cell">Sem trilha hoje.</span>
                        )}
                        {trilha !== null && trilha.length > 0 && (
                          <span className="ckm-feed-meta">
                            {trilha.map(p => `${hora(p.at)} ${p.tela}`).join(" · ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  {aberto === "erros" && (
                    <tr>
                      <td colSpan={6} className="ckm-detalhe-cell">
                        {erros === null && <span className="ckm-muted-cell">Carregando os erros…</span>}
                        {erros !== null && erros.length === 0 && (
                          <span className="ckm-muted-cell">Nenhum erro apareceu pro cliente nos últimos 7 dias.</span>
                        )}
                        {erros !== null && erros.length > 0 && (
                          <div style={{ display: "grid", gap: 4 }}>
                            {erros.map((e, i) => (
                              // flexWrap + minWidth:0 = mensagem longa quebra em
                              // vez de esticar a linha (a mesma causa do
                              // transbordo da trilha, só que dentro do flex).
                              <div key={`${e.at}-${i}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0, fontSize: "var(--hbx-font-min)" }}>
                                <span className="ckm-feed-meta">{diaMes(e.at)} {hora(e.at)}</span>
                                <span className="ckm-feed-meta">{e.tela}</span>
                                <span>{e.msg}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "0 16px 14px", fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", lineHeight: 1.5 }}>
        Derrubar corta a sessão: o aparelho volta pela tela de pareamento. Remover também tira da lista — o mesmo celular
        reconecta nesta vaga quando parear de novo.
      </div>

      {espelhando && (() => {
        // 1:1 COM O CELULAR (05/08): o iframe tem o tamanho EXATO do viewport
        // dele (ex.: 360×800) e é ampliado por `transform: scale`. Escalar em
        // vez de alargar é o ponto — alargar mudaria a quebra de linha e o
        // número de cartões visíveis, que é justamente o que o dono precisa ver
        // igual. Como o conteúdo é DOM (não imagem), ampliar não borra: o texto
        // é redesenhado no tamanho novo — daí a "resolução" que ele pediu.
        const medidas = lerMedidasEspelho(quadro?.html || null);
        const escala = caixa
          ? Math.max(0.3, Math.min(caixa.w / medidas.vw, caixa.h / medidas.vh))
          : 1;
        // A janela nasce com a FORMA do aparelho e cresce até o limite da tela.
        const alturaMax = "calc(100dvh - 132px)";
        return (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) fecharEspelho(); }}>
          <div className="hbx-modal" role="dialog" aria-modal="true" aria-label={`Tela de ${nomeDoAparelho(espelhando)}`}
            style={{
              // Largura = altura disponível × a proporção do aparelho. É o que
              // faz a janela ser um celular na tela, sem tarja preta dos lados.
              width: `min(calc(${alturaMax} * ${medidas.vw} / ${medidas.vh}), calc(100vw - 24px))`,
              maxHeight: "calc(100dvh - 24px)",
              display: "flex",
              flexDirection: "column",
            }}>
            <header className="panel-head">
              <h2>{nomeDoAparelho(espelhando)}</h2>
              <div className="meta" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="ckm-feed-meta">
                  {quadro?.html
                    ? `${quadro.tela || "tela"} · ${medidas.vw}×${medidas.vh} · ${haQuantoTempo(quadro.at)}`
                    : "aguardando o aparelho…"}
                </span>
                <button type="button" className="btn-ghost" style={acaoStyle} onClick={fecharEspelho}>Fechar</button>
              </div>
            </header>
            <div ref={caixaEspelho} style={{ padding: "0 12px 12px", flex: 1, minHeight: 0, height: alturaMax, display: "flex", overflow: "hidden" }}>
              {quadro?.html ? (
                <iframe
                  // sandbox="" = sem script, sem form, sem navegação. O quadro é
                  // marcação de terceiro: só entra em caixa fechada.
                  sandbox=""
                  className="ckm-espelho-frame"
                  title={`Espelho de ${nomeDoAparelho(espelhando)}`}
                  srcDoc={montarEspelho(quadro)}
                  // Só valor DINÂMICO inline (a aparência vive em .ckm-espelho-frame):
                  // o tamanho é o do aparelho e a escala vem da caixa medida.
                  style={{ width: medidas.vw, height: medidas.vh, transform: `scale(${escala})` }}
                />
              ) : (
                <div className="ckm-muted-cell" style={{ padding: "24px 6px", lineHeight: 1.6 }}>
                  O aparelho manda a tela a cada 2 segundos enquanto esta janela estiver aberta.
                  Sem quadro em ~10s, o app pode estar sem sinal.
                </div>
              )}
            </div>
            <div style={{ padding: "0 16px 14px", fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Espelho do HBX, não do celular: só as telas do nosso app aparecem aqui, com a digitação mascarada.
              Fechar esta janela desliga o envio.
            </div>
          </div>
        </div>
        );
      })()}
    </React.Fragment>
  );
}
