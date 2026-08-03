import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

// CONTROL — identical to the repro except generateSitemaps resolves without
// awaiting anything. Must never warn.
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
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
  return [{ url: `https://example.com/control-instant-count/${page}`, lastModified: new Date(0) }];
}
