import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/breadcrumb";
import SiteHeader from "@/components/site-header";
import { socialMetadata } from "@/lib/social-metadata";
import { CITY_NAMES, cityPath, districtPath, getAllDistrictPaths, getDistrictBySlug, getRouteSummariesByDistrictSlug, parseCityCode, routePath } from "@/lib/repository";

type DistrictPageProps = { params: Promise<{ city: string; district: string }> };

export function generateStaticParams() {
  return getAllDistrictPaths();
}

export async function generateMetadata({ params }: DistrictPageProps): Promise<Metadata> {
  const path = await params;
  const city = parseCityCode(path.city);
  const district = city ? getDistrictBySlug(city, path.district) : null;
  if (!city || !district) return { title: "找不到行政區", robots: { index: false, follow: false } };
  const canonical = districtPath(city, district.slug);
  const title = `${CITY_NAMES[city]}${district.name}垃圾車路線與時間一覽`;
  const description = `${CITY_NAMES[city]}${district.name}共 ${district.routeCount} 條垃圾車表定路線；查看每條路線的起訖站、清運時間與完整停靠點。`;
  return { title, description, alternates: { canonical }, ...socialMetadata(`${title}｜清運地圖`, description, canonical) };
}

export default async function DistrictPage({ params }: DistrictPageProps) {
  const path = await params;
  const city = parseCityCode(path.city);
  const district = city ? getDistrictBySlug(city, path.district) : null;
  if (!city || !district) notFound();
  const routes = getRouteSummariesByDistrictSlug(city, district.slug);

  return (
    <main className="app-shell">
      <SiteHeader />
      <div className="hub">
        <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: CITY_NAMES[city], href: cityPath(city) }, { label: district.name }]} />
        <p className="eyebrow">{CITY_NAMES[city]}</p>
        <h1>{district.name}垃圾車路線</h1>
        <p className="hub-lead">共 {routes.length} 條表定路線。點選路線查看地圖與每一站的清運時間，或<Link href={`/?city=${city}&district=${encodeURIComponent(district.name)}`}>在地圖中搜尋停靠點</Link>。</p>
        <ul className="hub-grid">
          {routes.map((route) => (
            <li key={route.id}>
              <Link href={routePath(route)} className="hub-card">
                <strong>{route.routeName}{route.tripLabel ? `・${route.tripLabel}` : ""}</strong>
                <span>{route.firstArrivalTime ?? "--:--"} — {route.lastArrivalTime ?? "--:--"}・共 {route.stopCount} 站</span>
                <small>{route.startStopName ?? "起點未提供"} → {route.endStopName ?? "終點未提供"}</small>
              </Link>
            </li>
          ))}
        </ul>
        <p className="hub-note">本資料為政府公布的表定資訊，並非垃圾車即時位置。</p>
      </div>
    </main>
  );
}
