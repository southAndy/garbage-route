import { NextResponse } from "next/server";
import { getRoute } from "@/lib/repository";

export const revalidate = 86400;

export async function GET(_request: Request, context: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await context.params;
  const route = getRoute(routeId);
  if (!route) {
    return NextResponse.json(
      { error: { code: "ROUTE_NOT_FOUND", message: "找不到指定垃圾車路線" } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: route });
}
