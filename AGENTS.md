<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git (agents)

- Branch names: `.cursor/rules/Branch-Naming.mdc` (Conventional Branches; never commit on `main`).
- **Commit at milestones** without waiting for the user: `.cursor/rules/Agent-Milestone-Commits.mdc` (Conventional Commits; push only when asked).
- **No secrets in git**: `.cursor/rules/No-Secrets-In-Repo.mdc` (never commit API keys, tokens, or credentials).
- **Stay current with main** (when helpful): `.cursor/rules/Sync-With-Main.mdc` (fetch/pull or merge `main` before new work — not mandatory).
- **Verbose commits & PRs; review loop**: `.cursor/rules/Agent-Verbose-Git-And-PR-Review.mdc` (detailed messages; reviewers give feedback; PR authors fix issues after merge or close).

## Learned User Preferences

- Location pins describe the **visual subject/content** of a scene (label + description = what to render), not how UI pin markers look; user has corrected this distinction multiple times.
- Multiple location pins must produce **one merged scenery image** with all subjects placed at spatially correct positions matching pin placement on the canvas.
- fal.ai API quota is limited — **minimize API calls per session**; never fire redundant or exploratory requests without explicit user instruction.
- Avoid resource-heavy shell operations that could spike CPU/memory; the user's laptop has crashed from this. If the user says "DO NOT RUN IT", respect that absolutely.
- **No authentication and no multi-user features** — the product is single-user only; user explicitly removed auth and collaboration layers.
- The generated scenery image must be **pannable and zoomable** alongside the Konva canvas (lives in world coordinates).
- Canvas UI must include a **"hide location pins" toggle** and a **back button** to return to the project list.

## Learned Workspace Facts

- **Supabase removed entirely**; all persistence uses local filesystem store at `src/lib/local-store.ts` — do not re-introduce Supabase unless explicitly asked.
- `FAL_KEY` in `.env.local` is the only required API key; OpenAI key is optional (copilot feature only).
- Canvas image synthesis strategy: **text-to-image** (`fal-ai/flux/dev`) for first/fresh generation; **img2img** (`fal-ai/flux/dev/image-to-image`) at `strength=0.35` for all subsequent re-syntheses when an existing scenery URL is present (preserves ~65% of prior image to lock landmark positions).
- Synthesized scenery image lives in **world coordinates** so it pans/zooms naturally with the canvas without special treatment.
- `middleware.ts` has been deleted; **no auth layer** exists in the app.
- Konva canvas click-to-pin uses a `hasMoved` ref: if no drag threshold was crossed, the mouseup is treated as a click → opens PinCreator (prevents accidental single-point line creation).
- Active feature branch for Supabase removal work: `refactor/remove-supabase-local-only`.
- Product model: **single-user timeline** with individual cards; each card has a dedicated whiteboard (drawing + text prompt → fal.ai image); final export as video.
- CPU/memory flooding root cause pattern: `useEffect` with unstable function/object references in dependency arrays (e.g. `hydrateFromState` or inline handler objects) — always stabilise with `useCallback`/`useMemo` or `useRef`.
