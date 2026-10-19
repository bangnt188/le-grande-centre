# Le Grande Centre

Ứng dụng Next.js 16 App Router / React 19 cho website và quản trị Le Grande Centre.
Source: https://github.com/bangnt188/le-grande-center.git, nhánh làm việc `dev`.

## Runtime phase 2

- Next SSR với `output: "standalone"`; OpenNext tạo Cloudflare Worker. Không còn static export, GitHub Pages hoặc deployment aliases cũ.
- `/admin/` đăng nhập **Neon Auth thật**, email phải verified và có staff allowlist/assignment active trong DB. Provider + quyền được kiểm tra khi mint cookie ký số **15 phút** (`HttpOnly/Secure`); API thông thường chỉ verify cookie cục bộ. Hết cache chỉ renew khi người dùng thao tác; managed session còn hiệu lực thì không nhập mật khẩu lại. Không timer/poll/focus refresh, không demo auth hoặc IndexedDB fallback.
- Neon PostgreSQL là nguồn dữ liệu nghiệp vụ. Command chạy transaction với runtime role/RLS, property lock, revision CAS, idempotency receipt và business audit; không persist hoặc truyền aggregate workspace snapshot. Shell admin không đọc DB, từng màn tải endpoint riêng.
- Public SSR và `/api/public/website` dùng projection DB đã lọc. Không trả tenant/customer/contact nội bộ, hold expiry, điều khoản hợp đồng hoặc tài liệu private. DB lỗi không seed/chuyển sang fixture.
- Form dùng `@mall/ui/forms` live → `POST /api/contact`; chỉ báo nhận sau transaction commit lead/intake **và durable notification outbox**. Đề nghị tham quan **không phải booking** và không tự tạo lịch hẹn đã xác nhận. Cron chuyển tiếp tới Render; form không chờ provider/cold start.

**Owner xác nhận dự án không triển khai trên Vercel.** Không dùng HTTP header để suy ra deployment. Release target là Cloudflare Worker stage2; Render bot riêng. Wrangler khai báo `NEON_BRANCH=lgc-bot-test`, nhưng source đọc runtime secret `DATABASE_URL`, nên label này không xác minh DB branch của deployment. Local `.env.local` trỏ Neon `production`. Lần xác minh schema gần nhất ghi nhận hai branch 001–013; checkout hiện có migration 014/015 và floor-plan source cần schema 015 trước release. Build/deploy không migrate DB. Xem [deployment runbook](docs/deployment.md) và [database guide](database/README.md).

## Chạy local với cloud thật

Yêu cầu Node **22.22+** (`node:util.parseEnv`) và quyền đọc cả hai submodule private.

```sh
git clone --branch dev https://github.com/bangnt188/le-grande-center.git
cd le-grande-center
git submodule update --init --recursive -- packages/ui packages/backend
npm ci
npm run dev -- --port 3000
```

Operator cấu hình duy nhất **`.env.local`** (gitignored), trỏ tới Neon branch `production` (`br-tiny-butterfly-b3uuw92p`). Local ghi dữ liệu production thật, không phải sandbox. Worker `DATABASE_URL` và Auth/function secrets là runtime bindings cần xác minh riêng; `NEON_BRANCH=lgc-bot-test` chỉ là nhãn Wrangler. Wrangler bind R2 buckets `mall-documents` và `mall-assets`, vì vậy stage2 không được coi là cô lập khỏi các bucket này. `npm run dev`, `npm start`, `npm run db:migrate` và `npm run auth:set-password` nạp `.env.local` qua `scripts/load-local-env.mjs`, ghi đè các biến cùng tên còn sót từ shell. Không dùng nhiều profile hoặc Node `--env-file` để spawn Next dev.

Mở `http://localhost:3000/admin/`. Private PDF dùng `mall-documents`, public catalog dùng `mall-assets`; bindings Wrangler `remote: true` thao tác R2 thật cả khi dev. Xem [cấu hình Neon và secrets](docs/neon-setup.md), [readiness và bằng chứng runtime](docs/backend-readiness.md).

## Build, checks và CI

```sh
npm run check:backend
npm run typecheck
npm run test:backend
npm run test:admin
npm run build
npm run build:cloudflare
```

`build` tạo Next standalone; postbuild sao chép public/browser static assets vào artifact. `PORT=3000 HOSTNAME=127.0.0.1 npm start` chạy server.js thực và nạp canonical `.env.local`; không dùng next start với standalone. `build:cloudflare` chạy OpenNext (bao gồm cùng Next build). Cả hai lấy một public projection từ `/api/public/website/` của Worker hiện có để prerender các trang public cố định; có thể chỉ định `PUBLIC_BUILD_ORIGIN` qua shell (HTTPS, hoặc loopback HTTP). Nguồn không truy cập được/DTO không hợp lệ làm build thất bại, không tạo dữ liệu thay thế. Admin/API không prerender; 81 căn được cache theo yêu cầu đầu tiên, build process không kết nối DB trực tiếp. Build thành công không chứng minh quyền hoặc CPU quota production.

`scripts/build-cloudflare.mjs` tạm giấu các envfile chuẩn `.env*` mà OpenNext có thể nhúng vào bundle, rồi khôi phục trong `finally`. Dùng script này thay gọi trực tiếp OpenNext build. `scripts/public-build-env.mjs` chỉ sao chép các trường public DTO và gắn content hash để không dùng lại dữ liệu của build trước khi nội dung đổi. Snapshot chỉ được đọc trong production-build phase; runtime vẫn cần `DATABASE_URL`, không fallback vào snapshot build. DB/auth/media/API secrets được cấp riêng ở Worker runtime; không đưa secrets vào `NEXT_PUBLIC_*`, Git hoặc artifact.

Deployment Cloudflare Worker:

```sh
npm run deploy
```

Lệnh build OpenNext rồi deploy cùng artifact tới Worker hiện có `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev`; không có deploy alias theo môi trường. Wrangler chỉ có một root config; config label `NEON_BRANCH=lgc-bot-test` không chứng minh runtime `DATABASE_URL`. Private cache R2 `le-grande-centre-stage2-next-cache`, D1 `le-grande-centre-stage2-next-tags` và tên Worker giữ hậu tố `stage2`. Cache không authoritative cho admin/auth hoặc intake. Worker giữ noindex; không đổi DNS. Xác minh schema 015 và runtime secrets theo [deployment runbook](docs/deployment.md) trước release.

`readPublicWebsite()` chia sẻ projection giữa layout/metadata/page trong request và cache dữ liệu thành công với revalidation 60 giây. Root public dùng ISR 60 giây; `/mat-bang/[unitId]` trả `generateStaticParams: []` để render/cache từng căn theo yêu cầu. OpenNext cache interception trả HTML/RSC từ private R2/regional cache trước React SSR, luôn kiểm D1 tags; giữ phân biệt HTML, RSC và segment prefetch. Admin/auth/private APIs vẫn dynamic/no-store; `/api/auth/*` có HTTP `private, no-store` rõ ràng.

Sau committed admin command/upload/review, `invalidatePublicWebsite()` expire tag cho cả data/full-route cache; Worker đợi D1 ghi tag trước HTTP thành công. Đã kiểm chứng mutation thực trên PostgreSQL tạm có attestation → HTML/RSC và cả sáu route public thấy nội dung mới ngay → hoàn nguyên; Workerd/R2/regional cache cũng bỏ bản cũ sau D1 hard expiration. TTL dùng stale-while-revalidate: có thể phục vụ bản cũ trong lúc refresh hoặc giữ bản thành công trước khi DB lỗi; không phải cam kết availability hoặc tự refresh tab/layout đang mở. Intake dùng `readPublicWebsiteData()` uncached và transaction authoritative. Cache miss đọc projection public gọn qua một HTTP transaction, không tái sử dụng query hồ sơ admin hoặc giữ socket xuyên Worker requests.

`public/_headers` chỉ đặt browser cache một năm/immutable cho `/_next/static/*` có fingerprint; không cache HTML/API bằng `_headers` hoặc thêm Pages `_routes.json`. Static assets tiếp tục được ASSETS phục vụ không chạy Worker. HTML/RSC cache hit vẫn chạy routing + R2/D1 trong một Worker; không bật native Workers Cache, không tăng quota/đổi billing và không bảo đảm mọi cold miss dưới CPU limit. Bản cache HTML/RSC này đã kiểm chứng local, chưa deploy; chi tiết [readiness](docs/backend-readiness.md#cache-public-htmlrsc--16102026-chưa-deploy).

Link sơ đồ/danh sách căn không tự prefetch hàng loạt; chỉ hai link căn trước/sau prefetch đầy đủ nội dung để chuyển nhanh khi request nền đã xong. `experimental.staleTimes` giữ dynamic mặc định 0 và giới hạn full-prefetch/static client cache ở 60 giây thay vì 5 phút; đây không tự refresh layout đang mở hoặc thay cơ chế xác nhận availability khi ghi. `/mat-bang/` có loading boundary dùng shared `LoadingIndicator`.

Admin tải theo màn, browser memory cache private60 giây và in-flight dedupe; không có aggregate `/api/admin/workspace/`. Collections và Media phân trang server; Media mặc định24 mục, không preload originals/video/PDF. Mutation trả `{revision,entityId}` (upload thêm `mediaIds`), không snapshot; chỉ màn active refetch sau invalidation. Revision CAS lấy từ đúng page/detail đang sửa, không từ picker khác. Chi tiết session900s, hai quyền, lease metadata và release gate: [admin data contract](docs/admin-data-contract.md).

Ảnh public có preview/thumbnail WebP responsive, còn lightbox dùng bản gốc. `npm run media:responsive` tạo manifest/checksum và 116 derivative từ 13 ảnh nguồn approved; không ghi đè nguồn. Publish đúng keys trong `scripts/responsive-images.manifest.json` lên public R2 trước deploy, kiểm bytes/SHA-256. Keys chứa content hash nên được cache `public, max-age=31536000, immutable`; không đăng ký derivative thành media nghiệp vụ. Hero mobile giữ cover crop cũ; typography không đổi, chỉ bỏ preload Playfair không critical.


Workflow `.github/workflows/backend-ci.yml` chỉ typecheck, pure application/shared backend tests, integrity và build Next/OpenNext. Environment có tên lịch sử `github-pages` chỉ giữ quyền truy cập secret submodule; không có Pages/deployment job. CI dùng `COMPONENT_UI_READ_TOKEN` đọc cả `packages/ui` và `packages/backend`; không fetch archive 3D. Không có CF/Neon CI secrets và không giả cloud tests.

`npm run test:database` là regression tích hợp trên **PostgreSQL local disposable do runner sở hữu**; cần `postgres`, `initdb`, `pg_ctl` trên `PATH` (macOS có thể cài qua Homebrew). Runner không tạo Neon test branch hoặc clone production; tự khởi tạo cluster rỗng, chạy rồi dừng/xóa đúng cluster của nó. `npm run db:migrate` nạp `.env.local` và chỉ dùng **`DATABASE_URL_UNPOOLED`** direct URL, không override pooled `DATABASE_URL`. Xem [database guide](database/README.md). Migration không phải một bước build/deploy.

Với runtime đang chạy và Chrome/Chromium có sẵn:

```sh
npm run smoke:public -- http://localhost:3000/
```

Đặt `CHROME_BIN` nếu cần. Smoke public không thay các kiểm tra auth/DB/media. Kết quả đã quan sát và giới hạn hiện tại nằm trong [backend readiness](docs/backend-readiness.md); không suy một build pass thành toàn bộ runtime pass.

## Auth, dữ liệu và nghiệp vụ

Trang `/admin/` dùng email + mật khẩu qua Neon Auth; không Google OAuth. Trong mục **Cấu hình → Tài khoản nhân viên**, Administrator cấp email và vai trò **Administrator** hoặc **Editor**. Nhân viên tự tạo mật khẩu và xác minh email; signup không tự cấp quyền. Editor không được quản lý tài khoản hoặc cấu hình hệ thống ở server. Root giữ allowlist riêng và không xuất hiện trong danh sách nhân viên. Mutation yêu cầu cùng origin. Đổi/thu hồi quyền có thể trễ tối đa **15 phút** do signed cookie cache; không cam kết immediate remote revoke.

Ngày 15/10/2026, owner đã duyệt reset application DB: baseline+migrations `001`–`009` giữ catalog approved 6 tầng/81 căn, root allowlist và approved Neon logo; không còn dữ liệu nghiệp vụ khách hàng/thuê/lead/lịch hẹn cũ. Provider Auth/storage được giữ; Auth chỉ còn root. Sau đó tạo `lgc-bot-test` cho stage2. Lần xác minh schema gần nhất ghi nhận `production` và `lgc-bot-test` có migrations 001–013; migration 014/015 chưa được xác minh trên live branch, còn 015 pending trong checkout. Floor-plan source hiện đọc schema 015; xác nhận/áp migration và seed trên đúng runtime branch trước release. Không backfill notification cho lead cũ. Root login HTTP 200 không chứng minh source mới đã được phát hành. Snapshot trước reset và private backup được ghi tại [database guide](database/README.md). Build/deploy không chạy migration; cập nhật Worker không đổi DNS/custom domain.

Admin quản lý tầng/mặt bằng, doanh nghiệp, lead, yêu cầu/giữ chỗ, hồ sơ thuê, lịch hẹn và media. Lịch hẹn tách khỏi giữ chỗ. **Ghi nhận thuê không bắt upload PDF**: hợp đồng gốc lưu nội bộ; hệ thống lưu reference/note, actor/time/company/space/period thật, không eSign hay tự xác nhận chữ ký. Migration011 phải áp dụng trước release ứng dụng mới; lease mới không cần document link, lịch sử/file private cũ giữ nguyên. Generic media PDF vẫn có review/retention riêng.

Sidebar chỉ có **Doanh nghiệp**, không mục Khách đang thuê/Hợp đồng riêng; outer `@mall/ui Tabs` bên trong gồm **Tất cả / Khách đang thuê / Hợp đồng**. Category card suy ra ưu tiên recorded lease → Đang thuê; else active hold chưa hết hạn → Đang giữ chỗ; else submitted/reviewing request → Đang tư vấn; else Chưa thuê. Không persist category riêng. Dossier→contract giữ đúng record ID qua subtab, unsaved-note confirmation giữ nguyên; arrow keys focus/Enter activate tabs. Global `AdminPageHeader` title/description/reload đã bỏ trên mọi màn, giữ local panel headings và error-only Thử lại khi empty workspace cần phục hồi.

**Bằng chứng lịch sử trước reset:** trang đăng nhập/tạo tài khoản từng được mở trong Chromium local; staff invitations/Admin↔Editor/revoke/editor-deny/root-hidden chạy trên nhánh Neon test riêng. Giai đoạn đó `test:admin` 24 pass/1 deliberate live skip và `test:database` 2/2 pass; nhánh test đã xóa, không còn là cách chạy regression hiện tại. Các kết quả lịch sử không chứng minh email verification delivery hoặc trạng thái dữ liệu sau reset. Bằng chứng mới nhất xem [backend readiness](docs/backend-readiness.md).

Cấu hình website lưu DB và public đọc projection, không giới hạn cùng browser/origin. Public projection không chứa workspace riêng tư. Form contact kiểm tra consent/server fields, JSON tối đa 16 KiB, origin, UUID idempotency và rate limit DB với HMAC IP; cần proxy đáng tin cho `cf-connecting-ip`. Không có Turnstile hoặc cam kết chống abuse toàn diện.

Chi tiết: [backend structure](docs/backend-structure.md), [portability](docs/database-portability.md), [B2B design](docs/b2b-leasing-design.md), [ADR](docs/adr/0001-b2b-leasing-and-private-documents.md). Các tài liệu thiết kế lịch sử không thay trạng thái runtime hiện tại trong readiness.

## Notification lead → nhiều nhóm Zalo + Gmail

Đọc [kiến trúc và launch checklist](docs/notification-architecture.md) và [AGENT.md](AGENT.md). Website và bot **không dùng chung DB**: website giữ lead + `leasing.contact_notification_outbox`; Render giữ registry/key hash, recipient snapshot và queue riêng.

- `NOTIFICATIONS_URL` là **full endpoint** `https://zalo-render-bot.onrender.com/v1/notifications`, không phải service origin `baseUrl` của SDK. `NOTIFICATIONS_API_KEY` chỉ ở server. Key mới chỉ được giao qua **PRIVATE owner**, không tự DM người dùng cuối; owner cài/chuyển riêng cho backend, không in key ra terminal/log hoặc đưa vào form/browser/group/help/metadata.
- PRIVATE owner: `/site issue https://example.com 3 5` cấp3tháng/cap5; `/site rotate https://example.com 6` đổi key6tháng từ bây giờ; `/site gmail https://legrandecentre.vn ntmcongty@gmail.com` đặt mailbox nhận. Owner cài key vào backend. Xem [bảng đầy đủ lệnh](docs/notification-architecture.md#owner-chatbot-administration); `/site list 2` xem trang2.
- Chat bắt buộc tháng1–120, cap1–100; tháng lịch UTC giữ giờ, clamp cuối tháng (31/01 +1tháng → 28/02 hoặc29/02), không cộng vào expiry cũ. CLI vẫn dùng `--expires-days` mặc định90 ngày/range1–3650; registry/CLI cap mặc định3.
- Issue/rotate + durable owner notification commit cùng transaction; mutation `/site` còn lưu receipt `ready`/reply metadata an toàn để crash/replay cùng inbox message không cấp/rotate lần nữa. Key không lưu normal reply/prompt/chat memory, chỉ plaintext pending queue giao owner và xóa sau provider ACK; không network trước commit.
- Issue xong, chủ bot gửi `/init https://legrandecentre.vn/` trong từng **GROUP**; `/init` chỉ trong nhóm, `/site` chỉ PRIVATE (GROUP bị từ chối cả với owner), đều không AI/quota. Bind lặp idempotent; private non-owner chỉ nhận đúng `Liên hệ chủ sở hữu để mở khóa tính năng`, không AI/tools/quota/context.
- `POST /api/contact` commit lead/intake + **2 outbox job Zalo/Gmail** cùng transaction, không chờ Render. Key độc lập `contact:<intake-id>:<channel>`; retry/lostACK giữ payload. Chỉ receipt200/202 đúng channel mới clear job đó; Gmail lỗi không chặn/gửi lại Zalo đã thành công. Render queue at-least-once, không exactly-once.
- `POST /api/internal/notifications/dispatch/` dùng Bearer **`NOTIFICATION_DISPATCH_SECRET` riêng ≥32 ký tự**, không website key/webhook secret. Local cần scheduler/manual protected call; Next dev không tự chạy cron. Cloudflare wrapper chạy cron `* * * * *` qua self-binding cho DB stage2.
- Mỗi đợt dispatch tự thử **tối đa3 lần**, timeout40giây/lần, cùng key/payload; ACK hợp lệ thì dừng. Cả3 lỗi vẫn giữ outbox để cron thử đợt sau, không bỏ lead. Không followredirect; dùng `manual` phù hợp Cloudflare.
- Lần xác minh live gần nhất ghi nhận migrations 011–013 trên hai DB; chưa có xác minh migration 014/015 cho checkout hiện tại. Email nhận `ntmcongty@gmail.com` lấy từ DB contact website. Render còn thiếu4 OAuth sender variables nên Gmail job vẫn pending/retry, chưa xác nhận gửi mail thật. Owner chọn Render Free+Cloudflare health mỗi5phút; không hứa luôn sẵn sàng khi restart/outage. Không deploy Vercel.


## Media và storage

- PNG/JPEG/WebP được kiểm tra size/signature/dimensions, decode và re-encode pixels bằng Photon trên Node trước upload; bỏ metadata/trailing payload. Tối đa 4096 px mỗi chiều, 4 megapixel, 10 MiB/file; tối đa 4 file/20 MiB mỗi batch.
- Logo/favicon/ảnh upload nằm trong **Neon Object Storage `media`**, không dùng R2/static/browser persistence làm fallback logo. Ảnh/video/brochure dự án đã duyệt tiếp tục đọc R2 public `mall-assets`.
- App gọi `NEON_MEDIA_FUNCTION_URL` với server-only `MEDIA_ORIGIN_SECRET` qua `x-secret`. `src/server/media/neon-function.ts` là trusted storage origin, không endpoint upload anonymous: constant-time secret check trước đọc body, key allowlist, bounded PNG/JPEG/WebP. AWS S3 write keys chỉ ở origin. App vẫn phải authorize ownership/quota/reservation trước hop này.
- PDF giữ nguyên bytes trong R2 private `mall-documents`, mặc định quarantine. Xem bình thường bị chặn; admin có thể tải riêng để **kiểm tra bên ngoài thủ công**, rồi ghi xác nhận và review note qua API. Không có antivirus, không gọi manual review là scan-clean/chữ ký hợp lệ.
- Private GET/HEAD/Range qua `/api/admin/media/{id}/view` resolve ID/key từ DB và xác minh quyền mỗi request; không public bucket/presigned URL cho browser. Retention/link hợp đồng chặn xóa; xóa vật lý xong mới giảm ledger.
- Quota app 8,500,000,000 bytes gồm inventory thực của public `mall-assets` + tracked Neon/private + reservations; inventory/ledger mismatch hoặc không đọc được inventory sẽ khóa upload. Đây không phải provider-wide spending cap. Xem [quota](docs/storage-quota.md), [private documents](docs/private-documents-r2.md).

**Giới hạn deployment:** các probe trước đây ghi nhận native fetch từ Cloudflare Worker tới Neon S3/Functions trả 403 HTML trước provider, trong khi Node request thành công; một lần probe cũng truy cập được Neon Auth. Đây là bằng chứng theo thời điểm, không xác nhận Auth tenant hoặc secret hiện gắn với deployment. Trusted media origin chưa chứng minh giải quyết cross-zone denial. Không tuyên bố all-Worker media ready; local Node + real remote R2 proof không phải production Worker proof.

Chuyển tài khoản/provider: chuyển schema+migrations và dữ liệu quan hệ, object keys/catalog cùng metadata size/hash đã xác minh; copy bytes, đối soát trước đổi locator/public URL. Không export/import opaque snapshots hoặc lưu signed URL dài hạn. Không sửa DNS để lách giới hạn này khi người dùng đã hoãn domain.

## Website public

Tên thương hiệu **Le Grande Centre**; public display dùng Charis SIL, body Be Vietnam Pro; brand/legacy editorial giữ Playfair Display. SEO mặc định `https://legrandecentre.vn/`; `NEXT_PUBLIC_SITE_URL` ghi đè domain/base path. Worker hiện có giữ `SEO_INDEXABLE=false`; index chỉ bật chủ động khi custom-domain production đã được duyệt. Metadata/canonical và sitemap lấy public DB catalog, không private admin/3D routes.

Homepage `/` chỉ render `src/features/public/homepage-v2.tsx`. Hero giữ ảnh dự án `images/home-v2/hero.webp`. Phim dùng `PROJECT_FILM_URL` R2, không local MP4/poster/thumbnail; autoplay muted/loop/inline, có nút Bật/Tắt âm thanh. Video dừng ngoài viewport/tab ẩn/reduced motion. Public navigation dùng chung header/footer: Không gian kinh doanh `/tong-quan-tang/`, Le Grande Centre `/tong-quan/`, Đặt lịch tham quan `/lien-he/`, Mặt bằng `/mat-bang/`. Zalo giữ xanh nhận diện `#0068ff`; hotline và Zalo cấu hình độc lập.

Phim không có `src` trong SSR và giữ `preload="none"`. Chỉ gắn nguồn khi ít nhất 15% video vào viewport, cùng ngưỡng với shared playback controller; controller tự phát khi được phép, không dùng native `autoPlay` để vượt chính sách offscreen/reduced-motion. Không tải MP4 chỉ để lấy metadata ở mép viewport.

`/mat-bang/` giữ Map/List loại trừ nhau, filter, popup trước khi điều hướng chi tiết, Escape/focus return và brochure đúng trang tầng. Tầng 1–2 có hai sơ đồ/22 căn A/B; khách có thể thuê từng căn hoặc kết hợp cặp liên thông, không ép thuê gộp. Chi tiết `/mat-bang/[unitId]/` dùng gallery ảnh dự án tham khảo, không ảnh bàn giao từng căn; map floating icon-only 48px ở trên trái dưới header. CTA tư vấn/tham quan giữ mã căn cho intake live; brochure không phải booking. Không suy dữ liệu kỹ thuật/giá/availability từ hình template.

Homepage giữ cảnh tách lớp **2D** có motion/reduced-motion trong `@mall/ui`; không nhầm với source 3D đã gỡ. Theo yêu cầu 13/10/2026, `/kham-pha/`, viewer links và publication JSON không xuất bản. Source/lịch sử liên quan nằm tại https://github.com/bangnt188/3d-model-mall, submodule `archives/3d-model-mall`; archive không thuộc TS/workspaces/build CI. GLB/HDR/cover còn trên R2 public theo lựa chọn người dùng; tách source không thu hồi direct asset URL.

## Shared UI/backend

`packages/ui` là `component-ui`, nhánh `shopping-mall`, package `@mall/ui`; `packages/backend` là `lib-ts-be`, nhánh `main`, package `@shared/backend`. Gitlink khóa commit build; không tự cập nhật nhánh trong CI. Shared UI không phụ thuộc dữ liệu/route/service của app; shared backend giữ primitives, không thay workflow leasing.

```sh
npm run preview:ui
npm run typecheck:ui
npm run pull
```

`pull` cập nhật hai submodule từ nhánh cấu hình và dừng khi có thay đổi chưa commit; review rồi commit gitlinks/lockfile ở root. Không dùng command này trong build. Clone thông thường checkout submodule detached HEAD là đúng. Cần Git credentials đọc cả hai repo.

```tsx
import "@mall/ui/styles";
import { Button } from "@mall/ui";

<main data-ui-root data-ui-theme="shopping-mall" data-ui-scheme="light">
  <Button>Liên hệ tư vấn</Button>
</main>
```

Dùng semantic tokens; popup kế thừa theme root. Motion/forms/toasts thuộc shared UI, nội dung/validation nghiệp vụ thuộc app. Xem [theme contract](packages/ui/docs/shopping-mall-theme.md) và [design](DESIGN.md).
