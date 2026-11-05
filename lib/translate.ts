const maxSegmentBytes = 500;

export async function translateSynopsis(synopsis: string): Promise<string> {
  const segments: string[] = [];
  for (const line of synopsis.split(/\r?\n/)) {
    let segment = "";
    for (const word of line.trim().split(/\s+/)) {
      if (Buffer.byteLength(word) > maxSegmentBytes) return "";
      const next = segment ? `${segment} ${word}` : word;
      if (Buffer.byteLength(next) <= maxSegmentBytes) {
        segment = next;
      } else {
        segments.push(segment);
        segment = word;
      }
    }
    if (segment) segments.push(segment);
  }

  const signal = AbortSignal.timeout(5000);
  try {
    const translations = await Promise.all(
      segments.map(async (segment) => {
        const query = new URLSearchParams({ q: segment, langpair: "en|id" });
        const response = await fetch(
          `https://api.mymemory.translated.net/get?${query}`,
          { cache: "no-store", signal },
        );
        if (!response.ok) return "";
        const result = await response.json();
        const translated = result.responseData?.translatedText;
        return Number(result.responseStatus) === 200 &&
          !result.quotaFinished &&
          typeof translated === "string"
          ? translated.trim()
          : "";
      }),
    );
    if (translations.some((segment) => !segment)) return "";
    const translation = translations.join(" ");
    return translation === segments.join(" ") ? "" : translation;
  } catch {
    return "";
  }
}
