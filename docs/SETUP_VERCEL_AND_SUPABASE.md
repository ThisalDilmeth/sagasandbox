# Setup Vercel and Supabase (beginner walkthrough)

You already added **`FAL_KEY`** locally — great. This guide explains **when** you need Vercel or Supabase, and **exactly where to click** if you do.

**No real secrets in this doc.** Use placeholders like `your-fal-key-here`.

**Related:** [SETUP_KEYS.md](./SETUP_KEYS.md) (what each key does) · [.env.example](../.env.example) (variable names)

---

## Part A — Do you even need these?

### Local only (`npm run dev`, `/timeline`)

For the **simplified timeline app** on your own computer:

1. Copy [`.env.example`](../.env.example) to **`.env.local`**
2. Set **`FAL_KEY`** only
3. Run `npm run dev` → open [http://localhost:3000/timeline](http://localhost:3000/timeline)

**You do not need Vercel.**  
**You do not need Supabase.**

Your cards are saved in the **browser** (`localStorage`, key `sagasandbox-timeline-v1`). Clearing site data removes the project.

---

### When you need **Vercel**

Use Vercel when you want:

- A **public URL** (e.g. `https://your-app.vercel.app`) to share with others
- A **demo** that runs on the internet, not only on your laptop
- **Production** or **preview** deploys from GitHub

The app still needs **`FAL_KEY` on Vercel** for image generation and video export in the cloud. Local `.env.local` does **not** apply to Vercel.

---

### When you need **Supabase**

Use Supabase when you want:

- Data saved in the **cloud** (not only in one browser)
- The older **`/projects/*`** workspace (maps, pins, auth, Realtime)
- **Multi-device** access to the same project

**Optional for `/timeline` only.** The simplified timeline does not require Supabase.

---

## Part B — Supabase (step by step)

Skip this entire part if you only use **`/timeline`** locally or on Vercel with **`FAL_KEY`** only.

### B1. Create a Supabase account and project

1. Open [https://supabase.com](https://supabase.com)
2. Click **Start your project** (or **Sign in**)
3. Sign up with GitHub, email, etc.
4. On the dashboard, click **New project**
5. Fill in:
   - **Name** — e.g. `sagasandbox-dev`
   - **Database password** — save this somewhere safe (you need it for direct DB access; the Next.js app uses API keys instead)
   - **Region** — pick one close to you
6. Click **Create new project**
7. **Wait 1–2 minutes** until the project status is healthy (green)

---

### B2. Find your API keys (dashboard names)

1. In the left sidebar, click **Project Settings** (gear icon at the bottom)
2. Click **API** (under Configuration)
3. You will see:

| What you see on screen | Copy into `.env.local` as |
|------------------------|---------------------------|
| **Project URL** (e.g. `https://xxxxx.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon** / **publishable** key (safe for browser) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **secret** key (`sb_secret_...`) — **never** put in client code | `SUPABASE_SECRET_KEY` |

**Optional legacy key:** **service_role** JWT → `SUPABASE_SERVICE_ROLE_KEY` (only if you do not have a secret key; prefer `SUPABASE_SECRET_KEY`).

**Project ref** (short ID in the URL, e.g. `abcdefghijklmnop`):  
**Project Settings** → **General** → **Reference ID**. You need this for `supabase link`.

---

### B3. Paste into `.env.local`

In the repo root:

```bash
cp .env.example .env.local
```

Add (use **your** values, not these placeholders):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SECRET_KEY=your-secret-key-here

FAL_KEY=your-fal-key-here
```

Restart the dev server after saving: `npm run dev`.

---

### B4. Auth — skip for simplified `/timeline`

The **`/timeline`** route does **not** require login.

You only configure Supabase Auth if you use **`/login`** and **`/projects/*`**. Then you would set redirect URLs (see Part D).

---

### B5. Database migrations (simplest paths)

The SQL files live in `supabase/migrations/`. They create tables, buckets, and policies for the **legacy** app.

**Option A — Use the team’s existing project (fastest for collaborators)**

This repo documents a shared project ref: **`vkjbompqitvcxeezjfvp`** (see [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md) and `.cursor/mcp.json`). Ask a teammate for the **URL and keys** — do not commit them to git.

**Option B — Your own new project**

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli)
2. In a terminal, from the repo root:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

`db push` applies migrations in order to your remote database.

**Option C — Manual (no CLI)**

Supabase Dashboard → **SQL Editor** → run each file in `supabase/migrations/` **in filename order** (oldest timestamp first).

Edge functions (legacy exports/webhooks) are separate: see [SETUP_KEYS.md](./SETUP_KEYS.md) §3.

---

### B6. What happens if you skip Supabase entirely?

| Feature | Without Supabase |
|---------|------------------|
| **`/timeline`** cards, reorder, whiteboard | Works — data in **browser only** |
| **Generate image / export video** | Works if **`FAL_KEY`** is set (local or Vercel) |
| **`/projects/*`**, login, cloud storage | Does not work |
| **Data on another computer** | No — unless you export or add Supabase later |

---

## Part C — Vercel (step by step)

There are **two ways** this repo can reach Vercel. Pick the one that matches your role.

---

### Path 1 — GitHub + Vercel dashboard (easiest for beginners)

Use this if **you** own the Vercel project and want the standard “Import from GitHub” flow.

**Note:** This repo’s maintainers may also use **GitHub Actions** (Path 2). If deploys fail or duplicate, ask the team which path is canonical.

#### C1. Put the code on GitHub

1. Create a repo on [github.com](https://github.com) (or use an existing one)
2. Push this project:

```bash
git remote add origin https://github.com/YOUR_USER/sagasandbox.git
git push -u origin main
```

(Use your branch name if not `main`.)

#### C2. Import into Vercel

1. Open [https://vercel.com](https://vercel.com) → sign in (GitHub is fine)
2. Click **Add New…** → **Project**
3. **Import** your GitHub repository
4. Vercel should detect **Next.js**
5. **Node.js version:** set **24** (matches `package.json` `engines.node >= 24`)

#### C3. Environment variables (before or right after first deploy)

Vercel project → **Settings** → **Environment Variables**

| Variable | Required for `/timeline`? | Notes |
|----------|-------------------------|--------|
| `FAL_KEY` | **Yes** | fal.ai image + video on server |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Only for legacy `/projects` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Browser client |
| `SUPABASE_SECRET_KEY` | No | Server + webhooks |
| `NEXT_PUBLIC_SITE_URL` | No for `/timeline` | Yes for legacy fal webhooks + auth |
| `OPENAI_API_KEY` | No | Copilot only |
| `AUTH_DEV_BYPASS_*` | No | Local QA only — avoid on production |

For a **timeline-only demo on Vercel**, you often only need:

```text
FAL_KEY = your-fal-key-here
```

Apply to **Production** (and **Preview** if you test PR URLs).

#### C4. Deploy

1. Click **Deploy**
2. Wait for the build to finish (green checkmark)
3. Open the URL Vercel shows (e.g. `https://sagasandbox-xxx.vercel.app`)
4. Go to **`/timeline`** on that URL

#### C5. Add or fix `FAL_KEY` later

1. **Settings** → **Environment Variables** → add or edit `FAL_KEY`
2. **Deployments** → latest deployment → **⋯** menu → **Redeploy**

Changing env vars does **not** update a live deployment until you redeploy.

---

### Path 2 — This repo uses GitHub Actions (team workflow)

**Plain English:** The project owner connects Vercel once. Deploys run from **GitHub Actions**, not only from clicking “Deploy” in Vercel. **Collaborators** can get preview URLs from **pull requests** without their own Vercel account.

#### How it works

1. Someone pushes a branch and opens a **pull request**
2. The workflow [`.github/workflows/vercel-deploy.yml`](../.github/workflows/vercel-deploy.yml) runs
3. A bot comments a **preview URL** on the PR
4. Merging to **`main`** deploys **production** (e.g. https://sagasandbox.vercel.app)

Native “connect GitHub → auto-deploy on every push” may be **disabled** in this repo; **Actions is the main deploy path**.

#### One-time setup (project owner only)

From [README.md](../README.md) § **One-time setup (project owner)**:

1. Make the GitHub repo **public** (if using Vercel Hobby with collaborators)
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret name | Where to get it |
|-------------|-----------------|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) → Create |
| `VERCEL_ORG_ID` | Vercel → **Settings** → **Team ID** (or personal account ID) |
| `VERCEL_PROJECT_ID` | SagaSandbox project → **Settings** → **General** → **Project ID** |

3. **Environment variables** (`FAL_KEY`, Supabase keys, etc.) still go in the **Vercel project** dashboard — GitHub secrets above are only for *deploying*, not for fal/Supabase keys.

4. Push to `main` or open a PR to confirm the workflow passes.

#### If you are a collaborator

- You need **GitHub** access to the repo
- You **do not** need your own Vercel account for previews
- If deploy checks fail, ask the owner to verify the three GitHub secrets

---

## Part D — Connect Vercel and Supabase (only if using both)

Skip this if you only use **`/timeline`** with **`FAL_KEY`**.

### Auth redirect URLs (only if using `/login`)

Supabase Dashboard → **Authentication** → **URL Configuration**

Add **Redirect URLs**:

```text
http://localhost:3000/auth/callback
https://your-production-domain.vercel.app/auth/callback
```

**Site URL** should match your main app URL (often production).

Not needed for **`/timeline`** without login.

### `NEXT_PUBLIC_SITE_URL` on Vercel

Set to your real public URL, e.g.:

```text
https://your-app.vercel.app
```

Used for auth callbacks and **legacy** fal webhooks (`/api/webhooks/fal`).  
**`/timeline` generate/export** does not need it.

### `/timeline` on Vercel — minimal setup

Often **only**:

```text
FAL_KEY
```

on Vercel → **Redeploy** → test `https://your-url.vercel.app/timeline`.

---

## Part E — Minimal checklist

### Tier 1 — Local demo (you are here)

- [ ] `cp .env.example .env.local`
- [ ] `FAL_KEY=...` in `.env.local`
- [ ] `npm install` && `npm run dev`
- [ ] Open [http://localhost:3000/timeline](http://localhost:3000/timeline)
- [ ] Generate a scene image on a card

**No Vercel. No Supabase.**

---

### Tier 2 — Vercel demo (public URL, timeline only)

- [ ] Code on GitHub (Path 1) **or** team Actions workflow (Path 2)
- [ ] Vercel project exists; Node **24**
- [ ] Vercel env: **`FAL_KEY`** (Production + Preview if needed)
- [ ] Deploy / merge PR → open `https://….vercel.app/timeline`
- [ ] Test generate + export video

**Supabase optional.**

---

### Tier 3 — Vercel + Supabase (full legacy app)

Everything in Tier 2, plus:

- [ ] Supabase project created; keys in `.env.local` and Vercel
- [ ] Migrations applied (`supabase db push` or team project)
- [ ] Auth redirect URLs if using login
- [ ] `NEXT_PUBLIC_SITE_URL` on Vercel (production domain)
- [ ] Edge function secrets if using legacy export/webhooks ([SETUP_KEYS.md](./SETUP_KEYS.md))

---

## Part F — Common confusion

### `.env.local` vs Vercel env vs Supabase secrets

| Place | Used when | Who reads it |
|-------|-----------|--------------|
| **`.env.local`** | `npm run dev` on your machine | Your laptop only (gitignored) |
| **Vercel → Environment Variables** | Hosted Next.js app | Vercel build + server at runtime |
| **Supabase → Edge Functions → Secrets** | Deno functions in `supabase/functions/` | Supabase only — **not** copied from Vercel automatically |

They are **three separate clipboards**. Pasting `FAL_KEY` in one does not fill the others.

---

### “I added `FAL_KEY` locally but production doesn’t work”

Local `.env.local` **never** ships to Vercel.

**Fix:**

1. Vercel → your project → **Settings** → **Environment Variables**
2. Add **`FAL_KEY`** for **Production** (and **Preview** if testing PR URLs)
3. **Redeploy** the latest deployment

---

### “Do I need the Supabase MCP / project ref in `.cursor/mcp.json`?”

**No** for running the app.

`.cursor/mcp.json` with `project_ref=vkjbompqitvcxeezjfvp` is for **Cursor agents** talking to Supabase from the IDE. Optional for humans.

---

### “I set Supabase keys but `/timeline` is empty on another browser”

Expected. Timeline data is in **that browser’s localStorage**, not Supabase, unless you build cloud persistence later.

---

### “Build works locally but Supabase errors on Vercel”

`NEXT_PUBLIC_*` variables are baked in at **build time**.

After adding or changing them on Vercel → **Redeploy**.

---

### Which doc should I read next?

| Goal | Doc |
|------|-----|
| What each key does | [SETUP_KEYS.md](./SETUP_KEYS.md) |
| Webhooks, preview URLs, env matrix | [integrations/vercel-supabase-orchestrator.md](./integrations/vercel-supabase-orchestrator.md) |
| Production demo checklist | [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md) |

---

*Simplified timeline: `/timeline` + `FAL_KEY` is enough for a great local or Vercel demo. Add Supabase when you need cloud data or legacy `/projects`.*
