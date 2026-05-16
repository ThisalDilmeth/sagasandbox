import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ snapshots: [] });
}

export async function POST() {
  return NextResponse.json({ snapshot: null });
}
