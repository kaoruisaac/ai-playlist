import type { ChatMessage, Playlist, PlaylistSession, Track } from "./types";
import { detectLocale } from "./i18n";
import { normalizeTrackKey, playlistSchema, type AppendTracksInput, type StartNewPlaylistInput, type trackInputSchema } from "./schema";

const SESSION_KEY = "ai-playlist:session:v1", PREF_KEY = "ai-playlist:preferences:v1";
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
type TrackInput = import("zod").infer<typeof trackInputSchema>;
type BuildOptions = { now?: string; createId?: () => string };

export function buildTracksFromInput(inputs: TrackInput[], options: BuildOptions = {}): Track[] {
  const createId = options.createId ?? id;
  return inputs.map((track) => ({ ...track, id: createId(), playbackSources: track.playbackSources.map((source) => ({ ...source, id: createId(), platform: "youtube" as const, url: `https://www.youtube.com/watch?v=${source.videoId}`, validationStatus: "pending" as const })) }));
}

export function buildEmptyPlaylist(input: StartNewPlaylistInput, options: BuildOptions = {}): Playlist {
  const timestamp = options.now ?? now();
  return { id: (options.createId ?? id)(), title: input.title, description: input.description, tracks: [], createdAt: timestamp, updatedAt: timestamp };
}

export function appendTracksToPlaylist(current: Playlist, input: AppendTracksInput, options: BuildOptions = {}): Playlist {
  const duplicate = input.tracks.find((track) => current.tracks.some((existing) => normalizeTrackKey(existing.artist, existing.title) === normalizeTrackKey(track.artist, track.title)));
  if (duplicate) throw new Error(`Duplicate track already exists: ${duplicate.artist} – ${duplicate.title}`);
  if (current.tracks.length + input.tracks.length > 20) throw new Error("Appending these tracks would exceed the 20-track playlist limit.");
  return { ...current, tracks: [...current.tracks, ...buildTracksFromInput(input.tracks, options)], updatedAt: options.now ?? now() };
}

export type PlaylistPreferences = import("./types").AgentSettings;
const preferredTrackCount = (value: unknown): 5 | 10 | 20 => value === 5 || value === 10 || value === 20 ? value : 10;
export function loadPrefs(): PlaylistPreferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}");
    const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      provider: typeof value.provider === "string" && value.provider.trim() ? value.provider : undefined,
      model: typeof value.model === "string" ? value.model : undefined,
      preferredTrackCount: preferredTrackCount(value.preferredTrackCount),
      locale: detectLocale(value.locale, typeof navigator === "undefined" ? undefined : navigator.languages?.length ? navigator.languages : [navigator.language]),
    };
  } catch { return { preferredTrackCount: 10, locale: detectLocale(undefined, typeof navigator === "undefined" ? undefined : navigator.languages?.length ? navigator.languages : [navigator.language]) }; }
}
export function persistPrefs(settings: Omit<PlaylistPreferences, "locale"> & Partial<Pick<PlaylistPreferences, "locale">>) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ provider: settings.provider, model: settings.model, preferredTrackCount: preferredTrackCount(settings.preferredTrackCount), locale: detectLocale(settings.locale, typeof navigator === "undefined" ? undefined : navigator.languages?.length ? navigator.languages : [navigator.language]) })); } catch { /* storage is optional */ }
}
export function clearLegacySession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* storage is optional */ } }
export const newSession = (): PlaylistSession => ({ schemaVersion: 2, id: id(), createdAt: now(), updatedAt: now(), originalRequest: "", messages: [], playback: { status: "idle", hasPlaybackGesture: false }, agentSettings: loadPrefs(), introducedTrackIds: [] });
export const addMessage = (session: PlaylistSession, message: Omit<ChatMessage, "id" | "createdAt">): PlaylistSession => ({ ...session, updatedAt: now(), messages: [...session.messages, { ...message, id: id(), createdAt: now() }] });

export function startNewPlaylist(session: PlaylistSession, playlist: Playlist): PlaylistSession {
  if (!playlistSchema.safeParse(playlist).success) throw new Error("Playlist data is incomplete; no change was applied.");
  return { ...session, updatedAt: now(), playlist, introducedTrackIds: [], playback: { ...session.playback, activeTrackId: undefined, activeSourceId: undefined, status: "idle", currentTimeSeconds: 0 } };
}

/** UI-only full playlist loader used by the demo button. */
export function loadPlaylist(session: PlaylistSession, playlist: Playlist): PlaylistSession {
  if (!playlistSchema.safeParse(playlist).success) throw new Error("Playlist data is incomplete; no change was applied.");
  const first = playlist.tracks.find((track) => track.playbackSources.some((source) => source.validationStatus !== "invalid"));
  return { ...session, updatedAt: now(), playlist, playback: { ...session.playback, activeTrackId: first?.id, activeSourceId: first?.playbackSources.find((source) => source.validationStatus !== "invalid")?.id, status: first ? "loading" : "idle", currentTimeSeconds: 0 } };
}

export function appendTracks(session: PlaylistSession, playlist: Playlist): PlaylistSession {
  const previousTrackCount = session.playlist?.tracks.length ?? 0;
  const wasEmptyBeforeAppend = previousTrackCount === 0;
  const added = playlist.tracks.slice(previousTrackCount);
  // Adding to an existing playlist must never alter its playback state. This
  // includes idle and ended sessions: only the first append into an empty list
  // starts playback.
  if (!wasEmptyBeforeAppend) return { ...session, updatedAt: now(), playlist };
  const first = added.find((track) => track.playbackSources.some((source) => source.validationStatus !== "invalid"));
  if (!first) return { ...session, updatedAt: now(), playlist };
  return { ...session, updatedAt: now(), playlist, playback: { ...session.playback, activeTrackId: first.id, activeSourceId: first.playbackSources.find((source) => source.validationStatus !== "invalid")?.id, status: "loading", currentTimeSeconds: 0 } };
}

export function removeTrack(session: PlaylistSession, trackId: string): PlaylistSession { if (!session.playlist) return session; const tracks = session.playlist.tracks.filter((track) => track.id !== trackId); const wasActive = session.playback.activeTrackId === trackId; const oldIndex = session.playlist.tracks.findIndex((track) => track.id === trackId); const next = tracks[oldIndex] ?? tracks[oldIndex - 1]; return { ...session, updatedAt: now(), playlist: { ...session.playlist, tracks, updatedAt: now() }, playback: wasActive ? { ...session.playback, activeTrackId: next?.id, activeSourceId: next?.playbackSources[0]?.id, status: next ? "ready" : "idle", currentTimeSeconds: 0 } : session.playback }; }
export function moveTrack(session: PlaylistSession, trackId: string, direction: -1 | 1): PlaylistSession { if (!session.playlist) return session; const tracks = [...session.playlist.tracks], index = tracks.findIndex((track) => track.id === trackId), target = index + direction; if (index < 0 || target < 0 || target >= tracks.length) return session; [tracks[index], tracks[target]] = [tracks[target], tracks[index]]; return { ...session, updatedAt: now(), playlist: { ...session.playlist, tracks, updatedAt: now() } }; }
export function markSourceInvalid(session: PlaylistSession, trackId: string, sourceId: string): PlaylistSession { if (!session.playlist) return session; return { ...session, playlist: { ...session.playlist, tracks: session.playlist.tracks.map((track) => track.id === trackId ? { ...track, playbackSources: track.playbackSources.map((source) => source.id === sourceId ? { ...source, validationStatus: "invalid" } : source) } : track), updatedAt: now() } }; }

export const getActiveTrack = (session: PlaylistSession): Track | undefined => session.playlist?.tracks.find((track) => track.id === session.playback.activeTrackId);
