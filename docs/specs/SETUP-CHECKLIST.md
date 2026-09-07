# Setup Checklist — things only the owner can do

Everything here needs a login. Do these in order; each step names the env
var its value goes into. Put values in `.env.local` locally and in Vercel
project settings for Preview and Production.

## 1. Neon (Postgres)

1. console.neon.tech → New project → name `loving-hands-portal`, region Singapore
   (`ap-southeast-1`), Postgres 17.
2. Connection details → copy the **pooled** string (host contains `-pooler`)
   → `DATABASE_URL`.
3. Toggle "Connection pooling" off in the same dialog → copy the **direct**
   string → `DIRECT_URL`.
4. Create a second branch `development` as a child of `production` for local
   work. Use its pooled + direct strings in `.env.local`; keep the
   `production` pair for Vercel only. Never point `.env.local` at
   `production` — `npm run db:seed` writes ~400 demo POs.
   Refresh it later with `neon branches reset development --parent`
   (this discards the branch's data, so re-seed afterwards).

## 2. Cloudflare R2

1. dash.cloudflare.com → R2 → Create bucket `loving-hands-portal`, location
   APAC. → `R2_BUCKET`.
2. R2 → Manage R2 API tokens → Create token, permission *Object Read & Write*,
   scoped to this bucket → copy Access Key ID → `R2_ACCESS_KEY_ID`, Secret →
   `R2_SECRET_ACCESS_KEY`. The account ID shown on the R2 overview page →
   `R2_ACCOUNT_ID`.
3. Bucket → Settings → CORS policy → paste, replacing the origins with your
   real ones (localhost plus the Vercel domains):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://www.lovinghandsportal.com", "https://lovinghandsportal.com", "https://*.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. Leave the bucket private. Never enable public access; the app serves files
   through presigned URLs only.

### 2.1 A separate bucket for development — required

**One bucket shared by development and production is dangerous, and it has
already cost real data.** On 2026-09-07 a maintenance script listed the objects
in the bucket, deleted every key not referenced by a `Document` row, and used
the *development* database as its reference. Production's documents are
referenced only in the *production* database, so all of them looked like
orphans and were deleted. R2 has no versioning and no undelete, so they were
unrecoverable. The purchase orders themselves survived — only the original
scans were lost.

Two buckets make that class of mistake impossible rather than merely
discouraged.

1. R2 → Create bucket `loving-hands-portal-dev`, same location.
2. Give it its own CORS policy. Development never runs on the production
   domain, so the origins are narrower:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://*.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. The API token from step 2.2 is scoped to a single bucket, so either widen it
   to both buckets or create a second *Object Read & Write* token scoped to the
   dev bucket and use that one locally.
4. In `.env.local`, set `R2_BUCKET=loving-hands-portal-dev`. In Vercel, leave
   Production on `loving-hands-portal`. Preview should use the dev bucket too.
5. The dev bucket starts empty. That changes nothing: `prisma/seed.ts` writes
   `Document.r2Key` values without uploading anything, so seeded documents
   already fail to preview. Only files you upload yourself will resolve.

**While you are in `.env.local`, check it defines `DATABASE_URL` and
`DIRECT_URL` exactly once.** A duplicate pair means the last one silently wins,
and you cannot tell from the top of the file which database a script will hit.

### 2.2 Lock the purchase order documents — required

A bucket lock refuses deletes and overwrites for objects under a prefix. It is
the only mechanism that would have prevented the incident above: **an
object-scoped API token cannot add, change or remove a lock rule**, so no
script running with the app's credentials can get past one.

```bash
npx wrangler r2 bucket lock add loving-hands-portal \
  protect-po-documents po/ --retention-days 90
```

Check it, and confirm nothing else is locked:

```bash
npx wrangler r2 bucket lock list loving-hands-portal
```

What this does and does not do:

- **Applies to existing objects too**, not only new ones.
- **Blocks overwrites as well as deletes.** That is safe here: `documentKey()`
  names every object after its `Document` id, so the app never overwrites one.
- **Takes precedence over lifecycle rules**, so no future expiry rule can
  quietly remove a document early.
- **A rule can be removed by an account-level token**, so this is a guard
  against accidents and automation, not a compliance hold. That is the right
  level here — the failure it prevents is a script, not an adversary.
- **The dashboard refuses to empty the bucket** while any rule is active.

**It changes one behaviour in the app, by design.** "Delete upload" on the
Purchase orders list removes the document row and then deletes the R2 object.
Under a lock that object delete fails — and `deleteUpload` already logs the
failure and carries on rather than reporting an error, because the row is what
the user asked to remove. So the upload still disappears from the list; its
file simply survives until the lock lapses. That is the trade a lock buys, and
it is the right way round.

Do **not** lock `avatars/`. Those are replaced routinely, they are not records,
and a lock there would leave an object behind on every picture change.

## 3. Google OAuth

1. console.cloud.google.com → new project `Loving Hands Portal` → APIs &
   Services → OAuth consent screen → Internal if you have Google Workspace,
   otherwise External with the ops team's emails as test users until published.
2. Credentials → Create OAuth client ID → Web application. Authorised
   JavaScript origins: `http://localhost:3000`, your production URL.
   Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google`
   and `https://<prod-domain>/api/auth/callback/google` (add each Vercel
   preview domain you use, or test previews with password sign-in).
3. Client ID → `AUTH_GOOGLE_ID`, Client secret → `AUTH_GOOGLE_SECRET`.
4. `AUTH_SECRET` = output of `openssl rand -base64 32`. Different value per environment.
5. `SEED_SUPER_ADMIN_EMAIL` = the Google email you will sign in with. The seed
   creates this user as SUPER_ADMIN so you are never locked out.
6. Optional: `AUTO_APPROVE_DOMAIN=lovinghandsportal.com` to admit Workspace emails
   without approval.

## 4. Resend

1. resend.com → Domains → Add domain `lovinghandsportal.com` (or a subdomain like
   `mail.lovinghandsportal.com`), region closest to Singapore.
2. Add the DNS records Resend shows (MX + TXT for SPF on the `send`
   subdomain, three DKIM CNAMEs, optional tracking CNAME) at your DNS
   provider. Wait for "Verified".
3. API Keys → Create → *Sending access*, restricted to that domain →
   `RESEND_API_KEY`.
4. `EMAIL_FROM="Loving Hands Portal <portal@lovinghandsportal.com>"`.
5. Until the domain verifies, `EMAIL_FROM=onboarding@resend.dev` works but
   only delivers to your own Resend account email.

## 5. Anthropic

1. console.anthropic.com → API keys → Create key `loving-hands-portal` →
   `ANTHROPIC_API_KEY`.
2. `EXTRACTION_MODEL=claude-sonnet-5`. Set a monthly spend limit on the
   workspace; a PO extraction costs roughly one to three cents.

## 6. Vercel

1. vercel.com → Add New Project → import the GitHub repo. Framework Next.js.
2. Build command: `prisma generate && prisma migrate deploy && next build`.
   Install command default. Node 22.
3. Settings → Functions → confirm Fluid compute is on (default for new
   projects) so `maxDuration = 120` on the extraction route is honoured. On
   Hobby the cap is 300 s with Fluid, on Pro 800 s.
4. Environment variables: every var from `.env.example`, for Production and
   Preview. `APP_URL` = the deployed origin for each environment.
5. Domains → add `lovinghandsportal.com`. It is an apex domain, so add the
   A record Vercel shows (or an ALIAS/ANAME if your DNS provider supports it) —
   a CNAME is not legal at the zone apex. Add `www` as a CNAME redirect if you want it.
6. Add the production domain to Google redirect URIs (step 3.2) and R2 CORS (step 2.3).

## 7. Local first run (after Phase 01 is merged)

```
cp -n .env.example .env.local  # -n: never clobber an existing .env.local
                               # then fill in every value above
npm install
npm run db:migrate             # creates the schema on Neon
npm run db:seed                # ~400 POs, 11 buyers, 12 products, you as super admin
npm run dev
```

Sign in with Google at http://localhost:3000/signin. You should land on the
dashboard with data.
