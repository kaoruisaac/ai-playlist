import { describe, expect, it } from "vitest";
import { detectLocale, localeFromBrowser, translations } from "../app/lib/i18n";
import { fixturePlaylist } from "../app/lib/fixture";
import { getAgentGuidance } from "../app/lib/agent";

describe("i18n", () => {
  it("normalizes browser and saved locales safely", () => {
    expect(localeFromBrowser(["zh-TW"])).toBe("zh-TW");
    expect(localeFromBrowser(["zh-Hant"])).toBe("zh-TW");
    expect(localeFromBrowser(["zh"])).toBe("zh-TW");
    expect(localeFromBrowser(["en-US"])).toBe("en");
    expect(localeFromBrowser(["ja"])).toBe("en");
    expect(detectLocale("bad", ["zh"])).toBe("zh-TW");
    expect(detectLocale("en", ["zh"])).toBe("en");
  });
  it("provides matching dictionaries and localized fixture copy", () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations["zh-TW"]).sort());
    const zh = fixturePlaylist("zh-TW"), en = fixturePlaylist("en");
    expect(zh.title).not.toBe(en.title);
    expect(zh.tracks.map((track) => [track.title, track.artist, track.playbackSources[0].videoId])).toEqual(en.tracks.map((track) => [track.title, track.artist, track.playbackSources[0].videoId]));
  });
  it("keeps independent, complete guidance for both locales", () => {
    const zh = getAgentGuidance("zh-TW"), en = getAgentGuidance("en");
    expect(zh).toContain("get_playlist_preferences");
    expect(en).toContain("get_playlist_preferences");
    expect(en).toContain("natural English");
    expect(en).not.toContain("你是一位");
  });
});
