"use client";

// /automacao — UMA FUNCIONÁRIA DIGITAL, TRÊS TURNOS (reforma de 31/07/2026).
//
// A tela deixou de ser um "painel de módulos" e passou a ser a mesa de quem
// trabalha pela empresa. De cima pra baixo, na ordem em que a pergunta nasce:
//
//   1. CRACHÁ    — quem é ela (nome/identidade) e por qual WhatsApp fala.
//   2. ENTREVISTA— o cadeado COM motivo: 3 perguntas que liberam os turnos.
//   3. REGRAS DA CASA — horário e ritmo, escritos como frase de números vivos.
//   4. TRÊS TURNOS — Atender · Cobrar · Buscar clientes, cada um com o seu
//      interruptor real (PUT /bot/activation) e, quando bloqueado, o MOTIVO
//      escrito no próprio cartão. Nunca cadeado mudo.
//   5. RODAPÉ    — catálogo (de onde a IA tira o que pode afirmar), atalho de
//      gatilhos/rotinas e o botão de pânico "Desligar tudo".
//
// O QUE MORREU: "armar bot" e a chave geral (bot-activation.service.ts, 31/07)
// — a tranca agora é a entrevista + pré-voo, e todo bloqueio vem com frase.
// Os 4 cartões-objetivo antigos (buildCard/ObjetivoCard) e a faixa "Começar
// por um modelo" saíram do hub: a galeria de modelos continua viva DENTRO da
// seção Atendente (passo 3 do wizard), que é onde ela é usada de verdade.
//
// O QUE FICA IGUAL: os gates por `moduleAccess` (o overview já calcula por
// usuário no backend) e a navegação por `?secao=` — as 4 seções continuam
// sendo os "ajustes finos" de cada turno.
//
// Design System: zero hex/inline visual — classes centrais + hbx-theme/automacao.css.

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { Cracha, type PerfilIa } from "./cracha";
import { Entrevista, type CatalogoView } from "./entrevista";
import { RegrasDaCasa } from "./regras-casa";
import { IlustracaoAtender, IlustracaoBuscar, IlustracaoCobrar } from "./kit/ilustracoes";
import { StatusChip } from "./kit/status-chip";
import { SecaoAtendente } from "./secao-atendente";
import { SecaoCobranca } from "./secao-cobranca";
import { SecaoProspeccao } from "./secao-prospeccao";
import { SecaoRegras } from "./secao-regras";

// ================================================================
// Shape do GET /automation/overview — espelha
// backend/src/automation/automation-overview.service.ts (AutomationOverviewResponse).
// ================================================================
type AgentBrain = "roteiro" | "ia";
type Block<T extends Record<string, unknown>> = ({ ok: true } & T) | { ok: false; reason: string };

type ExecutorTelemetry = { key: string; enabled: boolean; lastTickAt: string | null; lastResult: "ok" | "skipped" | "error" | null };

type Overview = {
  companyId: number;
  moduleAccess: { atendimento: boolean; bot: boolean; vendas: boolean };
  botArmed: { armed: boolean; armedAt: string | null; armedByUserId: number | null };
  atendente: Block<{ brain: AgentBrain | null; published: boolean; updatedAt: string | null }>;
  cobranca: Block<{ live: boolean; workerEnabled: boolean }>;
  prospeccao: Block<{ live: boolean; campaignId: string | null; pendingLeads: number }>;
  regras: Block<{ gatilhosAtivos: number; rotinasAtivas: number }>;
  motor: Block<{ runnerEnabled: boolean; publishEnabled: boolean; chipConectado: boolean; executores: ExecutorTelemetry[] }>;
};

// ── GET/PUT /bot/activation (bot-activation.service.ts) ──────────────────────
// `armed`/`masterOff` morreram em 31/07: o que resta é o pré-voo por tipo, e
// `blocked` já chega como FRASE pronta pro cliente ler.
type BotTipo = "atendimento" | "recovery" | "prospeccao";
type ActivationTipo = {
  live: boolean;
  preflight: { chipConectado: boolean; configCompleta: boolean; entrevistaCompleta: boolean };
  blocked: string | null;
};
type Activation = {
  canAdminToggle: boolean;
  types: Record<BotTipo, ActivationTipo>;
};

type SecaoKey = "atendente" | "cobranca" | "prospeccao" | "regras";
const SECOES: SecaoKey[] = ["atendente", "cobranca", "prospeccao", "regras"];
function isSecaoKey(v: string | null): v is SecaoKey {
  return v !== null && (SECOES as string[]).includes(v);
}

type SecaoMeta = { key: SecaoKey; titulo: string; sub: string };

// Um turno = um verbo + UMA linha do que ele faz (Lei nº1, teto de copy ≤70).
const SECAO_META: Record<SecaoKey, SecaoMeta> = {
  atendente: { key: "atendente", titulo: "Atender", sub: "Responde quem chama a empresa." },
  cobranca: { key: "cobranca", titulo: "Cobrar", sub: "Lembra quem deve, no ritmo certo." },
  prospeccao: { key: "prospeccao", titulo: "Buscar clientes", sub: "Puxa assunto com leads novos do Radar." },
  regras: { key: "regras", titulo: "Reagir e abastecer", sub: "Gatilhos e rotinas abastecem o funil sozinhos." },
};

function secaoGateOk(key: SecaoKey, ma: Overview["moduleAccess"]): boolean {
  if (key === "atendente") return ma.atendimento || ma.bot;
  if (key === "cobranca") return ma.bot && ma.atendimento;
  return ma.vendas; // prospeccao | regras
}

// Os TRÊS turnos do hub (a seção `regras` continua acessível pelo rodapé —
// ela é ajuste fino de funil, não um turno da funcionária).
const TURNOS: { secao: SecaoKey; tipo: BotTipo; Ilustracao: (props: { className?: string }) => React.ReactElement }[] = [
  { secao: "atendente", tipo: "atendimento", Ilustracao: IlustracaoAtender },
  { secao: "cobranca", tipo: "recovery", Ilustracao: IlustracaoCobrar },
  { secao: "prospeccao", tipo: "prospeccao", Ilustracao: IlustracaoBuscar },
];

// Referência estável (fora do componente) pro fallback "sem overview ainda".
const EMPTY_MODULE_ACCESS: Overview["moduleAccess"] = { atendimento: false, bot: false, vendas: false };

const SEM_ESTADO = "Não deu pra ler o estado agora — tente recarregar.";

// ================================================================
// RAIZ
// ================================================================
export function AutomacaoHubClient() {
  const user = useCurrentUser();
  const router = useRouter();
  const params = useSearchParams();
  const secaoParam = params.get("secao");
  const templateParam = params.get("template");

  const [secao, setSecao] = useState<SecaoKey | null>(isSecaoKey(secaoParam) ? secaoParam : null);
  const [secaoTemplate, setSecaoTemplate] = useState<string | null>(isSecaoKey(secaoParam) ? templateParam : null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [perfil, setPerfil] = useState<PerfilIa | null>(null);
  const [activation, setActivation] = useState<Activation | null>(null);
  // Sem ativação, o cartão precisa dizer POR QUE — e o "por quê" honesto é o
  // que o servidor respondeu (módulo não liberado, sessão, rede). Frase genérica
  // só quando nem isso chegou.
  const [activationErro, setActivationErro] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [tipoBusy, setTipoBusy] = useState<BotTipo | null>(null);

  // O overview é o único bloco que pode derrubar a tela (é ele que decide os
  // gates). Perfil/ativação/catálogo são fail-soft: quem não tem o módulo
  // simplesmente não vê aquele pedaço, nunca um erro vermelho.
  const load = useCallback(async () => {
    const [ov, pf, act, cat] = await Promise.allSettled([
      apiFetch<Overview>("/automation/overview"),
      apiFetch<PerfilIa>("/automation/perfil-ia"),
      apiFetch<Activation>("/bot/activation"),
      apiFetch<CatalogoView>("/vendas/catalogo-comercial"),
    ]);
    if (ov.status === "fulfilled") {
      setOverview(ov.value);
      setError(null);
    } else {
      setError(ov.reason instanceof Error ? ov.reason.message : "Não foi possível carregar a Automação.");
    }
    if (pf.status === "fulfilled") setPerfil(pf.value);
    if (act.status === "fulfilled") {
      setActivation(act.value);
      setActivationErro(null);
    } else {
      setActivation(null);
      setActivationErro(act.reason instanceof Error ? act.reason.message : SEM_ESTADO);
    }
    if (cat.status === "fulfilled") setCatalogo(cat.value);
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar (guarda `alive` contra race/unmount); efeito legítimo
    void load().then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  const abrirSecao = useCallback((key: SecaoKey, template?: string) => {
    setSecao(key);
    setSecaoTemplate(template ?? null);
    router.replace(`/automacao?secao=${key}${template ? `&template=${template}` : ""}`);
  }, [router]);

  const voltar = useCallback(() => {
    setSecao(null);
    setSecaoTemplate(null);
    router.replace("/automacao");
  }, [router]);

  const moduleAccess = overview?.moduleAccess ?? EMPTY_MODULE_ACCESS;

  // Quem manda na identidade/regras/interruptores: o backend já responde
  // `canAdminToggle`; sem ele (empresa sem o módulo bot) cai no papel do
  // usuário — as duas fontes usam a MESMA régua (ADMIN/USERMASTER/master).
  const ehAdmin = Boolean(user?.isSystemMaster) || ["ADMIN", "USERMASTER"].includes(String(user?.role || "").toUpperCase());
  const podeEditar = activation ? activation.canAdminToggle : ehAdmin;

  const turnosVisiveis = useMemo(
    () => TURNOS.filter((t) => secaoGateOk(t.secao, moduleAccess)),
    [moduleAccess],
  );

  const motorOn = Boolean(overview?.motor.ok && overview.motor.chipConectado);

  const alternarTurno = useCallback(async (tipo: BotTipo, live: boolean) => {
    setAcaoMsg(null);
    setTipoBusy(tipo);
    try {
      await apiFetch("/bot/activation", { method: "PUT", body: JSON.stringify({ type: tipo, live }) });
      const fresh = await apiFetch<Activation>("/bot/activation").catch(() => null);
      if (fresh) setActivation(fresh);
      void load();
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível mudar agora.");
    } finally {
      setTipoBusy(null);
    }
  }, [load]);

  const desligarTudo = useCallback(async () => {
    if (!window.confirm("Desligar as três funções agora?")) return;
    setAcaoMsg(null);
    try {
      await apiFetch("/bot/activation/desligar-tudo", { method: "PUT", body: JSON.stringify({}) });
      const fresh = await apiFetch<Activation>("/bot/activation").catch(() => null);
      if (fresh) setActivation(fresh);
      void load();
      setAcaoMsg("Tudo desligado.");
    } catch (err) {
      setAcaoMsg(err instanceof Error ? err.message : "Não foi possível desligar agora.");
    }
  }, [load]);

  // ── Seção aberta (?secao=) — os "ajustes finos" de cada turno ──
  if (secao && overview && secaoGateOk(secao, moduleAccess)) {
    const meta = SECAO_META[secao];
    return (
      <div className="work" style={{ flex: 1 }}>
        <div className="aut-secao-head">
          <button type="button" className="btn-ghost" onClick={voltar}><I d={ICONS.back} size={14} /> Voltar</button>
          <div style={{ minWidth: 0 }}>
            <div className="auto-hero__title">{meta.titulo}</div>
            <div className="auto-hero__sub">{meta.sub}</div>
          </div>
        </div>
        {secao === "atendente" ? (
          <SecaoAtendente
            iaPublishEnabled={Boolean(overview.motor.ok && overview.motor.publishEnabled)}
            initialTemplate={secaoTemplate}
            onChanged={() => { void load(); }}
          />
        ) : secao === "cobranca" ? (
          <SecaoCobranca onChanged={() => { void load(); }} />
        ) : secao === "prospeccao" ? (
          <SecaoProspeccao motor={overview.motor} onChanged={() => { void load(); }} />
        ) : (
          <SecaoRegras motor={overview.motor} onChanged={() => { void load(); }} />
        )}
      </div>
    );
  }

  const catalogoItens = catalogo?.catalogo?.capacidades.length ?? 0;

  return (
    <div className="work auto-mesa" style={{ flex: 1 }}>
      <Cracha
        perfil={perfil}
        chipConectado={motorOn}
        podeEditar={podeEditar}
        onPerfil={(p) => { setPerfil(p); void load(); }}
      />

      {error && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
            <strong>Não carregou</strong>
            <span className="hint">{error}</span>
            <button className="btn-ghost" onClick={() => { setLoading(true); void load().then(() => setLoading(false)); }}>Tentar novamente</button>
          </div>
        </section>
      )}

      {!error && loading && (
        <div className="aut-fn-grid">
          {[0, 1, 2].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && perfil && !perfil.entrevistaCompleta && (
        <Entrevista
          perfil={perfil}
          catalogo={catalogo}
          podeEditar={podeEditar}
          onPerfil={(p) => { setPerfil(p); void load(); }}
          onCatalogo={(c) => { setCatalogo(c); void load(); }}
        />
      )}

      {!error && !loading && moduleAccess.vendas && <RegrasDaCasa podeEditar={podeEditar} />}

      {acaoMsg && <div className="auto-flag-note"><I d={ICONS.bell} size={14} />{acaoMsg}</div>}

      {!error && !loading && turnosVisiveis.length === 0 && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 6, justifyItems: "start" }}>
            <strong>Nenhum turno liberado</strong>
            <span className="hint">Atendimento, bot e vendas ainda não liberados — fale com o suporte.</span>
          </div>
        </section>
      )}

      {!error && !loading && turnosVisiveis.length > 0 && (
        <div className="aut-fn-grid">
          {turnosVisiveis.map((t) => (
            <TurnoCard
              key={t.secao}
              meta={SECAO_META[t.secao]}
              Ilustracao={t.Ilustracao}
              estado={activation?.types?.[t.tipo] ?? null}
              semEstado={activationErro ?? SEM_ESTADO}
              detalhe={detalheDoTurno(t.secao, overview)}
              podeEditar={podeEditar}
              busy={tipoBusy === t.tipo}
              onAbrir={() => abrirSecao(t.secao)}
              onAlternar={(live) => { void alternarTurno(t.tipo, live); }}
            />
          ))}
        </div>
      )}

      {!error && !loading && (
        <footer className="auto-rodape">
          <span className="auto-rodape__cat">
            {catalogoItens > 0
              ? `Catálogo: ${catalogoItens} ${catalogoItens === 1 ? "item" : "itens"} — é daqui que a IA tira o que pode afirmar.`
              : "Catálogo vazio — sem ele a IA não afirma produto nem preço."}
          </span>
          <div className="auto-rodape__acoes">
            {secaoGateOk("regras", moduleAccess) && (
              <button type="button" className="btn-ghost btn-xs" onClick={() => abrirSecao("regras")}>
                <I d={ICONS.bolt} size={12} /> Gatilhos e rotinas
              </button>
            )}
            {podeEditar && activation && (
              <button type="button" className="btn-ghost btn-xs" onClick={() => void desligarTudo()}>
                <I d={ICONS.stop} size={12} /> Desligar tudo
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

// Contador do dia por turno — só o que o overview JÁ traz (zero chamada nova).
function detalheDoTurno(secao: SecaoKey, ov: Overview | null): { valor: string; rotulo: string } | null {
  if (!ov) return null;
  if (secao === "prospeccao" && ov.prospeccao.ok) {
    return { valor: String(ov.prospeccao.pendingLeads), rotulo: "Leads na fila" };
  }
  if (secao === "atendente" && ov.atendente.ok && ov.atendente.brain) {
    return { valor: ov.atendente.brain === "ia" ? "IA" : "Roteiro", rotulo: "Cérebro atual" };
  }
  if (secao === "cobranca" && ov.cobranca.ok) {
    return { valor: ov.cobranca.workerEnabled ? "Ativo" : "Parado", rotulo: "Envio automático" };
  }
  return null;
}

// ============================================================================
// CARTÃO DE TURNO — ícone, título, 1 linha, interruptor real e, quando
// bloqueado, o MOTIVO escrito (nunca cadeado mudo).
// ============================================================================
function TurnoCard({
  meta,
  Ilustracao,
  estado,
  semEstado,
  detalhe,
  podeEditar,
  busy,
  onAbrir,
  onAlternar,
}: {
  meta: SecaoMeta;
  Ilustracao: (props: { className?: string }) => React.ReactElement;
  estado: ActivationTipo | null;
  semEstado: string;
  detalhe: { valor: string; rotulo: string } | null;
  podeEditar: boolean;
  busy: boolean;
  onAbrir: () => void;
  onAlternar: (live: boolean) => void;
}) {
  const live = Boolean(estado?.live);
  // O motivo vem escrito do backend (`blocked`). A ÚNICA troca é quando o
  // bloqueio é a entrevista: a frase inteira já está no bloco logo acima, e
  // repeti-la nos 3 cartões vira parede de texto — aqui vira o ponteiro curto.
  const motivo = !estado
    ? semEstado
    : estado.blocked && !estado.preflight.entrevistaCompleta
      ? "Responda as 3 perguntas aqui em cima."
      : estado.blocked;
  // Bloqueio só trava LIGAR — desligar nunca fica preso atrás de pré-voo.
  const travado = !estado || !podeEditar || busy || (!live && Boolean(estado.blocked));

  return (
    <div className={"aut-fn-card" + (live ? " is-on" : "")}>
      <button type="button" className="aut-fn-card__abrir" onClick={onAbrir}>
        <span className="aut-fn-card__ico" aria-hidden="true"><Ilustracao /></span>
        <span className="aut-fn-card__titulos">
          <span className="aut-fn-card__title">{meta.titulo}</span>
          <span className="aut-fn-card__linha">{meta.sub}</span>
        </span>
      </button>

      <div className="aut-fn-card__estado">
        <StatusChip tone={live ? "ligado" : "pausado"} label={live ? "Ligada" : "Desligada"} size="s" />
        <button
          type="button"
          className={"sw" + (live ? " on" : "")}
          role="switch"
          aria-checked={live}
          aria-label={`${meta.titulo}: ${live ? "desligar" : "ligar"}`}
          disabled={travado}
          onClick={() => onAlternar(!live)}
        >
          <i></i>
        </button>
      </div>

      {detalhe && (
        <div className="aut-fn-card__metric">
          <span className="aut-fn-card__metric-n">{detalhe.valor}</span>
          <span className="aut-fn-card__metric-l">{detalhe.rotulo}</span>
        </div>
      )}

      {motivo && <p className="aut-fn-card__motivo">{motivo}</p>}
      {!motivo && !podeEditar && <p className="aut-fn-card__motivo">Só o dono ou o gerente liga e desliga.</p>}
    </div>
  );
}
