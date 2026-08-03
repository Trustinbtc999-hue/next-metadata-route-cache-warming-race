import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

// CONTROL — identical to the repro except the cached function awaits nothing
// of its own. Must never warn.
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
  return [{ url: `https://example.com/control-instant-fill/${page}`, lastModified: new Date(0) }];
}
