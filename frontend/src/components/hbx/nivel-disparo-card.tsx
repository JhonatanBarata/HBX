"use client";

// NÍVEL DE DISPARO — cartão do topo da Prospecção (pedido do dono, 31/07/2026):
//   "IA e bot seguem depois da sua configuração, mas qual nível ele está? nos
//    disparos? conservador, médio, agressivo? tudo isso está muito confuso!"
//
// O que existia antes: 6 peças e 12 campos numéricos. Nenhuma tela dizia se aquilo
// era pouco ou muito, nem em que pé a empresa estava. Este cartão responde a pergunta
// ANTES de qualquer gaveta: uma frase com o estado atual e três botões.
//
// Nada é decidido aqui: os presets, a detecção do nível e a frase vêm PRONTOS do
// backend (vendas-nivel-disparo.ts, via GET /vendas/automation/live-status). A tela só
// desenha — duas cópias da mesma régua é como nasceu o "teto tinha 3 números".
//
// Design System: zero hex/inline. Tudo em classes de bot-prospeccao.css.

import { I, ICONS } from "@/components/hbx/shell";
import type {
  NivelDisparoChave,
  NivelDisparoDef,
  NivelDisparoDetectado,
  ProspLive,
} from "@/lib/use-prospecting-config";

export function NivelDisparoCard({
  live,
  busy,
  onAplicar,
}: {
  live: ProspLive | null;
  busy: boolean;
  onAplicar: (nivel: NivelDisparoChave) => void;
}) {
  const niveis: NivelDisparoDef[] = live?.campaign?.niveisDisparo ?? [];
  // Sem catálogo do servidor o cartão simplesmente não existe — melhor ausente do que
  // inventando três botões com números que o motor não conhece.
  if (!niveis.length) return null;

  const atual: NivelDisparoDetectado = live?.nivelDisparo ?? "personalizado";
  const frase = live?.nivelFrase || "";

  return (
    <section className="nivel-disparo" aria-label="Nível de disparo">
      <header className="nivel-disparo__head">
        <span className="nivel-disparo__icon" aria-hidden="true"><I d={ICONS.bolt} size={14} /></span>
        <div className="nivel-disparo__titles">
          <strong className="nivel-disparo__title">Nível de disparo</strong>
          <span className="nivel-disparo__now">{frase}</span>
        </div>
      </header>

      <div className="nivel-disparo__opcoes" role="group" aria-label="Escolher nível">
        {niveis.map(nivel => {
          const ativo = atual === nivel.chave;
          return (
            <button
              key={nivel.chave}
              type="button"
              className={"nivel-disparo__opt" + (ativo ? " is-on" : "")}
              aria-pressed={ativo}
              disabled={busy || ativo}
              onClick={() => onAplicar(nivel.chave)}
            >
              <span className="nivel-disparo__opt-nome">{nivel.titulo}</span>
              <span className="nivel-disparo__opt-num">
                {nivel.dailyLimit}/dia · ~{nivel.intervalMinutes} min
              </span>
              <span className="nivel-disparo__opt-resumo">{nivel.resumo}</span>
            </button>
          );
        })}
      </div>

      {atual === "personalizado" && (
        <p className="nivel-disparo__custom" role="note">
          Seus números estão fora dos três níveis — isso não é erro. Escolher um nível acima substitui
          limite diário, intervalo, variação e tentativas por lead.
        </p>
      )}
    </section>
  );
}
