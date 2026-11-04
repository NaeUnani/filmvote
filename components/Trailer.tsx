"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  ExternalLink,
} from "lucide-react";
let apiPromise: Promise<void> | null = null;
function loadAPI() {
  if (!apiPromise)
    apiPromise = new Promise((resolve, reject) => {
      const w = window as any;
      if (w.YT?.Player) {
        resolve();
        return;
      }
      w.onYouTubeIframeAPIReady = () => resolve();
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("YouTube tidak dapat dimuat."));
      };
      document.head.appendChild(script);
    });
  return apiPromise;
}
const time = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export default function Trailer({
  videoId,
  title,
  active,
}: {
  videoId: string;
  title: string;
  active: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null),
    player = useRef<any>(null),
    [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(true),
    [current, setCurrent] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    setReady(false);
    setError("");
    setBlocked(false);
    setCurrent(0);
    setDuration(0);
    loadAPI()
      .then(() => {
        if (disposed || !mount.current) return;
        const node = document.createElement("div");
        mount.current.replaceChildren(node);
        const w = window as any;
        player.current = new w.YT.Player(node, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            controls: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: any) => {
              if (disposed) return;
              setReady(true);
              e.target.mute();
              setMuted(true);
              const iframe = e.target.getIframe();
              iframe.title = `Trailer ${title}`;
              iframe.setAttribute(
                "allow",
                "autoplay; encrypted-media; picture-in-picture; fullscreen",
              );
              if (
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches
              )
                e.target.playVideo();
            },
            onStateChange: (e: any) => {
              if (!disposed) setPlaying(e.data === 1);
            },
            onAutoplayBlocked: () => {
              if (!disposed) setBlocked(true);
            },
            onError: () => {
              if (!disposed)
                setError("Preview tidak tersedia. Tonton langsung di YouTube.");
            },
          },
        });
      })
      .catch(() => {
        if (!disposed)
          setError(
            "YouTube tidak dapat dimuat. Periksa koneksi atau buka di YouTube.",
          );
      });
    const tick = setInterval(() => {
      const p = player.current;
      if (p?.getCurrentTime) {
        setCurrent(p.getCurrentTime() || 0);
        setDuration(p.getDuration() || 0);
      }
    }, 500);
    const timeout = setTimeout(() => {
      if (!disposed && !player.current?.getPlayerState)
        setError("Preview belum dapat dimuat. Coba buka di YouTube.");
    }, 15000);
    const visibility = () => {
      if (document.hidden) player.current?.pauseVideo?.();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      clearInterval(tick);
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", visibility);
      player.current?.destroy?.();
      player.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [active, videoId, title]);
  function toggle() {
    const p = player.current;
    if (!p || !ready) return;
    if (playing) p.pauseVideo();
    else {
      p.playVideo();
      setBlocked(false);
    }
  }
  function seek(n: number) {
    if (ready) player.current?.seekTo(Math.max(0, Math.min(duration, n)), true);
  }
  return (
    <div className="trailer-block">
      <div className="video-frame">
        <img
          src={`/thumbnails/${videoId}`}
          alt={`Thumbnail trailer ${title}`}
          className="video-thumb"
        />
        <div
          ref={mount}
          className={`youtube-mount ${ready && !error ? "loaded" : ""}`}
        />
        {(!active || !ready || error) && (
          <div className="video-cover">
            <span className="trailer-tag">OFFICIAL TRAILER</span>
            {error ? (
              <a
                className="video-error"
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                {error}
                <ExternalLink size={18} />
              </a>
            ) : (
              <div className="cover-play">
                <Play fill="currentColor" size={25} />
              </div>
            )}
            <span className="frame-label">{title}</span>
          </div>
        )}
        {active && ready && blocked && !error && (
          <button className="autoplay-fallback" onClick={toggle}>
            <Play size={17} /> Ketuk untuk preview
          </button>
        )}
      </div>
      <div className="transport">
        <button
          aria-label="Mundur 10 detik"
          disabled={!ready || !!error}
          onClick={() => seek(current - 10)}
        >
          <RotateCcw size={18} />
          <small>10</small>
        </button>
        <button
          className="play-button"
          aria-label={playing ? "Jeda trailer" : "Putar trailer"}
          disabled={!ready || !!error}
          onClick={toggle}
        >
          {playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
        <button
          aria-label="Maju 10 detik"
          disabled={!ready || !!error}
          onClick={() => seek(current + 10)}
        >
          <RotateCw size={18} />
          <small>10</small>
        </button>
        <span className="playback-time">{time(current)}</span>
        <input
          aria-label="Posisi playback trailer"
          type="range"
          min="0"
          max={duration || 1}
          value={Math.min(current, duration || 1)}
          step="0.1"
          disabled={!ready || !!error}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="playback-time">{time(duration)}</span>
        <button
          aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
          disabled={!ready || !!error}
          onClick={() => {
            if (muted) player.current.unMute();
            else player.current.mute();
            setMuted(!muted);
          }}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
  );
}
