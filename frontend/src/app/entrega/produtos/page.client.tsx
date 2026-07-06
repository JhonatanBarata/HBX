"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — aba "Produtos" do app (skin entrega, cara de app).
//  · Lista de produtos em cards (nome · unidade · preço · badge "Logística")
//    + estado vazio honesto. Arquivados aparecem apagados (is-off) no fim.
//  · "Novo produto" / tocar num card → EDITOR (1 coluna, app-like):
//      nome · unidade (Galão | kg | Unidade) · preço · toggle "Usa na Logística".
//    Inativar / reativar no próprio editor.
//  Reusa 100% os endpoints prontos (/products) — ver produtos-api.ts.
//  ZERO jargão ERP, ZERO texto explicativo em parágrafo (Lei do plano).
// ================================================================

import { useCallback, useEffect, useState } from "react";

import { CascaLoading, CascaView } from "@/components/casca";

import { EntregaScaffold } from "../EntregaScaffold";
import { I, ICON_PATHS } from "../icons";
import {
  type ProdutoItem,
  type UnidadeProduto,
  criarProduto,
  editarProduto,
  fmtPreco,
  inativarProduto,
  listProdutosTodos,
  precoReais,
  reativarProduto,
  unidadeLabel,
} from "../produtos-api";

type View = { tela: "lista" } | { tela: "editor"; item: ProdutoItem | null };

const UNIDADES: Array<{ v: UnidadeProduto; label: string }> = [
  { v: "galao", label: "Galão" },
  { v: "kg", label: "kg" },
  { v: "un", label: "Unidade" },
];

export function EntregaProdutos() {
  const [view, setView] = useState<View>({ tela: "lista" });

  return (
    <EntregaScaffold title="Produtos">
      <ProdutoLista
        onNovo={() => setView({ tela: "editor", item: null })}
        onAbrir={(item) => setView({ tela: "editor", item })}
      />

      {/* MOBILE-CASCA/W6 — editor empilha por CIMA com IR/VOLTAR (CascaView). */}
      {view.tela === "editor" ? (
        <CascaView
          title={view.item ? "Editar produto" : "Novo produto"}
          onClose={() => setView({ tela: "lista" })}
        >
          <ProdutoEditor item={view.item} onSair={() => setView({ tela: "lista" })} />
        </CascaView>
      ) : null}
    </EntregaScaffold>
  );
}

// ── LISTA ────────────────────────────────────────────────────────────────────
function ProdutoLista({ onNovo, onAbrir }: { onNovo: () => void; onAbrir: (p: ProdutoItem) => void }) {
  const [itens, setItens] = useState<ProdutoItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await listProdutosTodos();
      // Ativos primeiro; dentro, ordem alfabética (o backend já ordena por sortOrder/id).
      const ordenados = [...r].sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived"));
      setItens(ordenados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar produtos");
      setItens([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      {itens === null ? (
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
      ) : itens.length === 0 ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            <I d={ICON_PATHS.produtos} size={40} />
          </div>
          <div className="ent-empty-title">Nenhum produto ainda</div>
        </div>
      ) : (
        <div className="ent-list">
          {itens.map((p) => {
            const arquivado = p.status === "archived";
            return (
              <button
                type="button"
                className={`ent-card${arquivado ? " is-off" : ""}`}
                key={p.id}
                onClick={() => onAbrir(p)}
              >
                <div className="ent-card-main">
                  <div className="ent-card-name">{p.name}</div>
                  <div className="ent-card-sub">
                    {unidadeLabel(p.unidade)} · {fmtPreco(precoReais(p))}
                    {p.usaLogistica ? " · Logística" : ""}
                    {arquivado ? " · Inativo" : ""}
                  </div>
                </div>
                <span className="ent-card-chevron" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--primary" onClick={onNovo}>
          Novo produto
        </button>
      </div>
    </>
  );
}

// ── EDITOR (criar / editar) — 1 coluna, app-like ─────────────────────────────
function ProdutoEditor({ item, onSair }: { item: ProdutoItem | null; onSair: () => void }) {
  const editando = item != null;
  const [nome, setNome] = useState(item?.name ?? "");
  const [unidade, setUnidade] = useState<UnidadeProduto>(normalizaUnidade(item?.unidade));
  const [preco, setPreco] = useState(item ? precoReais(item).toFixed(2).replace(".", ",") : "");
  const [usaLogistica, setUsaLogistica] = useState(item ? item.usaLogistica : true);
  const arquivado = item?.status === "archived";

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeSalvar = nome.trim().length >= 2 && !salvando;

  const salvar = useCallback(async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      const priceCents = Math.max(0, Math.round(Number(preco.replace(",", ".")) * 100)) || 0;
      const payload = { name: nome.trim(), unidade, priceCents, usaLogistica };
      if (editando && item) {
        await editarProduto(item.id, payload);
      } else {
        await criarProduto(payload);
      }
      onSair();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
      setSalvando(false);
    }
  }, [podeSalvar, preco, nome, unidade, usaLogistica, editando, item, onSair]);

  const alternarAtivo = useCallback(async () => {
    if (!item) return;
    setSalvando(true);
    setErro(null);
    try {
      if (arquivado) {
        await reativarProduto(item.id);
      } else {
        await inativarProduto(item.id);
      }
      onSair();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar");
      setSalvando(false);
    }
  }, [item, arquivado, onSair]);

  return (
    <>
      <div className="ent-form">
        <label className="ent-field">
          <span className="ent-field-label">Nome</span>
          <input
            className="ent-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Galão 20L"
            autoFocus={!editando}
          />
        </label>

        <div className="ent-field-label ent-section">Unidade</div>
        <div className="ent-chips">
          {UNIDADES.map((u) => (
            <button
              type="button"
              key={u.v}
              className={`ent-chip${unidade === u.v ? " is-on" : ""}`}
              onClick={() => setUnidade(u.v)}
            >
              {u.label}
            </button>
          ))}
        </div>

        <label className="ent-field">
          <span className="ent-field-label">Preço</span>
          <input
            className="ent-input"
            type="text"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            placeholder="0,00"
          />
        </label>

        <button
          type="button"
          className="ent-toggle"
          onClick={() => setUsaLogistica((v) => !v)}
          aria-pressed={usaLogistica}
        >
          <span className="ent-toggle-label">Usa na Logística</span>
          <span className={`ent-switch${usaLogistica ? " is-on" : ""}`} aria-hidden="true" />
        </button>

        {editando ? (
          <button type="button" className="ent-btn ent-btn--ghost" onClick={() => void alternarAtivo()} disabled={salvando}>
            {arquivado ? "Reativar produto" : "Inativar produto"}
          </button>
        ) : null}

        {erro ? <div className="ent-erro">{erro}</div> : null}
      </div>

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--primary" onClick={() => void salvar()} disabled={!podeSalvar}>
          {salvando ? "Salvando…" : editando ? "Salvar" : "Cadastrar produto"}
        </button>
      </div>
    </>
  );
}

// Casa a unidade gravada (texto livre no backend) com um dos 3 chips do app.
function normalizaUnidade(u: string | null | undefined): UnidadeProduto {
  const v = String(u || "").toLowerCase();
  if (v === "kg") return "kg";
  if (v === "un" || v === "unidade") return "un";
  return "galao";
}
