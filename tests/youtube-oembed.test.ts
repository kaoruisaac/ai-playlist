import { afterEach, describe, expect, it, vi } from "vitest";
import { validateYouTubeVideoId, validateYouTubeVideoIds } from "../src/lib/youtube-oembed";

const response = (body: unknown, ok = true) => ({ ok, json: vi.fn().mockResolvedValue(body) });

describe("YouTube oEmbed validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts successful oEmbed JSON with non-empty html", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ html: "<iframe />" })));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toBe(true);
  });

  it("rejects non-2xx responses, fetch failures, invalid JSON, and missing html", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, false)));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error("bad json")) }));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ html: " " })));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toBe(false);
  });

  it("returns every unavailable ID once", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response({ html: url.includes("goodVideo01") ? "<iframe />" : "" }))));
    await expect(validateYouTubeVideoIds(["goodVideo01", "badVideo001", "badVideo001", "badVideo002"])).resolves.toEqual(["badVideo001", "badVideo002"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("times out stalled requests", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    await expect(validateYouTubeVideoId("vx4kLgnFexo", 1)).resolves.toBe(false);
  });
});
