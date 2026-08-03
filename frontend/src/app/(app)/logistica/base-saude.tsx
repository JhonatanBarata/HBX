"use client";

// S7 (25/07, PR25072026-ROTA-CONFERIDA) — "Saúde da base": GET /logistica/base-saude
// roda a MESMA lente da S3 (semáforo de confiança do pino, logistica-conferencia.util.ts)
// pro TENANT INTEIRO, não só a rota de hoje. Tese do dono: o APK é o ÚLTIMO filtro —
// endereço se arruma na véspera, no PC; esta tela transforma a acusação pontual
// ("2 pendências na sua rota") em serviço ("154 clientes da base precisam de pino — 7 se
// resolvem sozinhos na próxima entrega").
//
// Design system (5 Leis, docs/Rules/FRONTEND.md): stat tiles reusam a MESMA pintura de
// .log-agenda-impact__stat (preview de impacto da agenda); filtro por semáforo usa Glass
// Pill (Lei nº2 — todo grupo de chips com 1 ativo por vez); zero cor nova — só os tokens
// --hbx-success/warning/danger já usados no resto de logistica-agenda.css/kit.css.
// Read-only: esta tela só GET, nunca chama nada que grave.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { apiFetch } from "@/lib/api";

type Semaforo = "verde" | "amarelo" | "vermelho";

// Espelha MotivoConferencia do backend (logistica-conferencia.util.ts). Os 3 últimos
// (fora_do_casulo/perna_outlier/rota_degradada) NUNCA chegam aqui — o serviço filtra
// regra de rota antes de responder (S7-SAUDE-DA-BASE.md) — mas o tipo/label ficam
// completos por honestidade com o contrato, não por expectativa de uso.
type Motivo =
  | "sem_pino"
  | "pino_compartilhado"
  | "fora_do_casulo"
  | "perna_outlier"
  | "diverge_gps_ouro"
  | "geocode_nao_provado_em_campo"
  | "fonte_nao_confiavel"
  | "nunca_entregue"
  | "rota_degradada";

type BaseSaudeCliente = {
  id: string;
  nome: string | null;
  semaforo: Semaforo;
  motivos: Motivo[];
  localId: string | null;
  localApelido: string | null;
  resolveSozinho: boolean;
};

type BaseSaudeResult = {
  totalClientes: number;
  verdes: number;
  amarelos: number;
  vermelhos: number;
  resolvemSozinhos: number;
  percentVerde: number;
  clientes: BaseSaudeCliente[];
};

// Motivo técnico → frase curta em PT-BR (linguagem humana, nunca o nome da regra).
const MOTIVO_LABEL: Record<Motivo, string> = {
  sem_pino: "Sem localização cadastrada",
  pino_compartilhado: "Localização igual à de outro cliente",
  fora_do_casulo: "Fora do agrupamento do dia",
  perna_outlier: "Trecho fora do padrão",
  diverge_gps_ouro: "Local diverge da última entrega",
  geocode_nao_provado_em_campo: "Endereço nunca confirmado no campo",
  fonte_nao_confiavel: "Fonte de localização não confiável",
  nunca_entregue: "Nunca recebeu entrega",
  rota_degradada: "Rota calculada sem motor de ruas",
};

type Filtro = "todos" | Semaforo;

const FILTROS: Array<{ key: Filtro; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "vermelho", label: "Corrigir" },
  { key: "amarelo", label: "Revisar" },
  { key: "verde", label: "Prontos" },
];

function motivosTexto(motivos: Motivo[]): string {
  if (motivos.length === 0) return "Sem pendência";
  return motivos.map((m) => MOTIVO_LABEL[m] || m).join(" · ");
}

function humanError(err: unknown): string {
  return err instanceof Error ? err.message : "Não foi possível carregar a saúde da base.";
}

export function BaseSaude() {
  const [dados, setDados] = useState<BaseSaudeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const filtroPill = useGlassPill<HTMLButtonElement>(filtro);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<BaseSaudeResult>("/logistica/base-saude")
      .then((res) => { setDados(res); setError(null); })
      .catch((err: unknown) => { setError(humanError(err)); })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { load(); }, [load]);

  const clientesFiltrados = useMemo(() => {
    const lista = dados?.clientes ?? [];
    return filtro === "todos" ? lista : lista.filter((c) => c.semaforo === filtro);
  }, [dados, filtro]);

  return (
    <section id="logistica-view-saude" className="log-agenda log-saude hbx-page-mobile-enter" role="tabpanel" aria-labelledby="log-tab-saude">
      {loading && !dados && (
        <div className="log-agenda__surface log-saude__loading">
          <div className="log-agenda__feedback">
            <strong>Conferindo os endereços…</strong>
          </div>
        </div>
      )}

      {error && (
        <div className="log-agenda__surface log-saude__loading">
          <div className="log-agenda__feedback is-error">
            <strong>Não carregou</strong>
            <span>{error}</span>
            <button type="button" className="btn-ghost" onClick={() => void load()}>Tentar novamente</button>
          </div>
        </div>
      )}

      {dados && !error && (
        <div className="log-saude__workspace">
          <aside className="log-agenda__surface log-saude__overview">
            <header className="log-agenda__head">
              <div className="log-agenda__head-main">
                <div className="log-agenda__head-copy">
                  <h2>Base pronta para rota</h2>
                  <p>{dados.totalClientes} cliente(s) conferidos antes de sair pra rua.</p>
                </div>
              </div>
            </header>

            <div className="log-saude__stats">
              <div className="log-agenda-impact__stat">
                <strong className="is-ok">{dados.verdes}</strong>
                <span>Prontos · {dados.percentVerde}%</span>
              </div>
              <div className="log-agenda-impact__stat">
                <strong className="is-danger">{dados.vermelhos}</strong>
                <span>Corrigir agora</span>
              </div>
              <div className="log-agenda-impact__stat">
                <strong className="is-warn">{dados.amarelos}</strong>
                <span>Revisar</span>
              </div>
            </div>

            {dados.resolvemSozinhos > 0 && (
              <p className="log-agenda-form__success">
                {dados.resolvemSozinhos} se confirmam sozinhos na próxima entrega pelo GPS do motorista.
              </p>
            )}
          </aside>

          <main className="log-agenda__surface log-saude__queue">
            <header className="log-agenda__head">
              <div className="log-agenda__head-main">
                <div className="log-agenda__head-copy">
                  <h2>Endereços que precisam de atenção</h2>
                  <p>Corrija os vermelhos primeiro; os verdes já estão prontos.</p>
                </div>
              </div>
              <div className="log-agenda__actions">
                <button type="button" className="btn-ghost btn-xs" onClick={() => void load()} disabled={loading}>
                  <span aria-hidden>↻</span> {loading ? "Atualizando…" : "Atualizar"}
                </button>
              </div>
            </header>

            <div className="log-saude__filtro glass-pill-track" role="tablist" aria-label="Filtrar endereços">
              <GlassPill {...filtroPill} />
              {FILTROS.map((f) => (
                <button
                  key={f.key}
                  ref={filtroPill.itemRef(f.key)}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.key}
                  className={`log-saude__filtro-tab glass-pill-item${filtro === f.key ? " is-active" : ""}`}
                  onClick={() => setFiltro(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {clientesFiltrados.length === 0 ? (
              <div className="log-agenda__feedback">
                <strong>Nada por aqui</strong>
                <span>Nenhum endereço neste filtro.</span>
              </div>
            ) : (
              <div className="log-saude__lista">
                {clientesFiltrados.map((c) => (
                  <div className="log-saude__row" key={c.id}>
                    <span className={`log-saude__semaforo log-saude__semaforo--${c.semaforo}`} aria-hidden />
                    <span className="log-saude__copy">
                      <span className="log-agenda-stop__name">
                        {c.nome || "Cliente"}
                        {c.localApelido ? ` · ${c.localApelido}` : ""}
                      </span>
                      <span className="log-agenda-import__row-sub">
                        {motivosTexto(c.motivos)}
                        {c.resolveSozinho ? " · confirma pelo GPS na próxima entrega" : ""}
                      </span>
                    </span>
                    {/* Link pro cadastro JÁ existente (aba Clientes) — só linkar, não
                        criar editor novo (S7-SAUDE-DA-BASE.md). */}
                    <Link href="/clientes" className="btn-ghost btn-xs">Abrir cadastro</Link>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}
    </section>
  );
}
