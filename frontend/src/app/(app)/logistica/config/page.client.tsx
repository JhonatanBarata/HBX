"use client";

// LOGÍSTICA-MOBILE M5 — regras do admin (editor da config da empresa).
// Contratos reais (company-scoped, JWT; PATCH é ADMIN-only no backend):
//   - GET   /logistica/config        → LogisticaConfig
//   - PATCH /logistica/config {...}   → LogisticaConfig
//   - PATCH /logistica/config/modo-rota {trackingAtivo?, modoRotaPadrao?}
//     → LogisticaConfig (26/07: o modo comercial saiu do PATCH genérico pra
//       fechar a porta do APK velho; este painel é o único caminho legítimo)
//
// O editor cobre:
//   · Template do aviso WhatsApp "entregue" (variáveis {saudacao} {cliente}
//     {itens} {qtd} {produto}) com PREVIEW AO VIVO (mesma lógica do backend,
//     abaixo em renderPreview — dados de exemplo).
//   · Toggles: avisar global, cobrança na entrega, gerar dia automático.
//   · Parâmetros de rota: raio de chegada (m), velocidade média (km/h), tempo de
//     parada (min).
//
// Design system (5 Leis): visual todo em classe central (.log-cfg-* em screens.css
// + kit .field-dark/.btn-teal/.btn-ghost/.ctt-toggle). Inline aqui = só layout.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

type RouteMode = "ESSENTIAL" | "TRACKED";

// PR28072026 HÍBRIDO (28/07) — o plano da empresa: mensalidade + franquia de
// paradas DESTE mês. Admin-only no backend (carrega valor — LEI DO VENDEDOR).
type PlanoRota = {
  nivel: "BASIC" | "ADVANCED" | "FULL";
  titulo: string;
  precoMensal: number;
  paradasInclusas: number;
  paradasUsadas: number;
  paradasRestantes: number;
};

/** "R$ 199/mês" — sem centavos quando é inteiro (preço redondo é o normal). */
function fmtMoedaMes(v: number): string {
  const n = Number(v) || 0;
  const corpo = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return `R$ ${corpo}/mês`;
}

type Config = {
  trackingAtivo?: boolean;
  trackingDisponivel?: boolean;
  modoRotaPadrao?: RouteMode;
  avisoWhatsEnabled: boolean;
  templateAviso: string | null;
  raioChegadaM: number;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  cobrancaNaEntrega?: boolean;
  moduloFinanceiroAtivo?: boolean;
  moduloRecoveryAtivo?: boolean;
  gerarDiaAutomatico: boolean;
  comprovanteFotoObrigatoria: boolean;
  comprovanteAssinaturaObrigatoria: boolean;
  comprovanteCodigoObrigatorio: boolean;
  // PR27072026 F1 (ROTA 3 NÍVEIS) — nível do plano; ausente (config antiga) =
  // ADVANCED no consumo abaixo (mesmo grandfathering do backend).
  logisticaNivel?: "BASIC" | "ADVANCED" | "FULL";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  // PR28072026 HÍBRIDO — plano + franquia do mês. Best-effort: falhar aqui não
  // pode derrubar a tela de regras (o bloco simplesmente não aparece).
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

  // Patch de 1 toggle/campo direto (otimista com recarga). `path` existe porque
  // o MODO DA ROTA mudou de endereço em 26/07: ele tem endpoint próprio
  // (/logistica/config/modo-rota) pra que o APK velho em campo, que mandava
  // trackingAtivo/modoRotaPadrao no PATCH genérico, pare de conseguir trocar o
  // modo. Este painel (só do billing owner, no PC) é o caminho legítimo.
  const patchAt = useCallback(
    async (path: string, partial: Record<string, unknown>) => {
      setSaving(true);
      setSavedMsg(null);
      try {
        const res = await apiFetch<Config>(path, {
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

  const patch = useCallback(
    (partial: Partial<Config>) => patchAt("/logistica/config", partial),
    [patchAt],
  );

  // Modo das novas rotas — endpoint separado (ver comentário acima).
  const patchModoRota = useCallback(
    (partial: { trackingAtivo?: boolean; modoRotaPadrao?: RouteMode }) =>
      patchAt("/logistica/config/modo-rota", partial),
    [patchAt],
  );

  const salvarTemplate = useCallback(() => {
    patch({ templateAviso: template.trim() });
  }, [patch, template]);

  const preview = useMemo(() => renderPreview(template), [template]);

  // PR27072026 F1 (ROTA 3 NÍVEIS) — Rastreado é exclusivo do plano Full;
  // ausente (config antiga) = ADVANCED, mesmo grandfathering do backend. O
  // backend recusa a escrita de qualquer forma (updateRouteMode); isto aqui
  // só evita o admin escolher um modo que vai voltar com erro.
  const nivelFull = (cfg?.logisticaNivel ?? "ADVANCED") === "FULL";

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
            {/* ── PR28072026 HÍBRIDO — o plano e o que ele já cobriu no mês ──
                É o gatilho de upgrade: o dono vê a franquia acabando ANTES de
                começar a queimar crédito, e sabe exatamente o que acontece
                depois. Zero textão: 1 número grande e 1 frase. */}
            {plano && plano.paradasInclusas > 0 && (
              <div className="log-cfg__block">
                <div className="log-cfg__block-head">
                  <div className="log-cfg__heading-copy">
                    <strong className="log-cfg__block-title">
                      {plano.titulo} · {fmtMoedaMes(plano.precoMensal)}
                    </strong>
                    <span className="log-cfg__switch-hint">
                      {plano.paradasUsadas} de {plano.paradasInclusas} paradas do plano usadas neste mês
                      {plano.paradasRestantes > 0
                        ? ` — restam ${plano.paradasRestantes}.`
                        : " — a partir daqui cada parada consome crédito."}
                    </span>
                  </div>
                  {plano.paradasRestantes === 0 && <span className="plano-selo">Franquia do mês esgotada</span>}
                </div>
              </div>
            )}

            {/* ── Modo comercial da rota — somente dono/master ────────────── */}
            {billingOwner && (
              <div className="log-cfg__block">
                <div className="log-cfg__block-head">
                  <div className="log-cfg__heading-copy">
                    <strong className="log-cfg__block-title">Modo das novas rotas</strong>
                    <span className="log-cfg__switch-hint">Escolha como o consumo de créditos será calculado.</span>
                  </div>
                  <label className="ctt-toggle ctt-toggle--inline">
                    <input
                      type="checkbox"
                      checked={!!cfg.trackingAtivo}
                      disabled={saving}
                      onChange={(e) => patchModoRota({ trackingAtivo: e.target.checked })}
                      aria-describedby="tracking-availability"
                    />
                    <span>{cfg.trackingAtivo ? "Rastreamento permitido" : "Rastreamento desligado"}</span>
                  </label>
                </div>

                <div className="log-cfg__mode-grid" role="radiogroup" aria-label="Modo padrão das novas rotas">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={(cfg.modoRotaPadrao ?? "ESSENTIAL") === "ESSENTIAL"}
                    className={`log-cfg__mode${(cfg.modoRotaPadrao ?? "ESSENTIAL") === "ESSENTIAL" ? " is-selected" : ""}`}
                    disabled={saving}
                    onClick={() => patchModoRota({ modoRotaPadrao: "ESSENTIAL" })}
                  >
                    <span className="log-cfg__mode-title">Rota Essencial</span>
                    <span className="log-cfg__mode-copy">Cobra por parada da rota.</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cfg.modoRotaPadrao === "TRACKED"}
                    className={`log-cfg__mode${cfg.modoRotaPadrao === "TRACKED" ? " is-selected" : ""}`}
                    disabled={saving || !cfg.trackingDisponivel || !cfg.trackingAtivo || !nivelFull}
                    aria-describedby="tracking-availability"
                    onClick={() => patchModoRota({ modoRotaPadrao: "TRACKED" })}
                  >
                    <span className="log-cfg__mode-title">Rota Rastreada</span>
                    <span className="log-cfg__mode-copy">2 créditos por entrega concluída durante uma sessão válida de rastreamento.</span>
                    {/* PR27072026 F1 — selo central (kit.css .plano-selo), ver-mas-não-usar. */}
                    {!nivelFull && <span className="plano-selo">Disponível no Full</span>}
                  </button>
                </div>

                <p
                  id="tracking-availability"
                  className={`log-cfg__availability${cfg.trackingDisponivel && nivelFull ? " is-available" : ""}`}
                  role="status"
                >
                  {!cfg.trackingDisponivel
                    ? "Rastreamento indisponível globalmente. A preferência pode ficar salva para uma ativação futura."
                    : !nivelFull
                      ? "Rastreamento é do plano Full."
                      : (cfg.trackingAtivo
                        ? "Rastreamento disponível para novas rotas."
                        : "Ligue o rastreamento para liberar a Rota Rastreada.")}
                </p>
                <p className="log-cfg__warning">
                  O modo é congelado ao iniciar a rota e não pode ser alterado durante a sessão.
                </p>
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

            {/* ── Toggles gerais ─────────────────────────────────────────────── */}
            <div className="log-cfg__block">
              <strong className="log-cfg__block-title">{billingOwner ? "Cobrança e recorrência" : "Recorrência"}</strong>
              {billingOwner && (
                <label className="log-cfg__switch">
                  <input
                    type="checkbox"
                    checked={!!cfg.cobrancaNaEntrega}
                    onChange={(e) => patch({ cobrancaNaEntrega: e.target.checked })}
                  />
                  <span className="log-cfg__switch-txt">
                    <span className="log-cfg__switch-name">Cobrança na entrega</span>
                    <span className="log-cfg__switch-hint">Registra o recebimento no momento da entrega.</span>
                  </span>
                </label>
              )}
              <label className="log-cfg__switch">
                <input
                  type="checkbox"
                  checked={cfg.gerarDiaAutomatico}
                  onChange={(e) => patch({ gerarDiaAutomatico: e.target.checked })}
                />
                <span className="log-cfg__switch-txt">
                  <span className="log-cfg__switch-name">Gerar entregas do dia automaticamente</span>
                  <span className="log-cfg__switch-hint">O sistema materializa as entregas recorrentes 1×/dia.</span>
                </span>
              </label>
            </div>

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
                  <span className="log-cfg__switch-hint">O entregador fotografa o comprovante ou o local da entrega.</span>
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
                  <span className="log-cfg__switch-hint">O recebedor assina com o dedo no celular do entregador.</span>
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
                  <span className="log-cfg__switch-hint">O admin gera o código e o cliente informa ao entregador.</span>
                </span>
              </label>
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
              <p className="log-cfg__note">Usados no cálculo da rota (ordem das paradas) e da previsão de término (ETA).</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
