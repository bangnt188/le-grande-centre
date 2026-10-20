# Lead notifications — Zalo + Cloudflare email (API channel `gmail`)

## Hosting and scope

Owner confirms this project is **not deployed on Vercel**. Target remains the existing `le-grande-centre-stage2` Worker plus Render. On2026-10-20 Cloudflare API confirmed workers.dev/previews disabled, no attached domain/zone route, but cron still active. Preserve that disabled public state; do not reopen the website or change DNS for this hotfix.

Canonical local `.env.local` and stage2 Worker runtime `DATABASE_URL` use Neon `production` (`br-tiny-butterfly-b3uuw92p`). The former test branch `lgc-bot-test` was removed on 19/10/2026 after moving the Worker to production. Production has migrations 001–015 and the approved plan seed. Auth/media remain separate runtime targets. Build/deploy never runs migrations or seeds DB; no historical notification backfill was performed.

## Business commit and two independent channels

Website DB owns lead, intake, business audit/receipt and `leasing.contact_notification_outbox`. Render owns a **separate** Neon DB with bot inbox, website registry, event/recipient queues. Never give Render website DB credentials.

`submitContact` commits lead + intake + audit/idempotency + **two source jobs (Zalo and Gmail)** in the same `public:intake` transaction. Any enqueue failure rolls back the entire business submission. `/api/contact/` returns201 only after this commit; it never waits for Render/provider. Duplicate accepted form receipts enqueue neither extra lead nor extra source jobs.

Migration012 created the source outbox;013 gives it primary key `(intake_id,channel)` and generated unique `contact:<intake-id>:<channel>` key. Existing jobs remain Zalo; new contacts enqueue both channels. No automatic email blast for historical contacts.

Notification copies only reference, name, phone and intent. Gmail additionally has subject `Le Grande Centre — Lead <reference>`. Notes/email/full intake are not copied. Pending payload is sensitive plaintext; no logging payload, keys, recipients, provider response bodies. Source subject contains reference only.

## Retry and durable ownership transfer

1. After OpenNext returns201 for `POST /api/contact[/]`, the Worker starts authenticated self-binding dispatch in `ctx.waitUntil`, without awaiting it before the form response. DB commit/outbox remains authoritative. Fallback cron `*/15 * * * *` recovers missed/interrupted wakes instead of polling every minute. Workers may stop post-response work before a long network retry finishes; the lease expires and a later cron retries the same event. Recovery may wait up to15minutes after a job becomes due; existing backoff also applies. Preserve adapter exports and request-local env/context. Local Next alone has neither event wake nor cron.
2. Dispatcher claims up to5 due channel jobs with `SKIP LOCKED`,180second leases and random fencing token; closes every transaction/connection before network. Channel is included in claim joins and completion conditions, so one job cannot acknowledge/erase its sibling.
3. Jobs run concurrently. Each batch makes **up to3 attempts**, each bounded40seconds, with250/500ms pauses. The same channel-specific idempotency key and exact payload are reused. Valid receipt stops immediately; do not keep retrying after successful ACK.
4. Only HTTP200/202 valid JSON with expected channel, ID, queued/sending/sent/failed state and timestamps transfers durable responsibility. A replay may already be terminal failed: preserve its remote ID because Render retains the failed payload for review, not because delivery succeeded. Mark only that channel forwarded and clear its source payload. `redirect:manual` rejects redirects without forwarding credentials; Cloudflare does not support `redirect:error`.
5. All3 fail (network/timeout,401/409/5xx, disabled provider, malformed/lost ACK): retain payload, release lease, persist exponential30second–1hour delay. Later cron starts another batch; **three failures never delete/drop a lead or notification**. DB/crash lease expiry recovers safely.
6. Render authenticates finite website key and snapshots event, sender/provider and recipient before202. Zalo targets all registered groups. Email uses website registry `email_from`, `email_reply_to` and retained `gmail_to`; callers cannot select from/to/provider. Unlinked/unverified admission does not consume the event key. Lost ACK returns the same event/snapshot; changed payload with same key returns409.
7. Render retries individual recipients using60second fenced leases and5–300second backoff. Startup, event wake,15-minute fallback and retry deadlines recover pending rows; `/health` is process-only, without SQL/recovery. Atomic UTC-day provider-attempt budgets apply per site (default100) and service (default1000); exhaustion defers to the next UTC day, never deletes a job. Successful recipients stay sent; payload clears after all ACKs. Permanent bounce becomes failed with retained payload and safe error code, without blind retry.

**Channels are independent:** missing Cloudflare token, failed verification or email outage keeps only the email source job pending, without blocking/resending successful Zalo. Zalo without registered groups stays pending while configured email can deliver. `gmail` is retained as the API/channel name, not the sending provider; no channel/idempotency-key migration or historical backfill.

**At-least-once, not exactly-once:** provider can accept before a crash prevents storing ACK, so an ambiguous retry can duplicate that recipient. `sent` means provider ACK, not read/inbox delivery. Keep stable keys, never create random replacement events to hide uncertainty.

## Runtime configuration

| Server variable | Meaning |
| --- | --- |
| `NOTIFICATIONS_URL` | Full `https://zalo-render-bot.onrender.com/v1/notifications` endpoint |
| `NOTIFICATIONS_API_KEY` | Current finite website key, server-only |
| `NOTIFICATION_DISPATCH_SECRET` | Dedicated random ≥32characters; not website key/webhook secret |

`POST /api/internal/notifications/dispatch/` requires `Authorization: Bearer <dispatchsecret>` before DB access. Wrong/missing/unconfigured secret→401; storage/setup failure→503; success→`{claimed,forwarded}` with no-store. Counts represent source responsibility transfer, not final provider delivery. Native maxDuration180 does not delay public intake.

Generic `@suntech/notifications` SDK takes service-origin `baseUrl`, not this app's full endpoint. Website uses native fetch and transactional source jobs. SDK has no automatic retry and cannot replace source outbox. No frontend/CORS public sending or `NEXT_PUBLIC_*` credentials.

## Owner chatbot administration

Configure Render owner ID/token; owner opens PRIVATE chat. Only owner PRIVATE can administer; commands are quota-free, no AI/context, GROUP use denied even for owner.

| Command | Result |
| --- | --- |
| `/site help` | Help |
| `/site issue https://example.com 3 5` | New site3 calendar months, cap5 groups |
| `/site rotate https://example.com 6` | New key6 months from now; old key invalid immediately |
| `/site limit https://example.com 10` | Change cap, cannot be below current memberships |
| `/site gmail https://example.com owner@gmail.com` | Set fixed receiving mailbox |
| `/site email https://example.com notification@example.com contact@example.com` | Set tenant-bound sender and optional Reply-To; preserve current daily cap |
| `/site email-limit https://example.com 100` | Set daily UTC provider-attempt cap1..100000 |
| `/site email-verify https://example.com` | Live Cloudflare account/zone/routing/destination check, then compare-and-set verification |
| `/site info https://example.com` | State/expiry/group usage/Gmail recipient, no key |
| `/site list` or `/site list 2` | Metadata3 sites/page |
| `/site revoke https://example.com` | Revoke new auth/bindings |

Months1–120 use UTC calendar addition, preserving time and clamping last day (Jan31→Feb28/29). Cap1–100/default3. CLI day-based compatibility remains: bot `scripts/website.mjs issue --origin URL --name NAME --max-groups3 --expires-days90 [--gmail-to EMAIL]` (put spaces between flags/values); rotate/revoke/limit documented in bot README.

**Keys only go through owner's existing PRIVATE chat**, never terminal/groups/public help/normal messages/model memory. Registry + owner-delivery queue + safe current-command ready receipt commit together, preventing repeated issuance/rotation after crash/replay. Queue plaintext clears after provider ACK. Owner installs or privately forwards key to website backend operator; update every runtime immediately after rotation. No automatic end-user DM.

Owner registers intended Zalo groups by sending in **each group**:

```text
/init https://legrandecentre.vn/
```

Existing active/unexpired registry required. One website→many groups up to cap; one group→one website globally. Repeat binding succeeds at cap; SQL locks/triggers enforce concurrent cap and reject decreases below count. Do not select arbitrary groups from historical messages. Non-owner PRIVATE text/images/commands reply exactly `Liên hệ chủ sở hữu để mở khóa tính năng`, no AI/tools/quota/context.

## Cloudflare email: sender and inbound Routing

**Inbound stays:** `contact@legrandecentre.vn` → **Cloudflare Email Routing** → **`ntmcongty@gmail.com`**. Routing is free with active Cloudflare DNS and verified destination. Preserve/import all website/Auth/media/mail DNS before any nameserver cutover; configuring notifications does not implicitly authorize changing DNS or hosting. Test forwarding from a different mailbox. This is not a hosted mailbox, Gmail send-as or automatic inbound AI/lead processing.

**Outbound:** Render calls Cloudflare REST HTTPS directly with From `notification@legrandecentre.vn`, Reply-To `contact@legrandecentre.vn`, recipient from registry. Only verified destination addresses are allowed in this free-only design; sender domain belongs to the website and same Cloudflare account. Transport checks eligibility again before every send. Sender/recipient changes invalidate verification; queued snapshots stay unchanged.

Only Render needs `CLOUDFLARE_EMAIL_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_DAILY_LIMIT` (default1000). Website retains its three existing secrets and both stable channel keys; **no Google OAuth variables or Cloudflare provider token on the website**. Owner configures recipient/sender, completes Cloudflare destination confirmation, then runs `/site email-verify`. Never mark verification via SQL to bypass provider checks.

Cloudflare verified-destination sends are free and excluded from monthly/daily sending quotas; API/account/abuse restrictions still apply. Unverified arbitrary recipients need Workers Paid. Mailjet/Resend fallback and incoming-mail automation are out of scope. See [provider pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [limits](https://developers.cloudflare.com/email-service/platform/limits/) and the [central design/runbook](https://github.com/bangnt188/zalo-render-bot/blob/main/docs/notification-architecture.md).

Actual release requires provider token with email/verification permissions, active domain/routing and confirmed mailbox. Code/fixture success alone is not live sending or inbox proof; source jobs remain durable until responsibility is transferred.

## Render sleep decision

Owner selected **Free + scheduled keep-warm**. `zalo-render-wakeup` calls fixed Render process-only `/health` every5minutes, without SQL or queue recovery. Compute hotfix `901f32a` is live; a real scheduled tick was observed successfully. Zalo webhook remains on Render and its verification probe passed.

An attempted durable workers.dev ingress passed local restart smoke but real Zalo probe was blocked403 before runtime; it was removed. Do not describe that ingress as protecting current traffic. Keep-warm reduces idle spin-down, but deploy/restart/outage can still delay/drop webhooks before Render inbox commit. This ceiling was accepted instead of paid always-on/custom-domain changes. Website leads remain protected by their source outbox regardless.

## Exercised evidence and launch gates

- Owned PostgreSQL regression covers atomic rollback, both channel rows, no duplicate form enqueue, all3 failures retained, third-attempt recovery, lost ACK, overlapping leases, rejected redirect without credential forwarding, Gmail failure/recovery without Zalo resend. TypeScript check passed.
- Bot regressions cover owner permissions, finite/month-end credentials, private-owner key delivery, cap races, crash-safe mutations and recipient queue recovery. New email acceptance additionally requires verified tenant sender/destination, daily caps, Cloudflare ACK/bounce classification and a separate actual mailbox check.
- Worker auth returned401/200; real scheduled cron retained earlier pending events. Deployed website code `7c56da5`, Worker version `5d90fe58-3b13-4af0-bcab-86c7f243b195`, then accepted a new synthetic contact201 with BOTH channel rows. Actual dispatch returned200 `{claimed:2,forwarded:0}`, retaining both payloads with separate keys/attempt state while Zalo groups were unlinked and Gmail sender disabled. Synthetic rows were removed afterward without deleting audit history, avoiding future test alerts.
- Intended group delivery needs owner `/init`; do not claim group delivery while group count is0. Actual email now requires Cloudflare domain/destination verification and live provider proof, not Gmail OAuth. No unobserved production-domain, inbox delivery or exactly-once claim.

Historical release evidence **before the Cloudflare email cutover**:44 bot tests passed; website owned PostgreSQL5 tests and TypeScript passed, including same-batch token fencing and email recovery without Zalo resend. Render code `a6c149d` deployed live as `dep-dba1h1avcj2c739q773g`; owner `/site info` reached Zalo ACK. Zalo testWebhook passed. Wake Worker `2d0695d0-8c55-4f21-bbdc-b82bc668d8c0` had5minute cron and a manual `/wake`→Render DB health200; this does not prove an observed scheduled tick or the new email deployment.


### Cloudflare email cutover — current source evidence

The new source retains channel `gmail`, source keys and three website secrets, and recognizes terminal failed receipts as durable Render ownership. Owned PostgreSQL regression passed5 tests, including the terminal-receipt case; full website TypeScript check passed. Central bot build passed,79 regressions passed, and the actual server recovered10 tenant-specific emails against an owned HTTP provider fixture, including503 retry, budgets and restart.

No new website/Render release, live Neon migration, DNS/MX/routing changes or real email inbox proof occurred in this cutover. The available Cloudflare token returned403/error9109 for zone read. Production still needs an appropriate provider token, active Cloudflare DNS/routing and destination mailbox confirmation; do not present fixtures or previous release IDs as new production evidence.


### Separate Zalo inbox hotfix — live on 2026-10-19

An unavailable image at inbox seq17 blocked global bot processing, including the actual owner `/init` seq18 and PRIVATE chat seq19. Hotfix `5efc40ad90e9ae60f69d002b09865ba4b6bafb85` deployed live as Render `dep-dbato7u7bikc73f19a60`, applying only message-retry migration0005 (not email0004). Per-message due times/backoff now prevent one failed image/model/send from starving other messages; pending payloads remain durable.

Live proof: original `/init` reached Zalo ACK/sent at09:01:01UTC and bound the intended Le Grande group (1/3); original PRIVATE AI reply reached sent/model at09:01:04UTC; a separate webhook `/quota` returned200 then sent/command at09:01:25UTC. Zalo testWebhook passed. The image remains pending independently. Customer groups stay notification-only. Regression failed before/passed after; production hotfix48 tests and email-source compatibility80 tests passed. Cloudflare email code/DNS/provider setup is still not deployed by this hotfix.


### Bounded bot chat rejection — live 2026-10-19

Bot inbox messages now become rejected after3 failed processing attempts and send `Không xử lý thông tin được, vui lòng trở lại sau.` with a separate maximum3 notice attempts across restart. Rejected stays rejected even after notice ACK; exhausted notices stop, customer groups remain silent except owner init errors, and PRIVATE visitors retain the locked reply. This cap never rejects business lead outbox or Zalo/email notification deliveries.

Commit `2e7eb6e610ef10ed36a5c3b61891f35c206bc00e`, Render `dep-dbatufu1egvs73e2pkb0` live, migration0006 applied only to bot DB. Actual exhausted image seq17 became rejected; one notice ACK at09:14:02UTC; another live PRIVATE quota reply seq21 sent at09:14:21UTC and testWebhook passed.51 production tests,83 email-compatible tests and actual server/provider-HTTP smoke passed. Website/email release state is unchanged.


### Notification compute hotfix — 2026-10-20

Isolated from published `dev`, excluding unrelated admin/UI work and preserving pinned package revisions. No Neon Auth, DB schema, provider-secret, CU sizing or DNS change. Public Worker access was already disabled while cron still ran every minute. Canonical DB identity was checked read-only as `br-tiny-butterfly-b3uuw92p`; only its validated public6-floor/81-unit projection was used for an offline build.

OpenNext build and `tsc --noEmit` passed. Owned PostgreSQL6tests passed, including contact route + Worker event wrapper + HTTP provider:201 returned while provider was held, both source jobs committed, immediate dispatch, email-only failure retained, duplicate form did not resend Zalo, invalid form did not dispatch, and scheduled recovery reclaimed an expired lease. Only generated OpenNext transport was replaced in that fixture. Actual workerd/OpenNext smoke without live credentials returned400 invalid contact,403 cross-origin and401 unauthorized dispatch. Artifact scan:1736files,11credential values,0matches. No live synthetic lead/notification was created.

Live rollout: source `d1b3dbf` pushed to `dev`; Worker version `d521332a-500a-4e2d-94ec-89fda9ee9414` receives100% traffic (2026-10-20T02:29:44Z). Deploy reused the checked artifact, populated12/12R2 cache entries and initialized the adapter D1 table idempotently; no Neon migration. Cloudflare management API confirmed the only live schedule is `*/15 * * * *`, replacing `* * * * *`. workers.dev/previews remain disabled, domain list remains empty, and DB/Auth/notification-secret bindings remain present. Public201 cannot be exercised live while public ingress is disabled; no endpoint was reopened and no real lead was submitted. A new scheduled invocation and production CU-hour reduction were not measured.

