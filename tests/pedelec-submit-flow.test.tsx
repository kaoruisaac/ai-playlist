import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PedelecCallbacks } from "../src/lib/pedelec";

const sendText = vi.fn(async () => {});
const dispose = vi.fn(async () => {});
let emittedCallbacks: PedelecCallbacks | undefined;
const { connectPedelec } = vi.hoisted(() => ({ connectPedelec: vi.fn() }));
vi.mock("../src/lib/pedelec", () => ({ connectPedelec }));

import App from "../src/App";

describe("Pedelec submit flow", () => {
  afterEach(cleanup);
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-TW"] });
    sendText.mockClear();
    dispose.mockClear();
    emittedCallbacks = undefined;
    connectPedelec.mockImplementation(async (_settings, _update, _get, callbacks) => {
      emittedCallbacks = callbacks;
      callbacks.onState("connected");
      return { session: { sessionId: "test-session", getStatus: () => "idle", sendText }, dispose };
    });
  });

  it("sends trimmed input to the live Pedelec session and saves the user message", async () => {
    render(<App />);
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(input, { target: { value: "  雨後散步  " } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => expect(sendText).toHaveBeenCalledWith("雨後散步"));
    expect(screen.getByText("雨後散步")).toBeTruthy();
    expect(screen.queryByText("聽起來這一刻不需要太用力。我會先替你翻幾首合適的歌，再把順序排得自然一點。")).toBeNull();
  });
  it("lets the user persist one track-count preference without changing submitted text", async () => {
    render(<App />);
    const choice = await screen.findByRole("radio", { name: "5" });
    expect((screen.getByRole("radio", { name: "10" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(choice);
    expect((choice as HTMLInputElement).checked).toBe(true);
    expect(JSON.parse(localStorage.getItem("ai-playlist:preferences:v1") ?? "{}").preferredTrackCount).toBe(5);
    const input = screen.getByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "  午夜散步  " } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => expect(sendText).toHaveBeenCalledWith("午夜散步"));
  });

  const deltaContext = { sessionId: "test-session", turnId: "turn-1", type: "chat_delta" } as Parameters<PedelecCallbacks["onChatDelta"]>[1];
  const chatContext = { sessionId: "test-session", turnId: "turn-1", type: "chat_message" } as Parameters<PedelecCallbacks["onChat"]>[1];
  const toolContext = { sessionId: "test-session", turnId: "turn-1", type: "tool_call", tool: "get_playlist_state", toolRequestId: "req-1" } as Parameters<PedelecCallbacks["onBeforeTool"]>[0];

  it("never renders streamed JSON and flushes only the surrounding conversation", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    emittedCallbacks!.onChatDelta("我先整理一下。\n", deltaContext);
    expect(await screen.findByText("我先整理一下。")).toBeTruthy();
    emittedCallbacks!.onChatDelta('{"foo":', deltaContext);
    expect(screen.queryByText('{"foo":')).toBeNull();
    emittedCallbacks!.onChatDelta('"bar"}', deltaContext);
    expect(screen.queryByText(/foo/)).toBeNull();
    emittedCallbacks!.onChatDelta("\n接著排順序。", deltaContext);
    expect(await screen.findByText("我先整理一下。 接著排順序。")).toBeTruthy();
    emittedCallbacks!.onChat("我先整理一下。\n{\"foo\":\"bar\"}\n接著排順序。", chatContext);
    emittedCallbacks!.onBeforeTool(toolContext);
    await waitFor(() => expect(screen.getAllByText("我先整理一下。 接著排順序。")).toHaveLength(1));
  });

  it("shows one message for a full delta stream plus matching completed onChat", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta("先替你找歌。", deltaContext);
      emittedCallbacks!.onChat("先替你找歌。", chatContext);
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "完整串流" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => expect(screen.getAllByText("先替你找歌。")).toHaveLength(1));
  });

  it("shows the completed onChat message when no deltas arrive", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChat("沒有 delta，但有完整訊息。", chatContext);
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "只有完成訊息" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => expect(screen.getAllByText("沒有 delta，但有完整訊息。")).toHaveLength(1));
  });

  it("replaces a partial delta draft with the completed onChat text", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta("先找前半", deltaContext);
      emittedCallbacks!.onChat("先找前半，再補上後半。", chatContext);
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "部分串流" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => expect(screen.getAllByText("先找前半，再補上後半。")).toHaveLength(1));
    expect(screen.queryByText("先找前半")).toBeNull();
  });

  it("keeps both assistant messages around a tool call in the same turn", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta("我先確認需求。", deltaContext);
      emittedCallbacks!.onChat("我先確認需求。", chatContext);
      emittedCallbacks!.onBeforeTool(toolContext);
      emittedCallbacks!.onChatDelta("接下來開始選歌。", deltaContext);
      emittedCallbacks!.onChat("接下來開始選歌。", chatContext);
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "兩段訊息" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => {
      expect(screen.getAllByText("我先確認需求。")).toHaveLength(1);
      expect(screen.getAllByText("接下來開始選歌。")).toHaveLength(1);
    });
  });

  it("updates a flushed partial draft when completed onChat arrives after the tool boundary", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta("先講一半", deltaContext);
      emittedCallbacks!.onBeforeTool(toolContext);
      emittedCallbacks!.onChat("先講一半，再補完整。", chatContext);
      emittedCallbacks!.onChat("工具後的第二段。", chatContext);
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "flush 後校正" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => {
      expect(screen.getAllByText("先講一半，再補完整。")).toHaveLength(1);
      expect(screen.getAllByText("工具後的第二段。")).toHaveLength(1);
    });
    expect(screen.queryByText("先講一半")).toBeNull();
  });

  it("preserves visible streamed output before appending the send failure", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    const providerMessage = "Failed to authenticate: OAuth session expired and could not be refreshed";
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta(providerMessage, deltaContext);
      throw new Error("send failed");
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "  雨後散步  " } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));

    await waitFor(() => {
      expect(screen.getAllByText(providerMessage)).toHaveLength(1);
      expect(screen.getAllByText("剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。")).toHaveLength(1);
    });
    const messages = [...document.querySelectorAll(".message")].map((message) => message.textContent);
    expect(messages.indexOf(providerMessage)).toBeLessThan(messages.indexOf("剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。"));
  });

  it("preserves a completed onChat message before appending the send failure", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    const providerMessage = "Provider refused the request after returning this note.";
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChat(providerMessage, chatContext);
      throw new Error("send failed");
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "完成訊息後失敗" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));

    await waitFor(() => {
      expect(screen.getAllByText(providerMessage)).toHaveLength(1);
      expect(screen.getAllByText("剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。")).toHaveLength(1);
    });
  });

  it("appends only the send failure when no assistant output was received", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockRejectedValueOnce(new Error("send failed"));
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "沒有回應" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));

    await waitFor(() => expect(screen.getAllByText("剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。")).toHaveLength(1));
    expect(document.querySelectorAll(".message.agent.conversation")).toHaveLength(0);
  });

  it("does not preserve a structured-only draft when sendText rejects", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta('{"error":"authentication_failed"}', deltaContext);
      throw new Error("send failed");
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "驗證連線" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));

    await waitFor(() => expect(screen.getAllByText("剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。")).toHaveLength(1));
    expect(screen.queryByText(/authentication_failed/)).toBeNull();
    expect(document.querySelectorAll(".message.agent.conversation")).toHaveLength(0);
  });

  it("preserves only natural language from a mixed draft on send failure", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    const providerMessage = "Authentication failed.";
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta(`${providerMessage}\n{"code":"oauth_expired"}`, deltaContext);
      throw new Error("send failed");
    });
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    fireEvent.change(input, { target: { value: "檢查 OAuth" } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));

    await waitFor(() => expect(screen.getAllByText(providerMessage)).toHaveLength(1));
    expect(screen.queryByText(/oauth_expired/)).toBeNull();
    expect(screen.getAllByText("剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。")).toHaveLength(1);
  });
});
