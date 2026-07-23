import { useEffect, useRef, useState } from "react";
import type { PlaybackSource, Track } from "../lib/types";

type YtPlayer = {
  cueVideoById: (id: string) => void;
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getCurrentTime: () => number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (target: HTMLElement, options: object) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let scriptPromise: Promise<void> | undefined;

function loadApi() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    if (window.YT) return resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    window.onYouTubeIframeAPIReady = () => resolve();
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function YouTubePlayer({
  track,
  playing,
  onPlay,
  onPause,
  onEnded,
  onError,
  onAutoplayBlocked = () => {},
  onTime,
  ariaLabel,
}: {
  track?: Track;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onError: () => void;
  onAutoplayBlocked?: () => void;
  onTime: (seconds: number) => void;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YtPlayer | null>(null);
  const ready = useRef(false);
  const source = track?.playbackSource;
  const hasSource = Boolean(source);
  const sourceRef = useRef<PlaybackSource | undefined>(source);
  const loadedVideoIdRef = useRef<string | undefined>(undefined);
  const playingRef = useRef(playing);
  const callbacks = useRef({ onPlay, onPause, onEnded, onError, onAutoplayBlocked, onTime });
  const [visibleVideoId, setVisibleVideoId] = useState<string | undefined>();

  useEffect(() => { sourceRef.current = source; }, [source]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    callbacks.current = { onPlay, onPause, onEnded, onError, onAutoplayBlocked, onTime };
  }, [onAutoplayBlocked, onEnded, onError, onPause, onPlay, onTime]);

  useEffect(() => {
    if (!hasSource) return;
    let live = true;
    void loadApi().then(() => {
      if (!host.current || !live || !window.YT) return;
      player.current = new window.YT.Player(host.current, {
        // Do not pass a videoId while mounting. The component may mount before
        // a playlist exists, and YouTube treats an undefined ID as an invalid
        // video instead of a blank player. The onReady handler cues the latest
        // valid source after the iframe itself is healthy.
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: (event: { target?: YtPlayer }) => {
            ready.current = true;
            const readySource = sourceRef.current;
            const readyPlayer = event.target ?? player.current;
            if (readySource) {
              if (playingRef.current) readyPlayer?.loadVideoById(readySource.videoId);
              else readyPlayer?.cueVideoById(readySource.videoId);
              loadedVideoIdRef.current = readySource.videoId;
            }
          },
          onStateChange: (event: { data: number }) => {
            if (!window.YT) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              setVisibleVideoId(loadedVideoIdRef.current);
              callbacks.current.onPlay();
            }
            if (event.data === window.YT.PlayerState.PAUSED) callbacks.current.onPause();
            if (event.data === window.YT.PlayerState.ENDED) callbacks.current.onEnded();
          },
          onError: () => {
            if (loadedVideoIdRef.current === sourceRef.current?.videoId) setVisibleVideoId(undefined);
            callbacks.current.onError();
          },
          onAutoplayBlocked: () => {
            if (loadedVideoIdRef.current === sourceRef.current?.videoId) setVisibleVideoId(undefined);
            callbacks.current.onAutoplayBlocked();
          },
        },
      });
    });
    return () => {
      live = false;
      ready.current = false;
      loadedVideoIdRef.current = undefined;
      player.current?.destroy();
      player.current = null;
    };
  }, [hasSource]);

  useEffect(() => {
    if (!source || !ready.current || !player.current) return;
    const isLoaded = loadedVideoIdRef.current === source.videoId;
    if (isLoaded) return;
    setVisibleVideoId(undefined);
    if (playingRef.current) player.current.loadVideoById(source.videoId);
    else player.current.cueVideoById(source.videoId);
    loadedVideoIdRef.current = source.videoId;
  }, [source]);

  useEffect(() => {
    if (!ready.current || !player.current) return;
    if (playing) player.current.playVideo();
    else player.current.pauseVideo();
  }, [playing]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const seconds = player.current?.getCurrentTime();
      if (seconds) callbacks.current.onTime(seconds);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="video-shell" data-video-visible={Boolean(visibleVideoId && visibleVideoId === source?.videoId)}>
      <div ref={host} aria-label={ariaLabel ?? (track ? `${track.title} YouTube player` : "YouTube player")} />
    </div>
  );
}
