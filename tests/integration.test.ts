import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("local API: concurrency, vote quota, admin access and movie management", async (context) => {
  const base = "http://localhost:3000";
  const currentState = await (await fetch(base + "/api/state")).json();
  if (currentState.storage !== "local") {
    context.skip(
      "Local fixture test only: Redis is configured. Run the isolated Redis test instead.",
    );
    return;
  }
  const file = path.join(process.cwd(), "data", "store.json");
  const backup = await fs.readFile(file, "utf8");
  const original = JSON.parse(backup);
  const env = await fs.readFile(".env.local", "utf8");
  const password = env.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1].trim();
  assert.ok(password);
  const send = async (
    endpoint: string,
    body?: unknown,
    options: { method?: string; cookie?: string; origin?: string } = {},
  ) => {
    const r = await fetch(base + "/api/" + endpoint, {
      method: body === undefined ? "GET" : options.method || "POST",
      headers: {
        "Content-Type": "application/json",
        origin: options.origin || base,
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    await fs.writeFile(
      file,
      JSON.stringify({ ...original, counts: {}, voters: {}, limits: {} }),
    );
    assert.equal(
      (await send("admin/movie", { title: "Unauthorized" })).status,
      401,
    );
    assert.equal(
      (
        await send(
          "vote",
          { movieId: original.movies[0].id },
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await send("admin/login", { password: "incorrect" })).status,
      401,
    );
    const login = await send("admin/login", {
      username: "naenaenae",
      password,
    });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    const cookie = login.cookie;
    assert.equal(
      (await send("admin/session", undefined, { cookie })).body.authenticated,
      true,
    );
    assert.equal(
      (
        await send("admin/session", undefined, {
          cookie: "fv_admin=9999999999999.forged",
        })
      ).body.authenticated,
      false,
    );
    const results = await Promise.all(
      original.movies.map((m: { id: string }) =>
        send("vote", { movieId: m.id }),
      ),
    );
    assert.equal(
      results.filter((r) => r.status === 200).length,
      3,
      "concurrent requests cannot exceed three votes",
    );
    assert.equal(results.filter((r) => r.status === 409).length, 1);
    const state = (await send("state")).body;
    assert.equal(state.remaining, 0);
    assert.equal(state.voted.length, 3);
    assert.equal(
      Object.values(state.counts).reduce((n: number, v) => n + Number(v), 0),
      3,
    );
    assert.equal((await send("vote", { movieId: state.voted[0] })).status, 409);
    assert.equal(
      (await send("state")).body.remaining,
      0,
      "quota survives reload",
    );
    assert.equal(
      (await send("admin/voting", { open: false }, { cookie })).status,
      200,
    );
    assert.equal(
      (await send("vote", { movieId: original.movies[0].id })).body.error,
      "Voting sedang ditutup.",
    );
    await send("admin/voting", { open: true }, { cookie });
    assert.equal(
      (
        await send(
          "admin/metadata",
          { url: "https://evil.example/watch?v=zSWdZVtXT7E" },
          { cookie },
        )
      ).status,
      400,
    );
    const lookup = await send(
      "admin/metadata",
      {
        url: "https://youtu.be/zSWdZVtXT7E",
        title: "Interstellar",
        playlistId: original.config.playlists[0].id,
      },
      { cookie },
    );
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.movie.youtubeId, "zSWdZVtXT7E");
    await send("admin/playlist", { name: "Integration test" }, { cookie });
    const updated = (await send("state")).body;
    const list = updated.config.playlists.find(
      (p: { name: string }) => p.name === "Integration test",
    );
    assert.ok(list);
    const film = {
      ...lookup.body.movie,
      id: "integration-film",
      playlistId: list.id,
      title: "Test film",
    };
    assert.equal((await send("admin/movie", film, { cookie })).status, 200);
    const after = (await send("state")).body;
    const saved = after.movies.find(
      (m: { title: string }) => m.title === "Test film",
    );
    assert.ok(saved);
    assert.equal(
      (
        await send(
          "admin/movie",
          { id: saved.id },
          { cookie, method: "DELETE" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await send("state")).body.movies.some(
        (m: { id: string }) => m.id === saved.id,
      ),
      false,
    );
    assert.equal(
      (
        await send(
          "admin/movie",
          { ...film, playlistId: "missing" },
          { cookie },
        )
      ).status,
      503,
    );
    await send("admin/logout", {}, { cookie });
  } finally {
    await fs.writeFile(file, backup);
  }
});
