import { NextResponse } from "next/server";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[\w-]{11}$/.test(id))
    return new Response("Not found", { status: 404 });
  try {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return new Response("Thumbnail unavailable", { status: 404 });
    return new NextResponse(await r.arrayBuffer(), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Thumbnail unavailable", { status: 502 });
  }
}
