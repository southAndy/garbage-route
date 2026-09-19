import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/breadcrumb";
import RouteExplorer from "@/components/route-explorer";
import { socialMetadata } from "@/lib/social-metadata";
import { CITY_NAMES, cityPath, districtPath, getAllRoutePaths, getRouteByPath, getRouteSummariesByDistrictSlug, routePath } from "@/lib/repository";

type RoutePageProps = {
  params: Promise<{ city: string; district: string; routeId: string }>;
};

export function generateStaticParams() {
  return getAllRoutePaths();
}

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
  const canonical = routePath(route);
  const title = `${cityName}${route.district} ${routeLabel} 垃圾車時間`;
  const description = `${routeLabel}位於${cityName}${route.district}，表定時間 ${timeRange}，共 ${route.stopCount} 個停靠點；查看各站地址與清運時間。`;

  return {
    title,
    description,
    alternates: { canonical },
    ...socialMetadata(`${title}｜清運地圖`, description, canonical),
  };
}

export default async function SharedRoutePage({ params }: RoutePageProps) {
  const path = await params;
  const route = getRouteByPath(path.city, path.district, path.routeId);
  if (!route) notFound();
  const cityName = CITY_NAMES[route.cityCode];
  const routeLabel = `${route.routeName}${route.tripLabel ? `・${route.tripLabel}` : ""}`;
  const siblings = getRouteSummariesByDistrictSlug(route.cityCode, route.districtSlug).filter((item) => item.id !== route.id);

  return (
    <RouteExplorer
      initialRoute={route}
      syncQueryFromUrl
      breadcrumb={<Breadcrumb items={[{ label: "首頁", href: "/" }, { label: cityName, href: cityPath(route.cityCode) }, { label: route.district, href: districtPath(route.cityCode, route.districtSlug) }, { label: routeLabel }]} />}
    >
      {siblings.length > 0 && <section className="related-routes" aria-labelledby="related-routes-title">
        <p className="eyebrow">MORE IN {route.district}</p>
        <h2 id="related-routes-title">{cityName}{route.district}其他垃圾車路線</h2>
        <ul>
          {siblings.map((item) => <li key={item.id}><Link href={routePath(item)}>{item.routeName}{item.tripLabel ? `・${item.tripLabel}` : ""}<small>{item.firstArrivalTime ?? "--:--"} — {item.lastArrivalTime ?? "--:--"}</small></Link></li>)}
        </ul>
        <p><Link href={districtPath(route.cityCode, route.districtSlug)}>查看{route.district}全部路線 →</Link></p>
      </section>}
    </RouteExplorer>
  );
}
