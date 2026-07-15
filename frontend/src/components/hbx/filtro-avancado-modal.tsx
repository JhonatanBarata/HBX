"use client";

// ┌────────────────────────────────────────────────────────────────────────────┐
// │  FiltroAvancadoModal — popup "Filtro avançado" do Buscar empresas           │
// │  (VENDAS-REFAB, item 3b: "o pop up que vc fez ficou perfeito, ressuscite"). │
// │                                                                              │
// │  Ressuscitado do commit revertido f5631ebe (buscar-empresas.tsx) — o popup  │
// │  em si era bom, só a TELA em volta (que substituía o Pipeline/radar) foi    │
// │  odiada e revertida. Aqui ele vira componente próprio, plugado na tela      │
// │  BOA (leads/page.client.tsx), sem mexer no Pipeline/cards.                  │
// │                                                                              │
// │  Campos 1:1 com CONTRATO-FILTRO.md (CnpjBaseQueryInput) — só colunas REAIS  │
// │  do RFB (CnpjPublicCompany). NÃO oferece regimeTributario/tem-site/bairro.  │
// │                                                                              │
// │  Consome POST /webscraping/radar/cnpj-base/query (já existe, leitura pura,  │
// │  aberto pra admin/vendedor) só para mostrar uma PRÉVIA de contagem — o      │
// │  Pipeline de pesquisa (lista real de cards/Puxar) continua vindo do         │
// │  /webscraping/radar/leads, intocado. "Aplicar filtro" traduz o subconjunto  │
// │  compatível (UF/cidade/CNAE-ou-palavra/WhatsApp) pros filtros que a tela já │
// │  usa; os campos só-RFB (capital, idade, sócio, situação…) refinam a prévia  │
// │  mas não têm onde aterrissar no Pipeline hoje — ficam explícitos, nunca     │
// │  fingidos. Zero hex/inline (5 Leis) — só classe/token central.             │
// └────────────────────────────────────────────────────────────────────────────┘

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch, type ApiError } from "@/lib/api";
import { BRAZIL_UF_OPTIONS } from "@/lib/brazil-cities";

// ── Contrato (CONTRATO-FILTRO.md) ───────────────────────────────────────────

export type ContatoFiltro = {
  comEmail?: boolean;
  comTelefone?: boolean;
  comCelular?: boolean;
  maxPhoneShare?: number;
  maxEmailShare?: number;
  blocklistEmail?: boolean;
};

export type CnpjBaseQueryInput = {
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

type CnpjBaseQueryResponse = {
  count: number;
  cursorNext: string | null;
  statsAmostra?: { total: number; comCelularProprio: number; provavelContador: number };
};

// Opções fixas RFB (valores reais do dataset — o backend normaliza pra minúsculo).
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

// ── Filtro em memória (draft do popup) ──────────────────────────────────────

export type FiltroAvancadoState = {
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

export const FILTRO_AVANCADO_VAZIO: FiltroAvancadoState = {
  keyword: "", states: [], cities: [], ddd: "",
  cnaes: [], cnaePrincipalOnly: false,
  situacoes: [], porte: [], naturezas: [], matrizFilial: [],
  mei: null, simples: null, capitalMin: "", capitalMax: "",
  idadeMinAnos: "", idadeMaxAnos: "",
  donoConhecido: null, ownerNameKeyword: "", ownerQualifications: [],
  comEmail: null, comTelefone: null, comCelular: null,
  maxPhoneShare: "", maxEmailShare: "", blocklistEmail: null,
};

export function isFiltroAvancadoVazio(f: FiltroAvancadoState): boolean {
  return JSON.stringify(f) === JSON.stringify(FILTRO_AVANCADO_VAZIO);
}

function buildQueryInput(f: FiltroAvancadoState): CnpjBaseQueryInput {
  const input: CnpjBaseQueryInput = { limit: 1 };
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

// Campos que NÃO têm onde aterrissar no Pipeline hoje (RadarLeadPool não
// entende CNAE/situação/capital/idade/sócio) — usado só pra avisar na UI,
// nunca pra fingir que "Aplicar" vai filtrar por eles no Pipeline.
function camposSoPreviaAtivos(f: FiltroAvancadoState): string[] {
  const labels: string[] = [];
  if (f.cnaes.length) labels.push("CNAE");
  if (f.situacoes.length) labels.push("Situação");
  if (f.porte.length) labels.push("Porte");
  if (f.naturezas.length) labels.push("Natureza jurídica");
  if (f.matrizFilial.length) labels.push("Matriz/Filial");
  if (f.mei != null) labels.push("MEI");
  if (f.simples != null) labels.push("Simples");
  if (f.capitalMin.trim() || f.capitalMax.trim()) labels.push("Capital social");
  if (f.idadeMinAnos.trim() || f.idadeMaxAnos.trim()) labels.push("Idade da empresa");
  if (f.donoConhecido != null || f.ownerNameKeyword.trim() || f.ownerQualifications.length) labels.push("Sócio/dono");
  if (f.comEmail != null || f.maxPhoneShare.trim() || f.maxEmailShare.trim() || f.blocklistEmail != null) labels.push("Anti-contador");
  return labels;
}

// ── Controles reutilizáveis do popup ────────────────────────────────────────

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
  const key = value == null ? "qualquer" : value ? "sim" : "nao";
  const pill = useGlassPill<HTMLButtonElement>(key);
  return (
    <div className="be-tristate" role="group">
      <GlassPill {...pill} />
      <button ref={pill.itemRef("qualquer")} type="button" className={"be-tristate__opt" + (value == null ? " is-on" : "")} aria-pressed={value == null} onClick={() => onChange(null)}>Qualquer</button>
      <button ref={pill.itemRef("sim")} type="button" className={"be-tristate__opt" + (value === true ? " is-on" : "")} aria-pressed={value === true} onClick={() => onChange(true)}>{labelOn}</button>
      <button ref={pill.itemRef("nao")} type="button" className={"be-tristate__opt" + (value === false ? " is-on" : "")} aria-pressed={value === false} onClick={() => onChange(false)}>{labelOff}</button>
    </div>
  );
}

// LEADS-FINAL/03 (06/07): o popup centralizado virou GAVETA lateral
// (.hbx-veil.to-right + .hbx-drawer, mesmo par usado em outras telas do kit —
// nunca reposiciona inline) pra caber os controles que SAÍRAM da barra de
// comando (Estado/Cidade/Alcance/Tem site/Tem WhatsApp). Esses 5 controles não
// são campo do FiltroAvancadoState (são estado próprio da tela de Leads, ligados
// direto no Pipeline de busca) — em vez de a gaveta conhecer o shape da tela
// que a usa, ela recebe um slot (quickSlot) renderizado ANTES das seções
// "só prévia RFB". Mantém o componente reusável e sem acoplar ao caller.
export function FiltroAvancadoModal({
  draft, onChange, onClose, onApply, quickSlot, extraQueryInput,
}: {
  draft: FiltroAvancadoState;
  onChange: (next: FiltroAvancadoState) => void;
  onClose: () => void;
  onApply: (f: FiltroAvancadoState) => void;
  quickSlot?: ReactNode;
  // Contagem grátis (LEADS-FINAL/03): os campos do quickSlot (Estado/Cidade/Tem
  // site/Tem WhatsApp) não vivem em FiltroAvancadoState — sem isto a prévia só
  // reagiria às seções avançadas e ficaria muda pro que o usuário vê no topo da
  // gaveta. O pai manda o recorte já no formato do contrato (states/cities/
  // contato); o preview faz merge por cima do draft (extra tem prioridade).
  extraQueryInput?: Partial<CnpjBaseQueryInput>;
}) {
  function patch(p: Partial<FiltroAvancadoState>) { onChange({ ...draft, ...p }); }
  const [cidadesTxt, setCidadesTxt] = useState(draft.cities.join(", "));
  const [cnaesTxt, setCnaesTxt] = useState(draft.cnaes.join(", "));
  const [naturezasTxt, setNaturezasTxt] = useState(draft.naturezas.join(", "));
  const [qualifTxt, setQualifTxt] = useState(draft.ownerQualifications.join(", "));

  function commitListField(raw: string, field: "cities" | "cnaes" | "naturezas" | "ownerQualifications") {
    const list = raw.split(",").map(s => s.trim()).filter(Boolean);
    patch({ [field]: list } as Partial<FiltroAvancadoState>);
  }

  // Prévia ao vivo: quantas empresas da base 28M batem com o rascunho atual.
  // Puramente informativo (endpoint já existe e é leitura pura) — não troca
  // o Pipeline de pesquisa, que continua vindo do /webscraping/radar/leads.
  const [preview, setPreview] = useState<{ count: number; loading: boolean; error: string | null }>({ count: 0, loading: false, error: null });

  const runPreview = useCallback((f: FiltroAvancadoState, extra?: Partial<CnpjBaseQueryInput>) => {
    setPreview(p => ({ ...p, loading: true, error: null }));
    apiFetch<CnpjBaseQueryResponse>("/webscraping/radar/cnpj-base/query", {
      method: "POST",
      body: JSON.stringify({ ...buildQueryInput(f), ...extra }),
    })
      .then(res => setPreview({ count: res?.count ?? 0, loading: false, error: null }))
      .catch((err: unknown) => {
        const e = err as ApiError & { status?: number };
        setPreview({ count: 0, loading: false, error: e?.status === 404 ? null : (err instanceof Error ? err.message : "Falha ao consultar a base.") });
      });
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => runPreview(draft, extraQueryInput), 380);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, extraQueryInput]);

  const soPrevia = useMemo(() => camposSoPreviaAtivos(draft), [draft]);

  return (
    <div className="hbx-veil to-right" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hbx-drawer be-adv-modal" onClick={e => e.stopPropagation()}>
        <h3>
          Filtros avançados
          <span className="x" role="button" tabIndex={0} aria-label="Fechar" onClick={onClose} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClose(); }}>
            <I d={ICONS.x} size={16} />
          </span>
        </h3>
        <div className="be-adv-body">
          {quickSlot && (
            <section className="be-adv-sec">
              <h4>Refinar a busca</h4>
              {quickSlot}
            </section>
          )}
          <section className="be-adv-sec">
            <h4>Localização (base Receita — só prévia)</h4>
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
        <div className="be-adv-foot">
          <div className="be-adv-preview">
            {preview.error ? (
              <span className="be-adv-preview__err">{preview.error}</span>
            ) : (
              <span>
                <strong>{preview.loading ? "…" : fmtInt(preview.count)}</strong> empresa{preview.count === 1 ? "" : "s"} na base Receita com este recorte
              </span>
            )}
            {soPrevia.length > 0 && (
              <span className="be-adv-preview__note">
                Só entram na prévia acima (o Pipeline ainda não filtra por): {soPrevia.join(", ")}
              </span>
            )}
          </div>
          <div className="be-adv-foot__actions">
            <button type="button" className="btn-ghost" onClick={() => onChange(FILTRO_AVANCADO_VAZIO)}>Limpar tudo</button>
            <button type="button" className="btn-teal" onClick={() => onApply(draft)}>Aplicar filtro</button>
          </div>
        </div>
      </div>
    </div>
  );
}
