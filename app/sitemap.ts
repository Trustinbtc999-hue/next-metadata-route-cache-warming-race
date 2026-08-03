import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

// CONTROL — same "use cache" + cacheLife shape as the two cases below, but the
// cached function resolves immediately. This one must never warn.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife({ stale: 0, revalidate: 3600, expire: 7200 });
  return [{ url: "https://example.com/", lastModified: new Date(0) }];
}
