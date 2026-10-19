# Neon setup — phase 2

Cập nhật trạng thái 19/10/2026. Project `wispy-sunset-10596642` dùng Neon branch `production` (`br-tiny-butterfly-b3uuw92p`) cho local và Worker stage2. Migration 014/015 cùng seed floor-plan đã được áp dụng trên production; Worker secret `DATABASE_URL` đã được đồng bộ từ local connection đã xác minh. Branch stage2 cũ `lgc-bot-test` đã được xóa theo yêu cầu owner sau khi chuyển Worker. Owner xác nhận dự án này không triển khai trên Vercel; release target hiện tại là Worker stage2. Auth/function secrets vẫn là các target riêng cần xác minh theo deployment. Xem [deployment runbook](deployment.md) và [database guide](../database/README.md).

## Thành phần hiện tại

- Neon PostgreSQL: dữ liệu quan hệ, staff assignment/allowlist, CAS/idempotency/audit, public projection và intake. `production` là branch duy nhất hiện còn; branch test stage2 đã được xóa 19/10/2026 sau khi Worker chuyển về production. Branch test trước khi xóa chỉ có một bản ghi form UI thử nghiệm.
- Neon Auth: `/admin/` dùng email + mật khẩu, không Google OAuth. Administrator cấp email và vai trò Administrator/Editor; nhân viên tạo mật khẩu và xác minh email, signup không tự cấp quyền. Owner/root giữ allowlist riêng và ẩn khỏi staff. Source mới kiểm provider + issuer/subject + quyền DB khi mint/renew app cookie ký số **900 giây**; warm API verify cookie local, không auth/identity query. Chỉ user action renew khi thiếu/hết cache; revoke có độ trễ tối đa15 phút. [Contract hiện hành](admin-data-contract.md). Tại snapshot 16/10 chưa deploy/migrate011; trạng thái migration hiện tại xem [database guide](../database/README.md), còn source deploy cần xác minh riêng.
- `neon.ts`: bucket `media` `public_read`; function `media` source `src/server/media/neon-function.ts`. Không lưu tài liệu nội bộ vào bucket public-read.
- Function media là **trusted server origin**: `x-secret: MEDIA_ORIGIN_SECRET` (ít nhất 64 ký tự), constant-time auth trước body/storage, chỉ known branding UUID keys và key logo approved, PUT ảnh PNG/JPEG/WebP bounded 10 MiB với signature/dimension checks. Không có anonymous write/arbitrary key endpoint. Node app phải kiểm tra session/quota/ownership và reserve trước gọi origin.
- AWS S3 credentials chỉ ở Neon origin; ứng dụng gọi `NEON_MEDIA_FUNCTION_URL`, không chuyển AWS write keys vào Worker/browser. Public URL ảnh không phải quyền ghi.

## Local runtime

Cần Node **22.22+**. Sau `npm ci`, `npm run dev` tự generate media catalog và build hai submodule qua `predev`. Operator chỉ cấu hình **`.env.local`** (gitignored), không nhiều profile:

```sh
npm run dev -- --port 3000
# Sau npm run build:
npm start
```

`scripts/load-local-env.mjs` nạp `.env.local` và ghi đè biến cùng tên còn sót trong shell cho dev/start/migration/password command. Không dùng Node `--env-file` để spawn Next dev. Local vẫn kết nối production; không dùng local form để tạo dữ liệu thử. Không coi Worker stage2 là test DB cho tới khi giá trị secret `DATABASE_URL` của deployment được đối chiếu với branch dự kiến. Không đưa credentials vào output, Git hoặc `NEXT_PUBLIC_*`.

Cấu hình server tách branch theo môi trường:

| Nơi | Biến/cấu hình |
| --- | --- |
| Next app | `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 ký tự), `CONTACT_RATE_LIMIT_SECRET` (≥32), `NEON_MEDIA_FUNCTION_URL`, `MEDIA_ORIGIN_SECRET`, endpoint Neon để dựng public locator |
| Trusted Neon media origin | `MEDIA_ORIGIN_SECRET` cùng giá trị với app; `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` do môi trường origin cung cấp |
| R2 | `PRIVATE_DOCUMENTS`/`PUBLIC_ASSETS` bindings; `R2_PRIVATE_BUCKET` đúng môi trường và `R2_ACCOUNT_ID`; Node ngoài binding cần scoped R2 access keys nếu dùng S3 adapter |
| Public build config | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, `NEXT_PUBLIC_NEON_MEDIA_BASE_URL`, `SEO_INDEXABLE` — không có secret |

App session sử dụng `NEON_AUTH_COOKIE_SECRET` hiện hữu qua HKDF purpose separation;
không cần secret/binding/cache service mới. Không thay/rotate secret trong code.
Cookie `__Host-lgc_admin` bắt buộc Secure/HttpOnly/SameSite=Lax, nên runtime ngoài
localhost phải có HTTPS đúng origin. Logout/đổi account xóa cookie và private
memory cache. Thiếu secret hợp lệ trả503, không fallback cookie cũ hoặc quyền DB.

Wrangler giữ một root config. Worker `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev` là noindex và dùng Neon `production` qua runtime secret `DATABASE_URL`; `NEON_BRANCH` đã được bỏ khỏi config. `npm run deploy` chỉ cập nhật Worker stage2. R2 config gắn các bucket `mall-documents`/`mall-assets`; Auth và media-function targets lấy từ runtime config/secrets và cần xác minh riêng. Hậu tố Worker/cache `stage2` không tự chọn DB branch/provider. Xem [deployment runbook](deployment.md).

## Operator commands, migration và regression

```sh
npm run db:migrate
# Đặt ROOT_ADMIN_PASSWORD riêng trong .env.local trước thao tác đổi mật khẩu:
npm run auth:set-password -- root@legrandecentre.vn
# Build OpenNext và deploy cùng artifact lên Worker hiện có:
npm run deploy
```

`db:migrate` nạp `.env.local`, dùng direct `DATABASE_URL_UNPOOLED`; migration là operator action trên branch mà file local chỉ định. Migration 014/015 và seed đã chạy trên production; không chạy migration khi build/deploy. `npm run test:database` dùng PostgreSQL local disposable, không tạo Neon branch. Owner xác nhận repo không có deployment trên Vercel. Xem [deployment runbook](deployment.md).

`npm run test:database` dùng **PostgreSQL local disposable do runner sở hữu**; cần `postgres`, `initdb`, `pg_ctl` trên `PATH` (macOS có thể cài Homebrew `postgresql@17`). Runner không dùng Neon CLI, không tạo/clone Neon branch và không nạp production secrets. Nó tạo cluster rỗng loopback-only, kiểm ownership, apply baseline+migrations+approved seed hai lần, chạy regression rồi dừng/xóa đúng cluster của lần chạy. Logo metadata là fixture offline, không chứng minh delivery. Kết quả đã quan sát **2/2 pass**; hướng dẫn Homebrew và giới hạn tại [database guide](../database/README.md).

## Bằng chứng và giới hạn

**Bằng chứng lịch sử trước reset:** local Node Next từng quan sát sign-in/workspace, PNG upload/read/delete, PDF quarantine/manual-review/Range, hold→lease, appointment transition và contact POST 201. Fixture emailVerified **không chứng minh OTP delivery**. Các isolated Neon regression cũ, application/shared tests, browser responsive và standalone smoke là kết quả thời điểm trước, không phải setup/test strategy hiện tại. Sau hợp nhất, root login đã trả HTTP 200. [Readiness](backend-readiness.md) tách bằng chứng, performance đang chẩn đoán và giới hạn.

Native Cloudflare Worker fetch tới Neon S3/Functions trả 403 HTML trước provider (anonymous GET cũng vậy); Node native request được, Worker tới Neon Auth được. Protected function có code nhưng **chưa chứng minh khắc phục cross-zone denial**. Không claim Worker media ready, không tự đổi domain/DNS để giải quyết.

Worker stage2 được cấu hình noindex và dùng Neon `production`. Không dùng HTTP status/header để kết luận hosting hoặc cutover. Owner xác nhận dự án không triển khai trên Vercel. Provider Auth verification/OTP settings không chứng minh email delivery/recovery. Snapshot trước reset `snap-misty-sea-b3tgf6is` (hết hạn 2026-10-22T23:59Z) và private dump được ghi trong [database guide](../database/README.md).

`scripts/build-cloudflare.mjs` tạm giấu standard envfiles để OpenNext không nhúng secrets, rồi khôi phục. Cấp API/DB/auth/media secrets bằng Worker runtime secrets, không artifact. `.neon`, `.env.local` và auth CLI state phải bị ignore. Không commit OAuth/API keys vào project config.
