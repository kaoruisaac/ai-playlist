import type { ToolArgsSchema } from "@kaoruisaac/pedelec";
import { z } from "zod";

export const videoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube video ID");
const nonEmptyText = (max: number) => z.string().min(1).max(max);
const trackContentSchema = z.object({
  title: nonEmptyText(150),
  artist: nonEmptyText(150),
  playlistRole: nonEmptyText(80),
  videoId,
});

const normalizeTrackKey = (artist: string, title: string) => `${artist} ${title}`.toLocaleLowerCase().trim().replace(/\s+/g, " ");
const rejectDuplicateTracks = (tracks: readonly { artist: string; title: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  tracks.forEach((track, index) => {
    const key = normalizeTrackKey(track.artist, track.title);
    if (seen.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate track", path: ["tracks", index] });
    seen.add(key);
  });
};

export const trackInputSchema = trackContentSchema.strict();

export const startNewPlaylistInputSchema = z.object({
  title: nonEmptyText(100),
  description: nonEmptyText(300),
});

export type StartNewPlaylistInput = z.infer<typeof startNewPlaylistInputSchema>;
export const appendTracksInputSchema = z.object({ tracks: z.array(trackInputSchema).min(1).max(20) }).strict();
export type AppendTracksInput = z.infer<typeof appendTracksInputSchema>;
export { normalizeTrackKey };

export const sourceSchema = z.object({
  platform: z.literal("youtube"),
  videoId,
  url: z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "URL must use http or https"),
}).strict();

export const trackSchema = trackContentSchema.omit({ videoId: true }).extend({
  id: z.string().min(1),
  playbackSource: sourceSchema,
});

export const playlistSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  tracks: z.array(trackSchema).max(20),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).superRefine((value, ctx) => {
  rejectDuplicateTracks(value.tracks, ctx);
});

export const trackArgsSchema = {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 150, description: "Song title." },
          artist: { type: "string", minLength: 1, maxLength: 150, description: "Performing artist." },
          playlistRole: { type: "string", minLength: 1, maxLength: 80, description: "This track's role among the currently planned tracks. For an early first track, a simple role such as opener is sufficient; the complete playlist need not be planned first." },
          videoId: { type: "string", pattern: "^[A-Za-z0-9_-]{11}$", description: "The 11-character YouTube video ID. Do not submit a full URL.", examples: ["vx4kLgnFexo"] },
        },
        required: ["title", "artist", "playlistRole", "videoId"],
      } satisfies ToolArgsSchema;

export const startNewPlaylistArgsSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100, description: "Title for the new playlist." },
    description: { type: "string", minLength: 1, maxLength: 300, description: "Short description of the new playlist's mood and direction." },
  },
  required: ["title", "description"],
} satisfies ToolArgsSchema;

export const appendTracksArgsSchema = {
  type: "object",
  properties: {
    tracks: { type: "array", minItems: 1, maxItems: 20, description: "Tracks currently ready to append, in their intended order. The complete target playlist does not need to be ready first.", items: trackArgsSchema },
  },
  required: ["tracks"],
} satisfies ToolArgsSchema;
