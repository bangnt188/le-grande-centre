# Lead notifications — Zalo + Cloudflare email (API channel `gmail`)

## Hosting and scope

Owner explicitly confirms this project is **not deployed on Vercel**. Do not request Vercel login/deploy or infer repository deployment from HTTP headers. This rollout targets the existing Cloudflare Worker `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev` plus the Render notification service. Deploy does not change DNS/custom-domain routing.

Canonical local `.env.local` uses verified Neon `production` (`br-tiny-butterfly-b3uuw92p`); Wrangler labels Worker `NEON_BRANCH=lgc-bot-test` (`br-wispy-morning-b33h15x4`), while deployed runtime `DATABASE_URL` must be verified separately. The last recorded checks found migrations011–013 on both branches, preserving existing business records and no historical notification backfill. Auth/media remain separate runtime targets. Build/deploy never runs migrations or seeds DB.

## Business commit and two independent channels

Website DB owns lead, intake, business audit/receipt and `leasing.contact_notification_outbox`. Render owns a **separate** Neon DB with bot inbox, website registry, event/recipient queues. Never give Render website DB credentials.

`submitContact` commits lead + intake + audit/idempotency + **two source jobs (Zalo and Gmail)** in the same `public:intake` transaction. Any enqueue failure rolls back the entire business submission. `/api/contact/` returns201 only after this commit; it never waits for Render/provider. Duplicate accepted form receipts enqueue neither extra lead nor extra source jobs.

Migration012 created the source outbox;013 gives it primary key `(intake_id,channel)` and generated unique `contact:<intake-id>:<channel>` key. Existing jobs remain Zalo; new contacts enqueue both channels. No automatic email blast for historical contacts.

Notification copies only reference, name, phone and intent. Gmail additionally has subject `Le Grande Centre — Lead <reference>`. Notes/email/full intake are not copied. Pending payload is sensitive plaintext; no logging payload, keys, recipients, provider response bodies. Source subject contains reference only.

## Retry and durable ownership transfer

1. Real Cloudflare cron every minute calls the protected dispatch route via `WORKER_SELF_REFERENCE` in normal OpenNext env/context; wrapper preserves adapter exports. Local Next has no cron.
2. Dispatcher claims up to5 due channel jobs with `SKIP LOCKED`,180second leases and random fencing token; closes every transaction/connection before network. Channel is included in claim joins and completion conditions, so one job cannot acknowledge/erase its sibling.
3. Jobs run concurrently. Each batch makes **up to3 attempts**, each bounded40seconds, with250/500ms pauses. The same channel-specific idempotency key and exact payload are reused. Valid receipt stops immediately; do not keep retrying after successful ACK.
4. Only HTTP200/202 valid JSON with expected channel, ID, queued/sending/sent/failed state and timestamps transfers durable responsibility. A replay may already be terminal failed: preserve its remote ID because Render retains the failed payload for review, not because delivery succeeded. Mark only that channel forwarded and clear its source payload. `redirect:manual` rejects redirects without forwarding credentials; Cloudflare does not support `redirect:error`.
5. All3 fail (network/timeout,401/409/5xx, disabled provider, malformed/lost ACK): retain payload, release lease, persist exponential30second–1hour delay. Later cron starts another batch; **three failures never delete/drop a lead or notification**. DB/crash lease expiry recovers safely.
6. Render authenticates finite website key and snapshots event, sender/provider and recipient before202. Zalo targets all registered groups. Email uses website registry `email_from`, `email_reply_to` and retained `gmail_to`; callers cannot select from/to/provider. Unlinked/unverified admission does not consume the event key. Lost ACK returns the same event/snapshot; changed payload with same key returns409.
7. Render retries individual recipients using60second fenced leases and5–300second backoff. Startup, HTTP/health, interval and retry deadlines recover pending rows. Atomic UTC-day provider-attempt budgets apply per site (default100) and service (default1000); exhaustion defers to the next UTC day, never deletes a job. Successful recipients stay sent; payload clears after all ACKs. Permanent bounce becomes failed with retained payload and safe error code, without blind retry.

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

Owner explicitly selected **Free + scheduled keep-warm**. Cloudflare `zalo-render-wakeup` cron calls fixed Render `/health` every5minutes; pending processors recover on health. Zalo webhook stays on Render and its real verification probe passed after restoration.

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

