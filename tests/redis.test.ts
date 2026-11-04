import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

try {
  process.loadEnvFile(".env.local");
} catch {}

test("Redis: concurrent votes respect quota and cannot duplicate", async (context) => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    context.skip(
      "Redis is not configured; local API test covers file storage.",
    );
    return;
  }
  const command = async (args: (string | number)[]) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(12000),
    });
    assert.ok(response.ok);
    const result = await response.json();
    assert.equal(result.error, undefined);
    return result.result;
  };
  const source = await fs.readFile("lib/store.ts", "utf8");
  const script = source.match(/export const voteLua = `([\s\S]*?)`;/)?.[1];
  assert.ok(script, "Use the application's actual atomic vote operation");
  const prefix = "fv:test:" + randomUUID();
  const keys = ["config", "movies", "voter", "counts"].map(
    (key) => `${prefix}:${key}`,
  );
  try {
    await command([
      "SET",
      keys[0],
      JSON.stringify({ votingOpen: true }),
      "EX",
      120,
    ]);
    for (let i = 0; i < 4; i++)
      await command(["HSET", keys[1], String(i), "{}"]);
    await command(["EXPIRE", keys[1], 120]);
    const responses = await Promise.all(
      [0, 1, 2, 3].map((id) =>
        command(["EVAL", script, 4, ...keys, String(id)]),
      ),
    );
    assert.equal(responses.filter((value) => value === "ok").length, 3);
    assert.equal(responses.filter((value) => value === "limit").length, 1);
    assert.equal(await command(["SCARD", keys[2]]), 3);
    const chosen = await command(["SMEMBERS", keys[2]]);
    assert.equal(
      await command(["EVAL", script, 4, ...keys, chosen[0]]),
      "duplicate",
    );
    await command([
      "SET",
      keys[0],
      JSON.stringify({ votingOpen: false }),
      "EX",
      120,
    ]);
    assert.equal(await command(["EVAL", script, 4, ...keys, "0"]), "closed");
  } finally {
    // Only these randomly named test keys are removed; real votes are untouched.
    await command(["DEL", ...keys]);
  }
});

test("Redis: voting window, automatic library archive, fresh-round quota", async (context) => {
  const url = process.env.UPSTASH_REDIS_REST_URL,
    token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    context.skip("Redis not configured");
    return;
  }
  const command = async (args: (string | number)[]) => {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(12000),
    });
    const d = await r.json();
    assert.equal(d.error, undefined);
    return d.result;
  };
  const source = await fs.readFile("lib/store.ts", "utf8");
  const init = source.match(/export const initLua = `([\s\S]*?)`;/)?.[1];
  const vote = source.match(/export const voteLua = `([\s\S]*?)`;/)?.[1];
  assert.ok(init);
  assert.ok(vote);
  const prefix = "fv:test:" + randomUUID();
  const [config, movies, library, voter, counts, nextVoter, nextCounts] = [
    "config",
    "movies",
    "library",
    "voter",
    "counts",
    "next-voter",
    "next-counts",
  ].map((x) => prefix + ":" + x);
  const keys = [config, movies, library, voter, counts, nextVoter, nextCounts];
  const now = Date.now();
  const film = {
    id: "test-film",
    youtubeId: "abcdefghijk",
    title: "Fixture",
    playlistId: "test",
    addedAt: now,
  };
  try {
    await command([
      "SET",
      config,
      JSON.stringify({
        votingOpen: true,
        roundId: "round-test",
        startsAt: now + 1000,
        endsAt: now + 5000,
        playlists: [],
      }),
      "EX",
      120,
    ]);
    await command(["HSET", movies, film.id, JSON.stringify(film)]);
    assert.equal(
      await command([
        "EVAL",
        vote,
        4,
        config,
        movies,
        voter,
        counts,
        film.id,
        now,
        "round-test",
      ]),
      "scheduled",
    );
    assert.equal(
      await command([
        "EVAL",
        vote,
        4,
        config,
        movies,
        voter,
        counts,
        film.id,
        now + 2000,
        "round-test",
      ]),
      "ok",
    );
    assert.equal(
      await command([
        "EVAL",
        vote,
        4,
        config,
        movies,
        voter,
        counts,
        film.id,
        now + 5000,
        "round-test",
      ]),
      "closed",
    );
    const archived = JSON.parse(
      await command([
        "EVAL",
        init,
        3,
        config,
        movies,
        library,
        "{}",
        "[]",
        now + 5000,
      ]),
    );
    assert.equal(archived.archivedAt, now + 5000);
    assert.equal(archived.lastMovies.length, 1);
    assert.equal(await command(["HLEN", movies]), 0);
    assert.equal(
      JSON.parse(await command(["HGET", library, film.youtubeId])).title,
      "Fixture",
    );
    await command([
      "SET",
      config,
      JSON.stringify({
        votingOpen: true,
        roundId: "next",
        startsAt: now,
        endsAt: now + 10000,
      }),
      "EX",
      120,
    ]);
    await command(["HSET", movies, film.id, JSON.stringify(film)]);
    assert.equal(
      await command([
        "EVAL",
        vote,
        4,
        config,
        movies,
        nextVoter,
        nextCounts,
        film.id,
        now + 6000,
        "round-test",
      ]),
      "stale",
    );
    assert.equal(
      await command([
        "EVAL",
        vote,
        4,
        config,
        movies,
        nextVoter,
        nextCounts,
        film.id,
        now + 6000,
        "next",
      ]),
      "ok",
    );
    assert.equal(await command(["SCARD", nextVoter]), 1);
  } finally {
    await command(["DEL", ...keys]);
  }
});
