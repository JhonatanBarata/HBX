"use client";

// NÚCLEO-CRM N4 — janela "Contatos" (pessoas) + criar cliente manual + view
// "Clientes" (papel). Contratos reais (company-scoped, companyId sempre do JWT):
//   - GET  /nucleo/contatos?query=&page=      → { items(pessoas), total, ... }
//   - GET  /nucleo/clientes?query=&uf=&page=  → { items(contas papel=cliente) }
//   - POST /nucleo/contas                     → cria conta manual + contato principal
//
// Cadastro manual é GRÁTIS (não é lead da base 28M → não debita crédito).
//
// Design system (5 Leis): visual todo em classe central (.ctt-*/.emp-* em
// screens.css + .hbx-veil/.hbx-modal/.field-dark/.btn-teal do kit). Inline aqui
// = só layout (display/gap/grid) — nada de cor/borda/sombra/fonte inline.

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";

import { EditarContaModal, EditarContatoModal } from "@/components/hbx/editar-nucleo-modais";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import {
  HbxContextEmpty,
  HbxContextFact,
  HbxContextFacts,
  HbxContextHeader,
  HbxContextHero,
  HbxContextMetric,
  HbxContextMetrics,
  HbxPanelShell,
} from "@/components/hbx/panel-shell";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { ImportPlanilhaModal, type ImportSchema } from "@/components/hbx/import-planilha-modal";
import { apiFetch } from "@/lib/api";
import { formatBrPhone } from "@/lib/br-phone";
import { isTenantAdmin } from "@/lib/roles";

// Importação em massa (planilha): A nome (obrigatório) · B telefone · C cidade ·
// D uf · E cnpj (vira PJ) · F email · G endereço · H cep · I cargo — casa com o
// que o Radar/RFB materializa. Só nome é obrigatório; só A+B já importa. Cada linha
// roda o MESMO caminho idempotente do cadastro manual (grátis, não debita crédito).
const CONTATOS_IMPORT_SCHEMA: ImportSchema = {
  title: "Importar contatos (planilha)",
  entity: "contato",
  templateName: "modelo-contatos.xlsx",
  endpoint: "/nucleo/contas/import",
  columns: [
    { key: "nome", header: "nome", label: "Nome", required: true, example: "Dona Maria", hint: "nome da pessoa ou empresa (obrigatório)", aliases: ["nome completo", "cliente", "razao social"] },
    { key: "telefone", header: "telefone", label: "Telefone", example: "(85) 99999-0000", hint: "telefone com DDD — vira o WhatsApp", aliases: ["whatsapp", "fone", "celular", "telefone/whatsapp"] },
    { key: "cidade", header: "cidade", label: "Cidade", example: "Fortaleza", hint: "cidade do cliente", aliases: ["municipio"] },
    { key: "uf", header: "uf", label: "UF", example: "CE", hint: 'estado — 2 letras ("CE") ou nome ("Ceará")', aliases: ["estado"] },
    { key: "cnpj", header: "cnpj", label: "CNPJ", example: "12.345.678/0001-90", hint: "CNPJ — se preenchido, vira empresa (PJ)", aliases: ["cnpj/cpf", "documento", "cpf"] },
    { key: "email", header: "email", label: "E-mail", example: "maria@empresa.com", hint: "e-mail de contato", aliases: ["e-mail"] },
    { key: "endereco", header: "endereco", label: "Endereço", example: "Rua A, 123 - Centro", hint: "endereço / rua", aliases: ["endereço", "logradouro"] },
    { key: "cep", header: "cep", label: "CEP", example: "60000-000", hint: "CEP" },
    { key: "cargo", header: "cargo", label: "Cargo", example: "Compradora", hint: "cargo / função da pessoa", aliases: ["funcao", "função"] },
  ],
  normalizeRow: (r) => {
    const nome = String(r.nome ?? "").trim();
    if (!nome) return null;
    const row: Record<string, unknown> = { nome };
    // Backend espera strings; SheetJS pode devolver número (telefone/cep) — sempre coage.
    const put = (key: string, v: string | number) => {
      const s = String(v ?? "").trim();
      if (s) row[key] = s;
    };
    put("telefone", r.telefone);
    put("cidade", r.cidade);
    put("uf", r.uf);
    put("cnpj", r.cnpj);
    put("email", r.email);
    put("endereco", r.endereco);
    put("cep", r.cep);
    put("cargo", r.cargo);
    return row;
  },
  previewKeys: [
    { key: "nome", label: "Nome" },
    { key: "telefone", label: "Telefone" },
    { key: "cidade", label: "Cidade" },
    { key: "uf", label: "UF" },
  ],
};

type ContatoConversa = {
  id: number;
  lastMessageAt: string | null;
  mensagens: number;
};

type ContatoItem = {
  id: string;
  nome: string;
  cargo: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  isPrincipal: boolean;
  source: string | null;
  contaId: string;
  contaNome: string | null;
  contaTipo: string | null;
  contaIsCliente: boolean;
  contaIsLead: boolean;
  contaIsFornecedor: boolean;
  // Atendimento (backend NÚCLEO): conversa salva casada por telefone + finalizado.
  conversa: ContatoConversa | null;
  finalizado: boolean;
  finalizadoMotivo: string | null;
  finalizadoEm: string | null;
};

type ContatoListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ContatoItem[];
} | null;

// A view "Clientes" reusa a serialização de Empresas (contas).
type ClienteItem = {
  id: string;
  name: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  origin: string | null;
  contatosCount: number;
};

type ClienteDetail = {
  id: string;
  name: string | null;
  tipo: string;
  cnpj: string | null;
  document: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  geoFonte: string | null;
  whatsapp: string | null;
  email: string | null;
  isLead: boolean;
  isCliente: boolean;
  isFornecedor: boolean;
  formaPagamento: string;
  metodoPadrao: string | null;
  contabilizar: boolean;
  diaFechamento: number | null;
  limiteFiado: number | null;
  avisarCobranca: boolean;
  contatoPrincipalId: string | null;
  locais: Array<{
    id: string;
    apelido: string | null;
    endereco: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    lat: number | null;
    lng: number | null;
    geoFonte: string | null;
    isPrincipal: boolean;
    ativo: boolean;
  }>;
  telefones: Array<{
    id: string;
    nome: string;
    whatsapp: string | null;
    phone: string | null;
    isPrincipal: boolean;
  }>;
  observacoes: string | null;
};

type ClienteListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ClienteItem[];
} | null;

type ContextSelection =
  | { kind: "contato"; item: ContatoItem }
  | { kind: "cliente"; item: ClienteItem };

function localCityUf(cidade: string | null, uf: string | null): string {
  return [String(cidade || "").trim(), String(uf || "").trim()].filter(Boolean).join(" · ");
}

function clienteEndereco(detail: ClienteDetail | null): string {
  if (!detail) return "";
  const local = detail.locais.find((item) => item.isPrincipal) || detail.locais[0] || null;
  const rua = local?.endereco || detail.endereco;
  const numero = local?.numero || detail.numero;
  const bairro = local?.bairro || detail.bairro;
  const cidadeUf = localCityUf(local?.cidade || detail.cidade, local?.uf || detail.uf);
  return [
    [rua, numero].filter(Boolean).join(", "),
    bairro,
    cidadeUf,
  ].filter(Boolean).join(" · ");
}

function formaPagamentoLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    aberto: "Em aberto",
    na_hora: "Na hora",
    mensal: "Mensal",
    fiado: "Fiado",
  };
  const key = String(value || "").trim().toLowerCase();
  return labels[key] || (key ? key.replaceAll("_", " ") : "Não definida");
}

function metodoPagamentoLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    boleto: "Boleto",
    transferencia: "Transferência",
    cartao: "Cartão",
  };
  const key = String(value || "").trim().toLowerCase();
  return labels[key] || (key ? key.replaceAll("_", " ") : "");
}

// Rótulos dos motivos de finalização (o backend guarda o código cru em botOffReason).
const FINALIZADO_LABEL: Record<string, string> = {
  sem_interesse: "Sem interesse",
  nao_ligar: "Não ligar mais",
  do_not_call: "Não ligar mais",
  ja_tem: "Já tem solução",
  preco: "Preço alto",
  sem_perfil: "Sem perfil",
};

function finalizadoLabel(motivo: string | null): string {
  const key = String(motivo || "").trim();
  if (!key) return "Finalizado";
  return FINALIZADO_LABEL[key] || key;
}

// "há 3 dias" / "hoje" — tempo relativo curto da última mensagem da conversa salva.
function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ── LOGÍSTICA-MOBILE M2 — "Produtos do cliente" (vínculo produto×cliente) ─────
type ProdutoOption = {
  id: number;
  nome: string;
  unidade: string | null;
  usaLogistica: boolean;
  precoCatalogo: number | null;
};

type ClienteProduto = {
  id: string;
  customerProfileId: string;
  productId: number;
  qtdPadrao: number;
  precoAcordado: number | null;
  frequenciaDias: number | null;
  diasSemana: string | null;
  proximaData: string | null;
  ativo: boolean;
  produto: { id: number; nome: string; unidade: string | null; precoCatalogo: number | null } | null;
};

function fmtRecorrencia(cp: ClienteProduto): string {
  if (cp.diasSemana) {
    const map = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const dias = cp.diasSemana
      .split(",")
      .map((d) => map[Number(d.trim())] || "")
      .filter(Boolean)
      .join("/");
    return dias ? `Toda ${dias}` : "Sem recorrência";
  }
  if (cp.frequenciaDias) return cp.frequenciaDias === 7 ? "Semanal" : `A cada ${cp.frequenciaDias} dias`;
  return "Sem recorrência";
}

// ── LOGÍSTICA-MOBILE M6 — financeiro do cliente (forma de pagamento + extrato) ─
type FinanceiroCliente = {
  id: string;
  formaPagamento: string; // aberto | mensal | na_hora | pendura
  metodoPadrao: string | null; // pix | dinheiro (só na_hora)
  contabilizar: boolean;
  diaFechamento: number | null;
};

type ExtratoCharge = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  status: string; // pending | approved | ...
  lifecycle: string;
  dueDate: string | null;
  sourceModule: string | null;
  entregaId: string | null;
  createdAt: string | null;
  paidAt: string | null;
};

type ExtratoResult = { clienteId: string; nome: string | null; total: number; charges: ExtratoCharge[] };

const FORMA_LABEL: Record<string, string> = {
  aberto: "Escolhe na hora",
  mensal: "Fecha no mês",
  na_hora: "Sempre na hora",
  pendura: "Pendura (fiado)",
};

const CHARGE_STATUS_LABEL: Record<string, string> = {
  approved: "Pago",
  paid: "Pago",
  pending: "A receber",
  cancelled: "Cancelado",
  failed: "Falhou",
  refunded: "Estornado",
};

function fmtMoney(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

function fmtDay(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

// Editor da forma de pagamento (M6) — os 2 eixos: forma + método padrão (na_hora)
// + contabilizar + dia de fechamento (mensal). Salva via PATCH /clientes/:id/financeiro.
// ADMIN-only (o pai só renderiza este bloco para admin).
function FinanceiroEditor({ clienteId }: { clienteId: string }) {
  const [fin, setFin] = useState<FinanceiroCliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    // O PATCH com body vazio é um no-op que devolve o estado ATUAL dos 2 eixos
    // (o backend M6 não expõe um GET dedicado da forma; o echo do PATCH é a fonte).
    // ADMIN-only, idempotente — não muda nada além de refletir o contrato vigente.
    return apiFetch<FinanceiroCliente>(`/logistica/clientes/${clienteId}/financeiro`, { method: "PATCH", body: JSON.stringify({}) })
      .then((res) => { setFin(res); setError(null); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Não foi possível carregar."); })
      .finally(() => setLoading(false));
  }, [clienteId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar ou trocar de cliente; efeito legítimo, não estado derivado.
  useEffect(() => { load(); }, [load]);

  async function patch(body: Partial<FinanceiroCliente>) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<FinanceiroCliente>(`/logistica/clientes/${clienteId}/financeiro`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setFin(res);
      setSavedAt(Date.now());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="cli-prod__muted">Carregando forma de pagamento…</p>;
  if (!fin) return <p className="hint cli-prod__err">{error || "Sem dados financeiros."}</p>;

  return (
    <div className="cli-fin">
      <div className="cli-fin__head">
        <strong className="cli-fin__title">Forma de pagamento</strong>
        {saving ? <span className="cli-fin__tag">Salvando…</span> : savedAt ? <span className="cli-fin__tag is-ok">Salvo</span> : null}
      </div>

      <div className="cli-fin__row">
        <label className="cli-fin__lbl" htmlFor="fin-forma">Como paga</label>
        <select
          id="fin-forma"
          className="field-dark"
          value={fin.formaPagamento}
          onChange={(e) => patch({ formaPagamento: e.target.value })}
          disabled={saving}
        >
          <option value="aberto">Escolhe na hora (avulso)</option>
          <option value="na_hora">Sempre na hora (forma fixa)</option>
          <option value="mensal">Fecha no mês</option>
          <option value="pendura">Pendura (fiado)</option>
        </select>
      </div>

      {fin.formaPagamento === "na_hora" && (
        <div className="cli-fin__row">
          <label className="cli-fin__lbl" htmlFor="fin-metodo">Método fixo</label>
          <select
            id="fin-metodo"
            className="field-dark"
            value={fin.metodoPadrao || ""}
            onChange={(e) => patch({ metodoPadrao: e.target.value })}
            disabled={saving}
          >
            <option value="">Escolher…</option>
            <option value="pix">Pix</option>
            <option value="dinheiro">Dinheiro</option>
          </select>
        </div>
      )}

      {fin.formaPagamento === "mensal" && (
        <div className="cli-fin__row">
          <label className="cli-fin__lbl" htmlFor="fin-dia">Fecha no dia</label>
          <input
            id="fin-dia"
            className="field-dark cli-fin__dia"
            type="number"
            min={1}
            max={31}
            value={fin.diaFechamento ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= 31) patch({ diaFechamento: n });
            }}
            disabled={saving}
          />
        </div>
      )}

      <label className="ctt-toggle cli-fin__conta">
        <input
          type="checkbox"
          checked={fin.contabilizar}
          onChange={(e) => patch({ contabilizar: e.target.checked })}
          disabled={saving}
        />
        <span>Contabilizar (entra no financeiro)</span>
      </label>

      {error && <p className="hint cli-prod__err">{error}</p>}
    </div>
  );
}

// Extrato do cliente (M6) — lista os FinanceiroCharge linkados. Read-only.
function ExtratoPanel({ clienteId }: { clienteId: string }) {
  const [ext, setExt] = useState<ExtratoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar/trocar cliente (guarda `alive`); efeito legítimo
    setLoading(true);
    apiFetch<ExtratoResult>(`/logistica/clientes/${clienteId}/extrato`)
      .then((res) => { if (alive) { setExt(res); setError(null); } })
      .catch((err: unknown) => { if (alive) setError(err instanceof Error ? err.message : "Não foi possível carregar o extrato."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clienteId]);

  if (loading) return <p className="cli-prod__muted">Carregando extrato…</p>;
  if (error) return <p className="hint cli-prod__err">{error}</p>;
  if (!ext || ext.charges.length === 0) return <p className="cli-prod__muted">Nenhuma cobrança lançada ainda.</p>;

  const totalPendente = ext.charges
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  return (
    <div className="cli-ext">
      <div className="cli-ext__head">
        <strong className="cli-fin__title">Extrato</strong>
        {totalPendente > 0 && <span className="cli-ext__due">A receber: {fmtMoney(totalPendente)}</span>}
      </div>
      <div className="cli-ext__list">
        {ext.charges.map((c) => {
          const pago = c.status === "approved" || c.status === "paid" || c.lifecycle === "paid";
          return (
            <div className="cli-ext__row" key={c.id}>
              <span className="cli-ext__main">
                <span className="cli-ext__desc">{c.description}</span>
                <span className="cli-ext__meta">
                  {pago && c.paidAt ? `Pago em ${fmtDay(c.paidAt)}` : c.dueDate ? `Vence ${fmtDay(c.dueDate)}` : fmtDay(c.createdAt)}
                </span>
              </span>
              <span className="cli-ext__side">
                <span className="cli-ext__amount">{fmtMoney(c.amount)}</span>
                <span className={`cli-ext__badge cli-ext__badge--${pago ? "paid" : c.status}`}>
                  {CHARGE_STATUS_LABEL[pago ? "paid" : c.status] || c.status}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PR27072026 F0 — EXTRATO DE EVENTOS DA AGENDA (28/07) ────────────────────
// Pedido explícito do dono: "toda mudança vira linha com timestamp exato, autor
// e de→para, visível na ficha do cliente". O backend já gravava (tabela
// append-only LogisticaAgendaEvento, endpoint GET /logistica/clientes/:id/
// agenda-eventos desde 27/07) — faltava a TELA. É a resposta pra "por que a
// entrega desse cliente mudou de dia?" sem abrir banco.
//
// SÓ LEITURA: não existe botão de editar/apagar aqui de propósito (o extrato
// financeiro tem, este NÃO — evento de agenda é prova, não anotação).
// Sem @Admin no endpoint (quem dirige a rota também precisa entender o que
// mudou), então o painel aparece pra todo ator — diferente do extrato de
// dinheiro logo acima, que é admin-only.
// Casca: reusa .cli-ext* do ExtratoPanel — zero classe nova (5 Leis).
type AgendaEvento = {
  id: string;
  tipo: string;
  deTexto: string | null;
  paraTexto: string | null;
  origem: string;
  autor: string | null;
  createdAt: string;
};

type AgendaEventosResult = { items: AgendaEvento[]; nextCursor: string | null };

const AGENDA_ORIGEM_LABEL: Record<string, string> = {
  montagem: "Montagem da rota",
  desfecho: "Entrega registrada",
  fechamento: "Fechamento do dia",
  descarte: "Montagem descartada",
  manual: "Alteração manual",
  reparo: "Reparo",
  app: "App do entregador",
};

// Frase curta do que mudou (o "de→para" do dono). Nada de nome de tabela/enum
// vazando pra tela; tipo desconhecido (versão futura do backend) vira linha
// genérica em vez de sumir — o extrato nunca mente por omissão.
function descreverEventoAgenda(ev: AgendaEvento): string {
  const de = (ev.deTexto || "").trim();
  const para = (ev.paraTexto || "").trim();
  switch (ev.tipo) {
    case "DIA_ALTERADO":
      return de && para ? `Dia de entrega mudou de ${de} para ${para}` : "Dia de entrega alterado";
    case "OCORRENCIA_GERADA":
      return para ? `Entrega gerada para ${para}` : "Entrega gerada";
    case "OCORRENCIA_ADIANTADA":
      return de && para ? `Entrega de ${de} adiantada para ${para}` : "Entrega adiantada";
    case "PLANO_AVANCADO":
      if (de && para) return `Entrega de ${de} fechada — próxima passou para ${para}`;
      if (de) return `Entrega de ${de} fechada — plano sem próxima data`;
      return "Agenda avançou";
    case "OCORRENCIA_DEVOLVIDA":
      return para ? `Entrega de ${para} devolvida para o plano` : "Entrega devolvida para o plano";
    case "CANCELADA_FECHAMENTO":
      return para ? `Entrega de ${para} cancelada no fechamento` : "Entrega cancelada no fechamento";
    case "ENTREGA_REABERTA":
      return "Entrega concluída foi reaberta — voltou para a fazer";
    case "CORRECAO_MANUAL":
      return de && para ? `Correção manual: ${de} → ${para}` : "Correção manual no registro";
    default:
      return "Mudança na agenda";
  }
}

// Dia e hora EXATOS no fuso da OPERAÇÃO (America/Sao_Paulo), nunca no fuso do
// navegador: o backend grava em UTC e este extrato é prova de horário — um
// admin viajando não pode ver a mesma linha com hora diferente.
function fmtEventoDia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function fmtEventoHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AGENDA_EVENTOS_PAGINA = 20;

function AgendaEventosPanel({ clienteId }: { clienteId: string }) {
  const [eventos, setEventos] = useState<AgendaEvento[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar/trocar cliente (guarda `alive`); efeito legítimo
    setLoading(true);
    apiFetch<AgendaEventosResult>(
      `/logistica/clientes/${encodeURIComponent(clienteId)}/agenda-eventos?limit=${AGENDA_EVENTOS_PAGINA}`,
    )
      .then((res) => {
        if (!alive) return;
        setEventos(res?.items ?? []);
        setCursor(res?.nextCursor ?? null);
        setError(null);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico da agenda.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clienteId]);

  async function verMais() {
    if (!cursor || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const res = await apiFetch<AgendaEventosResult>(
        `/logistica/clientes/${encodeURIComponent(clienteId)}/agenda-eventos?limit=${AGENDA_EVENTOS_PAGINA}&cursor=${encodeURIComponent(cursor)}`,
      );
      setEventos((prev) => [...prev, ...(res?.items ?? [])]);
      setCursor(res?.nextCursor ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar mais.");
    } finally {
      setCarregandoMais(false);
    }
  }

  if (loading) return <p className="cli-prod__muted">Carregando histórico da agenda…</p>;
  if (error) return <p className="hint cli-prod__err">{error}</p>;
  if (eventos.length === 0) {
    return <p className="cli-prod__muted">Nenhuma mudança de agenda registrada ainda.</p>;
  }

  return (
    <div className="cli-ext">
      <div className="cli-ext__head">
        <strong className="cli-fin__title">Histórico da agenda</strong>
      </div>
      <div className="cli-ext__list">
        {eventos.map((ev) => (
          <div className="cli-ext__row" key={ev.id}>
            <span className="cli-ext__main">
              <span className="cli-ext__desc">{descreverEventoAgenda(ev)}</span>
              <span className="cli-ext__meta">
                {AGENDA_ORIGEM_LABEL[ev.origem] || ev.origem}
                {ev.autor ? ` · ${ev.autor}` : ""}
              </span>
            </span>
            <span className="cli-ext__side">
              <span className="cli-ext__amount">{fmtEventoDia(ev.createdAt)}</span>
              <span className="cli-ext__meta">{fmtEventoHora(ev.createdAt)}</span>
            </span>
          </div>
        ))}
      </div>
      {cursor && (
        <button type="button" className="btn-ghost btn-xs" onClick={() => void verMais()} disabled={carregandoMais}>
          {carregandoMais ? "Carregando…" : "Ver mais"}
        </button>
      )}
    </div>
  );
}

// Drawer com a lista + o formulário de adicionar produto ao cliente.
function ClienteProdutosDrawer({
  cliente,
  admin,
  onClose,
}: {
  cliente: { id: string; nome: string | null };
  admin: boolean;
  onClose: () => void;
}) {
  const [vinculos, setVinculos] = useState<ClienteProduto[]>([]);
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // LOGÍSTICA-MOBILE M5 — toggle "avisar entrega" POR CLIENTE (2º nível, soma com
  // o global de LogisticaConfig). null = ainda carregando; default do backend = true.
  const [avisarEntrega, setAvisarEntrega] = useState<boolean | null>(null);

  // form de novo vínculo
  const [productId, setProductId] = useState<string>("");
  const [qtdPadrao, setQtdPadrao] = useState("1");
  const [precoAcordado, setPrecoAcordado] = useState("");
  const [frequencia, setFrequencia] = useState(""); // "" | "7" | "15" | "30"

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ customerProfileId: cliente.id });
    return Promise.all([
      apiFetch<ClienteProduto[]>(`/logistica/cliente-produtos?${qs.toString()}`),
      apiFetch<ProdutoOption[]>(`/logistica/produtos`),
      apiFetch<{ id: string; avisarEntrega: boolean }>(`/logistica/cliente/${cliente.id}/aviso`),
    ])
      .then(([vs, ps, av]) => {
        setVinculos(vs || []);
        setProdutos(ps || []);
        setAvisarEntrega(av?.avisarEntrega ?? true);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar.");
      })
      .finally(() => setLoading(false));
  }, [cliente.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar ou trocar de cliente; efeito legítimo, não estado derivado.
  useEffect(() => { load(); }, [load]);

  // Liga/desliga o aviso de entrega deste cliente (PATCH /logistica/cliente/:id/aviso).
  async function toggleAvisar(next: boolean) {
    setAvisarEntrega(next); // otimista
    try {
      await apiFetch(`/logistica/cliente/${cliente.id}/aviso`, {
        method: "PATCH",
        body: JSON.stringify({ avisar: next }),
      });
    } catch (err: unknown) {
      setAvisarEntrega(!next); // reverte
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o aviso.");
    }
  }

  async function addVinculo(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      setError("Escolha um produto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/logistica/cliente-produtos", {
        method: "POST",
        body: JSON.stringify({
          customerProfileId: cliente.id,
          productId: Number(productId),
          qtdPadrao: Math.max(1, Number(qtdPadrao) || 1),
          precoAcordado: precoAcordado.trim() ? Number(precoAcordado) : undefined,
          frequenciaDias: frequencia ? Number(frequencia) : undefined,
        }),
      });
      setProductId("");
      setQtdPadrao("1");
      setPrecoAcordado("");
      setFrequencia("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível vincular o produto.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(cp: ClienteProduto) {
    try {
      await apiFetch(`/logistica/cliente-produtos/${cp.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !cp.ativo }),
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  // Só produtos ainda não vinculados aparecem no seletor.
  const jaVinculados = new Set(vinculos.map((v) => v.productId));
  const disponiveis = produtos.filter((p) => !jaVinculados.has(p.id));

  return (
    <div className="hbx-veil to-bottom" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-drawer-bottom cli-prod" role="dialog" aria-label="Produtos do cliente" aria-modal="true">
        <div className="hbx-drawer-bottom__handle" aria-hidden />

        <div className="cli-prod__head">
          <strong className="cli-prod__title">Produtos do cliente</strong>
          <span className="cli-prod__sub">{cliente.nome || "Cliente"}</span>
        </div>

        {/* M5 — aviso de entrega POR CLIENTE (soma com o global das Regras). */}
        {avisarEntrega !== null && (
          <label className="ctt-toggle cli-prod__aviso">
            <input
              type="checkbox"
              checked={avisarEntrega}
              onChange={(e) => toggleAvisar(e.target.checked)}
            />
            <span>Avisar no WhatsApp quando entregar</span>
          </label>
        )}

        {/* M6 — editor da forma de pagamento (ADMIN) + extrato do cliente. */}
        {admin && <FinanceiroEditor clienteId={cliente.id} />}
        {admin && <ExtratoPanel clienteId={cliente.id} />}

        {/* F0 (28/07) — "por que a entrega desse cliente mudou de dia?" com dia,
            hora e autor. Sem gate de admin: o endpoint também não tem. */}
        <AgendaEventosPanel clienteId={cliente.id} />

        {loading && <p className="cli-prod__muted">Carregando…</p>}
        {error && <p className="hint cli-prod__err">{error}</p>}

        {!loading && vinculos.length > 0 && (
          <div className="cli-prod__list">
            {vinculos.map((cp) => (
              <div className={`cli-prod__row${cp.ativo ? "" : " is-off"}`} key={cp.id}>
                <span className="cli-prod__ico"><I d={ICONS.logistica} size={16} /></span>
                <span className="cli-prod__main">
                  <span className="cli-prod__name">
                    {cp.qtdPadrao}× {cp.produto?.nome || "Produto"}
                    {cp.produto?.unidade ? ` (${cp.produto.unidade})` : ""}
                  </span>
                  <span className="cli-prod__meta">
                    {fmtRecorrencia(cp)}
                    {cp.precoAcordado != null ? `  ·  R$ ${cp.precoAcordado.toFixed(2)}` : ""}
                  </span>
                </span>
                <button type="button" className="btn-ghost btn-xs" onClick={() => toggleAtivo(cp)}>
                  {cp.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && vinculos.length === 0 && (
          <p className="cli-prod__muted">Nenhum produto vinculado ainda. Adicione abaixo.</p>
        )}

        <form className="cli-prod__form" onSubmit={addVinculo}>
          <div className="cli-prod__form-row">
            <select className="field-dark" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Produto">
              <option value="">Produto…</option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.unidade ? ` (${p.unidade})` : ""}
                </option>
              ))}
            </select>
            <input
              className="field-dark cli-prod__qtd"
              type="number"
              min={1}
              value={qtdPadrao}
              onChange={(e) => setQtdPadrao(e.target.value)}
              aria-label="Quantidade padrão"
            />
          </div>
          <div className="cli-prod__form-row">
            <input
              className="field-dark"
              placeholder="Preço acordado (opcional)"
              inputMode="decimal"
              value={precoAcordado}
              onChange={(e) => setPrecoAcordado(e.target.value)}
              aria-label="Preço acordado"
            />
            <select className="field-dark" value={frequencia} onChange={(e) => setFrequencia(e.target.value)} aria-label="Frequência">
              <option value="">Sem recorrência</option>
              <option value="7">Semanal (7 dias)</option>
              <option value="15">Quinzenal (15 dias)</option>
              <option value="30">Mensal (30 dias)</option>
            </select>
          </div>
          <button type="submit" className="btn-teal" disabled={saving || !productId}>
            <I d={ICONS.plus} size={13} /> {saving ? "Adicionando…" : "Adicionar produto"}
          </button>
        </form>

        <button type="button" className="btn-ghost btn-xs cli-prod__close" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

// ── Modal: novo contato/cliente ──────────────────────────────────────────────
function NovoClienteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"pf" | "pj">("pf");
  const [whatsapp, setWhatsapp] = useState("");
  const [cargo, setCargo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [isCliente, setIsCliente] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setError("Informe o nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/nucleo/contas", {
        method: "POST",
        body: JSON.stringify({
          nome: nomeTrim,
          tipo,
          whatsapp: whatsapp.trim() || undefined,
          cargo: cargo.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cidade: cidade.trim() || undefined,
          uf: uf.trim() || undefined,
          isCliente,
        }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={onClose}>
      <form className="hbx-modal ctt-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>
          Novo contato / cliente
          <button type="button" className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>

        <div className="ctt-form__body">
          <div className="f">
            <label htmlFor="ctt-nome">Nome *</label>
            <input
              id="ctt-nome"
              className="field-dark"
              placeholder="Ex.: Dona Maria"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="ctt-tipo">Tipo</label>
              <select
                id="ctt-tipo"
                className="field-dark"
                value={tipo}
                onChange={(e) => setTipo(e.target.value === "pj" ? "pj" : "pf")}
              >
                <option value="pf">Pessoa (PF)</option>
                <option value="pj">Empresa (PJ)</option>
              </select>
            </div>
            <div className="f">
              <label htmlFor="ctt-wa">Telefone / WhatsApp</label>
              <input
                id="ctt-wa"
                className="field-dark"
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <div className="f">
            <label htmlFor="ctt-cargo">Cargo / função (opcional)</label>
            <input
              id="ctt-cargo"
              className="field-dark"
              placeholder="Ex.: Compradora"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
          </div>

          <div className="f">
            <label htmlFor="ctt-end">Endereço (opcional)</label>
            <input
              id="ctt-end"
              className="field-dark"
              placeholder="Rua, número, bairro"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
            />
          </div>

          <div className="ctt-form__row">
            <div className="f">
              <label htmlFor="ctt-cidade">Cidade (opcional)</label>
              <input
                id="ctt-cidade"
                className="field-dark"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>
            <div className="f ctt-form__uf">
              <label htmlFor="ctt-uf">UF</label>
              <input
                id="ctt-uf"
                className="field-dark"
                maxLength={2}
                placeholder="UF"
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <label className="ctt-toggle">
            <input type="checkbox" checked={isCliente} onChange={(e) => setIsCliente(e.target.checked)} />
            <span>É cliente (aparece na aba Clientes)</span>
          </label>

          {error && <p className="hint ctt-form__err">{error}</p>}
        </div>

        <div className="ctt-form__foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-teal" disabled={saving}>
            {saving ? "Salvando…" : "Salvar cadastro"}
          </button>
        </div>
      </form>
    </div>
  );
}

// `clientesOnly` (Logística → Clientes): abre travado na view "Clientes" e
// oculta a troca Contatos | Clientes — a MESMA tela, reusada pela rota /clientes.
export function ContatosClient({ clientesOnly = false }: { clientesOnly?: boolean } = {}) {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const [onlyClientes, setOnlyClientes] = useState(clientesOnly);
  const [contatos, setContatos] = useState<ContatoListResponse>(null);
  const [clientes, setClientes] = useState<ClienteListResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [showNovo, setShowNovo] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<ContextSelection | null>(null);
  const [clienteDetail, setClienteDetail] = useState<ClienteDetail | null>(null);
  const [clienteDetailLoading, setClienteDetailLoading] = useState(false);
  const [clienteDetailError, setClienteDetailError] = useState<string | null>(null);
  const [clienteDetailRevision, setClienteDetailRevision] = useState(0);
  // LOGÍSTICA-MOBILE M2 — cliente com o drawer "Produtos do cliente" aberto.
  const [prodCliente, setProdCliente] = useState<{ id: string; nome: string | null } | null>(null);
  // NÚCLEO-CRM — edição (pessoa ou conta) via PATCH já publicado no backend.
  const [editContato, setEditContato] = useState<ContatoItem | null>(null);
  const [editCliente, setEditCliente] = useState<ClienteItem | null>(null);
  const viewPill = useGlassPill<HTMLButtonElement>(onlyClientes ? "clientes" : "contatos", clientesOnly);

  const load = useCallback((only: boolean, q: string, p: number) => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (q) qs.set("query", q);
    qs.set("page", String(p));
    const path = only ? `/nucleo/clientes?${qs.toString()}` : `/nucleo/contatos?${qs.toString()}`;
    return apiFetch<ContatoListResponse | ClienteListResponse>(path)
      .then((res) => {
        if (only) {
          const next = res as ClienteListResponse;
          setClientes(next);
          setContatos(null);
          setSelected((current) => {
            if (current?.kind !== "cliente") return null;
            const item = next?.items.find((candidate) => candidate.id === current.item.id);
            return item ? { kind: "cliente", item } : null;
          });
        } else {
          const next = res as ContatoListResponse;
          setContatos(next);
          setClientes(null);
          setSelected((current) => {
            if (current?.kind !== "contato") return null;
            const item = next?.items.find((candidate) => candidate.id === current.item.id);
            return item ? { kind: "contato", item } : null;
          });
        }
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar.");
        setContatos(null);
        setClientes(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar ou mudar filtro/página; efeito legítimo, não estado derivado.
  useEffect(() => { load(onlyClientes, query, page); }, [load, onlyClientes, query, page]);

  const selectedClienteId = selected?.kind === "cliente" ? selected.item.id : null;

  // A lista é leve; a ficha completa (locais, telefones e contrato financeiro)
  // só é lida quando o operador realmente seleciona um cliente.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch contextual ao trocar a seleção; guarda evita resposta velha.
  useEffect(() => {
    let alive = true;
    if (!selectedClienteId) {
      setClienteDetail(null);
      setClienteDetailLoading(false);
      setClienteDetailError(null);
      return () => { alive = false; };
    }
    setClienteDetail(null);
    setClienteDetailLoading(true);
    setClienteDetailError(null);
    apiFetch<ClienteDetail>(`/nucleo/clientes/${encodeURIComponent(selectedClienteId)}`)
      .then((detail) => {
        if (!alive) return;
        setClienteDetail(detail);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setClienteDetailError(err instanceof Error ? err.message : "Não foi possível carregar a ficha completa.");
      })
      .finally(() => {
        if (alive) setClienteDetailLoading(false);
      });
    return () => { alive = false; };
  }, [selectedClienteId, clienteDetailRevision]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  function toggleOnly(next: boolean) {
    setOnlyClientes(next);
    setSelected(null);
    setPage(1);
  }

  function afterSaved() {
    setShowNovo(false);
    load(onlyClientes, query, page);
  }

  function afterEdited() {
    setEditContato(null);
    setEditCliente(null);
    setClienteDetailRevision((current) => current + 1);
    load(onlyClientes, query, page);
  }

  const cttItems = contatos?.items || [];
  const cliItems = clientes?.items || [];
  const total = onlyClientes ? (clientes?.total || 0) : (contatos?.total || 0);
  const totalPages = onlyClientes ? (clientes?.totalPages || 1) : (contatos?.totalPages || 1);
  const isEmpty = !loading && !error && (onlyClientes ? cliItems.length === 0 : cttItems.length === 0);

  const main = (
    <section className={"ctt-live" + (onlyClientes ? " is-clientes" : " is-contatos")}>
      <header className="ctt-command">
        <div className="ctt-command__identity">
          <span className="ctt-command__icon"><I d={onlyClientes ? ICONS.empresas : ICONS.users} size={17} /></span>
          <span>
            <strong>{onlyClientes ? "Clientes" : "Contatos"}</strong>
            <small>{total} {onlyClientes ? "clientes" : "pessoas"}</small>
          </span>
        </div>

        {!clientesOnly && (
          <div className="ctt-view-switch glass-pill-track" aria-label="Visualização do cadastro">
            <GlassPill {...viewPill} />
            <button
              type="button"
              ref={viewPill.itemRef("contatos")}
              className={"glass-pill-item" + (!onlyClientes ? " is-active" : "")}
              aria-pressed={!onlyClientes}
              onClick={() => toggleOnly(false)}
            >
              Contatos
            </button>
            <button
              type="button"
              ref={viewPill.itemRef("clientes")}
              className={"glass-pill-item" + (onlyClientes ? " is-active" : "")}
              aria-pressed={onlyClientes}
              onClick={() => toggleOnly(true)}
            >
              Clientes
            </button>
          </div>
        )}

        <form className="ctt-command__form" onSubmit={submitSearch}>
          <input
            className="field-dark emp-search"
            placeholder={onlyClientes ? "Buscar cliente por nome, CNPJ, cidade…" : "Buscar pessoa, cargo, telefone, empresa…"}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
          />
          <button className="btn-teal ctt-command__search" type="submit" aria-label="Buscar cadastro" title="Buscar">
            <I d={ICONS.search} size={13} />
          </button>
        </form>

        <button
          type="button"
          className="btn-ghost ctt-command__new"
          onClick={() => setShowNovo(true)}
          aria-label={onlyClientes ? "Novo cliente" : "Novo cadastro"}
          title={onlyClientes ? "Novo cliente" : "Novo cadastro"}
        >
          <I d={ICONS.plus} size={13} /> <span>{onlyClientes ? "Novo cliente" : "Novo cadastro"}</span>
        </button>

        {/* Em /clientes, a entrada oficial passa pela quarentena da logística.
            Em /contatos, a importação direta existente permanece intacta. */}
        {clientesOnly ? (
          <Link href="/logistica/importar" className="btn-ghost ctt-command__import" title="Importar clientes">
            <I d={ICONS.upload} size={13} /> <span>Importar</span>
          </Link>
        ) : (
          <button type="button" className="btn-ghost ctt-command__import" onClick={() => setShowImport(true)} title="Importar planilha">
            <I d={ICONS.upload} size={13} /> <span>Importar</span>
          </button>
        )}

        <span className={"ctt-command__status" + (loading ? " is-loading" : "")} title={loading ? "Atualizando cadastros" : "Cadastros atualizados"}>
          <i aria-hidden="true" />
        </span>
      </header>

      <div className={"ctt-list-head" + (onlyClientes ? " is-clientes" : " is-contatos")} aria-hidden="true">
        <span>{onlyClientes ? "Cliente" : "Pessoa"}</span>
        <span>{onlyClientes ? "Papéis" : "Relacionamento"}</span>
        <span>{onlyClientes ? "Contatos" : "Papéis"}</span>
      </div>

      <div className="ctt-live__body">

        {error && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Não carregou</strong>
            <span className="emp-empty__text">{error}</span>
            <button className="btn-ghost" onClick={() => load(onlyClientes, query, page)}>Tentar novamente</button>
          </div>
        )}

        {!error && loading && (onlyClientes ? cliItems.length === 0 : cttItems.length === 0) && (
          <div className="ctt-live-skeleton" aria-label="Carregando cadastros" role="status">
            {Array.from({ length: 8 }).map((_, index) => (
              <span className="ctt-live-skeleton__line" key={index} />
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="emp-empty">
            <strong className="emp-empty__title">
              {onlyClientes ? "Nenhum cliente ainda" : "Nenhum contato ainda"}
            </strong>
            <span className="emp-empty__text">
              {onlyClientes
                ? "Marque uma conta como cliente ou cadastre um cliente manual em \"Novo contato/cliente\"."
                : "As pessoas aparecem aqui quando você puxa contas do Radar ou cadastra um contato/cliente manual."}
            </span>
            <button className="btn-teal" onClick={() => setShowNovo(true)}>
              <I d={ICONS.plus} size={13} /> Novo contato/cliente
            </button>
          </div>
        )}

        {/* Lista de PESSOAS (contatos) */}
        {!error && !onlyClientes && cttItems.length > 0 && (
          <div className="emp-list">
            {cttItems.map((c) => {
              const canal = c.whatsapp ? formatBrPhone(c.whatsapp) : c.phone ? formatBrPhone(c.phone) : c.email || "";
              const sub = [c.cargo || "", canal, c.contaNome || ""].filter(Boolean).join("  ·  ");
              const teveConversa = Boolean(c.conversa && c.conversa.mensagens > 0);
              return (
                <div
                  className={`emp-row ctt-row hbx-selectable-row${selected?.kind === "contato" && selected.item.id === c.id ? " is-active" : ""}`}
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected({ kind: "contato", item: c })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected({ kind: "contato", item: c });
                    }
                  }}
                >
                  <span className="emp-row__ico"><I d={ICONS.users} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">
                      {c.nome}
                      {c.isPrincipal && <span className="badge-win ctt-principal">Principal</span>}
                    </span>
                    {sub && <span className="emp-row__sub">{sub}</span>}
                  </span>
                  <span className="ctt-row__signals">
                    <span className="ctt-conv">
                      {teveConversa ? (
                        <span className="ctt-conv__tag is-talk" title={`${c.conversa!.mensagens} mensagem(ns) salva(s)`}>
                          <I d={ICONS.msg} size={11} /> Conversou
                          {c.conversa!.lastMessageAt ? ` · ${fmtRelative(c.conversa!.lastMessageAt)}` : ""}
                        </span>
                      ) : (
                        <span className="ctt-conv__tag is-none">Sem conversa</span>
                      )}
                      {c.finalizado && (
                        <span className="ctt-conv__tag is-done" title={c.finalizadoEm ? `Finalizado ${fmtRelative(c.finalizadoEm)}` : "Finalizado"}>
                          <I d={ICONS.check} size={11} /> {finalizadoLabel(c.finalizadoMotivo)}
                        </span>
                      )}
                    </span>
                    {(c.contaIsCliente || c.contaIsLead || c.contaIsFornecedor) && (
                      <span className="emp-roles">
                        {c.contaIsCliente && <span className="emp-role is-cliente">Cliente</span>}
                        {c.contaIsLead && <span className="emp-role is-lead">Lead</span>}
                        {c.contaIsFornecedor && <span className="emp-role is-fornecedor">Fornecedor</span>}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* View CLIENTES (contas papel=cliente) */}
        {!error && onlyClientes && cliItems.length > 0 && (
          <div className="emp-list">
            {cliItems.map((e) => {
              const sub = localCityUf(e.cidade, e.uf);
              return (
                <div
                  className={`emp-row ctt-row hbx-selectable-row${selected?.kind === "cliente" && selected.item.id === e.id ? " is-active" : ""}`}
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected({ kind: "cliente", item: e })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected({ kind: "cliente", item: e });
                    }
                  }}
                >
                  <span className="emp-row__ico"><I d={ICONS.empresas} size={18} /></span>
                  <span className="emp-row__main">
                    <span className="emp-row__name">{e.name || "(sem nome)"}</span>
                    {sub && <span className="emp-row__sub">{sub}</span>}
                  </span>
                  <span className="emp-row__side">
                    <span className="emp-roles">
                      <span className="emp-role is-cliente">Cliente</span>
                      {e.isLead && <span className="emp-role is-lead">Lead</span>}
                      {e.isFornecedor && <span className="emp-role is-fornecedor">Fornecedor</span>}
                    </span>
                    <span className="emp-row__contacts" title="Contatos">
                      <I d={ICONS.users} size={13} /> {e.contatosCount}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!error && totalPages > 1 && (
        <div className="emp-pager">
          <button className="btn-ghost btn-xs" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </button>
          <span className="emp-pager__info">Página {page} de {totalPages}</span>
          <button className="btn-ghost btn-xs" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Próxima
          </button>
        </div>
      )}
    </section>
  );

  const principalLocal = clienteDetail?.locais.find((item) => item.isPrincipal) || clienteDetail?.locais[0] || null;
  const telefonesValidos = clienteDetail?.telefones.filter((item) => item.whatsapp || item.phone) || [];
  const clienteTemGps = typeof (principalLocal?.lat ?? clienteDetail?.lat) === "number"
    && typeof (principalLocal?.lng ?? clienteDetail?.lng) === "number";
  const pagamentoCliente = clienteDetail
    ? [
        formaPagamentoLabel(clienteDetail.formaPagamento),
        metodoPagamentoLabel(clienteDetail.metodoPadrao),
      ].filter(Boolean).join(" · ")
    : "Carregando…";

  const context = selected?.kind === "contato" ? (
    <>
      <HbxContextHeader
        eyebrow="Contato"
        title="Detalhes do contato"
        subtitle={selected.item.finalizado ? finalizadoLabel(selected.item.finalizadoMotivo) : "Relacionamento ativo"}
        actions={(
          <button type="button" className="icon-ghost" onClick={() => setSelected(null)} aria-label="Fechar detalhes">
            <I d={ICONS.x} size={15} />
          </button>
        )}
      />
      <HbxContextHero
        visual={<I d={ICONS.users} size={20} />}
        title={selected.item.nome}
        subtitle={selected.item.cargo || "Contato"}
        meta={selected.item.contaNome || "Sem empresa vinculada"}
      />
      <HbxContextMetrics>
        <HbxContextMetric
          label="Mensagens"
          value={selected.item.conversa?.mensagens ?? 0}
          hint={selected.item.conversa ? "conversa salva" : "sem conversa"}
        />
        <HbxContextMetric label="Principal" value={selected.item.isPrincipal ? "Sim" : "Não"} />
      </HbxContextMetrics>
      <HbxContextFacts>
        <HbxContextFact label="WhatsApp" value={selected.item.whatsapp ? formatBrPhone(selected.item.whatsapp) : "Não informado"} />
        <HbxContextFact label="Telefone" value={selected.item.phone ? formatBrPhone(selected.item.phone) : "Não informado"} />
        <HbxContextFact label="E-mail" value={selected.item.email || "Não informado"} />
        <HbxContextFact label="Empresa" value={selected.item.contaNome || "Não vinculada"} />
        <HbxContextFact label="Origem" value={selected.item.source || "Não informada"} />
      </HbxContextFacts>
      <div className="hbx-panel-context__actions ctt-context-actions">
        {selected.item.conversa && (
          <Link className="btn-teal" href={`/conversas?conversation=${selected.item.conversa.id}`}>
            <I d={ICONS.msg} size={13} /> Abrir conversa
          </Link>
        )}
        <button type="button" className="btn-ghost" onClick={() => setEditContato(selected.item)}>
          <I d={ICONS.edit} size={13} /> Editar
        </button>
      </div>
    </>
  ) : selected?.kind === "cliente" ? (
    <>
      <HbxContextHeader
        eyebrow="Cliente"
        title="Detalhes do cliente"
        subtitle={clienteDetailLoading ? "Carregando ficha completa…" : clienteDetailError ? "Ficha parcial" : "Cadastro da logística"}
        actions={(
          <button type="button" className="icon-ghost" onClick={() => setSelected(null)} aria-label="Fechar detalhes">
            <I d={ICONS.x} size={15} />
          </button>
        )}
      />
      <HbxContextHero
        visual={<I d={ICONS.empresas} size={20} />}
        title={clienteDetail?.name || selected.item.name || "(sem nome)"}
        subtitle={clienteEndereco(clienteDetail) || localCityUf(selected.item.cidade, selected.item.uf) || "Local não informado"}
        meta={clienteTemGps ? "Pino pronto para a rota" : "Localização precisa de atenção"}
      />
      <HbxContextMetrics>
        <HbxContextMetric
          label="Locais"
          value={clienteDetailLoading ? "…" : clienteDetail?.locais.length ?? 0}
          hint={clienteDetailLoading ? "sincronizando" : principalLocal?.apelido || (principalLocal ? "principal" : "nenhum local")}
        />
        <HbxContextMetric
          label="Telefones"
          value={clienteDetailLoading ? "…" : telefonesValidos.length}
          hint={clienteDetailLoading
            ? "sincronizando"
            : telefonesValidos.length
              ? clienteDetail?.contatoPrincipalId ? "principal definido" : "sem principal"
              : "nenhum telefone"}
        />
        <HbxContextMetric label="GPS" value={clienteDetailLoading ? "…" : clienteTemGps ? "Pronto" : "Revisar"} />
      </HbxContextMetrics>
      <HbxContextFacts>
        <HbxContextFact
          label="WhatsApp"
          value={clienteDetail?.whatsapp ? formatBrPhone(clienteDetail.whatsapp) : clienteDetailLoading ? "Carregando…" : "Não informado"}
        />
        <HbxContextFact label="Endereço" value={clienteEndereco(clienteDetail) || "Não informado"} />
        <HbxContextFact label="Pagamento" value={pagamentoCliente} />
        <HbxContextFact
          label="Fechamento"
          value={clienteDetailLoading ? "Carregando…" : clienteDetail?.diaFechamento ? `Dia ${clienteDetail.diaFechamento}` : "Sem fechamento mensal"}
        />
        <HbxContextFact
          label="Limite fiado"
          value={clienteDetailLoading
            ? "Carregando…"
            : clienteDetail?.limiteFiado != null
              ? `R$ ${Number(clienteDetail.limiteFiado).toFixed(2).replace(".", ",")}`
              : "Não definido"}
        />
        <HbxContextFact
          label="Documento"
          value={clienteDetail?.cnpj || clienteDetail?.document || selected.item.cnpj || "Não informado"}
        />
        <HbxContextFact
          label="Cobrança"
          value={clienteDetailLoading ? "Carregando…" : clienteDetail?.avisarCobranca === false ? "Aviso desligado" : "Aviso ativo"}
        />
      </HbxContextFacts>
      {clienteDetailError && (
        <div className="ctt-client-context__notice is-error" role="status">
          <span>{clienteDetailError}</span>
          <button type="button" className="btn-ghost btn-xs" onClick={() => setClienteDetailRevision((current) => current + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {clienteDetail?.observacoes && (
        <section className="hbx-panel-context__section ctt-client-context__note">
          <strong className="hbx-panel-context__section-title">Observações</strong>
          <p className="hbx-panel-context__muted">{clienteDetail.observacoes}</p>
        </section>
      )}
      <div className="hbx-panel-context__actions ctt-context-actions">
        <button type="button" className="btn-teal" onClick={() => setProdCliente({ id: selected.item.id, nome: selected.item.name })}>
          <I d={ICONS.logistica} size={13} /> Produtos do cliente
        </button>
        <button type="button" className="btn-ghost" onClick={() => setEditCliente(selected.item)}>
          <I d={ICONS.edit} size={13} /> Editar
        </button>
      </div>
    </>
  ) : (
    <HbxContextEmpty
      icon={<I d={onlyClientes ? ICONS.empresas : ICONS.users} size={19} />}
      title={onlyClientes ? "Selecione um cliente" : "Selecione um contato"}
      description="A lista fica no lugar e os dados da seleção aparecem neste painel."
    />
  );

  return (
    <>
      <HbxPanelShell
        variant="context"
        className={"ctt-live-shell" + (onlyClientes ? " is-clientes" : " is-contatos")}
        ariaLabel={onlyClientes ? "Clientes" : "Contatos"}
        contextLabel={onlyClientes ? "Detalhes do cliente" : "Detalhes do contato"}
        main={main}
        context={context}
      />
      {showNovo && <NovoClienteModal onClose={() => setShowNovo(false)} onSaved={afterSaved} />}
      {showImport && (
        <ImportPlanilhaModal
          schema={CONTATOS_IMPORT_SCHEMA}
          onClose={() => setShowImport(false)}
          onImported={() => load(onlyClientes, query, page)}
        />
      )}
      {prodCliente && <ClienteProdutosDrawer cliente={prodCliente} admin={admin} onClose={() => setProdCliente(null)} />}
      {editContato && (
        <EditarContatoModal
          contato={editContato}
          onClose={() => setEditContato(null)}
          onSaved={afterEdited}
        />
      )}
      {editCliente && (
        <EditarContaModal
          conta={{
            id: editCliente.id,
            nome: editCliente.name,
            cidade: editCliente.cidade,
            uf: editCliente.uf,
            isCliente: editCliente.isCliente,
            isLead: editCliente.isLead,
            isFornecedor: editCliente.isFornecedor,
          }}
          onClose={() => setEditCliente(null)}
          onSaved={afterEdited}
        />
      )}
    </>
  );
}
