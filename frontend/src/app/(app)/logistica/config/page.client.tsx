"use client";

// LOGÍSTICA-MOBILE M5 — regras do admin (editor da config da empresa).
// Contratos reais (company-scoped, JWT; PATCH é ADMIN-only no backend):
//   - GET   /logistica/config        → LogisticaConfig
//   - PATCH /logistica/config {...}   → LogisticaConfig
//   - POST  /logistica/prospector/ciente → marca o "Ciente" do ator (24/08)
// (24/08 — última passada: /logistica/config/modo-rota MORREU junto com o modo
//  Essencial; toda rota é rastreada e campo morto no PATCH responde 400.)
//
// O editor cobre:
//   · Template do aviso WhatsApp "entregue" (variáveis {saudacao} {cliente}
//     {itens} {qtd} {produto}) com PREVIEW AO VIVO (mesma lógica do backend,
//     abaixo em renderPreview — dados de exemplo).
//   · Toggles: avisar na entrega + mensagens automáticas (chegada, cobrança,
//     prospector).
//   · Parâmetros de rota: raio de chegada (m), velocidade média (km/h), tempo de
//     parada (min).
//
// Design system (5 Leis): visual todo em classe central (.log-cfg-* em screens.css
// + kit .field-dark/.btn-teal/.btn-ghost/.ctt-toggle). Inline aqui = só layout.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { CONTACT_PHONE_DIGITS } from "@/lib/contato";
import { isTenantAdmin } from "@/lib/roles";

// 24/08 — CTA do cartão de assentos: mesmo WhatsApp de suporte da HBX
// (lib/contato.ts, fonte única do número), com a frase do pedido já digitada.
const MAIS_MOTORISTAS_URL =
  `https://wa.me/${CONTACT_PHONE_DIGITS}?text=` +
  encodeURIComponent("Olá! Quero mais motoristas por dia na Logística HBX.");

// 🔴 ESTE TIPO DESCREVIA UMA RESPOSTA QUE O SERVIDOR NÃO DÁ MAIS (23/08).
// Ele nasceu no PR28072026 (mensalidade + franquia de paradas do mês) e a ROTA
// v2 (10/08) matou a franquia: `statusDoNivel` passou a devolver nível, título,
// preço e ASSENTOS. TypeScript não pega isso — o `apiFetch<PlanoRota>` é uma
// promessa de tipo sobre JSON que chega em runtime —, então
// `plano.paradasInclusas` virava `undefined`, a condição de render
// (`paradasInclusas > 0`) dava false e o cartão do plano NUNCA aparecia.
// Ninguém viu: o bloco simplesmente não existia na tela, sem erro no console.
// Custo real: o dono da distribuidora não enxerga em que plano está nem quantos
// motoristas ele inclui — e é ele quem paga a mensalidade.
// Agora o tipo É a resposta medida (logistica-nivel-plano.service.ts:
// `statusDoNivel`), CREDITO incluído: ele é o berço de toda empresa nova.
type PlanoRota = {
  nivel: "CREDITO" | "BASIC" | "ADVANCED" | "FULL";
  titulo: string;
  precoMensal: number;
  /** Assentos (motoristas simultâneos por dia) que o NÍVEL inclui. */
  assentosInclusos: number;
  /** Override por empresa; quando existe, manda sobre o do nível. */
  logisticaAssentos: number | null;
};

/** "R$ 199/mês" — sem centavos quando é inteiro (preço redondo é o normal). */
function fmtMoedaMes(v: number): string {
  const n = Number(v) || 0;
  const corpo = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return `R$ ${corpo}/mês`;
}

type Config = {
  // 24/08 — última passada: trackingAtivo/trackingDisponivel/modoRotaPadrao
  // SAÍRAM do GET (toda rota é rastreada; não há mais modo pra escolher).
  // O GET ganhou `admin` (o ator é admin da empresa) e `prospectorCiente`
  // (o ator já deu o "Ciente" do Prospector) — ver o modal lá embaixo.
  admin?: boolean;
  prospectorCiente?: boolean;
  avisoWhatsEnabled: boolean;
  templateAviso: string | null;
  raioChegadaM: number;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  // SENTINELA (03/08) — réguas do vigia. 0 desliga aquela pergunta.
  sentinelaSemSinalMin: number;
  sentinelaParadoMin: number;
  sentinelaAtrasoMin: number;
  // 24/08 — moduloFinanceiroAtivo/cobrancaSimples MORRERAM do contrato
  // (financeiro é incondicional; campo morto no PATCH responde 400).
  // cobrancaNaEntrega segue existindo no backend, mas o toggle saiu desta
  // tela na última passada — o tipo só declara o que a tela LÊ.
  moduloRecoveryAtivo?: boolean;
  comprovanteFotoObrigatoria: boolean;
  comprovanteAssinaturaObrigatoria: boolean;
  comprovanteCodigoObrigatorio: boolean;
  // ITEM 9 (07/08) — CSV do que está DESLIGADO no app do motorista. "rota" nunca
  // entra (o backend filtra), por isso ela aparece aqui fixa e marcada.
  appModulosDesativados?: string | null;
  // PR07082026-PROSPECTOR-CNPJ F4 — os 3 disparos automáticos, mesmo shape:
  // toggle + template + condição. `cobrancaWhatsDisponivel` é derivado da env
  // (read-only; infraestrutura da HBX, não plano). 24/08 — prospectorEquipe e
  // prospectorDisponivel SAÍRAM do contrato: o Prospector é de todos, o que
  // condiciona ligar é o "Ciente" do ator (prospectorCiente lá em cima).
  avisoChegandoEnabled?: boolean;
  avisoChegandoTemplate?: string | null;
  avisoChegandoDistanciaM?: number;
  cobrancaWhatsAtiva?: boolean;
  cobrancaWhatsTemplate?: string | null;
  cobrancaWhatsDisponivel?: boolean;
  prospectorAtivo?: boolean;
  prospectorTemplate?: string | null;
  prospectorRaioM?: number;
  prospectorMaxDia?: number;
};

type ConfigActor = NonNullable<ReturnType<typeof useCurrentUser>> & {
  canViewBilling?: boolean | null;
};

// Espelha access/actor-kind.isBillingOwnerActor do backend: system master tem
// precedência; gerente (ADMIN + canViewBilling=false) não vê escolha comercial.
function isBillingOwnerUser(user: ReturnType<typeof useCurrentUser>): boolean {
  if (!user) return false;
  if (user.isSystemMaster) return true;
  const actor = user as ConfigActor;
  return isTenantAdmin(user) && actor.canViewBilling !== false;
}

// Template padrão sugerido (o que o admin vê quando ainda não gravou nada).
const TEMPLATE_DEFAULT =
  "{saudacao} {cliente}! Sua entrega foi concluída: {itens}. Obrigado pela preferência!";

// Variáveis inseríveis (botão → cola {chave} no textarea).
const VARS: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "Saudação" },
  { key: "cliente", label: "Cliente" },
  { key: "itens", label: "Itens" },
  { key: "qtd", label: "Qtd total" },
  { key: "produto", label: "Produto" },
];

// ── ITEM 9 (07/08) — MÓDULOS DO MOTORISTA ────────────────────────────────────
// O admin monta o app do motorista daqui, pelo PC. A lista é a mesma
// APP_MODULOS_DESATIVAVEIS do backend; grava o CSV do que está DESLIGADO.
// LEI: Rota NUNCA desliga — ela aparece na lista como item fixo (marcado e
// desabilitado) para o admin ver o app inteiro, não uma lista pela metade.
const APP_MODULOS: Array<{ key: string; label: string }> = [
  { key: "fechamento", label: "Fechamento" },
  { key: "clientes", label: "Clientes" },
  { key: "produtos", label: "Produtos" },
  { key: "chat", label: "Chat" },
  { key: "ajustes", label: "Ajustes" },
];

function desativadosSet(csv: string | null | undefined): Set<string> {
  return new Set(
    String(csv ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** CSV do que fica DESLIGADO depois de ligar/desligar `key` (ordem estável). */
function csvComModulo(csv: string | null | undefined, key: string, ligado: boolean): string {
  const off = desativadosSet(csv);
  if (ligado) off.delete(key);
  else off.add(key);
  return APP_MODULOS.filter((m) => off.has(m.key)).map((m) => m.key).join(",");
}

// ── PR07082026-PROSPECTOR-CNPJ F4 — MENSAGENS AUTOMÁTICAS ───────────────────
// Variáveis aceitas por disparo. Só entra chave que o backend RESOLVE: chip que
// cola um {token} sem fonte escreveria vazio na mensagem do cliente.
const VARS_CHEGANDO: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "Saudação" },
  { key: "cliente", label: "Cliente" },
  { key: "itens", label: "Itens" },
  { key: "qtd", label: "Qtd total" },
  { key: "produto", label: "Produto" },
  { key: "empresa", label: "Empresa" },
];
const VARS_COBRANCA: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "Saudação" },
  { key: "cliente", label: "Cliente" },
  { key: "empresa", label: "Empresa" },
];
const VARS_PROSPECTOR: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "Saudação" },
  { key: "empresa", label: "Empresa" },
  { key: "ramo", label: "Ramo" },
  { key: "cidade", label: "Cidade" },
];

/**
 * UM disparo automático. Os três (chegada, cobrança, prospector) são ESTE
 * componente repetido — nada de layout por disparo. As peças são as mesmas do
 * bloco de aviso da entrega (cabeça + ctt-toggle + .log-cfg__vars + .log-cfg__ta
 * + btn-teal): nenhum padrão visual novo nasce aqui.
 */
function MensagemAuto(props: {
  titulo: string;
  ativo: boolean;
  onAtivo: (v: boolean) => void;
  vars: Array<{ key: string; label: string }>;
  template: string;
  onTemplate: (v: string) => void;
  onSalvar: () => void;
  saving: boolean;
  disponivel: boolean;
  motivo: string;
  children?: React.ReactNode;
}) {
  const { titulo, ativo, onAtivo, vars, template, onTemplate, onSalvar, saving, disponivel, motivo, children } = props;
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const travado = !disponivel || saving;

  const inserir = useCallback((key: string) => {
    const token = `{${key}}`;
    const el = taRef.current;
    if (!el) { onTemplate(template + token); return; }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    onTemplate(template.slice(0, start) + token + template.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }, [onTemplate, template]);

  return (
    <div className="log-cfg__msg">
      <div className="log-cfg__block-head">
        <strong className="log-cfg__block-title">{titulo}</strong>
        <label className="ctt-toggle ctt-toggle--inline">
          <input
            type="checkbox"
            checked={ativo}
            disabled={travado}
            onChange={(e) => onAtivo(e.target.checked)}
          />
          <span>{ativo ? "Ligado" : "Desligado"}</span>
        </label>
      </div>

      <div className="log-cfg__vars">
        {vars.map((v) => (
          <button
            type="button"
            key={v.key}
            className="btn-ghost btn-xs log-cfg__var"
            disabled={travado}
            onClick={() => inserir(v.key)}
            title={`Inserir {${v.key}}`}
          >
            <I d={ICONS.plus} size={11} /> {v.label}
          </button>
        ))}
      </div>

      <textarea
        ref={taRef}
        className="field-dark log-cfg__ta"
        value={template}
        disabled={travado}
        onChange={(e) => onTemplate(e.target.value)}
        rows={4}
        placeholder="Vazio = mensagem padrão"
        aria-label={`Mensagem de ${titulo}`}
      />

      {children}

      {/* O motivo vem ANTES do botão: ele explica a condição logo acima e deixa
          o "Salvar" como último item dos três cards (é o que alinha a base). */}
      {!disponivel && <p className="log-cfg__availability" role="status">{motivo}</p>}

      <button className="btn-teal log-cfg__save" onClick={onSalvar} disabled={travado}>
        <I d={ICONS.check} size={14} /> Salvar mensagem
      </button>
    </div>
  );
}

// Dados de exemplo do PREVIEW (não vão pra lugar nenhum — só ilustram).
const PREVIEW_VARS = {
  cliente: "Dona Maria",
  itens: "2× Galão 20L, 1× Água com gás",
  qtd: "3",
  produto: "Galão 20L",
};

// Render de preview — espelha renderTemplateAviso do backend (substitui variáveis,
// remove {chave} desconhecida, limpa espaço órfão). DETERMINÍSTICO p/ o exemplo — a
// prévia usa uma saudação FIXA de propósito: computar por horário (new Date()) no
// render (aqui, dentro do useMemo) divergia entre SSR e hidratação (o servidor
// renderiza num horário, o cliente hidrata em outro/timezone) e dava erro de
// hidratação do React (418). A saudação REAL do envio é resolvida por horário no
// backend (5–11h Bom dia · 12–17h Boa tarde · senão Boa noite); aqui é só amostra.
// Mesmo tratamento do gêmeo entrega/ajustes/page.client.tsx.
function renderPreview(template: string): string {
  const map: Record<string, string> = {
    saudacao: "Bom dia",
    cliente: PREVIEW_VARS.cliente,
    itens: PREVIEW_VARS.itens,
    qtd: PREVIEW_VARS.qtd,
    produto: PREVIEW_VARS.produto,
  };
  return String(template || "")
    .replace(/\{(\w+)\}/g, (_full, key: string) => {
      const k = String(key).toLowerCase();
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "";
    })
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+([.,;:!?])/g, "$1")
    .replace(/[^\S\n]+\n/g, "\n")
    .trim();
}

export function LogisticaConfigClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const billingOwner = isBillingOwnerUser(user);

  const [cfg, setCfg] = useState<Config | null>(null);
  const [template, setTemplate] = useState<string>("");
  // F4 — um rascunho por disparo (o texto só vai pro backend no "Salvar
  // mensagem", igual ao template da entrega logo acima).
  const [tplChegando, setTplChegando] = useState<string>("");
  const [tplCobranca, setTplCobranca] = useState<string>("");
  const [tplProspector, setTplProspector] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Nível + assentos da empresa (ROTA v2). Best-effort: falhar aqui não pode
  // derrubar a tela de regras — o cartão simplesmente não aparece.
  // ⚠️ E foi assim que o defeito de 28/07 viveu 6 semanas em silêncio: quando o
  // "não aparece" é o comportamento de falha ESPERADO, o bloco sumido por outro
  // motivo (aqui, campo que o servidor deixou de mandar) não acende alarme
  // nenhum. Mexeu no formato desta resposta? Abra a tela e OLHE.
  const [plano, setPlano] = useState<PlanoRota | null>(null);

  useEffect(() => {
    let vivo = true;
    apiFetch<PlanoRota>("/logistica/plano")
      .then((res) => { if (vivo) setPlano(res); })
      .catch(() => { if (vivo) setPlano(null); });
    return () => { vivo = false; };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    return apiFetch<Config>("/logistica/config")
      .then((res) => {
        setCfg(res);
        setTemplate(res.templateAviso ?? TEMPLATE_DEFAULT);
        // Vazio é ESTADO REAL nos 3 (null = manda a mensagem padrão do sistema),
        // então nenhum deles ganha texto sugerido no lugar do que está gravado.
        setTplChegando(res.avisoChegandoTemplate ?? "");
        setTplCobranca(res.cobrancaWhatsTemplate ?? "");
        setTplProspector(res.prospectorTemplate ?? "");
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar as regras.");
        setCfg(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
  useEffect(() => { load(); }, [load]);

  // Insere {chave} na posição do cursor do textarea (ou no fim).
  const inserirVar = useCallback((key: string) => {
    const token = `{${key}}`;
    const el = textareaRef.current;
    if (!el) {
      setTemplate((t) => t + token);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + token + template.slice(end);
    setTemplate(next);
    // devolve o foco/cursor logo após o token inserido.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }, [template]);

  // Patch de 1 toggle/campo direto (otimista com recarga). 24/08 — voltou a ser
  // caminho ÚNICO: o endpoint /logistica/config/modo-rota morreu junto com o
  // modo Essencial (toda rota é rastreada; não sobrou modo pra trocar).
  const patch = useCallback(
    async (partial: Partial<Config>) => {
      setSaving(true);
      setSavedMsg(null);
      try {
        const res = await apiFetch<Config>("/logistica/config", {
          method: "PATCH",
          body: JSON.stringify(partial),
        });
        setCfg(res);
        setSavedMsg("Regras salvas.");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Não foi possível salvar.");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const salvarTemplate = useCallback(() => {
    patch({ templateAviso: template.trim() });
  }, [patch, template]);

  const preview = useMemo(() => renderPreview(template), [template]);

  // 24/08 — CONSENTIMENTO DO PROSPECTOR: ligar o toggle exige o "Ciente" do
  // ator (1x por usuário; o GET traz `prospectorCiente`). O modal bloqueia a
  // ativação até o POST /logistica/prospector/ciente confirmar — só então o
  // PATCH liga de fato. Desligar é sempre livre.
  const [prospectorModal, setProspectorModal] = useState(false);
  const [cienteBusy, setCienteBusy] = useState(false);
  const [cienteErro, setCienteErro] = useState<string | null>(null);

  const confirmarCienteProspector = useCallback(async () => {
    setCienteBusy(true);
    setCienteErro(null);
    try {
      await apiFetch("/logistica/prospector/ciente", { method: "POST" });
      setProspectorModal(false);
      // O PATCH devolve a config nova (já com prospectorCiente=true no GET
      // seguinte) e é ele que liga o toggle de verdade.
      await patch({ prospectorAtivo: true });
    } catch (err: unknown) {
      setCienteErro(err instanceof Error ? err.message : "Não foi possível registrar o ciente.");
    } finally {
      setCienteBusy(false);
    }
  }, [patch]);

  /* Assentos EFETIVOS: o override da empresa manda sobre o do nível — é a
     mesma conta de `assertAssentoDoDia` no backend
     (`logisticaAssentos ?? assentosInclusos`). Duas réguas para o mesmo número
     é o painel dizendo "2 motoristas" e a rota barrando o segundo. */
  const assentosDoPlano = plano ? (plano.logisticaAssentos ?? plano.assentosInclusos) : 0;

  if (!admin) {
    return (
      <div className="work" style={{ flex: 1 }}>
        <section className="panel">
          <div className="panel-head"><h2>Regras da Logística</h2></div>
          <div className="emp-empty">
            <strong className="emp-empty__title">Acesso restrito</strong>
            <span className="emp-empty__text">Só o administrador da empresa edita as regras da Logística.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="work" style={{ flex: 1 }}>
      <section className="panel">
        <div className="panel-head">
          <h2>Regras da Logística</h2>
          <div className="meta" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {saving && <span className="emp-count">salvando…</span>}
            {savedMsg && !saving && <span className="emp-count">{savedMsg}</span>}
          </div>
        </div>

        {loading && <div className="emp-empty"><span className="emp-empty__text">Carregando regras…</span></div>}

        {error && (
          <div className="emp-empty">
            <strong className="emp-empty__title">Não carregou</strong>
            <span className="emp-empty__text">{error}</span>
            <button className="btn-ghost" onClick={() => load()}>Tentar novamente</button>
          </div>
        )}

        {!loading && cfg && (
          <div className="log-cfg">
            {/* ── OS ASSENTOS DA EMPRESA — última passada (24/08) ────────────
                O nível deixou de abrir/fechar recurso (o bloco "Modo das novas
                rotas" morreu junto com o modo Essencial): o que sobrou de
                comercial é QUANTOS motoristas saem no MESMO dia. O cartão diz
                esse número e aponta o caminho pra crescer — o WhatsApp da HBX
                (lib/contato.ts, o mesmo mecanismo de suporte do app). CREDITO
                segue com o selo "Sem mensalidade" e a régua de créditos/dia.
                O cartão aparece SEMPRE que o servidor responde, porque "quantos
                motoristas eu tenho" é a primeira pergunta de quem paga. */}
            {plano && (
              <div className="log-cfg__block">
                <div className="log-cfg__block-head">
                  <div className="log-cfg__heading-copy">
                    <strong className="log-cfg__block-title">
                      {plano.titulo}
                      {plano.precoMensal > 0 ? ` · ${fmtMoedaMes(plano.precoMensal)}` : ""}
                    </strong>
                    <span className="log-cfg__switch-hint">
                      {`${assentosDoPlano} ${assentosDoPlano === 1 ? "motorista" : "motoristas"} por dia.`}
                      {plano.nivel === "CREDITO"
                        ? " Cada dia com rota consome créditos — remontar o mesmo dia não cobra de novo."
                        : ""}
                    </span>
                  </div>
                  {plano.nivel === "CREDITO" && <span className="plano-selo">Sem mensalidade</span>}
                </div>
                <a
                  className="btn-ghost log-cfg__save"
                  href={MAIS_MOTORISTAS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Quer mais motoristas? Fale com a HBX
                </a>
              </div>
            )}

            {/* ── Aviso de WhatsApp ─────────────────────────────────────────── */}
            <div className="log-cfg__block">
              <div className="log-cfg__block-head">
                <strong className="log-cfg__block-title">Aviso de WhatsApp na entrega</strong>
                <label className="ctt-toggle ctt-toggle--inline">
                  <input
                    type="checkbox"
                    checked={cfg.avisoWhatsEnabled}
                    onChange={(e) => patch({ avisoWhatsEnabled: e.target.checked })}
                  />
                  <span>{cfg.avisoWhatsEnabled ? "Avisando" : "Silenciado"}</span>
                </label>
              </div>

              <div className="log-cfg__vars">
                {VARS.map((v) => (
                  <button
                    type="button"
                    key={v.key}
                    className="btn-ghost btn-xs log-cfg__var"
                    onClick={() => inserirVar(v.key)}
                    title={`Inserir {${v.key}}`}
                  >
                    <I d={ICONS.plus} size={11} /> {v.label}
                  </button>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                className="field-dark log-cfg__ta"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={4}
                placeholder="Escreva a mensagem com as variáveis"
                aria-label="Template do aviso de entrega"
              />

              <div className="log-cfg__preview">
                <span className="log-cfg__preview-label">Prévia</span>
                <p className="log-cfg__preview-body">{preview || "—"}</p>
              </div>

              <button className="btn-teal log-cfg__save" onClick={salvarTemplate} disabled={saving}>
                <I d={ICONS.check} size={14} /> Salvar mensagem
              </button>
            </div>

            {/* ── PR07082026-PROSPECTOR-CNPJ F4 — MENSAGENS AUTOMÁTICAS ────────
                Os 3 disparos no MESMO molde (o componente MensagemAuto repetido
                3×). Fica sob billingOwner porque é assim que o GET entrega os
                campos: para gerente (ADMIN sem billing) o backend OMITE os
                campos de cobrança e de aviso, e um toggle sem dado mostraria
                "Desligado" para algo que está ligado. */}
            {billingOwner && (
              <div className="log-cfg__block">
                <strong className="log-cfg__block-title">Mensagens automáticas</strong>
                <div className="log-cfg__msgs">
                  <MensagemAuto
                    titulo="Aviso de chegada"
                    ativo={!!cfg.avisoChegandoEnabled}
                    onAtivo={(v) => patch({ avisoChegandoEnabled: v })}
                    vars={VARS_CHEGANDO}
                    template={tplChegando}
                    onTemplate={setTplChegando}
                    onSalvar={() => patch({ avisoChegandoTemplate: tplChegando.trim() })}
                    saving={saving}
                    disponivel
                    motivo=""
                  >
                    <div className="log-cfg__grid">
                      <label className="f">
                        <span>Distância (m)</span>
                        <input
                          className="field-dark"
                          type="number"
                          min={100}
                          max={2000}
                          value={cfg.avisoChegandoDistanciaM ?? 500}
                          disabled={saving}
                          onChange={(e) => setCfg({ ...cfg, avisoChegandoDistanciaM: Number(e.target.value) })}
                          onBlur={(e) => patch({ avisoChegandoDistanciaM: Number(e.target.value) })}
                          aria-label="Distância do aviso de chegada em metros"
                        />
                      </label>
                    </div>
                  </MensagemAuto>

                  <MensagemAuto
                    titulo="Cobrança no WhatsApp"
                    ativo={!!cfg.cobrancaWhatsAtiva}
                    onAtivo={(v) => patch({ cobrancaWhatsAtiva: v })}
                    vars={VARS_COBRANCA}
                    template={tplCobranca}
                    onTemplate={setTplCobranca}
                    onSalvar={() => patch({ cobrancaWhatsTemplate: tplCobranca.trim() })}
                    saving={saving}
                    disponivel={!!cfg.cobrancaWhatsDisponivel}
                    motivo="Cobrança por WhatsApp indisponível. A preferência fica salva para quando a HBX liberar."
                  >
                    <p className="log-cfg__note">Ao lançar e no vencimento.</p>
                  </MensagemAuto>

                  {/* 24/08 — o gate prospectorDisponivel MORREU (Prospector é
                      de todos). O que condiciona LIGAR é o consentimento do
                      ator: sem `prospectorCiente`, o toggle abre o modal
                      bloqueante e só o "Ciente" (POST) libera o PATCH.
                      `prospectorEquipe` também saiu do contrato. */}
                  <MensagemAuto
                    titulo="Prospector CNPJ"
                    ativo={!!cfg.prospectorAtivo}
                    onAtivo={(v) => {
                      if (v && !cfg.prospectorCiente) {
                        setCienteErro(null);
                        setProspectorModal(true);
                        return;
                      }
                      patch({ prospectorAtivo: v });
                    }}
                    vars={VARS_PROSPECTOR}
                    template={tplProspector}
                    onTemplate={setTplProspector}
                    onSalvar={() => patch({ prospectorTemplate: tplProspector.trim() })}
                    saving={saving}
                    disponivel
                    motivo=""
                  >
                    <div className="log-cfg__grid">
                      <label className="f">
                        <span>Raio (m)</span>
                        <input
                          className="field-dark"
                          type="number"
                          min={50}
                          max={500}
                          value={cfg.prospectorRaioM ?? 150}
                          disabled={saving}
                          onChange={(e) => setCfg({ ...cfg, prospectorRaioM: Number(e.target.value) })}
                          onBlur={(e) => patch({ prospectorRaioM: Number(e.target.value) })}
                          aria-label="Raio do prospector em metros"
                        />
                      </label>
                      <label className="f">
                        <span>Vezes por dia</span>
                        <input
                          className="field-dark"
                          type="number"
                          min={1}
                          max={8}
                          value={cfg.prospectorMaxDia ?? 4}
                          disabled={saving}
                          onChange={(e) => setCfg({ ...cfg, prospectorMaxDia: Number(e.target.value) })}
                          onBlur={(e) => patch({ prospectorMaxDia: Number(e.target.value) })}
                          aria-label="Vezes por dia que o prospector acende"
                        />
                      </label>
                    </div>
                  </MensagemAuto>
                </div>
              </div>
            )}

            {/* 24/08 — os blocos "Cobrança" (cobrancaNaEntrega) e "Dinheiro na
                porta" (moduloFinanceiroAtivo) SAÍRAM da tela na última passada:
                o financeiro é incondicional no backend. moduloFinanceiroAtivo
                morreu do contrato (PATCH com campo morto = 400); o toggle de
                cobrança na entrega deixou de ser decisão de painel. */}

            <div className="log-cfg__block">
              <strong className="log-cfg__block-title">Comprovante de entrega</strong>
              <p className="log-cfg__note">
                Você pode combinar os métodos. A entrega só é concluída quando todos os comprovantes escolhidos forem informados.
              </p>
              <label className="log-cfg__switch">
                <input
                  type="checkbox"
                  checked={cfg.comprovanteFotoObrigatoria}
                  onChange={(e) => patch({ comprovanteFotoObrigatoria: e.target.checked })}
                />
                <span className="log-cfg__switch-txt">
                  <span className="log-cfg__switch-name">Foto da entrega</span>
                </span>
              </label>
              <label className="log-cfg__switch">
                <input
                  type="checkbox"
                  checked={cfg.comprovanteAssinaturaObrigatoria}
                  onChange={(e) => patch({ comprovanteAssinaturaObrigatoria: e.target.checked })}
                />
                <span className="log-cfg__switch-txt">
                  <span className="log-cfg__switch-name">Assinatura na tela</span>
                </span>
              </label>
              <label className="log-cfg__switch">
                <input
                  type="checkbox"
                  checked={cfg.comprovanteCodigoObrigatorio}
                  onChange={(e) => patch({ comprovanteCodigoObrigatorio: e.target.checked })}
                />
                <span className="log-cfg__switch-txt">
                  <span className="log-cfg__switch-name">Código de 6 dígitos</span>
                </span>
              </label>
            </div>

            {/* ── ITEM 9 (07/08) — MÓDULOS DO MOTORISTA ──────────────────────
                O admin monta o app do motorista daqui, pelo PC: deixa mastigado
                e libera só o que ele precisa. Grava o CSV do que está
                DESLIGADO. Rota é item fixo, marcado e desabilitado — a lista
                mostra o app INTEIRO, e é ela que diz por que a Rota não desce.  */}
            <div className="log-cfg__block">
              <strong className="log-cfg__block-title">Módulos do motorista</strong>
              <div className="log-cfg__modulos">
                <label className="log-cfg__switch">
                  <input type="checkbox" checked readOnly disabled />
                  <span className="log-cfg__switch-txt">
                    <span className="log-cfg__switch-name">Rota</span>
                    <span className="log-cfg__switch-hint">Sempre ligado</span>
                  </span>
                </label>
                {APP_MODULOS.map((m) => {
                  const ligado = !desativadosSet(cfg.appModulosDesativados).has(m.key);
                  return (
                    <label className="log-cfg__switch" key={m.key}>
                      <input
                        type="checkbox"
                        checked={ligado}
                        disabled={saving}
                        onChange={(e) =>
                          patch({
                            appModulosDesativados: csvComModulo(
                              cfg.appModulosDesativados,
                              m.key,
                              e.target.checked,
                            ),
                          })
                        }
                      />
                      <span className="log-cfg__switch-txt">
                        <span className="log-cfg__switch-name">{m.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ── Parâmetros de rota ─────────────────────────────────────────── */}
            <div className="log-cfg__block">
              <strong className="log-cfg__block-title">Rota e chegada</strong>
              <div className="log-cfg__grid">
                <label className="f">
                  <span>Raio de chegada (m)</span>
                  <input
                    className="field-dark"
                    type="number"
                    min={10}
                    max={5000}
                    value={cfg.raioChegadaM}
                    onChange={(e) => setCfg({ ...cfg, raioChegadaM: Number(e.target.value) })}
                    onBlur={(e) => patch({ raioChegadaM: Number(e.target.value) })}
                    aria-label="Raio de chegada em metros"
                  />
                </label>
                <label className="f">
                  <span>Velocidade média (km/h)</span>
                  <input
                    className="field-dark"
                    type="number"
                    min={1}
                    max={200}
                    value={cfg.velocidadeMediaKmH}
                    onChange={(e) => setCfg({ ...cfg, velocidadeMediaKmH: Number(e.target.value) })}
                    onBlur={(e) => patch({ velocidadeMediaKmH: Number(e.target.value) })}
                    aria-label="Velocidade média em km/h"
                  />
                </label>
                <label className="f">
                  <span>Tempo de parada (min)</span>
                  <input
                    className="field-dark"
                    type="number"
                    min={0}
                    max={240}
                    value={cfg.tempoParadaMin}
                    onChange={(e) => setCfg({ ...cfg, tempoParadaMin: Number(e.target.value) })}
                    onBlur={(e) => patch({ tempoParadaMin: Number(e.target.value) })}
                    aria-label="Tempo de parada em minutos"
                  />
                </label>
              </div>
            </div>

            {/* ── SENTINELA (03/08) — as réguas do aviso automático ─────────────
                As colunas e o PATCH existiam desde o backend da sentinela; o
                campo na tela é o que faltava (F3) — sem ele a régua só mudava
                por SQL, o que não é ajuste, é chamado de suporte. */}
            <div className="log-cfg__block">
              <strong className="log-cfg__block-title">Avisos automáticos da rota</strong>
              <p className="log-cfg__note">
                O cockpit avisa sozinho quando um motorista some, encosta ou atrasa.
                Minutos de tolerância — 0 desliga aquele aviso.
              </p>
              <div className="log-cfg__grid">
                <label className="f">
                  <span>Sem sinal (min)</span>
                  <input
                    className="field-dark"
                    type="number"
                    min={0}
                    max={240}
                    value={cfg.sentinelaSemSinalMin}
                    onChange={(e) => setCfg({ ...cfg, sentinelaSemSinalMin: Number(e.target.value) })}
                    onBlur={(e) => patch({ sentinelaSemSinalMin: Number(e.target.value) })}
                    aria-label="Minutos sem sinal até avisar"
                  />
                </label>
                <label className="f">
                  <span>Parado fora de cliente (min)</span>
                  <input
                    className="field-dark"
                    type="number"
                    min={0}
                    max={240}
                    value={cfg.sentinelaParadoMin}
                    onChange={(e) => setCfg({ ...cfg, sentinelaParadoMin: Number(e.target.value) })}
                    onBlur={(e) => patch({ sentinelaParadoMin: Number(e.target.value) })}
                    aria-label="Minutos parado fora de cliente até avisar"
                  />
                </label>
                <label className="f">
                  <span>Atraso no plano (min)</span>
                  <input
                    className="field-dark"
                    type="number"
                    min={0}
                    max={240}
                    value={cfg.sentinelaAtrasoMin}
                    onChange={(e) => setCfg({ ...cfg, sentinelaAtrasoMin: Number(e.target.value) })}
                    onBlur={(e) => patch({ sentinelaAtrasoMin: Number(e.target.value) })}
                    aria-label="Minutos de atraso no plano até avisar"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 24/08 — MODAL DE CONSENTIMENTO DO PROSPECTOR (casca .hbx-veil/.hbx-modal
          do kit — a mesma dos diálogos do cockpit). Bloqueante de propósito: um
          único botão de ação ("Ciente"); fechar pelo × ou pelo véu desiste de
          ligar e o toggle continua desligado. */}
      {prospectorModal && (
        <div
          className="hbx-veil"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !cienteBusy) setProspectorModal(false); }}
        >
          <section className="hbx-modal" role="dialog" aria-modal="true" aria-labelledby="prospector-ciente-titulo">
            <h3 id="prospector-ciente-titulo">
              Antes de ligar o Prospector
              <button
                type="button"
                className="hbx-x"
                aria-label="Fechar"
                onClick={() => setProspectorModal(false)}
                disabled={cienteBusy}
              >
                ×
              </button>
            </h3>
            <p className="log-cfg__note">
              O Prospector envia mensagens automáticas em seu nome para empresas no
              caminho da rota e pode gerar custo em créditos. Você é responsável pelo
              conteúdo enviado.
            </p>
            {cienteErro && <p className="log-cfg__availability" role="alert">{cienteErro}</p>}
            <button
              type="button"
              className="btn-teal log-cfg__save"
              onClick={() => void confirmarCienteProspector()}
              disabled={cienteBusy}
            >
              <I d={ICONS.check} size={14} /> {cienteBusy ? "Registrando…" : "Ciente"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
