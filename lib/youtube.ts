export function youtubeId(input: string): string | null {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1];
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host))
      id =
        u.pathname === "/watch"
          ? u.searchParams.get("v")
          : u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function movieTitle(title: string): string {
  return title
    .replace(/\b(official|final|teaser|trailer|hd|4k|uhd)\b.*$/i, "")
    .replace(/\s*[|–—-]\s*$/, "")
    .replace(/\(\d{4}\)/g, "")
    .trim();
}
