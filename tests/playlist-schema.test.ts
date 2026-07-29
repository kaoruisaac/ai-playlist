import { describe, expect, it } from "vitest";
import { appendTracksArgsSchema, appendTracksInputSchema, playlistSchema, startNewPlaylistArgsSchema, startNewPlaylistInputSchema, trackArgsSchema } from "../src/lib/schema";
import { buildEmptyPlaylist } from "../src/lib/session";

const track = { title: "Song", artist: "Artist", playlistRole: "Middle", videoId: "vx4kLgnFexo" };

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
  it("requires a non-empty four-field append payload and rejects old fields", () => {
    expect(appendTracksInputSchema.safeParse({}).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [] }).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [track, track] }).success).toBe(true);
    expect(appendTracksInputSchema.safeParse({ tracks: [track] }).success).toBe(true);
    for (const field of ["title", "artist", "playlistRole", "videoId"] as const) {
      const incomplete = Object.fromEntries(
        Object.entries(track).filter(([key]) => key !== field),
      );
      expect(appendTracksInputSchema.safeParse({ tracks: [incomplete] }).success).toBe(false);
    }
    expect(appendTracksInputSchema.safeParse({ tracks: [{ ...track, selectionReason: "old" }] }).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [{ ...track, introduction: "old" }] }).success).toBe(false);
    expect(appendTracksInputSchema.safeParse({ tracks: [{ ...track, videoId: "invalid" }] }).success).toBe(false);
    expect(appendTracksArgsSchema.required).toEqual(["tracks"]);
    expect(trackArgsSchema.required).toEqual(["title", "artist", "playlistRole", "videoId"]);
    expect(trackArgsSchema.properties).not.toHaveProperty("introduction");
  });
});
