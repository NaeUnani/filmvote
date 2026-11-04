import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
function secret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 24)
    throw new Error(`${name} belum dikonfigurasi (minimal 24 karakter).`);
  return value;
}
export function voterId(req: NextRequest) {
  let ip = "127.0.0.1";
  if (process.env.VERCEL) {
    ip = (
      req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-forwarded-for") ||
      ""
    )
      .split(",")[0]
      .trim();
    if (!isIP(ip)) throw new Error("IP pengunjung tidak dapat diperiksa.");
  }
  return createHmac("sha256", secret("IP_HASH_SECRET"))
    .update(ip.replace(/^::ffff:/, ""))
    .digest("hex");
}
export function passwordMatches(value: string, username: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("Password belum diatur.");
  const h = (s: string) =>
    createHmac("sha256", secret("SESSION_SECRET")).update(s).digest();
  return timingSafeEqual(
    h(username + ":" + value),
    h((process.env.ADMIN_USERNAME || "naenaenae") + ":" + expected),
  );
}
function sessionSignature(payload: string) {
  return createHmac("sha256", secret("SESSION_SECRET"))
    .update(
      payload +
        ":" +
        (process.env.ADMIN_USERNAME || "naenaenae") +
        ":" +
        process.env.ADMIN_PASSWORD,
    )
    .digest("hex");
}
export function createSession() {
  const payload = String(Date.now() + 12 * 60 * 60 * 1000);
  return payload + "." + sessionSignature(payload);
}
export function isAdmin(req: NextRequest) {
  const token = req.cookies.get("fv_admin")?.value || "";
  const [expiry, mac] = token.split(".");
  if (!expiry || !mac || !/^\d+$/.test(expiry) || Number(expiry) < Date.now())
    return false;
  const expected = sessionSignature(expiry);
  return (
    mac.length === expected.length &&
    timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );
}
