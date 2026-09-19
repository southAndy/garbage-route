import type { Metadata } from "next";
import DistrictIndex from "@/components/district-index";
import RouteExplorer from "@/components/route-explorer";
import JsonLd from "@/components/json-ld";
import { siteUrl } from "@/lib/site-url";
import { socialMetadata } from "@/lib/social-metadata";
import type { CityCode } from "@/lib/types";

const title = "雙北垃圾車時間查詢｜台北、新北路線與停靠點｜清運地圖";
const description = "查詢台北市、新北市垃圾車表定時間、清運路線與停靠點地址。依城市、行政區瀏覽各站資訊，查看一般垃圾、資源回收與廚餘清運日；本服務提供表定資訊，非即時位置。";

export const metadata: Metadata = {
  title: {
    absolute: title,
  },
  description,
  ...socialMetadata(title, description, "/"),
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ city?: string; district?: string; q?: string }> }) {
  const params = await searchParams;
  const initialCity: CityCode = params.city?.toUpperCase() === "NTP" ? "NTP" : "TPE";
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "清運地圖",
        url: `${siteUrl}/`,
      }} />
      <RouteExplorer initialCity={initialCity} initialDistrict={params.district ?? ""} initialQuery={params.q ?? ""}>
        <DistrictIndex />
      </RouteExplorer>
    </>
  );
}
