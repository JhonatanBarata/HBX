"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const SEGMENT_SUGGESTIONS = [
  "Lanchonetes",
  "Oficinas",
  "Clinicas",
  "Mercados",
  "Academias",
  "Pet shop",
];
const QUANTITY_OPTIONS = [5, 10, 15, 20];

type CurrentUser = {
  username?: string | null;
  name?: string | null;
  company?: { name?: string | null } | null;
  masterContext?: {
    active?: boolean;
    companyName?: string | null;
  } | null;
};

type NativeRuntime = {
  status: "online" | "degraded";
  code: string;
  message: string;
  googleApiKeyConfigured: boolean;
};

type LegacyRuntime = {
  status: "online" | "degraded" | "offline";
  code: string;
  message: string;
  publicUrl: string;
};

type RuntimeResponse = {
  native: NativeRuntime;
  legacy: LegacyRuntime;
};

type SearchResult = {
  name: string;
  phone: string;
  phoneDigits: string;
  probableWhatsApp: boolean;
  rating: number | null;
  reviews: number;
  address: string;
  website: string;
  googleMapsUrl: string;
};

type SearchResponse = {
  query: {
    city: string;
    segment: string;
    quantity: number;
  };
  results: SearchResult[];
};

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

function buildCompanyName(currentUser: CurrentUser | null) {
  return String(
    (currentUser?.masterContext?.active
      ? currentUser.masterContext.companyName
      : currentUser?.company?.name) || currentUser?.company?.name || "",
  ).trim();
}

function buildSpeakerName(currentUser: CurrentUser | null) {
  return String(currentUser?.name || currentUser?.username || "").trim();
}

function buildScriptText(result: SearchResult, city: string, segment: string, currentUser: CurrentUser | null) {
  const speaker = buildSpeakerName(currentUser) || "[SEU NOME]";
  const company = buildCompanyName(currentUser) || "[SUA EMPRESA]";
  return [
    `Oi, tudo bem? Aqui e ${speaker} da ${company}.`,
    `Vi a ${result.name} em ${city} e trabalho com solucao para ${segment.toLowerCase()}.`,
    "Posso te explicar em 1 minuto e ver se faz sentido para voces?",
  ].join(" ");
}

function buildWhatsAppUrl(result: SearchResult, scriptText: string) {
  const digits = normalizePhoneDigits(result.phoneDigits || result.phone);
  if (!digits) return "";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(scriptText)}`;
}

function buildCallUrl(result: SearchResult) {
  const digits = normalizePhoneDigits(result.phoneDigits || result.phone);
  if (!digits) return "";
  return `tel:+55${digits}`;
}

function buildLegacyEntryUrl(runtime: RuntimeResponse | null, currentUser: CurrentUser | null) {
  const publicUrl = runtime?.legacy?.publicUrl;
  if (!publicUrl || runtime?.legacy?.status === "offline") return null;

  try {
    const targetUrl = new URL(publicUrl, API_BASE_URL || window.location.origin);
    const userName = buildSpeakerName(currentUser);
    const companyName = buildCompanyName(currentUser);

    if (userName) targetUrl.searchParams.set("user_name", userName);
    if (companyName) targetUrl.searchParams.set("company_name", companyName);

    return targetUrl.toString();
  } catch {
    return null;
  }
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function WebscrapingClientPage() {
  const hasToken = useRequireAuth();
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("Lanchonetes");
  const [quantity, setQuantity] = useState(10);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [searching, setSearching] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;

    (async () => {
      setLoadingBootstrap(true);
      try {
        const [runtimePayload, profilePayload] = await Promise.all([
          apiFetch<RuntimeResponse>("/webscraping/runtime"),
          apiFetch<CurrentUser>("/profile/current-user"),
        ]);
        if (cancelled) return;
        setRuntime(runtimePayload);
        setCurrentUser(profilePayload);
        setPageError(null);
      } catch (error) {
        if (cancelled) return;
        setPageError(error instanceof Error ? error.message : "Falha ao carregar o modulo de prospeccao.");
      } finally {
        if (!cancelled) {
          setLoadingBootstrap(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const legacyUrl = useMemo(() => buildLegacyEntryUrl(runtime, currentUser), [runtime, currentUser]);
  const nativeReady = runtime?.native.status === "online";
  const legacyAvailable = Boolean(legacyUrl);

  async function handleSearch() {
    setSearchError(null);
    setFeedback(null);

    if (!city.trim()) {
      setSearchError("Informe a cidade.");
      return;
    }

    if (!segment.trim()) {
      setSearchError("Informe o segmento.");
      return;
    }

    setSearching(true);
    try {
      const payload = await apiFetch<SearchResponse>("/webscraping/search", {
        method: "POST",
        body: JSON.stringify({
          city: city.trim(),
          segment: segment.trim(),
          quantity,
        }),
      });
      setResults(payload.results || []);
    } catch (error) {
      setResults([]);
      setSearchError(error instanceof Error ? error.message : "Falha ao buscar contatos.");
    } finally {
      setSearching(false);
    }
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Prospeccao" description="Buscando sessao do usuario.">
        <section className={styles.emptyCard}>Carregando modulo...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Prospeccao"
      description="Buscar empresas por cidade e segmento com foco em telefone e acao rapida."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <h1 className={styles.heroTitle}>Buscar contatos com foco em telefone</h1>
              <p className={styles.heroText}>
                Cidade, segmento e quantidade entram primeiro. O resultado principal sai como nome da empresa, telefone e acoes operacionais rapidas.
              </p>
            </div>
            <div className={styles.runtimeBadges}>
              <span className={nativeReady ? styles.runtimeBadgeOk : styles.runtimeBadgeWarn}>
                {runtime?.native.message || "Runtime nativo"}
              </span>
              <span
                className={
                  runtime?.legacy.status === "online"
                    ? styles.runtimeBadgeOk
                    : runtime?.legacy.status === "offline"
                      ? styles.runtimeBadgeOff
                      : styles.runtimeBadgeWarn
                }
              >
                {runtime?.legacy.message || "Fallback legado"}
              </span>
            </div>
          </div>
          <div className={styles.heroMetrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Motor principal</span>
              <span className={styles.metricValue}>Tela nativa HBX</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Fallback</span>
              <span className={styles.metricValue}>{legacyAvailable ? "Motor legado disponivel" : "Sem fallback remoto"}</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Roteiro</span>
              <span className={styles.metricValue}>{buildCompanyName(currentUser) || "Personalizado pelo usuario"}</span>
            </div>
          </div>
        </section>

        {pageError ? <div className="alert alert-error">{pageError}</div> : null}
        {searchError ? <div className="alert alert-error">{searchError}</div> : null}
        {feedback ? <div className="alert alert-success">{feedback}</div> : null}

        <section className={styles.formCard}>
          <div className={styles.formFooter}>
            <div>
              <strong>Consulta principal</strong>
              <p className={styles.helperText}>Sem filtros secundarios como eixo central. O modulo prioriza velocidade operacional.</p>
            </div>
            <div className={styles.segmentChips}>
              {SEGMENT_SUGGESTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={segment === option ? styles.segmentChipActive : styles.segmentChip}
                  onClick={() => setSegment(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Cidade</span>
              <input
                className={styles.fieldInput}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Ex: Sao Paulo - SP"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Segmento</span>
              <input
                className={styles.fieldInput}
                value={segment}
                onChange={(event) => setSegment(event.target.value)}
                placeholder="Ex: Clinicas odontologicas"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Quantidade</span>
              <select
                className={styles.fieldSelect}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              >
                {QUANTITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} contatos
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.formFooter}>
            <p className={styles.helperText}>
              O backend nativo consulta Google Places e devolve contatos telefonicos deduplicados, ordenados por relevancia operacional.
            </p>
            <div className={styles.headerActions}>
              {legacyAvailable ? (
                <button type="button" className="btn btn-secondary" onClick={() => setLegacyOpen(true)}>
                  Abrir modo legado
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSearch()}
                disabled={loadingBootstrap || searching || !nativeReady}
              >
                {searching ? "Buscando..." : "Buscar contatos"}
              </button>
            </div>
          </div>
        </section>

        {(!nativeReady || searchError) && legacyAvailable ? (
          <section className={styles.fallbackCard}>
            <div className={styles.fallbackTop}>
              <div>
                <strong>Fallback controlado</strong>
                <p className={styles.helperText}>
                  O motor legado continua disponivel, mas encapsulado no HBX. Ele entra como contingencia quando a busca nativa nao estiver pronta ou falhar no ambiente atual.
                </p>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setLegacyOpen(true)}>
                  Abrir no HBX
                </button>
                <a className="btn btn-secondary" href={legacyUrl || undefined} target="_blank" rel="noreferrer">
                  Nova aba
                </a>
              </div>
            </div>
          </section>
        ) : null}

        <section className={styles.resultsCard}>
          <div className={styles.resultsTop}>
            <div>
              <strong>Resultados principais</strong>
              <p className={styles.helperText}>
                {results.length > 0
                  ? `${results.length} contatos retornados para ${segment} em ${city}.`
                  : "Os resultados vao aparecer aqui com nome, telefone e acoes rapidas."}
              </p>
            </div>
          </div>

          {results.length === 0 ? (
            <div className={styles.emptyText}>Nenhum contato carregado ainda.</div>
          ) : (
            <div className={styles.resultsGrid}>
              {results.map((result) => {
                const scriptText = buildScriptText(result, city, segment, currentUser);
                const whatsappUrl = buildWhatsAppUrl(result, scriptText);
                const callUrl = buildCallUrl(result);

                return (
                  <article key={`${result.name}-${result.phoneDigits}`} className={styles.resultCard}>
                    <div className={styles.resultHeader}>
                      <div>
                        <h2 className={styles.resultName}>{result.name || "Empresa sem nome"}</h2>
                        <p className={styles.resultMeta}>{result.address || "Endereco nao informado"}</p>
                      </div>
                      <span className={result.probableWhatsApp ? styles.runtimeBadgeOk : styles.runtimeBadge}>
                        {result.probableWhatsApp ? "WhatsApp provavel" : "Telefone"}
                      </span>
                    </div>

                    <div className={styles.phoneRow}>
                      <span className={styles.phoneValue}>{result.phone}</span>
                      <span className={styles.resultMeta}>
                        Nota {result.rating ?? "-"} • {result.reviews} avaliacoes
                      </span>
                    </div>

                    <div className={styles.cardActions}>
                      <a className="btn btn-primary" href={callUrl || undefined}>
                        Ligar
                      </a>
                      <a className="btn btn-secondary" href={whatsappUrl || undefined} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          void copyText(result.phone);
                          setFeedback(`Numero copiado: ${result.phone}`);
                        }}
                      >
                        Copiar numero
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          void copyText(scriptText);
                          setFeedback(`Roteiro copiado para ${result.name}.`);
                        }}
                      >
                        Copiar roteiro
                      </button>
                    </div>

                    <div className={styles.scriptBox}>
                      <span className={styles.scriptLabel}>Roteiro sugerido</span>
                      <p className={styles.scriptText}>{scriptText}</p>
                    </div>

                    {(result.website || result.googleMapsUrl) ? (
                      <div className={styles.resultLinks}>
                        {result.website ? (
                          <a className="btn btn-secondary" href={result.website} target="_blank" rel="noreferrer">
                            Site
                          </a>
                        ) : null}
                        {result.googleMapsUrl ? (
                          <a className="btn btn-secondary" href={result.googleMapsUrl} target="_blank" rel="noreferrer">
                            Maps
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {legacyOpen && legacyUrl ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <strong>Modo legado controlado</strong>
                <p className={styles.modalMeta}>
                  Shell interna do HBX para contingencia operacional. Continua secundaria em relacao a tela nativa.
                </p>
              </div>
              <div className={styles.modalActions}>
                <a className="btn btn-secondary" href={legacyUrl} target="_blank" rel="noreferrer">
                  Nova aba
                </a>
                <button type="button" className="btn btn-primary" onClick={() => setLegacyOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
            <div className={styles.modalBody}>
              <iframe title="Motor legado de webscraping" src={legacyUrl} className={styles.modalFrame} />
            </div>
          </div>
        </div>
      ) : null}
    </DashboardScaffold>
  );
}
