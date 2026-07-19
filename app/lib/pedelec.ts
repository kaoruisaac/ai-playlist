import { defineTool, Pedelec, type ChatEventContext, type PedelecSession, type ProviderCode, type ProviderInfo, type ToolCallContext } from "@kaoruisaac/pedelec";
import { appendTracksArgsSchema, appendTracksInputSchema, playlistSchema, startNewPlaylistArgsSchema, startNewPlaylistInputSchema, type AppendTracksInput, type StartNewPlaylistInput } from "./schema";
import type { PedelecState, PlaylistSession } from "./types";
import { addMessage, appendTracks, appendTracksToPlaylist, buildEmptyPlaylist, moveTrack, removeTrack, startNewPlaylist } from "./session";
import { getAgentGuidance } from "./agent";
import { hasAgentChatOutput } from "./agent-message";

type Update = (fn: (session: PlaylistSession) => PlaylistSession) => void;
export type PedelecConnection = { session: PedelecSession; provider: string; dispose: () => Promise<void> };
export type PedelecCallbacks = {
  onState: (state: PedelecState) => void;
  onChatDelta: (delta: string, context: ChatEventContext) => void;
  onBeforeTool: (context: ToolCallContext) => void;
  onProviderSettings?: (data: { providers: ProviderInfo[]; defaultProvider: ProviderCode | null; defaultModels: Partial<Record<ProviderCode, string>> }) => void;
  onConnectionError?: () => void;
};

const result = (ok: boolean, message: string, data?: object) => ({ ok, message, ...data });
const warmupRequired = (locale: PlaylistSession["agentSettings"]["locale"]) => locale === "zh-TW" ? "使用工具前，請先以 1～3 句自然回應接住使用者需求，再重試此工具。" : "Before using tools, first send the user a brief 1–3 sentence acknowledgement related to their request, then retry this tool.";
const formatIssues = (issues: { path: PropertyKey[]; code: string; message: string }[]) => issues.slice(0, 20).map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }));

export async function connectPedelec(
  settings: PlaylistSession["agentSettings"], update: Update, getLatestSession: () => PlaylistSession | null, callbacks: PedelecCallbacks,
): Promise<PedelecConnection | null> {
  const pedelec = new Pedelec();
  const approval = await pedelec.getApprovalStatus();
  if (!approval.installed) { callbacks.onState("not-installed"); return null; }
  const [providers, desktopSettings] = await Promise.all([pedelec.listProviders(), pedelec.getSettings()]);
  callbacks.onProviderSettings?.({ providers, ...desktopSettings });
  if (!providers.some((provider) => provider.available)) { callbacks.onState("disconnected"); return null; }
  const provider = (settings.provider ?? desktopSettings.defaultProvider) as ProviderCode | undefined;
  if (!provider || !providers.some((item) => item.code === provider && item.available)) { callbacks.onState("needs-settings"); return null; }

  const warmedTurns = new Set<string>();
  const turnChatBuffers = new Map<string, string>();
  const beforeTool = (ctx: ToolCallContext) => {
    if (!warmedTurns.has(ctx.turnId)) return false;
    callbacks.onBeforeTool(ctx);
    return true;
  };
  const current = () => {
    const session = getLatestSession();
    if (!session) throw new Error("Playlist session is not initialized.");
    return session;
  };
  const guarded = (ctx: ToolCallContext) => beforeTool(ctx) ? null : result(false, warmupRequired(settings.locale));
  const tools = [
    defineTool({ name: "get_playlist_preferences", description: "Read the current website track-count preference and remaining playlist capacity before researching or adding songs.", argsSchema: { type: "object", properties: {}, required: [] }, handler: (_args, ctx) => { const denied = guarded(ctx); if (denied) return denied; const s = current(); const currentTrackCount = s.playlist?.tracks.length ?? 0; return result(true, "Current playlist preferences", { preferredTrackCount: s.agentSettings.preferredTrackCount, currentTrackCount, remainingCapacity: Math.max(0, 20 - currentTrackCount), maximumTrackCount: 20 }); } }),
    defineTool({ name: "get_playlist_state", description: "Read the current playlist, active track, and playback state before inspecting or making a targeted change.", argsSchema: { type: "object", properties: {}, required: [] }, handler: (_args, ctx) => { const denied = guarded(ctx); if (denied) return denied; const s = current(); return result(true, "Current state", { playlist: s.playlist, playback: s.playback }); } }),
    defineTool({ name: "start_new_playlist", description: "Start a new empty playlist and discard the current playlist. Use this for the first playlist or when the user clearly wants a completely new playlist. To continue the current playlist, use append_tracks directly.", argsSchema: startNewPlaylistArgsSchema, handler: (args: StartNewPlaylistInput, ctx) => { const denied = guarded(ctx); if (denied) return denied; const input = startNewPlaylistInputSchema.safeParse(args); if (!input.success) return result(false, "Playlist payload is invalid.", { issues: formatIssues(input.error.issues) }); const playlist = buildEmptyPlaylist(input.data); const parsed = playlistSchema.safeParse(playlist); if (!parsed.success) return result(false, "Playlist could not be normalized into a valid app playlist.", { issues: formatIssues(parsed.error.issues) }); update((s) => startNewPlaylist(s, parsed.data)); return result(true, "New playlist started", { playlistId: parsed.data.id, trackCount: 0 }); } }),
    defineTool({ name: "append_tracks", description: "Append one or more researched tracks to the end of the current playlist without replacing or restarting existing tracks.", argsSchema: appendTracksArgsSchema, handler: (args: AppendTracksInput, ctx) => { const denied = guarded(ctx); if (denied) return denied; const input = appendTracksInputSchema.safeParse(args); if (!input.success) return result(false, "Track payload is invalid.", { issues: formatIssues(input.error.issues) }); const session = current(); const createdPlaylist = !session.playlist; const currentPlaylist = session.playlist ?? buildEmptyPlaylist(settings.locale === "zh-TW" ? { title: "新的播放清單", description: "依照目前需求整理的歌曲。" } : { title: "New playlist", description: "Songs arranged around the current request." }); if (currentPlaylist.tracks.length + input.data.tracks.length > 20) return result(false, "Appending these tracks would exceed the 20-track playlist limit.", { currentTrackCount: currentPlaylist.tracks.length, requestedAddCount: input.data.tracks.length, maximumTrackCount: 20 }); let next; try { next = appendTracksToPlaylist(currentPlaylist, input.data); } catch (error) { return result(false, error instanceof Error ? error.message : "Tracks could not be appended."); } const parsed = playlistSchema.safeParse(next); if (!parsed.success) return result(false, "Tracks could not be normalized into a valid app playlist.", { issues: formatIssues(parsed.error.issues) }); update((s) => appendTracks(s, parsed.data)); return result(true, "Tracks appended", { createdPlaylist, addedCount: input.data.tracks.length, trackCount: parsed.data.tracks.length }); } }),
    defineTool({ name: "remove_tracks", description: "Remove specified tracks by stable track ID. Read state first and never infer an ambiguous title.", argsSchema: { type: "object", properties: { trackIds: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["trackIds"] }, handler: (args: { trackIds: string[] }, ctx) => { const denied = guarded(ctx); if (denied) return denied; update((s) => args.trackIds.reduce((next, id) => removeTrack(next, id), s)); return result(true, "Tracks removed"); } }),
    defineTool({ name: "reorder_tracks", description: "Move a track one position up or down while preserving the active track.", argsSchema: { type: "object", properties: { trackId: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } }, required: ["trackId", "direction"] }, handler: (args: { trackId: string; direction: "up" | "down" }, ctx) => { const denied = guarded(ctx); if (denied) return denied; update((s) => moveTrack(s, args.trackId, args.direction === "up" ? -1 : 1)); return result(true, "Track reordered"); } }),
    defineTool({ name: "report_task_progress", description: "Show one short, human-readable progress update while researching or arranging music. Never expose technical process details.", argsSchema: { type: "object", properties: { message: { type: "string", minLength: 1, maxLength: 180 } }, required: ["message"] }, handler: (args: { message: string }, ctx) => { const denied = guarded(ctx); if (denied) return denied; update((s) => addMessage(s, { role: "agent", kind: "task-progress", content: args.message })); return result(true, "Progress shown"); } }),
  ] as const;
  const session = await pedelec.createSession({ provider, model: settings.model, skills: { guidance: getAgentGuidance(settings.locale), tools: tools as never }, autoEndOnDisconnect: true });
  let disposed = false;
  const unsubscribers = [
    session.onChat((delta, ctx) => { const next = (turnChatBuffers.get(ctx.turnId) ?? "") + delta; turnChatBuffers.set(ctx.turnId, next); if (hasAgentChatOutput(next)) warmedTurns.add(ctx.turnId); callbacks.onChatDelta(delta, ctx); }),
    session.onStatus((status) => { if (status === "idle" || status === "error" || status === "ended") turnChatBuffers.clear(); callbacks.onState(status === "idle" ? "connected" : status === "running" || status === "waiting_tool_result" ? status : status === "error" ? "error" : "disconnected"); }),
    session.onError(() => { callbacks.onConnectionError?.(); callbacks.onState("error"); }),
    session.onEnded(() => callbacks.onState("disconnected")),
  ];
  callbacks.onState("connected");
  return { session, provider, dispose: async () => { if (disposed) return; disposed = true; turnChatBuffers.clear(); warmedTurns.clear(); unsubscribers.forEach((unsubscribe) => unsubscribe()); if (session.getStatus() !== "ended") await session.end(); } };
}
