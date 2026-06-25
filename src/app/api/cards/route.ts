import { NextResponse } from "next/server";
import { getAllCards } from "@/lib/data";
import { parseQuery, runQuery } from "@/lib/query";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const params = parseQuery(searchParams);
  const result = runQuery(getAllCards(), params);
  return NextResponse.json(result);
}
