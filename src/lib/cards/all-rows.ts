// Kept apart from transfer.ts so browser code (Profile → Your data) can page without bundling zod.
const PAGE = 1000; // the API's default row cap

/** Every row of a query, page by page: a single select stops silently at the API's row cap. order() keeps pages stable. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return null;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}
