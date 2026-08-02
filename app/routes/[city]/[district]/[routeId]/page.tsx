import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RouteExplorer from "@/components/route-explorer";
import { getRouteByPath } from "@/lib/repository";

type RoutePageProps = {
  params: Promise<{ city: string; district: string; routeId: string }>;
  searchParams: Promise<{ q?: string }>;
};

const CITY_NAMES = { TPE: "臺北市", NTP: "新北市" } as const;

export async function generateMetadata({ params }: RoutePageProps): Promise<Metadata> {
  const path = await params;
  const route = getRouteByPath(path.city, path.district, path.routeId);

  if (!route) {
    return {
      title: "找不到路線",
      robots: { index: false, follow: false },
    };
  }

  const cityName = CITY_NAMES[route.cityCode];
  const routeLabel = `${route.routeName}${route.tripLabel ? `・${route.tripLabel}` : ""}`;
  const timeRange = route.firstArrivalTime && route.lastArrivalTime
    ? `${route.firstArrivalTime}–${route.lastArrivalTime}`
    : "時間請見完整停靠點";
  const canonical = `/routes/${route.cityCode.toLowerCase()}/${route.districtSlug}/${route.id}`;
  const title = `${cityName}${route.district} ${routeLabel} 垃圾車時間`;
  const description = `${routeLabel}位於${cityName}${route.district}，表定時間 ${timeRange}，共 ${route.stopCount} 個停靠點；查看各站地址與清運時間。`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "zh_TW",
      url: canonical,
      title: `${title}｜清運地圖`,
      description,
    },
  };
}

export default async function SharedRoutePage({
  params,
  searchParams,
}: RoutePageProps) {
  const path = await params;
  const query = await searchParams;
  const route = getRouteByPath(path.city, path.district, path.routeId);
  if (!route) notFound();
  return <RouteExplorer initialRoute={route} initialQuery={query.q ?? ""} />;
}
