# Lead notifications — Zalo + Gmail

## Hosting and scope

Owner explicitly confirms this project is **not deployed on Vercel**. Do not request Vercel login/deploy or infer repository deployment from HTTP headers. This rollout targets the existing Cloudflare Worker `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev` plus the Render notification service. Deploy does not change DNS/custom-domain routing.

Canonical local `.env.local` uses verified Neon `production` (`br-tiny-butterfly-b3uuw92p`); Worker uses isolated `lgc-bot-test` (`br-wispy-morning-b33h15x4`). Both verified branches received migrations011–013, preserving existing business records and no historical notification backfill. Auth/media remain their existing services. Build/deploy never runs migrations or seeds DB.

## Business commit and two independent channels

Website DB owns lead, intake, business audit/receipt and `leasing.contact_notification_outbox`. Render owns a **separate** Neon DB with bot inbox, website registry, event/recipient queues. Never give Render website DB credentials.

`submitContact` commits lead + intake + audit/idempotency + **two source jobs (Zalo and Gmail)** in the same `public:intake` transaction. Any enqueue failure rolls back the entire business submission. `/api/contact/` returns201 only after this commit; it never waits for Render/provider. Duplicate accepted form receipts enqueue neither extra lead nor extra source jobs.

Migration012 created the source outbox;013 gives it primary key `(intake_id,channel)` and generated unique `contact:<intake-id>:<channel>` key. Existing jobs remain Zalo; new contacts enqueue both channels. No automatic email blast for historical contacts.

Notification copies only reference, name, phone and intent. Gmail additionally has subject `Le Grande Centre — Lead <reference>`. Notes/email/full intake are not copied. Pending payload is sensitive plaintext; no logging payload, keys, recipients, provider response bodies. Source subject contains reference only.

## Retry and durable ownership transfer

1. Real Cloudflare cron every minute calls the protected dispatch route via `WORKER_SELF_REFERENCE` in normal OpenNext env/context; wrapper preserves adapter exports. Local Next has no cron.
2. Dispatcher claims up to5 due channel jobs with `SKIP LOCKED`,180second leases and random fencing token; closes every transaction/connection before network. Channel is included in claim joins and completion conditions, so one job cannot acknowledge/erase its sibling.
3. Jobs run concurrently. Each batch makes **up to3 attempts**, each bounded40seconds, with250/500ms pauses. The same channel-specific idempotency key and exact payload are reused. Valid receipt stops immediately; do not keep retrying after successful ACK.
4. Only HTTP200/202 valid JSON with expected channel, ID, queued/sending/sent state and timestamps transfers durable responsibility. Mark only that channel forwarded, store remote ID and clear its source payload. `redirect:manual` plus status validation rejects redirects without forwarding credentials; `redirect:error` is unsupported on Cloudflare and must not return.
5. All3 fail (network/timeout,401/409/5xx, disabled provider, malformed/lost ACK): retain payload, release lease, persist exponential30second–1hour delay. Later cron starts another batch; **three failures never delete/drop a lead or notification**. DB/crash lease expiry recovers safely.
6. Render authenticates finite website key, validates payload and atomically stores event + recipient snapshot before202. Zalo recipients are every currently registered group; Gmail recipient is website registry `gmail_to`, never caller supplied. Unlinked destinations do not consume event key. Lost ACK retry returns the same event/snapshot; changed payload with same key returns409.
7. Render retries individual recipients using60second fenced leases and5–300second backoff. Startup, HTTP/health, interval and retry deadlines recover pending rows. Already-sent recipients stay sent. Parent payload clears after all recipient ACKs.

**Channels are independent:** Gmail failing or missing OAuth keeps only Gmail job pending, without blocking or resending successful Zalo. Zalo has no groups yet→Zalo stays pending while Gmail can deliver when configured. Both source jobs still exist even if one service is temporarily unavailable.

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

## Gmail actual configuration status

Recipient set to **ntmcongty@gmail.com**, the existing website DB contact mailbox. Owner can change it with `/site gmail`.

Render sender requires all four private `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_FROM`. Available deployment credentials currently contain none; **actual Gmail sending is not yet verified and requires owner Google OAuth consent/client credentials**. Bot README has Gmail API/OAuth setup (`gmail.send`, offline refresh token, verified sender/send-as; Testing tokens may expire after7days). No SMTP/App Password on Render Free. Do not paste OAuth secrets in normal bot chat or logs. Pending Gmail source rows are retained until real setup succeeds.

## Render sleep decision

Owner explicitly selected **Free + scheduled keep-warm**. Cloudflare `zalo-render-wakeup` cron calls fixed Render `/health` every5minutes; pending processors recover on health. Zalo webhook stays on Render and its real verification probe passed after restoration.

An attempted durable workers.dev ingress passed local restart smoke but real Zalo probe was blocked403 before runtime; it was removed. Do not describe that ingress as protecting current traffic. Keep-warm reduces idle spin-down, but deploy/restart/outage can still delay/drop webhooks before Render inbox commit. This ceiling was accepted instead of paid always-on/custom-domain changes. Website leads remain protected by their source outbox regardless.

## Exercised evidence and launch gates

- Owned PostgreSQL regression covers atomic rollback, both channel rows, no duplicate form enqueue, all3 failures retained, third-attempt recovery, lost ACK, overlapping leases, rejected redirect without credential forwarding, Gmail failure/recovery without Zalo resend. TypeScript check passed.
- Bot tests cover owner permissions, finite/month-end credentials, private owner key delivery, cap races, crash-safe mutations, recipient queue restart/retry and Gmail transport with provider fixtures. Actual Gmail requires a separate live ACK.
- Worker auth returned401/200; real scheduled cron retained earlier pending events. Deployed website code `7c56da5`, Worker version `5d90fe58-3b13-4af0-bcab-86c7f243b195`, then accepted a new synthetic contact201 with BOTH channel rows. Actual dispatch returned200 `{claimed:2,forwarded:0}`, retaining both payloads with separate keys/attempt state while Zalo groups were unlinked and Gmail sender disabled. Synthetic rows were removed afterward without deleting audit history, avoiding future test alerts.
- Intended group delivery needs owner `/init`; do not claim end-to-end group delivery while group count is0. Gmail needs real sender OAuth. No unobserved production-domain, inbox delivery or exactly-once claim.

Final source verification:44 bot tests passed; website owned PostgreSQL5 tests and TypeScript passed, including same-batch token fencing (Zalo success/Gmail failure) and later Gmail recovery without Zalo resend. Render code `a6c149d` deployed live as `dep-dba1h1avcj2c739q773g`; actual owner `/site info` reached Zalo ACK with reply_source=command, counted0/context0 and configured Gmail metadata. Zalo testWebhook passed. Wake Worker `2d0695d0-8c55-4f21-bbdc-b82bc668d8c0` deployed5minute cron; its actual `/wake` invocation confirmed real Render DB health200. This manual path check does not claim an observed scheduled tick.

