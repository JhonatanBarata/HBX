import type {
  HbxMusicPlayHistory,
  HbxMusicRecommendation,
  HbxMusicRecommendationCategory,
  HbxMusicTrack,
  HbxMusicUser,
} from "./types";

function scoreTrack(track: HbxMusicTrack, user: HbxMusicUser, historyMap: Map<string, HbxMusicPlayHistory>) {
  const genreMatch = user.preferredGenres.includes(track.genre);
  const artistMatch = user.preferredArtists.includes(track.artist);
  const history = historyMap.get(track.id);
  let score = 18;

  if (genreMatch) score += 60;
  if (artistMatch) score += 30;
  if (track.tags.includes("trend")) score += 18;
  if (track.country === "BR") score += 8;

  if (history) {
    score += history.playCount * 4;
    score += Math.round(history.totalListenSeconds / 90);
    if (history.liked) score += 16;
    if (history.skipped) score -= 12;
  }

  return score;
}

function inferCategory(
  track: HbxMusicTrack,
  user: HbxMusicUser,
  historyMap: Map<string, HbxMusicPlayHistory>,
): HbxMusicRecommendationCategory {
  if (historyMap.has(track.id)) return "continue_listening";
  if (track.country === "BR" && track.tags.includes("trend")) return "national_top";
  if (track.country !== "BR" && track.tags.includes("trend")) return "global_top";
  if (user.preferredGenres.includes(track.genre) || user.preferredArtists.includes(track.artist)) {
    return "updates";
  }
  return "discovery";
}

function inferReason(track: HbxMusicTrack, user: HbxMusicUser, category: HbxMusicRecommendationCategory) {
  if (category === "continue_listening") return "Continua forte no que voce mais toca.";
  if (category === "national_top") return "Esta em alta no seu recorte nacional.";
  if (category === "global_top") return "Subiu no radar mundial do seu nicho.";
  if (user.preferredArtists.includes(track.artist)) return "Artista alinhado com as suas favoritas.";
  if (user.preferredGenres.includes(track.genre)) return "Combina com o estilo que voce mais ouve.";
  return "Descoberta nova com risco controlado.";
}

export function buildMusicRecommendations(params: {
  user: HbxMusicUser;
  tracks: HbxMusicTrack[];
  history: HbxMusicPlayHistory[];
}) {
  const { user, tracks, history } = params;
  const historyMap = new Map(history.map((item) => [item.trackId, item]));

  return tracks
    .map<HbxMusicRecommendation>((track) => {
      const category = inferCategory(track, user, historyMap);
      return {
        id: `rec-${track.id}`,
        userId: user.id,
        trackId: track.id,
        score: scoreTrack(track, user, historyMap),
        reason: inferReason(track, user, category),
        category,
        createdAt: new Date().toISOString(),
        status: "ready",
      };
    })
    .sort((left, right) => right.score - left.score);
}
