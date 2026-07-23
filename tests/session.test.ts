import { beforeEach, describe, expect, it } from "vitest";
import { appendTracksInputSchema, playlistSchema } from "../src/lib/schema";
import { appendTracks, appendTracksToPlaylist, buildEmptyPlaylist, clearLegacySession, loadPlaylist, loadPrefs, moveTrack, newSession, persistPrefs, removeTrack, startNewPlaylist } from "../src/lib/session";
import { fixturePlaylist } from "../src/lib/fixture";

const track = (title = "New song") => ({ title, artist: "New artist", selectionReason: "A fitting continuation for this test playlist.", playlistRole: "Closer", introduction: "x", backgroundConfidence: "high" as const, sourceLinks: ["https://example.com/new"], playbackSource: { videoId: "vx4kLgnFexo", sourceType: "official-audio" as const } });
const input = (tracks = [track()]) => appendTracksInputSchema.parse({ tracks });

describe("playlist session", () => {
  beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] }); });
  it("starts new playlists empty, clearing playback context while retaining gesture", () => {
    const initial = { ...loadPlaylist(newSession(), fixturePlaylist()), introducedTrackIds: ["t1"], playback: { ...loadPlaylist(newSession(), fixturePlaylist()).playback, hasPlaybackGesture: true } };
    const next = startNewPlaylist(initial, buildEmptyPlaylist({ title: "New", description: "New playlist." }));
    expect(next.playlist?.tracks).toEqual([]);
    expect(next.playback).toMatchObject({ status: "idle", hasPlaybackGesture: true, currentTimeSeconds: 0 });
    expect(next.playback.activeTrackId).toBeUndefined();
    expect(next.introducedTrackIds).toEqual([]);
  });
  it("starts playback from an appended usable track when the playlist was empty", () => {
    const empty = startNewPlaylist(newSession(), buildEmptyPlaylist({ title: "New", description: "New playlist." }));
    const playlist = appendTracksToPlaylist(empty.playlist!, input(), { createId: () => "new-id" });
    expect(appendTracks(empty, playlist).playback).toMatchObject({ activeTrackId: "new-id", status: "loading", currentTimeSeconds: 0 });
    const withoutPlaylist = newSession();
    expect(appendTracks(withoutPlaylist, playlist).playback).toMatchObject({ activeTrackId: "new-id", status: "loading", currentTimeSeconds: 0 });
  });
  it("preserves every playback state when appending to an existing playlist", () => {
    const initial = loadPlaylist(newSession(), fixturePlaylist());
    const playlist = appendTracksToPlaylist(initial.playlist!, input(), { createId: () => "new-id" });
    for (const status of ["playing", "paused", "ready", "loading", "idle", "ended", "waiting-for-user-gesture", "error"] as const) {
      const current = { ...initial, playback: { ...initial.playback, status, currentTimeSeconds: 12, hasPlaybackGesture: true } };
      expect(appendTracks(current, playlist).playback).toEqual(current.playback);
    }
  });
  it("does not auto-play an append after an existing playlist has ended", () => {
    const initial = loadPlaylist(newSession(), fixturePlaylist());
    const playlist = appendTracksToPlaylist(initial.playlist!, input(), { createId: () => "new-id" });
    const ended = { ...initial, playback: { ...initial.playback, status: "ended" as const, currentTimeSeconds: 99 } };
    expect(appendTracks(ended, playlist).playback).toEqual(ended.playback);
  });
  it("starts from the first appended track and enforces the twenty-track limit", () => {
    const empty = startNewPlaylist(newSession(), buildEmptyPlaylist({ title: "New", description: "New playlist." }));
    const playlist = appendTracksToPlaylist(empty.playlist!, input([track("Good")]), { createId: () => "id-1" });
    expect(appendTracks(empty, playlist).playback.activeTrackId).toBe("id-1");
    const full = { ...empty.playlist!, tracks: Array.from({ length: 20 }, (_, index) => ({ ...playlist.tracks[0], id: `track-${index}`, title: `Track ${index}` })) };
    expect(() => appendTracksToPlaylist(full, input())).toThrow(/20-track/);
  });
  it("rejects duplicate tracks and validates mutations", () => {
    const initial = loadPlaylist(newSession(), fixturePlaylist());
    expect(() => appendTracksToPlaylist(initial.playlist!, input([{ ...track(), title: "My Love Mine All Mine", artist: "Mitski" }]))).toThrow(/Duplicate/);
    const moved = moveTrack(initial, "t1", 1);
    const removed = removeTrack(moved, "t1");
    expect(playlistSchema.safeParse(removed.playlist).success).toBe(true);
  });
  it("only restores validated preferences into a fresh session", () => {
    expect(newSession().agentSettings.preferredTrackCount).toBe(10);
    for (const preferredTrackCount of [5, 10, 20] as const) {
      localStorage.setItem("ai-playlist:preferences:v1", JSON.stringify({ provider: "codex", model: "x", preferredTrackCount }));
      expect(newSession().agentSettings).toMatchObject({ provider: "codex", model: "x", preferredTrackCount });
    }
    localStorage.setItem("ai-playlist:preferences:v1", JSON.stringify({ preferredTrackCount: 12 }));
    expect(loadPrefs().preferredTrackCount).toBe(10);
    localStorage.setItem("ai-playlist:preferences:v1", "not-json");
    expect(loadPrefs().preferredTrackCount).toBe(10);
  });
  it("persists preferences only and clears the legacy full session", () => {
    localStorage.setItem("ai-playlist:session:v1", JSON.stringify({ messages: ["old"], playlist: { tracks: [] }, playback: {} }));
    clearLegacySession();
    expect(localStorage.getItem("ai-playlist:session:v1")).toBeNull();
    persistPrefs({ provider: "codex", model: "model", preferredTrackCount: 5 });
    expect(JSON.parse(localStorage.getItem("ai-playlist:preferences:v1") ?? "{}")).toEqual({ provider: "codex", model: "model", preferredTrackCount: 5, locale: "zh-TW" });
    const fresh = newSession();
    expect(fresh.messages).toEqual([]);
    expect(fresh.playlist).toBeUndefined();
  });
});
