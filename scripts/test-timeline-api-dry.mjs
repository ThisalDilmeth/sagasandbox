#!/usr/bin/env node
/**
 * Dry-run checks for timeline fal routes (no FAL_KEY required).
 * Usage: node scripts/test-timeline-api-dry.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let failed = 0;

function assert(name, ok, detail) {
  if (ok) {
    console.log(`✓ ${name}`);
    return;
  }
  failed += 1;
  console.error(`✗ ${name}`, detail ?? "");
}

const noKey = !process.env.FAL_KEY;
if (noKey) {
  console.log("FAL_KEY unset — expecting 503 on generate/export\n");
}

const gen503 = await post("/api/timeline/generate", {
  prompt: "dry run",
  sketchDataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
});
assert(
  "generate without key → 503",
  noKey ? gen503.status === 503 : gen503.status !== 503,
  gen503,
);

const gen400 = await post("/api/timeline/generate", { prompt: "   " });
assert("generate empty prompt → 400", gen400.status === 400, gen400);

const exp503 = await post("/api/timeline/export", {
  prompt: "test",
  imageUrls: ["https://example.com/a.png"],
});
assert(
  "export without key → 503",
  noKey ? exp503.status === 503 : exp503.status !== 503,
  exp503,
);

const exp400 = await post("/api/timeline/export", { prompt: "test", imageUrls: [] });
assert("export no images → 400", exp400.status === 400, exp400);

if (failed > 0) {
  process.exit(1);
}
console.log("\nAll dry-run checks passed.");
