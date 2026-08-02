import RouteExplorer from "@/components/route-explorer";
import { getRouteByPath } from "@/lib/repository";

export default async function SharedRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string; district: string; routeId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const path = await params;
  const query = await searchParams;
  const route = getRouteByPath(path.city, path.district, path.routeId);
  return <RouteExplorer initialRoute={route} initialQuery={query.q ?? ""} invalidSharedPath={!route} />;
}
