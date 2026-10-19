# Neon, PostgreSQL portability và SQLite

## Runtime hiện tại

Mall dùng Neon PostgreSQL thật qua `@neondatabase/serverless`. Admin/write dùng Pool: `src/server/database.ts` tạo pool theo request, pin client trong transaction, `SET LOCAL ROLE leasing_runtime` và actor context; không giữ socket xuyên Worker requests. Public uncached reader trong `src/server/public-data.ts` dùng một HTTP transaction bốn statement và projection riêng, cùng role/actor/property share lock; không thay transport của interactive writes. Public render cache không phải nguồn dữ liệu cho authorization/intake. Workspace giữ property lock, revision CAS, idempotency receipts, audit và RLS; `AdminSnapshot` là DTO đọc, không phải persistence format.

`database/schema.sql` là baseline. Snapshot ngay sau reset owner duyệt ngày 15/10/2026 có migrations 001–009 trên `production` (`br-tiny-butterfly-b3uuw92p`); đây là trạng thái lịch sử, không phải schema hiện tại. Lần xác minh live gần nhất ghi nhận `production` và `lgc-bot-test` đến migration 013. Checkout hiện có migration 014/015; migration 015 cần cho truy vấn floor-plan hiện tại, nhưng chưa có xác minh live cho chúng. Local `.env.local` trỏ production; Wrangler chỉ khai báo nhãn `NEON_BRANCH=lgc-bot-test`, còn Worker dùng runtime secret `DATABASE_URL`. Catalog/root/logo/reset evidence và private backup xem [database guide](../database/README.md). Migration operator-only qua `npm run db:migrate` nạp `.env.local`, direct `DATABASE_URL_UNPOOLED`, không bước build/deploy. Regression DB dùng owned disposable local PostgreSQL, không tạo Neon branch.

## Đổi provider

- **Neon ↔ Supabase:** cùng PostgreSQL protocol/SQL nhưng không chỉ đổi URL. Giữ application schema/invariants; kiểm tra extensions, version, roles/privileges/RLS, direct vs pooler, TLS và transaction driver. Neon Auth và Object Storage không tự port sang Supabase Auth/Storage.
- **REST/SDK khác nhau:** Supabase Data API/PostgREST và Neon HTTP/Data API không thay trực tiếp transaction tương tác pinned trên một connection. Shared `@shared/backend/pg-connection` có transaction contract; app Neon Pool vẫn phải giữ các bước cùng client.
- **SQLite:** cần schema/adapter/dialect riêng. Baseline dùng ranges/GiST/EXCLUDE, deferred constraints, PL/pgSQL và RLS; SQLite không cung cấp nguyên trạng. Không bỏ invariant chống trùng cam kết hoặc quyền để port nhanh.
- File SQLite local hoặc `/tmp` của serverless/Worker không phải shared durable database. Hosted SQLite vẫn cần kiểm chứng transaction/concurrency và thiết kế tương đương.

## Chuyển tài khoản/dữ liệu

1. Chuyển baseline + migrations + lịch sử áp dụng và dữ liệu quan hệ có stable IDs/FKs, actor/audit, CAS/receipts. Kiểm tra restore/row counts/invariants trước mở writes.
2. Chuyển identity issuer/subject/verified staff mapping theo auth provider thực; không copy session cookies/test fixture emailVerified làm chứng nhận onboarding production.
3. Copy object bytes R2/Neon theo stable object keys/catalog. Verify bytes/size/hash; chuyển metadata provider/bucket/key/visibility/review/retention có audit. Không lưu/copy presigned URLs như locator.
4. Cấu hình runtime secrets và public URLs mới; kiểm tra authorized/private/public projection. **Không import/export opaque browser snapshots** và không tạo demo data khi DB lỗi.

Provider credentials và API quản trị không phải browser SQL credential. Giữ pooled runtime URL và direct migration URL đúng cùng production branch; local loader ghi đè inherited shell values bằng `.env.local`. Không đưa DB URL vào `NEXT_PUBLIC_*` hoặc bundle. Migrations/restore là operator action, không CI build/deploy tự động. `npm run deploy` là deployment duy nhất tới Worker hiện có; không deploy aliases hoặc profile khác.

## Giới hạn đã biết

Các probe trước đây ghi nhận native Cloudflare Worker → Neon S3/Functions 403 HTML trước provider, Node requests được; đây không phải lỗi SQL portability đã được giải quyết. Local real-cloud runtime không chứng minh all-Worker media ready. Runtime DB branch và Auth/function targets của Worker chưa được xác minh bằng secret/deployment evidence trong lần cập nhật này; không suy chúng từ tên stage2 hoặc `NEON_BRANCH`. Custom-domain/DNS vẫn do người dùng hoãn. [Readiness](backend-readiness.md) tách bằng chứng lịch sử, trạng thái sau reset và cache/performance đang chẩn đoán; không có live cloud verification mới trong lần chỉnh docs này.

## Nguồn chính thức

- [Neon connection](https://neon.com/docs/connect/connect-from-any-app), [serverless driver](https://neon.com/docs/serverless/serverless-driver), [pooling](https://neon.com/docs/connect/connection-pooling).
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Data API](https://supabase.com/docs/guides/api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [node-postgres transactions](https://node-postgres.com/features/transactions).
- [SQLite types](https://sqlite.org/datatype3.html), [transactions](https://sqlite.org/lang_transaction.html), [triggers](https://sqlite.org/lang_createtrigger.html), [omitted features](https://sqlite.org/omitted.html).
