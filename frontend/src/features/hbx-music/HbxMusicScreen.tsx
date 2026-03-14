"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HBX_MUSIC_PLAN_PRICE_CENTS } from "./mock-data";
import { useHbxMusicApp } from "./useHbxMusicApp";
import styles from "./hbx-music.module.css";
import type {
  HbxMusicRecommendation,
  HbxMusicScreenKey,
  HbxMusicSubscriptionStatus,
  HbxMusicTrack,
} from "./types";

type HbxMusicScreenProps = {
  screen: HbxMusicScreenKey;
};

const NAV_ITEMS: Array<{ href: string; label: string; screen: HbxMusicScreenKey }> = [
  { href: "/hbx-music", label: "Home", screen: "home" },
  { href: "/hbx-music/updates", label: "Hoje", screen: "updates" },
  { href: "/hbx-music/library", label: "Biblioteca", screen: "library" },
  { href: "/hbx-music/explore", label: "Explorar", screen: "explore" },
  { href: "/hbx-music/player", label: "Player", screen: "player" },
  { href: "/hbx-music/profile", label: "Perfil", screen: "profile" },
];

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function mapSubscriptionStatusLabel(status: HbxMusicSubscriptionStatus) {
  if (status === "trialing") return "Trial";
  if (status === "active") return "Assinatura ativa";
  if (status === "past_due") return "Pagamento atrasado";
  if (status === "canceled") return "Cancelada";
  return "Trial expirado";
}

function formatRemainingTrial(targetDate: string) {
  const diffMs = new Date(targetDate).getTime() - Date.now();
  if (diffMs <= 0) return "Trial encerrado";
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} dia${days === 1 ? "" : "s"} restantes`;
  if (hours > 0) return `${hours} hora${hours === 1 ? "" : "s"} restantes`;
  return `${Math.max(1, minutes)} min restantes`;
}

function buildCoverStyle(track: HbxMusicTrack) {
  return {
    ["--cover-start" as string]: track.coverGradient[0],
    ["--cover-end" as string]: track.coverGradient[1],
  };
}

function TrackCard({
  track,
  reason,
  actionLabel,
}: {
  track: HbxMusicTrack;
  reason?: string;
  actionLabel?: string;
}) {
  return (
    <article className={styles.trackCard}>
      <div className={styles.trackCover} style={buildCoverStyle(track)} />
      <div className={styles.trackMeta}>
        <strong>{track.title}</strong>
        <span>
          {track.artist} • {track.genre}
        </span>
      </div>
      <div className={styles.tinyMeta}>
        <span className={styles.tinyPill}>{track.country}</span>
        <span className={styles.tinyPill}>{formatDuration(track.duration)}</span>
        <span className={styles.tinyPill}>{track.sourceType}</span>
      </div>
      {reason ? <p className={styles.reasonText}>{reason}</p> : null}
      {actionLabel ? (
        <div className={styles.trackActions}>
          <button type="button" className={styles.ghostButton}>
            {actionLabel}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function UpdateRow({
  recommendation,
  track,
  selected,
  onToggle,
}: {
  recommendation: HbxMusicRecommendation;
  track: HbxMusicTrack;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article className={`${styles.updateRow} ${selected ? styles.selectedRow : ""}`}>
      <div className={styles.trackCover} style={buildCoverStyle(track)} />
      <div className={styles.trackMeta}>
        <strong>{track.title}</strong>
        <span>
          {track.artist} • {track.genre}
        </span>
        <p className={styles.reasonText}>{recommendation.reason}</p>
        <div className={styles.trackActions}>
          <button type="button" className={styles.pillButton} onClick={onToggle}>
            {selected ? "Selecionada" : "Selecionar"}
          </button>
          <button type="button" className={styles.ghostButton}>
            Adicionar a biblioteca
          </button>
          <button type="button" className={styles.ghostButton}>
            Preparar offline
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HbxMusicScreen({ screen }: HbxMusicScreenProps) {
  const { hasToken, loading, error, snapshot, accessDenied, moduleSyncPending } = useHbxMusicApp();
  const [selectedUpdateIds, setSelectedUpdateIds] = useState<Record<string, boolean>>({});

  const updatesWithTracks = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.todayUpdates
      .map((recommendation) => {
        const track = snapshot.tracks.find((item) => item.id === recommendation.trackId);
        if (!track) return null;
        return { recommendation, track };
      })
      .filter((item): item is { recommendation: HbxMusicRecommendation; track: HbxMusicTrack } => Boolean(item));
  }, [snapshot]);

  const selectedUpdatesCount = useMemo(() => {
    return Object.values(selectedUpdateIds).filter(Boolean).length;
  }, [selectedUpdateIds]);

  if (hasToken === null || loading) {
    return (
      <main className={styles.lockState}>
        <section className={styles.lockCard}>
          <p className={styles.eyebrow}>HBX Music</p>
          <h1>Carregando modulo premium...</h1>
          <p className={styles.panelText}>
            Montando biblioteca mockada, trial de 30 dias e camadas de recomendacao.
          </p>
        </section>
      </main>
    );
  }

  if (!hasToken) return null;

  if (accessDenied) {
    return (
      <main className={styles.lockState}>
        <section className={styles.lockCard}>
          <p className={styles.eyebrow}>HBX Music bloqueado</p>
          <h1>O seu usuario ainda nao tem acesso a este modulo.</h1>
          <p className={styles.panelText}>
            Libere o modulo no Master ou reinicie o backend para sincronizar o catalogo de modulos.
          </p>
          <div className={styles.bottomActions}>
            <Link href="/dashboard" className={styles.primaryButton}>
              Voltar ao dashboard
            </Link>
            <Link href="/dashboard/master" className={styles.ghostButton}>
              Abrir Master
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className={styles.lockState}>
        <section className={styles.lockCard}>
          <p className={styles.eyebrow}>HBX Music</p>
          <h1>Falha ao montar a V1 do modulo.</h1>
          <p className={styles.panelText}>{error || "Snapshot indisponivel."}</p>
          <div className={styles.bottomActions}>
            <Link href="/dashboard" className={styles.primaryButton}>
              Voltar
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const heroTrack = snapshot.currentTrack || snapshot.topNational[0] || snapshot.tracks[0];

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <section className={styles.device}>
          <div className={styles.deviceTop}>
            <div>
              <p className={styles.eyebrow}>HBX Music</p>
              <h1 className={styles.headline}>Mobile first, premium e pronto para trial.</h1>
              <p className={styles.subhead}>
                Biblioteca pessoal, recomendacao diaria e camada de billing desacoplada ja desenhadas
                para evoluir com Firebase e assinatura recorrente.
              </p>
              <div className={styles.badgeRow}>
                <span className={styles.badge}>{mapSubscriptionStatusLabel(snapshot.subscription.status)}</span>
                <span className={styles.badge}>{formatRemainingTrial(snapshot.subscription.trialEndAt)}</span>
                <span className={styles.badge}>Plano {formatCurrency(HBX_MUSIC_PLAN_PRICE_CENTS)}/mes</span>
              </div>
            </div>
          </div>

          <div className={styles.coverShowcase}>
            <div className={styles.coverArt} style={buildCoverStyle(heroTrack)}>
              <div className={styles.coverMeta}>
                <strong>{heroTrack.title}</strong>
                <span>{heroTrack.artist}</span>
              </div>
            </div>
            <div className={styles.nowPlaying}>
              <div>
                <p className={styles.eyebrow}>Agora em destaque</p>
                <strong>{snapshot.user.name}</strong>
              </div>
              <Link href="/hbx-music/player" className={styles.primaryButton}>
                Abrir player
              </Link>
            </div>
          </div>

          <nav className={styles.navDock} aria-label="Navegacao HBX Music">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${screen === item.screen ? styles.navLinkActive : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </section>

        <section className={styles.contentRail}>
          {moduleSyncPending ? (
            <section className={styles.glassPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Modulo criado no frontend e aguardando sync do backend</h2>
                  <p className={styles.panelText}>
                    Se o card ainda nao aparecer no dashboard, reinicie o backend para gravar o modulo
                    `hbx_music` na tabela de modulos.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {screen === "home" ? (
            <>
              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Painel do dia</h2>
                    <p className={styles.panelText}>
                      Home com blocos de produto real: trial, retomada, descoberta e tops.
                    </p>
                  </div>
                  <Link href="/hbx-music/onboarding" className={styles.ghostButton}>
                    Ver onboarding
                  </Link>
                </div>
                <div className={styles.statsGrid}>
                  <article className={styles.statCard}>
                    <span>Atualizacoes de hoje</span>
                    <strong>{snapshot.todayUpdates.length}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>Continue ouvindo</span>
                    <strong>{snapshot.continueListening.length}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>Descobertas controladas</span>
                    <strong>{snapshot.discoveries.length}</strong>
                  </article>
                </div>
              </section>

              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Atualizacoes de hoje</h2>
                    <p className={styles.panelText}>Mistura pensada em 60/25/15 com razao explicita.</p>
                  </div>
                  <Link href="/hbx-music/updates" className={styles.ghostButton}>
                    Abrir tela completa
                  </Link>
                </div>
                <div className={styles.trackGrid}>
                  {updatesWithTracks.slice(0, 4).map(({ recommendation, track }) => (
                    <TrackCard
                      key={track.id}
                      track={track}
                      reason={recommendation.reason}
                      actionLabel="Guardar para depois"
                    />
                  ))}
                </div>
              </section>

              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Continue ouvindo</h2>
                    <p className={styles.panelText}>Baseado em historico, recencia e tempo total ouvido.</p>
                  </div>
                </div>
                <div className={styles.trackGrid}>
                  {snapshot.continueListening.map((track) => (
                    <TrackCard key={track.id} track={track} actionLabel="Tocar agora" />
                  ))}
                </div>
              </section>

              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Top nacional e mundial</h2>
                    <p className={styles.panelText}>Estrutura pronta para charts reais no futuro.</p>
                  </div>
                  <Link href="/hbx-music/explore" className={styles.ghostButton}>
                    Explorar
                  </Link>
                </div>
                <div className={styles.sectionGrid}>
                  <div className={styles.sectionGrid}>
                    {snapshot.topNational.slice(0, 2).map((track) => (
                      <TrackCard key={track.id} track={track} />
                    ))}
                  </div>
                  <div className={styles.sectionGrid}>
                    {snapshot.topGlobal.slice(0, 2).map((track) => (
                      <TrackCard key={track.id} track={track} />
                    ))}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {screen === "updates" ? (
            <section className={styles.glassPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Atualizacoes de hoje</h2>
                  <p className={styles.panelText}>
                    Selecionar, marcar, atualizar e preparar o caminho para biblioteca/offline.
                  </p>
                </div>
                <div className={styles.stackActions}>
                  <button type="button" className={styles.ghostButton}>
                    Atualizar sugestoes
                  </button>
                  <button type="button" className={styles.primaryButton}>
                    Adicionar {selectedUpdatesCount} a biblioteca
                  </button>
                </div>
              </div>
              <div className={styles.sectionGrid}>
                {updatesWithTracks.map(({ recommendation, track }) => (
                  <UpdateRow
                    key={track.id}
                    recommendation={recommendation}
                    track={track}
                    selected={Boolean(selectedUpdateIds[track.id])}
                    onToggle={() =>
                      setSelectedUpdateIds((current) => ({
                        ...current,
                        [track.id]: !current[track.id],
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}

          {screen === "library" ? (
            <>
              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Biblioteca pessoal</h2>
                    <p className={styles.panelText}>
                      Playlists, favoritas, historico recente e bloco pronto para offline.
                    </p>
                  </div>
                </div>
                <div className={styles.playlistGrid}>
                  {snapshot.playlists.map((playlist) => {
                    const anchorTrack = snapshot.tracks.find((track) => track.id === playlist.trackIds[0]);
                    return (
                      <article key={playlist.id} className={styles.playlistCard}>
                        <div
                          className={styles.playlistCover}
                          style={{
                            ["--cover-start" as string]: playlist.coverGradient[0],
                            ["--cover-end" as string]: playlist.coverGradient[1],
                          }}
                        />
                        <div className={styles.trackMeta}>
                          <strong>{playlist.name}</strong>
                          <span>{playlist.description}</span>
                        </div>
                        <div className={styles.tinyMeta}>
                          <span className={styles.tinyPill}>{playlist.trackIds.length} faixas</span>
                          {anchorTrack ? <span className={styles.tinyPill}>{anchorTrack.genre}</span> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Historico recente</h2>
                    <p className={styles.panelText}>Base que alimenta a recomendacao e o future cache offline.</p>
                  </div>
                </div>
                <div className={styles.trackGrid}>
                  {snapshot.continueListening.map((track) => (
                    <TrackCard key={track.id} track={track} actionLabel="Salvar offline" />
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {screen === "explore" ? (
            <>
              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Explorar</h2>
                    <p className={styles.panelText}>
                      Top nacional, top mundial, em crescimento, novidades e genero.
                    </p>
                  </div>
                </div>
                <div className={styles.heroGrid}>
                  <article className={styles.infoCard}>
                    <span>Top nacional</span>
                    <strong>{snapshot.topNational[0]?.title || "-"}</strong>
                    <p className={styles.panelText}>Charts locais mockados para futura API real.</p>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Top mundial</span>
                    <strong>{snapshot.topGlobal[0]?.title || "-"}</strong>
                    <p className={styles.panelText}>Estrutura pronta para fonte internacional depois.</p>
                  </article>
                </div>
              </section>
              <section className={styles.glassPanel}>
                <div className={styles.trackGrid}>
                  {snapshot.topNational.concat(snapshot.topGlobal).slice(0, 6).map((track) => (
                    <TrackCard key={track.id} track={track} />
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {screen === "player" ? (
            <section className={styles.glassPanel}>
              <div className={styles.playerPad}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Player</h2>
                    <p className={styles.panelText}>Estrutura pronta para tocar preview/audio real depois.</p>
                  </div>
                  <Link href="/hbx-music/paywall" className={styles.ghostButton}>
                    Ver paywall
                  </Link>
                </div>
                <div className={styles.playerCover} style={buildCoverStyle(heroTrack)} />
                <div className={styles.trackMeta}>
                  <strong>{heroTrack.title}</strong>
                  <span>
                    {heroTrack.artist} • {heroTrack.genre}
                  </span>
                </div>
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} />
                  </div>
                  <span className={styles.mutedText}>01:42 de {formatDuration(heroTrack.duration)}</span>
                </div>
                <div className={styles.playerControls}>
                  <button type="button" className={styles.controlButton}>
                    {"<<"}
                  </button>
                  <button type="button" className={`${styles.controlButton} ${styles.controlButtonPrimary}`}>
                    Play
                  </button>
                  <button type="button" className={styles.controlButton}>
                    {">>"}
                  </button>
                </div>
                <p className={styles.reasonText}>
                  Motivo da recomendacao:{" "}
                  {updatesWithTracks.find((item) => item.track.id === heroTrack.id)?.recommendation.reason ||
                    "Mantem a linha do que voce mais escuta."}
                </p>
              </div>
            </section>
          ) : null}

          {screen === "profile" ? (
            <>
              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Perfil e plano</h2>
                    <p className={styles.panelText}>
                      Aqui ja entram trial, assinatura, provider e entitlement.
                    </p>
                  </div>
                </div>
                <div className={styles.heroGrid}>
                  <article className={styles.infoCard}>
                    <span>Usuario</span>
                    <strong>{snapshot.user.name}</strong>
                    <p className={styles.panelText}>{snapshot.user.email}</p>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Plano atual</span>
                    <strong>{snapshot.subscription.planLabel}</strong>
                    <p className={styles.panelText}>
                      {mapSubscriptionStatusLabel(snapshot.subscription.status)} •{" "}
                      {formatCurrency(snapshot.subscription.planPriceCents)}/mes
                    </p>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Trial</span>
                    <strong>{formatRemainingTrial(snapshot.subscription.trialEndAt)}</strong>
                    <p className={styles.panelText}>
                      Inicio {new Date(snapshot.subscription.trialStartAt).toLocaleDateString("pt-BR")}
                    </p>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Provider</span>
                    <strong>{snapshot.subscription.provider}</strong>
                    <p className={styles.panelText}>Mercado Pago entra como implementacao futura.</p>
                  </article>
                </div>
              </section>
              <section className={styles.glassPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Preferencias salvas</h2>
                  </div>
                </div>
                <div className={styles.choiceGrid}>
                  {snapshot.user.preferredGenres.map((genre) => (
                    <span key={genre} className={styles.choiceChip}>
                      {genre}
                    </span>
                  ))}
                  {snapshot.user.preferredArtists.map((artist) => (
                    <span key={artist} className={styles.choiceChip}>
                      {artist}
                    </span>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {screen === "paywall" ? (
            <section className={styles.glassPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Paywall V1</h2>
                  <p className={styles.panelText}>Plano unico limpo, pronto para Mercado Pago depois.</p>
                </div>
              </div>
              <div className={styles.heroGrid}>
                <article className={styles.featureCard}>
                  <span>Plano mensal</span>
                  <strong>{formatCurrency(HBX_MUSIC_PLAN_PRICE_CENTS)}</strong>
                  <p className={styles.panelText}>
                    Biblioteca premium, updates diarios, player e recomendacao personalizada.
                  </p>
                  <div className={styles.bottomActions}>
                    <button type="button" className={styles.primaryButton}>
                      Assinar depois
                    </button>
                  </div>
                </article>
                <article className={styles.featureCard}>
                  <span>Camada de billing</span>
                  <strong>Desacoplada</strong>
                  <p className={styles.panelText}>
                    `BillingProvider` pronto para `MercadoPagoBillingProvider`, Apple ou Web.
                  </p>
                  <div className={styles.bottomActions}>
                    <Link href="/hbx-music/profile" className={styles.ghostButton}>
                      Ver entitlement
                    </Link>
                  </div>
                </article>
              </div>
            </section>
          ) : null}

          {screen === "onboarding" ? (
            <section className={styles.glassPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Onboarding inicial</h2>
                  <p className={styles.panelText}>
                    Boas-vindas, genero, artistas, nivel de descoberta e queda na home.
                  </p>
                </div>
              </div>
              <div className={styles.onboardingSteps}>
                <article className={styles.infoCard}>
                  <h3 className={styles.stackTitle}>1. Boas-vindas</h3>
                  <p className={styles.panelText}>
                    Explica trial de 30 dias, biblioteca pessoal e sugestoes renovadas todo dia.
                  </p>
                </article>
                <article className={styles.infoCard}>
                  <h3 className={styles.stackTitle}>2. Generos preferidos</h3>
                  <div className={styles.choiceGrid}>
                    {snapshot.user.preferredGenres.map((genre) => (
                      <span key={genre} className={styles.choiceChip}>
                        {genre}
                      </span>
                    ))}
                  </div>
                </article>
                <article className={styles.infoCard}>
                  <h3 className={styles.stackTitle}>3. Artistas preferidos</h3>
                  <div className={styles.choiceGrid}>
                    {snapshot.user.preferredArtists.map((artist) => (
                      <span key={artist} className={styles.choiceChip}>
                        {artist}
                      </span>
                    ))}
                  </div>
                </article>
                <article className={styles.infoCard}>
                  <h3 className={styles.stackTitle}>4. Nivel de descoberta</h3>
                  <div className={styles.choiceGrid}>
                    <span className={styles.choiceChip}>Seguro</span>
                    <span className={styles.choiceChip}>Balanceado</span>
                    <span className={styles.choiceChip}>Aventureiro</span>
                  </div>
                </article>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
