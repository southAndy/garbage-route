import type { Metadata } from "next";
import { connection } from "next/server";
import AdSlot from "@/components/ad-slot";
import SiteHeader from "@/components/site-header";
import Breadcrumb from "@/components/breadcrumb";
import CollectionPointFinder from "@/components/collection-point-finder";
import { loadCollectionPoints } from "@/lib/collection-point-loader";
import { socialMetadata } from "@/lib/social-metadata";

const title = "錯過垃圾車？雙北限時收受點查詢";
const description = "查詢臺北市限時收受點地址、官方收受時段與導航，或前往新北市全市定點查詢。出發前請確認收受種類與開放時間。";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/collection-points" },
  ...socialMetadata(`${title}｜清運地圖`, description, "/collection-points"),
};
// Retry failed upstream requests on the next visit; successful CSV responses are cached for an hour.

export default async function CollectionPointsPage() {
  await connection();
  const { points, failed } = await loadCollectionPoints();
  return <main className="app-shell">
    <SiteHeader />
    <div className="hub collection-hub">
      <Breadcrumb items={[{ label: "首頁", href: "/" }, { label: "限時收受點" }]} />
      <p className="collection-eyebrow">錯過垃圾車，也有其他選擇</p>
      <h1>找限時收受點</h1>
      <p className="hub-lead">先確認收受時段與種類，再帶垃圾出門。限時收受點不是全天開放的垃圾場，部分地點是垃圾車限時駐點。</p>
      <CollectionPointFinder points={points} failed={failed} />
      <AdSlot slot="collection_points" />
    </div>
  </main>;
}
