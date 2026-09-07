import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatDeltaEventContext, ChatEventContext, ToolCallContext } from "@kaoruisaac/pedelec";
import type { PedelecCallbacks } from "../src/lib/pedelec";
import { newSession } from "../src/lib/session";

const sessionHandlers = vi.hoisted(() => ({
  onChat: undefined as undefined | ((text: string, ctx: ChatEventContext) => void),
  onChatDelta: undefined as undefined | ((text: string, ctx: ChatDeltaEventContext) => void),
  tools: [] as Array<{ name: string; handler: (args: unknown, ctx: ToolCallContext) => unknown }>,
}));

vi.mock("@kaoruisaac/pedelec", () => {
  class Pedelec {
    async getApprovalStatus() {
      return { installed: true, approved: true };
    }
    async listProviders() {
      return [{ code: "codex", name: "Codex", available: true }];
    }
    async getSettings() {
      return { defaultProvider: "codex" };
    }
    async createSession(input: { skills?: { tools?: Array<{ name: string; handler: (args: unknown, ctx: ToolCallContext) => unknown }> } }) {
      sessionHandlers.tools = [...(input.skills?.tools ?? [])];
      return {
        sessionId: "session-1",
        getStatus: () => "idle",
        end: vi.fn(async () => {}),
        onChat: (handler: (text: string, ctx: ChatEventContext) => void) => {
          sessionHandlers.onChat = handler;
          return () => {
            if (sessionHandlers.onChat === handler) sessionHandlers.onChat = undefined;
          };
        },
        onChatDelta: (handler: (text: string, ctx: ChatDeltaEventContext) => void) => {
          sessionHandlers.onChatDelta = handler;
          return () => {
            if (sessionHandlers.onChatDelta === handler) sessionHandlers.onChatDelta = undefined;
          };
        },
        onStatus: () => () => {},
        onError: () => () => {},
        onEnded: () => () => {},
      };
    }
  }
  return {
    Pedelec,
    defineTool: <T,>(tool: T) => tool,
  };
});

import { connectPedelec } from "../src/lib/pedelec";

const chatCtx = (turnId = "turn-1"): ChatEventContext =>
  ({ sessionId: "session-1", turnId, type: "chat_message" }) as ChatEventContext;
const deltaCtx = (turnId = "turn-1"): ChatDeltaEventContext =>
  ({ sessionId: "session-1", turnId, type: "chat_delta" }) as ChatDeltaEventContext;
const toolCtx = (turnId = "turn-1"): ToolCallContext =>
  ({ sessionId: "session-1", turnId, type: "tool_call", tool: "get_playlist_state", toolRequestId: "req-1" }) as ToolCallContext;

describe("Pedelec 0.3.0 chat event binding", () => {
  beforeEach(() => {
    sessionHandlers.onChat = undefined;
    sessionHandlers.onChatDelta = undefined;
    sessionHandlers.tools = [];
  });

  async function connect(callbacks: Partial<PedelecCallbacks> = {}) {
    const session = newSession();
    const full: PedelecCallbacks = {
      onState: vi.fn(),
      onChatDelta: vi.fn(),
      onChat: vi.fn(),
      onBeforeTool: vi.fn(),
      ...callbacks,
    };
    const connection = await connectPedelec(
      session.agentSettings,
      vi.fn(),
      () => session,
      full,
    );
    expect(connection).not.toBeNull();
    expect(sessionHandlers.onChat).toBeTypeOf("function");
    expect(sessionHandlers.onChatDelta).toBeTypeOf("function");
    return { full, session };
  }

  it("forwards incremental text through onChatDelta and completed text through onChat", async () => {
    const { full } = await connect();
    sessionHandlers.onChatDelta!("先", deltaCtx());
    sessionHandlers.onChatDelta!("整理。", deltaCtx());
    sessionHandlers.onChat!("先整理。", chatCtx());
    expect(full.onChatDelta).toHaveBeenCalledTimes(2);
    expect(full.onChatDelta).toHaveBeenNthCalledWith(1, "先", expect.objectContaining({ type: "chat_delta" }));
    expect(full.onChat).toHaveBeenCalledWith("先整理。", expect.objectContaining({ type: "chat_message" }));
  });

  it("warms a turn from a completed natural-language onChat without deltas", async () => {
    const onBeforeTool = vi.fn();
    await connect({ onBeforeTool });
    sessionHandlers.onChat!("先替你找幾首合適的歌。", chatCtx());
    const tool = sessionHandlers.tools.find((item) => item.name === "get_playlist_state");
    expect(tool).toBeDefined();
    const result = tool!.handler({}, toolCtx());
    expect(result).toMatchObject({ ok: true });
    expect(onBeforeTool).toHaveBeenCalledTimes(1);
  });

  it("does not warm a turn from structured-only delta or completed chat", async () => {
    const onBeforeTool = vi.fn();
    await connect({ onBeforeTool });
    const tool = sessionHandlers.tools.find((item) => item.name === "get_playlist_state");
    expect(tool).toBeDefined();

    sessionHandlers.onChatDelta!('{"error":"auth"}', deltaCtx());
    expect(tool!.handler({}, toolCtx())).toMatchObject({ ok: false });
    expect(onBeforeTool).not.toHaveBeenCalled();

    sessionHandlers.onChat!('{"error":"auth"}', chatCtx("turn-2"));
    expect(tool!.handler({}, toolCtx("turn-2"))).toMatchObject({ ok: false });
    expect(onBeforeTool).not.toHaveBeenCalled();
  });

  it("warms a turn once natural-language deltas accumulate", async () => {
    const onBeforeTool = vi.fn();
    await connect({ onBeforeTool });
    const tool = sessionHandlers.tools.find((item) => item.name === "get_playlist_state");
    sessionHandlers.onChatDelta!("先", deltaCtx());
    sessionHandlers.onChatDelta!("整理一下。", deltaCtx());
    expect(tool!.handler({}, toolCtx())).toMatchObject({ ok: true });
    expect(onBeforeTool).toHaveBeenCalledTimes(1);
  });
});
