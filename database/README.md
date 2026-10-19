# Database PostgreSQL / Neon

`schema.sql` remains the authoritative relational baseline; migration files
`001-live-workspace.sql` through `015-versioned-floor-plans.sql` are present in
this checkout. Source presence does not mean a migration is applied to a live branch.
There is no opaque stored workspace snapshot or browser persistence fallback.
Runtime composition lives in `src/server/{database,workspace,public,public-data}.ts` and `media/`.

## Current state — 19/10/2026

Neon branch **`production` (`br-tiny-butterfly-b3uuw92p`)** is the production
database and local `.env.local` target. Local and stage2 Worker writes are real
production writes, not sandbox writes. On 19/10/2026, the owner confirmed this is
the intended Worker database; the `DATABASE_URL` secret was set from the verified
local production connection. The obsolete `lgc-bot-test` branch was removed after
the Worker was moved. Wrangler binds the shared bucket names `mall-documents` and
`mall-assets`; Neon Auth and media-function runtime targets are separate and are
not proven by the database connection.

Owner confirms this project is **not deployed on Vercel**. The current release
target is the existing noindex Cloudflare stage2 Worker; do not infer deployment
from domain responses or HTTP headers.
See the [deployment runbook](../docs/deployment.md).

On 19/10/2026, the local runtime and direct migration connection were verified
against the same Neon endpoint; `current_setting('neon.branch_id')` returned the
production branch ID above. Its migration ledger contained **001–013** with
matching local checksums. `npm run db:migrate` then applied **014–015** and the
approved floor-plan seed. A post-migration public projection read and contract
parse returned 6 floors, 81 slots and 22 shared plan features. No customer or
lease transactions were seeded. Migration confirmation is not evidence that the
latest application source has been released to the Worker.

The Cloudflare Worker has a separately managed runtime `DATABASE_URL`. On
19/10/2026 it was updated from the verified local production connection, which
had already been checked with `current_setting('neon.branch_id')`. The public
projection was then verified against the Worker after release. The Worker does
not expose its connection string or branch identifier; the deployment record
documents the secret source without printing the credential.

Migration **014** was applied to the verified local production branch. It appends provisional
architectural-reference versions for the 22 floor 1/2 slots, retaining their
history and availability/lease state. It stops if the current inventory differs
from the expected slot catalog or includes surveyed, verified, published or
validated-plan data. The migration guard passed on that branch. The architectural
PDF remains an internal source and is not copied to public media.

Migration **015** is applied to the verified local production branch. Current
`src/server/admin-screens.ts` and `src/server/public-data.ts` query its
`plan_versions` canvas/source columns and `leasing.plan_features`; the migration
runner also seeded those fields and features. Therefore every database used by
this source must have 015 and the reference seed. Verify the exact runtime branch
before any separate stage2 migration; build/deploy does not migrate.

`011-metadata-only-leases.sql` replaces the mandatory contract-document
predicate with recorded lease metadata, retaining inventory/period/exclusivity
rules and old private document links. `012-contact-notification-outbox.sql`
adds a durable RLS-protected source outbox for newly committed contacts only.
Apply both before releasing this application to any other runtime DB; build/deploy
does not migrate. See [notification architecture](../docs/notification-architecture.md)
for cron, keys and the separate Render DB. No historical lead replay or file deletion.

Application schemas `leasing` and `row_audit` were reset; baseline+migrations
**001–009** were applied during reset, then migration **010** was applied during
the current production preparation. The approved catalog has **6 floors / 81
slots**; no real customer/lease/request/lead/appointment data was seeded.
The root allowlist and approved Neon logo were restored. Provider Auth/storage
were preserved; only the root Auth user remains. Root sign-in returned HTTP 200.

### Reset recovery evidence

- Pre-reset production snapshot: `snap-misty-sea-b3tgf6is`,
  `before-single-production-reset-20261015`; expires **2026-10-22T23:59Z**.
- Private dump of the former secondary application's data:
  `/Users/suntech/Library/Application Support/LeGrande/backups/2026-10-15-single-production/stage2-application.dump`
  (**298,708 bytes**, mode **0600**). This is an operator-local backup, not a
  committed artifact or a second running database.
- The reset did not wipe provider Auth/storage objects. A clean application DB
  does not assert that all provider buckets are empty. Restore is an explicit,
  reviewed operator action, never an app startup/build step.

Migration 005 separated root from ordinary staff. Migration 006 revokes the old
Google-root grant and provisions `root@legrandecentre.vn`. The root password is
operator-issued with owner approval, stored in private gitignored files with mode
0600; it is never included in a migration or bundle.

Admin/root create a staff email and assign Admin or Editor inside `/admin/`.
The employee then creates a password at `/admin/` and completes Neon Auth email
verification. Signup alone never grants workspace access: a matching, active
allowlist and role assignment are required. Root stays in its separate allowlist
and is omitted from staff projections. Neon Auth is a backend service; staff do
not use Neon Console.

After consolidation, root password sign-in returned HTTP 200. Earlier local
production-backed sign-in also reached the workspace, read six floors/81 slots,
survived reload and ended in API 401 after logout. Those earlier observations do
not verify mail delivery/recovery or the current private-media Worker path.

The noindex Worker target is `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev`.
Its runtime `DATABASE_URL` targets `production`; Wrangler no longer carries a
branch-name label. Owner confirms there is no Vercel deployment. `npm run deploy`
targets stage2; record its release/version and runtime DB in the
[deployment runbook](../docs/deployment.md).
Private cache R2 `le-grande-centre-stage2-next-cache` and D1
`le-grande-centre-stage2-next-tags` keep the stage2 suffix. Private PDFs stay in
`mall-documents`. See [readiness](../docs/backend-readiness.md) for cache and
Worker CPU-limit evidence.

## Operator configuration and migration

Use only gitignored **`.env.local`** for local app/operator commands. The canonical
loader `scripts/load-local-env.mjs` overrides inherited values with this file;
there is no multi-profile setup. Runtime uses pooled `DATABASE_URL`; migrations
require **`DATABASE_URL_UNPOOLED`** for the direct connection and do not rewrite
the pooled variable.

```sh
npm run dev -- --port 3000
# After a standalone build:
npm start
# Review the verified canonical DB target before this operator action:
npm run db:migrate
# Set ROOT_ADMIN_PASSWORD privately in .env.local before this operator action:
npm run auth:set-password -- root@legrandecentre.vn
# Build and deploy the existing Worker; no environment-specific aliases:
npm run deploy
```

These commands load `.env.local` where appropriate; do not pass Node `--env-file`
to spawn Next dev. Never print/commit connection strings, passwords or cookie
secrets. `auth:set-password` updates an existing provider identity; it is not a
staff invitation or permission grant. Keep any configured password prefix aligned
with the runtime. Worker secrets are supplied separately at runtime, not bundled.
Migration is not a build/CI/deploy step.
The runner initializes the baseline only when absent, checks applied migration
hashes and seeds approved brochure content idempotently. Do not splice baseline SQL
or delete `leasing_runtime` to bypass provider branch limitations.

Only a verified managed-auth issuer/subject/email may bind the configured owner
allowlist. Identity mismatch, disabled user, revoked assignment or allowlist fails
closed; signup does not create administrator permission.

Import `media/client-reference/legacy/logo-without-text.png` only after independently
verifying the real Neon object: `importApprovedLogo(connectionString,
{publicUrl, bytes, sha256})`, or CLI variables `APPROVED_LOGO_URL`,
`APPROVED_LOGO_BYTES`, `APPROVED_LOGO_SHA256`. Static/R2/browser branding fallback is
not registered. Existing metadata that differs from verified bytes/hash is rejected.

## Invariants

- Admin/write paths use a request-local Neon Pool and one pinned transaction client.
  Uncached public reads use one Neon HTTP transaction with four batched statements:
  runtime role, actor, property share lock, and a public-only projection. Both keep
  `leasing_runtime` (non-owner/NOBYPASSRLS), actor context and property serialization;
  application authorization additionally resolves/rechecks active staff scope.
- Public rendering caches successful projections for 60-second revalidation;
  post-commit mutation invalidation awaits the configured D1 tag adapter on Workers
  before success. Three authenticated mutation/API/SSR/restore rounds passed.
  Existing browser tabs/prefetches are not pushed updates. Intake bypasses this cache.
  Cache/R2/D1 are not authoritative for writes or authorization.
- Property serialization, revision CAS, actor-scoped idempotency receipt and outcome
  audit commit together. Successful receipt replay returns current projection
  without mutating twice; mismatched key reuse fails.
- Organizations/contacts/inventory versions/members, requests/holds/leases,
  appointments/documents/receipts/audit remain relational. Private fields never enter
  public DTOs. Company category is a **derived UI projection**, not a new DB column:
  recorded lease → Đang thuê; else unexpired active hold → Đang giữ chỗ; else
  submitted/reviewing request → Đang tư vấn; else Chưa thuê.
- Diagram coordinates are labelled brochure references, not surveyed polygons.
  Same-row rectangular boundaries are source-labelled connections, not permission
  to remove walls; gaps/irregular outdoor geometry are not invented connections.
- Rental recording uses actor/time/company/space/period metadata; original contracts
  are stored internally outside this app. No mandatory PDF, eSign or signature
  certification. Historical private document links/bytes remain retained.
- PDF starts quarantine. Authorized **external manual review** records reviewer,
  time/note/seal; `scan_state` stays pending, no antivirus-clean claim. Byte signature
  checks are not antivirus. Retention/lease/plan links and selected logo block delete.
- Public contact commits lead/intake/cooldown/idempotency/audit **and source outbox**
  together, not a fabricated company, hold, booking or confirmed appointment.
- `leasing.contact_notification_outbox` is website-owned; the bot registry/queue
  lives in a separate Neon DB. Render never receives website DB credentials.
  `public:intake` can enqueue; only `system:notification-dispatch` reads/updates
  source rows through RLS. Existing receipts are not backfilled.
- Dispatcher claims up to5 channel jobs with180second leases/`SKIP LOCKED`,
  closes transactions before network, tries up to3 times/batch (40seconds each)
  with stable `contact:<intake-id>:<channel>` key/payload. Only a matching-channel
  valid200/202 receipt clears that source job. All3 failures retain it with
  persistent30second–1hour delay for later cron. Gmail failure/recovery must not
  block or resend successful Zalo, and vice versa. Forwarded means Render accepted
  responsibility, not final recipient delivery; provider ACK/crash is at-least-once.

## Owned disposable local PostgreSQL regression

Install PostgreSQL binaries on the local machine; **`postgres`, `initdb`, and
`pg_ctl` must be on `PATH`**. For example on macOS:

```sh
brew install postgresql@17
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
npm run test:database
```

Do not start or point the runner at an existing Homebrew database service. The
runner creates a new empty cluster/data directory and random database/user/password
on an available loopback-only TCP port. It passes a sanitized environment without
live DB/Auth/media credentials, verifies its ownership manifest/nonce and local
endpoint, applies baseline+migrations+approved seed twice, then runs relational
workspace/public regression. Approved logo metadata is an offline fixture; this
test does not fetch live Neon bytes or prove object delivery.

Cleanup stops and removes **only that invocation's owned cluster**. It does not
create/clone/delete Neon branches, require Neon CLI/project permissions, load the
production `.env.local`, or touch a running database service. Do not run
`tests/live-workspace.test.ts` manually against a live workspace.

Latest parent-observed owned local PostgreSQL regression: **5 passed**; website
admin suite **51 passed / 2 skipped**, typecheck and Next/OpenNext builds passed.
These checks used controlled fixtures/owned DBs, not live production delivery;
this documentation update ran no checks. Historical checks and Worker media limits
remain in [readiness](../docs/backend-readiness.md).
Current Worker release evidence and production contact-to-group acceptance remain
separate launch gates.

## Versioned floor-plan projection

`leasing.plan_versions` owns the coordinate system, canvas dimensions, reference
source, and public exposure state for a floor. Slot shapes stay versioned on
`leasing.slot_versions.geometry`; lobby, corridor, void, and other shared shapes
live in `leasing.plan_features` for the same plan version. The one-time import
reference is `database/seeds/floor-plans.json`; UI readers do not import geometry
from brochure TypeScript.

Public map queries select only `reference` or `published` plan versions and return
the map geometry, public slot code, area, status, and public labels. Internal plan
versions, source notes, tenant/company data, and contract data are excluded. The
shared `FloorPlanMap` validates numeric geometry against its declared canvas before
rendering it. The runtime role can read plan versions/features but cannot alter or
publish them; those transitions remain migration/owner operations until a reviewed
map-publication workflow is added. Imported diagrams remain explicitly marked as
reference drawings, not surveyed polygons. Public projections omit the architectural
source file name/sheet for floors 1–2.

Migration `015-versioned-floor-plans.sql` and the approved reference seed are
applied on the verified local production branch. They are not evidence of a
stage2 migration or Worker deployment; verify that runtime DB separately before
releasing this source there.
