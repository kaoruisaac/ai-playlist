import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PedelecCallbacks } from "../app/lib/pedelec";

const sendText = vi.fn(async () => {});
const dispose = vi.fn(async () => {});
let emittedCallbacks: PedelecCallbacks | undefined;
const { connectPedelec } = vi.hoisted(() => ({ connectPedelec: vi.fn() }));
vi.mock("../app/lib/pedelec", () => ({ connectPedelec }));

import Home from "../app/page";

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
    render(<Home />);
    const input = await screen.findByPlaceholderText("說說你現在的心情，或給我一個 vibe。");
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(input, { target: { value: "  雨後散步  " } });
    fireEvent.click(screen.getByRole("button", { name: "送出選曲需求" }));
    await waitFor(() => expect(sendText).toHaveBeenCalledWith("雨後散步"));
    expect(screen.getByText("雨後散步")).toBeTruthy();
    expect(screen.queryByText("聽起來這一刻不需要太用力。我會先替你翻幾首合適的歌，再把順序排得自然一點。")).toBeNull();
  });
  it("lets the user persist one track-count preference without changing submitted text", async () => {
    render(<Home />);
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
    render(<Home />);
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
});
