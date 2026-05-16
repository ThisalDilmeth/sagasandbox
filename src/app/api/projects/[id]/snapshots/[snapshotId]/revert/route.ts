import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, restored: { pins: 0, events: 0, characters: 0 } });
}
