"use client";

// ENTREVISTA FORÇADA (31/07/2026) — o cadeado COM motivo escrito, nunca mudo.
// Enquanto a IA não souber o que a empresa faz, o que ela vende e como se
// apresenta, nenhum turno liga (o pré-voo do backend recusa: bot-activation.
// service.ts `resolveBlocked`). Este bloco é o lugar onde o dono responde as
// 3 perguntas SEM sair da tela — cada resposta some da lista na hora.
//
// As perguntas e as pendências vêm PRONTAS do servidor
// (GET /automation/perfil-ia → `pendencias`): a tela não reescreve regra.
//   1. o que a empresa faz  → PUT   /automation/perfil-ia { empresaFazTexto }
//   2. o que ela vende      → PATCH /vendas/catalogo-comercial (mesma porta da
//      tela de Vendas — o catálogo tem uma dona só)
//   3. como ela se apresenta → <IdentidadeEditor> (o MESMO do crachá)
//
// Design System: zero cor/borda em TSX; classes em hbx-theme/automacao.css.

import React, { useCallback, useEffect, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { IdentidadeEditor, type PerfilIa } from "./cracha";

// Espelha o retorno de GET /vendas/catalogo-comercial (vendas.service.ts).
type CatalogoCapacidade = { chave: string; ganho: string; resolve: string[] };
export type CatalogoView = {
  catalogo: {
    oQueVendemos: string;
    capacidades: CatalogoCapacidade[];
    paraQuem: string[];
    ancoraDePreco: string | null;
  } | null;
  pronto: boolean;
  lacunas: string[];
};

type PassoKey = "faz" | "vende" | "nome";

const PASSO_PERGUNTA: Record<PassoKey, string> = {
  faz: "O que a sua empresa faz?",
  vende: "O que a sua empresa vende?",
  nome: "Como a IA se apresenta?",
};

export function Entrevista({
  perfil,
  catalogo,
  podeEditar,
  onPerfil,
  onCatalogo,
}: {
  perfil: PerfilIa;
  catalogo: CatalogoView | null;
  podeEditar: boolean;
  onPerfil: (p: PerfilIa) => void;
  onCatalogo: (c: CatalogoView) => void;
}) {
  const feito: Record<PassoKey, boolean> = {
    faz: Boolean(perfil.empresaFaz),
    vende: perfil.catalogoPronto,
    nome: perfil.persona.completa,
  };
  const respondidas = (["faz", "vende", "nome"] as PassoKey[]).filter((k) => feito[k]).length;

  // Passo aberto: o primeiro que falta. Estado local puro — clicar em outro
  // passo troca o foco, responder um leva pro próximo sozinho.
  const primeiroAberto: PassoKey = !feito.faz ? "faz" : !feito.vende ? "vende" : "nome";
  const [aberto, setAberto] = useState<PassoKey>(primeiroAberto);

  return (
    <section className="auto-ent" aria-label="Entrevista da IA">
      <header className="auto-ent__head">
        <span className="auto-ent__ico" aria-hidden="true"><I d={ICONS.help} size={16} /></span>
        <div className="auto-ent__titulos">
          <strong className="auto-ent__title">A IA ainda não sabe o que sua empresa faz</strong>
          <span className="auto-ent__sub">Responda 3 perguntas pra liberar os turnos.</span>
        </div>
        <span className="auto-ent__contador">{respondidas} de 3</span>
      </header>

      {!podeEditar && (
        <p className="auto-ent__aviso">Só o dono ou o gerente responde estas perguntas.</p>
      )}

      <ol className="auto-ent__passos">
        <PassoLinha
          passo="faz"
          feito={feito.faz}
          aberto={aberto === "faz"}
          podeEditar={podeEditar}
          resumo={perfil.empresaFaz}
          onAbrir={() => setAberto("faz")}
        >
          <EmpresaFazEditor
            perfil={perfil}
            onPerfil={(p) => { onPerfil(p); setAberto(p.catalogoPronto ? "nome" : "vende"); }}
          />
        </PassoLinha>

        <PassoLinha
          passo="vende"
          feito={feito.vende}
          aberto={aberto === "vende"}
          podeEditar={podeEditar}
          resumo={catalogo?.catalogo?.oQueVendemos || null}
          onAbrir={() => setAberto("vende")}
        >
          <CatalogoEditor
            catalogo={catalogo}
            onCatalogo={(c) => { onCatalogo(c); if (c.pronto) setAberto("nome"); }}
          />
        </PassoLinha>

        <PassoLinha
          passo="nome"
          feito={feito.nome}
          aberto={aberto === "nome"}
          podeEditar={podeEditar}
          resumo={perfil.persona.nome}
          onAbrir={() => setAberto("nome")}
        >
          <IdentidadeEditor perfil={perfil} onPerfil={onPerfil} />
        </PassoLinha>
      </ol>
    </section>
  );
}

// ── Uma linha da entrevista: pergunta, estado e o editor quando aberta ───────
function PassoLinha({
  passo,
  feito,
  aberto,
  podeEditar,
  resumo,
  onAbrir,
  children,
}: {
  passo: PassoKey;
  feito: boolean;
  aberto: boolean;
  podeEditar: boolean;
  resumo: string | null;
  onAbrir: () => void;
  children: React.ReactNode;
}) {
  const mostrarEditor = aberto && podeEditar;
  return (
    <li className={"auto-ent__passo" + (feito ? " is-feito" : "") + (aberto ? " is-aberto" : "")}>
      <button type="button" className="auto-ent__pergunta" onClick={onAbrir} aria-expanded={mostrarEditor}>
        <span className="auto-ent__marca" aria-hidden="true">
          {feito ? <I d={ICONS.check} size={12} /> : null}
        </span>
        <span className="auto-ent__texto">
          <span className="auto-ent__label">{PASSO_PERGUNTA[passo]}</span>
          {feito && resumo && <span className="auto-ent__resumo">{resumo}</span>}
        </span>
      </button>
      {mostrarEditor && <div className="auto-ent__editor">{children}</div>}
    </li>
  );
}

// ── Passo 1: uma frase ──────────────────────────────────────────────────────
function EmpresaFazEditor({ perfil, onPerfil }: { perfil: PerfilIa; onPerfil: (p: PerfilIa) => void }) {
  const [texto, setTexto] = useState(perfil.empresaFaz ?? "");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (busy) return;
    if (!texto.trim()) { setErro("Escreva uma frase antes de salvar."); return; }
    setBusy(true);
    setErro(null);
    try {
      const res = await apiFetch<PerfilIa>("/automation/perfil-ia", {
        method: "PUT",
        body: JSON.stringify({ empresaFazTexto: texto.trim() }),
      });
      onPerfil(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auto-ent__form">
      <textarea
        className="field-dark auto-ent__area"
        rows={2}
        maxLength={280}
        value={texto}
        placeholder="Ex.: Entregamos água mineral em casa e no comércio."
        onChange={(e) => setTexto(e.target.value)}
        aria-label="O que a sua empresa faz"
      />
      {erro && <span className="auto-ent__erro">{erro}</span>}
      <div className="auto-ent__acoes">
        <button type="button" className="btn-teal btn-xs" onClick={() => void salvar()} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ── Passo 2: o catálogo (mesma porta da tela de Vendas) ─────────────────────
// A IA só pode AFIRMAR o que está aqui — é por isso que a pergunta existe.
// Os outros campos do catálogo (para quem serve, âncora de preço) continuam
// vivos: a tela lê e devolve intactos, sem apagar o que já foi preenchido lá.
function CatalogoEditor({ catalogo, onCatalogo }: { catalogo: CatalogoView | null; onCatalogo: (c: CatalogoView) => void }) {
  const [oQue, setOQue] = useState("");
  const [capacidades, setCapacidades] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [espelhado, setEspelhado] = useState(false);

  // Espelha o que veio do servidor uma única vez (o load é do hub, assíncrono).
  const espelhar = useCallback(() => {
    const c = catalogo?.catalogo;
    setOQue(c?.oQueVendemos || "");
    setCapacidades((c?.capacidades || []).map((cap) => (cap.resolve.length ? `${cap.ganho} | ${cap.resolve.join(", ")}` : cap.ganho)).join("\n"));
    setEspelhado(true);
  }, [catalogo]);

  useEffect(() => {
    if (espelhado || !catalogo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- espelha 1x o payload que chegou depois da montagem; guard `espelhado` impede laço
    espelhar();
  }, [catalogo, espelhado, espelhar]);

  if (!catalogo) {
    return <p className="auto-ent__aviso">O catálogo não abriu agora. Recarregue a página.</p>;
  }

  async function salvar() {
    if (busy) return;
    if (!oQue.trim()) { setErro("Diga em uma linha o que a empresa vende."); return; }
    const lista = capacidades.split("\n").map((l) => l.trim()).filter(Boolean).map((linha) => {
      const [ganho, dores] = linha.split("|");
      return { ganho: (ganho || "").trim(), resolve: (dores || "").split(",").map((s) => s.trim()).filter(Boolean) };
    }).filter((c) => c.ganho);
    if (!lista.length) { setErro("Escreva ao menos uma coisa que o cliente ganha."); return; }
    setBusy(true);
    setErro(null);
    try {
      const res = await apiFetch<CatalogoView>("/vendas/catalogo-comercial", {
        method: "PATCH",
        body: JSON.stringify({
          catalogo: {
            oQueVendemos: oQue.trim(),
            capacidades: lista,
            paraQuem: catalogo?.catalogo?.paraQuem ?? [],
            ancoraDePreco: catalogo?.catalogo?.ancoraDePreco ?? null,
          },
        }),
      });
      onCatalogo(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auto-ent__form">
      <label className="auto-ent__campo">
        <span className="field-label">O que vendemos (uma linha)</span>
        <input
          className="field-dark"
          maxLength={240}
          value={oQue}
          placeholder="Ex.: Galão de 20 litros com entrega no mesmo dia."
          onChange={(e) => setOQue(e.target.value)}
          aria-label="O que a empresa vende"
        />
      </label>
      <label className="auto-ent__campo">
        <span className="field-label">O que o cliente ganha — um por linha</span>
        <textarea
          className="field-dark auto-ent__area"
          rows={3}
          value={capacidades}
          placeholder={"Entrega no mesmo dia | atraso, cliente esperando\nPedido pelo WhatsApp"}
          onChange={(e) => setCapacidades(e.target.value)}
          aria-label="O que o cliente ganha"
        />
      </label>
      {erro && <span className="auto-ent__erro">{erro}</span>}
      <div className="auto-ent__acoes">
        <button type="button" className="btn-teal btn-xs" onClick={() => void salvar()} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
