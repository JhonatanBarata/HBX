"use client";

// ┌────────────────────────────────────────────────────────────────────────────┐
// │  BuscarEmpresas — redesenho /vendas "Buscar empresas" (VENDAS-REFAB, 04/07) │
// │                                                                            │
// │  Consome o CONTRATO NOVO (docs/PLANEJAMENTOS/VENDAS-REFAB/CONTRATO-FILTRO) │
// │  POST /webscraping/radar/cnpj-base/query — base fria RFB (28M), leitura    │
// │  pura. "Disponíveis" (esquerda) = count + sample devolvidos pelo filtro    │
// │  da pessoa. "Puxar" chama POST /webscraping/radar/cnpj-base/pull (contrato │
// │  assumido — o endpoint pode ainda não existir no backend; erro 404 vira    │
// │  toast neutro, nunca um caminho alternativo inventado).                    │
// │                                                                            │
// │  Layout (itens 2/6/7/8 do dono): 1 coluna ESQUERDA = resultados            │
// │  ("Disponíveis"); 1 painel DIREITO ANCORADO (não sai do lugar, não empurra │
// │  layout) com: (a) radar DECORATIVO (mosaico de cor, zero estado/lógica),   │
// │  (b) chips do filtro ATIVO, (c) busca BÁSICA + essenciais, (d) botão       │
// │  "Filtro avançado" → popup com TODOS os campos do contrato (item 4).       │
// │                                                                            │
// │  Zero hex/inline (5 Leis) — todo visual vem de classe/token central        │
// │  (kit.css/screens.css). Popup usa .hbx-veil/.hbx-modal (Lei 2: SEMPRE no   │
// │  centro pela central, nunca reposicionado na tela).                       │
// └────────────────────────────────────────────────────────────────────────────┘

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { apiFetch, type ApiError } from "@/lib/api";
import { BRAZIL_UF_OPTIONS } from "@/lib/brazil-cities";

// ── Contrato (CONTRATO-FILTRO.md) ───────────────────────────────────────────

type ContatoFiltro = {
  comEmail?: boolean;
  comTelefone?: boolean;
  comCelular?: boolean;
  maxPhoneShare?: number;
  maxEmailShare?: number;
  blocklistEmail?: boolean;
};

type CnpjBaseQueryInput = {
  cities?: string[];
  states?: string[];
  ddd?: string;
  cnaes?: string[];
  cnaePrincipalOnly?: boolean;
  keyword?: string;
  situacoes?: string[];
  porte?: string[];
  naturezas?: string[];
  matrizFilial?: string[];
  mei?: boolean;
  simples?: boolean;
  capitalMin?: number;
  capitalMax?: number;
  abertaDe?: string;
  abertaAte?: string;
  idadeMinAnos?: number;
  idadeMaxAnos?: number;
  donoConhecido?: boolean;
  ownerNameKeyword?: string;
  ownerQualifications?: string[];
  contato?: ContatoFiltro;
  excluirJaEntregues?: boolean;
  limit?: number;
  cursor?: string | null;
};

type CnpjBaseSampleRow = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
  porte: string | null;
  situacao: string;
  matrizFilial: string | null;
  capitalSocial: string | null;
  naturezaJuridica: string | null;
  simples: boolean | null;
  mei: boolean | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  website: string | null;
  openedAt: string | null;
  firstSeenAt: string | null;
  phoneShareCount: number | null;
  emailShareCount: number | null;
  ownerName: string | null;
  ownerQualification: string | null;
  selo: "whatsapp_validado" | "celular_provavel" | "fixo" | "provavel_contador" | "sem_contato";
};

type CnpjBaseQueryResponse = {
  count: number;
  sample: CnpjBaseSampleRow[];
  cursorNext: string | null;
  statsAmostra?: { total: number; comCelularProprio: number; provavelContador: number };
  excludedJaEntregues?: number;
};

const SELO_META: Record<CnpjBaseSampleRow["selo"], { label: string; tone: "hot" | "warn" | "muted" | "danger" }> = {
  whatsapp_validado: { label: "WhatsApp validado", tone: "hot" },
  celular_provavel: { label: "Celular provável", tone: "warn" },
  fixo: { label: "Só fixo", tone: "muted" },
  provavel_contador: { label: "Provável contador", tone: "danger" },
  sem_contato: { label: "Sem contato", tone: "muted" },
};

// Opções fixas RFB (valores reais do dataset — não inventadas; livres de digitar
// também, o backend normaliza situacao para minúsculo).
const SITUACAO_OPTIONS = [
  { value: "ativa", label: "Ativa" },
  { value: "baixada", label: "Baixada" },
  { value: "inapta", label: "Inapta" },
  { value: "suspensa", label: "Suspensa" },
  { value: "nula", label: "Nula" },
];
const PORTE_OPTIONS = [
  { value: "ME", label: "Microempresa (ME)" },
  { value: "EPP", label: "Pequeno porte (EPP)" },
  { value: "DEMAIS", label: "Demais (médio/grande)" },
];
const MATRIZ_FILIAL_OPTIONS = [
  { value: "MATRIZ", label: "Matriz" },
  { value: "FILIAL", label: "Filial" },
];

function fmtInt(n: number | null | undefined) {
  return Number(n || 0).toLocaleString("pt-BR");
}

function fmtCapital(v: string | null): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCnpj(raw: string | null): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 14) return raw || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

// ── Filtro em memória → snapshot serializável (chips + query) ──────────────

type FiltroState = {
  keyword: string;
  states: string[];
  cities: string[];
  ddd: string;
  cnaes: string[];
  cnaePrincipalOnly: boolean;
  situacoes: string[];
  porte: string[];
  naturezas: string[];
  matrizFilial: string[];
  mei: boolean | null;
  simples: boolean | null;
  capitalMin: string;
  capitalMax: string;
  idadeMinAnos: string;
  idadeMaxAnos: string;
  donoConhecido: boolean | null;
  ownerNameKeyword: string;
  ownerQualifications: string[];
  comEmail: boolean | null;
  comTelefone: boolean | null;
  comCelular: boolean | null;
  maxPhoneShare: string;
  maxEmailShare: string;
  blocklistEmail: boolean | null;
};

const FILTRO_VAZIO: FiltroState = {
  keyword: "", states: [], cities: [], ddd: "",
  cnaes: [], cnaePrincipalOnly: false,
  situacoes: [], porte: [], naturezas: [], matrizFilial: [],
  mei: null, simples: null, capitalMin: "", capitalMax: "",
  idadeMinAnos: "", idadeMaxAnos: "",
  donoConhecido: null, ownerNameKeyword: "", ownerQualifications: [],
  comEmail: null, comTelefone: null, comCelular: null,
  maxPhoneShare: "", maxEmailShare: "", blocklistEmail: null,
};

function buildQueryInput(f: FiltroState, cursor: string | null): CnpjBaseQueryInput {
  const input: CnpjBaseQueryInput = { limit: 20, excluirJaEntregues: true };
  if (cursor) input.cursor = cursor;
  if (f.keyword.trim()) input.keyword = f.keyword.trim();
  if (f.states.length) input.states = f.states;
  if (f.cities.length) input.cities = f.cities;
  if (f.ddd.trim()) input.ddd = f.ddd.trim();
  if (f.cnaes.length) input.cnaes = f.cnaes;
  if (f.cnaePrincipalOnly) input.cnaePrincipalOnly = true;
  if (f.situacoes.length) input.situacoes = f.situacoes;
  if (f.porte.length) input.porte = f.porte;
  if (f.naturezas.length) input.naturezas = f.naturezas;
  if (f.matrizFilial.length) input.matrizFilial = f.matrizFilial;
  if (f.mei != null) input.mei = f.mei;
  if (f.simples != null) input.simples = f.simples;
  const capMin = Number(f.capitalMin);
  const capMax = Number(f.capitalMax);
  if (f.capitalMin.trim() && Number.isFinite(capMin)) input.capitalMin = capMin;
  if (f.capitalMax.trim() && Number.isFinite(capMax)) input.capitalMax = capMax;
  const idMin = Number(f.idadeMinAnos);
  const idMax = Number(f.idadeMaxAnos);
  if (f.idadeMinAnos.trim() && Number.isFinite(idMin)) input.idadeMinAnos = idMin;
  if (f.idadeMaxAnos.trim() && Number.isFinite(idMax)) input.idadeMaxAnos = idMax;
  if (f.donoConhecido != null) input.donoConhecido = f.donoConhecido;
  if (f.ownerNameKeyword.trim()) input.ownerNameKeyword = f.ownerNameKeyword.trim();
  if (f.ownerQualifications.length) input.ownerQualifications = f.ownerQualifications;
  const contato: ContatoFiltro = {};
  if (f.comEmail != null) contato.comEmail = f.comEmail;
  if (f.comTelefone != null) contato.comTelefone = f.comTelefone;
  if (f.comCelular != null) contato.comCelular = f.comCelular;
  const maxPhone = Number(f.maxPhoneShare);
  const maxEmail = Number(f.maxEmailShare);
  if (f.maxPhoneShare.trim() && Number.isFinite(maxPhone)) contato.maxPhoneShare = maxPhone;
  if (f.maxEmailShare.trim() && Number.isFinite(maxEmail)) contato.maxEmailShare = maxEmail;
  if (f.blocklistEmail != null) contato.blocklistEmail = f.blocklistEmail;
  if (Object.keys(contato).length) input.contato = contato;
  return input;
}

// Chips legíveis do filtro ativo (item: "Filtros ATIVOS" no painel direito).
function buildChips(f: FiltroState): string[] {
  const chips: string[] = [];
  if (f.keyword.trim()) chips.push(`"${f.keyword.trim()}"`);
  if (f.states.length) chips.push(f.states.join("/"));
  if (f.cities.length) chips.push(f.cities.join(", "));
  if (f.ddd.trim()) chips.push(`DDD ${f.ddd.trim()}`);
  if (f.cnaes.length) chips.push(`CNAE ${f.cnaes.join(", ")}`);
  if (f.situacoes.length) chips.push(f.situacoes.map(s => SITUACAO_OPTIONS.find(o => o.value === s)?.label || s).join(", "));
  if (f.porte.length) chips.push(f.porte.map(p => PORTE_OPTIONS.find(o => o.value === p)?.label || p).join(", "));
  if (f.naturezas.length) chips.push(`Natureza: ${f.naturezas.join(", ")}`);
  if (f.matrizFilial.length) chips.push(f.matrizFilial.map(m => MATRIZ_FILIAL_OPTIONS.find(o => o.value === m)?.label || m).join(" + "));
  if (f.mei === true) chips.push("MEI");
  if (f.mei === false) chips.push("Não MEI");
  if (f.simples === true) chips.push("Simples");
  if (f.simples === false) chips.push("Fora do Simples");
  if (f.capitalMin.trim() || f.capitalMax.trim()) {
    chips.push(`Capital ${f.capitalMin.trim() ? `≥ ${f.capitalMin}` : ""}${f.capitalMin.trim() && f.capitalMax.trim() ? " · " : ""}${f.capitalMax.trim() ? `≤ ${f.capitalMax}` : ""}`);
  }
  if (f.idadeMinAnos.trim() || f.idadeMaxAnos.trim()) {
    chips.push(`Idade ${f.idadeMinAnos.trim() ? `≥ ${f.idadeMinAnos}a` : ""}${f.idadeMinAnos.trim() && f.idadeMaxAnos.trim() ? " · " : ""}${f.idadeMaxAnos.trim() ? `≤ ${f.idadeMaxAnos}a` : ""}`);
  }
  if (f.donoConhecido === true) chips.push("Dono conhecido");
  if (f.ownerNameKeyword.trim()) chips.push(`Sócio "${f.ownerNameKeyword.trim()}"`);
  if (f.ownerQualifications.length) chips.push(`Cargo: ${f.ownerQualifications.join(", ")}`);
  if (f.comEmail === true) chips.push("Com e-mail");
  if (f.comTelefone === true) chips.push("Com telefone");
  if (f.comCelular === true) chips.push("Com celular");
  if (f.blocklistEmail) chips.push("Sem e-mail de contador");
  return chips;
}

// ── Radar DECORATIVO (item 8): mosaico de cores, ZERO estado/lógica por trás.
// Reaproveita a paleta dos estados antigos (funcionando/pausado/parado) só
// como cores do mosaico — nenhum dos dois vira "estado" aqui; é decoração pura,
// pinta uma vez e nunca muda por causa de dado.
const MOSAIC_TONES = ["m-a", "m-b", "m-c", "m-d", "m-e"] as const;
function mosaicSeed(n: number) {
  return MOSAIC_TONES[Math.abs(n) % MOSAIC_TONES.length];
}
function RadarMosaic() {
  const cells = useMemo(() => Array.from({ length: 24 }, (_, i) => mosaicSeed(i * 7 + 3)), []);
  return (
    <div className="be-mosaic" aria-hidden="true">
      {cells.map((tone, i) => (
        <span key={i} className={`be-mosaic__cell be-mosaic__cell--${tone}`} />
      ))}
    </div>
  );
}

// ── Popup Filtro Avançado (item 4) ──────────────────────────────────────────

function ChipMultiSelect({
  options, value, onChange, placeholder,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  }
  return (
    <div className="be-chipset" role="group" aria-label={placeholder}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={"be-chipset__opt" + (value.includes(o.value) ? " is-on" : "")}
          aria-pressed={value.includes(o.value)}
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TriState({ value, onChange, labelOn = "Sim", labelOff = "Não" }: { value: boolean | null; onChange: (v: boolean | null) => void; labelOn?: string; labelOff?: string }) {
  return (
    <div className="be-tristate" role="group">
      <button type="button" className={"be-tristate__opt" + (value == null ? " is-on" : "")} aria-pressed={value == null} onClick={() => onChange(null)}>Qualquer</button>
      <button type="button" className={"be-tristate__opt" + (value === true ? " is-on" : "")} aria-pressed={value === true} onClick={() => onChange(true)}>{labelOn}</button>
      <button type="button" className={"be-tristate__opt" + (value === false ? " is-on" : "")} aria-pressed={value === false} onClick={() => onChange(false)}>{labelOff}</button>
    </div>
  );
}

function FiltroAvancadoModal({
  draft, onChange, onClose, onApply,
}: {
  draft: FiltroState;
  onChange: (next: FiltroState) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  function patch(p: Partial<FiltroState>) { onChange({ ...draft, ...p }); }
  const [cidadesTxt, setCidadesTxt] = useState(draft.cities.join(", "));
  const [cnaesTxt, setCnaesTxt] = useState(draft.cnaes.join(", "));
  const [naturezasTxt, setNaturezasTxt] = useState(draft.naturezas.join(", "));
  const [qualifTxt, setQualifTxt] = useState(draft.ownerQualifications.join(", "));

  function commitListField(raw: string, field: "cities" | "cnaes" | "naturezas" | "ownerQualifications") {
    const list = raw.split(",").map(s => s.trim()).filter(Boolean);
    patch({ [field]: list } as Partial<FiltroState>);
  }

  return (
    <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-modal be-adv-modal" onClick={e => e.stopPropagation()}>
        <h3>
          Filtro avançado
          <span className="x" role="button" tabIndex={0} aria-label="Fechar" onClick={onClose} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClose(); }}>
            <I d={ICONS.x} size={16} />
          </span>
        </h3>
        <div className="be-adv-body">
          <section className="be-adv-sec">
            <h4>Localização</h4>
            <div className="be-adv-grid2">
              <div className="f">
                <label>UF</label>
                <ChipMultiSelect
                  options={BRAZIL_UF_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                  value={draft.states}
                  onChange={v => patch({ states: v })}
                  placeholder="Estado"
                />
              </div>
              <div className="f">
                <label htmlFor="be-ddd">DDD</label>
                <input id="be-ddd" className="field-dark" value={draft.ddd} maxLength={2} placeholder="Ex.: 11"
                  onChange={e => patch({ ddd: e.target.value.replace(/\D/g, "") })} />
              </div>
            </div>
            <div className="f">
              <label htmlFor="be-cities">Cidade(s)</label>
              <input id="be-cities" className="field-dark" value={cidadesTxt} placeholder="Separe por vírgula — ex.: Fortaleza, Maracanaú"
                onChange={e => setCidadesTxt(e.target.value)}
                onBlur={() => commitListField(cidadesTxt, "cities")} />
            </div>
          </section>

          <section className="be-adv-sec">
            <h4>Segmento (CNAE)</h4>
            <div className="f">
              <label htmlFor="be-cnaes">Código(s) CNAE</label>
              <input id="be-cnaes" className="field-dark" value={cnaesTxt} placeholder="Separe por vírgula — ex.: 4711-3/02"
                onChange={e => setCnaesTxt(e.target.value)}
                onBlur={() => commitListField(cnaesTxt, "cnaes")} />
            </div>
            <label className="be-check">
              <input type="checkbox" checked={draft.cnaePrincipalOnly} onChange={e => patch({ cnaePrincipalOnly: e.target.checked })} />
              Só bate no CNAE principal (padrão: principal ou secundário)
            </label>
          </section>

          <section className="be-adv-sec">
            <h4>Características da empresa</h4>
            <div className="f">
              <label>Situação cadastral</label>
              <ChipMultiSelect options={SITUACAO_OPTIONS} value={draft.situacoes} onChange={v => patch({ situacoes: v })} placeholder="Situação" />
            </div>
            <div className="f">
              <label>Porte</label>
              <ChipMultiSelect options={PORTE_OPTIONS} value={draft.porte} onChange={v => patch({ porte: v })} placeholder="Porte" />
            </div>
            <div className="f">
              <label>Matriz / Filial</label>
              <ChipMultiSelect options={MATRIZ_FILIAL_OPTIONS} value={draft.matrizFilial} onChange={v => patch({ matrizFilial: v })} placeholder="Matriz ou filial" />
            </div>
            <div className="f">
              <label htmlFor="be-naturezas">Natureza jurídica</label>
              <input id="be-naturezas" className="field-dark" value={naturezasTxt} placeholder="Separe por vírgula — ex.: Sociedade Empresária Limitada"
                onChange={e => setNaturezasTxt(e.target.value)}
                onBlur={() => commitListField(naturezasTxt, "naturezas")} />
            </div>
            <div className="be-adv-grid2">
              <div className="f">
                <label>MEI</label>
                <TriState value={draft.mei} onChange={v => patch({ mei: v })} />
              </div>
              <div className="f">
                <label>Simples Nacional</label>
                <TriState value={draft.simples} onChange={v => patch({ simples: v })} />
              </div>
            </div>
            <div className="be-adv-grid2">
              <div className="f">
                <label htmlFor="be-cap-min">Capital social mín. (R$)</label>
                <input id="be-cap-min" className="field-dark" inputMode="numeric" value={draft.capitalMin}
                  onChange={e => patch({ capitalMin: e.target.value.replace(/[^\d]/g, "") })} />
              </div>
              <div className="f">
                <label htmlFor="be-cap-max">Capital social máx. (R$)</label>
                <input id="be-cap-max" className="field-dark" inputMode="numeric" value={draft.capitalMax}
                  onChange={e => patch({ capitalMax: e.target.value.replace(/[^\d]/g, "") })} />
              </div>
            </div>
            <div className="be-adv-grid2">
              <div className="f">
                <label htmlFor="be-idade-min">Idade mín. (anos)</label>
                <input id="be-idade-min" className="field-dark" inputMode="numeric" value={draft.idadeMinAnos}
                  onChange={e => patch({ idadeMinAnos: e.target.value.replace(/[^\d]/g, "") })} />
              </div>
              <div className="f">
                <label htmlFor="be-idade-max">Idade máx. (anos)</label>
                <input id="be-idade-max" className="field-dark" inputMode="numeric" value={draft.idadeMaxAnos}
                  onChange={e => patch({ idadeMaxAnos: e.target.value.replace(/[^\d]/g, "") })} />
              </div>
            </div>
          </section>

          <section className="be-adv-sec">
            <h4>Sócio / dono</h4>
            <label className="be-check">
              <input type="checkbox" checked={draft.donoConhecido === true} onChange={e => patch({ donoConhecido: e.target.checked ? true : null })} />
              Só empresas com sócio identificado
            </label>
            <div className="f">
              <label htmlFor="be-owner-kw">Nome do sócio contém</label>
              <input id="be-owner-kw" className="field-dark" value={draft.ownerNameKeyword}
                onChange={e => patch({ ownerNameKeyword: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="be-owner-qual">Cargo/qualificação (ex.: Sócio-Administrador)</label>
              <input id="be-owner-qual" className="field-dark" value={qualifTxt} placeholder="Separe por vírgula"
                onChange={e => setQualifTxt(e.target.value)}
                onBlur={() => commitListField(qualifTxt, "ownerQualifications")} />
            </div>
          </section>

          <section className="be-adv-sec">
            <h4>Contato / anti-contador</h4>
            <div className="be-adv-grid2">
              <div className="f">
                <label>Tem e-mail</label>
                <TriState value={draft.comEmail} onChange={v => patch({ comEmail: v })} />
              </div>
              <div className="f">
                <label>Tem telefone</label>
                <TriState value={draft.comTelefone} onChange={v => patch({ comTelefone: v })} />
              </div>
            </div>
            <div className="f">
              <label>Tem celular</label>
              <TriState value={draft.comCelular} onChange={v => patch({ comCelular: v })} />
            </div>
            <div className="be-adv-grid2">
              <div className="f">
                <label htmlFor="be-max-phone">Telefone compartilhado por até N empresas</label>
                <input id="be-max-phone" className="field-dark" inputMode="numeric" placeholder="padrão: 3" value={draft.maxPhoneShare}
                  onChange={e => patch({ maxPhoneShare: e.target.value.replace(/[^\d]/g, "") })} />
              </div>
              <div className="f">
                <label htmlFor="be-max-email">E-mail compartilhado por até N empresas</label>
                <input id="be-max-email" className="field-dark" inputMode="numeric" placeholder="padrão: 3" value={draft.maxEmailShare}
                  onChange={e => patch({ maxEmailShare: e.target.value.replace(/[^\d]/g, "") })} />
              </div>
            </div>
            <label className="be-check">
              <input type="checkbox" checked={draft.blocklistEmail === true} onChange={e => patch({ blocklistEmail: e.target.checked ? true : null })} />
              Excluir e-mails de escritório de contabilidade
            </label>
          </section>
        </div>
        <div className="vnd-popup__foot">
          <button type="button" className="btn-ghost" onClick={() => onChange(FILTRO_VAZIO)}>Limpar tudo</button>
          <button type="button" className="btn-teal" onClick={onApply}>Aplicar filtro</button>
        </div>
      </div>
    </div>
  );
}

// ── Mapeia CnpjBaseSampleRow → NegocioDetail (mesmo card de detalhe do resto do app) ──

function toNegocioDetail(row: CnpjBaseSampleRow): NegocioDetail {
  return {
    id: row.cnpj,
    name: row.nomeFantasia || row.razaoSocial,
    phone: row.phone || row.phone2 || null,
    email: row.email,
    website: row.website,
    cnpj: row.cnpj,
    cnae: row.cnae,
    razaoSocial: row.razaoSocial,
    ownerName: row.ownerName,
    companySituation: row.situacao,
    city: row.city,
    state: row.state,
    segment: row.cnaeDescription,
    statusLabel: SELO_META[row.selo]?.label ?? null,
    createdAt: row.firstSeenAt,
    sourceType: "cnpj_base",
    primarySource: "receita_federal",
  };
}

// ── Componente principal ─────────────────────────────────────────────────────

export function BuscarEmpresas({ onLeadPulled, onCountChange }: { onLeadPulled?: (focus?: boolean) => void; onCountChange?: (count: number | null) => void } = {}) {
  const [filtro, setFiltro] = useState<FiltroState>(FILTRO_VAZIO);
  const [advDraft, setAdvDraft] = useState<FiltroState>(FILTRO_VAZIO);
  const [advOpen, setAdvOpen] = useState(false);

  const [resp, setResp] = useState<CnpjBaseQueryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIdx, setPageIdx] = useState(0);

  const [selRow, setSelRow] = useState<CnpjBaseSampleRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pullBusyId, setPullBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuery = useCallback((f: FiltroState, cursor: string | null) => {
    setLoading(true);
    setLoadError(null);
    return apiFetch<CnpjBaseQueryResponse>("/webscraping/radar/cnpj-base/query", {
      method: "POST",
      body: JSON.stringify(buildQueryInput(f, cursor)),
    })
      .then(res => { setResp(res); onCountChange?.(typeof res?.count === "number" ? res.count : null); })
      .catch((err: unknown) => {
        setResp(null);
        onCountChange?.(null);
        setLoadError(err instanceof Error ? err.message : "Falha ao consultar a base de empresas.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // setState síncrono no corpo do effect é erro de lint neste repo (react-hooks/
  // set-state-in-effect) — a 1ª busca dispara via rAF, mesmo padrão do resto do app.
  useEffect(() => {
    const id = requestAnimationFrame(() => { void runQuery(filtro, null); });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca básica com debounce (caixa de busca livre estilo site famoso).
  function onKeywordChange(v: string) {
    setFiltro(prev => ({ ...prev, keyword: v }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFiltro(cur => {
        const next = { ...cur, keyword: v };
        setCursorStack([null]);
        setPageIdx(0);
        setSelected(new Set());
        void runQuery(next, null);
        return next;
      });
    }, 380);
  }

  function applyBasicField(patch: Partial<FiltroState>) {
    setFiltro(prev => {
      const next = { ...prev, ...patch };
      setCursorStack([null]);
      setPageIdx(0);
      setSelected(new Set());
      void runQuery(next, null);
      return next;
    });
  }

  function abrirAvancado() {
    setAdvDraft(filtro);
    setAdvOpen(true);
  }
  function aplicarAvancado() {
    setFiltro(advDraft);
    setAdvOpen(false);
    setCursorStack([null]);
    setPageIdx(0);
    setSelected(new Set());
    void runQuery(advDraft, null);
  }
  function limparTudo() {
    setFiltro(FILTRO_VAZIO);
    setCursorStack([null]);
    setPageIdx(0);
    setSelected(new Set());
    void runQuery(FILTRO_VAZIO, null);
  }

  function proximaPagina() {
    const next = resp?.cursorNext ?? null;
    if (!next) return;
    const stack = [...cursorStack.slice(0, pageIdx + 1), next];
    setCursorStack(stack);
    setPageIdx(pageIdx + 1);
    void runQuery(filtro, next);
  }
  function paginaAnterior() {
    if (pageIdx === 0) return;
    const prevIdx = pageIdx - 1;
    setPageIdx(prevIdx);
    void runQuery(filtro, cursorStack[prevIdx]);
  }

  function toggleSel(cnpj: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cnpj)) next.delete(cnpj); else next.add(cnpj);
      return next;
    });
  }

  // "Puxar": chama o contrato assumido POST cnpj-base/pull. Erro de cota vira
  // mensagem NEUTRA (nunca valor/cobrança); 404 (endpoint ainda não ligado no
  // backend) também vira toast neutro — não inventa caminho alternativo.
  async function puxar(cnpj: string) {
    if (pullBusyId || bulkBusy) return;
    setPullBusyId(cnpj);
    setPullMsg(null);
    try {
      await apiFetch("/webscraping/radar/cnpj-base/pull", {
        method: "POST",
        body: JSON.stringify({ cnpj }),
      });
      setPullMsg("✓ Empresa puxada pro seu funil.");
      if (selRow?.cnpj === cnpj) setSelRow(null);
      setSelected(prev => { const n = new Set(prev); n.delete(cnpj); return n; });
      onLeadPulled?.(true);
      void runQuery(filtro, cursorStack[pageIdx]);
    } catch (err) {
      const e = err as ApiError & { status?: number };
      setPullMsg(e?.status === 402 || e?.status === 409
        ? "Cota da empresa atingida."
        : e?.status === 404
          ? "Puxar ainda não está disponível — tente novamente em instantes."
          : (err instanceof Error ? err.message : "Não consegui puxar esta empresa."));
    } finally {
      setPullBusyId(null);
    }
  }

  async function puxarSelecionados() {
    if (bulkBusy || selected.size === 0) return;
    setBulkBusy(true);
    setPullMsg(null);
    let ok = 0;
    let stop: string | null = null;
    for (const cnpj of Array.from(selected)) {
      try {
        await apiFetch("/webscraping/radar/cnpj-base/pull", { method: "POST", body: JSON.stringify({ cnpj }) });
        ok++;
      } catch (err) {
        const e = err as ApiError & { status?: number };
        if (e?.status === 402 || e?.status === 409) { stop = "Cota da empresa atingida."; break; }
        if (e?.status === 404) { stop = "Puxar ainda não está disponível — tente novamente em instantes."; break; }
      }
    }
    setSelected(new Set());
    setPullMsg(stop || `✓ ${ok} empresa${ok === 1 ? "" : "s"} puxada${ok === 1 ? "" : "s"} pro seu funil.`);
    if (ok > 0) onLeadPulled?.(true);
    setBulkBusy(false);
    void runQuery(filtro, cursorStack[pageIdx]);
  }

  const chips = useMemo(() => buildChips(filtro), [filtro]);
  const sample = resp?.sample ?? [];
  const count = resp?.count ?? 0;

  return (
    <div className="be-root">
      {/* ESQUERDA — resultados ("Disponíveis" = count + sample do filtro) */}
      <section className="panel be-results" data-tut="buscar-resultados">
        <div className="panel-head">
          <h2>Disponíveis <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>{fmtInt(count)} empresa{count === 1 ? "" : "s"}</span></h2>
          <div className="meta">
            {selected.size > 0 && (
              <button className="btn-teal btn-xs" onClick={puxarSelecionados} disabled={bulkBusy}>
                {bulkBusy ? "Puxando…" : `Puxar selecionados (${selected.size})`}
              </button>
            )}
            {resp?.excludedJaEntregues ? (
              <span className="be-hint">{fmtInt(resp.excludedJaEntregues)} já entregue{resp.excludedJaEntregues === 1 ? "" : "s"} escondido{resp.excludedJaEntregues === 1 ? "" : "s"}</span>
            ) : null}
          </div>
        </div>

        {loadError && <div className="be-error">{loadError}</div>}
        {pullMsg && <div className={pullMsg.startsWith("✓") ? "vnd-msg-ok" : "vnd-msg-err"} style={{ padding: "8px 16px 0" }}>{pullMsg}</div>}

        {!loadError && !loading && sample.length === 0 && (
          <div className="be-empty">
            <h3>Nenhuma empresa com este filtro</h3>
            <p>Ajuste a busca básica ou abra o filtro avançado.</p>
          </div>
        )}

        {sample.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Empresa</th>
                  <th>Cidade/UF</th>
                  <th>CNAE</th>
                  <th>Contato</th>
                  <th>Selo</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {sample.map(row => {
                  const selo = SELO_META[row.selo];
                  return (
                    <tr key={row.cnpj} className={selRow?.cnpj === row.cnpj ? "sel" : ""} onClick={() => setSelRow(row)} style={{ cursor: "pointer" }}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(row.cnpj)} onChange={() => toggleSel(row.cnpj)} aria-label={`Selecionar ${row.razaoSocial}`} />
                      </td>
                      <td>
                        <div className="co">
                          <strong>{row.nomeFantasia || row.razaoSocial}</strong>
                          <div className="sub2">{fmtCnpj(row.cnpj)}</div>
                        </div>
                      </td>
                      <td>{row.city ? `${row.city}/${row.state || "—"}` : "—"}</td>
                      <td><span className="nowrap-cell" title={row.cnaeDescription || ""} style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis" }}>{row.cnaeDescription || row.cnae || "—"}</span></td>
                      <td>{row.phone || row.email || "—"}</td>
                      <td>{selo && <span className={"tag" + (selo.tone === "hot" ? " teal" : selo.tone === "danger" ? " red" : selo.tone === "warn" ? " warn" : "")}>{selo.label}</span>}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn-ghost btn-xs" data-tut="buscar-puxar" onClick={() => puxar(row.cnpj)} disabled={pullBusyId === row.cnpj || bulkBusy}>
                          {pullBusyId === row.cnpj ? "…" : "Puxar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sample.length > 0 && (
          <div className="be-pager">
            <button className="btn-ghost btn-xs" onClick={paginaAnterior} disabled={pageIdx === 0 || loading}>‹ Anterior</button>
            <span className="sub2">Página {pageIdx + 1}</span>
            <button className="btn-ghost btn-xs" onClick={proximaPagina} disabled={!resp?.cursorNext || loading}>Próxima ›</button>
          </div>
        )}
      </section>

      {/* DIREITA — painel ÚNICO ANCORADO (item 7): radar decorativo + chips + básico + avançado */}
      <aside className="be-side" data-tut="vendas-busca-painel">
        <div className="be-side-scroll">
          <RadarMosaic />

          {chips.length > 0 && (
            <div className="be-active-filters">
              <span className="be-active-filters__lbl">Filtrando por</span>
              <div className="be-chips-row">
                {chips.map((c, i) => <span key={i} className="tag">{c}</span>)}
                <button className="btn-ghost btn-xs" onClick={limparTudo}>Limpar</button>
              </div>
            </div>
          )}

          <div className="be-basic">
            <div className="be-search" data-tut="buscar-busca">
              <I d={ICONS.search} size={16} />
              <input
                className="be-search__input"
                placeholder="O que você procura? Ex.: restaurantes em São Paulo com WhatsApp"
                value={filtro.keyword}
                onChange={e => onKeywordChange(e.target.value)}
              />
            </div>

            <div className="be-basic-grid">
              <div className="f">
                <label htmlFor="be-basic-uf">Estado</label>
                <select id="be-basic-uf" className="select-dark" value={filtro.states[0] || ""} onChange={e => applyBasicField({ states: e.target.value ? [e.target.value] : [] })}>
                  <option value="">Qualquer</option>
                  {BRAZIL_UF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label htmlFor="be-basic-cidade">Cidade</label>
                <input id="be-basic-cidade" className="field-dark" value={filtro.cities[0] || ""} placeholder="Ex.: Fortaleza"
                  onChange={e => setFiltro(prev => ({ ...prev, cities: e.target.value ? [e.target.value] : [] }))}
                  onBlur={e => applyBasicField({ cities: e.target.value ? [e.target.value] : [] })} />
              </div>
            </div>

            <div className="f">
              <label htmlFor="be-basic-seg">Segmento (palavra-chave)</label>
              <input id="be-basic-seg" className="field-dark" value={filtro.keyword} placeholder="Ex.: restaurante, contabilidade, farmácia"
                onChange={e => onKeywordChange(e.target.value)} />
            </div>

            <div className="f">
              <label>Tem WhatsApp</label>
              <TriState value={filtro.comCelular} onChange={v => applyBasicField({ comCelular: v })} labelOn="Sim" labelOff="Sem preferência" />
            </div>

            <button type="button" className="btn-ghost be-adv-open" data-tut="buscar-avancado" onClick={abrirAvancado}>
              <I d={ICONS.filter} size={14} /> Filtro avançado
            </button>
          </div>
        </div>
      </aside>

      {advOpen && (
        <FiltroAvancadoModal
          draft={advDraft}
          onChange={setAdvDraft}
          onClose={() => setAdvOpen(false)}
          onApply={aplicarAvancado}
        />
      )}

      {selRow && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setSelRow(null); }}>
          <div className="hbx-modal be-detail-modal" onClick={e => e.stopPropagation()}>
            <DetalhesNegocio
              detail={toNegocioDetail(selRow)}
              title="Detalhes da empresa"
              onClose={() => setSelRow(null)}
              actions={
                <button className="btn-teal fv-open-cta" onClick={() => puxar(selRow.cnpj)} disabled={pullBusyId === selRow.cnpj}>
                  <span className="fv-open-cta-txt"><b>{pullBusyId === selRow.cnpj ? "Puxando…" : "Puxar pro funil"}</b></span>
                </button>
              }
            />
            {fmtCapital(selRow.capitalSocial) && (
              <p className="sub2" style={{ padding: "0 20px 16px" }}>Capital social: {fmtCapital(selRow.capitalSocial)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
