import { spawn } from "node:child_process";
import path from "node:path";
try {
  process.loadEnvFile(".env.local");
} catch {}
const required = [
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
  "IP_HASH_SECRET",
  "OMDB_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Konfigurasi belum lengkap: " + missing.join(", "));
  console.error(
    "Isi .env.local. Lihat README.md untuk menghubungkan Upstash Redis.",
  );
  process.exit(1);
}
const cli = path.resolve("node_modules/vercel/dist/index.js");
const globals = process.env.VERCEL_CONFIG_DIR
  ? ["--global-config", process.env.VERCEL_CONFIG_DIR]
  : [];
async function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args, ...globals], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Vercel gagal. Periksa pesan CLI di atas.")),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input === undefined ? undefined : input + "\n");
  });
}
try {
  await run(["whoami"]);
  await run(["link", "--yes", "--project", "filmvote"]);
  for (const key of required)
    await run(
      [
        "env",
        "add",
        key,
        "--environment",
        "production",
        "--sensitive",
        "--force",
        "--yes",
      ],
      process.env[key],
    );
  await run(["deploy", "--prod", "--yes"]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
