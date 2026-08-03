"use client";

// REGRAS DA CASA (31/07/2026) — o horário e o ritmo de trabalho da funcionária
// digital, escritos como FRASE, não como formulário:
//
//   "Trabalha das 08:00 às 18:00, fala com até 10 pessoas novas por dia
//    e espera 15 min entre uma e outra."
//
// Cada número é clicável e vira um campo pequeno ali mesmo. Fonte ÚNICA:
// GET/PATCH /vendas/agenda-disparo/config (a CASA — VendasComercialConfig).
// Desde a migration 20260801000000_casa_risco_identidade a campanha de
// prospecção NÃO tem mais janela/teto próprios: quem manda é esta tabela, e é
// por isso que o mesmo número não pode existir em duas telas ("o teto tinha 3
// números" nasceu exatamente disso).
//
// HONESTIDADE DO FREIO: se o freio anti-ban do HBX libera menos do que o teto
// pedido, a tela DIZ o número que realmente sai — nunca promete o que o motor
// não entrega.
//
// O NÍVEL DE DISPARO (conservador/médio/agressivo) mora aqui, ao lado da frase:
// é a mesma decisão ("qual o meu ritmo?"), e o componente é o que já existia
// (components/hbx/nivel-disparo-card.tsx) — mudou de casa, não de código.

import React, { useCallback, useEffect, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { NivelDisparoCard } from "@/components/hbx/nivel-disparo-card";
import { apiFetch } from "@/lib/api";
import { useProspectingConfig } from "@/lib/use-prospecting-config";

// Espelha o retorno de GET /vendas/agenda-disparo/config (vendas.service.ts
// getComercialConfigForUser + tetoEfetivoDoDia).
type CasaConfig = {
  workingHoursStart: string;
  workingHoursEnd: string;
  dailyLimitPerSender: number;
  intervalMinutes: number;
  tetoEfetivoPorDia?: number;
  coldGateAtivo?: boolean;
  coldGateMaxPorDia?: number;
  // TRAVA DE AQUECIMENTO REMOVÍVEL (04/08): true = a pessoa forçou o limite
  // configurado cheio; o freio de chip novo (rampa 6→12) sai da frente.
  coldWarmupOff?: boolean;
};

type CampoCasa = "workingHoursStart" | "workingHoursEnd" | "dailyLimitPerSender" | "intervalMinutes" | "coldWarmupOff";

export function RegrasDaCasa({ podeEditar }: { podeEditar: boolean }) {
  const [casa, setCasa] = useState<CasaConfig | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cfg = useProspectingConfig();

  const carregar = useCallback(async () => {
    try {
      setCasa(await apiFetch<CasaConfig>("/vendas/agenda-disparo/config"));
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu pra ler as regras da casa.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar; setState só no .then assíncrono
    void carregar();
  }, [carregar]);

  const salvarCampo = useCallback(async (campo: CampoCasa, valor: string | number | boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch<CasaConfig>("/vendas/agenda-disparo/config", {
        method: "PATCH",
        body: JSON.stringify({ [campo]: valor }),
      });
      setCasa(res);
      setErro(null);
      void cfg.loadLive();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }, [busy, cfg]);

  if (erro && !casa) return null; // sem acesso à casa (ex.: empresa sem Vendas) — some, não erra
  if (!casa) return null;

  const freioAtivo = Boolean(casa.coldGateAtivo);
  const freioMax = Number(casa.coldGateMaxPorDia ?? 0);
  const freioApertou = freioAtivo && freioMax > 0 && casa.dailyLimitPerSender > freioMax;

  return (
    <section className="auto-casa" aria-label="Regras da casa">
      <header className="auto-casa__head">
        <span className="auto-casa__ico" aria-hidden="true"><I d={ICONS.clock} size={14} /></span>
        <strong className="auto-casa__title">Regras da casa</strong>
        {freioApertou && (
          <span className="tag warn auto-casa__freio">Freio HBX: nunca passa de {freioMax}/dia</span>
        )}
      </header>

      <p className="auto-casa__frase">
        Trabalha das{" "}
        <NumeroVivo
          tipo="time"
          valor={casa.workingHoursStart}
          rotulo="Início do expediente"
          editavel={podeEditar}
          onSalvar={(v) => void salvarCampo("workingHoursStart", String(v))}
        />{" "}
        às{" "}
        <NumeroVivo
          tipo="time"
          valor={casa.workingHoursEnd}
          rotulo="Fim do expediente"
          editavel={podeEditar}
          onSalvar={(v) => void salvarCampo("workingHoursEnd", String(v))}
        />
        , fala com até{" "}
        <NumeroVivo
          tipo="numero"
          valor={String(casa.dailyLimitPerSender)}
          rotulo="Pessoas novas por dia"
          min={1}
          max={200}
          editavel={podeEditar}
          onSalvar={(v) => void salvarCampo("dailyLimitPerSender", Number(v))}
        />{" "}
        pessoas novas por dia e espera{" "}
        <NumeroVivo
          tipo="numero"
          valor={String(casa.intervalMinutes)}
          rotulo="Minutos entre uma pessoa e outra"
          min={1}
          max={240}
          editavel={podeEditar}
          onSalvar={(v) => void salvarCampo("intervalMinutes", Number(v))}
        />{" "}
        min entre uma e outra.
      </p>

      {freioApertou && (
        <p className="auto-casa__nota">
          Na prática saem {casa.tetoEfetivoPorDia ?? freioMax} primeiros contatos por dia.
        </p>
      )}

      {/* TRAVA DE AQUECIMENTO (04/08): chip novo roda metade do teto acima
          (mínimo 6, máximo 12) e vai soltando conforme recebe resposta. Remover
          é DIREITO da pessoa — o aviso diz o risco, a escolha é dela. */}
      {freioAtivo && podeEditar && (
        <label className="auto-casa__trava">
          <input
            type="checkbox"
            checked={casa.coldWarmupOff === true}
            disabled={busy}
            onChange={(e) => {
              const forcar = e.target.checked;
              if (forcar && !window.confirm(
                "Remover a trava de aquecimento? Chip novo vai disparar o limite cheio desde o primeiro dia — número sem histórico disparando muito é o padrão que a Meta bloqueia. A responsabilidade passa a ser sua.",
              )) return;
              void salvarCampo("coldWarmupOff", forcar);
            }}
          />
          <span>
            {casa.coldWarmupOff
              ? "Trava de aquecimento REMOVIDA — chip novo dispara o limite cheio."
              : "Chip novo aquece devagar: metade do limite, soltando conforme recebe resposta."}
          </span>
        </label>
      )}
      {!podeEditar && <p className="auto-casa__nota">Só o dono ou o gerente muda estes números.</p>}
      {erro && <p className="auto-casa__erro">{erro}</p>}

      <NivelDisparoCard live={cfg.live} busy={cfg.busy} onAplicar={(nivel) => { void cfg.aplicarNivel(nivel); }} />
    </section>
  );
}

// ── Um número da frase: texto que vira campo ao clicar ──────────────────────
function NumeroVivo({
  tipo,
  valor,
  rotulo,
  min,
  max,
  editavel,
  onSalvar,
}: {
  tipo: "time" | "numero";
  valor: string;
  rotulo: string;
  min?: number;
  max?: number;
  editavel: boolean;
  onSalvar: (v: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);

  if (!editavel) return <span className="auto-casa__num is-fixo">{valor}</span>;

  function comitar() {
    setEditando(false);
    const limpo = rascunho.trim();
    if (!limpo || limpo === valor) return;
    if (tipo === "numero") {
      const n = Math.round(Number(limpo));
      if (!Number.isFinite(n)) return;
      const seguro = Math.min(max ?? 999, Math.max(min ?? 1, n));
      if (String(seguro) === valor) return;
      onSalvar(String(seguro));
      return;
    }
    onSalvar(limpo);
  }

  if (editando) {
    return (
      <input
        className="field-dark auto-casa__campo"
        type={tipo === "time" ? "time" : "number"}
        min={min}
        max={max}
        autoFocus
        value={rascunho}
        aria-label={rotulo}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={comitar}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); comitar(); }
          if (e.key === "Escape") { setRascunho(valor); setEditando(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="auto-casa__num"
      title={rotulo}
      onClick={() => { setRascunho(valor); setEditando(true); }}
    >
      {valor}
    </button>
  );
}
