import { NextResponse } from "next/server";
import { cities } from "@/lib/repository";

export const revalidate = 86400;

export function GET() {
  return NextResponse.json({ data: cities });
}
