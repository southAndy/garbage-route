import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/breadcrumb";
import SiteHeader from "@/components/site-header";
import { socialMetadata } from "@/lib/social-metadata";
import { CITY_NAMES, cities, cityPath, districtPath, getDistricts, parseCityCode } from "@/lib/repository";

type CityPageProps = { params: Promise<{ city: string }> };

export function generateStaticParams() {
  return cities.map((city) => ({ city: city.code.toLowerCase() }));
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const city = parseCityCode((await params).city);
  if (!city) return { title: "找不到城市", robots: { index: false, follow: false } };
  const districts = getDistricts(city);
  const routeCount = districts.reduce((sum, item) => sum + item.routeCount, 0);
  const title = `${CITY_NAMES[city]}垃圾車路線與時間一覽`;
  const description = `${CITY_NAMES[city]}共 ${districts.length} 個行政區、${routeCount} 條垃圾車表定路線；依行政區查詢每條路線的停靠點與清運時間。`;
  return { title, description, alternates: { canonical: cityPath(city) }, ...socialMetadata(`${title}｜清運地圖`, description, cityPath(city)) };
}

export default async function CityPage({ params }: CityPageProps) {
  const city = parseCityCode((await params).city);
  if (!city) notFound();
  const districts = getDistricts(city);
  const routeCount = districts.reduce((sum, item) => sum + item.routeCount, 0);

  return (
    <main className="app-shell">
      <SiteHeader />
      <div className="hub">
        <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: CITY_NAMES[city] }]} />
        <p className="eyebrow">{city === "TPE" ? "TAIPEI" : "NEW TAIPEI"}</p>
        <h1>{CITY_NAMES[city]}垃圾車路線</h1>
        <p className="hub-lead">共 {districts.length} 個行政區、{routeCount} 條表定路線。選擇行政區查看該區所有垃圾車路線與停靠時間。</p>
        <ul className="hub-grid">
          {districts.map((district) => (
            <li key={district.slug}>
              <Link href={districtPath(city, district.slug)} className="hub-card">
                <strong>{district.name}</strong>
                <span>{district.routeCount} 條路線</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="hub-note">本資料為政府公布的表定資訊，並非垃圾車即時位置。</p>
      </div>
    </main>
  );
}
