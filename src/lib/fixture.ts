import type { AppLocale } from "./i18n";
import type { Playlist } from "./types";

const songs = [
  ["t1", "Mitski", "My Love Mine All Mine", "vx4kLgnFexo"], ["t2", "The Marías", "Cariño", "J_QGZspO4gg"], ["t3", "Men I Trust", "Show Me How", "OZRYzH0Q0pU"], ["t4", "NIKI", "Every Summertime", "FqA5T3bR0CE"], ["t5", "HYUKOH", "Comes And Goes", "ECMc1SB60E0"], ["t6", "Yogee New Waves", "Climax Night", "J6R4lQm5EwY"], ["t7", "beabadoobee", "The Perfect Pair", "xI9bF7A0YTA"], ["t8", "Lamp", "For Lovers", "pbDBWxyCOhQ"], ["t9", "KIRINJI", "Aliens", "HkqY1Ek0EwM"],
] as const;
const zhRoles = ["留一點空白", "把空氣變暖", "平穩轉場", "抬起一些光", "保持行進", "夜色轉場", "輕快停靠", "收回視線", "明亮收尾"];
const enRoles = ["Leave some space", "Warm the air", "Steady transition", "Lift the light", "Keep moving", "Nightfall transition", "Lighthearted stop", "Draw the gaze inward", "Bright ending"];

export const fixturePlaylist = (locale: AppLocale = "zh-TW"): Playlist => {
  const isZh = locale === "zh-TW";
  const time = new Date().toISOString();
  return {
    id: "fixture-playlist", title: isZh ? "傍晚慢慢亮起來" : "An evening slowly brightens", description: isZh ? "從留白開始，最後留下一點明亮。" : "Begin with space, and leave a little brightness at the end.", createdAt: time, updatedAt: time,
    tracks: songs.map(([id, artist, title, videoId], i) => ({
      id, title, artist,
      selectionReason: isZh ? "作為這段傍晚情緒的自然延伸，讓整體的情緒與步伐保持連貫。" : "A natural continuation of this evening mood, keeping its emotional pace connected.",
      playlistRole: (isZh ? zhRoles : enRoles)[i],
      introduction: isZh ? "簡單的旋律替這段路留下一點呼吸的空間，不急著替情緒命名，而是讓聲音陪著人把當下慢慢整理好，留給下一首自然接手的位置。" : "Its unhurried melody leaves room to breathe rather than naming the feeling too quickly. Let it sit beside the moment, gather it gently, and make space for the next song to arrive naturally.",
      backgroundConfidence: i === 2 ? "unverified" : i % 2 ? "medium" : "high", sourceLinks: [`https://www.youtube.com/watch?v=${videoId}`], playbackSource: { platform: "youtube", videoId, url: `https://www.youtube.com/watch?v=${videoId}`, channelName: "Official YouTube", sourceType: i % 3 === 0 ? "official-mv" : "official-audio" },
    })),
  };
};
