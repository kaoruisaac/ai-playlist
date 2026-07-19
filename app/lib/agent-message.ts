/** Options are injectable so tests do not need to mutate the build environment. */
export type AgentMessageOptions = { filterJson?: boolean };

export type AgentDraftClassification = {
  visibleText: string;
  holdForStructuredContent: boolean;
};

/** Vite replaces this in client bundles; Vitest's `test` mode intentionally filters. */
export const isAgentJsonFilteringEnabled = () =>
  // (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE !== "development";
  true;

function shouldFilter(options?: AgentMessageOptions) {
  return options?.filterJson ?? isAgentJsonFilteringEnabled();
}

function normalize(text: string) {
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
}

function isJsonContainer(value: string) {
  try {
    const parsed: unknown = JSON.parse(value.trim());
    return Array.isArray(parsed) || (!!parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

/** Finds the matching JSON delimiter without being confused by quoted strings. */
function findJsonEnd(text: string, start: number) {
  const opening = text[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** A deliberately narrow prefix check prevents ordinary [Live] and {words} from being held. */
function mayBeJsonPrefix(text: string, start: number) {
  const opening = text[start];
  const rest = text.slice(start + 1);
  const first = rest.match(/^\s*([\s\S])/)?.[1];
  if (!first) return true;
  if (opening === "{") return first === '"' || first === "}";
  return /["[{\d\-tfn\]]/.test(first);
}

type JsonScan = { text: string; incompleteStart: number | null };

function scanJsonSegments(text: string, holdIncomplete: boolean): JsonScan {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith("```", index)) {
      const end = text.indexOf("```", index + 3);
      if (end >= 0) {
        result += text.slice(index, end + 3);
        index = end + 2;
        continue;
      }
    }
    if (text[index] !== "{" && text[index] !== "[") {
      result += text[index];
      continue;
    }
    const end = findJsonEnd(text, index);
    if (end >= 0) {
      const candidate = text.slice(index, end + 1);
      if (isJsonContainer(candidate)) {
        // A newline keeps prose on either side from being accidentally joined.
        result += "\n";
        index = end;
        continue;
      }
    } else if (holdIncomplete && mayBeJsonPrefix(text, index)) {
      return { text: result, incompleteStart: index };
    }
    result += text[index];
  }
  return { text: result, incompleteStart: null };
}

/** Removes complete fenced JSON containers, including unlabelled JSON fences. */
function stripCompleteJsonFences(text: string) {
  return text.replace(/```([a-z0-9_-]*)[ \t]*(?:\r?\n)?([\s\S]*?)```/gi, (block, _language: string, body: string) =>
    isJsonContainer(body) ? "\n" : block,
  );
}

function incompleteJsonFenceStart(text: string) {
  const fence = /```\s*json\b[^\r\n`]*(?:\r?\n|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(text))) {
    if (text.indexOf("```", fence.lastIndex) < 0) return match.index;
  }
  return null;
}

/** Exported independently for focused scanner tests and future non-chat consumers. */
export function stripJsonSegments(rawText: string): string {
  return scanJsonSegments(stripCompleteJsonFences(rawText), false).text;
}

/** Keep structured transport payloads out of the human conversation surface. */
export function sanitizeAgentConversation(rawText: string, options?: AgentMessageOptions): string {
  if (!shouldFilter(options)) return normalize(rawText);
  return normalize(stripJsonSegments(rawText));
}

/** Shared by the UI flush path and Pedelec's tool warm-up guard. */
export function hasAgentChatOutput(rawText: string, options?: AgentMessageOptions) {
  return Boolean(sanitizeAgentConversation(rawText, options));
}

export function classifyAgentDraft(rawText: string, options?: AgentMessageOptions): AgentDraftClassification {
  if (!shouldFilter(options)) {
    return { visibleText: normalize(rawText), holdForStructuredContent: false };
  }

  const incompleteFence = incompleteJsonFenceStart(rawText);
  if (incompleteFence !== null) {
    return {
      visibleText: sanitizeAgentConversation(rawText.slice(0, incompleteFence), options),
      holdForStructuredContent: true,
    };
  }

  const scan = scanJsonSegments(stripCompleteJsonFences(rawText), true);
  return {
    visibleText: normalize(scan.text),
    holdForStructuredContent: scan.incompleteStart !== null,
  };
}
