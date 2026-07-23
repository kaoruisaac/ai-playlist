import { describe, expect, it } from "vitest";
import { classifyAgentDraft, hasAgentChatOutput, sanitizeAgentConversation } from "../src/lib/agent-message";

describe("sanitizeAgentConversation", () => {
  it("preserves ordinary conversation", () => {
    expect(sanitizeAgentConversation("  今晚適合慢慢走，讓節奏輕一點。  ")).toBe("今晚適合慢慢走，讓節奏輕一點。");
  });

  it("hides complete JSON objects and arrays", () => {
    expect(sanitizeAgentConversation('{"tool":"append_tracks","tracks":[]}')).toBe("");
    expect(sanitizeAgentConversation("[\n  {\"name\": \"song\"}\n]")).toBe("");
  });

  it("removes JSON containers at any position without losing surrounding prose", () => {
    expect(sanitizeAgentConversation('先整理一下。\n{"foo":"bar"}')).toBe("先整理一下。");
    expect(sanitizeAgentConversation('{"foo":"bar"}\n整理完成。')).toBe("整理完成。");
    expect(sanitizeAgentConversation('前段。\n{"a":1}\n中段。\n[{"b":2}]\n後段。')).toBe("前段。\n\n中段。\n\n後段。");
    expect(sanitizeAgentConversation('{"a":1}{"b":2}[{"c":3}]')).toBe("");
  });

  it("handles nesting, escaped JSON strings, and invalid bracketed prose", () => {
    expect(sanitizeAgentConversation('前段 {"nested":{"list":["[x]","a\\"b"]}} 後段')).toBe("前段 \n 後段");
    expect(sanitizeAgentConversation("我會用 {安靜、溫暖} 選歌。 [Live] {foo: bar}")).toBe("我會用 {安靜、溫暖} 選歌。 [Live] {foo: bar}");
  });

  it("hides JSON fences regardless of tag case and removes them from mixed text", () => {
    expect(sanitizeAgentConversation("```JSON\n{\"tracks\":[]}\n``` ")).toBe("");
    expect(sanitizeAgentConversation("先替你整理幾首。\n\n```json\n{\"tracks\":[]}\n```\n\n接著會排好順序。")).toBe("先替你整理幾首。\n\n接著會排好順序。");
  });

  it("removes generic and same-line JSON fences but keeps regular code", () => {
    expect(sanitizeAgentConversation('``` {"foo":"bar"} ```')).toBe("");
    expect(sanitizeAgentConversation('```\n{"foo":"bar"}\n```')).toBe("");
    expect(sanitizeAgentConversation('```ts\nconst value = { foo: "bar" };\n```')).toBe('```ts\nconst value = { foo: "bar" };\n```');
  });

  it("does not remove ordinary punctuation or non-JSON code", () => {
    expect(sanitizeAgentConversation("歌名可寫成 [Live]，不是 JSON。")).toBe("歌名可寫成 [Live]，不是 JSON。");
    expect(sanitizeAgentConversation("```text\nhello\n```")).toBe("```text\nhello\n```");
  });

  it("holds a structured draft during streaming", () => {
    expect(classifyAgentDraft('{"tracks":').visibleText).toBe("");
    expect(classifyAgentDraft("先說一句。\n```json\n{\"tracks\":").visibleText).toBe("先說一句。");
  });

  it("hides only an unfinished JSON tail and resumes after it", () => {
    expect(classifyAgentDraft('先說一句。\n{"tracks":')).toEqual({ visibleText: "先說一句。", holdForStructuredContent: true });
    expect(classifyAgentDraft('先說一句。\n{"tracks":[]}')).toEqual({ visibleText: "先說一句。", holdForStructuredContent: false });
    expect(classifyAgentDraft('先說一句。\n{"tracks":[]}\n再說一句。')).toEqual({ visibleText: "先說一句。\n\n再說一句。", holdForStructuredContent: false });
    expect(classifyAgentDraft("我喜歡 [Live 版本")).toEqual({ visibleText: "我喜歡 [Live 版本", holdForStructuredContent: false });
  });

  it("bypasses every JSON filter in development mode", () => {
    const development = { filterJson: false };
    expect(sanitizeAgentConversation('{"foo":"bar"}', development)).toBe('{"foo":"bar"}');
    expect(sanitizeAgentConversation('前段。\n```json\n{"foo":"bar"}\n```\n後段。', development)).toBe('前段。\n```json\n{"foo":"bar"}\n```\n後段。');
    expect(classifyAgentDraft('{"foo":', development)).toEqual({ visibleText: '{"foo":', holdForStructuredContent: false });
    expect(hasAgentChatOutput('{"foo":"bar"}', development)).toBe(true);
    expect(hasAgentChatOutput('{"foo":"bar"}')).toBe(false);
  });
});
