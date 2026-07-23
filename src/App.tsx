/* eslint-disable react-hooks/exhaustive-deps, react-hooks/immutability */

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { YouTubePlayer } from "./components/YouTubePlayer";
import { fixturePlaylist } from "./lib/fixture";
import { connectPedelec, type PedelecConnection } from "./lib/pedelec";
import {
  classifyAgentDraft,
  sanitizeAgentConversation,
} from "./lib/agent-message";
import {
  addMessage,
  clearLegacySession,
  getActiveTrack,
  loadPlaylist,
  moveTrack,
  newSession,
  persistPrefs,
  removeTrack,
} from "./lib/session";
import type {
  DesktopProviderSettings,
  PedelecState,
  PlaylistSession,
  PreferredTrackCount,
  ProviderOption,
} from "./lib/types";
import { documentLanguage, interpolate, t } from "./lib/i18n";

const PEDELEC_DOWNLOAD_URL = "https://pedelec.cc/download";
const PEDELEC_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/pedelec/ogccgaminlphbkeghldidiiimajfdpag";
const providerNames: Record<string, string> = {
  codex: "Codex",
  gemini: "Gemini",
  claude: "Claude",
  "claude-code": "Claude",
  opencode: "OpenCode",
  cursor: "Cursor",
};

export function formatProviderName(provider: string) {
  const normalized = provider.trim().toLowerCase();
  return (
    providerNames[normalized] ??
    normalized
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
      .join(" ")
  );
}

function pedelecStateFromSessionStatus(status: string): PedelecState {
  if (status === "idle") return "connected";
  if (status === "running" || status === "waiting_tool_result") return status;
  return status === "error" ? "error" : "disconnected";
}

export default function App() {
  const [session, setSession] = useState<PlaylistSession | null>(null);
  const [state, setState] = useState<PedelecState>("checking");
  const [provider, setProvider] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [providerDraft, setProviderDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [desktopSettings, setDesktopSettings] =
    useState<DesktopProviderSettings>({
      defaultProvider: null,
      defaultModels: {},
    });
  const [providerWarning, setProviderWarning] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showPedelecInstallModal, setShowPedelecInstallModal] = useState(false);
  const [tab, setTab] = useState<"chat" | "music">("chat");
  const [unread, setUnread] = useState(false);
  const [agentText, setAgentText] = useState("");
  const [, setConnectionVersion] = useState(0);
  const installPromptShown = useRef(false);
  const installHeading = useRef<HTMLHeadingElement>(null);
  const pedelecConnectionRef = useRef<PedelecConnection | null>(null);
  const latestSessionRef = useRef<PlaylistSession | null>(null);
  const attemptRef = useRef(0);
  const activeConnectionIdRef = useRef<string | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const agentDraftRef = useRef("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const agentBusy = state === "running" || state === "waiting_tool_result";
  const locale = session?.agentSettings.locale ?? "zh-TW";
  const copy = t(locale);
  const showTypingIndicator = agentBusy && !agentText;
  const active = session ? getActiveTrack(session) : undefined;
  const preferences = session?.agentSettings;
  const activeHasUsableSource =
    active?.playbackSources.some(
      (source) => source.validationStatus !== "invalid",
    ) ?? false;
  const availableProviders = providerOptions.filter((item) => item.available);
  const desktopDefault =
    desktopSettings.defaultProvider &&
    availableProviders.find(
      (item) => item.code === desktopSettings.defaultProvider,
    );
  const update = (fn: (current: PlaylistSession) => PlaylistSession) =>
    setSession((current) => {
      if (!current) return current;
      const next = fn(current);
      latestSessionRef.current = next;
      return next;
    });
  const replaceSession = (next: PlaylistSession) => {
    latestSessionRef.current = next;
    setSession(next);
  };
  function clearAgentDraft() {
    agentDraftRef.current = "";
    activeTurnIdRef.current = null;
    setAgentText("");
  }
  function flushAgentDraft() {
    const content = sanitizeAgentConversation(agentDraftRef.current);
    if (content)
      update((current) =>
        addMessage(current, { role: "agent", kind: "conversation", content }),
      );
    clearAgentDraft();
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      clearLegacySession();
      const fresh = newSession();
      replaceSession(fresh);
      void recheck(fresh);
    });
    return () => {
      attemptRef.current += 1;
      clearAgentDraft();
      const connection = pedelecConnectionRef.current;
      pedelecConnectionRef.current = null;
      if (connection) void connection.dispose();
    };
  }, []);
  useEffect(() => {
    if (preferences) persistPrefs(preferences);
  }, [preferences]);
  useEffect(() => {
    document.documentElement.lang = documentLanguage(locale);
    document.title = copy.metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", copy.metadata.description);
  }, [copy.metadata.description, copy.metadata.title, locale]);
  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [session?.messages, agentText, showTypingIndicator, tab]);
  useEffect(() => {
    if (state === "not-installed" && !installPromptShown.current) {
      installPromptShown.current = true;
      setShowPedelecInstallModal(true);
    }
  }, [state]);
  useEffect(() => {
    if (!showPedelecInstallModal) return;
    installHeading.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPedelecInstallModal(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showPedelecInstallModal]);

  async function recheck(current = latestSessionRef.current) {
    if (!current) return;
    const attempt = ++attemptRef.current;
    setState("checking");
    setProvider(null);
    const previous = pedelecConnectionRef.current;
    pedelecConnectionRef.current = null;
    activeConnectionIdRef.current = null;
    if (previous) await previous.dispose();
    try {
      const connection = await connectPedelec(
        current.agentSettings,
        update,
        () => latestSessionRef.current,
        {
          onState: (next) => {
            if (attempt === attemptRef.current) setState(next);
          },
          onProviderSettings: (data) => {
            if (attempt !== attemptRef.current) return;
            setProviderOptions(
              data.providers.map((item) => ({
                code: item.code,
                name: item.name,
                available: item.available,
              })),
            );
            setDesktopSettings({
              defaultProvider: data.defaultProvider,
              defaultModels: data.defaultModels,
            });
            const saved = current.agentSettings.provider;
            const savedIsAvailable =
              !saved ||
              data.providers.some(
                (item) => item.code === saved && item.available,
              );
            setProviderWarning(
              saved && !savedIsAvailable
                ? "原本選擇的 Provider 目前不可用，請重新選擇。"
                : "",
            );
          },
          onChatDelta: (delta, context) => {
            if (
              attempt !== attemptRef.current ||
              context.sessionId !== activeConnectionIdRef.current
            )
              return;
            if (!activeTurnIdRef.current)
              activeTurnIdRef.current = context.turnId;
            if (activeTurnIdRef.current !== context.turnId) {
              clearAgentDraft();
              activeTurnIdRef.current = context.turnId;
            }
            agentDraftRef.current += delta;
            setAgentText(classifyAgentDraft(agentDraftRef.current).visibleText);
          },
          onBeforeTool: (context) => {
            if (
              attempt === attemptRef.current &&
              context.sessionId === activeConnectionIdRef.current &&
              activeTurnIdRef.current === context.turnId
            )
              flushAgentDraft();
          },
        },
      );
      if (attempt !== attemptRef.current) {
        if (connection) await connection.dispose();
        return;
      }
      if (!connection) {
        pedelecConnectionRef.current = null;
        return;
      }
      pedelecConnectionRef.current = connection;
      activeConnectionIdRef.current = connection.session.sessionId;
      setProvider(connection.provider ?? null);
      setConnectionVersion((version) => version + 1);
      setState(pedelecStateFromSessionStatus(connection.session.getStatus()));
    } catch (errors) {
      console.log(errors);
      if (attempt === attemptRef.current) {
        pedelecConnectionRef.current = null;
        setProvider(null);
        setState("error");
      }
    }
  }

  const hasAgent = state === "connected";
  const playlist = session?.playlist;
  const currentIndex =
    playlist?.tracks.findIndex((track) => track.id === active?.id) ?? -1;
  function introduce(trackId: string) {
    if (!session || session.introducedTrackIds.includes(trackId)) return;
    const track = session.playlist?.tracks.find((item) => item.id === trackId);
    if (!track) return;
    update((current) => ({
      ...addMessage(current, {
        role: "agent",
        kind: "track-introduction",
        content: `*${track.title}*\n${track.introduction}`,
        trackId,
      }),
      introducedTrackIds: [...current.introducedTrackIds, trackId],
    }));
    if (tab !== "chat") setUnread(true);
  }
  function select(trackId: string, play = false) {
    update((current) => ({
      ...current,
      playback: {
        ...current.playback,
        activeTrackId: trackId,
        activeSourceId: current.playlist?.tracks
          .find((track) => track.id === trackId)
          ?.playbackSources.find(
            (source) => source.validationStatus !== "invalid",
          )?.id,
        status: play ? "loading" : "ready",
        hasPlaybackGesture: play || current.playback.hasPlaybackGesture,
        currentTimeSeconds: 0,
      },
    }));
    if (play) introduce(trackId);
  }
  function next() {
    if (!playlist) return;
    const track = playlist.tracks[currentIndex + 1];
    if (track) select(track.id, true);
    else
      update((current) => ({
        ...current,
        playback: { ...current.playback, status: "ended" },
      }));
  }
  function previous() {
    if (!playlist) return;
    const track =
      playlist.tracks[
        session?.playback.currentTimeSeconds &&
        session.playback.currentTimeSeconds > 5
          ? currentIndex
          : currentIndex - 1
      ];
    if (track) select(track.id, true);
  }
  function togglePlayback() {
    if (!active || !session) return;
    if (session.playback.status === "playing") {
      update((current) => ({
        ...current,
        playback: { ...current.playback, status: "paused" },
      }));
      return;
    }
    update((current) => ({
      ...current,
      playback: {
        ...current.playback,
        hasPlaybackGesture: true,
        status: "loading",
      },
    }));
    introduce(active.id);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !session) return;
    const connection = pedelecConnectionRef.current;
    if (
      state !== "connected" ||
      !connection ||
      connection.session.getStatus() !== "idle"
    ) {
      if (!connection) {
        update((current) =>
          addMessage(current, {
            role: "agent",
            kind: "error",
            content: copy.errors.notReady,
          }),
        );
        setState("error");
      }
      return;
    }
    update((current) =>
      addMessage(current, {
        role: "user",
        kind: "conversation",
        content: text,
      }),
    );
    setInput("");
    clearAgentDraft();
    const connectionId = connection.session.sessionId;
    try {
      await connection.session.sendText(text);
      if (
        pedelecConnectionRef.current === connection &&
        activeConnectionIdRef.current === connectionId
      )
        flushAgentDraft();
    } catch {
      if (
        pedelecConnectionRef.current === connection &&
        activeConnectionIdRef.current === connectionId
      ) {
        clearAgentDraft();
        update((current) =>
          addMessage(current, {
            role: "agent",
            kind: "error",
            content: copy.errors.sendFailed,
          }),
        );
        setState("error");
      }
    }
  }
  function openSettings() {
    if (!session) return;
    const savedProvider = session.agentSettings.provider;
    setProviderDraft(
      savedProvider && availableProviders.some((item) => item.code === savedProvider)
        ? savedProvider
        : "",
    );
    setModelDraft(session.agentSettings.model ?? "");
    setShowSettings(true);
  }
  function saveSettings() {
    if (!session) return;
    const providerIsValid = providerDraft
      ? availableProviders.some((item) => item.code === providerDraft)
      : !!desktopDefault;
    if (!providerIsValid) return;
    const next: PlaylistSession = {
      ...session,
      agentSettings: {
        ...session.agentSettings,
        provider: providerDraft || undefined,
        model: modelDraft.trim() || undefined,
      },
    };
    replaceSession(next);
    setShowSettings(false);
    void recheck(next);
  }
  function createNewPlaylist() {
    if (!confirm(copy.errors.confirmNew)) return;
    const next = newSession();
    replaceSession(next);
    clearAgentDraft();
    void recheck(next);
  }
  function changeLocale(nextLocale: "zh-TW" | "en") {
    if (!session || agentBusy || nextLocale === locale) return;
    const next = { ...session, agentSettings: { ...session.agentSettings, locale: nextLocale } };
    replaceSession(next);
    void recheck(next);
  }

  if (!session) return <main className="loading">{t("zh-TW").errors.loading}</main>;
  return (
    <main className="app">
      <header>
        <a className="brand" href="#top">
          {copy.header.brand} <small>{copy.header.tagline}</small>
        </a>
        {provider && (
          <span className="provider-label" title={formatProviderName(provider)}>
            {formatProviderName(provider)}
          </span>
        )}
        <div className={`status ${state}`}>
          <i /> {copy.status[state]}
        </div>
        <div className="locale-switch" aria-label={copy.header.localeLabel}>
          <button className={locale === "zh-TW" ? "selected" : ""} disabled={agentBusy} onClick={() => changeLocale("zh-TW")}>{copy.header.chinese}</button>
          <button className={locale === "en" ? "selected" : ""} disabled={agentBusy} onClick={() => changeLocale("en")}>{copy.header.english}</button>
        </div>
        <button className="quiet" onClick={openSettings}>
          {copy.header.settings}
        </button>
      </header>
      <section className="mobile-tabs">
        <button
          className={tab === "chat" ? "selected" : ""}
          onClick={() => {
            setTab("chat");
            setUnread(false);
          }}
        >
          {copy.tabs.chat} {unread && <b />}
        </button>
        <button
          className={tab === "music" ? "selected" : ""}
          onClick={() => setTab("music")}
        >
          {copy.tabs.playlist}
        </button>
      </section>
      <div className={`layout ${tab}`}>
        <section className="chat-panel">
          <div className="chat-head">
            <div>
              <p>{copy.chat.heading}</p>
              <span>{copy.chat.subheading}</span>
            </div>
            <button className="quiet new-playlist" onClick={createNewPlaylist}>
              {copy.chat.newPlaylist}
            </button>
          </div>
          <div className="messages" ref={messagesRef} aria-live="polite">
            {session.messages.length === 0 && (
              <div className="empty-chat">
                {copy.chat.empty}
              </div>
            )}
            {session.messages.map((message) => (
              <article
                key={message.id}
                className={`message ${message.role} ${message.kind}`}
              >
                <p>{message.content}</p>
              </article>
            ))}
            {agentText && (
              <article className="message agent">
                <p>{agentText}</p>
              </article>
            )}
            {showTypingIndicator && (
              <article
                className="message agent typing-indicator"
                aria-label={copy.chat.typing}
              >
                <span className="typing-dot" aria-hidden="true" />
                <span className="typing-dot" aria-hidden="true" />
                <span className="typing-dot" aria-hidden="true" />
              </article>
            )}
          </div>
          {state !== "connected" && !agentBusy && (
            <div className="connection-card">
              <strong>
                {state === "not-installed"
                  ? copy.chat.installTitle : copy.chat.unavailableTitle}
              </strong>
              <span>
                {state === "not-installed"
                  ? copy.chat.installText : copy.chat.unavailableText}
              </span>
              <div>
                <a
                  className="button light"
                  href={PEDELEC_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.chat.desktop}
                </a>
                <button className="button" onClick={() => void recheck()}>
                  {copy.chat.recheck}
                </button>
              </div>
            </div>
          )}
          <form onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={copy.chat.placeholder}
              disabled={!hasAgent}
            />
            <button
              className="send"
              disabled={!hasAgent || !input.trim()}
              aria-label={copy.chat.sendLabel}
            >
              {copy.chat.send}
            </button>
          </form>
          <fieldset className="track-count" disabled={agentBusy}>
            <legend>{copy.chat.count}</legend>
            <div>
              {([5, 10, 20] as PreferredTrackCount[]).map((count) => (
                <label
                  key={count}
                  className={
                    session.agentSettings.preferredTrackCount === count
                      ? "selected"
                      : ""
                  }
                >
                  <input
                    type="radio"
                    name="preferred-track-count"
                    value={count}
                    checked={
                      session.agentSettings.preferredTrackCount === count
                    }
                    onChange={() =>
                      update((current) => ({
                        ...current,
                        agentSettings: {
                          ...current.agentSettings,
                          preferredTrackCount: count,
                        },
                      }))
                    }
                  />
                  {count}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <section className="music-panel">
          <div className="player-card">
            <div className="eyebrow">{copy.player.eyebrow}</div>
            <div className="player-main">
              {activeHasUsableSource ? (
                <YouTubePlayer
                  track={active}
                  ariaLabel={interpolate(copy.player.youtube, { title: active?.title ?? "YouTube" })}
                  activeSourceId={session.playback.activeSourceId}
                  playing={
                    session.playback.status === "playing" ||
                    session.playback.status === "loading"
                  }
                  onPlay={() => {
                    const trackId =
                      latestSessionRef.current?.playback.activeTrackId;
                    update((current) => ({
                      ...current,
                      playback: {
                        ...current.playback,
                        status: "playing",
                        hasPlaybackGesture: true,
                      },
                    }));
                    if (trackId) introduce(trackId);
                  }}
                  onPause={() =>
                    update((current) => ({
                      ...current,
                      playback: { ...current.playback, status: "paused" },
                    }))
                  }
                  onEnded={next}
                  onError={() => {
                    if (active)
                      update((current) => ({
                        ...current,
                        playback: { ...current.playback, status: "error" },
                      }));
                  }}
                  onAutoplayBlocked={() =>
                    update((current) => ({
                      ...current,
                      playback: {
                        ...current.playback,
                        status: "waiting-for-user-gesture",
                      },
                    }))
                  }
                  onTime={(seconds) =>
                    update((current) => ({
                      ...current,
                      playback: {
                        ...current.playback,
                        currentTimeSeconds: seconds,
                      },
                    }))
                  }
                />
              ) : (
                <div className="video-shell" data-video-visible="false">
                  <p>{copy.player.empty}</p>
                </div>
              )}
              <div className="track-info">
                <span>
                  {active
                    ? interpolate(copy.player.position, { current: currentIndex + 1, total: playlist?.tracks.length ?? 0 })
                    : copy.player.noTrack}
                </span>
                <h1>{active?.title ?? copy.player.defaultTitle}</h1>
                <p>{active?.artist ?? copy.player.defaultArtist}</p>
              </div>
            </div>
            <div className="controls">
              <button onClick={previous} disabled={!active}>
                {copy.player.previous}
              </button>
              <button
                className="play"
                onClick={togglePlayback}
                disabled={!active}
              >
                {session.playback.status === "playing"
                  ? copy.player.pause
                  : session.playback.status === "loading"
                    ? copy.player.loading : copy.player.play}
              </button>
              <button onClick={next} disabled={!active}>
                {copy.player.next}
              </button>
            </div>
            {session.playback.status === "waiting-for-user-gesture" && (
              <p className="gesture">{copy.player.gesture}</p>
            )}
          </div>
          <div className="playlist-head">
            <div>
              <div className="eyebrow">{copy.playlist.eyebrow}</div>
              <h2>{playlist?.title ?? copy.playlist.empty}</h2>
            </div>
            {!playlist && (
              <button
                className="button demo"
                onClick={() =>
                  update((current) => loadPlaylist(current, fixturePlaylist(locale)))
                }
              >
                {copy.playlist.demo}
              </button>
            )}
          </div>
          <ol className="playlist">
            {playlist?.tracks.map((track, index) => (
              <li
                key={track.id}
                className={track.id === active?.id ? "active" : ""}
              >
                <button
                  className="song"
                  onClick={() => select(track.id, true)}
                  aria-current={track.id === active?.id ? "true" : undefined}
                >
                  <em>{String(index + 1).padStart(2, "0")}</em>
                  <span>
                    <strong>{track.title}</strong>
                    <small>
                      {track.artist} · {track.playlistRole}
                    </small>
                  </span>
                  {track.playbackSources.every(
                    (source) => source.validationStatus === "invalid",
                  ) && <b>{copy.playlist.invalidSource}</b>}
                </button>
                <div className="row-actions">
                  <button
                    onClick={() =>
                      update((current) => moveTrack(current, track.id, -1))
                    }
                    aria-label={interpolate(copy.playlist.moveUp, { title: track.title })}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() =>
                      update((current) => moveTrack(current, track.id, 1))
                    }
                    aria-label={interpolate(copy.playlist.moveDown, { title: track.title })}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() =>
                      update((current) => removeTrack(current, track.id))
                    }
                    aria-label={interpolate(copy.playlist.remove, { title: track.title })}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {showPedelecInstallModal && (
        <div
          className="modal install-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pedelec-install-title"
        >
          <div>
            <button
              className="close"
              onClick={() => setShowPedelecInstallModal(false)}
              aria-label={copy.installModal.close}
            >
              ×
            </button>
            <div className="eyebrow">{copy.installModal.eyebrow}</div>
            <h2 id="pedelec-install-title" ref={installHeading} tabIndex={-1}>
              {copy.installModal.title}
            </h2>
            <p>
              {copy.installModal.text}
            </p>
            <div className="modal-actions">
              <a
                className="button light"
                href={PEDELEC_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                {copy.installModal.download}
              </a>
              <a
                className="button light"
                href={PEDELEC_EXTENSION_URL}
                target="_blank"
                rel="noreferrer"
              >
                {copy.installModal.extension}
              </a>
              <button
                className="button"
                onClick={() => {
                  setShowPedelecInstallModal(false);
                  void recheck();
                }}
              >
                {copy.installModal.done}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label={copy.settingsModal.aria}
        >
          <div>
            <button className="close" aria-label={copy.settingsModal.close} onClick={() => setShowSettings(false)}>
              ×
            </button>
            <div className="eyebrow">{copy.settingsModal.eyebrow}</div>
            <h2>{copy.settingsModal.title}</h2>
            <p>{copy.settingsModal.text}</p>
            <label>
              Provider
              <select
                value={providerDraft}
                onChange={(event) => {
                  setProviderDraft(event.target.value);
                  setModelDraft("");
                }}
              >
                {desktopDefault ? <option value="">{interpolate(copy.settingsModal.useDefault, { provider: desktopDefault.name })}</option> : <option value="" disabled>{copy.settingsModal.choose}</option>}
                {availableProviders.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </label>
            {providerWarning && <p className="settings-warning">{providerWarning}</p>}
            {availableProviders.length === 0 && <p className="settings-warning">{copy.settingsModal.none}</p>}
            <label>
              Model
              <input
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                placeholder={desktopSettings.defaultModels[providerDraft || desktopSettings.defaultProvider || ""] ? interpolate(copy.settingsModal.modelDefault, { model: desktopSettings.defaultModels[providerDraft || desktopSettings.defaultProvider || ""] ?? "" }) : copy.settingsModal.modelBlank}
              />
            </label>
            <button
              className="button"
              disabled={providerDraft ? !availableProviders.some((item) => item.code === providerDraft) : !desktopDefault}
              onClick={saveSettings}
            >
              {copy.settingsModal.save}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
