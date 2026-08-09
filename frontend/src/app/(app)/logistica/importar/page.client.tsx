"use client";

// F4 (27/07, PR27072026-ROTA-3-NIVEIS) — "MÁQUINA DE ENGOLIR LISTA PODRE": boca
// única de importação (arquivo/texto/foto) + quarentena. Lição da empresa 41
// (245 clientes importados direto na base viva, endereços podres — a operação
// travou 2 semanas): nada aqui vira CustomerProfile sozinho. O lote nasce
// RASCUNHO, o sanitizador (MESMA régua CNEFE do Gerenciador/Correção em massa,
// backend/src/logistica/logistica-importacao-sanitizacao.util.ts) pinta cada
// item verde/vermelho, e só EFETIVAR (lote inteiro ou itens selecionados) cria
// cliente de verdade — a agenda nunca enxerga rascunho.
//
// Design system (5 Leis): casco reusa .log-agenda/.log-agenda__surface/
// .log-agenda__head; tiles reusam .log-agenda-impact__stat; a lista
// verde/vermelho reusa .log-saude__lista/__row/__semaforo (MESMO padrão visual
// da Saúde da Base — é o equivalente, no painel web, da lista "Cliente-problema"
// do Gerenciador, que vive no app Android/webview, runtime diferente deste
// bundle); progresso/resumo/erro reusam .imp-progress/.imp-summary/.imp-errs
// (screens.css, do modal de import de Contatos/Produtos); zonas novas em
// .log-quar-* (logistica-agenda.css). Inline aqui é só LAYOUT — zero cor solta.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS, PhotoLightbox } from "@/components/hbx/shell";
import { apiFetch, getApiBase, getToken } from "@/lib/api";

type LoteOrigem = "ARQUIVO" | "TEXTO" | "FOTO";
type LoteStatus = "RASCUNHO" | "CONFERIDO" | "EFETIVADO" | "DESCARTADO";
type ItemStatus = "VERDE" | "VERMELHO" | "PENDENTE";

type Lote = {
  id: string;
  origem: LoteOrigem;
  nomeArquivo: string | null;
  cidadePadrao: string | null;
  ufPadrao: string | null;
  status: LoteStatus;
  totalItens: number;
  totalVerdes: number;
  totalVermelhos: number;
  totalPendentes: number;
  totalEfetivados: number;
  createdAt: string;
  updatedAt: string;
};

type Item = {
  id: string;
  linha: number;
  bruto: string;
  nome: string | null;
  telefone: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  diasSemana: number[];
  produtoTexto: string | null;
  produtoId: number | null;
  qtd: number | null;
  valorUnit: number | null;
  statusSanitizacao: ItemStatus;
  motivoProblema: string | null;
  temFoto: boolean;
  customerProfileId: string | null;
  efetivadoAt: string | null;
};

type ProdutoOption = { id: number; nome: string; unidade: string | null; usaLogistica: boolean; precoCatalogo: number | null };

const DIA_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const ORIGEM_LABEL: Record<LoteOrigem, string> = { ARQUIVO: "Arquivo", TEXTO: "Texto colado", FOTO: "Foto" };
const STATUS_LABEL: Record<LoteStatus, string> = { RASCUNHO: "Rascunho", CONFERIDO: "Conferido", EFETIVADO: "Efetivado", DESCARTADO: "Descartado" };
const STATUS_CLASS: Record<LoteStatus, string> = { RASCUNHO: "is-rascunho", CONFERIDO: "is-conferido", EFETIVADO: "is-efetivado", DESCARTADO: "is-descartado" };

function humanError(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível completar a ação.";
}

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function ImportarLogisticaClient() {
  const [lotesRecentes, setLotesRecentes] = useState<Lote[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(true);
  const [loteAtual, setLoteAtual] = useState<Lote | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [itemPage, setItemPage] = useState(1);
  const [itemTotalPages, setItemTotalPages] = useState(1);
  const [filtroStatus, setFiltroStatus] = useState<"" | ItemStatus>("");
  const [loadingLote, setLoadingLote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [correcaoItem, setCorrecaoItem] = useState<Item | null>(null);
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);

  const carregarLotes = useCallback(() => {
    setLoadingLotes(true);
    return apiFetch<{ items: Lote[] }>("/logistica/importacao/lotes")
      .then((res) => setLotesRecentes(res.items))
      .catch(() => { /* lista recente é só conveniência — falha aqui não trava a tela */ })
      .finally(() => setLoadingLotes(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { void carregarLotes(); }, [carregarLotes]);

  useEffect(() => {
    apiFetch<ProdutoOption[]>("/logistica/produtos").then(setProdutos).catch(() => setProdutos([]));
  }, []);

  const abrirLote = useCallback((id: string, page = 1, status: "" | ItemStatus = "") => {
    setLoadingLote(true);
    setError(null);
    setSelecionados(new Set());
    return apiFetch<{ lote: Lote; itens: Item[]; page: number; totalPages: number }>(
      `/logistica/importacao/lote/${id}?page=${page}${status ? `&status=${status}` : ""}`,
    )
      .then((res) => {
        setLoteAtual(res.lote);
        setItens(res.itens);
        setItemPage(res.page);
        setItemTotalPages(res.totalPages);
        setFiltroStatus(status);
      })
      .catch((err: unknown) => setError(humanError(err)))
      .finally(() => setLoadingLote(false));
  }, []);

  const refrescar = useCallback(() => {
    if (!loteAtual) return Promise.resolve();
    return abrirLote(loteAtual.id, itemPage, filtroStatus);
  }, [loteAtual, itemPage, filtroStatus, abrirLote]);

  const voltar = useCallback(() => {
    setLoteAtual(null);
    setItens([]);
    void carregarLotes();
  }, [carregarLotes]);

  // ── criação de lote ────────────────────────────────────────────────────────
  const onCriado = useCallback(async (p: Promise<Lote>) => {
    setBusy("criando");
    setError(null);
    try {
      const lote = await p;
      await abrirLote(lote.id);
    } catch (err: unknown) {
      setError(humanError(err));
    } finally {
      setBusy(null);
    }
  }, [abrirLote]);

  const enviarArquivo = useCallback((file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    void onCriado(apiFetch<Lote>("/logistica/importacao/lote/arquivo", { method: "POST", body: fd }));
  }, [onCriado]);

  const enviarTexto = useCallback((texto: string, cidadePadrao: string, ufPadrao: string) => {
    void onCriado(apiFetch<Lote>("/logistica/importacao/lote/texto", {
      method: "POST",
      body: JSON.stringify({ texto, ...(cidadePadrao ? { cidadePadrao } : {}), ...(ufPadrao ? { ufPadrao } : {}) }),
    }));
  }, [onCriado]);

  const enviarFotos = useCallback((files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    void onCriado(apiFetch<Lote>("/logistica/importacao/lote/foto", { method: "POST", body: fd }));
  }, [onCriado]);

  // ── ações do lote ──────────────────────────────────────────────────────────
  const sanitizar = useCallback(async () => {
    if (!loteAtual) return;
    setBusy("sanitizando");
    setError(null);
    try {
      let restantes = 1;
      // Mesmo laço do pop-up "Correção em massa": repete até `restantes` zerar —
      // cada chamada tem orçamento próprio no backend, nunca trava a tela.
      while (restantes > 0) {
        const r = await apiFetch<{ restantes: number }>(`/logistica/importacao/lote/${loteAtual.id}/sanitizar`, { method: "POST" });
        restantes = r.restantes;
      }
      await refrescar();
    } catch (err: unknown) {
      setError(humanError(err));
    } finally {
      setBusy(null);
    }
  }, [loteAtual, refrescar]);

  const efetivar = useCallback(async () => {
    if (!loteAtual) return;
    setBusy("efetivando");
    setError(null);
    try {
      const itemIds = selecionados.size > 0 ? [...selecionados] : undefined;
      await apiFetch(`/logistica/importacao/lote/${loteAtual.id}/efetivar`, {
        method: "POST",
        body: JSON.stringify({ ...(itemIds ? { itemIds } : {}) }),
      });
      await refrescar();
    } catch (err: unknown) {
      setError(humanError(err));
    } finally {
      setBusy(null);
    }
  }, [loteAtual, selecionados, refrescar]);

  const descartar = useCallback(async () => {
    if (!loteAtual) return;
    if (!window.confirm("Descartar este lote? Clientes já efetivados continuam existindo — só o rascunho fecha.")) return;
    setBusy("descartando");
    setError(null);
    try {
      await apiFetch(`/logistica/importacao/lote/${loteAtual.id}/descartar`, { method: "POST" });
      voltar();
    } catch (err: unknown) {
      setError(humanError(err));
    } finally {
      setBusy(null);
    }
  }, [loteAtual, voltar]);

  const salvarCorrecao = useCallback(async (itemId: string, dto: Record<string, unknown>) => {
    if (!loteAtual) return;
    await apiFetch(`/logistica/importacao/lote/${loteAtual.id}/item/${itemId}`, { method: "PATCH", body: JSON.stringify(dto) });
    setCorrecaoItem(null);
    await refrescar();
  }, [loteAtual, refrescar]);

  const toggleSelecionado = useCallback((id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const verdesNaPagina = useMemo(() => itens.filter((i) => i.statusSanitizacao === "VERDE" && !i.customerProfileId), [itens]);

  return (
    <section className="log-agenda hbx-page-mobile-enter">
      <div className="log-agenda__surface">
        <header className="log-agenda__head">
          <div className="log-agenda__head-main">
            <div className="log-agenda__head-copy">
              <h2>Importar clientes</h2>
              <p>
                {loteAtual
                  ? "Só cliente CONFERIDO (verde) vira cadastro de verdade. Corrija o vermelho ou efetive só o que está pronto."
                  : "Arraste uma planilha, cole a lista do WhatsApp ou mande foto do caderno. Tudo entra em quarentena antes de virar cliente."}
              </p>
            </div>
          </div>
          {loteAtual && (
            <div className="log-agenda__actions">
              <button type="button" className="btn-ghost btn-xs" onClick={voltar}>
                <span aria-hidden>←</span> Novo lote
              </button>
            </div>
          )}
        </header>

        {error && (
          <div className="log-agenda__feedback is-error">
            <strong>Não deu</strong>
            <span>{error}</span>
          </div>
        )}

        {!loteAtual && (
          <>
            <CriacaoZonas
              busy={busy}
              onArquivo={enviarArquivo}
              onTexto={enviarTexto}
              onFotos={enviarFotos}
            />
            <h3 className="log-quar-subhead">Lotes recentes</h3>
            {loadingLotes && <p className="imp-progress">Carregando…</p>}
            {!loadingLotes && lotesRecentes.length === 0 && (
              <div className="emp-empty">
                <strong className="emp-empty__title">Nenhuma importação ainda</strong>
                <span className="emp-empty__text">Use uma das opções acima pra começar.</span>
              </div>
            )}
            <div className="log-quar-lotes">
              {lotesRecentes.map((l) => (
                <button key={l.id} type="button" className="log-quar-lote" onClick={() => void abrirLote(l.id)}>
                  <span className="log-quar-lote__main">
                    <span className="log-quar-lote__title">
                      {ORIGEM_LABEL[l.origem]}{l.nomeArquivo ? ` — ${l.nomeArquivo}` : ""}
                    </span>
                    <span className="log-quar-lote__sub">
                      {l.totalItens} item(ns) · {l.totalVerdes} verde(s) · {l.totalVermelhos} vermelho(s) · {fmtData(l.createdAt)}
                    </span>
                  </span>
                  <span className={`emp-role ${STATUS_CLASS[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {loteAtual && (
          <>
            <div className="log-saude__stats">
              <div className="log-agenda-impact__stat"><strong>{loteAtual.totalItens}</strong><span>No lote</span></div>
              <div className="log-agenda-impact__stat"><strong className="is-ok">{loteAtual.totalVerdes}</strong><span>Verde · pronto</span></div>
              <div className="log-agenda-impact__stat"><strong className="is-danger">{loteAtual.totalVermelhos}</strong><span>Vermelho · corrigir</span></div>
              <div className="log-agenda-impact__stat"><strong className="is-warn">{loteAtual.totalPendentes}</strong><span>Aguardando checagem</span></div>
              <div className="log-agenda-impact__stat"><strong className="is-ok">{loteAtual.totalEfetivados}</strong><span>Já virou cliente</span></div>
            </div>

            <div className="log-quar-detail__actions">
              {loteAtual.totalPendentes > 0 && (
                <button type="button" className="btn-teal" onClick={() => void sanitizar()} disabled={!!busy}>
                  <I d={ICONS.check} size={13} /> {busy === "sanitizando" ? "Conferindo…" : `Conferir ${loteAtual.totalPendentes} pendente(s)`}
                </button>
              )}
              {(loteAtual.totalVerdes > 0) && loteAtual.status !== "DESCARTADO" && (
                <button type="button" className="btn-teal" onClick={() => void efetivar()} disabled={!!busy}>
                  <I d={ICONS.plus} size={13} />
                  {busy === "efetivando" ? "Efetivando…" : selecionados.size > 0 ? `Efetivar ${selecionados.size} selecionado(s)` : `Efetivar ${loteAtual.totalVerdes} verde(s)`}
                </button>
              )}
              <button type="button" className="btn-ghost btn-xs" onClick={() => void refrescar()} disabled={!!busy}>
                <span aria-hidden>↻</span> Atualizar
              </button>
              {loteAtual.status !== "DESCARTADO" && (
                <button type="button" className="btn-ghost btn-xs" onClick={() => void descartar()} disabled={!!busy}>
                  <I d={ICONS.trash} size={13} /> Descartar lote
                </button>
              )}
            </div>

            <div className="log-saude__filtro glass-pill-track" role="tablist" aria-label="Filtrar por status">
              <FiltroPill filtro={filtroStatus} onChange={(f) => void abrirLote(loteAtual.id, 1, f)} />
            </div>

            {loadingLote && <p className="imp-progress">Carregando itens…</p>}

            {!loadingLote && itens.length === 0 && (
              <div className="emp-empty"><strong className="emp-empty__title">Nada aqui</strong><span className="emp-empty__text">Nenhum item neste filtro.</span></div>
            )}

            {verdesNaPagina.length > 0 && (
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={() => setSelecionados((prev) => {
                  const todosJaSelecionados = verdesNaPagina.every((i) => prev.has(i.id));
                  const next = new Set(prev);
                  verdesNaPagina.forEach((i) => (todosJaSelecionados ? next.delete(i.id) : next.add(i.id)));
                  return next;
                })}
              >
                {verdesNaPagina.every((i) => selecionados.has(i.id)) ? "Desmarcar" : "Selecionar"} os {verdesNaPagina.length} verde(s) desta página
              </button>
            )}

            <div className="log-saude__lista">
              {itens.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  selecionado={selecionados.has(item.id)}
                  onToggleSelecionado={() => toggleSelecionado(item.id)}
                  onAbrir={() => setCorrecaoItem(item)}
                />
              ))}
            </div>

            {itemTotalPages > 1 && (
              <div className="emp-pager">
                <button className="btn-ghost btn-xs" disabled={itemPage <= 1 || loadingLote} onClick={() => void abrirLote(loteAtual.id, itemPage - 1, filtroStatus)}>Anterior</button>
                <span className="emp-pager__info">Página {itemPage} de {itemTotalPages}</span>
                <button className="btn-ghost btn-xs" disabled={itemPage >= itemTotalPages || loadingLote} onClick={() => void abrirLote(loteAtual.id, itemPage + 1, filtroStatus)}>Próxima</button>
              </div>
            )}
          </>
        )}
      </div>

      {correcaoItem && (
        <CorrecaoModal
          item={correcaoItem}
          produtos={produtos}
          onClose={() => setCorrecaoItem(null)}
          onSalvar={(dto) => salvarCorrecao(correcaoItem.id, dto)}
        />
      )}
    </section>
  );
}

function FiltroPill({ filtro, onChange }: { filtro: "" | ItemStatus; onChange: (f: "" | ItemStatus) => void }) {
  const opts: Array<{ key: "" | ItemStatus; label: string }> = [
    { key: "", label: "Todos" }, { key: "VERMELHO", label: "Vermelho" }, { key: "PENDENTE", label: "Pendente" }, { key: "VERDE", label: "Verde" },
  ];
  const pill = useGlassPill<HTMLButtonElement>(filtro);
  return (
    <>
      <GlassPill {...pill} />
      {opts.map((o) => (
        <button
          key={o.key || "todos"}
          ref={pill.itemRef(o.key)}
          type="button"
          role="tab"
          aria-selected={filtro === o.key}
          className={`log-saude__filtro-tab glass-pill-item${filtro === o.key ? " is-active" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

function ItemRow({ item, selecionado, onToggleSelecionado, onAbrir }: {
  item: Item; selecionado: boolean; onToggleSelecionado: () => void; onAbrir: () => void;
}) {
  const podeSelecionar = item.statusSanitizacao === "VERDE" && !item.customerProfileId;
  const sub = item.customerProfileId
    ? "Já efetivado"
    : item.motivoProblema || (item.endereco ? item.endereco : "Sem endereço reconhecido");
  return (
    <div className="log-saude__row is-clickable" onClick={onAbrir} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onAbrir()}>
      {podeSelecionar ? (
        <input
          type="checkbox"
          checked={selecionado}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelecionado}
          aria-label={`Selecionar ${item.nome || "item"} pra efetivar`}
        />
      ) : (
        <span className={`log-saude__semaforo log-saude__semaforo--${item.statusSanitizacao.toLowerCase()}`} aria-hidden />
      )}
      <span className="log-saude__copy">
        <span className="log-agenda-stop__name">{item.nome || `Linha ${item.linha}`}</span>
        <span className="log-agenda-import__row-sub">{sub}</span>
      </span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {item.temFoto && <span className="log-quar-item__tag"><I d={ICONS.image} size={11} /></span>}
        {item.diasSemana.length > 0 && <span className="log-quar-item__tag">{item.diasSemana.map((d) => DIA_LABEL[d - 1]).join("/")}</span>}
        <button type="button" className="btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onAbrir(); }}>
          {item.customerProfileId ? "Ver" : "Corrigir"}
        </button>
      </span>
    </div>
  );
}

// ── zonas de criação (arquivo / texto / foto) ─────────────────────────────────
function CriacaoZonas({ busy, onArquivo, onTexto, onFotos }: {
  busy: string | null;
  onArquivo: (f: File) => void;
  onTexto: (texto: string, cidade: string, uf: string) => void;
  onFotos: (files: File[]) => void;
}) {
  const [tab, setTab] = useState<"arquivo" | "texto" | "foto">("texto");
  const pill = useGlassPill<HTMLButtonElement>(tab);
  const [dragOver, setDragOver] = useState(false);
  const [texto, setTexto] = useState("");
  const [cidadePadrao, setCidadePadrao] = useState("");
  const [ufPadrao, setUfPadrao] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const tabs: Array<{ key: "arquivo" | "texto" | "foto"; label: string; icon: string[] }> = [
    { key: "texto", label: "Colar texto", icon: ICONS.msg },
    { key: "arquivo", label: "Planilha", icon: ICONS.upload },
    { key: "foto", label: "Foto", icon: ICONS.image },
  ];

  return (
    <div>
      <div className="log-quar-tabs glass-pill-track" role="tablist" aria-label="Como importar">
        <GlassPill {...pill} />
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={pill.itemRef(t.key)}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`log-quar-tab glass-pill-item${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <I d={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "texto" && (
        <div className="log-quar-zone">
          <textarea
            className="field-dark log-quar-textarea"
            placeholder="Cole a lista — 1 cliente por linha."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="log-quar-row">
            <input className="field-dark" placeholder="Cidade padrão (opcional)" value={cidadePadrao} onChange={(e) => setCidadePadrao(e.target.value)} />
            <input className="field-dark" style={{ maxWidth: 90 }} placeholder="UF" maxLength={2} value={ufPadrao} onChange={(e) => setUfPadrao(e.target.value.toUpperCase())} />
            <button
              type="button"
              className="btn-teal"
              disabled={!texto.trim() || !!busy}
              onClick={() => onTexto(texto, cidadePadrao.trim(), ufPadrao.trim())}
            >
              {busy === "criando" ? "Importando…" : "Importar texto"}
            </button>
          </div>
          <p className="imp-progress">Linha ilegível não é perdida — ela entra vermelha, com o texto original guardado, pra você corrigir na mão.</p>
        </div>
      )}

      {tab === "arquivo" && (
        <div className="log-quar-zone">
          <div
            className={`log-quar-drop${dragOver ? " is-dragover" : ""}`}
            onClick={() => arquivoRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onArquivo(file);
            }}
          >
            <I d={ICONS.upload} size={22} />
            <span className="log-quar-drop__title">{busy === "criando" ? "Importando…" : "Arraste a planilha aqui"}</span>
            <span className="log-quar-drop__sub">.xlsx ou .csv — ou toque pra escolher o arquivo</span>
          </div>
          <input
            ref={arquivoRef}
            className="imp-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.target.value = ""; }}
          />
        </div>
      )}

      {tab === "foto" && (
        <div className="log-quar-zone">
          <div className="log-quar-drop" onClick={() => fotoRef.current?.click()}>
            <I d={ICONS.image} size={22} />
            <span className="log-quar-drop__title">{busy === "criando" ? "Enviando…" : "Foto do caderno/lista"}</span>
            <span className="log-quar-drop__sub">JPG, PNG ou PDF — no celular abre a câmera direto</span>
          </div>
          <input
            ref={fotoRef}
            className="imp-file"
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            multiple
            onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) onFotos(files); e.target.value = ""; }}
          />
          <p className="imp-progress">
            A transcrição automática da foto (IA de visão) é a próxima etapa — decisão comercial do dono ainda aberta.
            Por enquanto, a foto fica salva no item e você digita os dados olhando pra ela (botão &quot;Ver foto&quot; na correção).
          </p>
        </div>
      )}
    </div>
  );
}

// ── modal de correção (revalida na hora que salva) ────────────────────────────
function CorrecaoModal({ item, produtos, onClose, onSalvar }: {
  item: Item;
  produtos: ProdutoOption[];
  onClose: () => void;
  onSalvar: (dto: Record<string, unknown>) => Promise<void>;
}) {
  const [nome, setNome] = useState(item.nome ?? "");
  const [telefone, setTelefone] = useState(item.telefone ?? "");
  const [endereco, setEndereco] = useState(item.endereco ?? "");
  const [numero, setNumero] = useState(item.numero ?? "");
  const [bairro, setBairro] = useState(item.bairro ?? "");
  const [cidade, setCidade] = useState(item.cidade ?? "");
  const [uf, setUf] = useState(item.uf ?? "");
  const [cep, setCep] = useState(item.cep ?? "");
  const [dias, setDias] = useState<Set<number>>(new Set(item.diasSemana));
  const [produtoId, setProdutoId] = useState<string>(item.produtoId ? String(item.produtoId) : "");
  const [qtd, setQtd] = useState<string>(item.qtd != null ? String(item.qtd) : "1");
  const [valorUnit, setValorUnit] = useState<string>(item.valorUnit != null ? String(item.valorUnit) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const readOnly = !!item.customerProfileId;

  const verFoto = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/logistica/importacao/item/${item.id}/foto`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Não consegui abrir a foto.");
      const blob = await res.blob();
      setFoto(URL.createObjectURL(blob));
    } catch (err: unknown) {
      setError(humanError(err));
    }
  }, [item.id]);

  const toggleDia = (d: number) => setDias((prev) => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });

  const salvar = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSalvar({
        nome: nome.trim() || null,
        telefone: telefone.trim() || null,
        endereco: endereco.trim() || null,
        numero: numero.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        cep: cep.trim() || null,
        diasSemana: [...dias].sort((a, b) => a - b),
        produtoId: produtoId ? Number(produtoId) : null,
        ...(qtd ? { qtd: Number(qtd) } : {}),
        ...(valorUnit ? { valorUnit: Number(valorUnit) } : {}),
      });
    } catch (err: unknown) {
      setError(humanError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hbx-veil" onClick={onClose}>
      <div className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()}>
        <h3>
          {readOnly ? "Item já efetivado" : `Corrigir · linha ${item.linha}`}
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>
        <div className="ctt-form__body">
          <p className="imp-intro">Texto original: <em>{item.bruto}</em></p>
          {item.temFoto && (
            <button type="button" className="btn-ghost btn-xs" onClick={() => void verFoto()}>
              <I d={ICONS.image} size={13} /> Ver foto enviada
            </button>
          )}
          {!readOnly && item.motivoProblema && (
            <p className="hint ctt-form__err">{item.motivoProblema}</p>
          )}

          <div className="ctt-form__row">
            <div className="f"><label>Nome</label><input className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} disabled={readOnly} /></div>
            <div className="f"><label>Telefone</label><input className="field-dark" value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={readOnly} /></div>
          </div>
          <div className="f"><label>Endereço</label><input className="field-dark" value={endereco} onChange={(e) => setEndereco(e.target.value)} disabled={readOnly} /></div>
          <div className="ctt-form__row">
            <div className="f"><label>Número</label><input className="field-dark" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={readOnly} /></div>
            <div className="f"><label>CEP</label><input className="field-dark" value={cep} onChange={(e) => setCep(e.target.value)} disabled={readOnly} /></div>
          </div>
          <div className="ctt-form__row">
            <div className="f"><label>Bairro</label><input className="field-dark" value={bairro} onChange={(e) => setBairro(e.target.value)} disabled={readOnly} /></div>
            <div className="f"><label>Cidade</label><input className="field-dark" value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={readOnly} /></div>
          </div>
          <div className="f ctt-form__uf"><label>UF</label><input className="field-dark" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} disabled={readOnly} /></div>

          <div className="f">
            <label>Dia(s) da semana</label>
            <div className="log-quar-row">
              {DIA_LABEL.map((label, i) => {
                const d = i + 1;
                const ativo = dias.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`btn-ghost btn-xs${ativo ? " is-active" : ""}`}
                    aria-pressed={ativo}
                    disabled={readOnly}
                    onClick={() => toggleDia(d)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label>Produto</label>
              <select
                className="field-dark"
                value={produtoId}
                disabled={readOnly}
                onChange={(e) => {
                  setProdutoId(e.target.value);
                  const p = produtos.find((x) => String(x.id) === e.target.value);
                  if (p?.precoCatalogo != null && !valorUnit) setValorUnit(String(p.precoCatalogo));
                }}
              >
                <option value="">— sem produto (cliente entra sem plano de entrega) —</option>
                {produtos.filter((p) => p.usaLogistica).map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="f"><label>Qtd</label><input className="field-dark" type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} disabled={readOnly} /></div>
          </div>
          <div className="f"><label>Valor unitário</label><input className="field-dark" type="number" step="0.01" min={0} value={valorUnit} onChange={(e) => setValorUnit(e.target.value)} disabled={readOnly} /></div>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>
        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose}>{readOnly ? "Fechar" : "Cancelar"}</button>
          {!readOnly && (
            <button type="button" className="btn-teal" onClick={() => void salvar()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar e revalidar"}
            </button>
          )}
        </div>
      </div>
      {foto && <PhotoLightbox src={foto} name="Foto enviada" onClose={() => setFoto(null)} />}
    </div>
  );
}
