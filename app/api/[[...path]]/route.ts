import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  snapshot,
  vote,
  saveMovie,
  deleteMovie,
  deletePlaylist,
  updateConfig,
  rateLimit,
  setSchedule,
} from "@/lib/store";
import { voterId, isAdmin, passwordMatches, createSession } from "@/lib/auth";
import { initialMovies } from "@/lib/seed";
import { translateSynopsis } from "@/lib/translate";
import { youtubeId, movieTitle } from "@/lib/youtube";
import type { Movie } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const text = (v: unknown, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
async function handle(req: NextRequest, ctx: Context) {
  try {
    const path = (await ctx.params).path?.join("/") || "";
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      let validOrigin = false;
      try {
        const u = new URL(origin || "");
        validOrigin =
          u.host === req.headers.get("host") &&
          ["http:", "https:"].includes(u.protocol);
      } catch {}
      if (!validOrigin) return json({ error: "Origin tidak diizinkan." }, 403);
      if (Number(req.headers.get("content-length") || 0) > 16000)
        return json({ error: "Permintaan terlalu besar." }, 413);
    }
    const voter = voterId(req);
    if (req.method === "GET" && path === "state")
      return json({ ...(await snapshot(voter)), library: [] });
    if (req.method === "GET" && path === "admin/session")
      return json({
        authenticated: isAdmin(req),
        metadataReady: Boolean(process.env.OMDB_API_KEY),
      });
    if (req.method === "POST" && path === "admin/login") {
      if (!(await rateLimit("login:" + voter, 8, 900)))
        return json(
          { error: "Terlalu banyak percobaan. Coba dalam 15 menit." },
          429,
        );
      const body = await req.json();
      if (!passwordMatches(text(body.password, 256), text(body.username, 80)))
        return json({ error: "Username atau password salah." }, 401);
      const res = json({ ok: true });
      res.cookies.set("fv_admin", createSession(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 43200,
      });
      return res;
    }
    if (req.method === "POST" && path === "admin/logout") {
      const res = json({ ok: true });
      res.cookies.delete("fv_admin");
      return res;
    }
    if (path === "vote" && (req.method === "POST" || req.method === "DELETE")) {
      if (!(await rateLimit("vote:" + voter, 30, 60)))
        return json(
          { error: "Terlalu banyak permintaan. Coba sebentar lagi." },
          429,
        );
      const body = await req.json();
      const result = await vote(
        voter,
        text(body.movieId, 80),
        req.method === "DELETE",
      );
      const errors: Record<string, string> = {
        closed: "Voting sedang ditutup.",
        missing: "Film tidak ditemukan.",
        duplicate: "Kamu sudah memilih film ini.",
        limit: "Kuota 3 vote untuk IP ini sudah habis.",
        scheduled: "Voting belum dimulai.",
        stale: "Periode berubah. Muat ulang halaman.",
      };
      if (result !== "ok")
        return json({ error: errors[result] || "Vote gagal." }, 409);
      return json({ ...(await snapshot(voter)), library: [] });
    }
    if (!path.startsWith("admin/"))
      return json({ error: "Tidak ditemukan." }, 404);
    if (!isAdmin(req))
      return json({ error: "Silakan masuk sebagai admin." }, 401);
    if (req.method === "GET" && path === "admin/state")
      return json(await snapshot(voter));
    if (req.method === "POST" && path === "admin/schedule") {
      const b = await req.json();
      const start = Number(b.startsAt),
        end = Number(b.endsAt);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start <= 0 ||
        end <= start
      )
        return json({ error: "Rentang waktu tidak valid." }, 400);
      await setSchedule(start, end);
      return json({ ok: true });
    }
    if (req.method === "POST" && path === "admin/restore") {
      const b = await req.json();
      const state = await snapshot(voter);
      const film = state.library.find(
        (m) => m.youtubeId === text(b.youtubeId, 11),
      );
      if (!film) return json({ error: "Film tidak ditemukan." }, 404);
      await saveMovie({
        ...film,
        id: randomUUID(),
        playlistId: text(b.playlistId, 80),
        addedAt: Date.now(),
      });
      return json({ ok: true });
    }
    if (req.method === "POST" && path === "admin/metadata") {
      if (!(await rateLimit("metadata:" + voter, 30, 3600)))
        return json(
          { error: "Batas pencarian tercapai. Coba lagi nanti." },
          429,
        );
      const b = await req.json();
      const id = youtubeId(text(b.url, 500));
      if (!id) return json({ error: "Masukkan link YouTube yang valid." }, 400);
      let title = text(b.title, 150),
        warning = "",
        sourceSynopsis = "";
      if (!title) {
        try {
          const r = await fetch(
            "https://www.youtube.com/oembed?" +
              new URLSearchParams({
                url: "https://www.youtube.com/watch?v=" + id,
                format: "json",
              }),
            { signal: AbortSignal.timeout(8000) },
          );
          if (r.ok) title = movieTitle((await r.json()).title);
        } catch {}
      }
      if (!title)
        return json(
          { error: "Judul tidak terbaca. Isi judul film lalu cari kembali." },
          422,
        );
      const movie: Movie = {
        id: randomUUID(),
        youtubeId: id,
        playlistId: text(b.playlistId, 80),
        title,
        year: "",
        runtime: "",
        genre: "",
        actors: "",
        director: "",
        synopsis: "",
        imdb: "",
        tomatoes: "",
        metacritic: "",
        imdbId: "",
        addedAt: Date.now(),
      };
      if (!process.env.OMDB_API_KEY)
        warning =
          "OMDB_API_KEY belum diisi. Lengkapi metadata secara manual atau konfigurasi API key, lalu cari lagi.";
      else {
        const query = new URLSearchParams({
          apikey: process.env.OMDB_API_KEY,
          t: title,
          plot: "short",
          type: "movie",
        });
        if (text(b.year, 4)) query.set("y", text(b.year, 4));
        const r = await fetch("https://www.omdbapi.com/?" + query, {
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        });
        if (!r.ok) throw new Error("Layanan metadata sedang tidak tersedia.");
        const m = await r.json();
        if (m.Response === "False")
          warning =
            m.Error === "Invalid API key!"
              ? "OMDb API key tidak valid. Periksa konfigurasi."
              : "Film tidak ditemukan. Koreksi judul atau tahun lalu cari lagi.";
        else {
          const clean = (x: string) => (x === "N/A" ? "" : x || "");
          sourceSynopsis = text(clean(m.Plot), 1000);
          Object.assign(movie, {
            title: m.Title,
            year: clean(m.Year),
            runtime: clean(m.Runtime),
            genre: clean(m.Genre),
            actors: clean(m.Actors),
            director: clean(m.Director),
            imdb: clean(m.imdbRating),
            imdbId: clean(m.imdbID),
            tomatoes: clean(
              m.Ratings?.find(
                (x: { Source: string }) => x.Source === "Rotten Tomatoes",
              )?.Value,
            ),
            metacritic: clean(m.Metascore),
          });
        }
      }
      if (sourceSynopsis) {
        movie.synopsis = text(await translateSynopsis(sourceSynopsis), 1000);
      }
      if (!movie.synopsis) {
        movie.synopsis =
          initialMovies.find(
            (m) => m.youtubeId === id || m.imdbId === movie.imdbId,
          )?.synopsis || "";
      }
      if (sourceSynopsis && !movie.synopsis)
        warning =
          "Terjemahan otomatis gagal. Isi sinopsis bahasa Indonesia dari referensi OMDb.";
      return json({
        movie,
        warning,
        sourceSynopsis: movie.synopsis ? "" : sourceSynopsis,
      });
    }
    if (req.method === "POST" && path === "admin/movie") {
      const b = await req.json();
      if (
        !/^[\w-]{11}$/.test(b.youtubeId || "") ||
        !text(b.title, 150) ||
        !text(b.playlistId, 80)
      )
        return json({ error: "Judul, video, dan playlist wajib diisi." }, 400);
      const state = await snapshot(voter);
      const previous = state.movies.find((m) => m.id === b.id);
      if (
        !previous &&
        state.movies.some(
          (m) => m.youtubeId === b.youtubeId && m.playlistId === b.playlistId,
        )
      )
        return json(
          { error: "Video ini sudah ada di playlist tersebut." },
          409,
        );
      const movie: Movie = {
        id: previous?.id || randomUUID(),
        addedAt: previous?.addedAt || Date.now(),
        youtubeId: b.youtubeId,
        playlistId: text(b.playlistId, 80),
        title: text(b.title, 150),
        year: text(b.year, 12),
        runtime: text(b.runtime, 30),
        genre: text(b.genre, 160),
        actors: text(b.actors, 400),
        director: text(b.director, 150),
        synopsis: text(b.synopsis, 1000),
        imdb: text(b.imdb, 10),
        tomatoes: text(b.tomatoes, 10),
        metacritic: text(b.metacritic, 10),
        imdbId: text(b.imdbId, 30),
      };
      await saveMovie(movie);
      return json({ ok: true });
    }
    if (req.method === "DELETE" && path === "admin/movie") {
      const b = await req.json();
      await deleteMovie(text(b.id, 80));
      return json({ ok: true });
    }
    if (req.method === "POST" && path === "admin/playlist") {
      const b = await req.json();
      const name = text(b.name, 60);
      if (!name) return json({ error: "Nama playlist wajib diisi." }, 400);
      await updateConfig({
        id: randomUUID(),
        name,
        description: text(b.description, 140),
      });
      return json({ ok: true });
    }
    if (req.method === "DELETE" && path === "admin/playlist") {
      const b = await req.json();
      const id = text(b.id, 80);
      if (!id) return json({ error: "Playlist wajib dipilih." }, 400);
      await deletePlaylist(id);
      return json({ ok: true });
    }
    if (req.method === "POST" && path === "admin/voting") {
      const b = await req.json();
      if (typeof b.open !== "boolean")
        return json({ error: "Status tidak valid." }, 400);
      await updateConfig({ votingOpen: b.open });
      return json({ ok: true });
    }
    return json({ error: "Tidak ditemukan." }, 404);
  } catch (e) {
    console.error(
      "FilmVote request failed:",
      e instanceof Error ? e.message : "Unknown error",
    );
    return json(
      {
        error: e instanceof Error ? e.message : "Terjadi gangguan. Coba lagi.",
      },
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
