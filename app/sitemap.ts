import type { MetadataRoute } from "next";
import routesData from "@/data/routes.json";
import type { GarbageRoute } from "@/lib/types";

const siteUrl = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const routes = routesData as GarbageRoute[];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    ...routes.map((route) => ({
      url: `${siteUrl}/routes/${route.cityCode.toLowerCase()}/${route.districtSlug}/${route.id}`,
      lastModified: route.source.syncedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
