export type Confidence = "high" | "medium" | "low" | "unverified";
export type PlaybackStatus = "idle" | "ready" | "loading" | "waiting-for-user-gesture" | "playing" | "paused" | "ended" | "error";

export type PlaybackSource = {
  id: string; platform: "youtube"; videoId: string; url: string; title?: string;
  channelName?: string; thumbnailUrl?: string;
  sourceType: "official-mv" | "official-audio" | "topic" | "label" | "other";
  validationStatus: "pending" | "valid" | "invalid" | "unknown";
};
export type Track = {
  id: string; title: string; artist: string; album?: string; releaseYear?: number;
  selectionReason: string; playlistRole: string; introduction: string;
  backgroundConfidence: Confidence; sourceLinks: string[]; playbackSources: PlaybackSource[];
};
export type Playlist = { id: string; title: string; description: string; tracks: Track[]; createdAt: string; updatedAt: string };
export type ChatMessage = { id: string; role: "user" | "agent" | "system"; kind: "conversation" | "task-progress" | "playlist-ready" | "track-introduction" | "error"; content: string; createdAt: string; trackId?: string };
export type PlaybackState = { activeTrackId?: string; activeSourceId?: string; status: PlaybackStatus; currentTimeSeconds?: number; hasPlaybackGesture: boolean };
export type PreferredTrackCount = 5 | 10 | 20;
import type { AppLocale } from "./i18n";
export type AgentSettings = { provider?: string; model?: string; preferredTrackCount: PreferredTrackCount; locale: AppLocale };
export type ProviderOption = { code: string; name: string; available: boolean };
export type DesktopProviderSettings = { defaultProvider: string | null; defaultModels: Partial<Record<string, string>> };
export type PlaylistSession = { schemaVersion: 2; id: string; createdAt: string; updatedAt: string; originalRequest: string; interpretedVibe?: string; messages: ChatMessage[]; playlist?: Playlist; playback: PlaybackState; agentSettings: AgentSettings; introducedTrackIds: string[] };
export type PedelecState = "checking" | "not-installed" | "disconnected" | "needs-settings" | "connected" | "running" | "waiting_tool_result" | "error";
