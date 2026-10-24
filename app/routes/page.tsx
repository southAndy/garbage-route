import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumb from "@/components/breadcrumb";
import DistrictIndex from "@/components/district-index";
import SiteHeader from "@/components/site-header";
import { socialMetadata } from "@/lib/social-metadata";

const title = "依行政區瀏覽雙北垃圾車路線";
const description = "依臺北市、新北市行政區瀏覽垃圾車表定路線，查看各路線停靠點與清運時間。";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/routes" },
  ...socialMetadata(`${title}｜清運地圖`, description, "/routes"),
};

export default function BrowseRoutesPage() {
  return (
    <main className="app-shell">
      <SiteHeader />
      <div className="hub district-browser">
        <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: "依地區瀏覽" }]} />
        <h1>依地區瀏覽垃圾車路線</h1>
        <p className="hub-lead">選擇行政區，查看該區的路線、停靠點與表定時間。也可以先點選城市，瀏覽各區路線數量。</p>
        <p className="hub-lead">想用路名或目前位置查詢？<Link href="/">回到地圖搜尋 →</Link></p>
        <Link href="/collection-points" className="collection-entry">錯過垃圾車？找限時收受點 →</Link>
        <DistrictIndex heading="選擇行政區" />
        <p className="hub-note">本資料為政府公布的表定資訊，並非垃圾車即時位置。</p>
      </div>
    </main>
  );
}
