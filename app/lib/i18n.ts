export type AppLocale = "zh-TW" | "en";

export const isAppLocale = (value: unknown): value is AppLocale => value === "zh-TW" || value === "en";
export const localeFromBrowser = (languages?: readonly string[]): AppLocale =>
  (languages ?? []).some((language) => /^zh(?:-|$)/i.test(language)) ? "zh-TW" : "en";
export const detectLocale = (saved?: unknown, languages?: readonly string[]): AppLocale =>
  isAppLocale(saved) ? saved : localeFromBrowser(languages);
export const documentLanguage = (locale: AppLocale) => locale === "zh-TW" ? "zh-Hant" : "en";

const zh = {
  metadata: { title: "選曲室｜為此刻排一段歌", description: "說出一個心情，讓 AI 替你排好一段值得聽完的音樂。", ogAlt: "選曲室｜為此刻排一段歌" },
  header: { brand: "選曲室", tagline: "為此刻排一段歌", settings: "設定", localeLabel: "介面語言", chinese: "中文", english: "English" },
  status: { checking: "確認連線中", "not-installed": "需要 Pedelec", disconnected: "等待連線", "needs-settings": "需要設定", connected: "已準備好", running: "正在選曲", waiting_tool_result: "正在選曲", error: "暫時無法連線" },
  tabs: { chat: "對話", playlist: "播放清單" },
  chat: { heading: "今天想聽什麼樣的風景？", subheading: "說一點心情、場景或一個 vibe。", newPlaylist: "建立新歌單", empty: "先說說現在的你。我會從一段自然的回應開始，不急著替你下定義。", typing: "Agent 正在輸入", placeholder: "說說你現在的心情，或給我一個 vibe。", send: "送出", sendLabel: "送出選曲需求", count: "這次選曲數量", unavailableTitle: "選曲服務目前還沒連上。", installTitle: "Pedelec 讓我能真的替你研究與選曲。", unavailableText: "確認 Pedelec 已啟動，再回來重新連線。", installText: "請安裝並啟動 Pedelec 桌面端與 Chrome Extension，再回來重新檢查；你寫好的內容會留在這裡。", desktop: "取得桌面端", recheck: "重新檢查" },
  player: { eyebrow: "正在播放", empty: "選好歌後，播放器會在這裡等你。", noTrack: "尚未選曲", defaultTitle: "留一段空白給音樂", defaultArtist: "當歌單完成後，從第一首開始。", previous: "上一首", next: "下一首", pause: "暫停", loading: "載入中…", play: "開始播放", gesture: "第一次播放需要你按下「開始播放」。", youtube: "{title} YouTube 播放器", position: "{current} / {total}" },
  playlist: { eyebrow: "這一段的順序", empty: "還在等你的第一句話", demo: "看看示範歌單", invalidSource: "來源待換", moveUp: "將 {title} 上移", moveDown: "將 {title} 下移", remove: "移除 {title}" },
  installModal: { eyebrow: "Pedelec 連線需要完成安裝", title: "尚未偵測到 Pedelec", text: "此選曲室需要同時安裝並啟動 Pedelec 桌面端與 Chrome Extension，Agent 才能正常搜尋與整理歌單。", close: "關閉安裝提示", download: "下載桌面端", extension: "安裝 Chrome Extension", done: "我已安裝，重新檢查" },
  settingsModal: { aria: "Pedelec 設定", eyebrow: "Pedelec 設定", title: "沿用你的預設，也能在這裡覆寫", text: "Provider 會決定你的選曲要求傳往哪一個已設定的服務。", useDefault: "使用 Pedelec 預設（{provider}）", choose: "請選擇 Provider", unavailable: "原本選擇的 Provider 目前不可用，請重新選擇。", none: "目前沒有偵測到可用的 Provider，請先在 Pedelec 完成安裝或設定。", modelDefault: "留空使用預設（{model}）", modelBlank: "留空使用預設", save: "儲存並重新檢查", close: "關閉設定" },
  errors: { notReady: "Pedelec 連線尚未準備好。請重新檢查後再試一次。", sendFailed: "剛才沒有順利送出。請重新檢查 Pedelec 連線後再試一次；我不會自動重送，避免重複建立歌單。", invalidPlaylist: "歌單資料不完整，沒有套用變更。", confirmNew: "要開始一份新的歌單嗎？目前對話與歌單會清除。", loading: "正在準備你的選曲室…" },
} as const;

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
const en: DeepStrings<typeof zh> = {
  metadata: { title: "Playlist Room | Music for this moment", description: "Share a feeling and let AI arrange a stretch of music worth hearing through.", ogAlt: "Playlist Room | Music for this moment" },
  header: { brand: "Playlist Room", tagline: "Music for this moment", settings: "Settings", localeLabel: "Interface language", chinese: "中文", english: "English" },
  status: { checking: "Checking connection", "not-installed": "Pedelec required", disconnected: "Waiting to connect", "needs-settings": "Setup needed", connected: "Ready", running: "Curating", waiting_tool_result: "Curating", error: "Connection unavailable" },
  tabs: { chat: "Chat", playlist: "Playlist" },
  chat: { heading: "What kind of scene would you like to hear today?", subheading: "Share a feeling, a setting, or a vibe.", newPlaylist: "New playlist", empty: "Tell me where you are right now. I’ll begin with a natural response, without rushing to define it.", typing: "Agent is typing", placeholder: "Tell me how you feel, or give me a vibe.", send: "Send", sendLabel: "Send music request", count: "Tracks for this session", unavailableTitle: "The curation service is not connected yet.", installTitle: "Pedelec lets me properly research and curate music for you.", unavailableText: "Make sure Pedelec is running, then reconnect here.", installText: "Install and start the Pedelec desktop app and Chrome Extension, then check again; anything you have written will stay here.", desktop: "Get desktop app", recheck: "Check again" },
  player: { eyebrow: "Now playing", empty: "The player will be waiting here once we have music.", noTrack: "No track selected", defaultTitle: "Leave room for music", defaultArtist: "When the playlist is ready, begin with the first track.", previous: "Previous", next: "Next", pause: "Pause", loading: "Loading…", play: "Play", gesture: "Your first playback needs a press on “Play.”", youtube: "{title} YouTube player", position: "{current} / {total}" },
  playlist: { eyebrow: "The order for this stretch", empty: "Still waiting for your first words", demo: "View demo playlist", invalidSource: "Source needs replacing", moveUp: "Move {title} up", moveDown: "Move {title} down", remove: "Remove {title}" },
  installModal: { eyebrow: "Pedelec needs to be installed to connect", title: "Pedelec was not detected", text: "This room needs both the Pedelec desktop app and Chrome Extension installed and running before the Agent can search and arrange a playlist.", close: "Close installation prompt", download: "Download desktop app", extension: "Install Chrome Extension", done: "Installed — check again" },
  settingsModal: { aria: "Pedelec settings", eyebrow: "Pedelec settings", title: "Use your default, or override it here", text: "The Provider determines which configured service receives your music request.", useDefault: "Use Pedelec default ({provider})", choose: "Choose a Provider", unavailable: "Your previously selected Provider is unavailable. Please choose another.", none: "No available Provider was detected. Complete Pedelec setup first.", modelDefault: "Leave blank to use default ({model})", modelBlank: "Leave blank to use default", save: "Save and check again", close: "Close settings" },
  errors: { notReady: "Pedelec is not ready yet. Check the connection and try again.", sendFailed: "That request did not send. Check the Pedelec connection and try again; it was not resent automatically to avoid creating a duplicate playlist.", invalidPlaylist: "The playlist data is incomplete, so no change was applied.", confirmNew: "Start a new playlist? The current chat and playlist will be cleared.", loading: "Preparing your playlist room…" },
};

export const translations = { "zh-TW": zh, en } as const;
export type Translation = typeof zh;
export const t = (locale: AppLocale) => translations[locale];
export function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}
