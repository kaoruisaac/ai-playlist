const DEFAULT_TIMEOUT_MS = 5_000;

export type YouTubeValidationStatus = "valid" | "invalid" | "unknown";
export type YouTubeValidationResult = {
  videoId: string;
  status: YouTubeValidationStatus;
  reason?: "not_found" | "bad_request" | "rate_limited" | "server_error" | "network_error" | "timeout" | "invalid_response";
};

export async function validateYouTubeVideoId(videoId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<YouTubeValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (response.status === 400) return { videoId, status: "invalid", reason: "bad_request" };
    if (response.status === 404) return { videoId, status: "invalid", reason: "not_found" };
    if (response.status === 429) return { videoId, status: "unknown", reason: "rate_limited" };
    if (!response.ok) return { videoId, status: "unknown", reason: "server_error" };
    const body: unknown = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) && typeof (body as { html?: unknown }).html === "string" && (body as { html: string }).html.trim()
      ? { videoId, status: "valid" }
      : { videoId, status: "unknown", reason: "invalid_response" };
  } catch (error) {
    return { videoId, status: "unknown", reason: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error" };
  } finally { clearTimeout(timeout); }
}

export async function validateYouTubeVideoIds(videoIds: string[], options: { timeoutMs?: number; retryDelayMs?: number; retries?: number } = {}): Promise<YouTubeValidationResult[]> {
  const uniqueVideoIds = [...new Set(videoIds)];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 1;
  return Promise.all(uniqueVideoIds.map(async (videoId) => {
    let outcome = await validateYouTubeVideoId(videoId, timeoutMs);
    for (let attempt = 0; outcome.status === "unknown" && attempt < retries; attempt += 1) {
      if (options.retryDelayMs) await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));
      outcome = await validateYouTubeVideoId(videoId, timeoutMs);
    }
    return outcome;
  }));
}
