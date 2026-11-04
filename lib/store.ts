import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { initialConfig, initialMovies } from "./seed";
import type { Config, Movie, Snapshot } from "./types";
type Data = {
  config: Config;
  movies: Movie[];
  library: Record<string, Movie>;
  counts: Record<string, number>;
  voters: Record<string, string[]>;
  limits: Record<string, { count: number; until: number }>;
};
export const remote = () =>
  Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
export async function redis(command: (string | number)[]): Promise<any> {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("Database tidak tersedia.");
  const d = await r.json();
  if (d.error)
    throw new Error(
      d.error.includes("Playlist")
        ? "Playlist tidak ditemukan."
        : d.error.includes("Periode")
          ? "Buat periode baru terlebih dahulu."
          : d.error.includes("Duplikat")
            ? "Film sudah ada di playlist."
            : "Database gagal memproses permintaan.",
    );
  return d.result;
}
export function phase(config: Config, now = Date.now()): Snapshot["phase"] {
  if (config.archivedAt || (config.endsAt && now >= config.endsAt))
    return "ended";
  if (config.startsAt && now < config.startsAt) return "scheduled";
  return config.votingOpen ? "open" : "paused";
}
function normalize(d: Data) {
  const now = Date.now();
  d.config.roundId ||= "initial";
  d.config.startsAt ??= now;
  d.config.endsAt ??= now + 10 * 86400000;
  d.library ||= {};
  for (const m of d.movies) d.library[m.youtubeId] = m;
  if (phase(d.config, now) === "ended" && !d.config.archivedAt) {
    d.config.lastMovies = [...d.movies];
    d.movies = [];
    d.config.archivedAt = now;
    d.config.votingOpen = false;
  }
}
let queue: Promise<unknown> = Promise.resolve();
const file = path.join(process.cwd(), "data/store.json");
async function local<T>(fn: (d: Data) => T | Promise<T>): Promise<T> {
  if (process.env.VERCEL) throw new Error("Database belum diatur.");
  const run = queue.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    let d: Data;
    try {
      d = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      d = {
        config: structuredClone(initialConfig),
        movies: structuredClone(initialMovies),
        library: {},
        counts: {},
        voters: {},
        limits: {},
      };
    }
    normalize(d);
    const result = await fn(d);
    await fs.writeFile(file + ".tmp", JSON.stringify(d));
    await fs.rename(file + ".tmp", file);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
export const initLua = `
if redis.call('EXISTS',KEYS[1])==0 then redis.call('SET',KEYS[1],ARGV[1]); for _,m in ipairs(cjson.decode(ARGV[2])) do redis.call('HSET',KEYS[2],m.id,cjson.encode(m)) end end
local c=cjson.decode(redis.call('GET',KEYS[1])); local now=tonumber(ARGV[3]);local changed=false;
if not c.roundId then c.roundId='initial';changed=true end
if not c.startsAt then c.startsAt=now;changed=true end
if not c.endsAt then c.endsAt=now+864000000;changed=true end
local movies=redis.call('HVALS',KEYS[2]);
if redis.call('EXISTS',KEYS[3])==0 then for _,raw in ipairs(movies) do local m=cjson.decode(raw);redis.call('HSET',KEYS[3],m.youtubeId,raw) end end
if now>=c.endsAt and (not c.archivedAt or c.archivedAt==0) then local list={};for _,raw in ipairs(movies) do local m=cjson.decode(raw);table.insert(list,m);redis.call('HSET',KEYS[3],m.youtubeId,raw) end;c.lastMovies=list;c.archivedAt=now;c.votingOpen=false;redis.call('DEL',KEYS[2]);changed=true end
if changed then redis.call('SET',KEYS[1],cjson.encode(c)) end
return cjson.encode(c)`;
async function init(): Promise<Config> {
  return JSON.parse(
    await redis([
      "EVAL",
      initLua,
      3,
      "fv:config",
      "fv:movies",
      "fv:library",
      JSON.stringify(initialConfig),
      JSON.stringify(initialMovies),
      Date.now(),
    ]),
  );
}
const countKey = (round: string) =>
  round === "initial" ? "fv:counts" : "fv:counts:" + round;
const voterKey = (round: string, voter: string) =>
  round === "initial" ? "fv:voter:" + voter : "fv:voter:" + round + ":" + voter;
function displayMovies(c: Config, movies: Movie[]) {
  return (
    phase(c) === "ended" && Array.isArray(c.lastMovies) ? c.lastMovies : movies
  ).sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id));
}
export async function snapshot(voter: string): Promise<Snapshot> {
  if (!remote())
    return local((d) => ({
      config: d.config,
      movies: displayMovies(d.config, d.movies),
      library: Object.values(d.library).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
      counts: d.counts,
      voted: d.voters[voter] || [],
      remaining: Math.max(0, 3 - (d.voters[voter] || []).length),
      phase: phase(d.config),
      storage: "local",
    }));
  const config = await init();
  const round = config.roundId || "initial";
  const [movies, library, counts, voted] = await Promise.all([
    redis(["HVALS", "fv:movies"]),
    redis(["HVALS", "fv:library"]),
    redis(["HGETALL", countKey(round)]),
    redis(["SMEMBERS", voterKey(round, voter)]),
  ]);
  const values: Record<string, number> = {};
  for (let i = 0; i < counts.length; i += 2)
    values[counts[i]] = Number(counts[i + 1]);
  return {
    config,
    movies: displayMovies(
      config,
      movies.map((s: string) => JSON.parse(s)),
    ),
    library: library
      .map((s: string) => JSON.parse(s))
      .sort((a: Movie, b: Movie) => a.title.localeCompare(b.title)),
    counts: values,
    voted,
    remaining: Math.max(0, 3 - voted.length),
    phase: phase(config),
    storage: "redis",
  };
}
export const voteLua = `local config=cjson.decode(redis.call('GET',KEYS[1]));local now=tonumber(ARGV[2]) or 0;if config.roundId and config.roundId~=ARGV[3] then return 'stale' end;if config.endsAt and now>=config.endsAt then return 'closed' end;if config.startsAt and now<config.startsAt then return 'scheduled' end;if not config.votingOpen or (config.archivedAt and config.archivedAt>0) then return 'closed' end;if redis.call('HEXISTS',KEYS[2],ARGV[1])==0 then return 'missing' end;if redis.call('SISMEMBER',KEYS[3],ARGV[1])==1 then return 'duplicate' end;if redis.call('SCARD',KEYS[3])>=3 then return 'limit' end;redis.call('SADD',KEYS[3],ARGV[1]);redis.call('HINCRBY',KEYS[4],ARGV[1],1);return 'ok'`;
export async function vote(voter: string, id: string) {
  if (remote()) {
    const config = await init();
    const round = config.roundId || "initial";
    return redis([
      "EVAL",
      voteLua,
      4,
      "fv:config",
      "fv:movies",
      voterKey(round, voter),
      countKey(round),
      id,
      Date.now(),
      round,
    ]);
  }
  return local((d) => {
    if (phase(d.config) === "scheduled") return "scheduled";
    if (phase(d.config) !== "open") return "closed";
    if (!d.movies.some((m) => m.id === id)) return "missing";
    const voted = d.voters[voter] || [];
    if (voted.includes(id)) return "duplicate";
    if (voted.length >= 3) return "limit";
    d.voters[voter] = [...voted, id];
    d.counts[id] = (d.counts[id] || 0) + 1;
    return "ok";
  });
}
export async function saveMovie(movie: Movie) {
  if (remote()) {
    await init();
    await redis([
      "EVAL",
      `local c=cjson.decode(redis.call('GET',KEYS[1]));if (c.archivedAt and c.archivedAt>0) or tonumber(ARGV[4])>=c.endsAt then return redis.error_reply('Periode selesai') end;local found=false;for _,p in ipairs(c.playlists) do if p.id==ARGV[2] then found=true end end;if not found then return redis.error_reply('Playlist tidak ditemukan') end;local movie=cjson.decode(ARGV[3]);for _,raw in ipairs(redis.call('HVALS',KEYS[2])) do local m=cjson.decode(raw);if m.id~=movie.id and m.youtubeId==movie.youtubeId and m.playlistId==movie.playlistId then return redis.error_reply('Duplikat') end end;redis.call('HSET',KEYS[2],ARGV[1],ARGV[3]);redis.call('HSET',KEYS[3],movie.youtubeId,ARGV[3]);return 1`,
      3,
      "fv:config",
      "fv:movies",
      "fv:library",
      movie.id,
      movie.playlistId,
      JSON.stringify(movie),
      Date.now(),
    ]);
    return;
  }
  return local((d) => {
    if (phase(d.config) === "ended")
      throw new Error("Buat periode baru terlebih dahulu.");
    if (!d.config.playlists.some((p) => p.id === movie.playlistId))
      throw new Error("Playlist tidak ditemukan.");
    if (
      d.movies.some(
        (m) =>
          m.id !== movie.id &&
          m.youtubeId === movie.youtubeId &&
          m.playlistId === movie.playlistId,
      )
    )
      throw new Error("Film sudah ada di playlist.");
    const i = d.movies.findIndex((m) => m.id === movie.id);
    if (i < 0) d.movies.push(movie);
    else d.movies[i] = movie;
    d.library[movie.youtubeId] = movie;
  });
}
export async function deleteMovie(id: string) {
  if (remote()) {
    await init();
    await redis([
      "EVAL",
      `local raw=redis.call('HGET',KEYS[1],ARGV[1]);if raw then local m=cjson.decode(raw);redis.call('HSET',KEYS[2],m.youtubeId,raw);redis.call('HDEL',KEYS[1],ARGV[1]) end;return 1`,
      2,
      "fv:movies",
      "fv:library",
      id,
    ]);
    return;
  }
  return local((d) => {
    const m = d.movies.find((m) => m.id === id);
    if (m) d.library[m.youtubeId] = m;
    d.movies = d.movies.filter((m) => m.id !== id);
  });
}
export async function updateConfig(change: {
  name?: string;
  description?: string;
  id?: string;
  votingOpen?: boolean;
}) {
  if (remote()) {
    await init();
    await redis([
      "EVAL",
      `local c=cjson.decode(redis.call('GET',KEYS[1]));local u=cjson.decode(ARGV[1]);if u.name then table.insert(c.playlists,{id=u.id,name=u.name,description=u.description}) end;if u.votingOpen~=nil then if u.votingOpen and c.archivedAt and c.archivedAt>0 then return redis.error_reply('Periode selesai') end;c.votingOpen=u.votingOpen end;redis.call('SET',KEYS[1],cjson.encode(c));return 1`,
      1,
      "fv:config",
      JSON.stringify(change),
    ]);
    return;
  }
  return local((d) => {
    if (change.name)
      d.config.playlists.push({
        id: change.id!,
        name: change.name,
        description: change.description || "",
      });
    if (change.votingOpen !== undefined) {
      if (change.votingOpen && phase(d.config) === "ended")
        throw new Error("Buat periode baru terlebih dahulu.");
      d.config.votingOpen = change.votingOpen;
    }
  });
}
export async function setSchedule(startsAt: number, endsAt: number) {
  const round = randomUUID();
  if (remote()) {
    await init();
    await redis([
      "EVAL",
      `local c=cjson.decode(redis.call('GET',KEYS[1]));if c.archivedAt and c.archivedAt>0 then c.roundId=ARGV[3];c.archivedAt=0;c.lastMovies={} end;c.startsAt=tonumber(ARGV[1]);c.endsAt=tonumber(ARGV[2]);c.votingOpen=true;redis.call('SET',KEYS[1],cjson.encode(c));return 1`,
      1,
      "fv:config",
      startsAt,
      endsAt,
      round,
    ]);
    return;
  }
  return local((d) => {
    if (phase(d.config) === "ended") {
      d.config.roundId = round;
      d.config.archivedAt = 0;
      d.config.lastMovies = [];
      d.counts = {};
      d.voters = {};
    }
    d.config.startsAt = startsAt;
    d.config.endsAt = endsAt;
    d.config.votingOpen = true;
  });
}
export async function rateLimit(key: string, max: number, seconds: number) {
  if (remote()) {
    const count = await redis([
      "EVAL",
      `local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n`,
      1,
      "fv:limit:" + key,
      seconds,
    ]);
    return count <= max;
  }
  return local((d) => {
    const now = Date.now();
    for (const k of Object.keys(d.limits))
      if (d.limits[k].until < now) delete d.limits[k];
    const entry = d.limits[key] || { count: 0, until: now + seconds * 1000 };
    entry.count++;
    d.limits[key] = entry;
    return entry.count <= max;
  });
}
