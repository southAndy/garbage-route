import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";
import routesData from "@/data/routes.json";
import type { GarbageRoute } from "@/lib/types";
import { cities, cityPath, districtPath, getDistricts, routePath } from "@/lib/repository";

const routes = routesData as GarbageRoute[];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    ...cities.map((city) => ({
      url: `${siteUrl}${cityPath(city.code)}`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...cities.flatMap((city) => getDistricts(city.code).map((district) => ({
      url: `${siteUrl}${districtPath(city.code, district.slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))),
    ...routes.map((route) => ({
      url: `${siteUrl}${routePath(route)}`,
      lastModified: route.source.syncedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
