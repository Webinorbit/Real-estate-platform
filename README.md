# WebInOrbit Real Estate Dynamic Platform

A multi-tenant, white-label real estate SaaS. One deployment serves many clients, each with its own domain, brand, listings, team and leads.

**Headline features**

| | |
|---|---|
| **Map-based search** | MapLibre + OpenStreetMap. Live clustering, search-as-you-move, draw-an-area, price/beds/type/amenity filters, list and map in sync, saved searches, favourites, compare. |
| **Dynamic 360° virtual tours** | Equirectangular scenes linked by hotspots, a live mini-map with a direction cone (or a floor plan with a "you are here" marker), share/QR/embed, gyroscope mode, and an external-tour fallback (Matterport, Kuula…). |
| **Broker routing engine** | Rule-based lead routing (listing type, property type, price, city, locality, language, source, drawn map area) with round-robin, least-loaded, weighted and listing-agent strategies, working hours, territories, capacity, SLA timers, automatic reassignment, escalation, a simulator and a full audit trail. |
| **White-label per client** | Custom domain or subdomain, logo, colours, fonts, hero imagery, currency and units, per-client analytics snippet, optional "remove branding". |
| **Admin and broker workspace** | Dashboard with charts, lead inbox and kanban pipeline, property CRUD with drag-to-sort photo uploads and a map pin picker, tour editor, routing console, team management, CSV import, plans and limits. |

Stack: **Next.js 16** (App Router, JavaScript) for the website and admin UI, **FastAPI** (Python 3.12, SQLAlchemy 2, Pydantic, Alembic) for the whole backend, PostgreSQL, Tailwind CSS v4, Framer Motion, MapLibre GL, Photo Sphere Viewer, dnd-kit, Recharts.

```
Browser ──> Next.js (UI, SEO pages, thin server actions) ──> FastAPI (auth, tenancy, routing engine, SLA worker, uploads) ──> PostgreSQL
```

Next.js holds no business logic or database access: it renders pages from the API and forwards `/api/*` (and `/uploads/*`) to FastAPI together with the public host and the session cookie.

---

## Quick start (local)

Requirements: Node 20+, Python 3.12+ and PostgreSQL 14+ (or let the bundled helper start a project-local one).

```bash
npm install
npm run api:setup               # creates backend/.venv and installs the Python dependencies
cp .env.example .env            # set AUTH_SECRET (openssl rand -base64 32) and CRON_SECRET
npm run db:start                # optional: project-local Postgres on :5433 (data in .pgdata)
npm run db:migrate              # create / upgrade tables (Alembic)
npm run db:seed                 # three demo clients with listings, tours, brokers, rules and leads
npm run dev:all                 # FastAPI on :8000 + Next.js on :3000  (or run `api:dev` and `dev` separately)
```

API docs (Swagger) are served at http://localhost:8000/api/docs.

### Admin login

`db:seed` creates a single platform admin (super admin) from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`; it refuses to run without them. No demo owner or broker accounts are created, and the login page shows no demo shortcuts.

### Demo logins (local dev and tests only)

Run the seed with `SEED_DEMO_USERS=true` to also create the demo owner and broker accounts below (the backend test suite needs them; run it against a local database, never a hosted one). All passwords are `demo1234`, and the platform admin becomes `super@webinorbit.demo`.

| Client | Plan | Owner login | Broker login |
|---|---|---|---|
| Skyline Realty (Mumbai, luxury) | Enterprise | `owner@skyline.demo` | `priya@skyline.demo` |
| Heritage Homes (Bengaluru) | Pro | `owner@heritage.demo` | `kavya@heritage.demo` |
| Urban Nest (rentals) | Starter | `owner@urbannest.demo` | `simran@urbannest.demo` |
| WebInOrbit staff | Super admin | `super@webinorbit.demo` | |

Switch the brand on a single host while developing with `http://localhost:3000/?tenant=heritage` (also `urbannest`, `skyline`; `?tenant=` clears it). Or use subdomains: `http://heritage.localhost:3000`.

Admin lives at `/admin`. Brokers only see their own leads; owners and admins see everything. The super admin additionally gets a **Clients** page to onboard and manage tenants and flip plans live (great for sales demos).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run api:setup` | Create the Python virtualenv and install dependencies |
| `npm run api:dev` / `api:start` | Run FastAPI (auto-reload / production) |
| `npm run dev:all` | FastAPI and Next.js together |
| `npm run db:migrate` | Apply Alembic migrations (databases created by the earlier Prisma version are stamped, not re-created) |
| `npm run db:seed` | Recreate the demo tenants (only touches the demo tenants) |
| `npm run tenant:create -- --name "Acme" --slug acme --owner-email o@acme.com --plan PRO` | Onboard a client from the CLI |
| `npm run assets:demo` | Re-download demo photos and panoramas |
| `npm test` | Backend test suite (pytest): routing engine, tenant isolation, public and admin API |

---

## How tenancy works

* **Resolution order** (`backend/app/deps.py`): `?tenant=` override cookie (dev / demo only) → exact `customDomain` match → `<slug>.ROOT_DOMAIN` → `DEFAULT_TENANT_SLUG` → first tenant. Next.js forwards the visitor's host in the `x-tenant-host` header.
* **Isolation**: every request gets a database session bound to its tenant (`backend/app/db.py`). SQLAlchemy events add `tenantId = :tenant` to every SELECT/UPDATE/DELETE on tenant-owned models, stamp new rows and refuse cross-tenant writes, even if a query forgets its own filter (covered by `backend/tests/test_tenant_scope.py`). Sessions are bound to the tenant they were issued for.
* **Theming**: each tenant's colours and fonts are injected as CSS variables on `<html>`, so every component re-themes automatically.
* **Plans** (`backend/app/plans.py`, mirrored in `src/lib/plans.js` for UI hints) gate features and limits in the UI and in every API endpoint: listings and broker seats, tours, routing rules, SLA automation, CSV import, custom domains, webhooks, branding removal.

| | Starter | Pro | Enterprise |
|---|---|---|---|
| Listings | 25 | 250 | Unlimited |
| Broker seats | 3 | 25 | Unlimited |
| 360° tours | – | Yes | Yes |
| Routing rules and simulator | – | Yes | Yes |
| SLA timers and reassignment | – | Yes | Yes |
| CSV import | – | Yes | Yes |
| Custom domain | – | Yes | Yes |
| Webhooks | – | – | Yes |
| Remove branding | – | – | Yes |

---

## Configuration

Copy `.env.example`. The important variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (API) |
| `API_URL` | Where Next.js reaches FastAPI (default `http://127.0.0.1:8000`; `http://api:8000` in Docker) |
| `AUTH_SECRET` | Signs session cookies (API only). 32+ random characters. **Required** |
| `APP_ENV` | `production` makes session cookies `Secure` and tightens login rate limits |
| `ROOT_DOMAIN` | Base domain for `<slug>.ROOT_DOMAIN` tenant hosts (e.g. `homes.webinorbit.com`) |
| `DEFAULT_TENANT_SLUG` | Tenant served for unknown hosts (demo / single-client installs) |
| `STORAGE_DRIVER` | `local` (default, `UPLOAD_DIR`) or `s3` (AWS S3, Cloudflare R2, MinIO) with the `S3_*` variables |
| `CRON_SECRET` | Bearer token for `/api/cron/sla` |
| `ENABLE_SLA_WORKER` | `true` runs the in-process SLA worker every minute (long-lived servers) |
| `RESEND_API_KEY`, `MAIL_FROM` | Lead notification email (otherwise logged to the console) |
| `NEXT_PUBLIC_TILE_URL` | Your own tile provider (see licensing note below) |
| `NEXT_PUBLIC_ANALYTICS_SRC` | WebInOrbit Analytics script; each tenant sets its own site ID in Admin → Branding & settings → Integrations |
| `NOMINATIM_URL` | Geocoder (address search and CSV geocoding) |
| `ALLOW_TENANT_SWITCH` | Allow `?tenant=` switching in production (demo environments only) |

### Map tiles and OpenStreetMap licensing

The default basemap uses the public OpenStreetMap tile server, which is **for light use only** and must be attributed (the attribution control is included). Before launching a client with real traffic, set `NEXT_PUBLIC_TILE_URL` to a provider you have a licence for (MapTiler, Stadia Maps, Thunderforest, or self-hosted tiles). The same applies to `NOMINATIM_URL` and the Overpass endpoint used for "nearby places": use a paid or self-hosted instance in production. The satellite style uses Esri World Imagery; check its terms for your use before enabling it commercially.

### Uploads

Photos and panoramas are re-encoded with Pillow on upload (EXIF stripped, photos ≤ 2400 px as WebP, panoramas ≤ 6144 px as JPEG, with a cropped thumbnail). With `STORAGE_DRIVER=local`, files are written to `UPLOAD_DIR` on the API host and served through `/uploads/...` (FastAPI serves them; Next.js rewrites to it): mount that directory as a persistent volume. For multi-instance or serverless deployments use S3-compatible storage.

### SLA worker

Leads get a first-response deadline when the plan includes SLA automation. If a broker does not act in time, the lead is reassigned (never to a broker who already had it) up to the tenant's maximum, then escalated to the owner. Two ways to run the check:

* Long-lived API (VPS, Docker, Railway, Fly): keep `ENABLE_SLA_WORKER=true`. A background thread in FastAPI runs the check; a Postgres advisory lock makes it safe with several API instances.
* Scheduler instead: set `ENABLE_SLA_WORKER=false` and call `GET /api/cron/sla` every minute with the header `Authorization: Bearer $CRON_SECRET` (cron, GitHub Actions, cron-job.org).

---

## Deployment

### Docker (recommended, one command)

```bash
export AUTH_SECRET=$(openssl rand -base64 32) CRON_SECRET=$(openssl rand -hex 16)
docker compose up --build -d
docker compose exec api python -m app.cli seed      # optional demo data
```

Three services: `db` (PostgreSQL), `api` (FastAPI, applies Alembic migrations on start) and `web` (Next.js on :3000). Uploads persist in the `uploads` volume (mounted on the API), the database in `pgdata`. Put a reverse proxy with TLS (Caddy, Nginx, Traefik) in front of `web`, and forward the original `Host` header so tenants resolve correctly. Only `web` needs to be public; `api` is reached internally.

### VPS without Docker

```bash
npm ci && npm run build
npm run api:setup && npm run db:migrate
npm run api:start &            # uvicorn on :8000 (use systemd / pm2 to supervise)
npm start                      # Next.js on :3000, behind Nginx/Caddy
```

### Managed platforms

The two services deploy independently: run the API anywhere that runs a Python container (Railway, Fly, Render, ECS) with a managed Postgres, S3-compatible storage (`STORAGE_DRIVER=s3`, the container filesystem is ephemeral) and `AUTH_SECRET`; deploy the Next.js app (Vercel or a container) with `API_URL` pointing at the API (set it at build time too, `/uploads` rewrites are compiled in). Add the wildcard `*.yourplatform.com` and each client's custom domain to the web project, and set `ROOT_DOMAIN` on the API.

### Custom domains

For each client: in **Admin → Branding & settings → Domain** (or the Clients page) enter their domain, have them create a `CNAME` to your platform host, and add the domain to your hosting provider so it issues TLS. The app resolves the tenant from the request host automatically.

---

## Client onboarding checklist

1. **Create the client** — Clients page (super admin) or `npm run tenant:create`. Note the generated owner password and send it securely.
2. **Brand it** — logo, colours, fonts, tagline, hero images, contact details, WhatsApp number, social links.
3. **Set the market** — currency, area unit, default map city and zoom.
4. **Add the team** — brokers with languages, areas, working hours, capacity and (optionally) a drawn territory.
5. **Load inventory** — CSV import (Pro+) or add listings by hand. Drop the pin precisely and upload at least 8 photos per listing.
6. **Add tours** — upload equirectangular 360° photos, link rooms with arrows, place scenes on the floor plan or map, set north, publish.
7. **Configure routing** — start with one rule per business logic (e.g. luxury, rentals, commercial), test in the simulator, and set the SLA minutes.
8. **Connect integrations** — analytics site ID, webhook to the client's CRM (Enterprise), mail provider for lead alerts.
9. **Go live** — connect the custom domain, check `/sitemap.xml` and `/robots.txt`, submit the sitemap to Google Search Console, send a test enquiry end to end, and confirm the broker received it.
10. **Hand over** — walk the owner through the dashboard, pipeline and routing audit log. Share the plan limits and how to upgrade.

---

## Project layout

```
backend/app/            FastAPI app: routers (public, auth, admin_*), models, tenancy, plans, routing engine and SLA worker, storage, CLI
backend/migrations/     Alembic (baseline = original schema)
backend/tests/          pytest suite
scripts/                db helper, dev runner, demo asset fetcher
src/app/(site)/         public site: home, search, property, tours, brokers, favourites, compare, contact
src/app/admin/          login and the admin/broker panel (server components + thin server actions)
src/app/api/[...path]/  same-origin proxy from the browser to FastAPI
src/app/tour, embed/    full-screen and embeddable tour viewer
src/components/         ui kit, site, map, tour, admin
src/lib/                API client, tenant/auth helpers, plans, formatting, filters, geo
docs/                   product page copy, pricing sheet and sales demo script
```

## Security notes

* Sessions are signed JWTs (issued by FastAPI) in an HTTP-only, same-site cookie, bound to the tenant that issued them.
* Every admin endpoint re-checks the session, role and plan in FastAPI; the Next.js proxy gate is only a convenience.
* Uploads are re-encoded server-side; remote image imports are SSRF-guarded (HTTPS only, public hosts only, size capped).
* Public forms are rate limited per IP. The limiter is in-memory: swap `backend/app/rate_limit.py` for Redis when you scale beyond one API instance.
* Change every demo password and secret before production, and run `db:seed` only on non-production databases.

## Testing

```bash
npm test          # pytest: routing engine, tenant isolation, public + admin API, property validation, import
```

The API tests run against the seeded development database (they create and delete their own rows).
