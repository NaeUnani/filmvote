import fs from "node:fs/promises";
try {
  process.loadEnvFile(".env.local");
} catch {}
if (!process.env.OMDB_API_KEY)
  throw new Error("OMDB_API_KEY belum dikonfigurasi.");
const ids = ["tt0816692", "tt15239678", "tt1375666", "tt6710474"];
const ratings = {};
for (const id of ids) {
  const u = new URL("https://www.omdbapi.com/");
  u.search = new URLSearchParams({
    apikey: process.env.OMDB_API_KEY,
    i: id,
    plot: "short",
  }).toString();
  const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error("OMDb tidak dapat dihubungi.");
  const m = await r.json();
  if (m.Response !== "True")
    throw new Error("Metadata tidak tersedia: " + m.Error);
  const clean = (v) => (v === "N/A" ? "" : v || "");
  ratings[id] = {
    imdb: clean(m.imdbRating),
    tomatoes: clean(
      m.Ratings?.find((x) => x.Source === "Rotten Tomatoes")?.Value,
    ),
    metacritic: clean(m.Metascore),
  };
  console.log("Metadata diperbarui:", m.Title);
}
await fs.writeFile("lib/ratings.json", JSON.stringify(ratings, null, 2) + "\n");
try {
  const local = JSON.parse(await fs.readFile("data/store.json", "utf8"));
  local.movies = local.movies.map((m) => ({ ...m, ...ratings[m.imdbId] }));
  await fs.writeFile("data/store.json", JSON.stringify(local));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
