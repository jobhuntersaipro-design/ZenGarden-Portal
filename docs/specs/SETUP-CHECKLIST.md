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
4. Create a second branch `dev` for local work if you want production data
   untouched; use its strings locally.

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
    "AllowedOrigins": ["http://localhost:3000", "https://portal.lovinghands.my", "https://*.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

4. Leave the bucket private. Never enable public access; the app serves files
   through presigned URLs only.

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
6. Optional: `AUTO_APPROVE_DOMAIN=lovinghands.my` to admit Workspace emails
   without approval.

## 4. Resend

1. resend.com → Domains → Add domain `lovinghands.my` (or a subdomain like
   `mail.lovinghands.my`), region closest to Singapore.
2. Add the DNS records Resend shows (MX + TXT for SPF on the `send`
   subdomain, three DKIM CNAMEs, optional tracking CNAME) at your DNS
   provider. Wait for "Verified".
3. API Keys → Create → *Sending access*, restricted to that domain →
   `RESEND_API_KEY`.
4. `EMAIL_FROM="Loving Hands Portal <portal@lovinghands.my>"`.
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
5. Domains → add `portal.lovinghands.my`, add the CNAME at your DNS provider.
6. Add the production domain to Google redirect URIs (step 3.2) and R2 CORS (step 2.3).

## 7. Local first run (after Phase 01 is merged)

```
cp .env.example .env.local     # fill in every value above
npm install
npm run db:migrate             # creates the schema on Neon
npm run db:seed                # ~400 POs, 11 buyers, 12 products, you as super admin
npm run dev
```

Sign in with Google at http://localhost:3000/signin. You should land on the
dashboard with data.
