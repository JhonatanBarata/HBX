"use client";

// CONTABIL S5 — Wizard "Fechar o mês" (o copiloto semi-auto).
// Modal-stepper de 6 etapas sobre os endpoints do S5 (/master/contabil/mes/*).
// Copiloto, NÃO piloto (Lei nº1): o wizard prepara TUDO (números do motor, na
// ordem da tela do governo, com deep-link) mas NUNCA transmite — o dono marca
// cada estado com o nº do recibo. Divergência de DAS TRAVA o passo (disjuntor).
// Modo Fase 0 (receita 0 e pró-labore 0): fluxo curto de 2 minutos.
// Visual em hbx-theme/contabil-master.css (prefixo ctb-, só var(--token)).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, getApiBase, getToken } from "@/lib/api";

import { fmtData } from "./page.client";

// ---- Shapes (espelham contabil-close.service.ts) --------------------------

type PreClose = {
  competencia: string;
  fase0: boolean;
  fechadoEm: string | null;
  lucroIsentoMesCents: number;
  receita: {
    receitaCaixaCents: number;
    receitaNotasCents: number;
    ajusteManualCents: number;
    ajusteMotivo: string | null;
    receitaMesCents: number;
  };
  folhaMesCents: number;
  prolaboreRecomendadoCents: number;
  folha11mAnterioresCents: number;
  cadeia: {
    rbt12Cents: number;
    folha12mCents: number;
    fatorR: number;
    anexoAplicado: "III" | "V" | null;
    aliquotaEfetiva: number;
  };
  tributos: {
    dasPrevistoCents: number;
    inssPrevistoCents: number;
    irrfPrevistoCents: number;
    tributosTotalCents: number;
  };
  reconciliacao: { dasBaseCents: number; livroCaixaCents: number; bate: boolean };
  obrigacoes: Array<{
    id: string;
    tipo: string;
    estado: string;
    dueDate: string;
    naoAplicavel: boolean;
    resultJson: string | null;
  }>;
  comprovantes: Record<string, number>;
};

type ImpactoProlabore = {
  prolaboreCents: number;
  dasCents: number;
  inssCents: number;
  irrfCents: number;
  totalTributosCents: number;
  anexoAplicado: "III" | "V";
  aliquotaEfetiva: number;
  fatorR: number;
};

type ValidarDas = {
  nossoDasCents: number;
  governoCents: number;
  diffCents: number;
  toleranciaCents: number;
  diverge: boolean;
};

type Comprovante = {
  id: string;
  obligationId: string;
  originalFilename: string;
  byteSize: number;
  createdAt: string;
};

// ---- S7 Serpro (autopost) — só ativo com a flag ON no backend -------------

type SerproStatus = {
  enabled: boolean;
  ambiente: "demo" | "producao";
  credencialConfigurada: boolean;
};

type SerproArmar = {
  disponivel: boolean;
  motivoIndisponivel?: string | null;
  competencia: string;
  ambiente: "demo" | "producao";
  payload: {
    competencia: string;
    periodoApuracao: string;
    receitaBrutaMesCents: number;
    rbt12Cents: number;
    folha12mCents: number;
    anexoAplicado: string;
    aliquotaEfetiva: number;
    dasPrevistoCents: number;
  } | null;
  custoEstimadoCents: number;
  custoEstimadoLabel: string;
};

type SerproTransmitir = {
  ok: boolean;
  competencia: string;
  numeroRecibo: string | null;
  dasPdfB64: string | null;
  dasNumeroDocumento: string | null;
  estado: "TRANSMITIDO" | "REVISAR" | "FALLBACK";
  conferencia: {
    conferido: boolean;
    dasNossoCents: number;
    dasGovernoCents: number | null;
    diffCents: number | null;
    diverge: boolean;
    detalhe: string;
  } | null;
  erro?: string | null;
};

type FecharResp = {
  competencia: string;
  fechadoEm: string;
  obrigacoesConferidas: number;
  relatorio: { texto: string; avisos: string[]; comparativo: string | null };
  enviadoZap: boolean;
};

// ---- Helpers de formatação (locais, mesmo padrão do janela-contabil) ------

function brl(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number | null | undefined, casas = 1): string {
  return `${((v ?? 0) * 100).toFixed(casas)}%`;
}
function centsFromInput(raw: string): number {
  return Math.round((Number(String(raw).replace(/\./g, "").replace(",", ".")) || 0) * 100);
}

// Deep-links dos sistemas do governo (abrem em nova aba — nada de iframe).
const LINK_ESOCIAL = "https://login.esocial.gov.br/login.aspx";
const LINK_ECAC = "https://cav.receita.fazenda.gov.br/autenticacao/login";
const LINK_PGDASD = "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgdasd.app/identificacao";
const LINK_DAS = "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/gerarDas.app/identificacao";

// Passos (nomes estáveis p/ o stepper).
type Passo = "receita" | "prolabore" | "esocial" | "pgdasd" | "pagamentos" | "resumo";
const PASSO_LABEL: Record<Passo, string> = {
  receita: "Receita",
  prolabore: "Pró-labore",
  esocial: "eSocial + DCTFWeb",
  pgdasd: "PGDAS-D",
  pagamentos: "Pagamentos",
  resumo: "Fechamento",
};

function competenciaLabel(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m[2]) - 1] ?? m[2]}/${m[1]}`;
}

export function WizardFecharMes({
  competencia,
  onClose,
  onDone,
}: {
  competencia: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [dossie, setDossie] = useState<PreClose | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    return apiFetch<PreClose>(`/master/contabil/mes/${competencia}/pre-close`)
      .then((res) => { setDossie(res); setErro(null); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao carregar o fechamento."))
      .finally(() => setCarregando(false));
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  // Sequência de passos — Fase 0 encurta pra PGDAS-D zerado + fechamento.
  const passos: Passo[] = useMemo(() => {
    if (!dossie) return ["receita"];
    if (dossie.fase0) return ["pgdasd", "resumo"];
    const temProlabore = dossie.folhaMesCents > 0;
    const base: Passo[] = ["receita", "prolabore"];
    if (temProlabore) base.push("esocial");
    base.push("pgdasd", "pagamentos", "resumo");
    return base;
  }, [dossie]);

  const [passoIdx, setPassoIdx] = useState(0);
  const passoAtual = passos[Math.min(passoIdx, passos.length - 1)];

  // Se o conjunto de passos mudar (ex.: pró-labore passou a > 0), reancora.
  useEffect(() => { setPassoIdx((i) => Math.min(i, passos.length - 1)); }, [passos.length]);

  const avancar = useCallback(() => setPassoIdx((i) => Math.min(i + 1, passos.length - 1)), [passos.length]);
  const voltar = useCallback(() => setPassoIdx((i) => Math.max(i - 1, 0)), []);

  return (
    <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-modal ctb-wiz" role="dialog" aria-label="Fechar o mês">
        <div className="ctb-wiz-head">
          <div>
            <h3 style={{ margin: 0 }}>Fechar o mês · {competenciaLabel(competencia)}</h3>
            {dossie?.fase0 && <span className="ctb-wiz-fase0">Fase 0 — sem apuração (2 minutos)</span>}
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} style={{ minHeight: 30 }}>fechar</button>
        </div>

        {/* Stepper */}
        <div className="ctb-wiz-steps">
          {passos.map((p, i) => (
            <div key={p} className={"ctb-wiz-step" + (i === passoIdx ? " active" : i < passoIdx ? " done" : "")}>
              <span className="ctb-wiz-step-num">{i < passoIdx ? "✓" : i + 1}</span>
              <span className="ctb-wiz-step-label">{PASSO_LABEL[p]}</span>
            </div>
          ))}
        </div>

        <div className="ctb-wiz-body">
          {carregando && <div className="ctb-empty">Carregando o fechamento…</div>}
          {erro && <div className="ctb-wiz-alert bad"><span>⚠</span><span>{erro}</span></div>}

          {dossie && !carregando && passoAtual === "receita" && (
            <PassoReceita dossie={dossie} onRecarregar={carregar} onNext={avancar} />
          )}
          {dossie && !carregando && passoAtual === "prolabore" && (
            <PassoProlabore competencia={competencia} dossie={dossie} onRecarregar={carregar} onNext={avancar} onBack={voltar} />
          )}
          {dossie && !carregando && passoAtual === "esocial" && (
            <PassoEsocial dossie={dossie} onRecarregar={carregar} onNext={avancar} onBack={voltar} />
          )}
          {dossie && !carregando && passoAtual === "pgdasd" && (
            <PassoPgdasd competencia={competencia} dossie={dossie} onRecarregar={carregar} onNext={avancar} onBack={voltar} />
          )}
          {dossie && !carregando && passoAtual === "pagamentos" && (
            <PassoPagamentos dossie={dossie} onRecarregar={carregar} onNext={avancar} onBack={voltar} />
          )}
          {dossie && !carregando && passoAtual === "resumo" && (
            <PassoResumo competencia={competencia} dossie={dossie} onBack={voltar} onClose={onClose} onDone={onDone} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Passo 1: Receita -----------------------------------------------------

function PassoReceita({ dossie, onRecarregar, onNext }: { dossie: PreClose; onRecarregar: () => Promise<void> | void; onNext: () => void }) {
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteValor, setAjusteValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const salvarAjuste = useCallback(() => {
    const ajusteManualCents = centsFromInput(ajusteValor);
    if (!motivo.trim() || motivo.trim().length < 3) { setMsg("Informe o motivo do ajuste (mín. 3 caracteres)."); return; }
    setBusy(true);
    setMsg(null);
    apiFetch(`/master/contabil/mes/${dossie.competencia}/ajuste`, {
      method: "POST",
      body: JSON.stringify({ ajusteManualCents, motivo: motivo.trim() }),
    })
      .then(() => onRecarregar())
      .then(() => { setAjusteOpen(false); setMsg("Ajuste aplicado."); })
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Falha ao ajustar."))
      .finally(() => setBusy(false));
  }, [ajusteValor, motivo, dossie.competencia, onRecarregar]);

  return (
    <div className="ctb-wiz-panel">
      <p className="ctb-wiz-lead">
        Recebemos <strong>{brl(dossie.receita.receitaMesCents)}</strong> de assinaturas em {competenciaLabel(dossie.competencia)} (fonte Mercado Pago). Confere?
      </p>
      <div className="ctb-wiz-kv">
        <div><span>Receita de caixa (MP)</span><strong>{brl(dossie.receita.receitaCaixaCents)}</strong></div>
        {dossie.receita.ajusteManualCents !== 0 && (
          <div><span>Ajuste manual</span><strong>{brl(dossie.receita.ajusteManualCents)}</strong></div>
        )}
        <div><span>Receita do mês</span><strong>{brl(dossie.receita.receitaMesCents)}</strong></div>
      </div>

      <div className={"ctb-wiz-alert " + (dossie.reconciliacao.bate ? "ok" : "bad")}>
        <span>{dossie.reconciliacao.bate ? "✅" : "⚠"}</span>
        <span>
          Receita do DAS {brl(dossie.reconciliacao.dasBaseCents)} {dossie.reconciliacao.bate ? "==" : "≠"} Livro Caixa {brl(dossie.reconciliacao.livroCaixaCents)}
          {dossie.reconciliacao.bate ? " — reconciliado." : " — DIVERGENTE, revise antes de continuar."}
        </span>
      </div>

      {!ajusteOpen ? (
        <div className="ctb-wiz-actions">
          <button type="button" className="btn-ghost" onClick={() => setAjusteOpen(true)}>Ajustar com motivo</button>
          <button type="button" className="btn-teal" onClick={onNext}>Confirmar receita</button>
        </div>
      ) : (
        <div className="ctb-wiz-form">
          <div className="ctb-field">
            <label>Ajuste manual (R$ — pode ser negativo)</label>
            <input inputMode="decimal" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)} placeholder="0,00" />
          </div>
          <div className="ctb-field">
            <label>Motivo do ajuste</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: recebimento fora do MP" />
          </div>
          {msg && <span className="ctb-wiz-msg">{msg}</span>}
          <div className="ctb-wiz-actions">
            <button type="button" className="btn-ghost" onClick={() => setAjusteOpen(false)}>cancelar</button>
            <button type="button" className="btn-teal" disabled={busy} onClick={salvarAjuste}>{busy ? "gravando…" : "aplicar ajuste"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Passo 2: Pró-labore --------------------------------------------------

function PassoProlabore({
  competencia, dossie, onRecarregar, onNext, onBack,
}: { competencia: string; dossie: PreClose; onRecarregar: () => Promise<void> | void; onNext: () => void; onBack: () => void }) {
  const recomendado = dossie.prolaboreRecomendadoCents;
  const [valor, setValor] = useState<string>(String((dossie.folhaMesCents || recomendado) / 100).replace(".", ","));
  const [impacto, setImpacto] = useState<ImpactoProlabore | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calcularImpacto = useCallback((prolaboreCents: number) => {
    apiFetch<ImpactoProlabore>(`/master/contabil/mes/${competencia}/impacto-prolabore`, {
      method: "POST",
      body: JSON.stringify({ prolaboreCents }),
    }).then(setImpacto).catch(() => setImpacto(null));
  }, [competencia]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => calcularImpacto(centsFromInput(valor)), 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [valor, calcularImpacto]);

  const usarRecomendado = useCallback(() => {
    setValor(String(recomendado / 100).replace(".", ","));
  }, [recomendado]);

  const gravarEAvancar = useCallback(() => {
    const prolaboreCents = centsFromInput(valor);
    setBusy(true);
    setMsg(null);
    apiFetch(`/master/contabil/mes/${competencia}/prolabore`, {
      method: "POST",
      body: JSON.stringify({ prolaboreCents }),
    })
      .then(() => onRecarregar())
      .then(() => onNext())
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Falha ao gravar o pró-labore."))
      .finally(() => setBusy(false));
  }, [valor, competencia, onRecarregar, onNext]);

  return (
    <div className="ctb-wiz-panel">
      <p className="ctb-wiz-lead">
        Para manter o Fator R em 28% (Anexo III), o pró-labore recomendado deste mês é <strong>{brl(recomendado)}</strong>.
      </p>
      <div className="ctb-wiz-form">
        <div className="ctb-field">
          <label>Pró-labore do mês (R$)</label>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </div>
        <button type="button" className="btn-ghost" style={{ minHeight: 32, width: "fit-content" }} onClick={usarRecomendado}>
          usar recomendado ({brl(recomendado)})
        </button>
      </div>

      {impacto && (
        <div className="ctb-wiz-impacto">
          <div className="ctb-wiz-kv">
            <div><span>Anexo aplicado</span><strong>{impacto.anexoAplicado}</strong></div>
            <div><span>Fator R</span><strong className={impacto.fatorR >= 0.28 ? "ctb-ok" : "ctb-bad"}>{pct(impacto.fatorR, 2)}</strong></div>
            <div><span>DAS</span><strong>{brl(impacto.dasCents)}</strong></div>
            <div><span>INSS (11%)</span><strong>{brl(impacto.inssCents)}</strong></div>
            <div><span>IRRF</span><strong>{brl(impacto.irrfCents)}</strong></div>
            <div><span>Total de tributos</span><strong>{brl(impacto.totalTributosCents)}</strong></div>
          </div>
          {impacto.fatorR < 0.28 && (
            <div className="ctb-wiz-alert bad">
              <span>⚠</span>
              <span>Com este pró-labore o Fator R fica abaixo de 28% → cai no Anexo V (DAS mais caro). Suba para o recomendado para ficar no III.</span>
            </div>
          )}
        </div>
      )}
      {msg && <span className="ctb-wiz-msg">{msg}</span>}

      <div className="ctb-wiz-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>voltar</button>
        <button type="button" className="btn-teal" disabled={busy} onClick={gravarEAvancar}>{busy ? "gravando…" : "gravar e avançar"}</button>
      </div>
    </div>
  );
}

// ---- Passo 3: eSocial + DCTFWeb -------------------------------------------

function PassoEsocial({ dossie, onRecarregar, onNext, onBack }: { dossie: PreClose; onRecarregar: () => Promise<void> | void; onNext: () => void; onBack: () => void }) {
  const esocial = dossie.obrigacoes.find((o) => o.tipo === "ESOCIAL_S1200" && !o.naoAplicavel);
  const dctf = dossie.obrigacoes.find((o) => o.tipo === "DCTFWEB" && !o.naoAplicavel);
  const inss = dossie.tributos.inssPrevistoCents;

  return (
    <div className="ctb-wiz-panel">
      <p className="ctb-wiz-lead">
        Folha do mês: pró-labore bruto <strong>{brl(dossie.folhaMesCents)}</strong>. Transmita o eSocial (S-1200) e a DCTFWeb, depois marque aqui com o nº do recibo.
      </p>
      <div className="ctb-wiz-govcard">
        <div className="ctb-wiz-govrow"><span>S-1200 — remuneração bruta</span><strong>{brl(dossie.folhaMesCents)}</strong></div>
        <div className="ctb-wiz-govrow"><span>DCTFWeb — INSS 11% (pró-labore)</span><strong>{brl(inss)}</strong></div>
      </div>
      <div className="ctb-wiz-links">
        <a className="btn-ghost" href={LINK_ESOCIAL} target="_blank" rel="noreferrer">Abrir eSocial ↗</a>
        <a className="btn-ghost" href={LINK_ECAC} target="_blank" rel="noreferrer">Abrir e-CAC (DCTFWeb) ↗</a>
      </div>

      {esocial && <MarcarObrigacaoCard ob={esocial} rotulo="eSocial S-1200" comprovantes={dossie.comprovantes[esocial.id] ?? 0} onDone={onRecarregar} />}
      {dctf && <MarcarObrigacaoCard ob={dctf} rotulo="DCTFWeb" comprovantes={dossie.comprovantes[dctf.id] ?? 0} onDone={onRecarregar} />}

      <div className="ctb-wiz-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>voltar</button>
        <button type="button" className="btn-teal" onClick={onNext}>avançar</button>
      </div>
    </div>
  );
}

// ---- Passo 4: PGDAS-D (com validador de divergência) ----------------------

function PassoPgdasd({
  competencia, dossie, onRecarregar, onNext, onBack,
}: { competencia: string; dossie: PreClose; onRecarregar: () => Promise<void> | void; onNext: () => void; onBack: () => void }) {
  const pgdasd = dossie.obrigacoes.find((o) => o.tipo === "PGDASD");
  const nossoDas = dossie.tributos.dasPrevistoCents;
  const [dasGoverno, setDasGoverno] = useState("");
  const [check, setCheck] = useState<ValidarDas | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // S7: o braço robótico Serpro. Só existe com a flag ON no backend + credencial
  // no cofre; caso contrário este bloco some e o passo fica no semi-auto do S5.
  const [serpro, setSerpro] = useState<SerproStatus | null>(null);
  useEffect(() => {
    apiFetch<SerproStatus>(`/master/contabil/serpro/status`).then(setSerpro).catch(() => setSerpro(null));
  }, []);
  const autopostAtivo = Boolean(serpro?.enabled && serpro?.credencialConfigurada);

  useEffect(() => {
    if (!dasGoverno.trim()) { setCheck(null); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setBusy(true);
      apiFetch<ValidarDas>(`/master/contabil/mes/${competencia}/validar-das`, {
        method: "POST",
        body: JSON.stringify({ dasGovernoCents: centsFromInput(dasGoverno) }),
      }).then(setCheck).catch(() => setCheck(null)).finally(() => setBusy(false));
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [dasGoverno, competencia]);

  // Trava o avanço enquanto o governo digitado divergir.
  const divergiu = check?.diverge === true;
  const podeAvancar = !dasGoverno.trim() || check?.diverge === false;

  return (
    <div className="ctb-wiz-panel">
      <p className="ctb-wiz-lead">
        Espelho do PGDAS-D — confira na MESMA ordem que a tela do governo pede, declare, e cole o DAS que o governo calculou.
      </p>

      {autopostAtivo && (
        <SerproAutopostCard competencia={competencia} ambiente={serpro!.ambiente} onDone={onRecarregar} />
      )}
      <div className="ctb-wiz-govcard">
        <div className="ctb-wiz-govrow"><span>Receita bruta do mês (PA)</span><strong>{brl(dossie.receita.receitaMesCents)}</strong></div>
        <div className="ctb-wiz-govrow"><span>Folha dos últimos 12 meses</span><strong>{brl(dossie.cadeia.folha12mCents)}</strong></div>
        <div className="ctb-wiz-govrow"><span>Anexo esperado</span><strong>{dossie.cadeia.anexoAplicado ?? "—"}</strong></div>
        <div className="ctb-wiz-govrow"><span>Alíquota efetiva</span><strong>{pct(dossie.cadeia.aliquotaEfetiva, 2)}</strong></div>
        <div className="ctb-wiz-govrow total"><span>DAS esperado (nosso)</span><strong>{brl(nossoDas)}</strong></div>
      </div>
      <div className="ctb-wiz-links">
        <a className="btn-ghost" href={LINK_PGDASD} target="_blank" rel="noreferrer">Abrir PGDAS-D ↗</a>
        <a className="btn-ghost" href={LINK_DAS} target="_blank" rel="noreferrer">Gerar DAS ↗</a>
      </div>

      {/* Validador de divergência — o disjuntor do copiloto */}
      <div className="ctb-wiz-form">
        <div className="ctb-field">
          <label>Qual DAS o governo calculou? (R$)</label>
          <input inputMode="decimal" value={dasGoverno} onChange={(e) => setDasGoverno(e.target.value)} placeholder="0,00" />
        </div>
        {busy && <span className="ctb-wiz-msg">conferindo…</span>}
        {check && !divergiu && dasGoverno.trim() && (
          <div className="ctb-wiz-alert ok"><span>✅</span><span>Bate com o nosso ({brl(check.governoCents)} × {brl(check.nossoDasCents)}, diferença {brl(check.diffCents)}). Pode seguir.</span></div>
        )}
        {divergiu && (
          <div className="ctb-wiz-alert bad">
            <span>🛑</span>
            <span>
              <strong>PARE: divergência</strong> — governo {brl(check!.governoCents)} × nosso {brl(check!.nossoDasCents)} (diferença {brl(check!.diffCents)}, tolerância {brl(check!.toleranciaCents)}).
              Revise a digitação OU confira o mês antes de pagar. O avanço está travado.
            </span>
          </div>
        )}
      </div>

      {pgdasd && <MarcarObrigacaoCard ob={pgdasd} rotulo="PGDAS-D" comprovantes={dossie.comprovantes[pgdasd.id] ?? 0} onDone={onRecarregar} />}

      <div className="ctb-wiz-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>voltar</button>
        <button type="button" className="btn-teal" disabled={!podeAvancar} onClick={onNext}>
          {divergiu ? "resolva a divergência" : "avançar"}
        </button>
      </div>
    </div>
  );
}

// ---- S7: cartão ARMAR → TRANSMITIR (autopost via Serpro) ------------------
// Lei nº1 (copiloto, não piloto): ARMAR só MOSTRA o payload do motor + o custo;
// TRANSMITIR exige o clique-com-confirmação ("digite TRANSMITIR"). Nenhum envio
// acontece sem a confirmação. Se o braço falhar, o passo segue no semi-auto do
// S5 (deep-links + marcar manual, logo abaixo deste cartão) — nunca bloqueia.

function SerproAutopostCard({
  competencia, ambiente, onDone,
}: { competencia: string; ambiente: "demo" | "producao"; onDone: () => Promise<void> | void }) {
  const [armado, setArmado] = useState<SerproArmar | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<SerproTransmitir | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const armar = useCallback(() => {
    setErro(null);
    apiFetch<SerproArmar>(`/master/contabil/serpro/armar/${competencia}`)
      .then(setArmado)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao armar."));
  }, [competencia]);

  useEffect(() => { armar(); }, [armar]);

  const transmitir = useCallback(() => {
    if (confirmacao.trim().toUpperCase() !== "TRANSMITIR") {
      setErro('Digite TRANSMITIR (em maiúsculas) para autorizar o envio.');
      return;
    }
    setBusy(true);
    setErro(null);
    apiFetch<SerproTransmitir>(`/master/contabil/serpro/transmitir/${competencia}`, {
      method: "POST",
      body: JSON.stringify({ confirmacao: confirmacao.trim().toUpperCase() }),
    })
      .then((res) => { setResultado(res); setConfirmacao(""); return onDone(); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao transmitir."))
      .finally(() => setBusy(false));
  }, [confirmacao, competencia, onDone]);

  const baixarDas = useCallback((b64: string) => {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `DAS-${competencia}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { setErro("Falha ao abrir o PDF do DAS."); }
  }, [competencia]);

  // Resultado da transmissão (TRANSMITIDO / REVISAR / FALLBACK).
  if (resultado) {
    if (resultado.estado === "FALLBACK") {
      return (
        <div className="ctb-wiz-alert bad">
          <span>⚠</span>
          <span>
            <strong>Serpro indisponível</strong> — {resultado.erro || "use o modo manual abaixo"}. Nada foi transmitido; siga pelos deep-links (semi-auto).
          </span>
        </div>
      );
    }
    if (resultado.estado === "REVISAR") {
      return (
        <div className="ctb-serpro">
          <div className="ctb-wiz-alert bad">
            <span>🔴</span>
            <span>
              <strong>Transmitido, mas REVISAR:</strong> {resultado.conferencia?.detalhe}. A obrigação foi marcada REVISAR — confira no portal antes de pagar.
            </span>
          </div>
          {resultado.numeroRecibo && <div className="ctb-serpro-das"><span>Recibo:</span> <strong>{resultado.numeroRecibo}</strong></div>}
          {resultado.dasPdfB64 && (
            <div className="ctb-serpro-das">
              <span>DAS gerado{resultado.dasNumeroDocumento ? ` (${resultado.dasNumeroDocumento})` : ""}.</span>
              <button type="button" className="btn-ghost ctb-cofre-remove" onClick={() => baixarDas(resultado.dasPdfB64!)}>baixar PDF</button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="ctb-serpro">
        <div className="ctb-wiz-alert ok">
          <span>✅</span>
          <span><strong>PGDAS-D transmitido</strong> e conferido pelo Serpro. Recibo <strong>{resultado.numeroRecibo}</strong>.</span>
        </div>
        {resultado.dasPdfB64 && (
          <div className="ctb-serpro-das">
            <span>Guia DAS{resultado.dasNumeroDocumento ? ` ${resultado.dasNumeroDocumento}` : ""} anexada.</span>
            <button type="button" className="btn-teal ctb-cofre-remove" onClick={() => baixarDas(resultado.dasPdfB64!)}>baixar DAS (PDF)</button>
          </div>
        )}
      </div>
    );
  }

  // Indisponível para armar → não renderiza (o passo cai no semi-auto abaixo).
  if (armado && !armado.disponivel) return null;

  return (
    <div className="ctb-serpro">
      <div className="ctb-serpro-head">
        <span className="ctb-serpro-title">Transmitir pelo Serpro {ambiente === "demo" ? "(demonstração)" : ""}</span>
        {armado && <span className="ctb-serpro-custo">{armado.custoEstimadoLabel}</span>}
      </div>

      {armado?.payload ? (
        <>
          <p className="ctb-serpro-hint">
            ARMADO — revise o que será enviado (números do motor). Ao transmitir, o app declara o PGDAS-D e baixa o DAS pela API oficial.
          </p>
          <div className="ctb-wiz-govcard">
            <div className="ctb-wiz-govrow"><span>Período de apuração</span><strong>{armado.payload.periodoApuracao}</strong></div>
            <div className="ctb-wiz-govrow"><span>Receita bruta do mês</span><strong>{brl(armado.payload.receitaBrutaMesCents)}</strong></div>
            <div className="ctb-wiz-govrow"><span>Folha 12 meses</span><strong>{brl(armado.payload.folha12mCents)}</strong></div>
            <div className="ctb-wiz-govrow"><span>Anexo · alíquota efetiva</span><strong>{armado.payload.anexoAplicado} · {pct(armado.payload.aliquotaEfetiva, 2)}</strong></div>
            <div className="ctb-wiz-govrow total"><span>DAS a declarar</span><strong>{brl(armado.payload.dasPrevistoCents)}</strong></div>
          </div>

          <div className="ctb-serpro-confirm">
            <label className="ctb-serpro-confirm-label">Digite <strong>TRANSMITIR</strong> para autorizar o envio à Receita:</label>
            <input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder="TRANSMITIR" autoComplete="off" />
          </div>
          {erro && <div className="ctb-wiz-alert bad"><span>⚠</span><span>{erro}</span></div>}
          <div className="ctb-wiz-actions">
            <button type="button" className="btn-ghost" onClick={armar} disabled={busy}>re-armar</button>
            <button
              type="button"
              className="btn-teal"
              disabled={busy || confirmacao.trim().toUpperCase() !== "TRANSMITIR"}
              onClick={transmitir}
            >
              {busy ? "transmitindo…" : "Transmitir agora"}
            </button>
          </div>
        </>
      ) : (
        <p className="ctb-serpro-hint">{erro || "Armando o payload do motor…"}</p>
      )}
    </div>
  );
}

// ---- Passo 5: Pagamentos --------------------------------------------------

function PassoPagamentos({ dossie, onRecarregar, onNext, onBack }: { dossie: PreClose; onRecarregar: () => Promise<void> | void; onNext: () => void; onBack: () => void }) {
  const das = dossie.obrigacoes.find((o) => o.tipo === "DAS");
  const darf = dossie.obrigacoes.find((o) => o.tipo === "DARF_INSS" && !o.naoAplicavel);

  return (
    <div className="ctb-wiz-panel">
      <p className="ctb-wiz-lead">
        Pague o DAS{darf ? " e o DARF INSS" : ""} e marque aqui — a saída entra automaticamente no Livro Caixa.
      </p>
      <div className="ctb-wiz-govcard">
        <div className="ctb-wiz-govrow"><span>DAS (Simples Nacional)</span><strong>{brl(dossie.tributos.dasPrevistoCents)}</strong></div>
        {darf && <div className="ctb-wiz-govrow"><span>DARF INSS (pró-labore)</span><strong>{brl(dossie.tributos.inssPrevistoCents)}</strong></div>}
      </div>

      {das && <MarcarObrigacaoCard ob={das} rotulo="DAS" comprovantes={dossie.comprovantes[das.id] ?? 0} onDone={onRecarregar} alvoEstado="PAGO" />}
      {darf && <MarcarObrigacaoCard ob={darf} rotulo="DARF INSS" comprovantes={dossie.comprovantes[darf.id] ?? 0} onDone={onRecarregar} alvoEstado="PAGO" />}

      <div className="ctb-wiz-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>voltar</button>
        <button type="button" className="btn-teal" onClick={onNext}>avançar</button>
      </div>
    </div>
  );
}

// ---- Passo 6: Resumo do fechamento ----------------------------------------

function PassoResumo({
  competencia, dossie, onBack, onClose, onDone,
}: { competencia: string; dossie: PreClose; onBack: () => void; onClose: () => void; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<FecharResp | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const pctReceita = dossie.receita.receitaMesCents > 0
    ? dossie.tributos.tributosTotalCents / dossie.receita.receitaMesCents
    : 0;
  const selo = dossie.cadeia.fatorR >= 0.28 ? "🟢" : "🔴";

  const fechar = useCallback(() => {
    setBusy(true);
    setErro(null);
    apiFetch<FecharResp>(`/master/contabil/mes/${competencia}/fechar`, {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then((res) => { setResultado(res); onDone?.(); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao fechar o mês."))
      .finally(() => setBusy(false));
  }, [competencia, onDone]);

  if (resultado) {
    return (
      <div className="ctb-wiz-panel">
        <div className="ctb-wiz-alert ok"><span>🎉</span><span>Mês {competenciaLabel(competencia)} fechado. {resultado.obrigacoesConferidas} obrigação(ões) conferida(s).</span></div>
        <div className="ctb-wiz-relatorio">
          <div className="ctb-wiz-relatorio-head">
            <span>Relatório enviado {resultado.enviadoZap ? "no seu WhatsApp ✅" : "(zap indisponível — guardado no histórico)"}</span>
          </div>
          <pre className="ctb-wiz-relatorio-texto">{resultado.relatorio.texto}</pre>
        </div>
        <div className="ctb-wiz-actions">
          <button type="button" className="btn-teal" onClick={onClose}>concluir</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ctb-wiz-panel">
      {dossie.fase0 ? (
        <p className="ctb-wiz-lead">
          Fase 0 — sem receita e sem pró-labore. Confirme a transmissão do PGDAS-D zerado e feche o mês.
        </p>
      ) : (
        <p className="ctb-wiz-lead">Revise o resumo e feche o mês. O relatório vai pro seu WhatsApp.</p>
      )}

      <div className="ctb-wiz-kv big">
        <div><span>Receita</span><strong>{brl(dossie.receita.receitaMesCents)}</strong></div>
        <div><span>Tributos</span><strong>{brl(dossie.tributos.tributosTotalCents)} ({pct(pctReceita)})</strong></div>
        <div><span>Lucro isento gerado (mês)</span><strong>{brl(dossie.lucroIsentoMesCents)}</strong></div>
        <div><span>Fator R</span><strong>{pct(dossie.cadeia.fatorR, 2)} {selo} · Anexo {dossie.cadeia.anexoAplicado ?? "—"}</strong></div>
      </div>

      {!dossie.reconciliacao.bate && (
        <div className="ctb-wiz-alert bad"><span>⚠</span><span>Receita do DAS e Livro Caixa ainda divergem — confira antes de fechar.</span></div>
      )}
      {erro && <div className="ctb-wiz-alert bad"><span>⚠</span><span>{erro}</span></div>}

      <div className="ctb-wiz-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>voltar</button>
        <button type="button" className="btn-teal" disabled={busy} onClick={fechar}>{busy ? "fechando…" : "Fechar o mês"}</button>
      </div>
    </div>
  );
}

// ---- Card reutilizável: marcar obrigação + anexar comprovante -------------

const ESTADOS_ORDEM = ["AGUARDANDO_DADOS", "PRONTO", "ARMADO", "TRANSMITIDO", "PAGO", "CONFERIDO"];
const ESTADO_LABEL: Record<string, string> = {
  AGUARDANDO_DADOS: "Aguardando dados", PRONTO: "Pronto", ARMADO: "Armado",
  TRANSMITIDO: "Transmitido", PAGO: "Pago", CONFERIDO: "Conferido",
};

function proximoEstado(estado: string): string | null {
  const i = ESTADOS_ORDEM.indexOf(estado);
  if (i < 0 || i >= ESTADOS_ORDEM.length - 1) return null;
  return ESTADOS_ORDEM[i + 1];
}

function MarcarObrigacaoCard({
  ob, rotulo, comprovantes, onDone, alvoEstado,
}: {
  ob: { id: string; tipo: string; estado: string; dueDate: string };
  rotulo: string;
  comprovantes: number;
  onDone: () => Promise<void> | void;
  alvoEstado?: string;
}) {
  // Se um alvo explícito foi pedido (ex.: "PAGO" no passo de pagamentos) mas a
  // obrigação já está NELE ou além, não oferece re-marcar (nada de andar pra trás).
  const alvoExplicitoValido =
    alvoEstado && ESTADOS_ORDEM.indexOf(ob.estado) < ESTADOS_ORDEM.indexOf(alvoEstado) ? alvoEstado : null;
  const alvo = alvoEstado ? alvoExplicitoValido : proximoEstado(ob.estado);
  const [recibo, setRecibo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [comprovList, setComprovList] = useState<Comprovante[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const carregarComprovantes = useCallback(() => {
    apiFetch<Comprovante[]>(`/master/contabil/obrigacoes/${ob.id}/comprovantes`)
      .then((r) => setComprovList(Array.isArray(r) ? r : []))
      .catch(() => setComprovList([]));
  }, [ob.id]);

  useEffect(() => { carregarComprovantes(); }, [carregarComprovantes]);

  const marcar = useCallback(() => {
    if (!alvo) return;
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { estado: alvo };
    if (recibo.trim()) body.resultJson = JSON.stringify({ recibo: recibo.trim(), marcadoEm: new Date().toISOString() });
    apiFetch(`/master/contabil/obrigacoes/${ob.id}/marcar`, { method: "POST", body: JSON.stringify(body) })
      .then(() => onDone())
      .then(() => setMsg(`Marcado como ${ESTADO_LABEL[alvo].toLowerCase()}.`))
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Falha ao marcar."))
      .finally(() => setBusy(false));
  }, [alvo, recibo, ob.id, onDone]);

  const enviarComprovante = useCallback((file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    setMsg(null);
    fetch(`${getApiBase()}/master/contabil/obrigacoes/${ob.id}/comprovantes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken() || ""}` },
      body: fd,
    })
      .then(async (res) => { if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "Falha no upload."); })
      .then(() => { carregarComprovantes(); onDone(); setMsg("Comprovante anexado."); })
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Falha ao anexar."))
      .finally(() => setBusy(false));
  }, [ob.id, carregarComprovantes, onDone]);

  const baixar = useCallback(async (c: Comprovante) => {
    try {
      const res = await fetch(`${getApiBase()}/master/contabil/comprovantes/${c.id}/download`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error("download falhou");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = c.originalFilename; a.click();
      URL.revokeObjectURL(url);
    } catch { setMsg("Falha ao baixar o comprovante."); }
  }, []);

  const remover = useCallback((c: Comprovante) => {
    apiFetch(`/master/contabil/comprovantes/${c.id}`, { method: "DELETE" })
      .then(() => { carregarComprovantes(); onDone(); })
      .catch(() => setMsg("Falha ao remover."));
  }, [carregarComprovantes, onDone]);

  return (
    <div className="ctb-wiz-oblig">
      <div className="ctb-wiz-oblig-head">
        <span className="ctb-wiz-oblig-title">{rotulo}</span>
        <span className={"ctb-chip" + (ob.estado === "CONFERIDO" || ob.estado === "PAGO" ? " ok" : ob.estado === "TRANSMITIDO" || ob.estado === "ARMADO" ? " warn" : "")}>
          {ESTADO_LABEL[ob.estado] || ob.estado}
        </span>
        <span className="ctb-wiz-oblig-due">vence {fmtData(ob.dueDate)}</span>
      </div>

      {alvo && (
        <div className="ctb-wiz-mark">
          <input className="ctb-wiz-recibo" value={recibo} onChange={(e) => setRecibo(e.target.value)} placeholder="nº do recibo/protocolo (opcional)" />
          <button type="button" className="btn-teal" style={{ minHeight: 32 }} disabled={busy} onClick={marcar}>
            marcar {ESTADO_LABEL[alvo].toLowerCase()}
          </button>
        </div>
      )}

      <div className="ctb-wiz-comprov">
        <div className="ctb-wiz-comprov-head">
          <span>Comprovantes {comprovantes > 0 ? `(${comprovantes})` : ""}</span>
          <button type="button" className="btn-ghost" style={{ minHeight: 28, fontSize: "0.62rem" }} onClick={() => fileRef.current?.click()}>
            + anexar (PDF/print)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarComprovante(f); e.target.value = ""; }}
          />
        </div>
        {(comprovList || []).map((c) => (
          <div key={c.id} className="ctb-wiz-comprov-item">
            <span className="ctb-wiz-comprov-name">{c.originalFilename}</span>
            <button type="button" className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem" }} onClick={() => baixar(c)}>baixar</button>
            <button type="button" className="btn-ghost" style={{ minHeight: 24, fontSize: "0.6rem" }} onClick={() => remover(c)}>remover</button>
          </div>
        ))}
      </div>

      {msg && <span className="ctb-wiz-msg">{msg}</span>}
    </div>
  );
}
