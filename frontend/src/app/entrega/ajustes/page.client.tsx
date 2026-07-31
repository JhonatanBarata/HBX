"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — aba "Ajustes" do app (skin entrega, cara de app).
// 1 coluna, app-like, ZERO jargão ERP. Reúne (o que no dashboard é o config
// ERP + o card admin + a página de instalar):
//   · REGRAS — editor do aviso WhatsApp (variáveis + preview ao vivo), toggle
//     "avisar", raio de chegada, velocidade média + toggle "gerar dia auto".
//     Reusa GET/PATCH /logistica/config (mesma lógica de preview do backend).
//   · FECHAR MÊS — POST /logistica/fechar-mes com confirmação simples.
//   · INSTALAR APP — QR do /entrega (gerador local, sem CDN) + copiar link.
//   · SAIR — logout único (lib/logout.ts): POST + limpeza + transição → landing.
// Toda cor/forma vive em entrega.css (.ent-* / A4); zero hex/inline (5 Leis).
// ================================================================

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { CascaLoading, isFullscreenActive, isFullscreenSupported, toggleCascaFullscreen } from "@/components/casca";
import { subscribeToThemeMode } from "@/components/hbx/shell";
import { applyThemeSoft, setThemeMode } from "@/components/hbx/theme-attributes";
import { apiFetch } from "@/lib/api";
import { logout } from "@/lib/logout";
import { soLogistica } from "@/lib/so-logistica";
import { fetchWhatsAppModalStatus } from "@/lib/whatsapp-connection-flow";
import { WhatsAppConnectButton } from "@/components/hbx/whatsapp-connect-button";
import { WhatsAppConectarSheet } from "@/components/casca/screens/whatsapp-conectar-sheet";
import { toLocalDigits } from "@/lib/br-phone";

import { QrCanvas } from "../../(app)/logistica/instalar/QrCanvas";
import { DIAS_SEMANA, parseDiasTrabalho } from "../entrega-api";
import {
  CATEGORIA_LABEL,
  type CategoriaModulo,
  type CategoriaModuloKey,
  getCategoriasModulos,
  refreshEntregaMods,
  salvarCategoriasModulos,
  useEntregaMods,
} from "../entrega-mods";
import { getIsAdmin, getIsSystemMaster } from "../entrega-user";
import { EntregaScaffold } from "../EntregaScaffold";
import {
  type LogisticaConfig,
  fecharMes,
  getConfig,
  patchConfig,
} from "../gestao-api";

// Template padrão (o que aparece quando ainda não gravou nada) — igual ao ERP.
const TEMPLATE_DEFAULT =
  "{saudacao} {cliente}! Sua entrega foi concluída: {quantidade} {produto}. Obrigado pela preferência! {empresa}";

const VARS: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "{saudacao}" },
  { key: "cliente", label: "{cliente}" },
  { key: "quantidade", label: "{quantidade}" },
  { key: "produto", label: "{produto}" },
  { key: "empresa", label: "{empresa}" },
];

const PREVIEW_VARS = {
  cliente: "Dona Maria",
  quantidade: "3",
  produto: "Galão 20L",
  empresa: "Água LTDA",
};

// S3 — opções do seletor de hora do resumo diário (hora local 0-23).
const HORAS_RESUMO = Array.from({ length: 24 }, (_, h) => h);

type WhatsAppCenterPayload = {
  company?: {
    contactPhone?: string | null;
  };
  center?: {
    status?: "NOT_CONNECTED" | "QR" | "OFFICIAL" | "ATTENTION" | string;
    official?: {
      connected?: boolean;
      displayNumber?: string | null;
    };
  };
};

function normalizePairingPhone(raw: string | null | undefined): string {
  const source = String(raw || "").trim();
  if (!source) return "";
  const jidMatch = source.match(/^\+?(\d{8,15})(?:@(?:s\.whatsapp\.net|c\.us))?$/i);
  const digits = (jidMatch ? jidMatch[1] : source.replace(/\D/g, "")).slice(0, 15);
  if (!digits) return "";
  if (source.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return "";
}

// Espelha renderTemplateAviso do backend (substitui variáveis, remove chave
// desconhecida, limpa espaço órfão). DETERMINÍSTICO p/ o exemplo — a prévia usa
// uma saudação FIXA de propósito: computar por horário (new Date()) no render
// divergia entre SSR e hidratação (o servidor renderiza num horário, o cliente
// hidrata em outro/timezone) e dava erro de hidratação do React (418). A saudação
// REAL do envio é resolvida por horário no backend; aqui é só amostra.
function renderPreview(template: string): string {
  const map: Record<string, string> = {
    saudacao: "Bom dia",
    cliente: PREVIEW_VARS.cliente,
    quantidade: PREVIEW_VARS.quantidade,
    produto: PREVIEW_VARS.produto,
    empresa: PREVIEW_VARS.empresa,
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

export function EntregaAjustes() {
  const [cfg, setCfg] = useState<LogisticaConfig | null>(null);
  const [template, setTemplate] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [waVerificando, setWaVerificando] = useState(false);
  const [waPronto, setWaPronto] = useState(false);
  const [waMsg, setWaMsg] = useState("Verificando WhatsApp…");
  const [waSessionId, setWaSessionId] = useState("");
  const [waDefaultPhone, setWaDefaultPhone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // LEI nº3 (fullscreen) — toggle também em Ajustes, além da oferta ao
  // "Iniciar rota". Estado local só de exibição (a lib central é a fonte).
  // isFullscreenActive() lê `document.fullscreenElement` → false no SSR, valor
  // real no cliente; ler DIRETO no lazy init divergia o estado do toggle entre
  // SSR e 1ª hidratação = erro 418 de hidratação estrutural. Mesmo padrão
  // SSR-safe do fsSuportado abaixo: inicia false (servidor) e sobe no mount.
  const [fsAtivo, setFsAtivo] = useState(false);
  // isFullscreenSupported() lê `document` → false no SSR, true no Chrome; chamá-lo
  // DIRETO no render inseria o botão "Tela cheia" só no cliente = hydration
  // mismatch estrutural. Mesmo padrão SSR-safe do InstalarApp (origin): inicia
  // false (valor do servidor) e faz upgrade no mount.
  const [fsSuportado, setFsSuportado] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecta suporte/estado de fullscreen (lê `document`, indisponível no SSR) 1x no mount; SSR e 1º render batem em false.
    setFsSuportado(isFullscreenSupported());
    setFsAtivo(isFullscreenActive());
  }, []);
  // FIX3 (dono 06/07): "o Rota não compartilha o modo claro/escuro" — este
  // toggle usa a MESMA setThemeMode/subscribeToThemeMode do Mais do
  // dashboard (theme-attributes.tsx), o MESMO data-theme-mode global no
  // <html> — nunca um 2º estado. entrega.css agora lê [data-theme-mode="dark"]
  // (era @media prefers-color-scheme, cego ao toggle do app).
  const modeAttr = useSyncExternalStore(
    subscribeToThemeMode,
    () => (typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme-mode") : null),
    () => null,
  );
  const escuro = modeAttr === "dark";

  // W4 (PR10072026) — seção "Módulos" (admin-only) + linha "Abrir o HBX
  // completo" quando só-logística (a volta que saiu da tab bar).
  const mods = useEntregaMods();
  const soLog = soLogistica(mods);
  const [admin, setAdmin] = useState(false);
  const [cats, setCats] = useState<CategoriaModulo[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void Promise.all([getIsAdmin(), getIsSystemMaster()]).then(([v, master]) => {
      if (!vivo) return;
      setAdmin(v);
      if (!v) return;
      // Master assumindo contexto de tenant: o backend barra
      // module-categories/options com 400 (o front já engolia, mas poluía o
      // console). Não dispara o request — cats fica null, a seção "Módulos"
      // não aparece (comportamento idêntico ao de hoje, sem o 400).
      if (master) return;
      getCategoriasModulos().then(
        (r) => {
          if (vivo) setCats(r.categories);
        },
        () => {
          /* sem opções (erro/gate): a seção não aparece */
        },
      );
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Toggle de categoria: otimista + rollback; POST leva o CONJUNTO COMPLETO
  // recomputado (todas as ligadas — inclui a `logistica` escondida, que
  // garante o mínimo de 1 exigido pelo backend). Depois de salvar,
  // refreshEntregaMods() faz a tab bar/header refletirem NA HORA.
  const toggleCategoria = useCallback(
    async (key: CategoriaModuloKey) => {
      if (!cats) return;
      const anterior = cats;
      const otimista = cats.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c));
      setCats(otimista);
      setSalvando(true);
      setSalvo(false);
      setErro(null);
      try {
        const ligadas = otimista.filter((c) => c.enabled && !c.locked).map((c) => c.key);
        await salvarCategoriasModulos(ligadas);
        await refreshEntregaMods();
        // Re-lê as opções (verdade do backend — módulo travado pode ter sido pulado).
        try {
          const r = await getCategoriasModulos();
          setCats(r.categories);
        } catch {
          /* mantém o otimista */
        }
        setSalvo(true);
        setTimeout(() => setSalvo(false), 1800);
      } catch (e) {
        setCats(anterior);
        setErro(e instanceof Error ? e.message : "Falha ao salvar");
      } finally {
        setSalvando(false);
      }
    },
    [cats],
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const c = await getConfig();
      setCfg(c);
      setTemplate(c.templateAviso ?? TEMPLATE_DEFAULT);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar as regras");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch/sync com API ao montar; efeito legítimo, não estado derivado.
    void carregar();
  }, [carregar]);

  const carregarWhatsApp = useCallback(async () => {
    setWaVerificando(true);
    try {
      const [modalResult, centerResult] = await Promise.allSettled([
        fetchWhatsAppModalStatus(),
        apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center"),
      ]);
      const modal = modalResult.status === "fulfilled" ? modalResult.value : null;
      const centerPayload = centerResult.status === "fulfilled" ? centerResult.value : null;
      const center = centerPayload?.center || null;
      const whatsOn = modal?.status === "connected";
      const metaOn = Boolean(center?.official?.connected) || String(center?.status || "").toUpperCase() === "OFFICIAL";
      const pronto = whatsOn || metaOn;
      const defaultPhone =
        normalizePairingPhone(modal?.data?.phone) ||
        normalizePairingPhone(center?.official?.displayNumber) ||
        normalizePairingPhone(centerPayload?.company?.contactPhone);
      setWaPronto(pronto);
      setWaSessionId(modal?.data?.tenantKey || "");
      setWaDefaultPhone(defaultPhone);
      if (whatsOn) {
        setWaMsg(modal?.data?.phone ? `WhatsApp conectado: ${modal.data.phone}` : "WhatsApp conectado");
      } else if (metaOn) {
        setWaMsg(center?.official?.displayNumber ? `Meta conectada: ${center.official.displayNumber}` : "Meta oficial conectada");
      } else {
        setWaMsg("Conecte o WhatsApp ou a Meta para ligar o aviso de entrega.");
      }
    } catch {
      setWaPronto(false);
      setWaSessionId("");
      setWaDefaultPhone("");
      setWaMsg("Não foi possível verificar WhatsApp/Meta agora.");
    } finally {
      setWaVerificando(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void carregarWhatsApp(), 0);
    return () => window.clearTimeout(timer);
  }, [carregarWhatsApp]);

  // Patch de 1 campo/toggle direto (sempre via /config). Feedback "salvo" some sozinho.
  const patch = useCallback(async (partial: Partial<LogisticaConfig>) => {
    setSalvando(true);
    setSalvo(false);
    setErro(null);
    try {
      const c = await patchConfig(partial);
      setCfg(c);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1800);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }, []);

  // TASK 4a — dias de trabalho: Set derivado direto de cfg.diasTrabalho (o
  // patch já devolve o cfg atualizado, então o chip reage sozinho — mesmo
  // padrão do toggle "Gerar entregas do dia sozinho" logo abaixo).
  const diasTrabalhoSet = useMemo(() => parseDiasTrabalho(cfg?.diasTrabalho), [cfg?.diasTrabalho]);

  // PR27072026 F1 (ROTA 3 NÍVEIS) — ausente (config antiga) = ADVANCED, mesmo
  // grandfathering do backend (serializeConfig). Basic vê Financeiro/Cobrança
  // por WhatsApp ACINZENTADOS com o selo do plano — nunca escondidos
  // (ver-mas-não-usar é o vendedor silencioso, decisão do dono 27/07). O
  // backend recusa a escrita de qualquer forma (updateConfig); isto aqui só
  // evita o admin apertar um toggle que vai voltar com erro.
  const nivelBasic = (cfg?.logisticaNivel ?? "ADVANCED") === "BASIC";

  const toggleDiaTrabalho = useCallback(
    (n: number) => {
      const atual = parseDiasTrabalho(cfg?.diasTrabalho);
      if (atual.has(n)) atual.delete(n);
      else atual.add(n);
      const csv = atual.size > 0 ? [...atual].sort((a, b) => a - b).join(",") : "";
      void patch({ diasTrabalho: csv });
    },
    [cfg?.diasTrabalho, patch],
  );

  // Insere {chave} na posição do cursor do textarea (ou no fim).
  const inserirVar = useCallback((key: string) => {
    const token = `{${key}}`;
    const el = taRef.current;
    if (!el) {
      setTemplate((t) => t + token);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    setTemplate(template.slice(0, start) + token + template.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }, [template]);

  const preview = useMemo(() => renderPreview(template), [template]);

  // Helper único (lib/logout.ts) — de quebra conserta o bug antigo daqui:
  // saía sem POST /auth/logout (sessão ficava viva no servidor).
  const sair = useCallback(() => {
    void logout();
  }, []);

  const onToggleFullscreen = useCallback(async () => {
    const ativo = await toggleCascaFullscreen();
    setFsAtivo(ativo);
  }, []);

  const onToggleModo = useCallback(() => {
    applyThemeSoft(() => setThemeMode(escuro ? "light" : "dark"));
  }, [escuro]);

  return (
    <EntregaScaffold
      title="Ajustes"
      headerActions={salvando ? <span className="ent-chip">salvando…</span> : salvo ? <span className="ent-chip is-on">salvo ✓</span> : null}
    >
      <div className="ent-form">
        {!cfg && !erro ? (
          <div className="ent-empty">
            <CascaLoading caption="Carregando" />
          </div>
        ) : null}

        {cfg ? (
          <>
            {/* ── REGRAS: aviso de WhatsApp ─────────────────────────────── */}
            <div className="ent-field-label ent-section">Aviso no WhatsApp</div>
            <button
              type="button"
              className="ent-toggle"
              onClick={() => {
                if (!waPronto) return;
                void patch({ avisoWhatsEnabled: !cfg.avisoWhatsEnabled });
              }}
              aria-pressed={cfg.avisoWhatsEnabled}
              disabled={salvando || waVerificando || !waPronto}
              title={waPronto ? undefined : "Conecte o WhatsApp ou a Meta para ativar este aviso"}
            >
              <span className="ent-toggle-label">Avisar o cliente na entrega</span>
              {/* Só aparece LIGADO quando há conexão — sem WhatsApp/Meta o aviso não sai,
                  então não pode parecer ligado (reprova do dono). */}
              <span className={`ent-switch${cfg.avisoWhatsEnabled && waPronto ? " is-on" : ""}`} aria-hidden="true" />
            </button>
            <div className="ent-hint">{waVerificando ? "Verificando WhatsApp/Meta…" : waMsg}</div>
            <CodigoVinculacaoWhatsApp
              sessionId={waSessionId}
              defaultPhone={waDefaultPhone}
              connected={waPronto}
              onGenerated={carregarWhatsApp}
            />

            <div className="ent-field">
              <span className="ent-field-label">Variáveis</span>
              <div className="ent-chips ent-chips--fit">
                {VARS.map((v) => (
                  <button type="button" key={v.key} className="ent-chip" onClick={() => inserirVar(v.key)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="ent-field">
              <span className="ent-field-label">Mensagem</span>
              <textarea
                ref={taRef}
                className="ent-input ent-textarea"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={4}
                aria-label="Mensagem do aviso de entrega"
              />
            </label>

            <div className="ent-preview">
              <span className="ent-preview-label">Prévia</span>
              <p className="ent-preview-body">{preview || "—"}</p>
            </div>

            <button
              type="button"
              className="ent-btn ent-btn--secondary"
              onClick={() => void patch({ templateAviso: template.trim() })}
              disabled={salvando}
            >
              Salvar mensagem
            </button>

            {/* ── AVISO-CHEGANDO: "tô chegando" a ~500m (independente do acima) ── */}
            <div className="ent-field-label ent-section">Aviso de chegada</div>
            <button
              type="button"
              className="ent-toggle"
              onClick={() => {
                if (!waPronto) return;
                void patch({ avisoChegandoEnabled: !cfg.avisoChegandoEnabled });
              }}
              aria-pressed={cfg.avisoChegandoEnabled}
              disabled={salvando || waVerificando || !waPronto}
              title={waPronto ? undefined : "Conecte o WhatsApp ou a Meta para ativar este aviso"}
            >
              <span className="ent-toggle-label">Avisar cliente quando estiver chegando</span>
              <span className={`ent-switch${cfg.avisoChegandoEnabled && waPronto ? " is-on" : ""}`} aria-hidden="true" />
            </button>
            <label className="ent-field">
              <span className="ent-field-label">Mensagem de chegada</span>
              <textarea
                className="ent-input ent-textarea"
                defaultValue={cfg.avisoChegandoTemplate ?? ""}
                onBlur={(e) => void patch({ avisoChegandoTemplate: e.target.value.trim() })}
                rows={3}
                aria-label="Mensagem do aviso de chegada"
              />
              {/* PR27072026 F3 (ROTA 3 NÍVEIS) — {eta} é NOVO: minutos estimados a
                  partir do etaAt da rota ("chegando" | "8 min" | "1h 5min"), aditivo
                  às variáveis que já existiam aqui. Igual às demais: se a rota ainda
                  não tem ETA calculado, a variável sai vazia (nunca "{eta}" cru). */}
              <span className="ent-hint">
                Variáveis: {"{saudacao} {cliente} {itens} {qtd} {produto} {empresa}"} e {"{eta}"} (chegada estimada — novo).
              </span>
            </label>
            <label className="ent-field">
              <span className="ent-field-label">Distância do aviso (m)</span>
              <input
                className="ent-input"
                type="number"
                inputMode="numeric"
                min={100}
                max={2000}
                defaultValue={cfg.avisoChegandoDistanciaM}
                onBlur={(e) =>
                  void patch({
                    avisoChegandoDistanciaM: Math.max(100, Math.min(2000, Number(e.target.value) || cfg.avisoChegandoDistanciaM)),
                  })
                }
                aria-label="Distância do aviso de chegada em metros"
              />
            </label>

            {/* ── REGRAS: rota + recorrência ────────────────────────────── */}
            <div className="ent-field-label ent-section">Rota e chegada</div>
            <div className="ent-field-row">
              <label className="ent-field ent-field--grow">
                <span className="ent-field-label">Raio de chegada (m)</span>
                <input
                  className="ent-input"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={5000}
                  defaultValue={cfg.raioChegadaM}
                  onBlur={(e) => void patch({ raioChegadaM: Math.max(10, Math.min(5000, Number(e.target.value) || cfg.raioChegadaM)) })}
                  aria-label="Raio de chegada em metros"
                />
              </label>
              <label className="ent-field ent-field--grow">
                <span className="ent-field-label">Velocidade (km/h)</span>
                <input
                  className="ent-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  defaultValue={cfg.velocidadeMediaKmH}
                  onBlur={(e) => void patch({ velocidadeMediaKmH: Math.max(1, Math.min(200, Number(e.target.value) || cfg.velocidadeMediaKmH)) })}
                  aria-label="Velocidade média em km/h"
                />
              </label>
            </div>

            <button
              type="button"
              className="ent-toggle"
              onClick={() => void patch({ gerarDiaAutomatico: !cfg.gerarDiaAutomatico })}
              aria-pressed={cfg.gerarDiaAutomatico}
              disabled={salvando}
            >
              <span className="ent-toggle-label">Gerar entregas do dia sozinho</span>
              <span className={`ent-switch${cfg.gerarDiaAutomatico ? " is-on" : ""}`} aria-hidden="true" />
            </button>

            {admin ? (
              <>
                <div className="ent-field-label ent-section">Comprovante de entrega</div>
                <div className="ent-hint">
                  Escolha uma ou mais confirmações. O entregador só conclui a parada depois de cumprir todas.
                </div>
                <button
                  type="button"
                  className="ent-toggle"
                  onClick={() => void patch({ comprovanteFotoObrigatoria: !cfg.comprovanteFotoObrigatoria })}
                  aria-pressed={cfg.comprovanteFotoObrigatoria}
                  disabled={salvando}
                >
                  <span className="ent-toggle-label">Exigir foto</span>
                  <span className={`ent-switch${cfg.comprovanteFotoObrigatoria ? " is-on" : ""}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ent-toggle"
                  onClick={() => void patch({ comprovanteAssinaturaObrigatoria: !cfg.comprovanteAssinaturaObrigatoria })}
                  aria-pressed={cfg.comprovanteAssinaturaObrigatoria}
                  disabled={salvando}
                >
                  <span className="ent-toggle-label">Exigir assinatura</span>
                  <span className={`ent-switch${cfg.comprovanteAssinaturaObrigatoria ? " is-on" : ""}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ent-toggle"
                  onClick={() => void patch({ comprovanteCodigoObrigatorio: !cfg.comprovanteCodigoObrigatorio })}
                  aria-pressed={cfg.comprovanteCodigoObrigatorio}
                  disabled={salvando}
                >
                  <span className="ent-toggle-label">Exigir código de 6 dígitos</span>
                  <span className={`ent-switch${cfg.comprovanteCodigoObrigatorio ? " is-on" : ""}`} aria-hidden="true" />
                </button>
              </>
            ) : null}

            {/* ── TASK 4a — dias de trabalho (multiselect ISO 1..7, chips que quebram em linha) ── */}
            <div className="ent-field-label ent-section">Dias de trabalho</div>
            <div className="ent-chips ent-chips--fit">
              {DIAS_SEMANA.map((d) => {
                const on = diasTrabalhoSet.has(d.n);
                return (
                  <button
                    type="button"
                    key={d.n}
                    className={`ent-chip${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggleDiaTrabalho(d.n)}
                    disabled={salvando}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* ── FECHAR MÊS ─────────────────────────────────────────────── */}
            <div className="ent-field-label ent-section">Cobrança</div>
            <FecharMesBtn />

            {/* MULTILOCAL 10/07 (W-E) — liga o financeiro do cliente (saldo,
                fiado, fechamento) no /entrega. Admin-only: MESMO gate da seção
                "Módulos" abaixo (admin) — o entregador comum não decide isso
                pela empresa. patch() já é o helper único da tela; o backend
                PATCH /logistica/config já aceita moduloFinanceiroAtivo. */}
            {admin ? (
              <>
                <button
                  type="button"
                  className="ent-toggle"
                  onClick={() => void patch({ moduloFinanceiroAtivo: !cfg.moduloFinanceiroAtivo })}
                  aria-pressed={cfg.moduloFinanceiroAtivo}
                  disabled={salvando || nivelBasic}
                  title={nivelBasic ? "Disponível no plano Advanced" : undefined}
                >
                  <span className="ent-toggle-label">Financeiro do cliente</span>
                  <span className={`ent-switch${cfg.moduloFinanceiroAtivo ? " is-on" : ""}`} aria-hidden="true" />
                </button>
                {/* PR27072026 F1 — selo central (kit.css .plano-selo), ver-mas-não-usar. */}
                {nivelBasic ? <span className="plano-selo">Disponível no Advanced</span> : null}
              </>
            ) : null}

            {/* ── F1 — PIX NA ENTREGA (BR Code direto, taxa zero) ─────────── */}
            <div className="ent-field-label ent-section">Pix na entrega</div>
            <label className="ent-field">
              <span className="ent-field-label">Chave Pix</span>
              <input
                className="ent-input"
                type="text"
                defaultValue={cfg.pixChave ?? ""}
                onBlur={(e) => void patch({ pixChave: e.target.value.trim() })}
                placeholder="email, +55… ou chave aleatória"
                aria-label="Chave Pix do recebedor"
              />
            </label>
            <div className="ent-field-row">
              <label className="ent-field ent-field--grow">
                <span className="ent-field-label">Nome (recebedor)</span>
                <input
                  className="ent-input"
                  type="text"
                  maxLength={25}
                  defaultValue={cfg.pixNome ?? ""}
                  onBlur={(e) => void patch({ pixNome: e.target.value.trim() })}
                  aria-label="Nome do recebedor do Pix"
                />
              </label>
              <label className="ent-field ent-field--grow">
                <span className="ent-field-label">Cidade</span>
                <input
                  className="ent-input"
                  type="text"
                  maxLength={15}
                  defaultValue={cfg.pixCidade ?? ""}
                  onBlur={(e) => void patch({ pixCidade: e.target.value.trim() })}
                  aria-label="Cidade do recebedor do Pix"
                />
              </label>
            </div>

            {/* ── S2 — COBRANÇA POR WHATSAPP (dormente): o card SÓ existe quando o
                backend diz que a feature global está ligada (cobrancaWhatsDisponivel,
                derivado de HBX_COBRANCA_WHATS_ENABLED). Admin-only, mesmo gate do
                "Financeiro do cliente". Toggle do TENANT: aviso ao lançar a cobrança
                + lembrete no vencimento, com o Pix acima no copia-e-cola. */}
            {admin && cfg.cobrancaWhatsDisponivel ? (
              <>
                <div className="ent-field-label ent-section">Cobrança por WhatsApp</div>
                <button
                  type="button"
                  className="ent-toggle"
                  onClick={() => void patch({ cobrancaWhatsAtiva: !cfg.cobrancaWhatsAtiva })}
                  aria-pressed={!!cfg.cobrancaWhatsAtiva}
                  disabled={salvando || nivelBasic}
                  title={nivelBasic ? "Disponível no plano Advanced" : undefined}
                >
                  <span className="ent-toggle-label">Avisar cobrança e vencimento</span>
                  <span className={`ent-switch${cfg.cobrancaWhatsAtiva ? " is-on" : ""}`} aria-hidden="true" />
                </button>
                {/* PR27072026 F1 — selo central (kit.css .plano-selo), ver-mas-não-usar. */}
                {nivelBasic ? <span className="plano-selo">Disponível no Advanced</span> : null}
              </>
            ) : null}

            {/* ── S3 — RESUMO DO DIA NO WHATSAPP (dormente): card SÓ existe quando o
                backend diz que a feature global está ligada (resumoDiarioDisponivel,
                derivado de HBX_RESUMO_DIARIO_ENABLED). Admin-only, mesmo gate do card
                S2 acima. Toggle do TENANT + hora do envio; o resumo vai pro WhatsApp
                verificado do cadastro, pelo chip da própria empresa. */}
            {admin && cfg.resumoDiarioDisponivel ? (
              <>
                <div className="ent-field-label ent-section">Resumo do dia no WhatsApp</div>
                <button
                  type="button"
                  className="ent-toggle"
                  onClick={() => void patch({ resumoDiarioAtivo: !cfg.resumoDiarioAtivo })}
                  aria-pressed={!!cfg.resumoDiarioAtivo}
                  disabled={salvando}
                >
                  <span className="ent-toggle-label">Receber resumo diário</span>
                  <span className={`ent-switch${cfg.resumoDiarioAtivo ? " is-on" : ""}`} aria-hidden="true" />
                </button>
                {cfg.resumoDiarioAtivo ? (
                  <label className="ent-field">
                    <span className="ent-field-label">Horário</span>
                    <select
                      className="ent-input"
                      value={String(cfg.resumoDiarioHora ?? 7)}
                      onChange={(e) => void patch({ resumoDiarioHora: Number(e.target.value) })}
                      disabled={salvando}
                      aria-label="Horário do resumo diário"
                    >
                      {HORAS_RESUMO.map((h) => (
                        <option key={h} value={h}>{`${h}h`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {erro ? <div className="ent-erro">{erro}</div> : null}

        {/* ── TELA (LEI nº3 fullscreen + FIX3 modo claro/escuro compartilhado
            com o dashboard — MESMO estado, nunca 2 toggles independentes) ── */}
        <div className="ent-field-label ent-section">Tela</div>
        <button
          type="button"
          className="ent-toggle"
          onClick={onToggleModo}
          aria-pressed={escuro}
        >
          <span className="ent-toggle-label">Modo escuro</span>
          <span className={`ent-switch${escuro ? " is-on" : ""}`} aria-hidden="true" />
        </button>
        {fsSuportado ? (
          <button
            type="button"
            className="ent-toggle"
            onClick={() => void onToggleFullscreen()}
            aria-pressed={fsAtivo}
          >
            <span className="ent-toggle-label">Tela cheia</span>
            <span className={`ent-switch${fsAtivo ? " is-on" : ""}`} aria-hidden="true" />
          </button>
        ) : null}

        {/* ── W4 — MÓDULOS (admin-only): liga/desliga categorias do tenant.
            `locked` (teto do master) e a própria `logistica` não aparecem. ── */}
        {admin && cats ? (
          <>
            <div className="ent-field-label ent-section">Módulos</div>
            {cats
              .filter((c) => !c.locked && c.key !== "logistica")
              .map((c) => (
                <button
                  type="button"
                  key={c.key}
                  className="ent-toggle"
                  onClick={() => void toggleCategoria(c.key)}
                  aria-pressed={c.enabled}
                  disabled={salvando}
                >
                  <span className="ent-toggle-label">{CATEGORIA_LABEL[c.key]}</span>
                  <span className={`ent-switch${c.enabled ? " is-on" : ""}`} aria-hidden="true" />
                </button>
              ))}
          </>
        ) : null}

        {/* ── INSTALAR APP ─────────────────────────────────────────────── */}
        <div className="ent-field-label ent-section">Instalar o app</div>
        <InstalarApp />

        {/* ── W4 — só-logística: a volta pro HBX que saiu da tab bar. ────
            S1 MODO DISTRIBUIDORA: o destino é rota NEUTRA (/empresas) — o
            /dashboard agora redireciona de volta pro /entrega no modo
            (desktop via SoLogisticaGate, mobile via mobile-shell), o que
            matava este escape em loop. */}
        {soLog ? (
          <Link href="/empresas" className="ent-btn ent-btn--ghost">
            Abrir o HBX completo
          </Link>
        ) : null}

        {/* ── SAIR ─────────────────────────────────────────────────────── */}
        <button type="button" className="ent-btn ent-btn--ghost ent-sair" onClick={sair}>
          Sair da conta
        </button>
      </div>
    </EntregaScaffold>
  );
}

// ── FECHAR MÊS ────────────────────────────────────────────────────────────────
function FecharMesBtn() {
  const [fechando, setFechando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fechar = useCallback(async () => {
    if (typeof window !== "undefined" && !window.confirm("Fechar o mês dos clientes mensais? Gera uma fatura por cliente.")) {
      return;
    }
    setFechando(true);
    setMsg(null);
    try {
      const r = await fecharMes();
      setMsg(r.chargesCriados > 0 ? `${r.chargesCriados} fatura${r.chargesCriados === 1 ? "" : "s"} gerada${r.chargesCriados === 1 ? "" : "s"}` : "Nada a fechar");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao fechar o mês");
    } finally {
      setFechando(false);
    }
  }, []);

  return (
    <>
      <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void fechar()} disabled={fechando}>
        {fechando ? "Fechando…" : "Fechar o mês"}
      </button>
      {msg ? <div className="ent-hint">{msg}</div> : null}
    </>
  );
}

// ── CÓDIGO DE VINCULAÇÃO WHATSAPP ────────────────────────────────────────────
// Wrapper fino: usa o MESMO botão + a MESMA folha de conexão dos outros modos
// (mobile atendimento). O painel (código/QR/status + máscara BR) vive em
// WhatsAppConectarSheet; aqui só o disparo. Prefill do telefone = contato da
// empresa (dígitos locais, sem +55 — o +55 entra no envio).
function CodigoVinculacaoWhatsApp({ defaultPhone, connected, onGenerated }: {
  sessionId: string;
  defaultPhone: string;
  connected: boolean;
  onGenerated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ent-link-code">
      <WhatsAppConnectButton
        onClick={() => setOpen(true)}
        label={connected ? "Conectado" : "Conectar WhatsApp"}
        connected={connected}
      />
      <WhatsAppConectarSheet
        open={open}
        onClose={() => setOpen(false)}
        onConnected={() => { setOpen(false); void onGenerated(); }}
        defaultPhoneDigits={toLocalDigits(defaultPhone)}
      />
    </div>
  );
}

// ── INSTALAR APP (QR local + copiar link) ─────────────────────────────────────
function InstalarApp() {
  const [origin, setOrigin] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê window.location (indisponível no SSR) 1x no mount; efeito legítimo, não estado derivado.
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = useMemo(() => (origin ? `${origin.replace(/\/+$/, "")}/entrega` : ""), [origin]);

  const copiar = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado: o link fica visível pra cópia manual */
    }
  }, [url]);

  return (
    <div className="ent-qr">
      {url ? (
        <div className="ent-qr-code">
          <QrCanvas text={url} size={200} />
        </div>
      ) : null}
      <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void copiar()} disabled={!url}>
        {copiado ? "Link copiado ✓" : "Copiar link do app"}
      </button>
    </div>
  );
}
