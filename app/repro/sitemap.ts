import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

// REPRO — both halves present:
//   1. generateSitemaps awaits (a `SELECT count(*)` in a real app)
//   2. the "use cache" function awaits (the paged query in a real app)
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return [{ id: 0 }];
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife({ stale: 0, revalidate: 3600, expire: 7200 });
  const page = Number(await id);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  return [{ url: `https://example.com/repro/${page}`, lastModified: new Date(0) }];
}
