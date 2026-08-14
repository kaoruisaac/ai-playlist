export type PlaybackStatus = "idle" | "ready" | "loading" | "waiting-for-user-gesture" | "playing" | "paused" | "ended" | "error";

export type PlaybackSource = { platform: "youtube"; videoId: string; url: string };
export type Track = {
  id: string; title: string; artist: string; playlistRole: string; playbackSource: PlaybackSource;
};
export type Playlist = { id: string; title: string; description: string; tracks: Track[]; createdAt: string; updatedAt: string };
export type ChatMessage = { id: string; role: "user" | "agent" | "system"; kind: "conversation" | "playlist-ready" | "error"; content: string; createdAt: string };
export type PlaybackState = { activeTrackId?: string; status: PlaybackStatus; currentTimeSeconds?: number; hasPlaybackGesture: boolean };
export type PreferredTrackCount = 5 | 10 | 20;
import type { AppLocale } from "./i18n";
export type AgentSettings = { provider?: string; preferredTrackCount: PreferredTrackCount; locale: AppLocale };
export type ProviderOption = { code: string; name: string; available: boolean };
export type DesktopProviderSettings = { defaultProvider: string | null };
export type PlaylistSession = { schemaVersion: 3; id: string; createdAt: string; updatedAt: string; originalRequest: string; interpretedVibe?: string; messages: ChatMessage[]; playlist?: Playlist; playback: PlaybackState; agentSettings: AgentSettings };
export type PedelecState = "checking" | "not-installed" | "disconnected" | "needs-settings" | "connected" | "running" | "waiting_tool_result" | "error";
