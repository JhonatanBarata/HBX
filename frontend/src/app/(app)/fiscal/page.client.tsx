"use client";

// FISCAL DO TENANT (PR04082026-FISCAL-TENANT, fatia F1a) — NFS-e avulsa na
// casca central, irmã do /financeiro ("o financeiro pula pro fiscal").
//
// TRÊS BLOCOS numa tela só: configuração fiscal (painel contextual à direita,
// com cofre do certificado e catálogo de serviços), emitir nota de serviço
// (a cena principal) e as notas emitidas.
//
// LEI DO VENDEDOR: a tela trava em admin do tenant — o backend é @Admin na
// classe inteira (fiscal.controller.ts) e aqui o vendedor vê estado neutro,
// sem nota e sem valor.
//
// Visual 100% de classe/token central (5 Leis): .panel/.tbl/.field-*/.btn-* do
// kit + a família .fis-* de hbx-theme/fiscal-tenant.css. ZERO style inline.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HbxPanelShell } from "@/components/hbx/panel-shell";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { formatBrCnae, formatBrCnpj, formatBrDoc, maskBrDocInput } from "@/lib/br-document";
import { isTenantAdmin } from "@/lib/roles";

// --------------------------------------------------------------------- TIPOS
// Espelham o que o backend devolve (fiscal-profile.service / fiscal-nfse.service).

type MunicipioFiscal = {
  ibge: string;
  nome: string;
  uf: string;
  status: string;
  rotaNfse: string;
};

type PerfilFiscal = {
  configurado: boolean;
  cnpj: string | null;
  razaoSocial: string | null;
  inscricaoMunicipal: string | null;
  regimeCrt: number;
  municipioIbge: string | null;
  municipio: MunicipioFiscal | null;
  ambiente: string;
  serieDps: string;
  escopoServico: boolean;
  escopoProduto: boolean;
  emailAutoEnvio: boolean;
  whatsAutoEnvio: boolean;
  estoqueAtivo: boolean;
  estoqueNegativo: string;
  modoEmissaoProduto: string;
  comprovanteEntrega: boolean;
  disjuntorPausado: boolean;
  endereco: {
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    completo: boolean;
  };
  contadorAprovou: boolean;
  contadorAprovouEm: string | null;
  producaoAtivadaEm: string | null;
  cert: {
    configurado: boolean;
    expiresAt: string | null;
    diasParaExpirar: number | null;
    expirado: boolean;
  };
};

type ItemChecklist = {
  grupo: "LT" | "TEC" | "OP";
  chave: string;
  rotulo: string;
  ok: boolean;
  detalhe: string | null;
};

type ChecklistLiberacao = {
  ambiente: string;
  producaoAtivadaEm: string | null;
  percentual: number;
  prontoParaProducao: boolean;
  itens: ItemChecklist[];
};

type SaldoEstoque = { fisico: number; reservado: number; disponivel: number; faturado: number };

type EstoqueProdutoT = {
  id: string;
  nome: string;
  unidade: string | null;
  ncm: string | null;
  logisticaProductId: number | null;
  ativo: boolean;
  saldo: SaldoEstoque;
};

type ProdutoLogisticaT = { id: number; name: string; unidade: string | null };

type MovimentoEstoqueT = {
  id: string;
  produtoId: string;
  tipo: string;
  quantidade: number;
  motivo: string | null;
  refChaveNfe: string | null;
  createdAt: string;
};

type PreviewXmlItem = {
  cProd: string;
  nome: string;
  ncm: string | null;
  unidade: string | null;
  quantidade: number;
  sugestaoProdutoId: string | null;
  sugestaoProdutoNome: string | null;
};

type PreviewXml = {
  chaveAcesso: string;
  emitenteNome: string | null;
  jaLancada: boolean;
  itens: PreviewXmlItem[];
};

type ServicoFiscal = {
  id: string;
  descricao: string;
  codigoTributacaoNacional: string;
  cnae: string;
  aliquotaIss: number | null;
  issRetido: boolean;
  ativo: boolean;
};

type DocumentoFiscal = {
  id: string;
  tipo: string;
  origem: string;
  status: string;
  tomadorDoc: string | null;
  tomadorNome: string | null;
  tomadorEmail: string | null;
  tomadorFone: string | null;
  envioEmailEm: string | null;
  envioEmailErro: string | null;
  envioWhatsEm: string | null;
  envioWhatsErro: string | null;
  descricao: string | null;
  valorCents: number;
  competencia: string | null;
  ambiente: string;
  serie: string | null;
  numero: number | null;
  chaveAcesso: string | null;
  erroMsg: string | null;
  tentativas: number;
  emitidaEm: string | null;
  canceladaEm: string | null;
  motivoCancelamento: string | null;
  createdAt: string | null;
  temXml: boolean;
  aviso?: string;
};

type ConsultaCnpj = {
  encontrada: boolean;
  cnpj: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  municipio?: string | null;
  uf?: string | null;
  email?: string | null;
  telefone?: string | null;
  aviso?: string;
};

type FormPerfil = {
  cnpj: string;
  razaoSocial: string;
  inscricaoMunicipal: string;
  regimeCrt: string;
  municipioIbge: string;
  escopoServico: boolean;
  escopoProduto: boolean;
  emailAutoEnvio: boolean;
  whatsAutoEnvio: boolean;
  estoqueAtivo: boolean;
  estoqueNegativo: string;
  modoEmissaoProduto: string;
  comprovanteEntrega: boolean;
  endCep: string;
  endLogradouro: string;
  endNumero: string;
  endComplemento: string;
  endBairro: string;
};

// ------------------------------------------------------------------ RÓTULOS

const REGIME_CRT: Array<{ valor: string; rotulo: string }> = [
  { valor: "1", rotulo: "1 — Simples Nacional" },
  { valor: "2", rotulo: "2 — Simples Nacional (excesso de sublimite)" },
  { valor: "3", rotulo: "3 — Regime Normal" },
  { valor: "4", rotulo: "4 — MEI" },
];

const STATUS_DOC: Record<string, string> = {
  PENDENTE: "Pendente",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  CANCELADA: "Cancelada",
  ERRO: "Erro",
};

const STATUS_MUNICIPIO: Record<string, string> = {
  HOMOLOGADO: "Liberado",
  EM_VALIDACAO: "Em validação",
  BLOQUEADO: "Bloqueado",
};

const FILTRO_STATUS = ["AUTORIZADA", "PENDENTE", "REJEITADA", "ERRO", "CANCELADA"];

// ------------------------------------------------------------------ AJUDANTES

function brlDeCents(cents: number | null | undefined): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Dígitos → "1.234,56" enquanto a pessoa digita (o campo nunca mostra cru). */
function textoDeCentavos(digitos: string): string {
  const n = Number(digitos || "0");
  return (n / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function fmtCompetencia(valor: string | null | undefined): string {
  const v = String(valor || "");
  if (!/^\d{4}-\d{2}$/.test(v)) return v || "—";
  return `${v.slice(5)}/${v.slice(0, 4)}`;
}

function seloDoStatus(status: string): string {
  if (status === "AUTORIZADA") return "fis-selo fis-selo--ok";
  if (status === "REJEITADA" || status === "ERRO") return "fis-selo fis-selo--erro";
  if (status === "PENDENTE") return "fis-selo fis-selo--espera";
  return "fis-selo";
}

function mensagemDe(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}

function formPerfilDe(p: PerfilFiscal | null): FormPerfil {
  return {
    cnpj: p?.cnpj ? formatBrCnpj(p.cnpj) : "",
    razaoSocial: p?.razaoSocial || "",
    inscricaoMunicipal: p?.inscricaoMunicipal || "",
    regimeCrt: String(p?.regimeCrt || 1),
    municipioIbge: p?.municipioIbge || "",
    escopoServico: Boolean(p?.escopoServico),
    escopoProduto: Boolean(p?.escopoProduto),
    emailAutoEnvio: Boolean(p?.emailAutoEnvio),
    whatsAutoEnvio: Boolean(p?.whatsAutoEnvio),
    estoqueAtivo: Boolean(p?.estoqueAtivo),
    estoqueNegativo: p?.estoqueNegativo || "avisar",
    modoEmissaoProduto: p?.modoEmissaoProduto || "fechamento",
    comprovanteEntrega: Boolean(p?.comprovanteEntrega),
    endCep: p?.endereco?.cep || "",
    endLogradouro: p?.endereco?.logradouro || "",
    endNumero: p?.endereco?.numero || "",
    endComplemento: p?.endereco?.complemento || "",
    endBairro: p?.endereco?.bairro || "",
  };
}

// --------------------------------------------------------- PEÇAS DE TELA

function Interruptor({
  nome,
  dica,
  ligado,
  onChange,
  disabled,
}: {
  nome: string;
  dica?: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="fis-switch">
      <input type="checkbox" checked={ligado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="fis-switch-txt">
        <span className="fis-switch-nome">{nome}</span>
        {dica ? <span className="fis-switch-dica">{dica}</span> : null}
      </span>
    </label>
  );
}

function Fato({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="fis-cfg-fato">
      <span>{rotulo}</span>
      <strong className="hbx-inteiro">{valor}</strong>
    </div>
  );
}

// =========================================================================
// BLOCO 1 — CONFIGURAÇÃO FISCAL (painel contextual)
// =========================================================================

function PainelConfig({
  perfil,
  servicos,
  municipios,
  ultimoErro,
  onPerfilSalvo,
  onServicosMudaram,
}: {
  perfil: PerfilFiscal | null;
  servicos: ServicoFiscal[];
  municipios: MunicipioFiscal[];
  ultimoErro: string | null;
  onPerfilSalvo: (p: PerfilFiscal) => void;
  onServicosMudaram: () => void;
}) {
  const [form, setForm] = useState<FormPerfil>(() => formPerfilDe(perfil));
  const [salvando, setSalvando] = useState(false);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
  const [okPerfil, setOkPerfil] = useState<string | null>(null);

  const [pfx, setPfx] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [certOcupado, setCertOcupado] = useState(false);
  const [erroCert, setErroCert] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [rearmando, setRearmando] = useState(false);

  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({ descricao: "", codigo: "", cnae: "", aliquota: "", issRetido: false });
  const [salvandoServico, setSalvandoServico] = useState(false);
  const [erroServico, setErroServico] = useState<string | null>(null);

  // SEMÁFORO DE LIBERAÇÃO (B4): checklist derivado do estado real do servidor.
  const [checklist, setChecklist] = useState<ChecklistLiberacao | null>(null);
  const [liberacaoOcupada, setLiberacaoOcupada] = useState(false);
  const [erroLiberacao, setErroLiberacao] = useState<string | null>(null);

  const carregarChecklist = useCallback(async () => {
    try {
      setChecklist(await apiFetch<ChecklistLiberacao>("/fiscal/liberacao"));
    } catch {
      setChecklist(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- estado do semáforo acompanha o perfil salvo
    void carregarChecklist();
  }, [carregarChecklist, perfil]);

  const atestarContador = useCallback(async (aprovado: boolean) => {
    setLiberacaoOcupada(true);
    setErroLiberacao(null);
    try {
      setChecklist(await apiFetch<ChecklistLiberacao>("/fiscal/liberacao/contador", {
        method: "POST",
        body: JSON.stringify({ aprovado }),
      }));
    } catch (e) {
      setErroLiberacao(mensagemDe(e, "Falha ao registrar a aprovação do contador."));
    } finally {
      setLiberacaoOcupada(false);
    }
  }, []);

  const mudarAmbiente = useCallback(async (rota: "ativar-producao" | "voltar-restrita") => {
    setLiberacaoOcupada(true);
    setErroLiberacao(null);
    try {
      setChecklist(await apiFetch<ChecklistLiberacao>(`/fiscal/liberacao/${rota}`, { method: "POST" }));
      onPerfilSalvo(await apiFetch<PerfilFiscal>("/fiscal/perfil"));
    } catch (e) {
      setErroLiberacao(mensagemDe(e, "Falha ao mudar o ambiente."));
    } finally {
      setLiberacaoOcupada(false);
    }
  }, [onPerfilSalvo]);

  // A identidade inclui os campos que o BACKEND pode corrigir sozinho (o gate
  // "produto exige estoque" desliga escopoProduto e devolve erro): sem isso a
  // caixinha continuaria marcada na tela e o servidor diria outra coisa.
  const perfilId = perfil
    ? [
        perfil.cnpj,
        perfil.razaoSocial,
        perfil.inscricaoMunicipal,
        perfil.regimeCrt,
        perfil.municipioIbge,
        perfil.escopoServico,
        perfil.escopoProduto,
        perfil.emailAutoEnvio,
        perfil.whatsAutoEnvio,
        perfil.estoqueAtivo,
        perfil.estoqueNegativo,
        perfil.modoEmissaoProduto,
        perfil.comprovanteEntrega,
        perfil.endereco?.cep,
        perfil.endereco?.logradouro,
        perfil.endereco?.numero,
        perfil.endereco?.complemento,
        perfil.endereco?.bairro,
      ].join("|")
    : "";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- semear o formulário quando o perfil chega do backend
    setForm(formPerfilDe(perfil));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilId]);

  const salvarPerfil = useCallback(async () => {
    setSalvando(true);
    setErroPerfil(null);
    setOkPerfil(null);
    try {
      const atualizado = await apiFetch<PerfilFiscal>("/fiscal/perfil", {
        method: "PUT",
        body: JSON.stringify({
          cnpj: form.cnpj.replace(/\D/g, ""),
          razaoSocial: form.razaoSocial.trim(),
          inscricaoMunicipal: form.inscricaoMunicipal.trim(),
          regimeCrt: Number(form.regimeCrt) || 1,
          municipioIbge: form.municipioIbge.replace(/\D/g, ""),
          escopoServico: form.escopoServico,
          escopoProduto: form.escopoProduto,
          emailAutoEnvio: form.emailAutoEnvio,
          whatsAutoEnvio: form.whatsAutoEnvio,
          estoqueAtivo: form.estoqueAtivo,
          estoqueNegativo: form.estoqueNegativo,
          modoEmissaoProduto: form.modoEmissaoProduto,
          comprovanteEntrega: form.comprovanteEntrega,
          endCep: form.endCep.replace(/\D/g, ""),
          endLogradouro: form.endLogradouro.trim(),
          endNumero: form.endNumero.trim(),
          endComplemento: form.endComplemento.trim(),
          endBairro: form.endBairro.trim(),
        }),
      });
      onPerfilSalvo(atualizado);
      setOkPerfil("Perfil salvo.");
    } catch (e) {
      setErroPerfil(mensagemDe(e, "Falha ao salvar o perfil fiscal."));
      // O gate do produto grava a correção ANTES de recusar — relê o perfil pra
      // tela não ficar mostrando um interruptor que o servidor já desligou.
      try {
        onPerfilSalvo(await apiFetch<PerfilFiscal>("/fiscal/perfil"));
      } catch {
        /* já há um erro na tela; não empilha um segundo */
      }
    } finally {
      setSalvando(false);
    }
  }, [form, onPerfilSalvo]);

  const enviarCertificado = useCallback(async () => {
    if (!pfx) {
      setErroCert("Escolha o arquivo .pfx do certificado.");
      return;
    }
    if (!senha) {
      setErroCert("Informe a senha do certificado.");
      return;
    }
    setCertOcupado(true);
    setErroCert(null);
    try {
      const fd = new FormData();
      fd.append("file", pfx);
      fd.append("senha", senha);
      await apiFetch("/fiscal/perfil/certificado", { method: "POST", body: fd });
      const atualizado = await apiFetch<PerfilFiscal>("/fiscal/perfil");
      onPerfilSalvo(atualizado);
      setPfx(null);
      setSenha("");
      if (arquivoRef.current) arquivoRef.current.value = "";
    } catch (e) {
      setErroCert(mensagemDe(e, "Falha ao enviar o certificado."));
    } finally {
      setCertOcupado(false);
    }
  }, [pfx, senha, onPerfilSalvo]);

  const removerCertificado = useCallback(async () => {
    setCertOcupado(true);
    setErroCert(null);
    try {
      await apiFetch("/fiscal/perfil/certificado", { method: "DELETE" });
      const atualizado = await apiFetch<PerfilFiscal>("/fiscal/perfil");
      onPerfilSalvo(atualizado);
    } catch (e) {
      setErroCert(mensagemDe(e, "Falha ao remover o certificado."));
    } finally {
      setCertOcupado(false);
    }
  }, [onPerfilSalvo]);

  const rearmar = useCallback(async () => {
    setRearmando(true);
    try {
      await apiFetch("/fiscal/disjuntor/rearmar", { method: "POST" });
      const atualizado = await apiFetch<PerfilFiscal>("/fiscal/perfil");
      onPerfilSalvo(atualizado);
    } catch (e) {
      setErroPerfil(mensagemDe(e, "Falha ao rearmar."));
    } finally {
      setRearmando(false);
    }
  }, [onPerfilSalvo]);

  const criarServico = useCallback(async () => {
    setSalvandoServico(true);
    setErroServico(null);
    try {
      const aliquotaTxt = novo.aliquota.trim().replace(",", ".");
      const aliquota = aliquotaTxt ? Number(aliquotaTxt) / 100 : null;
      await apiFetch("/fiscal/servicos", {
        method: "POST",
        body: JSON.stringify({
          descricao: novo.descricao.trim(),
          codigoTributacaoNacional: novo.codigo.trim(),
          cnae: novo.cnae.replace(/\D/g, ""),
          aliquotaIss: aliquota,
          issRetido: novo.issRetido,
        }),
      });
      setNovo({ descricao: "", codigo: "", cnae: "", aliquota: "", issRetido: false });
      setNovoAberto(false);
      onServicosMudaram();
    } catch (e) {
      setErroServico(mensagemDe(e, "Falha ao criar o serviço."));
    } finally {
      setSalvandoServico(false);
    }
  }, [novo, onServicosMudaram]);

  const alternarServico = useCallback(
    async (s: ServicoFiscal) => {
      setErroServico(null);
      try {
        await apiFetch(`/fiscal/servicos/${encodeURIComponent(s.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ ativo: !s.ativo }),
        });
        onServicosMudaram();
      } catch (e) {
        setErroServico(mensagemDe(e, "Falha ao atualizar o serviço."));
      }
    },
    [onServicosMudaram],
  );

  const listaMunicipios = useMemo(() => {
    const atual = form.municipioIbge;
    const tem = municipios.some((m) => m.ibge === atual);
    if (!atual || tem) return municipios;
    return [...municipios, { ibge: atual, nome: atual, uf: "", status: "BLOQUEADO", rotaNfse: "" }];
  }, [municipios, form.municipioIbge]);

  const cert = perfil?.cert;

  return (
    <div className="fis-cfg">
      {perfil?.disjuntorPausado ? (
        <section className="fis-cfg-sec">
          <div className="fis-aviso fis-aviso--erro">
            <div className="fis-aviso-topo">
              <strong className="hbx-inteiro">Emissão pausada</strong>
              <button type="button" className="btn-ghost" disabled={rearmando} onClick={rearmar}>
                {rearmando ? "Rearmando…" : "Rearmar"}
              </button>
            </div>
            <span>
              {ultimoErro
                ? `Último erro: ${ultimoErro}`
                : "Três erros seguidos pausaram a emissão. Revise antes de rearmar."}
            </span>
          </div>
        </section>
      ) : null}

      <section className="fis-cfg-sec">
        <h3>Dados fiscais</h3>
        <div className="fis-grade">
          <label className="fis-campo">
            <span className="field-label">CNPJ</span>
            <input
              className="field-dark"
              inputMode="numeric"
              value={form.cnpj}
              maxLength={18}
              onChange={(e) => setForm((f) => ({ ...f, cnpj: maskBrDocInput(e.target.value) }))}
            />
          </label>
          <label className="fis-campo fis-campo--inteiro">
            <span className="field-label">Razão social</span>
            <input
              className="field-dark"
              value={form.razaoSocial}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value }))}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">Inscrição municipal</span>
            <input
              className="field-dark"
              value={form.inscricaoMunicipal}
              maxLength={40}
              onChange={(e) => setForm((f) => ({ ...f, inscricaoMunicipal: e.target.value }))}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">Regime (CRT)</span>
            <select
              className="field-dark"
              value={form.regimeCrt}
              onChange={(e) => setForm((f) => ({ ...f, regimeCrt: e.target.value }))}
            >
              {REGIME_CRT.map((r) => (
                <option key={r.valor} value={r.valor}>{r.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="fis-campo fis-campo--inteiro">
            <span className="field-label">Município</span>
            <select
              className="field-dark"
              value={form.municipioIbge}
              onChange={(e) => setForm((f) => ({ ...f, municipioIbge: e.target.value }))}
            >
              <option value="">Selecione</option>
              {listaMunicipios.map((m) => (
                <option key={m.ibge} value={m.ibge}>
                  {m.uf ? `${m.nome}/${m.uf}` : m.nome} · {STATUS_MUNICIPIO[m.status] || m.status}
                </option>
              ))}
            </select>
          </label>
          <label className="fis-campo">
            <span className="field-label">CEP</span>
            <input
              className="field-dark"
              inputMode="numeric"
              value={form.endCep}
              maxLength={9}
              onChange={(e) => setForm((f) => ({ ...f, endCep: e.target.value.replace(/[^\d-]/g, "") }))}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">Número</span>
            <input
              className="field-dark"
              value={form.endNumero}
              maxLength={20}
              onChange={(e) => setForm((f) => ({ ...f, endNumero: e.target.value }))}
            />
          </label>
          <label className="fis-campo fis-campo--inteiro">
            <span className="field-label">Logradouro</span>
            <input
              className="field-dark"
              value={form.endLogradouro}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, endLogradouro: e.target.value }))}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">Bairro</span>
            <input
              className="field-dark"
              value={form.endBairro}
              maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, endBairro: e.target.value }))}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">Complemento</span>
            <input
              className="field-dark"
              value={form.endComplemento}
              maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, endComplemento: e.target.value }))}
            />
          </label>
        </div>

        <div className="fis-cfg-fatos">
          <Fato rotulo="Ambiente" valor={perfil?.ambiente === "producao" ? "Produção" : "Teste (restrita)"} />
          <Fato rotulo="Série" valor={perfil?.serieDps || "—"} />
          <Fato
            rotulo="Cidade"
            valor={
              perfil?.municipio
                ? `${perfil.municipio.nome}/${perfil.municipio.uf} · ${STATUS_MUNICIPIO[perfil.municipio.status] || perfil.municipio.status}`
                : "Fora da lista liberada"
            }
          />
        </div>

        {/* Mesma seção de propósito: é UM formulário e UM "Salvar" (um PUT
            /fiscal/perfil). Separar em duas caixas daria a impressão de dois
            botões e o campo lá de cima ficaria sem dono. */}
        <h3>Emissão e envio</h3>
        <Interruptor
          nome="Emitir nota de serviço"
          ligado={form.escopoServico}
          onChange={(v) => setForm((f) => ({ ...f, escopoServico: v }))}
        />
        <Interruptor
          nome="Emitir nota de produto"
          dica="Exige o controle de estoque ligado."
          ligado={form.escopoProduto}
          onChange={(v) => setForm((f) => ({ ...f, escopoProduto: v }))}
        />
        <Interruptor
          nome="Enviar por e-mail ao tomador"
          ligado={form.emailAutoEnvio}
          onChange={(v) => setForm((f) => ({ ...f, emailAutoEnvio: v }))}
        />
        <Interruptor
          nome="Enviar por WhatsApp ao tomador"
          ligado={form.whatsAutoEnvio}
          onChange={(v) => setForm((f) => ({ ...f, whatsAutoEnvio: v }))}
        />
        <Interruptor
          nome="Comprovante de entrega no WhatsApp"
          dica="PDF sem valor fiscal quando a entrega é confirmada na rota."
          ligado={form.comprovanteEntrega}
          onChange={(v) => setForm((f) => ({ ...f, comprovanteEntrega: v }))}
        />
        <label className="fis-campo">
          <span className="field-label">Nota de produto emitida</span>
          <select
            className="field-dark"
            value={form.modoEmissaoProduto}
            onChange={(e) => setForm((f) => ({ ...f, modoEmissaoProduto: e.target.value }))}
          >
            <option value="fechamento">No fechamento do mês</option>
            <option value="entrega">A cada entrega</option>
          </select>
        </label>
        <Interruptor
          nome="Controlar estoque"
          ligado={form.estoqueAtivo}
          onChange={(v) => setForm((f) => ({ ...f, estoqueAtivo: v }))}
        />
        <label className="fis-campo">
          <span className="field-label">Estoque negativo</span>
          <select
            className="field-dark"
            value={form.estoqueNegativo}
            onChange={(e) => setForm((f) => ({ ...f, estoqueNegativo: e.target.value }))}
          >
            <option value="avisar">Avisar</option>
            <option value="travar">Travar</option>
          </select>
        </label>

        {erroPerfil ? <div className="fis-aviso fis-aviso--erro"><span>{erroPerfil}</span></div> : null}
        {okPerfil ? <div className="fis-dica">{okPerfil}</div> : null}
        <div className="fis-linha-acoes">
          <button type="button" className="btn-teal" disabled={salvando} onClick={salvarPerfil}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </section>

      <section className="fis-cfg-sec">
        <h3>Certificado A1</h3>
        {cert?.configurado ? (
          <>
            <div className="fis-cfg-fatos">
              <Fato rotulo="Validade" valor={fmtData(cert.expiresAt)} />
              <Fato
                rotulo="Situação"
                valor={
                  cert.expirado
                    ? "Expirado"
                    : cert.diasParaExpirar != null
                      ? `${cert.diasParaExpirar} dias para expirar`
                      : "Válido"
                }
              />
            </div>
            {cert.expirado || (cert.diasParaExpirar != null && cert.diasParaExpirar <= 30) ? (
              <div className="fis-aviso fis-aviso--atencao">
                <span>{cert.expirado ? "Certificado expirado — renove para emitir." : "Certificado perto do fim — renove."}</span>
              </div>
            ) : null}
            <div className="fis-linha-acoes">
              <button type="button" className="btn-ghost danger" disabled={certOcupado} onClick={removerCertificado}>
                <I d={ICONS.trash} size={14} />
                Remover
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="fis-campo">
              <span className="field-label">Arquivo .pfx</span>
              <input
                ref={arquivoRef}
                className="field-dark"
                type="file"
                accept=".pfx,.p12"
                onChange={(e) => setPfx(e.target.files?.[0] || null)}
              />
            </label>
            <label className="fis-campo">
              <span className="field-label">Senha do certificado</span>
              <input
                className="field-dark"
                type="password"
                autoComplete="off"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>
            <div className="fis-linha-acoes">
              <button type="button" className="btn-teal" disabled={certOcupado} onClick={enviarCertificado}>
                <I d={ICONS.upload} size={14} />
                {certOcupado ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </>
        )}
        {erroCert ? <div className="fis-aviso fis-aviso--erro"><span>{erroCert}</span></div> : null}
      </section>

      <section className="fis-cfg-sec">
        <h3>Liberação de produção</h3>
        {checklist ? (
          <>
            <div className="fis-cfg-fatos">
              <Fato rotulo="Ambiente" valor={checklist.ambiente === "producao" ? "PRODUÇÃO" : "Teste (restrita)"} />
              <Fato rotulo="Checklist" valor={`${checklist.percentual}%`} />
            </div>
            <div className="fis-checklist">
              {checklist.itens.map((item) => (
                <div key={item.chave} className={"fis-check-item" + (item.ok ? " is-ok" : "")}>
                  <span className="fis-check-marca">{item.ok ? "✓" : "•"}</span>
                  <span className="fis-check-txt">
                    <span>[{item.grupo}] {item.rotulo}</span>
                    {item.detalhe ? <small>{item.detalhe}</small> : null}
                  </span>
                </div>
              ))}
            </div>
            <Interruptor
              nome="Contador do tenant aprovou o enquadramento"
              dica="Atestado com data — aprovação final é dele."
              ligado={Boolean(checklist.itens.find((i) => i.chave === "contador")?.ok)}
              disabled={liberacaoOcupada}
              onChange={(v) => void atestarContador(v)}
            />
            <div className="fis-linha-acoes">
              {checklist.ambiente === "producao" ? (
                <button type="button" className="btn-ghost danger" disabled={liberacaoOcupada} onClick={() => void mudarAmbiente("voltar-restrita")}>
                  {liberacaoOcupada ? "Mudando…" : "Voltar para teste"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-teal"
                  disabled={liberacaoOcupada || !checklist.prontoParaProducao}
                  onClick={() => void mudarAmbiente("ativar-producao")}
                >
                  {liberacaoOcupada ? "Ativando…" : "Ativar emissão em produção"}
                </button>
              )}
            </div>
            {checklist.producaoAtivadaEm ? (
              <div className="fis-dica">Produção ativada em {fmtData(checklist.producaoAtivadaEm)}.</div>
            ) : null}
          </>
        ) : (
          <div className="fis-dica">Carregando checklist…</div>
        )}
        {erroLiberacao ? <div className="fis-aviso fis-aviso--erro"><span>{erroLiberacao}</span></div> : null}
      </section>

      <section className="fis-cfg-sec">
        <h3>Catálogo de serviços</h3>
        {servicos.length === 0 ? (
          <div className="fis-dica">Nenhum serviço cadastrado.</div>
        ) : (
          <div className="fis-servicos">
            {servicos.map((s) => (
              <div key={s.id} className={"fis-servico" + (s.ativo ? "" : " is-inativo")}>
                <div className="fis-servico-topo">
                  <strong>{s.descricao}</strong>
                </div>
                <div className="fis-servico-meta">
                  <span>{s.codigoTributacaoNacional}</span>
                  <span>{formatBrCnae(s.cnae)}</span>
                  <span>{s.aliquotaIss == null ? "ISS —" : `ISS ${(s.aliquotaIss * 100).toFixed(2)}%`}</span>
                  {s.issRetido ? <span>Retido</span> : null}
                </div>
                <div className="fis-linha-acoes">
                  <button type="button" className="btn-ghost" onClick={() => alternarServico(s)}>
                    {s.ativo ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {novoAberto ? (
          <div className="fis-grade">
            <label className="fis-campo fis-campo--inteiro">
              <span className="field-label">Descrição</span>
              <input
                className="field-dark"
                value={novo.descricao}
                maxLength={300}
                onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))}
              />
            </label>
            <label className="fis-campo">
              <span className="field-label">Código LC 116</span>
              <input
                className="field-dark"
                placeholder="14.01"
                value={novo.codigo}
                maxLength={6}
                onChange={(e) => setNovo((n) => ({ ...n, codigo: e.target.value }))}
              />
            </label>
            <label className="fis-campo">
              <span className="field-label">CNAE</span>
              <input
                className="field-dark"
                inputMode="numeric"
                value={novo.cnae}
                maxLength={9}
                onChange={(e) => setNovo((n) => ({ ...n, cnae: e.target.value }))}
              />
            </label>
            <label className="fis-campo">
              <span className="field-label">Alíquota ISS (%)</span>
              <input
                className="field-dark"
                inputMode="decimal"
                value={novo.aliquota}
                maxLength={6}
                onChange={(e) => setNovo((n) => ({ ...n, aliquota: e.target.value }))}
              />
            </label>
            <div className="fis-campo fis-campo--inteiro">
              <Interruptor
                nome="ISS retido pelo tomador"
                ligado={novo.issRetido}
                onChange={(v) => setNovo((n) => ({ ...n, issRetido: v }))}
              />
            </div>
            <div className="fis-linha-acoes fis-campo--inteiro">
              <button type="button" className="btn-teal" disabled={salvandoServico} onClick={criarServico}>
                {salvandoServico ? "Salvando…" : "Salvar"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setNovoAberto(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="fis-linha-acoes">
            <button type="button" className="btn-ghost" onClick={() => setNovoAberto(true)}>
              <I d={ICONS.plus} size={14} />
              Adicionar serviço
            </button>
          </div>
        )}
        {erroServico ? <div className="fis-aviso fis-aviso--erro"><span>{erroServico}</span></div> : null}
      </section>
    </div>
  );
}

// =========================================================================
// BLOCO 2 — EMITIR NOTA DE SERVIÇO
// =========================================================================

function BlocoEmitir({
  perfil,
  servicos,
  onEmitida,
  onBaixar,
}: {
  perfil: PerfilFiscal | null;
  servicos: ServicoFiscal[];
  onEmitida: () => void;
  onBaixar: (doc: DocumentoFiscal, tipo: "pdf" | "xml") => void;
}) {
  const [doc, setDoc] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [fone, setFone] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [valorDigitos, setValorDigitos] = useState("");
  const [descricao, setDescricao] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<DocumentoFiscal | null>(null);
  const [consulta, setConsulta] = useState<string | null>(null);

  const nomeManualRef = useRef(false);
  const emailManualRef = useRef(false);
  const foneManualRef = useRef(false);
  const ultimaConsultaRef = useRef("");

  const ativos = useMemo(() => servicos.filter((s) => s.ativo), [servicos]);

  useEffect(() => {
    if (!servicoId && ativos.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- primeiro serviço do catálogo vira o padrão do campo
      setServicoId(ativos[0].id);
    }
  }, [ativos, servicoId]);

  const buscarCnpj = useCallback(async (digitos: string) => {
    if (ultimaConsultaRef.current === digitos) return;
    ultimaConsultaRef.current = digitos;
    setConsulta(null);
    try {
      const res = await apiFetch<ConsultaCnpj>(`/fiscal/consulta-cnpj?cnpj=${encodeURIComponent(digitos)}`);
      if (res?.encontrada) {
        const achado = res.razaoSocial || res.nomeFantasia || "";
        if (achado && !nomeManualRef.current) setNome(achado);
        // F1b: contatos da RFB entram como sugestão — nunca por cima do que a pessoa digitou.
        if (res.email && !emailManualRef.current) setEmail(res.email);
        if (res.telefone && !foneManualRef.current) setFone(String(res.telefone).replace(/\D/g, ""));
        setConsulta(res.municipio ? `${res.municipio}${res.uf ? `/${res.uf}` : ""}` : null);
      } else {
        setConsulta(res?.aviso || "CNPJ não encontrado na base — preencha o nome.");
      }
    } catch (e) {
      setConsulta(mensagemDe(e, "Não foi possível consultar o CNPJ."));
    }
  }, []);

  const mudarDoc = useCallback(
    (bruto: string) => {
      const mascarado = maskBrDocInput(bruto);
      setDoc(mascarado);
      const digitos = mascarado.replace(/\D/g, "");
      if (digitos.length === 14) void buscarCnpj(digitos);
      else {
        ultimaConsultaRef.current = "";
        setConsulta(null);
      }
    },
    [buscarCnpj],
  );

  const emitir = useCallback(async () => {
    setEmitindo(true);
    setErro(null);
    setResultado(null);
    try {
      const nota = await apiFetch<DocumentoFiscal>("/fiscal/nfse/emitir", {
        method: "POST",
        body: JSON.stringify({
          tomadorDoc: doc.replace(/\D/g, ""),
          tomadorNome: nome.trim(),
          tomadorEmail: email.trim() || undefined,
          tomadorFone: fone.replace(/\D/g, "") || undefined,
          servicoId,
          valorCents: Number(valorDigitos || "0"),
          descricao: descricao.trim() || undefined,
        }),
      });
      setResultado(nota);
      onEmitida();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao emitir a nota."));
    } finally {
      setEmitindo(false);
    }
  }, [doc, nome, email, fone, servicoId, valorDigitos, descricao, onEmitida]);

  const reemitir = useCallback(async () => {
    if (!resultado) return;
    setEmitindo(true);
    setErro(null);
    try {
      const nota = await apiFetch<DocumentoFiscal>(
        `/fiscal/documentos/${encodeURIComponent(resultado.id)}/reemitir`,
        { method: "POST" },
      );
      setResultado(nota);
      onEmitida();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao reemitir."));
    } finally {
      setEmitindo(false);
    }
  }, [resultado, onEmitida]);

  // F1b — timeout deixa dúvida; a conferência pergunta à Sefin ANTES de reemitir.
  const conferirSefin = useCallback(async () => {
    if (!resultado) return;
    setEmitindo(true);
    setErro(null);
    try {
      const nota = await apiFetch<DocumentoFiscal>(
        `/fiscal/documentos/${encodeURIComponent(resultado.id)}/conferir-sefin`,
        { method: "POST" },
      );
      setResultado(nota);
      onEmitida();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao conferir na Sefin."));
    } finally {
      setEmitindo(false);
    }
  }, [resultado, onEmitida]);

  const pronto =
    doc.replace(/\D/g, "").length >= 11 &&
    nome.trim().length > 0 &&
    Boolean(servicoId) &&
    Number(valorDigitos || "0") > 0;

  const teste = perfil?.ambiente !== "producao";

  return (
    <section className="panel fis-bloco">
      <header className="fis-bloco-head">
        <h2>Emitir nota de serviço</h2>
        {teste ? <span className="fis-selo fis-selo--teste">TESTE — sem valor fiscal</span> : null}
      </header>
      <div className="fis-bloco-corpo">
        <div className="fis-grade fis-grade--largo">
          <label className="fis-campo">
            <span className="field-label">CNPJ ou CPF do tomador</span>
            <input
              className="field-dark"
              inputMode="numeric"
              value={doc}
              maxLength={18}
              onChange={(e) => mudarDoc(e.target.value)}
            />
            {consulta ? <span className="fis-dica">{consulta}</span> : null}
          </label>
          <label className="fis-campo">
            <span className="field-label">Nome do tomador</span>
            <input
              className="field-dark"
              value={nome}
              maxLength={200}
              onChange={(e) => {
                nomeManualRef.current = true;
                setNome(e.target.value);
              }}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">E-mail do tomador</span>
            <input
              className="field-dark"
              type="email"
              value={email}
              maxLength={200}
              onChange={(e) => {
                emailManualRef.current = true;
                setEmail(e.target.value);
              }}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">WhatsApp do tomador</span>
            <input
              className="field-dark"
              inputMode="numeric"
              placeholder="DDD + número"
              value={fone}
              maxLength={13}
              onChange={(e) => {
                foneManualRef.current = true;
                setFone(e.target.value.replace(/\D/g, ""));
              }}
            />
          </label>
          <label className="fis-campo">
            <span className="field-label">Serviço</span>
            <select className="field-dark" value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
              {ativos.length === 0 ? <option value="">Nenhum serviço no catálogo</option> : null}
              {ativos.map((s) => (
                <option key={s.id} value={s.id}>{s.descricao}</option>
              ))}
            </select>
          </label>
          <label className="fis-campo">
            <span className="field-label">Valor (R$)</span>
            <input
              className="field-dark"
              inputMode="numeric"
              value={textoDeCentavos(valorDigitos)}
              onChange={(e) => setValorDigitos(e.target.value.replace(/\D/g, "").slice(0, 11))}
            />
          </label>
          <label className="fis-campo fis-campo--inteiro">
            <span className="field-label">Descrição</span>
            <textarea
              className="field-dark"
              value={descricao}
              maxLength={1000}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </label>
        </div>

        <div className="fis-linha-acoes">
          <button type="button" className="btn-teal" disabled={!pronto || emitindo} onClick={emitir}>
            {emitindo ? "Emitindo…" : "Emitir"}
          </button>
        </div>

        {erro ? (
          <div className="fis-aviso fis-aviso--erro">
            <strong className="hbx-inteiro">Não emitiu</strong>
            <span>{erro}</span>
          </div>
        ) : null}

        {resultado ? (
          resultado.status === "AUTORIZADA" ? (
            <div className="fis-aviso fis-aviso--ok">
              <div className="fis-aviso-topo">
                <strong className="hbx-inteiro">Nota autorizada</strong>
                <button type="button" className="btn-ghost" onClick={() => onBaixar(resultado, "pdf")}>
                  <I d={ICONS.download} size={14} />
                  PDF
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!resultado.temXml}
                  onClick={() => onBaixar(resultado, "xml")}
                >
                  <I d={ICONS.download} size={14} />
                  XML
                </button>
              </div>
              <div className="fis-aviso-fatos">
                <span>Número <b>{resultado.serie || "—"}/{resultado.numero ?? "—"}</b></span>
                <span>Valor <b>{brlDeCents(resultado.valorCents)}</b></span>
                <span>Competência <b>{fmtCompetencia(resultado.competencia)}</b></span>
              </div>
              {resultado.chaveAcesso ? <span className="fis-chave">{resultado.chaveAcesso}</span> : null}
              {resultado.aviso ? <strong className="hbx-inteiro">{resultado.aviso}</strong> : null}
            </div>
          ) : (
            <div className="fis-aviso fis-aviso--erro">
              <div className="fis-aviso-topo">
                <strong className="hbx-inteiro">{STATUS_DOC[resultado.status] || resultado.status}</strong>
                {resultado.status === "ERRO" && /timeout/i.test(resultado.erroMsg || "") ? (
                  <button type="button" className="btn-ghost" disabled={emitindo} onClick={conferirSefin}>
                    {emitindo ? "Conferindo…" : "Conferir na Sefin"}
                  </button>
                ) : null}
                {(resultado.status === "ERRO" || resultado.status === "REJEITADA") && resultado.tentativas < 3 ? (
                  <button type="button" className="btn-ghost" disabled={emitindo} onClick={reemitir}>
                    {emitindo ? "Reemitindo…" : "Reemitir"}
                  </button>
                ) : null}
              </div>
              <span>{resultado.erroMsg || "A nota não foi autorizada."}</span>
              {resultado.aviso ? <strong className="hbx-inteiro">{resultado.aviso}</strong> : null}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}

// =========================================================================
// BLOCO 3 — NOTAS EMITIDAS
// =========================================================================

function BlocoNotas({
  documentos,
  carregando,
  erro,
  filtroStatus,
  filtroCompetencia,
  onFiltroStatus,
  onFiltroCompetencia,
  onBaixar,
  onCancelar,
  onEnviar,
  onConferirSefin,
  onMalote,
  ocupadoId,
  aviso,
  onFecharAviso,
}: {
  documentos: DocumentoFiscal[];
  carregando: boolean;
  erro: string | null;
  filtroStatus: string;
  filtroCompetencia: string;
  onFiltroStatus: (v: string) => void;
  onFiltroCompetencia: (v: string) => void;
  onBaixar: (doc: DocumentoFiscal, tipo: "pdf" | "xml") => void;
  onCancelar: (doc: DocumentoFiscal) => void;
  onEnviar: (doc: DocumentoFiscal) => void;
  onConferirSefin: (doc: DocumentoFiscal) => void;
  onMalote: () => void;
  ocupadoId: string | null;
  aviso: string | null;
  onFecharAviso: () => void;
}) {
  return (
    <section className="panel fis-bloco">
      <header className="fis-bloco-head">
        <h2>Notas emitidas</h2>
        <select className="field-dark" value={filtroStatus} onChange={(e) => onFiltroStatus(e.target.value)}>
          <option value="">Todas</option>
          {FILTRO_STATUS.map((s) => (
            <option key={s} value={s}>{STATUS_DOC[s] || s}</option>
          ))}
        </select>
        <input
          className="field-dark"
          type="month"
          value={filtroCompetencia}
          onChange={(e) => onFiltroCompetencia(e.target.value)}
        />
        <button type="button" className="btn-ghost" onClick={onMalote}>
          <I d={ICONS.download} size={14} />
          Malote do contador
        </button>
      </header>
      {aviso ? (
        <div className="fis-bloco-aviso">
          <div className="fis-aviso fis-aviso--atencao">
            <div className="fis-aviso-topo">
              <span>{aviso}</span>
              <button type="button" className="btn-ghost btn-xs" onClick={onFecharAviso}>Entendi</button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="fis-tabela-scroll">
        {erro ? (
          <div className="fis-vazio"><strong>Não carregou</strong><span>{erro}</span></div>
        ) : carregando ? (
          <div className="fis-vazio"><span>Carregando…</span></div>
        ) : documentos.length === 0 ? (
          <div className="fis-vazio"><strong>Nenhuma nota</strong></div>
        ) : (
          <table className="tbl fis-tabela">
            <thead>
              <tr>
                <th>Status</th>
                <th>Tomador</th>
                <th className="fis-col-valor">Valor</th>
                <th>Número</th>
                <th>Competência</th>
                <th>Data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id}>
                  <td className="fis-col-status">
                    <span className={seloDoStatus(d.status)}>{STATUS_DOC[d.status] || d.status}</span>
                    {d.ambiente !== "producao" ? (
                      <span className="fis-selo fis-selo--teste">TESTE — sem valor fiscal</span>
                    ) : null}
                    {d.erroMsg && d.status !== "AUTORIZADA" ? (
                      <span className="fis-erro-linha">{d.erroMsg}</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="fis-tomador">
                      <strong>{d.tomadorNome || "—"}</strong>
                      <small>{formatBrDoc(d.tomadorDoc)}</small>
                    </span>
                    {d.envioEmailEm ? (
                      <span className="fis-envio-linha fis-envio-linha--ok">E-mail enviado {fmtData(d.envioEmailEm)}</span>
                    ) : d.envioEmailErro ? (
                      <span className="fis-envio-linha fis-envio-linha--erro">E-mail: {d.envioEmailErro}</span>
                    ) : null}
                    {d.envioWhatsEm ? (
                      <span className="fis-envio-linha fis-envio-linha--ok">WhatsApp enviado {fmtData(d.envioWhatsEm)}</span>
                    ) : d.envioWhatsErro ? (
                      <span className="fis-envio-linha fis-envio-linha--erro">WhatsApp: {d.envioWhatsErro}</span>
                    ) : null}
                  </td>
                  <td className="fis-col-valor">{brlDeCents(d.valorCents)}</td>
                  <td>{d.numero != null ? `${d.serie || "—"}/${d.numero}` : "—"}</td>
                  <td>{fmtCompetencia(d.competencia)}</td>
                  <td>{fmtData(d.emitidaEm || d.createdAt)}</td>
                  <td>
                    <span className="fis-acoes-linha">
                      <button type="button" className="btn-ghost btn-xs" onClick={() => onBaixar(d, "pdf")}>PDF</button>
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        disabled={!d.temXml}
                        onClick={() => onBaixar(d, "xml")}
                      >
                        XML
                      </button>
                      {d.status === "AUTORIZADA" ? (
                        <button
                          type="button"
                          className="btn-ghost btn-xs"
                          disabled={ocupadoId === d.id}
                          onClick={() => onEnviar(d)}
                        >
                          {ocupadoId === d.id ? "Enviando…" : "Enviar"}
                        </button>
                      ) : null}
                      {d.status === "ERRO" && /timeout/i.test(d.erroMsg || "") ? (
                        <button
                          type="button"
                          className="btn-ghost btn-xs"
                          disabled={ocupadoId === d.id}
                          onClick={() => onConferirSefin(d)}
                        >
                          {ocupadoId === d.id ? "Conferindo…" : "Conferir na Sefin"}
                        </button>
                      ) : null}
                      {d.status === "AUTORIZADA" ? (
                        <button type="button" className="btn-ghost btn-xs danger" onClick={() => onCancelar(d)}>
                          Cancelar
                        </button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// =========================================================================
// BLOCO 4 — ESTOQUE (F3; aparece só com o controle ligado na config)
// =========================================================================

const TIPO_MOVIMENTO: Record<string, string> = {
  ENTRADA_XML: "Entrada (XML compra)",
  ENTRADA_MANUAL: "Entrada manual",
  RESERVA: "Reserva (carga)",
  LIBERA_RESERVA: "Liberação (carga)",
  BAIXA_ENTREGA: "Baixa (entrega)",
  SAIDA_EMISSAO: "Saída (emissão)",
  PERDA: "Perda",
  INVENTARIO: "Inventário",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste",
  REVERSA_CANCELAMENTO: "Reversa (cancelamento)",
};

type MovimentoAcao = "entrada-manual" | "perda" | "inventario" | "ajuste" | "devolucao";

const ACAO_MOVIMENTO: Record<MovimentoAcao, { rotulo: string; motivoObrigatorio: boolean; campoQtd: string }> = {
  "entrada-manual": { rotulo: "Entrada manual", motivoObrigatorio: false, campoQtd: "Quantidade" },
  perda: { rotulo: "Perda", motivoObrigatorio: true, campoQtd: "Quantidade perdida" },
  inventario: { rotulo: "Inventário", motivoObrigatorio: false, campoQtd: "Contagem física TOTAL" },
  ajuste: { rotulo: "Ajuste (+/−)", motivoObrigatorio: true, campoQtd: "Quantidade (use − pra tirar)" },
  devolucao: { rotulo: "Devolução", motivoObrigatorio: false, campoQtd: "Quantidade devolvida" },
};

function BlocoEstoque() {
  const [produtos, setProdutos] = useState<EstoqueProdutoT[]>([]);
  const [logistica, setLogistica] = useState<ProdutoLogisticaT[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState({ nome: "", unidade: "", ncm: "", logisticaProductId: "" });

  const [mov, setMov] = useState<{ acao: MovimentoAcao; produto: EstoqueProdutoT } | null>(null);
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");

  const [extratoDe, setExtratoDe] = useState<EstoqueProdutoT | null>(null);
  const [extrato, setExtrato] = useState<MovimentoEstoqueT[]>([]);

  const xmlRef = useRef<HTMLInputElement | null>(null);
  const [xmlTexto, setXmlTexto] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewXml | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [p, l] = await Promise.all([
        apiFetch<EstoqueProdutoT[]>("/fiscal/estoque/produtos"),
        apiFetch<ProdutoLogisticaT[]>("/fiscal/estoque/produtos-logistica"),
      ]);
      setProdutos(Array.isArray(p) ? p : []);
      setLogistica(Array.isArray(l) ? l : []);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao carregar o estoque."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial do bloco
    void carregar();
  }, [carregar]);

  const criarProduto = useCallback(async () => {
    setOcupado(true);
    setErro(null);
    try {
      await apiFetch("/fiscal/estoque/produtos", {
        method: "POST",
        body: JSON.stringify({
          nome: novo.nome.trim(),
          unidade: novo.unidade.trim() || undefined,
          ncm: novo.ncm.replace(/\D/g, "") || undefined,
          logisticaProductId: novo.logisticaProductId ? Number(novo.logisticaProductId) : undefined,
        }),
      });
      setNovo({ nome: "", unidade: "", ncm: "", logisticaProductId: "" });
      setNovoAberto(false);
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao criar o produto."));
    } finally {
      setOcupado(false);
    }
  }, [novo, carregar]);

  const lancarMovimento = useCallback(async () => {
    if (!mov) return;
    setOcupado(true);
    setErro(null);
    try {
      const qtd = Number(movQtd.replace(",", "."));
      const body =
        mov.acao === "inventario"
          ? { produtoId: mov.produto.id, contagem: qtd, motivo: movMotivo.trim() || undefined }
          : { produtoId: mov.produto.id, quantidade: qtd, motivo: movMotivo.trim() || undefined };
      const r = await apiFetch<any>(`/fiscal/estoque/${mov.acao}`, { method: "POST", body: JSON.stringify(body) });
      setAviso(mov.acao === "inventario" && r?.lancado === false ? r.aviso : null);
      setMov(null);
      setMovQtd("");
      setMovMotivo("");
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao lançar o movimento."));
    } finally {
      setOcupado(false);
    }
  }, [mov, movQtd, movMotivo, carregar]);

  const abrirExtrato = useCallback(async (p: EstoqueProdutoT) => {
    setExtratoDe(p);
    setExtrato([]);
    try {
      const rows = await apiFetch<MovimentoEstoqueT[]>(`/fiscal/estoque/extrato?produtoId=${encodeURIComponent(p.id)}`);
      setExtrato(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao carregar o extrato."));
    }
  }, []);

  const lerXml = useCallback(async (file: File | null) => {
    if (!file) return;
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const texto = await file.text();
      const p = await apiFetch<PreviewXml>("/fiscal/estoque/entrada-xml/preview", {
        method: "POST",
        body: JSON.stringify({ xml: texto }),
      });
      setXmlTexto(texto);
      setPreview(p);
      const inicial: Record<string, string> = {};
      for (const item of p.itens) inicial[item.cProd] = item.sugestaoProdutoId || "__novo";
      setMapa(inicial);
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao ler o XML."));
    } finally {
      setOcupado(false);
      if (xmlRef.current) xmlRef.current.value = "";
    }
  }, []);

  const confirmarXml = useCallback(async () => {
    if (!preview || !xmlTexto) return;
    setOcupado(true);
    setErro(null);
    try {
      const mapeamentos = preview.itens.map((item) => {
        const escolha = mapa[item.cProd] || "__ignorar";
        if (escolha === "__ignorar") return { cProd: item.cProd, ignorar: true };
        if (escolha === "__novo") {
          return { cProd: item.cProd, novoProduto: { nome: item.nome, unidade: item.unidade || undefined, ncm: item.ncm || undefined } };
        }
        return { cProd: item.cProd, produtoId: escolha };
      });
      const r = await apiFetch<{ lancados: number; duplicados: number; ignorados: number }>(
        "/fiscal/estoque/entrada-xml/confirmar",
        { method: "POST", body: JSON.stringify({ xml: xmlTexto, mapeamentos }) },
      );
      setAviso(`Entrada lançada: ${r.lancados} item(ns)` + (r.duplicados ? ` · ${r.duplicados} já lançado(s)` : "") + (r.ignorados ? ` · ${r.ignorados} ignorado(s)` : ""));
      setPreview(null);
      setXmlTexto(null);
      await carregar();
    } catch (e) {
      setErro(mensagemDe(e, "Falha ao confirmar a entrada."));
    } finally {
      setOcupado(false);
    }
  }, [preview, xmlTexto, mapa, carregar]);

  const nomeLogistica = useCallback(
    (id: number | null) => (id == null ? null : logistica.find((l) => l.id === id)?.name || `#${id}`),
    [logistica],
  );

  return (
    <section className="panel fis-bloco">
      <header className="fis-bloco-head">
        <h2>Estoque</h2>
        <label className="btn-ghost fis-upload-xml">
          <input
            ref={xmlRef}
            type="file"
            accept=".xml,text/xml"
            onChange={(e) => void lerXml(e.target.files?.[0] || null)}
          />
          <I d={ICONS.upload} size={14} />
          XML da compra
        </label>
        <button type="button" className="btn-ghost" onClick={() => setNovoAberto((v) => !v)}>
          <I d={ICONS.plus} size={14} />
          Produto
        </button>
      </header>
      <div className="fis-bloco-corpo">
        {aviso ? (
          <div className="fis-aviso fis-aviso--atencao">
            <div className="fis-aviso-topo">
              <span>{aviso}</span>
              <button type="button" className="btn-ghost btn-xs" onClick={() => setAviso(null)}>Entendi</button>
            </div>
          </div>
        ) : null}
        {erro ? <div className="fis-aviso fis-aviso--erro"><span>{erro}</span></div> : null}

        {novoAberto ? (
          <div className="fis-grade">
            <label className="fis-campo">
              <span className="field-label">Nome</span>
              <input className="field-dark" value={novo.nome} maxLength={200} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">Unidade</span>
              <input className="field-dark" placeholder="galão, un, cx" value={novo.unidade} maxLength={20} onChange={(e) => setNovo((n) => ({ ...n, unidade: e.target.value }))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">NCM</span>
              <input className="field-dark" inputMode="numeric" value={novo.ncm} maxLength={8} onChange={(e) => setNovo((n) => ({ ...n, ncm: e.target.value }))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">Produto da logística (vínculo)</span>
              <select className="field-dark" value={novo.logisticaProductId} onChange={(e) => setNovo((n) => ({ ...n, logisticaProductId: e.target.value }))}>
                <option value="">Sem vínculo</option>
                {logistica.map((l) => (
                  <option key={l.id} value={String(l.id)}>{l.name}</option>
                ))}
              </select>
            </label>
            <div className="fis-linha-acoes fis-campo--inteiro">
              <button type="button" className="btn-teal" disabled={ocupado || !novo.nome.trim()} onClick={criarProduto}>
                {ocupado ? "Salvando…" : "Salvar"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setNovoAberto(false)}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {preview ? (
          <div className="fis-xml-conferencia">
            <strong className="hbx-inteiro">
              NF-e de {preview.emitenteNome || "fornecedor"} — confira o destino de cada item
            </strong>
            {preview.jaLancada ? (
              <div className="fis-aviso fis-aviso--atencao"><span>Esta nota JÁ teve entrada lançada — itens repetidos serão ignorados.</span></div>
            ) : null}
            {preview.itens.map((item) => (
              <div key={item.cProd} className="fis-xml-item">
                <span className="fis-xml-item-nome">
                  <strong>{item.nome}</strong>
                  <small>{item.quantidade} {item.unidade || "un"}{item.ncm ? ` · NCM ${item.ncm}` : ""}</small>
                </span>
                <select
                  className="field-dark"
                  value={mapa[item.cProd] || "__ignorar"}
                  onChange={(e) => setMapa((m) => ({ ...m, [item.cProd]: e.target.value }))}
                >
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>→ {p.nome}</option>
                  ))}
                  <option value="__novo">Criar produto novo</option>
                  <option value="__ignorar">Ignorar este item</option>
                </select>
              </div>
            ))}
            <div className="fis-linha-acoes">
              <button type="button" className="btn-teal" disabled={ocupado} onClick={confirmarXml}>
                {ocupado ? "Lançando…" : "Lançar entrada"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setPreview(null); setXmlTexto(null); }}>Cancelar</button>
            </div>
          </div>
        ) : null}

        {produtos.length === 0 ? (
          <div className="fis-vazio">
            <strong>Nenhum produto no estoque</strong>
            <span>Crie o produto (1–5 itens) ou suba o XML da primeira compra.</span>
          </div>
        ) : (
          <div className="fis-servicos">
            {produtos.map((p) => (
              <div key={p.id} className="fis-servico">
                <div className="fis-servico-topo">
                  <strong>{p.nome}</strong>
                </div>
                <div className="fis-servico-meta">
                  <span>Disponível <b>{p.saldo.disponivel}</b></span>
                  <span>Reservado <b>{p.saldo.reservado}</b></span>
                  <span>Faturado <b>{p.saldo.faturado}</b></span>
                  <span>Físico <b>{p.saldo.fisico}</b></span>
                  {p.logisticaProductId != null ? <span>↔ {nomeLogistica(p.logisticaProductId)}</span> : <span>Sem vínculo com a rota</span>}
                </div>
                {p.saldo.fisico < 0 ? (
                  <div className="fis-aviso fis-aviso--erro"><span>Estoque NEGATIVO — confira entradas ou faça o inventário.</span></div>
                ) : null}
                <div className="fis-linha-acoes">
                  {(Object.keys(ACAO_MOVIMENTO) as MovimentoAcao[]).map((acao) => (
                    <button
                      key={acao}
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={() => { setMov({ acao, produto: p }); setMovQtd(""); setMovMotivo(""); }}
                    >
                      {ACAO_MOVIMENTO[acao].rotulo}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost btn-xs" onClick={() => void abrirExtrato(p)}>Extrato</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mov ? (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) setMov(null); }}>
          <div className="hbx-modal fis-modal" role="dialog" aria-label={ACAO_MOVIMENTO[mov.acao].rotulo}>
            <h3>{ACAO_MOVIMENTO[mov.acao].rotulo} — {mov.produto.nome}</h3>
            <label className="fis-campo">
              <span className="field-label">{ACAO_MOVIMENTO[mov.acao].campoQtd}</span>
              <input className="field-dark" inputMode="decimal" value={movQtd} onChange={(e) => setMovQtd(e.target.value.replace(/[^\d.,-]/g, ""))} />
            </label>
            <label className="fis-campo">
              <span className="field-label">{ACAO_MOVIMENTO[mov.acao].motivoObrigatorio ? "Motivo (obrigatório)" : "Motivo"}</span>
              <input className="field-dark" value={movMotivo} maxLength={300} onChange={(e) => setMovMotivo(e.target.value)} />
            </label>
            <div className="fis-modal-acoes">
              <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => setMov(null)}>Voltar</button>
              <button
                type="button"
                className="btn-teal"
                disabled={ocupado || !movQtd.trim() || (ACAO_MOVIMENTO[mov.acao].motivoObrigatorio && movMotivo.trim().length < 3)}
                onClick={lancarMovimento}
              >
                {ocupado ? "Lançando…" : "Lançar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {extratoDe ? (
        <div className="hbx-veil" onClick={(e) => { if (e.target === e.currentTarget) setExtratoDe(null); }}>
          <div className="hbx-modal fis-modal fis-modal--largo" role="dialog" aria-label="Extrato do estoque">
            <h3>Extrato — {extratoDe.nome}</h3>
            <div className="fis-tabela-scroll">
              {extrato.length === 0 ? (
                <div className="fis-vazio"><span>Nenhum movimento.</span></div>
              ) : (
                <table className="tbl fis-tabela">
                  <thead>
                    <tr><th>Data</th><th>Movimento</th><th className="fis-col-valor">Qtd</th><th>Motivo</th></tr>
                  </thead>
                  <tbody>
                    {extrato.map((m) => (
                      <tr key={m.id}>
                        <td>{fmtData(m.createdAt)}</td>
                        <td>{TIPO_MOVIMENTO[m.tipo] || m.tipo}</td>
                        <td className="fis-col-valor">{m.quantidade}</td>
                        <td>{m.motivo || (m.refChaveNfe ? `NF-e ${m.refChaveNfe.slice(0, 10)}…` : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="fis-modal-acoes">
              <button type="button" className="btn-ghost" onClick={() => setExtratoDe(null)}>Fechar</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// =========================================================================
// A TELA
// =========================================================================

export function FiscalClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);

  const [perfil, setPerfil] = useState<PerfilFiscal | null>(null);
  const [servicos, setServicos] = useState<ServicoFiscal[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioFiscal[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoFiscal[]>([]);

  const [carregandoDocs, setCarregandoDocs] = useState(true);
  const [erroDocs, setErroDocs] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroCompetencia, setFiltroCompetencia] = useState("");

  const [cancelando, setCancelando] = useState<DocumentoFiscal | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cancelaOcupado, setCancelaOcupado] = useState(false);
  const [erroCancela, setErroCancela] = useState<string | null>(null);
  // O cancelamento no HBX não fecha o rito legal — o backend devolve o aviso
  // dizendo que o evento no portal gov.br/nfse continua manual. Esconder isso
  // faria a tela mentir sobre uma obrigação fiscal.
  const [avisoNotas, setAvisoNotas] = useState<string | null>(null);

  const carregarServicos = useCallback(async () => {
    try {
      const lista = await apiFetch<ServicoFiscal[]>("/fiscal/servicos?inativos=1");
      setServicos(Array.isArray(lista) ? lista : []);
    } catch (e) {
      setErroGeral(mensagemDe(e, "Falha ao carregar o catálogo."));
    }
  }, []);

  const carregarBase = useCallback(async () => {
    setErroGeral(null);
    try {
      const p = await apiFetch<PerfilFiscal>("/fiscal/perfil");
      setPerfil(p);
    } catch (e) {
      setErroGeral(mensagemDe(e, "Falha ao carregar o perfil fiscal."));
    }
    try {
      const m = await apiFetch<MunicipioFiscal[]>("/fiscal/municipios");
      setMunicipios(Array.isArray(m) ? m : []);
    } catch {
      setMunicipios([]);
    }
    await carregarServicos();
  }, [carregarServicos]);

  const carregarDocumentos = useCallback(async () => {
    setCarregandoDocs(true);
    setErroDocs(null);
    try {
      const q = new URLSearchParams();
      if (filtroStatus) q.set("status", filtroStatus);
      if (filtroCompetencia) q.set("competencia", filtroCompetencia);
      const sufixo = q.toString() ? `?${q.toString()}` : "";
      const lista = await apiFetch<DocumentoFiscal[]>(`/fiscal/documentos${sufixo}`);
      setDocumentos(Array.isArray(lista) ? lista : []);
    } catch (e) {
      setErroDocs(mensagemDe(e, "Falha ao carregar as notas."));
      setDocumentos([]);
    } finally {
      setCarregandoDocs(false);
    }
  }, [filtroStatus, filtroCompetencia]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da tela; padrão do app
    if (admin) void carregarBase();
  }, [admin, carregarBase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega a lista quando o filtro muda
    if (admin) void carregarDocumentos();
  }, [admin, carregarDocumentos]);

  const baixar = useCallback(async (doc: DocumentoFiscal, tipo: "pdf" | "xml") => {
    try {
      const res = await fetch(`${getApiBase()}/fiscal/documentos/${encodeURIComponent(doc.id)}/${tipo}`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error("download falhou");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfse-${doc.serie || "s"}-${doc.numero ?? doc.id}.${tipo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErroDocs(`Falha ao baixar o ${tipo.toUpperCase()}.`);
    }
  }, []);

  // F1b — reenvio manual e conferência pós-timeout, direto da lista.
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const enviarDoc = useCallback(async (d: DocumentoFiscal) => {
    setOcupadoId(d.id);
    try {
      const r = await apiFetch<{ email: { tentado: boolean; ok: boolean; erro: string | null }; whats: { tentado: boolean; ok: boolean; erro: string | null } }>(
        `/fiscal/documentos/${encodeURIComponent(d.id)}/enviar`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const partes: string[] = [];
      if (r.email.tentado) partes.push(r.email.ok ? "E-mail enviado." : `E-mail: ${r.email.erro}`);
      if (r.whats.tentado) partes.push(r.whats.ok ? "WhatsApp enviado." : `WhatsApp: ${r.whats.erro}`);
      setAvisoNotas(partes.join(" ") || null);
    } catch (e) {
      setAvisoNotas(mensagemDe(e, "Falha ao enviar ao tomador."));
    } finally {
      setOcupadoId(null);
      await carregarDocumentos();
    }
  }, [carregarDocumentos]);

  const conferirSefinDoc = useCallback(async (d: DocumentoFiscal) => {
    setOcupadoId(d.id);
    try {
      const nota = await apiFetch<DocumentoFiscal>(
        `/fiscal/documentos/${encodeURIComponent(d.id)}/conferir-sefin`,
        { method: "POST" },
      );
      setAvisoNotas(nota?.aviso || null);
    } catch (e) {
      setAvisoNotas(mensagemDe(e, "Falha ao conferir na Sefin."));
    } finally {
      setOcupadoId(null);
      await carregarDocumentos();
    }
  }, [carregarDocumentos]);

  // MALOTE DO CONTADOR — zip da competência do filtro (default: mês atual).
  const baixarMalote = useCallback(async () => {
    const competencia = filtroCompetencia || new Date().toISOString().slice(0, 7);
    try {
      const res = await fetch(`${getApiBase()}/fiscal/malote/${encodeURIComponent(competencia)}`, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) throw new Error("malote falhou");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `malote-fiscal-${competencia}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setAvisoNotas("Falha ao gerar o malote do contador.");
    }
  }, [filtroCompetencia]);

  const confirmarCancelamento = useCallback(async () => {
    if (!cancelando) return;
    setCancelaOcupado(true);
    setErroCancela(null);
    try {
      const cancelada = await apiFetch<DocumentoFiscal>(
        `/fiscal/documentos/${encodeURIComponent(cancelando.id)}/cancelar`,
        { method: "POST", body: JSON.stringify({ motivo: motivo.trim() }) },
      );
      setCancelando(null);
      setMotivo("");
      setAvisoNotas(cancelada?.aviso || null);
      await carregarDocumentos();
    } catch (e) {
      setErroCancela(mensagemDe(e, "Falha ao cancelar."));
    } finally {
      setCancelaOcupado(false);
    }
  }, [cancelando, motivo, carregarDocumentos]);

  const ultimoErro = useMemo(
    () => documentos.find((d) => Boolean(d.erroMsg))?.erroMsg || null,
    [documentos],
  );

  // Não-admin: estado neutro (LEI DO VENDEDOR — nenhuma nota, nenhum valor).
  if (user && !admin) {
    return (
      <HbxPanelShell
        ariaLabel="Fiscal"
        main={(
          <section className="fis-restrito">
            <span className="fis-restrito-icone"><I d={ICONS.doc} size={20} /></span>
            <strong>Fiscal</strong>
            <span>Acesso restrito ao responsável da conta.</span>
          </section>
        )}
      />
    );
  }

  return (
    <>
      <HbxPanelShell
        variant="context"
        ariaLabel="Fiscal"
        contextLabel="Configuração fiscal"
        larguraAjustavel="fiscal-config"
        contentClassName="fis-shell-content"
        main={(
          <div className="fis-work">
            <BlocoEmitir
              perfil={perfil}
              servicos={servicos}
              onEmitida={carregarDocumentos}
              onBaixar={baixar}
            />
            <BlocoNotas
              documentos={documentos}
              carregando={carregandoDocs}
              erro={erroDocs || erroGeral}
              filtroStatus={filtroStatus}
              filtroCompetencia={filtroCompetencia}
              onFiltroStatus={setFiltroStatus}
              onFiltroCompetencia={setFiltroCompetencia}
              onBaixar={baixar}
              onCancelar={(d) => {
                setCancelando(d);
                setMotivo("");
                setErroCancela(null);
              }}
              onEnviar={enviarDoc}
              onConferirSefin={conferirSefinDoc}
              onMalote={baixarMalote}
              ocupadoId={ocupadoId}
              aviso={avisoNotas}
              onFecharAviso={() => setAvisoNotas(null)}
            />
            {perfil?.estoqueAtivo ? <BlocoEstoque /> : null}
          </div>
        )}
        context={(
          <PainelConfig
            perfil={perfil}
            servicos={servicos}
            municipios={municipios}
            ultimoErro={ultimoErro}
            onPerfilSalvo={setPerfil}
            onServicosMudaram={carregarServicos}
          />
        )}
      />

      {cancelando ? (
        <div
          className="hbx-veil"
          onClick={(e) => {
            if (e.target === e.currentTarget && !cancelaOcupado) setCancelando(null);
          }}
        >
          <div className="hbx-modal fis-modal" role="dialog" aria-label="Cancelar nota">
            <h3>Cancelar nota</h3>
            <label className="fis-campo">
              <span className="field-label">Motivo</span>
              <textarea
                className="field-dark"
                value={motivo}
                maxLength={500}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
            {erroCancela ? <div className="fis-aviso fis-aviso--erro"><span>{erroCancela}</span></div> : null}
            <div className="fis-modal-acoes">
              <button type="button" className="btn-ghost" disabled={cancelaOcupado} onClick={() => setCancelando(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn-ghost danger"
                disabled={cancelaOcupado || motivo.trim().length < 5}
                onClick={confirmarCancelamento}
              >
                {cancelaOcupado ? "Cancelando…" : "Cancelar nota"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
