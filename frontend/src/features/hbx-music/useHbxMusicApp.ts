"use client";

import { startTransition, useEffect, useState } from "react";
import { useRequireAuth } from "@/app/dashboard/_lib/useRequireAuth";
import { apiFetch } from "@/app/dashboard/_lib/api";
import { HBX_MUSIC_HISTORY, HBX_MUSIC_PLAYLISTS, buildMockMusicUser } from "./mock-data";
import { MockBillingProvider } from "./billing";
import { mockMusicSourceProvider } from "./music-source";
import { buildMusicRecommendations } from "./recommendation";
import type { HbxMusicSnapshot, HbxMusicTrack } from "./types";

type CurrentUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | null;
  isSystemMaster?: boolean;
};

type UserModule = {
  key: string;
  accessible: boolean;
};

type UseHbxMusicAppState = {
  hasToken: boolean | null;
  loading: boolean;
  error: string | null;
  snapshot: HbxMusicSnapshot | null;
  accessDenied: boolean;
  moduleSyncPending: boolean;
};

export function useHbxMusicApp() {
  const hasToken = useRequireAuth();
  const [state, setState] = useState<UseHbxMusicAppState>({
    hasToken,
    loading: true,
    error: null,
    snapshot: null,
    accessDenied: false,
    moduleSyncPending: false,
  });

  useEffect(() => {
    setState((current) => ({ ...current, hasToken }));
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;

    let cancelled = false;

    async function load() {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
        snapshot: null,
        accessDenied: false,
      }));

      try {
        const [currentUser, modules, allTracks, topNational, topGlobal] = await Promise.all([
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
          mockMusicSourceProvider.searchTracks(""),
          mockMusicSourceProvider.getNationalTop(6),
          mockMusicSourceProvider.getGlobalTop(6),
        ]);

        if (cancelled) return;

        const moduleEntry = (modules || []).find((item) => item.key === "hbx_music");
        const accessDenied = Boolean(moduleEntry && !moduleEntry.accessible && !currentUser?.isSystemMaster);
        if (accessDenied) {
          startTransition(() => {
            setState({
              hasToken: true,
              loading: false,
              error: null,
              snapshot: null,
              accessDenied: true,
              moduleSyncPending: false,
            });
          });
          return;
        }

        const user = buildMockMusicUser({
          id: currentUser?.id,
          username: currentUser?.username,
          email: currentUser?.email,
          createdAt: currentUser?.createdAt,
        });
        const billingProvider = new MockBillingProvider();
        const subscription = await billingProvider.createTrialAccount(user);
        const accessState = await billingProvider.verifyEntitlement(subscription);
        const recommendations = buildMusicRecommendations({
          user,
          tracks: allTracks,
          history: HBX_MUSIC_HISTORY.map((item) => ({ ...item, userId: user.id })),
        });
        const currentTrack =
          allTracks.find((item) => item.id === HBX_MUSIC_HISTORY[0]?.trackId) || allTracks[0] || null;
        const todayUpdates = recommendations.filter((item) => item.category === "updates").slice(0, 5);
        const discoveries = recommendations.filter((item) => item.category === "discovery").slice(0, 5);
        const continueListening = HBX_MUSIC_HISTORY.slice()
          .sort(
            (left, right) =>
              new Date(right.lastPlayedAt).getTime() - new Date(left.lastPlayedAt).getTime(),
          )
          .map((item) => allTracks.find((track) => track.id === item.trackId))
          .filter((track): track is HbxMusicTrack => Boolean(track))
          .slice(0, 5);

        const snapshot: HbxMusicSnapshot = {
          user,
          subscription,
          accessState,
          tracks: allTracks,
          playlists: HBX_MUSIC_PLAYLISTS.map((item) => ({ ...item, userId: user.id })),
          history: HBX_MUSIC_HISTORY.map((item) => ({ ...item, userId: user.id })),
          recommendations,
          todayUpdates,
          continueListening,
          discoveries,
          topNational,
          topGlobal,
          currentTrack,
        };

        startTransition(() => {
          setState({
            hasToken: true,
            loading: false,
            error: null,
            snapshot,
            accessDenied: false,
            moduleSyncPending: !moduleEntry,
          });
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Falha ao carregar HBX Music.";
        startTransition(() => {
          setState({
            hasToken: true,
            loading: false,
            error: message,
            snapshot: null,
            accessDenied: false,
            moduleSyncPending: false,
          });
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  return state;
}
