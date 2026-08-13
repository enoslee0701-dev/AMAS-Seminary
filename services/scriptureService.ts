// scriptureService.ts — offline 和合本 (CUV, Chinese Union Version) lookup.
//
// Replaces the previous LLM-generated scripture path, which was unreliable
// (hallucinated verses and wrong numbering). The dataset lives at
// /public/scripture/cuv.json and is fetched lazily on first call, then cached
// in module scope for the rest of the session.
//
// Shape of cuv.json (full 66-book CUV simplified Chinese, ~3.2 MB, 31,103 verses):
//   {
//     "<book name in Chinese>": {
//       "<chapter number as string>": ["1 ...", "2 ...", ...]
//     }
//   }
// Source: TecReaGroup/Bible_Chinese_CUVS (public-domain CUV 1919).

type CuvData = Record<string, Record<string, string[]>>;

let cuvCache: CuvData | null = null;
let cuvPromise: Promise<CuvData> | null = null;

async function fetchCuv(): Promise<CuvData> {
  if (cuvCache) return cuvCache;
  if (cuvPromise) return cuvPromise;
  cuvPromise = (async () => {
    const res = await fetch('/scripture/cuv.json');
    if (!res.ok) {
      throw new Error(`Failed to load CUV scripture data: HTTP ${res.status}`);
    }
    const data = (await res.json()) as CuvData;
    cuvCache = data;
    return data;
  })().catch(err => {
    // Reset the in-flight promise so future calls can retry after a transient
    // network failure (e.g., during initial app boot).
    cuvPromise = null;
    throw err;
  });
  return cuvPromise;
}

/**
 * Load the verses for a given book + chapter from the bundled CUV dataset.
 *
 * @param book    Book name in Chinese (must match the keys used in
 *                components/VoiceRoom/constants.ts — e.g. "创世记", "诗篇",
 *                "马太福音").
 * @param chapter 1-indexed chapter number.
 * @returns Array of verse strings, each prefixed with its verse number
 *          (e.g. "1 起初，神创造天地。").
 * @throws  If the dataset cannot be fetched, or the book/chapter is missing
 *          from the dataset.
 */
export async function loadScripture(book: string, chapter: number): Promise<string[]> {
  const data = await fetchCuv();
  const bookData = data[book];
  if (!bookData || typeof bookData !== 'object') {
    // eslint-disable-next-line no-console
    console.warn(`[scriptureService] Book "${book}" not found in CUV dataset.`);
    throw new Error(`经文数据中未找到《${book}》。`);
  }
  const verses = bookData[String(chapter)];
  if (!Array.isArray(verses) || verses.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[scriptureService] ${book} chapter ${chapter} is not present in the bundled CUV dataset.`
    );
    throw new Error(`经文数据中未找到《${book}》第${chapter}章。`);
  }
  return verses;
}
