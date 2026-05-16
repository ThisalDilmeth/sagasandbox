# SagaSandbox — API keys setup (fal.ai + Supabase)

Beginner-oriented guide for the **simplified timeline app** (`/timeline`). Legacy workspace routes (`/projects/*`) still exist and need Supabase + webhooks when used.

**No real secrets in this doc** — use placeholders like `your-fal-key-here`.

---

## 1. Overview

### What each service does in this app

| Service | Role in simplified build | Required? |
|---------|--------------------------|-----------|
| **fal.ai** | Scene images (`fal-ai/flux/dev`) and timeline video export (`fal-ai/luma-dream-machine`) via `/api/timeline/generate` and `/api/timeline/export` | **Yes** for generation |
| **Supabase** | Optional for `/timeline` (data lives in browser `localStorage` via Zustand). **Required** for legacy `/projects/*`, auth, Realtime, storage, and fal **queue** webhooks | **Optional** for timeline-only local dev |

### Three places keys can live

1. **Local** — `.env.local` (gitignored). Used by `npm run dev` and local `npm run build`.
2. **Vercel** — Project → Settings → Environment Variables. Used for preview/production Next.js deployments. `NEXT_PUBLIC_*` vars are inlined at **build time**; change them → **redeploy**.
3. **Supabase Edge** — Dashboard → Edge Functions → Secrets. Used only by Deno functions in `supabase/functions/` (`handle-fal-webhook`, `process-export`, `cascade-regen`). **Not** copied from Vercel automatically.

---

## 2. fal.ai setup

### Create account and API key

1. Sign up at [fal.ai](https://fal.ai).
2. Open **Dashboard → API Keys** (or account settings).
3. Create a key. In this repo it is named **`FAL_KEY`** (server-only; never `NEXT_PUBLIC_`).

### Where to put `FAL_KEY`

| Environment | Action |
|-------------|--------|
| **Local** | Add to `.env.local`: `FAL_KEY=your-fal-key-here` |
| **Vercel** | Add `FAL_KEY` for Production and Preview (and Development if using `vercel dev`) |
| **Supabase Edge** | Only if you use **legacy** async pipelines (see below) |

**Simplified `/timeline` flow** uses `fal.subscribe()` in `src/lib/timeline-fal.ts` — the HTTP request waits for the job to finish. **No webhook** is required for card image generation or timeline video export.

**Legacy flow** (`src/lib/fal.ts`, `src/lib/fal-media.ts`) uses `fal.queue.submit()` with:

```text
webhookUrl = ${NEXT_PUBLIC_SITE_URL}/api/webhooks/fal
```

That path forwards to the `handle-fal-webhook` edge function and needs Supabase + correct public URL.

### Edge functions that need `FAL_KEY`

| Function | Needs `FAL_KEY`? | Notes |
|----------|------------------|--------|
| `handle-fal-webhook` | No | Downloads fal output URLs; uses Supabase admin key only |
| `process-export` | Yes | Kokoro TTS and Luma video queue for legacy exports |
| `cascade-regen` | Yes | Submits flux jobs with webhook to `handle-fal-webhook` |

Set in **Supabase Dashboard → Edge Functions → Secrets**: `FAL_KEY=your-fal-key-here`.

### `NEXT_PUBLIC_SITE_URL` and webhooks

| Scenario | Need `NEXT_PUBLIC_SITE_URL`? |
|----------|------------------------------|
| Local `/timeline` generate + export | **No** |
| Vercel `/timeline` generate + export | **No** (only `FAL_KEY` on Vercel) |
| Legacy pin/event generation (queued) | **Yes** — must be a URL fal.ai can POST to |
| Local legacy webhooks | **Hard** — use [ngrok](https://ngrok.com) or test on Vercel staging/production |

Examples:

- Local app only: `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (optional; unused by `/timeline`)
- Production: `NEXT_PUBLIC_SITE_URL=https://your-production-domain.vercel.app`

Preview deploys: each PR URL differs unless you use a **fixed staging domain** (see `docs/integrations/vercel-supabase-orchestrator.md` §5).

### Verify fal.ai (simplified app)

1. `FAL_KEY` in `.env.local`, restart `npm run dev`.
2. Open `http://localhost:3000/timeline`.
3. Add a card → open it → sketch + prompt → **Generate scene**. Expect thumbnail on timeline (may take 30–90s).
4. With at least one generated image → **Export timeline video** → download link when Luma completes.

Failures: HTTP **503** with “Set FAL_KEY…” → key missing on server. **502** → fal error message in UI/network tab.

---

## 3. Supabase setup (if using)

### When you need it

- **Skip** for timeline-only hackathon demo: cards persist in browser (`sagasandbox-timeline-v1` in `localStorage`).
- **Use** if you need: Google/magic-link auth, `/projects/*` workspace, Realtime, DB-backed exports, or legacy fal webhooks.

### Create project and collect keys

Supabase Dashboard → **Project Settings → API**:

| Env variable | Dashboard source | Public? |
|--------------|------------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Yes (browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | Yes (browser; RLS applies) |
| `SUPABASE_SECRET_KEY` | secret key (`sb_secret_...`) | **Server only** |
| `SUPABASE_SERVICE_ROLE_KEY` | legacy JWT service_role | **Server only** (fallback) |

Preferred server key: **`SUPABASE_SECRET_KEY`**. Code also accepts `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SB_KEY` (`src/lib/supabase-admin.ts`).

### `.env.local` from `.env.example`

```bash
cp .env.example .env.local
```

**Minimum for simplified timeline + fal:**

```env
FAL_KEY=your-fal-key-here
```

**Full Supabase + optional auth bypass (local legacy/QA):**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SECRET_KEY=your-secret-key-here

NEXT_PUBLIC_SITE_URL=http://localhost:3000

AUTH_DEV_BYPASS_ENABLED=true
AUTH_DEV_BYPASS_SECRET=your-random-local-secret
DEV_BYPASS_EMAIL=dev@sagasandbox.local
```

Optional (not required for `/timeline`): `OPENAI_API_KEY`, `INNGEST_*`, `DEMO_OWNER_ID` (seed script).

### Migrations and storage

Apply SQL in `supabase/migrations/` in **filename timestamp order** (e.g. `supabase db push` linked to your project).

Notable caveats (see `docs/supabase-session-1-migration.md`):

- Buckets: `images`, `audio`, `exports` — `handle-fal-webhook` uploads to `images/generated/{request_id}.jpg`.
- Some buckets are **private** with RLS; public read exists for `images/generated/*` after migration `20260516130000_exports_bucket_and_generated_storage.sql`.
- Enable **Realtime** for legacy tables if using live UI (`location_pins`, `timeline_events`, `exports`, `characters`).

### Auth (simplified vs legacy)

- **Simplified PRD:** no auth for `/timeline`; `src/middleware.ts` does not gate routes.
- **Legacy `/login`:** needs Supabase Auth + redirect URLs in Dashboard → Authentication → URL Configuration:
  - `http://localhost:3000/auth/callback`
  - `https://your-production-domain/auth/callback`
- **Dev bypass:** `AUTH_DEV_BYPASS_ENABLED=true` + `AUTH_DEV_BYPASS_SECRET` — local only; never enable on production without understanding risk.

### Edge function secrets (Supabase dashboard)

| Secret | Functions |
|--------|-----------|
| `FAL_KEY` | `process-export`, `cascade-regen` |
| (auto) `SUPABASE_URL`, service/secret keys | Injected by Supabase runtime |

`handle-fal-webhook` does **not** read `FAL_KEY`.

Optional legacy TTS: `ELEVENLABS_API_KEY` (docs mention; check `process-export` if you use ElevenLabs paths).

Deploy functions:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy handle-fal-webhook
supabase functions deploy process-export
supabase functions deploy cascade-regen
```

### Mirror on Vercel (if deploying)

Set for **Production** and **Preview** as needed:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `FAL_KEY`
- `NEXT_PUBLIC_SITE_URL` (production domain; see webhook section)
- `OPENAI_API_KEY` (only if using Copilot)

After changing any `NEXT_PUBLIC_*` variable → **redeploy**.

Detailed matrix: `docs/integrations/vercel-supabase-orchestrator.md`.

---

## 4. Step-by-step checklist

- [ ] Copy `.env.example` → `.env.local`
- [ ] Set `FAL_KEY` (required for generate/export)
- [ ] (Optional) Set Supabase URL, anon key, `SUPABASE_SECRET_KEY`
- [ ] (Optional) `NEXT_PUBLIC_SITE_URL` if using legacy queued generation or auth callbacks
- [ ] Restart dev server: `npm run dev`
- [ ] Verify: `/timeline` → generate image → export video
- [ ] **Vercel:** add same vars → redeploy
- [ ] **Supabase Edge:** `FAL_KEY` only if using `process-export` / `cascade-regen`
- [ ] **Webhooks:** only for legacy `/projects` flow — align `NEXT_PUBLIC_SITE_URL` with a public URL

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **503** “Set FAL_KEY in .env.local…” | `FAL_KEY` missing in server env | Add to `.env.local` or Vercel; restart/redeploy |
| Generate hangs then errors | Invalid/expired fal key or quota | Check fal dashboard; read 502 body in Network tab |
| **`gen_status` stuck on `generating`** (legacy pins/events) | Webhook never reached app | Set `NEXT_PUBLIC_SITE_URL` to a **public** URL; ensure `/api/webhooks/fal` works; Edge `FAL_KEY` for cascade |
| Webhook forward **500** | Missing `SUPABASE_SECRET_KEY` on Vercel | Add admin/secret key; webhook route uses it to call edge function |
| **RLS permission denied** | User not in `project_members` | Sign in; create project via API that inserts membership |
| Supabase client error in browser | Missing `NEXT_PUBLIC_SUPABASE_*` | Set both; **rebuild** Vercel deployment |
| Timeline works but data lost | Expected without Supabase | Timeline uses `localStorage`; clear site data = lost project |
| Export needs images | No generated cards | Generate at least one scene before **Export timeline video** |
| Changed `NEXT_PUBLIC_*` on Vercel, still old URL | Build-time inlining | Redeploy after env change |

---

## Related docs

- `.env.example` — variable names
- `docs/integrations/vercel-supabase-orchestrator.md` — Vercel ↔ Supabase ↔ fal webhook chain
- `docs/supabase-session-1-migration.md` — schema and bucket notes
- `.cursor/rules/Project-Context.mdc` — simplified product scope
