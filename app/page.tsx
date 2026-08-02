import type { Metadata } from "next";
import RouteExplorer from "@/components/route-explorer";
import type { CityCode } from "@/lib/types";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ city?: string; district?: string; q?: string }> }) {
  const params = await searchParams;
  const initialCity: CityCode = params.city?.toUpperCase() === "NTP" ? "NTP" : "TPE";
  return <RouteExplorer initialCity={initialCity} initialDistrict={params.district ?? ""} initialQuery={params.q ?? ""} />;
}
