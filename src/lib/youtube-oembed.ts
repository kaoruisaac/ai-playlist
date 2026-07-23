const DEFAULT_TIMEOUT_MS = 5_000;

export async function validateYouTubeVideoId(videoId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return Boolean(body && typeof body === "object" && !Array.isArray(body) && typeof (body as { html?: unknown }).html === "string" && (body as { html: string }).html.trim());
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateYouTubeVideoIds(videoIds: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
  const uniqueVideoIds = [...new Set(videoIds)];
  const valid = await Promise.all(uniqueVideoIds.map(async (videoId) => ({ videoId, valid: await validateYouTubeVideoId(videoId, timeoutMs) })));
  return valid.filter((result) => !result.valid).map((result) => result.videoId);
}
