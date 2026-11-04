"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clapperboard,
  Heart,
  ListVideo,
  Plus,
  Share2,
  Sparkles,
  Trophy,
  X,
  Film,
  Wifi,
  LoaderCircle,
  Search,
} from "lucide-react";
import type { Snapshot, Movie } from "@/lib/types";
import Trailer from "./Trailer";
export async function request(path: string, body?: unknown, method = "POST") {
  const r = await fetch(
    "/api/" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Permintaan gagal.");
  return d;
}
function MovieCard({
  movie,
  index,
  active,
  count,
  voted,
  disabled,
  pending,
  onVote,
  onActive,
}: {
  movie: Movie;
  index: number;
  active: boolean;
  count: number;
  voted: boolean;
  disabled: boolean;
  pending: boolean;
  onVote: () => void;
  onActive: (visible: boolean) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const frame = ref.current?.querySelector(".video-frame");
    if (!frame) return;
    const ob = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          onActive(e.isIntersecting && e.intersectionRatio >= 0.35);
      },
      { rootMargin: "-60px 0px -90px 0px", threshold: 0.35 },
    );
    ob.observe(frame);
    return () => ob.disconnect();
  }, [onActive]);
  return (
    <article
      ref={ref}
      className={`movie-card ${active ? "active-card" : ""}`}
      data-movie={movie.id}
    >
      <div className="card-eyebrow">
        <span>
          <i className={active ? "live-dot" : ""} />
          {active ? "NOW PREVIEWING" : "IN THE PLAYLIST"}
        </span>
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <Trailer videoId={movie.youtubeId} title={movie.title} active={active} />
      <div className="movie-info">
        <div className="movie-heading">
          <div>
            <div className="film-meta">
              {movie.year || "Film"}
              <span>•</span>
              {movie.runtime || "Trailer"}
            </div>
            <h2>{movie.title}</h2>
          </div>
          <span className="vote-count">
            <Heart size={13} />
            {count}
            <small>vote</small>
          </span>
        </div>
        <div className="genre-row">
          {movie.genre
            .split(",")
            .filter(Boolean)
            .slice(0, 3)
            .map((g) => (
              <span key={g}>{g.trim()}</span>
            ))}
        </div>
        <div className="rating-row">
          <span>
            <b className="imdb-logo">IMDb</b>
            <strong>{movie.imdb || "—"}</strong>
            <small>/10</small>
          </span>
          <span>
            <b className="tomato-icon">●</b>
            <strong>{movie.tomatoes || "—"}</strong>
            <small>Tomatoes</small>
          </span>
          {movie.metacritic && (
            <span>
              <b className="meta-logo">M</b>
              <strong>{movie.metacritic}</strong>
            </span>
          )}
        </div>
        <p className="synopsis">
          {movie.synopsis || "Sinopsis belum tersedia."}
        </p>
        <details>
          <summary>
            Detail film <Plus size={13} />
          </summary>
          <p>
            <span>Pemeran</span>
            {movie.actors || "Belum tersedia"}
          </p>
          <p>
            <span>Sutradara</span>
            {movie.director || "Belum tersedia"}
          </p>
          {movie.imdbId && (
            <a
              href={`https://www.imdb.com/title/${movie.imdbId}/`}
              target="_blank"
              rel="noreferrer"
            >
              Lihat di IMDb <ArrowUpRight size={13} />
            </a>
          )}
        </details>
        <button
          className={`vote-button ${voted ? "voted" : ""}`}
          disabled={disabled || voted || pending}
          onClick={onVote}
        >
          {pending ? (
            <LoaderCircle size={18} className="spin" />
          ) : voted ? (
            <Check size={18} />
          ) : (
            <Heart size={18} />
          )}
          <span>
            {voted
              ? "Pilihanmu"
              : disabled
                ? "Voting tidak tersedia"
                : "Vote film ini"}
          </span>
          {!voted && !disabled && <Plus size={17} />}
        </button>
      </div>
    </article>
  );
}
export default function FilmApp() {
  const [state, setState] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [playlist, setPlaylist] = useState(""),
    [tab, setTab] = useState("explore"),
    [active, setActive] = useState(""),
    [sheet, setSheet] = useState(false),
    [pending, setPending] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState("");
  const seenPhase = useRef("");
  const refresh = useCallback(async () => {
    try {
      const d = await request("state");
      setState(d);
      setPlaylist((p) => p || d.config.playlists[0]?.id || "");
      setActive((id) => (d.movies.some((m: Movie) => m.id === id) ? id : ""));
      if (d.phase === "ended" && seenPhase.current !== "ended")
        setTab("results");
      seenPhase.current = d.phase;
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  async function cast(id: string) {
    setPending(id);
    try {
      setState(await request("vote", { movieId: id }));
      setToast("Vote tersimpan.");
    } catch (e) {
      setToast((e as Error).message);
      await refresh();
    } finally {
      setPending("");
    }
  }
  const selected = state?.config.playlists.find((p) => p.id === playlist);
  const movies = (state?.movies || []).filter(
    (m) =>
      m.playlistId === playlist &&
      (!query ||
        `${m.title} ${m.genre} ${m.actors}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (tab !== "votes" || state?.voted.includes(m.id)),
  );
  const ranked = [...movies].sort(
    (a, b) => (state?.counts[b.id] || 0) - (state?.counts[a.id] || 0),
  );
  const total = state
    ? state.movies.reduce((s, m) => s + (state.counts[m.id] || 0), 0)
    : 0;
  const callbacks = useRef<Record<string, (visible: boolean) => void>>({});
  const activate = (id: string) =>
    callbacks.current[id] ||
    (callbacks.current[id] = (visible) =>
      setActive((previous) =>
        visible ? id : previous === id ? "" : previous,
      ));
  const label =
    state?.phase === "open"
      ? "Dibuka"
      : state?.phase === "scheduled"
        ? "Belum mulai"
        : state?.phase === "ended"
          ? "Selesai"
          : state
            ? "Ditutup"
            : "Memuat";
  const date = (n?: number) =>
    n
      ? new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        }).format(n)
      : "";
  return (
    <div className="app-surround">
      <main className="mobile-app">
        <header className="topbar">
          <a className="brand" href="/" aria-label="FilmVote beranda">
            <span className="brand-icon">
              <Clapperboard size={20} />
            </span>
            film<span>vote</span>
            <i />
          </a>
          <button
            className="icon-button share"
            aria-label="Bagikan playlist"
            onClick={async () => {
              try {
                if (navigator.share)
                  await navigator.share({
                    title: "FilmVote",
                    url: location.href,
                  });
                else {
                  await navigator.clipboard.writeText(location.href);
                  setToast("Link disalin.");
                }
              } catch (e) {
                if ((e as Error).name !== "AbortError")
                  setToast("Salin link dari address bar.");
              }
            }}
          >
            <Share2 size={18} />
          </button>
        </header>
        <section className="intro compact-intro">
          <h1>
            Nonton <em>apa?</em>
          </h1>
          {state?.config.startsAt && (
            <p className="schedule-range">
              {date(state.config.startsAt)} — {date(state.config.endsAt)} WIB
            </p>
          )}
          <div className="ambient-orb" />
        </section>
        <div className="playlist-toolbar">
          <button className="playlist-picker" onClick={() => setSheet(true)}>
            <span className="playlist-icon">
              <ListVideo size={18} />
            </span>
            <span>
              <small>PLAYLIST</small>
              <strong>{selected?.name || "Playlist"}</strong>
            </span>
            <ChevronDown size={17} />
          </button>
          <span
            className={`status-pill ${state?.phase === "open" ? "" : "closed"}`}
          >
            <i />
            {label}
          </span>
        </div>
        <div className="quota-banner">
          <div>
            <span className="quota-icon">
              <Heart size={16} />
            </span>
            <div>
              <strong>
                {state ? `${state.remaining} vote tersisa` : "Memeriksa kuota…"}
              </strong>
              <span>Maksimal 3 film per periode</span>
            </div>
          </div>
          <div className="quota-dots">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={i < (state?.remaining ?? 0) ? "available" : ""}
              >
                <Heart size={12} fill="currentColor" />
              </span>
            ))}
          </div>
        </div>
        <div className="section-label">
          <span>
            {tab === "results"
              ? "HASIL VOTE"
              : tab === "votes"
                ? "PILIHANKU"
                : "PILIH FILM"}
          </span>
          <span>
            {tab === "results" ? `${total} vote` : `${movies.length} film`}
          </span>
        </div>
        {state && state.movies.length > 4 && (
          <label className="search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari film…"
              aria-label="Cari film"
            />
          </label>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button onClick={() => void refresh()}>Coba lagi</button>
          </div>
        )}
        {!state && !error && (
          <div className="loading-state">
            <LoaderCircle className="spin" />
          </div>
        )}
        {tab === "results" ? (
          <div className="results">
            <h2>
              {state?.phase === "ended" ? "Hasil akhir" : "Hasil sementara"}
            </h2>
            {ranked.map((m, i) => (
              <div key={m.id} className="result-row">
                <span className={`rank ${i === 0 ? "first" : ""}`}>
                  {i === 0 ? (
                    <Trophy size={19} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <img src={`/thumbnails/${m.youtubeId}`} alt={m.title} />
                <div>
                  <strong>{m.title}</strong>
                  <small>
                    {m.year} · {state?.counts[m.id] || 0} vote
                  </small>
                  <div className="result-track">
                    <i
                      style={{
                        width: `${total ? ((state?.counts[m.id] || 0) / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="movie-list">
            {movies.map((m, i) => (
              <MovieCard
                key={m.id}
                movie={m}
                index={i}
                active={active === m.id}
                count={state?.counts[m.id] || 0}
                voted={!!state?.voted.includes(m.id)}
                disabled={state?.phase !== "open" || state.remaining === 0}
                pending={pending === m.id}
                onVote={() => void cast(m.id)}
                onActive={activate(m.id)}
              />
            ))}
          </div>
        )}
        {state && movies.length === 0 && (
          <div className="empty-state">
            <Clapperboard size={28} />
            <h2>{tab === "votes" ? "Belum memilih" : "Belum ada film"}</h2>
            <button
              onClick={() => {
                setTab("explore");
                setSheet(true);
              }}
            >
              Pilih playlist <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        <nav className="bottom-nav" aria-label="Navigasi utama">
          {[
            { id: "explore", icon: Clapperboard, label: "Film" },
            { id: "votes", icon: Heart, label: "Pilihanku" },
            { id: "results", icon: Trophy, label: "Hasil" },
          ].map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "selected" : ""}
              onClick={() => {
                setTab(t.id);
                setActive("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <t.icon size={21} />
              <span>{t.label}</span>
              {tab === t.id && <i />}
            </button>
          ))}
        </nav>
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
        {sheet && (
          <div className="sheet-backdrop" onClick={() => setSheet(false)}>
            <section
              className="playlist-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Pilih playlist"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sheet-handle" />
              <div className="sheet-title">
                <h2>Playlist</h2>
                <button
                  className="icon-button"
                  aria-label="Tutup playlist"
                  onClick={() => setSheet(false)}
                >
                  <X size={21} />
                </button>
              </div>
              {state?.config.playlists.map((p) => (
                <button
                  key={p.id}
                  className={`sheet-playlist ${playlist === p.id ? "chosen" : ""}`}
                  onClick={() => {
                    setPlaylist(p.id);
                    setActive("");
                    setSheet(false);
                    setQuery("");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <ListVideo size={23} />
                  <span>
                    <strong>{p.name}</strong>
                    <em>
                      {state.movies.filter((m) => m.playlistId === p.id).length}{" "}
                      film
                    </em>
                  </span>
                  {playlist === p.id ? (
                    <Check size={19} />
                  ) : (
                    <ArrowUpRight size={19} />
                  )}
                </button>
              ))}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
