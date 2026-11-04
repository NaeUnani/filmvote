"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Clapperboard,
  Plus,
  Search,
  LoaderCircle,
  LogOut,
  Trash2,
  Pencil,
  Check,
  ShieldCheck,
  Link as LinkIcon,
  X,
  Library,
} from "lucide-react";
import { request } from "./FilmApp";
import type { Movie, Snapshot } from "@/lib/types";
const inputDate = (n: number) =>
  new Date(n + 7 * 3600000).toISOString().slice(0, 16);
const timestamp = (s: string) => new Date(s + ":00+07:00").getTime();
export default function Admin() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [username, setUsername] = useState("naenaenae"),
    [password, setPassword] = useState(""),
    [state, setState] = useState<Snapshot | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [title, setTitle] = useState(""),
    [year, setYear] = useState(""),
    [playlist, setPlaylist] = useState(""),
    [draft, setDraft] = useState<Movie | null>(null),
    [newName, setNewName] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(""),
    [tab, setTab] = useState("voting"),
    [query, setQuery] = useState(""),
    [start, setStart] = useState(inputDate(Date.now())),
    [end, setEnd] = useState(inputDate(Date.now() + 10 * 86400000));
  async function load(syncDates = false) {
    const d: Snapshot = await request("admin/state");
    setState(d);
    setPlaylist((p) => p || d.config.playlists[0]?.id || "");
    if (syncDates) {
      const now = Date.now();
      setStart(inputDate(d.phase === "ended" ? now : d.config.startsAt || now));
      setEnd(
        inputDate(
          d.phase === "ended"
            ? now + 10 * 86400000
            : d.config.endsAt || now + 10 * 86400000,
        ),
      );
    }
  }
  useEffect(() => {
    request("admin/session")
      .then(async (d) => {
        setAuth(d.authenticated);
        if (d.authenticated) await load(true);
      })
      .catch((e) => {
        setMessage(e.message);
        setAuth(false);
      });
  }, []);
  useEffect(() => {
    if (!auth) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [auth]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(key: keyof Movie, label: string, placeholder = "") {
    return (
      <label>
        {label}
        <input
          value={String(draft?.[key] || "")}
          placeholder={placeholder}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))
          }
        />
      </label>
    );
  }
  const movies = state?.phase === "ended" ? [] : state?.movies || [];
  const library = (state?.library || []).filter((m) =>
    `${m.title} ${m.genre} ${m.year}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const picker = (
    <label>
      Playlist
      <select value={playlist} onChange={(e) => setPlaylist(e.target.value)}>
        {state?.config.playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="app-surround">
      <main className="mobile-app admin-app">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-icon">
              <Clapperboard size={20} />
            </span>
            film<span>vote</span>
            <i />
          </a>
          <span className="admin-badge">
            <ShieldCheck size={12} /> ADMIN
          </span>
        </header>
        <a className="back-link" href="/">
          <ArrowLeft size={16} />
          Voting
        </a>
        <section className="admin-intro compact-admin">
          <h1>Admin</h1>
        </section>
        {message && (
          <div className="notice" role="status">
            {message}
            <button aria-label="Tutup pesan" onClick={() => setMessage("")}>
              <X size={15} />
            </button>
          </div>
        )}
        {auth === null ? (
          <div className="loading-state">
            <LoaderCircle className="spin" />
          </div>
        ) : !auth ? (
          <form
            className="admin-panel login-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request("admin/login", { username, password });
                setPassword("");
                setAuth(true);
                await load(true);
              });
            }}
          >
            <label>
              Username
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary-button" disabled={busy || !password}>
              {busy ? <LoaderCircle className="spin" size={17} /> : null}Masuk
            </button>
          </form>
        ) : (
          <>
            <div className="admin-stats">
              <div>
                <strong>{movies.length}</strong>
                <span>Film</span>
              </div>
              <div>
                <strong>{state?.library.length || 0}</strong>
                <span>Library</span>
              </div>
              <div>
                <strong>
                  {Object.values(state?.counts || {}).reduce(
                    (s, n) => s + n,
                    0,
                  )}
                </strong>
                <span>Vote</span>
              </div>
            </div>
            <section className="admin-panel">
              <div className="panel-heading">
                <div>
                  <h2>Jadwal voting</h2>
                  <p>
                    {state?.phase === "ended"
                      ? "Periode selesai"
                      : "Waktu Jakarta (WIB)"}
                  </p>
                </div>
                <button
                  className="small-button"
                  onClick={() => {
                    const base = timestamp(start) || Date.now();
                    setEnd(inputDate(base + 10 * 86400000));
                  }}
                >
                  10 hari
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await request("admin/schedule", {
                      startsAt: timestamp(start),
                      endsAt: timestamp(end),
                    });
                    await load(true);
                    setMessage("Jadwal disimpan.");
                  });
                }}
              >
                <label>
                  Mulai
                  <input
                    type="datetime-local"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Selesai
                  <input
                    type="datetime-local"
                    required
                    min={start}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <button className="primary-button" disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={17} /> : null}
                  {state?.phase === "ended"
                    ? "Mulai periode baru"
                    : "Simpan jadwal"}
                </button>
              </form>
            </section>
            <div className="admin-tabs">
              <button
                className={tab === "voting" ? "selected" : ""}
                onClick={() => setTab("voting")}
              >
                <Clapperboard size={16} />
                Voting
              </button>
              <button
                className={tab === "library" ? "selected" : ""}
                onClick={() => setTab("library")}
              >
                <Library size={16} />
                Library
              </button>
            </div>
            {tab === "library" ? (
              <section className="admin-panel library-panel">
                {picker}
                <label>
                  Cari film
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Judul, genre, tahun"
                  />
                </label>
                {library.map((m) => {
                  const added = movies.some(
                    (x) =>
                      x.youtubeId === m.youtubeId && x.playlistId === playlist,
                  );
                  return (
                    <div className="admin-movie" key={m.youtubeId}>
                      <img src={`/thumbnails/${m.youtubeId}`} alt={m.title} />
                      <div>
                        <strong>{m.title}</strong>
                        <small>
                          {m.year} · IMDb {m.imdb || "—"}
                        </small>
                      </div>
                      <button
                        className="small-button"
                        disabled={busy || added || state?.phase === "ended"}
                        onClick={() =>
                          void run(async () => {
                            await request("admin/restore", {
                              youtubeId: m.youtubeId,
                              playlistId: playlist,
                            });
                            await load();
                            setMessage("Film ditambahkan.");
                          })
                        }
                      >
                        {added ? <Check size={16} /> : <Plus size={16} />}
                      </button>
                    </div>
                  );
                })}
                {library.length === 0 && (
                  <p className="field-hint">Library kosong.</p>
                )}
              </section>
            ) : (
              <>
                <section className="admin-panel voting-setting">
                  <h2>
                    {state?.phase === "ended"
                      ? "Voting selesai"
                      : state?.phase === "scheduled"
                        ? "Menunggu jadwal"
                        : state?.config.votingOpen
                          ? "Voting dibuka"
                          : "Voting dijeda"}
                  </h2>
                  <button
                    aria-label={
                      state?.config.votingOpen ? "Jeda voting" : "Buka voting"
                    }
                    aria-pressed={!!state?.config.votingOpen}
                    className={`toggle ${state?.config.votingOpen ? "on" : ""}`}
                    disabled={busy || state?.phase === "ended"}
                    onClick={() =>
                      void run(async () => {
                        await request("admin/voting", {
                          open: !state?.config.votingOpen,
                        });
                        await load();
                      })
                    }
                  >
                    <i />
                  </button>
                </section>
                {state?.phase !== "ended" && (
                  <section className="admin-panel">
                    <h2>Tambah film</h2>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          const d = await request("admin/metadata", {
                            url,
                            title,
                            year,
                            playlistId: playlist,
                          });
                          setDraft(d.movie);
                          setMessage(d.warning || "Detail ditemukan.");
                        });
                      }}
                    >
                      {picker}
                      <label>
                        Link YouTube
                        <div className="input-icon">
                          <LinkIcon size={16} />
                          <input
                            type="url"
                            required
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://youtube.com/watch?v=…"
                          />
                        </div>
                      </label>
                      <div className="form-row">
                        <label>
                          Judul (opsional)
                          <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Otomatis"
                          />
                        </label>
                        <label className="year-field">
                          Tahun
                          <input
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            maxLength={4}
                            inputMode="numeric"
                          />
                        </label>
                      </div>
                      <button className="primary-button" disabled={busy}>
                        {busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Search size={17} />
                        )}
                        Cari detail
                      </button>
                    </form>
                  </section>
                )}
                {draft && (
                  <section className="admin-panel draft-panel">
                    <div className="panel-heading">
                      <h2>Detail film</h2>
                      <button
                        className="icon-button"
                        aria-label="Batalkan edit"
                        onClick={() => setDraft(null)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <img
                      className="draft-thumb"
                      src={`/thumbnails/${draft.youtubeId}`}
                      alt={draft.title}
                    />
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await request("admin/movie", draft);
                          setDraft(null);
                          setUrl("");
                          setTitle("");
                          setYear("");
                          await load();
                          setMessage("Film disimpan.");
                        });
                      }}
                    >
                      <label>
                        Playlist
                        <select
                          value={draft.playlistId}
                          onChange={(e) =>
                            setDraft({ ...draft, playlistId: e.target.value })
                          }
                        >
                          {state?.config.playlists.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field("title", "Judul")}
                      <div className="form-row">
                        {field("year", "Tahun")}
                        {field("runtime", "Durasi")}
                      </div>
                      {field("genre", "Genre")}
                      {field("actors", "Pemeran")}
                      {field("director", "Sutradara")}
                      <label>
                        Sinopsis
                        <textarea
                          rows={3}
                          value={draft.synopsis}
                          onChange={(e) =>
                            setDraft({ ...draft, synopsis: e.target.value })
                          }
                        />
                      </label>
                      <div className="form-row">
                        {field("imdb", "IMDb")}
                        {field("tomatoes", "Tomatoes")}
                        {field("metacritic", "Metacritic")}
                      </div>
                      {field("imdbId", "IMDb ID")}
                      <button
                        className="primary-button"
                        disabled={busy || !draft.title}
                      >
                        <Check size={17} />
                        Simpan
                      </button>
                    </form>
                  </section>
                )}
                <section className="admin-panel">
                  <h2>Playlist baru</h2>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await request("admin/playlist", { name: newName });
                        setNewName("");
                        await load();
                      });
                    }}
                  >
                    <input
                      aria-label="Nama playlist baru"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={60}
                    />
                    <button
                      className="primary-button"
                      aria-label="Buat playlist"
                      disabled={busy || !newName.trim()}
                    >
                      <Plus size={18} />
                    </button>
                  </form>
                </section>
                <section className="admin-collection">
                  {state?.config.playlists.map((p) => (
                    <div key={p.id}>
                      <h3>
                        {p.name}
                        <span>
                          {movies.filter((m) => m.playlistId === p.id).length}{" "}
                          film
                        </span>
                      </h3>
                      {movies
                        .filter((m) => m.playlistId === p.id)
                        .map((m) => (
                          <div className="admin-movie" key={m.id}>
                            <img
                              src={`/thumbnails/${m.youtubeId}`}
                              alt={m.title}
                            />
                            <div>
                              <strong>{m.title}</strong>
                              <small>
                                {m.year} · {state.counts[m.id] || 0} vote
                              </small>
                            </div>
                            <button
                              className="icon-button"
                              aria-label={`Edit ${m.title}`}
                              onClick={() => setDraft(m)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={`Hapus ${m.title}`}
                              onClick={() => setConfirmDelete(m.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ))}
                </section>
              </>
            )}
            <button
              className="logout-button"
              onClick={() =>
                void run(async () => {
                  await request("admin/logout", {});
                  setAuth(false);
                  setState(null);
                })
              }
            >
              <LogOut size={16} />
              Keluar
            </button>
          </>
        )}
        {confirmDelete && (
          <div className="sheet-backdrop" onClick={() => setConfirmDelete("")}>
            <section
              className="playlist-sheet confirm-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Hapus film"
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Hapus dari voting?</h2>
              <p>Film tetap tersimpan di library.</p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await request(
                      "admin/movie",
                      { id: confirmDelete },
                      "DELETE",
                    );
                    setConfirmDelete("");
                    await load();
                  })
                }
              >
                Hapus
              </button>
              <button
                className="logout-button"
                onClick={() => setConfirmDelete("")}
              >
                Batal
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
