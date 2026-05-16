import { NextResponse, type NextRequest } from "next/server";

/** Simplified build: no auth gate — local-first timeline only. */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
