# Backend structure — phase 2

Ứng dụng đã chuyển từ browser demo sang Next SSR/OpenNext với Neon Auth/PostgreSQL và Neon/R2 media thật. Không còn folder-only preparation, demo auth hoặc IndexedDB persistence fallback. Trạng thái triển khai/bằng chứng: [readiness](backend-readiness.md).

## Cấu trúc

```text
src/
  app/
    admin/                 # Neon Auth UI + protected workspace
    api/auth/              # managed auth proxy
    api/admin/             # session, screens, collections, commands, paged media
    api/public/website/    # public-only projection
    api/contact/           # live lead/intake, not booking
  features/admin/
    http-repository.ts     # browser -> same-origin authenticated API
    use-admin-data.ts      # UI state, no local persistence fallback
    session.ts             # local cookie hydration; explicit-action renewal only
    memory-cache.ts        # private60s keyed cache, dedupe, abort/invalidation
  features/contact/        # business fields + shared live survey submission
  shared/admin/            # DTO/command contracts and pure models/policies
  server/
    auth.ts                # local signed-cookie verification; provider only at refresh
    admin-session.ts       # signed900s identity/role cookie, expiry precommit
    admin-screens.ts       # finite screen projections and related page labels
    database.ts            # request-local Pool, actor/runtime role/RLS, allowlist
    workspace.ts           # relational reads/commands, CAS/receipts/audit
    public.ts              # approved projection + durable intake/cooldown
    contact-input.ts       # server trust-boundary parser
    public-leasing.ts      # DB catalog -> public display
    media/
      validation.ts        # bounded ingress, types, dimensions, ranges
      prepare.ts           # raster decode/re-encode, PDF unchanged
      repository.ts        # ownership, ledger, quarantine/review, retention
      storage.ts           # trusted Neon origin calls, R2 bindings/inventory
      neon-origin.ts       # S3 signing executed at trusted storage origin
      neon-function.ts     # x-secret protected known-key image storage origin
database/
  schema.sql               # relational baseline
  migrations/              # 001–015 source evolution; see DB guide for live status
scripts/
  migrate-database.ts      # operator migrations + approved project seed
  dev-live.mjs             # canonical .env.local via loader, then Next dev
  load-local-env.mjs       # local values override inherited shell values
  test-live-database.mjs   # owned disposable local PostgreSQL, no Neon branch
  build-cloudflare.mjs     # prevent standard envfiles entering Worker bundle
packages/
  backend/                 # @shared/backend private pinned submodule
  ui/                      # @mall/ui private pinned submodule
archives/3d-model-mall/     # preserved source only, excluded from app build
```

Generated project media catalog contains read-only approved public assets, not demo customers/contracts, quota simulation or persistence. App server may read the generated catalog; it does not import a browser demo repository. Catalog file paths are not authority for cloud bytes/quota.

## Boundaries

- Shared types/pure models do not import React, DB driver or secrets. No aggregate AdminSnapshot contract or production workspace endpoint.
- Warm API identity comes from a locally verified signed HttpOnly/Secure cookie (fixed900s), not client role/property claims. Neon provider + verified email/issuer/subject + DB allowlist are authoritative only when minting/refreshing after deliberate user action. Remote revoke delay is at most15 minutes.
- Every admin API verifies that cookie; writes also check origin. Business queries and mutations share one request-local transaction with `leasing_runtime`/actor context, explicit property scope, expiry precommit, CAS/idempotency/business audit. No repeated auth/permission lookup or generic access-decision transaction on warm reads. RLS remains enabled; Administrator/Editor guards stay at protected server boundaries.
- Public paths use a separate approved projection, never full workspace with React-hidden fields. No tenant/contact/private contract data or hold dates. Public intake only creates lead/intake; appointments are explicit staff workflow.
- Shared backend contains generic access/SQL/HTTP/storage primitives. Application owns B2B workflows, staff mapping, privacy and media lifecycle. Generic CRUD is not a substitute for lease/hold invariants.
- Media metadata/ownership/state/hash are relational; bytes stay in storage. App authorizes and reserves quota before calling protected Neon origin. AWS S3 keys live only there. R2 documents stay private; remote bindings are real even in dev.

## Storage and transfer

Approved public images/video/brochure use R2 `mall-assets`. Uploaded raster images and branding use Neon `media`; logo never falls back to static/R2/browser Blob. PDF uses private R2 **`mall-documents`** for local and the existing Worker; quarantine requires **manual external review**, not antivirus-clean or online signature. Inventory public + tracked Neon/private + reservations enforces app quota; unknown/mismatch locks upload.

Actual runtime database/hosting targets and reset recovery evidence live in the [database guide](../database/README.md). `.env.local` is an operator-managed real-cloud target, not a sandbox. This source change does not reset/migrate live databases, copy/delete storage, change regions, rotate secrets or deploy either host. Metadata-only lease behavior requires migration 011; current floor-plan readers require migration 015. Check each target database before release.

Transfer means schema+migrations, relational records, object keys/catalog and verified size/hash metadata, then copied/verified bytes and audited locator changes. Do not transfer opaque snapshots, credentials or presigned URLs. See [portability](database-portability.md), [quota](storage-quota.md) and [private documents](private-documents-r2.md).

## Runtime limits and checks

Next `output: standalone` supports Node SSR; OpenNext packages the existing Worker. Earlier native Worker → Neon S3/Functions probes returned 403 HTML while Node worked; no all-Worker media readiness claim. Wrangler currently labels `NEON_BRANCH=lgc-bot-test`, but runtime `DATABASE_URL` is a separate secret and its deployed value is unverified. Custom-domain/DNS remain explicitly deferred and the Worker remains noindex. Cache invalidation/performance are tracked separately in readiness, not claimed complete.

Canonical operator commands are `npm run dev`, `npm start`, `npm run db:migrate`, `npm run auth:set-password` (load `.env.local`) and `npm run deploy` (build/deploy the existing Worker with separately supplied runtime secrets); no multi-profile setup or deploy aliases.

Build CI runs shared integrity/types/tests plus application pure tests/typecheck and Next/OpenNext builds without cloud secrets. `npm run test:database` requires local PostgreSQL `postgres`/`initdb`/`pg_ctl` binaries, creates its own empty loopback cluster and removes only that owned cluster. It neither creates Neon branches nor uses live credentials. Current implementation contract and exercised checks: [admin data contract](admin-data-contract.md), [readiness](backend-readiness.md).
