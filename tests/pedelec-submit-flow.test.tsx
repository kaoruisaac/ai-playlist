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

  it("never renders streamed JSON and flushes only the surrounding conversation", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    const context = { sessionId: "test-session", turnId: "turn-1" } as Parameters<PedelecCallbacks["onChatDelta"]>[1] & Parameters<PedelecCallbacks["onBeforeTool"]>[0];
    emittedCallbacks!.onChatDelta("我先整理一下。\n", context);
    expect(await screen.findByText("我先整理一下。")).toBeTruthy();
    emittedCallbacks!.onChatDelta('{"foo":', context);
    expect(screen.queryByText('{"foo":')).toBeNull();
    emittedCallbacks!.onChatDelta('"bar"}', context);
    expect(screen.queryByText(/foo/)).toBeNull();
    emittedCallbacks!.onChatDelta("\n接著排順序。", context);
    expect(await screen.findByText("我先整理一下。 接著排順序。")).toBeTruthy();
    emittedCallbacks!.onBeforeTool(context);
    await waitFor(() => expect(screen.getAllByText("我先整理一下。 接著排順序。")).toHaveLength(1));
  });

  it("preserves visible streamed output before appending the send failure", async () => {
    render(<App />);
    await waitFor(() => expect(emittedCallbacks).toBeDefined());
    const context = { sessionId: "test-session", turnId: "turn-1" } as Parameters<PedelecCallbacks["onChatDelta"]>[1];
    const providerMessage = "Failed to authenticate: OAuth session expired and could not be refreshed";
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta(providerMessage, context);
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
    const context = { sessionId: "test-session", turnId: "turn-1" } as Parameters<PedelecCallbacks["onChatDelta"]>[1];
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta('{"error":"authentication_failed"}', context);
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
    const context = { sessionId: "test-session", turnId: "turn-1" } as Parameters<PedelecCallbacks["onChatDelta"]>[1];
    const providerMessage = "Authentication failed.";
    sendText.mockImplementationOnce(async () => {
      emittedCallbacks!.onChatDelta(`${providerMessage}\n{"code":"oauth_expired"}`, context);
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
