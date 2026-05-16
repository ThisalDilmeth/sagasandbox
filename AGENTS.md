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

- Simplified product direction: single-user timeline with per-card whiteboards, fal.ai scene images, and timeline video export — not auth, multiplayer, vault, or copilot.
- Conserve fal.ai API quota when testing or fixing: prefer dry-runs and code review; cap live generate/export calls; avoid retry loops.
- Wants beginner-friendly, click-by-click setup guidance for keys and deployment (fal.ai, Vercel, Supabase), not jargon-heavy summaries.

## Learned Workspace Facts

- Core `/timeline` flow is local-first (localStorage); Supabase and Vercel env vars are optional for local demo.
- `FAL_KEY` in `.env.local` is required for per-card image generation and timeline video export; mirror on Vercel only when deploying.
- Setup docs live at `docs/SETUP_KEYS.md` and `docs/SETUP_VERCEL_AND_SUPABASE.md`.
- fal.ai integration: Flux image-to-image for sketch + prompt on cards; Kling for timeline video export.
- Out of scope for the simplified build: authentication, multiplayer/collaboration, Character Vault, Creative Copilot, shared geography canvas as primary UX.
- Product scope and PRD details are maintained in `.cursor/rules/Project-Context.mdc`.
