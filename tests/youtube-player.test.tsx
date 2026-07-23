import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixturePlaylist } from "../src/lib/fixture";
import { YouTubePlayer } from "../src/components/YouTubePlayer";

let events: Record<string, (event?: { data?: number; target?: FakePlayer }) => void> = {};
let player: FakePlayer | undefined;

class FakePlayer {
  cueVideoById = vi.fn();
  loadVideoById = vi.fn();
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  destroy = vi.fn();
  getCurrentTime = vi.fn(() => 0);

  constructor(target: HTMLElement, options: { events: typeof events }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the fake exposes its own instance for assertions.
    player = this;
    events = options.events;
    target.appendChild(document.createElement("iframe"));
    events.onReady({ target: player });
  }
}

describe("YouTubePlayer visibility", () => {
  afterEach(() => { document.body.innerHTML = ""; player = undefined; });

  it("only reveals the current source after YouTube reports PLAYING", async () => {
    window.YT = { Player: FakePlayer as never, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 } };
    const playlist = fixturePlaylist();
    const callbacks = { onPlay: vi.fn(), onPause: vi.fn(), onEnded: vi.fn(), onError: vi.fn(), onAutoplayBlocked: vi.fn(), onTime: vi.fn() };
    const view = render(<YouTubePlayer track={playlist.tracks[0]} playing={false} {...callbacks} />);
    const shell = view.container.querySelector(".video-shell")!;
    await waitFor(() => expect(events.onStateChange).toBeTypeOf("function"));
    expect(shell.getAttribute("data-video-visible")).toBe("false");

    act(() => events.onStateChange({ data: 1 }));
    expect(shell.getAttribute("data-video-visible")).toBe("true");
    expect(callbacks.onPlay).toHaveBeenCalledOnce();
    act(() => events.onStateChange({ data: 2 }));
    expect(shell.getAttribute("data-video-visible")).toBe("true");

    view.rerender(<YouTubePlayer track={playlist.tracks[1]} playing={false} {...callbacks} />);
    expect(player?.cueVideoById).toHaveBeenCalledTimes(2);
    expect(player?.cueVideoById).toHaveBeenLastCalledWith(playlist.tracks[1].playbackSources[0].videoId);
    expect(shell.getAttribute("data-video-visible")).toBe("false");
    act(() => events.onStateChange({ data: 1 }));
    expect(shell.getAttribute("data-video-visible")).toBe("true");
    act(() => events.onError());
    expect(shell.getAttribute("data-video-visible")).toBe("false");
  });

  it("loads on ready when playback was requested and reports autoplay blocks separately", async () => {
    window.YT = { Player: FakePlayer as never, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 } };
    const callbacks = { onPlay: vi.fn(), onPause: vi.fn(), onEnded: vi.fn(), onError: vi.fn(), onAutoplayBlocked: vi.fn(), onTime: vi.fn() };
    render(<YouTubePlayer track={fixturePlaylist().tracks[0]} playing {...callbacks} />);
    await waitFor(() => expect(player).toBeDefined());
    expect(player?.loadVideoById).toHaveBeenCalledWith("vx4kLgnFexo");
    act(() => events.onAutoplayBlocked());
    expect(callbacks.onAutoplayBlocked).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("does not reload when normalization creates a new track object with the same source", async () => {
    window.YT = { Player: FakePlayer as never, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 } };
    const callbacks = { onPlay: vi.fn(), onPause: vi.fn(), onEnded: vi.fn(), onError: vi.fn(), onAutoplayBlocked: vi.fn(), onTime: vi.fn() };
    const track = fixturePlaylist().tracks[0];
    const view = render(<YouTubePlayer track={track} playing {...callbacks} />);
    const shell = view.container.querySelector(".video-shell")!;
    await waitFor(() => expect(player).toBeDefined());
    act(() => events.onStateChange({ data: 1 }));
    const loadCount = player!.loadVideoById.mock.calls.length;
    const cueCount = player!.cueVideoById.mock.calls.length;

    const normalizedTrack = { ...track, playbackSources: track.playbackSources.map((source) => ({ ...source })) };
    view.rerender(<YouTubePlayer track={normalizedTrack} playing {...callbacks} />);

    expect(player!.loadVideoById).toHaveBeenCalledTimes(loadCount);
    expect(player!.cueVideoById).toHaveBeenCalledTimes(cueCount);
    expect(shell.getAttribute("data-video-visible")).toBe("true");
  });

  it("does not create a player or load a video without a usable track", async () => {
    window.YT = { Player: FakePlayer as never, PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 } };
    const callbacks = { onPlay: vi.fn(), onPause: vi.fn(), onEnded: vi.fn(), onError: vi.fn(), onAutoplayBlocked: vi.fn(), onTime: vi.fn() };
    const view = render(<YouTubePlayer playing={false} {...callbacks} />);
    await act(async () => { await Promise.resolve(); });
    expect(player).toBeUndefined();
    expect(view.container.querySelector("iframe")).toBeNull();
  });
});
