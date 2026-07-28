import { afterEach, describe, expect, it, vi } from "vitest";
import { validateYouTubeVideoId, validateYouTubeVideoIds } from "../src/lib/youtube-oembed";

const response = (body: unknown, ok = true) => ({ ok, json: vi.fn().mockResolvedValue(body) });

describe("YouTube oEmbed validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts successful oEmbed JSON with non-empty html", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ html: "<iframe />" })));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toMatchObject({ status: "valid" });
  });

  it("rejects non-2xx responses, fetch failures, invalid JSON, and missing html", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, false)));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toMatchObject({ status: "unknown" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toMatchObject({ status: "unknown" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new Error("bad json")) }));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toMatchObject({ status: "unknown" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ html: " " })));
    await expect(validateYouTubeVideoId("vx4kLgnFexo")).resolves.toMatchObject({ status: "unknown" });
  });

  it("returns each ID once with its validation result", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response({ html: url.includes("goodVideo01") ? "<iframe />" : "" }))));
    await expect(validateYouTubeVideoIds(["goodVideo01", "badVideo001", "badVideo001", "badVideo002"], { retries: 0 })).resolves.toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("times out stalled requests", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))));
    await expect(validateYouTubeVideoId("vx4kLgnFexo", 1)).resolves.toMatchObject({ status: "unknown", reason: "timeout" });
  });
});
