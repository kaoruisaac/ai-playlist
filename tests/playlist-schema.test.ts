import { describe, expect, it } from "vitest";
import { appendTracksArgsSchema, appendTracksInputSchema, playlistSchema, startNewPlaylistArgsSchema, startNewPlaylistInputSchema } from "../app/lib/schema";
import { buildEmptyPlaylist } from "../app/lib/session";

const track = { title: "Song", artist: "Artist", selectionReason: "A fitting continuation for this test playlist.", playlistRole: "Middle", introduction: "A short introduction.", backgroundConfidence: "high" as const, sourceLinks: ["https://example.com/source"], playbackSources: [{ videoId: "vx4kLgnFexo", sourceType: "official-audio" as const }] };

describe("playlist schemas", () => {
  it("accepts an empty playlist without derived fields", () => {
    const playlist = buildEmptyPlaylist({ title: "Empty", description: "A new empty playlist." }, { now: "2026-01-01T00:00:00.000Z", createId: () => "playlist" });
    expect(playlistSchema.safeParse(playlist).success).toBe(true);
    expect("revision" in playlist).toBe(false);
    expect("requestedTrackCount" in playlist).toBe(false);
  });
  it("validates new playlist metadata", () => {
    expect(startNewPlaylistInputSchema.safeParse({ title: "Fresh", description: "A fresh direction." }).success).toBe(true);
    expect(startNewPlaylistArgsSchema.required).toEqual(["title", "description"]);
  });
  it("requires a non-empty append payload and rejects duplicates", () => {
    expect(appendTracksInputSchema.safeParse({}).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [] }).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [track, track] }).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [track] }).success).toBe(true);
    expect(appendTracksArgsSchema.required).toEqual(["tracks"]);
  });
});
