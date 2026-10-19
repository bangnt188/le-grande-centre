> Historical handoff for the earlier static-export frontend state; it is not the current Le Grande Center deployment record. The owner confirms this project is not deployed on Vercel; the current release target is Cloudflare Worker stage2. See [deployment runbook](../../docs/deployment.md).

# Shared backend decision and Solar handoff

Current 0.2.1 package layout: repository root, mounted as `packages/backend` submodule in each app. [Pinned-commit workflow](./submodules.md). Vendored-copy steps below are historical.


**Runtime decision (introduced in 0.2.0):** [shared application adapters, threat model and migration](./shared-applications.md). The historical preparation notes below describe 0.1.0; Solar now has a separate server target and `src/server/catalog.ts`.

## Decision
Use one versioned package, `@shared/backend`, for Mall and Solar. No Next.js, database driver, auth provider or runtime dependency is required. Application adapters supply those integrations. Node >=22 is required. UI packages retain their product identities.

Shared: policy evaluation and session enforcement, scoped CRUD with version conflicts, PostgreSQL parameterization, Request/Response handlers, validation/errors, HTTPS client, signed webhook ingestion, field encryption.
Application-owned: role-to-grant mapping, tenant assignments, schemas/migrations, transaction isolation, audit destination, customer/contract/slot rules, Solar surveys/catalog/publishing, secrets and deployment. This package does not provide authenticated production APIs merely by being installed.

## Scope contract
Mall's existing `{ tenantId, propertyId, organizationId, ownerId }` remains supported. Solar can use `{ tenantId: 'solar-org', dimensions: { projectId: 'roof-1' } }`. Scope comes from verified server assignments, never a form. Flat unknown grant/scope fields are rejected; custom dimensions must be nested. Exact matches are required for allow; missing facts cannot bypass a deny.

SQL adapter example:

```ts
createPostgresRepository({
  query, table: 'projects', columns: { title: 'title' }, decode,
  scopeColumns: { tenantId: 'tenant_id' },
  dimensionColumns: { projectId: 'project_id' },
});
```

Every configured dimension must be supplied on every query. Unknown and missing mappings fail before SQL. CRUD rejects client `dimensions`, validates returned rows, and rejects scope mutation on update. Broad administrative queries need a separate repository configuration and matching authoritative grants; do not silently omit a filter.

## Threat model and trade-offs
Primary risks: forged identity, cross-tenant/project access, SQL injection, mass assignment, concurrent policy changes, stale writes, leaked encryption keys and unsigned/replayed webhooks. Guards deny by default; session/provider/audit failures fail closed. Applications must enforce transaction rollback and authoritative policy concurrency, secure cookies/origin configuration, database constraints/RLS and least-privilege credentials. Provider fixture tests do not prove production RLS or IAM.

Custom dimensions add configuration overhead but avoid business vocabulary in the core. Legacy scope fields remain for compatibility; new business dimensions use the nested contract. No encryption envelope/AAD migration is introduced. Use separate application keyrings and secret namespaces, including when two apps happen to share a tenant label. Do not ship keys in frontend bundles.

## Migration
1. Build and pack using `scripts/prepare-backend-handoff.mjs` from the Mall repo root. The artifact contains compiled JS/types and docs. It is private; no registry publication occurs.
2. In Solar add `packages/backend` to workspaces, extract the artifact there, and add dependency `@shared/backend: 0.1.0`; run npm install to generate that project's lockfile. Alternatively install the versioned tarball directly. Prefer a private registry later for one maintained source and reproducible version upgrades; avoid independently editing copies.
3. Use Solar's `src/server/catalog.ts` schema/lifecycle adapter. `examples/solar-projects.ts` illustrates only a contract; it is not an implementation of media, publication or persistence.
4. Supply real verified sessions, grants, DB schema/decoder, transaction and audit adapters. Add app-specific integration tests before enabling writes. Survey contact data needs Solar's retention/consent/access decisions separately.
5. Both inspected frontends use `output: 'export'`. Keep static deployment intact; deploy APIs separately on a Node Vercel service or deliberately migrate to a server deployment. Static Pages cannot execute these handlers. No Vercel deployment or real DB is provisioned by this handoff.

## Compatibility
Package name migration is required: replace backend imports/scripts from `@mall/backend` to `@shared/backend`. No real app imports were found in Mall at preparation time. Existing valid Mall scopes continue to work. Previously ignored flat extra scope fields now fail closed. Crypto format and public handler contracts remain unchanged.
