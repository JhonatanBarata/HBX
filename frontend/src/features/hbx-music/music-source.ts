import { HBX_MUSIC_TRACKS } from "./mock-data";
import type { HbxMusicTrack } from "./types";

export interface MusicSourceProvider {
  searchTracks(query: string): Promise<HbxMusicTrack[]>;
  getTrackMetadata(trackId: string): Promise<HbxMusicTrack | null>;
  getTrackAudioUrl(trackId: string): Promise<string | null>;
  getTopCharts(limit?: number): Promise<HbxMusicTrack[]>;
  getNationalTop(limit?: number): Promise<HbxMusicTrack[]>;
  getGlobalTop(limit?: number): Promise<HbxMusicTrack[]>;
}

export class MockMusicSourceProvider implements MusicSourceProvider {
  constructor(private readonly tracks: HbxMusicTrack[]) {}

  async searchTracks(query: string) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return this.tracks;
    return this.tracks.filter((track) => {
      return (
        track.title.toLowerCase().includes(normalized) ||
        track.artist.toLowerCase().includes(normalized) ||
        track.genre.toLowerCase().includes(normalized)
      );
    });
  }

  async getTrackMetadata(trackId: string) {
    return this.tracks.find((track) => track.id === trackId) || null;
  }

  async getTrackAudioUrl(trackId: string) {
    const track = await this.getTrackMetadata(trackId);
    return track?.audioUrl || null;
  }

  async getTopCharts(limit = 6) {
    return this.tracks.filter((track) => track.tags.includes("trend")).slice(0, limit);
  }

  async getNationalTop(limit = 6) {
    return this.tracks.filter((track) => track.country === "BR").slice(0, limit);
  }

  async getGlobalTop(limit = 6) {
    return this.tracks.filter((track) => track.country !== "BR").slice(0, limit);
  }
}

export const mockMusicSourceProvider = new MockMusicSourceProvider(HBX_MUSIC_TRACKS);
