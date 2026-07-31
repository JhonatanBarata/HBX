"use client";

// Janela "Contabil" — o contador-robô do dono, dentro do /master (CONTABIL S3).
// UI de altíssima qualidade sobre os endpoints do S1 (motor fiscal + fonte de
// receita) e S2 (calendário de obrigações). Copiloto: calcula e prepara, mas
// NUNCA transmite sozinho (Lei do Contabil nº1) — este sprint é só leitura +
// ajustes manuais explícitos (perfil, pró-labore, marcar obrigação).
// Backend: GET/PATCH/POST /master/contabil/* (JWT + MasterGuard, owner-only).
// Visual em hbx-theme/contabil-master.css (5 Leis): só layout inline aqui.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { reportError } from "@/lib/error-bus";

import { fmtData, fmtDataHora } from "./page.client";
import { WizardFecharMes } from "./contabil-fechar-mes";

// ---- Shapes (espelham contabil.service.ts / fiscal-engine.service.ts) ----

export type FiscalRevenueMonth = {
  competencia: string;
  receitaCaixaCents: number;
  receitaNotasCents: number;
  ajusteManualCents: number;
  ajusteMotivo?: string | null;
  folhaMesCents: number;
  rbt12Cents: number;
  folha12mCents: number;
  fatorR: number;
  anexoAplicado: "III" | "V";
  aliquotaEfetiva: number;
  dasPrevistoCents: number;
  inssPrevistoCents: number;
  irrfPrevistoCents: number;
  fechadoEm?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type SimuladorResp = {
  dasCents: number;
  inssCents: number;
  irrfCents: number;
  totalTributosCents: number;
  anexoAplicado: "III" | "V";
  aliquotaEfetiva: number;
  fatorR: number;
};

type FiscalProfile = {
  id: number;
  cnpj: string | null;
  razaoSocial: string | null;
  dataAbertura: string | null;
  regime: string;
  anexoBase: string;
  cnaePrincipal: string;
  aliquotaIssMunicipal: number | null;
  prolaboreAlvoPct: number;
  certA1ExpiresAt: string | null;
  certA1Configured: boolean;
  serproConfigured: boolean;
  updatedAt?: string;
};

// CONTABIL S6 — status público do cofre do certificado A1 (espelha nfse-cert.service).
// NUNCA carrega o segredo — só validade/dias p/ expirar (o backend nunca devolve o cert).
type CertStatus = {
  configurado: boolean;
  certA1ExpiresAt: string | null;
  diasParaExpirar: number | null;
  expirado: boolean;
  renovarEmBreve: boolean;
};

export type FiscalObligation = {
  id: string;
  competencia: string;
  tipo: "PGDASD" | "DAS" | "ESOCIAL_S1200" | "DCTFWEB" | "DARF_INSS" | "DEFIS" | "LIVRO_CAIXA" | string;
  dueDate: string;
  estado: "AGUARDANDO_DADOS" | "PRONTO" | "ARMADO" | "TRANSMITIDO" | "PAGO" | "CONFERIDO" | string;
  naoAplicavel: boolean;
  atrasado: boolean;
  payloadJson: string | null;
  resultJson: string | null;
  alertasEnviados: number;
  updatedAt: string;
  createdAt: string;
};

// CONTABIL S4 — Livro Caixa / lucro isento (espelham livro-caixa.service.ts).
export type FiscalLedgerEntry = {
  id: string;
  data: string;
  competencia: string;
  tipo: "ENTRADA" | "SAIDA" | string;
  categoria: string;
  descricao: string;
  valorCents: number;
  origem: "AUTO_MP" | "AUTO_OBRIGACAO" | "MANUAL" | string;
  refId: string | null;
  motivo: string | null;
  estornaId: string | null;
  anoFechado: boolean;
  saldoAcumuladoCents: number;
  createdAt: string;
  updatedAt: string;
};

type LucroIsentoResp = {
  ano: string;
  receitaAcumuladaCents: number;
  dasPagoAcumuladoCents: number;
  jaDistribuidoCents: number;
  disponivelCents: number;
};

type ResumoAnoResp = {
  ano: string;
  entradasCents: number;
  saidasCents: number;
  saldoCents: number;
  lancamentos: number;
};

const CATEGORIA_LABEL: Record<string, string> = {
  // MASTER-REFAB S7 (10/07): rótulo trocado — a categoria persistida ("RECEITA_ASSINATURA",
  // dado de banco, não editada aqui) hoje é sobretudo recarga de crédito (credit-recharge.
  // service grava aqui também), não só assinatura/checkout do modelo de plano morto.
  RECEITA_ASSINATURA: "Receita (cobranças MP)",
  DAS: "DAS",
  DARF_INSS: "DARF INSS",
  PROLABORE: "Pró-labore",
  DISTRIBUICAO_LUCRO: "Distribuição de lucro",
  INFRA: "Infraestrutura",
  FERRAMENTA: "Ferramenta",
  OUTRO: "Outro",
  ESTORNO: "Estorno",
};

const CATEGORIAS_MANUAIS = ["PROLABORE", "DISTRIBUICAO_LUCRO", "INFRA", "FERRAMENTA", "OUTRO"];

const FATOR_R_LIMIAR = 0.28;

const TIPO_LABEL: Record<string, string> = {
  PGDASD: "PGDAS-D (declaração)",
  DAS: "DAS (guia do Simples)",
  ESOCIAL_S1200: "eSocial S-1200 (folha)",
  DCTFWEB: "DCTFWeb",
  DARF_INSS: "DARF INSS (pró-labore)",
  DEFIS: "DEFIS (declaração anual)",
  LIVRO_CAIXA: "Livro Caixa",
};

const TIPO_LINK: Record<string, string> = {
  PGDASD: "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgdasd.app/identificacao",
  DAS: "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/gerarDas.app/identificacao",
  ESOCIAL_S1200: "https://www.gov.br/esocial/pt-br",
  DCTFWEB: "https://dctfweb.receita.fazenda.gov.br/",
  DARF_INSS: "https://sicalc.receita.fazenda.gov.br/",
  DEFIS: "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATBHE/declaracaoDefis.app/identificacao",
  LIVRO_CAIXA: "",
};

const ESTADO_LABEL: Record<string, string> = {
  AGUARDANDO_DADOS: "Aguardando dados",
  PRONTO: "Pronto",
  ARMADO: "Armado",
  TRANSMITIDO: "Transmitido",
  PAGO: "Pago",
  CONFERIDO: "Conferido",
};

const ESTADOS_ORDEM = ["AGUARDANDO_DADOS", "PRONTO", "ARMADO", "TRANSMITIDO", "PAGO", "CONFERIDO"];

function estadoChipClass(estado: string, atrasado: boolean): string {
  if (atrasado) return "ctb-chip bad";
  if (estado === "CONFERIDO" || estado === "PAGO") return "ctb-chip ok";
  if (estado === "TRANSMITIDO" || estado === "ARMADO") return "ctb-chip warn";
  return "ctb-chip";
}

function brl(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(v: number | null | undefined, casas = 1): string {
  return `${((v ?? 0) * 100).toFixed(casas)}%`;
}

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function proximoEstado(estado: string): string | null {
  const idx = ESTADOS_ORDEM.indexOf(estado);
  if (idx < 0 || idx >= ESTADOS_ORDEM.length - 1) return null;
  return ESTADOS_ORDEM[idx + 1];
}

function diasAte(iso: string): number {
  const alvo = new Date(iso).getTime();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.ceil((alvo - hoje.getTime()) / (24 * 60 * 60 * 1000));
}

function countdownLabel(iso: string, atrasado: boolean): string {
  const dias = diasAte(iso);
  if (atrasado) return `atrasado há ${Math.abs(dias)}d`;
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias < 0) return "vencido";
  return `faltam ${dias}d`;
}

export function JanelaContabil({ onBadgeChange }: { onBadgeChange?: (contagem: { atrasadas: number; proximas: number }) => void }) {
  const competencia = useMemo(() => competenciaAtual(), []);

  const [mes, setMes] = useState<FiscalRevenueMonth | null>(null);
  const [mesError, setMesError] = useState<string | null>(null);
  const [obrigacoes, setObrigacoes] = useState<FiscalObligation[] | null>(null);
  const [obrigError, setObrigError] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<FiscalProfile | null>(null);

  const [simReceita, setSimReceita] = useState<string>("");
  const [simProlabore, setSimProlabore] = useState<string>("");
  const [sim, setSim] = useState<SimuladorResp | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  const [perfilOpen, setPerfilOpen] = useState(false);
  const [perfilForm, setPerfilForm] = useState<Partial<FiscalProfile>>({});
  const [perfilBusy, setPerfilBusy] = useState(false);
  const [perfilMsg, setPerfilMsg] = useState<string | null>(null);

  // CONTABIL S6 — cofre do certificado A1 (NFS-e). Segredo nunca volta pela API;
  // só status/validade. Flag da NFS-e é do backend (default OFF) — a UI do cofre
  // funciona antes de ligar (o dono configura o cert, a emissão é que fica atrás da flag).
  const [certStatus, setCertStatus] = useState<CertStatus | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certSenha, setCertSenha] = useState<string>("");
  const [certBusy, setCertBusy] = useState(false);
  const [certMsg, setCertMsg] = useState<string | null>(null);

  // CONTABIL S7 — cofre da credencial Serpro (Integra Contador). Igual ao cert:
  // o segredo (consumer key/secret) some do estado após o envio e NUNCA volta.
  const [serproKey, setSerproKey] = useState<string>("");
  const [serproSecret, setSerproSecret] = useState<string>("");
  const [serproCnpj, setSerproCnpj] = useState<string>("");
  const [serproBusy, setSerproBusy] = useState(false);
  const [serproMsg, setSerproMsg] = useState<string | null>(null);

  const [prolaboreBusy, setProlaboreBusy] = useState(false);
  const [ajusteMsg, setAjusteMsg] = useState<string | null>(null);

  const [marcarBusy, setMarcarBusy] = useState<string | null>(null);

  // CONTABIL S4 — Livro Caixa / lucro isento.
  const anoAtual = useMemo(() => String(new Date().getFullYear()), []);
  const [lcCompetencia, setLcCompetencia] = useState<string>(competencia);
  const [lcCategoria, setLcCategoria] = useState<string>("");
  const [lancamentos, setLancamentos] = useState<FiscalLedgerEntry[] | null>(null);
  const [lcError, setLcError] = useState<string | null>(null);
  const [resumoAno, setResumoAno] = useState<ResumoAnoResp | null>(null);
  const [lucroIsento, setLucroIsento] = useState<LucroIsentoResp | null>(null);

  const [lcFormOpen, setLcFormOpen] = useState(false);
  const [lcForm, setLcForm] = useState<{ data: string; tipo: string; categoria: string; descricao: string; valor: string }>({
    data: new Date().toISOString().slice(0, 10),
    tipo: "SAIDA",
    categoria: "PROLABORE",
    descricao: "",
    valor: "",
  });
  const [lcBusy, setLcBusy] = useState(false);
  const [lcMsg, setLcMsg] = useState<string | null>(null);

  const [retiradaOpen, setRetiradaOpen] = useState(false);
  const [retiradaValor, setRetiradaValor] = useState("");
  const [retiradaBusy, setRetiradaBusy] = useState(false);
  const [retiradaMsg, setRetiradaMsg] = useState<string | null>(null);
  const [distribuidoNoMesCents, setDistribuidoNoMesCents] = useState(0);

  const [fecharAnoBusy, setFecharAnoBusy] = useState(false);
  const [fecharAnoMsg, setFecharAnoMsg] = useState<string | null>(null);

  const carregarLancamentos = useCallback(() => {
    const q = new URLSearchParams();
    if (lcCompetencia) q.set("competencia", lcCompetencia);
    else q.set("ano", anoAtual);
    if (lcCategoria) q.set("categoria", lcCategoria);
    return apiFetch<FiscalLedgerEntry[]>(`/master/contabil/livro-caixa?${q.toString()}`)
      .then((res) => { setLancamentos(Array.isArray(res) ? res : []); setLcError(null); })
      .catch((err: unknown) => {
        setLancamentos([]);
        setLcError(err instanceof Error ? err.message : "Falha ao carregar o Livro Caixa.");
      });
  }, [lcCompetencia, lcCategoria, anoAtual]);

  const carregarResumoAno = useCallback(() => {
    return apiFetch<ResumoAnoResp>(`/master/contabil/livro-caixa/resumo/${anoAtual}`)
      .then(setResumoAno)
      .catch(() => setResumoAno(null));
  }, [anoAtual]);

  const carregarLucroIsento = useCallback(() => {
    return apiFetch<LucroIsentoResp>(`/master/contabil/livro-caixa/lucro-isento/${anoAtual}`)
      .then(setLucroIsento)
      .catch(() => setLucroIsento(null));
  }, [anoAtual]);

  const carregarDistribuidoNoMes = useCallback(() => {
    return apiFetch<FiscalLedgerEntry[]>(`/master/contabil/livro-caixa?competencia=${competencia}&categoria=DISTRIBUICAO_LUCRO`)
      .then((res) => setDistribuidoNoMesCents((Array.isArray(res) ? res : []).reduce((s, r) => s + r.valorCents, 0)))
      .catch(() => setDistribuidoNoMesCents(0));
  }, [competencia]);

  useEffect(() => { carregarLancamentos(); }, [carregarLancamentos]);
  useEffect(() => { carregarResumoAno(); }, [carregarResumoAno]);
  useEffect(() => { carregarLucroIsento(); }, [carregarLucroIsento]);
  useEffect(() => { carregarDistribuidoNoMes(); }, [carregarDistribuidoNoMes]);

  const criarLancamentoManual = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const valorCents = Math.round((Number(lcForm.valor.replace(",", ".")) || 0) * 100);
    if (valorCents <= 0) { setLcMsg("Informe um valor maior que zero."); return; }
    if (!lcForm.descricao.trim()) { setLcMsg("Descrição é obrigatória."); return; }
    setLcBusy(true);
    setLcMsg(null);
    apiFetch(`/master/contabil/livro-caixa`, {
      method: "POST",
      body: JSON.stringify({ data: lcForm.data, tipo: lcForm.tipo, categoria: lcForm.categoria, descricao: lcForm.descricao.trim(), valorCents }),
    })
      .then(() => {
        setLcMsg("Lançamento registrado.");
        setLcForm((f) => ({ ...f, descricao: "", valor: "" }));
        return Promise.all([carregarLancamentos(), carregarResumoAno(), carregarLucroIsento(), carregarDistribuidoNoMes()]);
      })
      .catch((err: unknown) => { reportError(err); setLcMsg(err instanceof Error ? err.message : "Falha ao registrar o lançamento."); })
      .finally(() => setLcBusy(false));
  }, [lcForm, carregarLancamentos, carregarResumoAno, carregarLucroIsento, carregarDistribuidoNoMes]);

  const estornarLancamento = useCallback((entry: FiscalLedgerEntry) => {
    const motivo = window.prompt(`Motivo do estorno de "${entry.descricao}":`);
    if (!motivo || motivo.trim().length < 3) return;
    apiFetch(`/master/contabil/livro-caixa/${entry.id}/estornar`, {
      method: "POST",
      body: JSON.stringify({ motivo: motivo.trim() }),
    })
      .then(() => Promise.all([carregarLancamentos(), carregarResumoAno(), carregarLucroIsento(), carregarDistribuidoNoMes()]))
      .catch((err: unknown) => { reportError(err); setLcMsg(err instanceof Error ? err.message : "Falha ao estornar."); });
  }, [carregarLancamentos, carregarResumoAno, carregarLucroIsento, carregarDistribuidoNoMes]);

  const registrarRetiradaLucro = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const valorCents = Math.round((Number(retiradaValor.replace(",", ".")) || 0) * 100);
    if (valorCents <= 0) { setRetiradaMsg("Informe um valor maior que zero."); return; }
    setRetiradaBusy(true);
    setRetiradaMsg(null);
    apiFetch(`/master/contabil/livro-caixa`, {
      method: "POST",
      body: JSON.stringify({
        data: new Date().toISOString().slice(0, 10),
        tipo: "SAIDA",
        categoria: "DISTRIBUICAO_LUCRO",
        descricao: "Retirada de lucro isento",
        valorCents,
      }),
    })
      .then(() => {
        setRetiradaMsg("Retirada registrada.");
        setRetiradaValor("");
        setRetiradaOpen(false);
        return Promise.all([carregarLancamentos(), carregarResumoAno(), carregarLucroIsento(), carregarDistribuidoNoMes()]);
      })
      .catch((err: unknown) => { reportError(err); setRetiradaMsg(err instanceof Error ? err.message : "Falha ao registrar a retirada."); })
      .finally(() => setRetiradaBusy(false));
  }, [retiradaValor, carregarLancamentos, carregarResumoAno, carregarLucroIsento, carregarDistribuidoNoMes]);

  const fecharLivroCaixaAno = useCallback(() => {
    if (!window.confirm(`Fechar o Livro Caixa de ${anoAtual}? Os lançamentos ficam congelados — correção só via estorno.`)) return;
    setFecharAnoBusy(true);
    setFecharAnoMsg(null);
    apiFetch<{ congelados?: number }>(`/master/contabil/livro-caixa/fechar/${anoAtual}`, { method: "POST", body: JSON.stringify({}) })
      .then((res) => {
        setFecharAnoMsg(`Ano fechado — ${res?.congelados ?? 0} lançamento(s) congelado(s).`);
        return carregarLancamentos();
      })
      .catch((err: unknown) => { reportError(err); setFecharAnoMsg(err instanceof Error ? err.message : "Falha ao fechar o ano."); })
      .finally(() => setFecharAnoBusy(false));
  }, [anoAtual, carregarLancamentos]);

  const exportarLivroCaixaCsv = useCallback(async (escopo: "competencia" | "ano") => {
    const q = new URLSearchParams();
    if (escopo === "competencia") q.set("competencia", lcCompetencia || competencia);
    else q.set("ano", anoAtual);
    try {
      const res = await fetch(`${getApiBase()}/master/contabil/livro-caixa/export.csv?${q.toString()}`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error("Não foi possível exportar o Livro Caixa.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `livro-caixa-${escopo === "competencia" ? (lcCompetencia || competencia) : anoAtual}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLcMsg(err instanceof Error ? err.message : "Falha ao exportar.");
    }
  }, [lcCompetencia, competencia, anoAtual]);

  const saldoAtualCents = lancamentos && lancamentos.length ? lancamentos[lancamentos.length - 1].saldoAcumuladoCents : 0;
  const retiradaAcimaDoLimite = distribuidoNoMesCents > 50_000_00;

  const carregarMes = useCallback(() => {
    return apiFetch<FiscalRevenueMonth>(`/master/contabil/mes/${competencia}`)
      .then((res) => { setMes(res); setMesError(null); })
      .catch((err: unknown) => setMesError(err instanceof Error ? err.message : "Falha ao carregar o mês."));
  }, [competencia]);

  const carregarObrigacoes = useCallback(() => {
    return apiFetch<FiscalObligation[]>(`/master/contabil/obrigacoes`)
      .then((res) => { setObrigacoes(Array.isArray(res) ? res : []); setObrigError(null); })
      .catch((err: unknown) => {
        setObrigacoes([]);
        setObrigError(err instanceof Error ? err.message : "Falha ao carregar as obrigações.");
      });
  }, []);

  const carregarPerfil = useCallback(() => {
    return apiFetch<FiscalProfile>(`/master/contabil/perfil`)
      .then((res) => { setPerfil(res); setPerfilForm(res); })
      .catch(() => { /* perfil é opcional na primeira carga */ });
  }, []);

  // CONTABIL S6 — status do cofre do certificado (validade/dias). Só metadados.
  const carregarCertStatus = useCallback(() => {
    return apiFetch<CertStatus>(`/master/contabil/nfse/certificado`)
      .then((res) => setCertStatus(res))
      .catch(() => { /* cofre é opcional na primeira carga */ });
  }, []);

  useEffect(() => { carregarMes(); }, [carregarMes]);
  useEffect(() => { carregarObrigacoes(); }, [carregarObrigacoes]);
  useEffect(() => { carregarPerfil(); }, [carregarPerfil]);
  useEffect(() => { carregarCertStatus(); }, [carregarCertStatus]);

  // Badge do seletor de janelas (contagem 🔴 atrasadas / 🟡 próximas 7 dias).
  useEffect(() => {
    if (!obrigacoes || !onBadgeChange) return;
    const atrasadas = obrigacoes.filter((o) => o.atrasado).length;
    const proximas = obrigacoes.filter((o) => !o.atrasado && diasAte(o.dueDate) <= 7 && o.estado !== "CONFERIDO").length;
    onBadgeChange({ atrasadas, proximas });
  }, [obrigacoes, onBadgeChange]);

  // Pré-preenche o simulador com os números reais do mês assim que chegam.
  useEffect(() => {
    if (!mes) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pré-preenche o simulador 1x quando os dados do mês chegam, sem sobrescrever edição manual; efeito legítimo
    if (!simReceita) setSimReceita(String(Math.round(mes.receitaCaixaCents / 100)));
    if (!simProlabore) setSimProlabore(String(Math.round(mes.folhaMesCents / 100)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  const rodarSimulador = useCallback(() => {
    const receitaCents = Math.round((Number(simReceita.replace(",", ".")) || 0) * 100);
    const prolaboreCents = Math.round((Number(simProlabore.replace(",", ".")) || 0) * 100);
    setSimBusy(true);
    const q = new URLSearchParams({ receita: String(receitaCents), prolabore: String(prolaboreCents) });
    apiFetch<SimuladorResp>(`/master/contabil/simulador?${q.toString()}`)
      .then((res) => setSim(res))
      .catch(() => setSim(null))
      .finally(() => setSimBusy(false));
  }, [simReceita, simProlabore]);

  useEffect(() => {
    const t = setTimeout(() => { if (simReceita && simProlabore) rodarSimulador(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simReceita, simProlabore]);

  // Cenário "com RBT12 real" — usa o RBT12/folha12m do mês vigente (em vez do
  // atalho simplificado de `sim`, que assume RBT12=receita do mês) para o
  // Fator R decidir o anexo com a mesma régua que o motor usa de verdade.
  // O backend não aceita forçar anexo (nem deve — Lei do Contabil nº2: o
  // motor decide, IA/UI não escolhem tabela); os dois cartões comparam
  // "cenário simplificado" × "cenário com histórico real aplicado".
  const [simComHistorico, setSimComHistorico] = useState<SimuladorResp | null>(null);
  useEffect(() => {
    if (!simReceita || !simProlabore) return;
    const receitaCents = Math.round((Number(simReceita.replace(",", ".")) || 0) * 100);
    const prolaboreCents = Math.round((Number(simProlabore.replace(",", ".")) || 0) * 100);
    const rbt12 = mes?.rbt12Cents ?? receitaCents;
    const folha11mAnteriores = Math.max(0, (mes?.folha12mCents ?? 0) - (mes?.folhaMesCents ?? 0));
    const q3 = new URLSearchParams({
      receita: String(receitaCents), prolabore: String(prolaboreCents),
      rbt12: String(rbt12), folha12m: String(folha11mAnteriores + prolaboreCents),
    });
    apiFetch<SimuladorResp>(`/master/contabil/simulador?${q3.toString()}`).then(setSimComHistorico).catch(() => setSimComHistorico(null));
  }, [simReceita, simProlabore, mes]);

  const custoDoErro = sim && simComHistorico ? Math.max(0, sim.totalTributosCents - simComHistorico.totalTributosCents) : 0;

  const prolaboreRecomendadoCents = useMemo(() => {
    if (!mes) return 0;
    const folhaAlvo = Math.ceil(FATOR_R_LIMIAR * Math.max(0, mes.rbt12Cents));
    const folha11m = Math.max(0, mes.folha12mCents - mes.folhaMesCents);
    return Math.max(0, folhaAlvo - folha11m);
  }, [mes]);

  const usarProlaboreRecomendado = useCallback(() => {
    if (!mes || prolaboreRecomendadoCents <= 0) return;
    setProlaboreBusy(true);
    setAjusteMsg(null);
    apiFetch(`/master/contabil/mes/${competencia}/ajuste`, {
      method: "POST",
      body: JSON.stringify({ ajusteManualCents: mes.ajusteManualCents, motivo: `Pró-labore ajustado via recomendação do Fator R (${brl(prolaboreRecomendadoCents)})` }),
    })
      .then(() => carregarMes())
      .then(() => setAjusteMsg("Registrado. O pró-labore do mês em si é editado no fechamento (S5) — este ajuste ficou anotado na receita."))
      .catch((err: unknown) => setAjusteMsg(err instanceof Error ? err.message : "Falha ao gravar."))
      .finally(() => setProlaboreBusy(false));
  }, [mes, prolaboreRecomendadoCents, competencia, carregarMes]);

  const marcarObrigacao = useCallback((ob: FiscalObligation) => {
    const alvo = proximoEstado(ob.estado);
    if (!alvo) return;
    setMarcarBusy(ob.id);
    apiFetch(`/master/contabil/obrigacoes/${ob.id}/marcar`, {
      method: "POST",
      body: JSON.stringify({ estado: alvo }),
    })
      .then(() => carregarObrigacoes())
      .catch(() => { /* erro fica visível pelo estado não mudar */ })
      .finally(() => setMarcarBusy(null));
  }, [carregarObrigacoes]);

  const salvarPerfil = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPerfilBusy(true);
    setPerfilMsg(null);
    const body: Record<string, unknown> = {
      cnpj: perfilForm.cnpj || undefined,
      razaoSocial: perfilForm.razaoSocial || undefined,
      dataAbertura: perfilForm.dataAbertura || undefined,
      regime: perfilForm.regime || undefined,
      anexoBase: perfilForm.anexoBase || undefined,
      cnaePrincipal: perfilForm.cnaePrincipal || undefined,
      prolaboreAlvoPct: perfilForm.prolaboreAlvoPct !== undefined ? Number(perfilForm.prolaboreAlvoPct) : undefined,
    };
    apiFetch<FiscalProfile>(`/master/contabil/perfil`, { method: "PATCH", body: JSON.stringify(body) })
      .then((res) => { setPerfil(res); setPerfilForm(res); setPerfilMsg("Perfil salvo."); })
      .catch((err: unknown) => setPerfilMsg(err instanceof Error ? err.message : "Falha ao salvar o perfil."))
      .finally(() => setPerfilBusy(false));
  }, [perfilForm]);

  // CONTABIL S6 — sobe o .pfx + senha pro cofre (multipart). A senha some do
  // estado após o envio (não fica pendurada na memória do form) e NUNCA volta.
  const enviarCertificado = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!certFile) { setCertMsg("Selecione o arquivo .pfx do certificado."); return; }
    if (!certSenha) { setCertMsg("Informe a senha do certificado."); return; }
    setCertBusy(true);
    setCertMsg(null);
    const fd = new FormData();
    fd.append("file", certFile);
    fd.append("senha", certSenha);
    apiFetch<{ configurado: boolean; certA1ExpiresAt: string }>(`/master/contabil/nfse/certificado`, { method: "POST", body: fd })
      .then(() => { setCertMsg("Certificado guardado no cofre."); setCertSenha(""); setCertFile(null); return carregarCertStatus(); })
      .then(() => { carregarObrigacoes(); })
      .catch((err: unknown) => setCertMsg(err instanceof Error ? err.message : "Falha ao guardar o certificado."))
      .finally(() => setCertBusy(false));
  }, [certFile, certSenha, carregarCertStatus, carregarObrigacoes]);

  const removerCertificado = useCallback(() => {
    setCertBusy(true);
    setCertMsg(null);
    apiFetch(`/master/contabil/nfse/certificado`, { method: "DELETE" })
      .then(() => { setCertMsg("Certificado removido do cofre."); return carregarCertStatus(); })
      .catch((err: unknown) => setCertMsg(err instanceof Error ? err.message : "Falha ao remover o certificado."))
      .finally(() => setCertBusy(false));
  }, [carregarCertStatus]);

  // CONTABIL S7 — guarda a credencial Serpro no cofre. O secret some do estado
  // após o envio; o perfil recarrega p/ atualizar o flag serproConfigured.
  const salvarSerproCred = useCallback(() => {
    if (!serproKey.trim() || !serproSecret.trim()) { setSerproMsg("Informe a consumer key e o secret."); return; }
    if (serproCnpj.replace(/\D/g, "").length !== 14) { setSerproMsg("Informe o CNPJ (14 dígitos)."); return; }
    setSerproBusy(true);
    setSerproMsg(null);
    apiFetch(`/master/contabil/serpro/credencial`, {
      method: "POST",
      body: JSON.stringify({ consumerKey: serproKey.trim(), consumerSecret: serproSecret.trim(), contratanteCnpj: serproCnpj.trim() }),
    })
      .then(() => { setSerproMsg("Credencial Serpro guardada no cofre."); setSerproKey(""); setSerproSecret(""); return carregarPerfil(); })
      .catch((err: unknown) => setSerproMsg(err instanceof Error ? err.message : "Falha ao guardar a credencial."))
      .finally(() => setSerproBusy(false));
  }, [serproKey, serproSecret, serproCnpj, carregarPerfil]);

  const removerSerproCred = useCallback(() => {
    setSerproBusy(true);
    setSerproMsg(null);
    apiFetch(`/master/contabil/serpro/credencial`, { method: "DELETE" })
      .then(() => { setSerproMsg("Credencial Serpro removida do cofre."); return carregarPerfil(); })
      .catch((err: unknown) => setSerproMsg(err instanceof Error ? err.message : "Falha ao remover a credencial."))
      .finally(() => setSerproBusy(false));
  }, [carregarPerfil]);

  // Estado geral do herói: pior sinal entre obrigações + fatorR abaixo do alvo.
  const estadoGeral = useMemo<{ nivel: "ok" | "warn" | "bad"; texto: string }>(() => {
    const obrs = obrigacoes || [];
    if (obrs.some((o) => o.atrasado)) return { nivel: "bad", texto: "obrigação atrasada" };
    if (obrs.some((o) => !o.atrasado && diasAte(o.dueDate) <= 5 && o.estado !== "CONFERIDO" && o.estado !== "PAGO")) {
      return { nivel: "warn", texto: "obrigação próxima do vencimento" };
    }
    return { nivel: "ok", texto: "tudo em dia" };
  }, [obrigacoes]);

  const tributosTotalCents = mes ? mes.dasPrevistoCents + mes.inssPrevistoCents + mes.irrfPrevistoCents : 0;
  const receitaMesCents = mes ? mes.receitaCaixaCents + mes.receitaNotasCents + mes.ajusteManualCents : 0;

  const proximasObrigs = (obrigacoes || [])
    .filter((o) => !o.naoAplicavel && o.estado !== "CONFERIDO")
    .slice(0, 8);

  const [heroExpandido, setHeroExpandido] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Ao concluir/fechar o wizard, recarrega mês + obrigações + Livro Caixa
  // (o fechamento marca obrigações CONFERIDO e pode ter lançado saídas).
  const aoFecharWizard = useCallback(() => {
    Promise.all([carregarMes(), carregarObrigacoes(), carregarLancamentos(), carregarResumoAno(), carregarLucroIsento()]).catch(() => {});
  }, [carregarMes, carregarObrigacoes, carregarLancamentos, carregarResumoAno, carregarLucroIsento]);

  return (
    <React.Fragment>
      {/* a) Herói do mês */}
      <div className="ctb-hero">
        <div className="ctb-hero-card">
          <span className="ctb-hero-label">Tributos previstos de {competencia}</span>
          <strong className="ctb-hero-value ctb-money">{mes ? brl(tributosTotalCents) : "—"}</strong>
          <div className="ctb-status-row">
            <span className={"ctb-status-dot" + (estadoGeral.nivel === "ok" ? "" : ` ${estadoGeral.nivel}`)} />
            <span>{estadoGeral.texto}</span>
            <button className="btn-ghost" style={{ marginLeft: "auto", minHeight: 26, fontSize: "0.62rem" }} onClick={() => setHeroExpandido((v) => !v)}>
              {heroExpandido ? "recolher" : "ver breakdown"}
            </button>
          </div>
          {heroExpandido && mes && (
            <div className="ctb-hero-breakdown">
              <div className="ctb-hero-breakdown-row"><span>DAS (Simples Nacional)</span><span>{brl(mes.dasPrevistoCents)}</span></div>
              <div className="ctb-hero-breakdown-row"><span>INSS (pró-labore)</span><span>{brl(mes.inssPrevistoCents)}</span></div>
              <div className="ctb-hero-breakdown-row"><span>IRRF (pró-labore)</span><span>{brl(mes.irrfPrevistoCents)}</span></div>
            </div>
          )}
          {mesError && <span style={{ fontSize: "0.7rem", color: "var(--hbx-danger)" }}>{mesError}</span>}
        </div>

        <div className="ctb-hero-card">
          <span className="ctb-hero-label">Receita do mês</span>
          <strong className="ctb-hero-value">{mes ? brl(receitaMesCents) : "—"}</strong>
          <span className="ctb-source-badge">fonte: Mercado Pago{mes?.updatedAt ? ` · atualizado ${fmtDataHora(mes.updatedAt)}` : ""}</span>
          {mes && mes.ajusteManualCents !== 0 && (
            <span className="ctb-hero-sub">inclui ajuste manual de {brl(mes.ajusteManualCents)}{mes.ajusteMotivo ? ` — ${mes.ajusteMotivo}` : ""}</span>
          )}
          <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem", width: "fit-content", marginTop: 4 }} onClick={() => setPerfilOpen(true)}>
            Perfil fiscal
          </button>
        </div>
      </div>

      {/* a.2) Botão herói — Fechar o mês (CONTABIL S5) */}
      <div className="ctb-fechar-hero">
        <div className="ctb-fechar-hero-text">
          <strong>Fechar o mês de {competencia}</strong>
          <span>
            {mes?.fechadoEm
              ? `mês já fechado em ${fmtDataHora(mes.fechadoEm)} — reabrir refaz o roteiro`
              : "o copiloto prepara tudo na ordem certa: receita → pró-labore → eSocial → PGDAS-D → pagamentos → relatório"}
          </span>
        </div>
        <button className="btn-teal ctb-fechar-hero-btn" onClick={() => setWizardOpen(true)}>
          {mes?.fechadoEm ? "Revisar fechamento" : "Fechar o mês"}
        </button>
      </div>

      {/* b) Fator R ao vivo */}
      <section className="panel">
        <div className="panel-head">
          <h2>Fator R ao vivo</h2>
          <div className="meta">folha 12m / RBT12 · define o Anexo aplicado</div>
        </div>
        <div className="ctb-fator-card">
          <div className="ctb-fator-head">
            <span className="ctb-fator-pct">{mes ? pct(mes.fatorR, 2) : "—"}</span>
            <span className="ctb-fator-anexo">Anexo aplicado: {mes?.anexoAplicado ?? "—"} · alíquota efetiva {mes ? pct(mes.aliquotaEfetiva, 2) : "—"}</span>
          </div>
          <div className="ctb-gauge">
            <div
              className={"ctb-gauge-fill" + ((mes?.fatorR ?? 0) >= FATOR_R_LIMIAR ? " ok" : "")}
              style={{ width: `${Math.min(100, Math.round(((mes?.fatorR ?? 0) / 0.5) * 100))}%` }}
            />
            <div className="ctb-gauge-limiar" style={{ left: `${(FATOR_R_LIMIAR / 0.5) * 100}%` }} title="28% — limiar do Anexo III" />
          </div>
          <div className="ctb-gauge-scale"><span>0%</span><span>28%</span><span>50%</span></div>

          <div className="ctb-fator-reco">
            <span className="ctb-fator-reco-text">
              Pró-labore recomendado deste mês: <strong>{brl(prolaboreRecomendadoCents)}</strong>
            </span>
            <button className="btn-teal" style={{ minHeight: 30, fontSize: "0.7rem" }} disabled={prolaboreBusy || prolaboreRecomendadoCents <= 0} onClick={usarProlaboreRecomendado}>
              {prolaboreBusy ? "gravando…" : "usar este valor"}
            </button>
          </div>
          {ajusteMsg && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{ajusteMsg}</span>}

          {mes && mes.fatorR < FATOR_R_LIMIAR && custoDoErro > 0 && (
            <div className="ctb-banner-warn">
              <span>⚠</span>
              <span>
                <strong>Fator R abaixo de 28%</strong> — no cenário simulado, o total de tributos fica <strong>{brl(custoDoErro)}</strong> maior
                do que ajustando o pró-labore pelo histórico real (coluna &quot;com histórico real&quot; ao lado). Ajuste o pró-labore acima do
                recomendado para recuperar a faixa.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* c) Simulador "pensa comigo" */}
      <section className="panel">
        <div className="panel-head">
          <h2>Simulador — pensa comigo</h2>
          <div className="meta">cenário simplificado × com o histórico real de RBT12/folha</div>
        </div>
        <div className="ctb-sim-grid" style={{ padding: 16 }}>
          <div className="ctb-sim-inputs">
            <div className="ctb-field">
              <label>Receita prevista do mês (R$)</label>
              <input inputMode="decimal" value={simReceita} onChange={(e) => setSimReceita(e.target.value)} placeholder="0,00" />
            </div>
            <div className="ctb-field">
              <label>Pró-labore (R$)</label>
              <input inputMode="decimal" value={simProlabore} onChange={(e) => setSimProlabore(e.target.value)} placeholder="0,00" />
            </div>
            <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
              {simBusy ? "recalculando…" : "recalcula automaticamente ao digitar"}
            </span>
          </div>

          <div className="ctb-sim-compare">
            <div className={"ctb-sim-col" + (sim && simComHistorico && sim.totalTributosCents < simComHistorico.totalTributosCents ? " ctb-sim-winner" : "")}>
              <div className="ctb-sim-col-head"><span className="ctb-sim-col-title">Simplificado (Anexo {sim?.anexoAplicado ?? "—"})</span></div>
              <div className="ctb-sim-row"><span>DAS</span><span>{sim ? brl(sim.dasCents) : "—"}</span></div>
              <div className="ctb-sim-row"><span>INSS</span><span>{sim ? brl(sim.inssCents) : "—"}</span></div>
              <div className="ctb-sim-row"><span>IRRF</span><span>{sim ? brl(sim.irrfCents) : "—"}</span></div>
              <div className="ctb-sim-total"><span>Total</span><span>{sim ? brl(sim.totalTributosCents) : "—"}</span></div>
            </div>
            <div className={"ctb-sim-col" + (simComHistorico && sim && simComHistorico.totalTributosCents <= sim.totalTributosCents ? " ctb-sim-winner" : "")}>
              <div className="ctb-sim-col-head"><span className="ctb-sim-col-title">Com histórico real (Anexo {simComHistorico?.anexoAplicado ?? "—"})</span></div>
              <div className="ctb-sim-row"><span>DAS</span><span>{simComHistorico ? brl(simComHistorico.dasCents) : "—"}</span></div>
              <div className="ctb-sim-row"><span>INSS</span><span>{simComHistorico ? brl(simComHistorico.inssCents) : "—"}</span></div>
              <div className="ctb-sim-row"><span>IRRF</span><span>{simComHistorico ? brl(simComHistorico.irrfCents) : "—"}</span></div>
              <div className="ctb-sim-total"><span>Total</span><span>{simComHistorico ? brl(simComHistorico.totalTributosCents) : "—"}</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* d) Linha do tempo de obrigações */}
      <section className="panel">
        <div className="panel-head">
          <h2>Obrigações</h2>
          <div className="meta">
            {obrigacoes ? `${proximasObrigs.length} ativa(s)` : ""}
            <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} onClick={carregarObrigacoes}>Atualizar</button>
          </div>
        </div>
        {obrigError && <div style={{ padding: "8px 16px 0", fontSize: "0.72rem", color: "var(--hbx-danger)" }}>{obrigError}</div>}
        <div className="ctb-timeline">
          {obrigacoes === null && !obrigError && <div className="ctb-empty">Carregando obrigações…</div>}
          {obrigacoes !== null && proximasObrigs.length === 0 && (
            <div className="ctb-empty">Nenhuma obrigação pendente — tudo conferido.</div>
          )}
          {proximasObrigs.map((ob) => {
            const alvo = proximoEstado(ob.estado);
            const link = TIPO_LINK[ob.tipo];
            return (
              <div key={ob.id} className="ctb-oblig-card">
                <div className="ctb-oblig-icon" aria-hidden>{ob.tipo === "LIVRO_CAIXA" ? "📒" : "🧾"}</div>
                <div className="ctb-oblig-body">
                  <span className="ctb-oblig-title">{TIPO_LABEL[ob.tipo] || ob.tipo} · {ob.competencia}</span>
                  <span className={"ctb-oblig-meta" + (ob.atrasado ? " late" : "")}>
                    vence {fmtData(ob.dueDate)} · {countdownLabel(ob.dueDate, ob.atrasado)}
                  </span>
                </div>
                <div className="ctb-oblig-actions">
                  <span className={estadoChipClass(ob.estado, ob.atrasado)}>{ESTADO_LABEL[ob.estado] || ob.estado}</span>
                  {alvo && (
                    <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.62rem" }} disabled={marcarBusy === ob.id} onClick={() => marcarObrigacao(ob)}>
                      {marcarBusy === ob.id ? "…" : `marcar ${ESTADO_LABEL[alvo].toLowerCase()}`}
                    </button>
                  )}
                  {link && (
                    <a className="btn-ghost" style={{ minHeight: 28, fontSize: "0.62rem", textDecoration: "none" }} href={link} target="_blank" rel="noreferrer">
                      abrir no governo
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* d.2) Painel de lucro isento (CONTABIL S4) */}
      <section className="panel">
        <div className="panel-head">
          <h2>Lucro isento — {anoAtual}</h2>
          <div className="meta">32% da receita bruta − DAS pago − já distribuído</div>
        </div>
        <div className="ctb-fator-card">
          <div className="ctb-fator-head">
            <span className="ctb-fator-pct">{lucroIsento ? brl(lucroIsento.disponivelCents) : "—"}</span>
            <span className="ctb-fator-anexo">disponível para retirada isenta em {anoAtual}</span>
          </div>
          <div className="ctb-gauge">
            <div
              className="ctb-gauge-fill ok"
              style={{
                width: lucroIsento && (lucroIsento.jaDistribuidoCents + lucroIsento.disponivelCents) > 0
                  ? `${Math.min(100, Math.round((lucroIsento.jaDistribuidoCents / (lucroIsento.jaDistribuidoCents + lucroIsento.disponivelCents)) * 100))}%`
                  : "0%",
              }}
            />
          </div>
          <div className="ctb-gauge-scale">
            <span>distribuído: {lucroIsento ? brl(lucroIsento.jaDistribuidoCents) : "—"}</span>
            <span>disponível: {lucroIsento ? brl(lucroIsento.disponivelCents) : "—"}</span>
          </div>

          <div className="ctb-fator-reco">
            <span className="ctb-fator-reco-text">
              Receita acumulada {anoAtual}: <strong>{lucroIsento ? brl(lucroIsento.receitaAcumuladaCents) : "—"}</strong>
              {" · "}DAS pago: <strong>{lucroIsento ? brl(lucroIsento.dasPagoAcumuladoCents) : "—"}</strong>
            </span>
            <button className="btn-teal" style={{ minHeight: 30, fontSize: "0.7rem" }} onClick={() => setRetiradaOpen(true)}>
              Registrar retirada de lucro
            </button>
          </div>

          {retiradaAcimaDoLimite && (
            <div className="ctb-banner-warn">
              <span>⚠</span>
              <span>
                <strong>Retirada do mês acima de R$ 50.000</strong> — a partir da Lei 15.270/2025, distribuição de lucro
                acima desse valor mensal para o mesmo CPF pode sofrer retenção na fonte. Confira antes de repetir.
              </span>
            </div>
          )}

          <div className="ctb-banner-warn">
            <span>ℹ</span>
            <span>
              Esta presunção (32%) vale para quem apura pelo Simples sem Lucro Real/Presumido paralelo. Retirada acima
              do limite de presunção anual exige balanço assinado por contador (CRC) para continuar isenta.
            </span>
          </div>
        </div>
      </section>

      {/* d.3) Livro Caixa (CONTABIL S4) */}
      <section className="panel">
        <div className="panel-head">
          <h2>Livro Caixa</h2>
          <div className="meta">
            {resumoAno ? `${resumoAno.lancamentos} lançamento(s) em ${anoAtual} · saldo ${brl(resumoAno.saldoCents)}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "12px 16px 0" }}>
          <div className="ctb-field" style={{ minWidth: 140 }}>
            <label>Competência</label>
            <input value={lcCompetencia} onChange={(e) => setLcCompetencia(e.target.value)} placeholder="2026-07" />
          </div>
          <div className="ctb-field" style={{ minWidth: 160 }}>
            <label>Categoria</label>
            <select value={lcCategoria} onChange={(e) => setLcCategoria(e.target.value)}>
              <option value="">todas</option>
              {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button className="btn-ghost" style={{ minHeight: 34, fontSize: "0.7rem" }} onClick={() => setLcCompetencia("")}>
            ver ano inteiro
          </button>
          <button className="btn-ghost" style={{ minHeight: 34, fontSize: "0.7rem", marginLeft: "auto" }} onClick={() => setLcFormOpen(true)}>
            + lançamento manual
          </button>
          <button className="btn-ghost" style={{ minHeight: 34, fontSize: "0.7rem" }} onClick={() => exportarLivroCaixaCsv("competencia")}>
            exportar competência (CSV)
          </button>
          <button className="btn-ghost" style={{ minHeight: 34, fontSize: "0.7rem" }} onClick={() => exportarLivroCaixaCsv("ano")}>
            exportar {anoAtual} (CSV)
          </button>
        </div>

        {lcMsg && <div style={{ padding: "8px 16px 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>{lcMsg}</div>}
        {lcError && <div style={{ padding: "8px 16px 0", fontSize: "0.72rem", color: "var(--hbx-danger)" }}>{lcError}</div>}

        <div className="tbl-wrap" style={{ padding: 16 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Data</th>
                <th>Histórico</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Saldo</th>
                <th>Origem</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lancamentos === null && !lcError && (
                <tr><td colSpan={7} className="ckm-muted-cell">Carregando…</td></tr>
              )}
              {lancamentos !== null && lancamentos.length === 0 && (
                <tr><td colSpan={7} className="ckm-muted-cell">Nenhum lançamento nesta competência.</td></tr>
              )}
              {(lancamentos || []).map((l) => (
                <tr key={l.id}>
                  <td>{fmtData(l.data)}</td>
                  <td>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span>{l.descricao}</span>
                      <span className="sub2">{CATEGORIA_LABEL[l.categoria] || l.categoria}</span>
                    </div>
                  </td>
                  <td>{l.tipo === "ENTRADA" ? brl(l.valorCents) : "—"}</td>
                  <td>{l.tipo === "SAIDA" ? brl(l.valorCents) : "—"}</td>
                  <td style={{ fontWeight: 700 }}>{brl(l.saldoAcumuladoCents)}</td>
                  <td><span className="ctb-chip">{l.origem}</span></td>
                  <td>
                    {!l.estornaId && l.categoria !== "ESTORNO" && (
                      <button className="btn-ghost" style={{ minHeight: 26, fontSize: "0.6rem" }} onClick={() => estornarLancamento(l)}>
                        estornar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px 16px", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            Saldo acumulado na visão atual: <strong>{brl(saldoAtualCents)}</strong>
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.7rem" }} disabled={fecharAnoBusy} onClick={fecharLivroCaixaAno}>
              {fecharAnoBusy ? "fechando…" : `fechar Livro Caixa ${anoAtual}`}
            </button>
            {fecharAnoMsg && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{fecharAnoMsg}</span>}
          </div>
        </div>
      </section>

      {/* e) Rodapé de contexto */}
      <section className="panel">
        <div className="panel-head">
          <h2>Contexto do Simples</h2>
          <div className="meta">RBT12 acumulado · faixa atual</div>
        </div>
        <div className="ctb-footer" style={{ padding: 16 }}>
          <div className="ctb-footer-kpi"><span>RBT12 acumulado</span><strong>{mes ? brl(mes.rbt12Cents) : "—"}</strong></div>
          <div className="ctb-footer-kpi"><span>Folha 12m</span><strong>{mes ? brl(mes.folha12mCents) : "—"}</strong></div>
          <div className="ctb-footer-kpi"><span>Anexo aplicado</span><strong>{mes?.anexoAplicado ?? "—"}</strong></div>
          <div className="ctb-footer-kpi"><span>Alíquota efetiva</span><strong>{mes ? pct(mes.aliquotaEfetiva, 2) : "—"}</strong></div>
        </div>
      </section>

      {/* Drawer de perfil fiscal */}
      {perfilOpen && (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) setPerfilOpen(false); }}>
          <form className="hbx-modal" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto" }} onSubmit={salvarPerfil}>
            <h3 style={{ padding: "16px 20px 0" }}>
              Perfil fiscal
              <button type="button" className="btn-ghost" style={{ minHeight: 28, fontSize: "0.7rem" }} onClick={() => setPerfilOpen(false)}>fechar</button>
            </h3>
            <div className="ctb-perfil-form">
              <div className="ctb-perfil-grid">
                <div className="ctb-field">
                  <label>CNPJ</label>
                  <input value={perfilForm.cnpj || ""} onChange={(e) => setPerfilForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
                </div>
                <div className="ctb-field">
                  <label>Razão social</label>
                  <input value={perfilForm.razaoSocial || ""} onChange={(e) => setPerfilForm((f) => ({ ...f, razaoSocial: e.target.value }))} />
                </div>
                <div className="ctb-field">
                  <label>Data de abertura</label>
                  <input type="date" value={perfilForm.dataAbertura ? String(perfilForm.dataAbertura).slice(0, 10) : ""} onChange={(e) => setPerfilForm((f) => ({ ...f, dataAbertura: e.target.value }))} />
                </div>
                <div className="ctb-field">
                  <label>CNAE principal</label>
                  <input value={perfilForm.cnaePrincipal || ""} onChange={(e) => setPerfilForm((f) => ({ ...f, cnaePrincipal: e.target.value }))} />
                </div>
                <div className="ctb-field">
                  <label>Regime</label>
                  <input value={perfilForm.regime || ""} onChange={(e) => setPerfilForm((f) => ({ ...f, regime: e.target.value }))} placeholder="simples_nacional" />
                </div>
                <div className="ctb-field">
                  <label>Anexo base</label>
                  <input value={perfilForm.anexoBase || ""} onChange={(e) => setPerfilForm((f) => ({ ...f, anexoBase: e.target.value }))} placeholder="III ou V" />
                </div>
                <div className="ctb-field">
                  <label>Alvo do Fator R (%)</label>
                  <input
                    inputMode="decimal"
                    value={perfilForm.prolaboreAlvoPct !== undefined && perfilForm.prolaboreAlvoPct !== null ? String(Math.round(Number(perfilForm.prolaboreAlvoPct) * 100)) : "28"}
                    onChange={(e) => setPerfilForm((f) => ({ ...f, prolaboreAlvoPct: (Number(e.target.value) || 0) / 100 }))}
                  />
                </div>
              </div>

              <div className="ctb-perfil-section">
                <div className="ctb-perfil-section-head">
                  <span className="ctb-perfil-section-title">Certificado A1 (NFS-e)</span>
                  {certStatus?.configurado
                    ? <span className={certStatus.expirado ? "tag ctb-tag-danger" : certStatus.renovarEmBreve ? "tag ctb-tag-warn" : "tag ctb-tag-ok"}>
                        {certStatus.expirado ? "expirado" : certStatus.renovarEmBreve ? "renovar em breve" : "configurado"}
                      </span>
                    : <span className="tag">não configurado</span>}
                </div>
                <div className="ctb-cofre">
                  {certStatus?.configurado ? (
                    <div className="ctb-cofre-status">
                      <span className="ctb-cofre-line">
                        Certificado no cofre{certStatus.certA1ExpiresAt ? ` — válido até ${new Date(certStatus.certA1ExpiresAt).toLocaleDateString("pt-BR")}` : ""}
                        {certStatus.diasParaExpirar != null ? ` (${certStatus.diasParaExpirar >= 0 ? `${certStatus.diasParaExpirar}d` : "vencido"})` : ""}.
                      </span>
                      <button type="button" className="btn-ghost ctb-cofre-remove" onClick={removerCertificado} disabled={certBusy}>remover</button>
                    </div>
                  ) : (
                    <span className="ctb-cofre-hint">
                      Suba o e-CNPJ A1 (.pfx) + senha. O segredo é criptografado no cofre e nunca sai daqui. A emissão automática de NFS-e só liga quando o dono ativar (produção-restrita primeiro).
                    </span>
                  )}
                  <div className="ctb-cofre-upload">
                    <input
                      type="file"
                      accept=".pfx,.p12"
                      onChange={(ev) => { setCertFile(ev.target.files?.[0] ?? null); setCertMsg(null); }}
                    />
                    <input
                      type="password"
                      placeholder="senha do certificado"
                      value={certSenha}
                      onChange={(ev) => setCertSenha(ev.target.value)}
                      autoComplete="off"
                    />
                    <button type="button" className="btn-teal" onClick={enviarCertificado} disabled={certBusy || !certFile}>
                      {certBusy ? "enviando…" : certStatus?.configurado ? "substituir" : "guardar no cofre"}
                    </button>
                  </div>
                  {certMsg && <span className="ctb-cofre-msg">{certMsg}</span>}
                </div>
              </div>

              <div className="ctb-perfil-section">
                <div className="ctb-perfil-section-head">
                  <span className="ctb-perfil-section-title">Serpro Integra Contador</span>
                  <span className={perfil?.serproConfigured ? "tag ctb-tag-ok" : "tag"}>
                    {perfil?.serproConfigured ? "credencial no cofre" : "não configurada"}
                  </span>
                </div>
                <div className="ctb-cofre">
                  <span className="ctb-cofre-hint">
                    Credencial (consumer key/secret) do Integra Contador — guardada criptografada no cofre. O autopost de PGDAS-D/DAS só age com a flag do S7 ligada; a transmissão sempre exige seu clique-com-confirmação.
                  </span>
                  {perfil?.serproConfigured ? (
                    <div className="ctb-cofre-status">
                      <span className="ctb-cofre-line">Credencial configurada no cofre.</span>
                      <button type="button" className="btn-ghost ctb-cofre-remove" onClick={removerSerproCred} disabled={serproBusy}>
                        {serproBusy ? "removendo…" : "remover"}
                      </button>
                    </div>
                  ) : null}
                  <div className="ctb-serpro-cred-form">
                    <div className="ctb-field ctb-serpro-cred-full">
                      <label>CNPJ (contratante/contribuinte)</label>
                      <input value={serproCnpj} onChange={(e) => setSerproCnpj(e.target.value)} placeholder="00.000.000/0000-00" autoComplete="off" />
                    </div>
                    <div className="ctb-field">
                      <label>Consumer key</label>
                      <input value={serproKey} onChange={(e) => setSerproKey(e.target.value)} placeholder="consumer key" autoComplete="off" />
                    </div>
                    <div className="ctb-field">
                      <label>Consumer secret</label>
                      <input type="password" value={serproSecret} onChange={(e) => setSerproSecret(e.target.value)} placeholder="consumer secret" autoComplete="off" />
                    </div>
                    <div className="ctb-serpro-cred-full">
                      <button type="button" className="btn-teal" onClick={salvarSerproCred} disabled={serproBusy}>
                        {serproBusy ? "guardando…" : perfil?.serproConfigured ? "substituir credencial" : "guardar no cofre"}
                      </button>
                    </div>
                  </div>
                  {serproMsg && <span className="ctb-cofre-msg">{serproMsg}</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-teal" type="submit" disabled={perfilBusy}>{perfilBusy ? "salvando…" : "Salvar perfil"}</button>
                {perfilMsg && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{perfilMsg}</span>}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: lançamento manual do Livro Caixa (CONTABIL S4) */}
      {lcFormOpen && (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) setLcFormOpen(false); }}>
          <form className="hbx-modal" style={{ width: "min(460px, 100%)" }} onSubmit={criarLancamentoManual}>
            <h3 style={{ padding: "16px 20px 0" }}>
              Lançamento manual
              <button type="button" className="btn-ghost" style={{ minHeight: 28, fontSize: "0.7rem" }} onClick={() => setLcFormOpen(false)}>fechar</button>
            </h3>
            <div className="ctb-perfil-form">
              <div className="ctb-field">
                <label>Data</label>
                <input type="date" value={lcForm.data} onChange={(e) => setLcForm((f) => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="ctb-field">
                <label>Tipo</label>
                <select value={lcForm.tipo} onChange={(e) => setLcForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="ENTRADA">Entrada</option>
                  <option value="SAIDA">Saída</option>
                </select>
              </div>
              <div className="ctb-field">
                <label>Categoria</label>
                <select value={lcForm.categoria} onChange={(e) => setLcForm((f) => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIAS_MANUAIS.map((c) => (
                    <option key={c} value={c}>{CATEGORIA_LABEL[c] || c}</option>
                  ))}
                </select>
              </div>
              <div className="ctb-field">
                <label>Descrição</label>
                <input value={lcForm.descricao} onChange={(e) => setLcForm((f) => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="ctb-field">
                <label>Valor (R$)</label>
                <input inputMode="decimal" value={lcForm.valor} onChange={(e) => setLcForm((f) => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-teal" type="submit" disabled={lcBusy}>{lcBusy ? "gravando…" : "Registrar lançamento"}</button>
                {lcMsg && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{lcMsg}</span>}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal: retirada de lucro isento (CONTABIL S4) */}
      {retiradaOpen && (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) setRetiradaOpen(false); }}>
          <form className="hbx-modal" style={{ width: "min(420px, 100%)" }} onSubmit={registrarRetiradaLucro}>
            <h3 style={{ padding: "16px 20px 0" }}>
              Registrar retirada de lucro
              <button type="button" className="btn-ghost" style={{ minHeight: 28, fontSize: "0.7rem" }} onClick={() => setRetiradaOpen(false)}>fechar</button>
            </h3>
            <div className="ctb-perfil-form">
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                Disponível em {anoAtual}: <strong>{lucroIsento ? brl(lucroIsento.disponivelCents) : "—"}</strong>
              </span>
              <div className="ctb-field">
                <label>Valor da retirada (R$)</label>
                <input inputMode="decimal" value={retiradaValor} onChange={(e) => setRetiradaValor(e.target.value)} placeholder="0,00" />
              </div>
              {retiradaAcimaDoLimite && (
                <div className="ctb-banner-warn">
                  <span>⚠</span>
                  <span>Este mês já tem {brl(distribuidoNoMesCents)} distribuído — some com esta retirada antes de confirmar (limite de atenção: R$ 50.000/mês/CPF).</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-teal" type="submit" disabled={retiradaBusy}>{retiradaBusy ? "gravando…" : "Confirmar retirada"}</button>
                {retiradaMsg && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{retiradaMsg}</span>}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Wizard "Fechar o mês" (CONTABIL S5) */}
      {wizardOpen && (
        <WizardFecharMes
          competencia={competencia}
          onClose={() => setWizardOpen(false)}
          onDone={aoFecharWizard}
        />
      )}
    </React.Fragment>
  );
}
