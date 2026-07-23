import type { ToolArgsSchema } from "@kaoruisaac/pedelec";
import { z } from "zod";

export const confidenceValues = ["high", "medium", "low", "unverified"] as const;
export const sourceTypeValues = ["official-mv", "official-audio", "topic", "label", "other"] as const;
export const validationStatusValues = ["pending", "valid", "invalid", "unknown"] as const;

export const videoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube video ID");
const nonEmptyText = (max: number) => z.string().min(1).max(max);
const sourceLinksSchema = z.array(z.string().url()).min(1).max(8);

const playbackSourceInputSchema = z.object({
  videoId,
  title: nonEmptyText(300).optional(),
  channelName: nonEmptyText(200).optional(),
  sourceType: z.enum(sourceTypeValues),
});

const trackContentSchema = z.object({
  title: nonEmptyText(150),
  artist: nonEmptyText(150),
  album: nonEmptyText(150).optional(),
  releaseYear: z.number().int().min(1900).max(2100).optional(),
  selectionReason: z.string().min(10).max(300),
  playlistRole: nonEmptyText(80),
  introduction: z.string().min(1).max(200),
  backgroundConfidence: z.enum(confidenceValues),
  sourceLinks: sourceLinksSchema,
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

export const trackInputSchema = trackContentSchema.extend({ playbackSources: z.array(playbackSourceInputSchema).min(1).max(3) });

export const startNewPlaylistInputSchema = z.object({
  title: nonEmptyText(100),
  description: nonEmptyText(300),
});

export type StartNewPlaylistInput = z.infer<typeof startNewPlaylistInputSchema>;
export const appendTracksInputSchema = z.object({
  tracks: z.array(trackInputSchema).min(1).max(20),
}).superRefine((value, ctx) => rejectDuplicateTracks(value.tracks, ctx));
export type AppendTracksInput = z.infer<typeof appendTracksInputSchema>;
export { normalizeTrackKey };

export const sourceSchema = playbackSourceInputSchema.extend({
  id: z.string().min(1),
  platform: z.literal("youtube"),
  url: z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), "URL must use http or https"),
  thumbnailUrl: z.string().url().optional(),
  validationStatus: z.enum(validationStatusValues),
});

export const trackSchema = trackContentSchema.extend({
  id: z.string().min(1),
  playbackSources: z.array(sourceSchema).min(1).max(3),
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
          album: { type: "string", minLength: 1, maxLength: 150, description: "Album name, when known." },
          releaseYear: { type: "integer", minimum: 1900, maximum: 2100, description: "Release year, when known." },
          selectionReason: { type: "string", minLength: 10, maxLength: 300, description: "Why this track fits the user's request." },
          playlistRole: { type: "string", minLength: 1, maxLength: 80, description: "This track's sequencing role in the playlist." },
          introduction: { type: "string", minLength: 1, maxLength: 200, description: "Introduction shown during playback; at most 200 characters. Prefer more than 100 characters, but never invent unsupported background information." },
          backgroundConfidence: { type: "string", enum: [...confidenceValues], description: "Background-information confidence: high, medium, low, or unverified." },
          sourceLinks: { type: "array", minItems: 1, maxItems: 8, description: "Specific URLs supporting the background information, not homepages.", items: { type: "string" } },
          playbackSources: {
            type: "array", minItems: 1, maxItems: 3, description: "YouTube sources in priority order; official sources first.",
            items: {
              type: "object",
              properties: {
                videoId: { type: "string", pattern: "^[A-Za-z0-9_-]{11}$", description: "The 11-character YouTube video ID from the v= parameter. Do not submit a full URL.", examples: ["vx4kLgnFexo"] },
                title: { type: "string", minLength: 1, maxLength: 300, description: "Video title, when useful." },
                channelName: { type: "string", minLength: 1, maxLength: 200, description: "YouTube channel name, when known." },
                sourceType: { type: "string", enum: [...sourceTypeValues], description: "Source category: official-mv, official-audio, topic, label, or other." },
              },
              required: ["videoId", "sourceType"],
            },
          },
        },
        required: ["title", "artist", "selectionReason", "playlistRole", "introduction", "backgroundConfidence", "sourceLinks", "playbackSources"],
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
    tracks: { type: "array", minItems: 1, maxItems: 20, description: "Tracks appended to the end of the current playlist in playback order.", items: trackArgsSchema },
  },
  required: ["tracks"],
} satisfies ToolArgsSchema;
