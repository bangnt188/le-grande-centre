# Backend readiness — phase 2

Cập nhật source 18/10/2026. Owner xác nhận dự án không triển khai trên Vercel; release target hiện tại là Worker stage2. Session 15 phút + per-screen admin ở [admin data contract](admin-data-contract.md) và versioned floor-plan projection là contract của checkout này; chưa có release record chứng minh source SHA hiện tại đang chạy trên Worker. Hai branch có lần xác minh schema gần nhất đến migrations 001–013; checkout hiện có 014/015, trong đó source plan queries cần schema 015. Migration completion không chứng minh app code đã deploy. Các bằng chứng Worker bên dưới giữ phạm vi/lịch sử lần phát hành.

## Đã triển khai

| Boundary | Implementation hiện tại |
| --- | --- |
| Runtime | Next App Router SSR (`output: standalone`), OpenNext Cloudflare; admin/API cùng origin. Không static export/Pages hoặc deploy-dev-pages. |
| Auth | Neon email/password, verified email + allowlist/issuer/subject khi mint signed cookie `HttpOnly/Secure` tối đa900s; warm request verify cục bộ, không provider/DB permission lookup. Renew chỉ từ thao tác khi thiếu/hết cache, không sliding/timer/focus/poll. Revoke trễ tối đa15 phút. Administrator/Editor; root giữ riêng/ẩn khỏi staff. |
| DB | Admin/write dùng một request-local Neon transaction `leasing_runtime` với actor context/RLS, expiry precommit, property lock, CAS/idempotency/business audit. Không generic access-decision write trên warm admin reads, không re-authorize DB trong cùng operation. Public miss giữ một Neon HTTP transaction gọn. |
| Schema | Lần xác minh live gần nhất trong [database guide](../database/README.md) ghi nhận hai branch `production` (`br-tiny-butterfly-b3uuw92p`) và `lgc-bot-test` (`br-wispy-morning-b33h15x4`) có baseline+migrations 001–013. Migration 014 được ghi nhận chưa áp dụng; 015 pending trong checkout và source hiện cần 015. Chưa recheck live schema cho checkout này. |
| Public | SSR và `/api/public/website` dùng projection DB đã lọc; React request dedup + cache revalidation 60 giây. Worker dùng private R2 incremental cache, D1 tag cache và DO queue. Mutation đợi D1 expiration sau commit trước HTTP thành công; API/SSR immediate-read đã qua ba vòng có hoàn nguyên. Intake bỏ qua render cache. Không trả tenant/contact nội bộ, hold expiry hoặc hợp đồng; không fixture khi DB lỗi. |
| Intake | `@mall/ui/forms` live → `POST /api/contact`, cap JSON 16 KiB, consent/field/origin validation, UUID idempotency, HMAC IP + DB cooldown/rate limit. Commit lead/intake trước HTTP 201; visit request không tạo/xác nhận booking. Không có Turnstile. |
| Media | Bounded multipart, PNG/JPEG/WebP decode/re-encode trên Node; Neon-only logo/ảnh upload, R2 private PDF; DB ownership/quota/reservations, inventory và cleanup/reconcile. |
| Tài liệu | PDF quarantine; ordinary view 403 trước manual external review. Review ghi actor/time/note/hash, không đặt scan-clean hay xác nhận chữ ký. GET/HEAD/Range kiểm tra quyền, retention/link chặn xóa. Không soạn hợp đồng/eSign. |

## Media origin và secrets

`src/server/media/neon-function.ts` là protected trusted server origin. App gọi `NEON_MEDIA_FUNCTION_URL` với `x-secret: MEDIA_ORIGIN_SECRET`; function kiểm tra constant-time secret (ít nhất 64 ký tự) trước body/storage. Chỉ GET/PUT/DELETE key branding UUID đã giới hạn và key logo approved (không PUT), PNG/JPEG/WebP tối đa 10 MiB, có signature/dimension checks. Không phải public arbitrary object proxy. App authorize session/property/quota và durable reservation trước hop này. AWS S3 keys chỉ tại origin; cookie/DB/HMAC/media-origin secrets đều server-only.

`scripts/build-cloudflare.mjs` giấu envfiles chuẩn trong lúc OpenNext bundle rồi khôi phục. Không gọi trực tiếp OpenNext build với file chứa secret. DB/auth/media secrets được cấp ở Worker runtime, không commit/bundle hoặc dùng `NEXT_PUBLIC_*`.

`mall-assets` là public R2 project catalog; private PDF dùng **`mall-documents`** cho cả local và Worker hiện có. Wrangler dev bindings `remote: true` thực sự đọc/ghi cloud. Meter bao gồm inventory public + tracked Neon/private + reservations, không chỉ uploaded list; mismatch/unavailable inventory khóa upload. Reset application DB không có nghĩa mọi object bucket đã bị xóa. Xem [quota](storage-quota.md).

Private cache R2 `le-grande-centre-stage2-next-cache` và D1 `le-grande-centre-stage2-next-tags` không nằm trong public `mall-assets`. Worker target là `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev`; `wrangler.jsonc` đặt nhãn `NEON_BRANCH=lgc-bot-test`, nhưng source kết nối bằng runtime secret `DATABASE_URL` và deployment value chưa được xác minh. R2 bindings chỉ rõ bucket names `mall-documents`/`mall-assets`; Auth/function targets cần xác minh riêng. Repo chỉ có một Wrangler root config và `npm run deploy` nhắm stage2. Owner xác nhận dự án không triển khai trên Vercel. Không dùng domain response/header để suy ra hosting hoặc source runtime.

Server cache TTL dùng stale-while-revalidate, không bảo đảm dữ liệu luôn mới đúng 60 giây khi DB lỗi. `invalidatePublicWebsite()` chỉ chạy sau committed mutation, gọi `revalidateTag` và trên Worker đợi chính D1 adapter ghi expiration trước response; không chỉ phụ thuộc pending `waitUntil` của Next route handler. Regional cache luôn kiểm D1 tags, không lazy-renew timestamp của bản cũ. Browser full-prefetch chỉ cho căn trước/sau, cache client giới hạn60 giây; sơ đồ/danh sách không prefetch hàng loạt. Không tự refresh tab/layout đang mở. Form intake đọc authoritative DB; admin provider/identity chỉ authoritative lúc mint/refresh session cache.

## Admin latency — 17/10/2026 (chưa deploy)

Đã cắt aggregate workspace/auth-per-request sang signed cookie900s + per-screen
reads, memory cache60s, receipt-only writes, server Media pagination và metadata-only
leases. Source/migration/security/release contract: [admin data contract](admin-data-contract.md).
Orca dùng một coordinator và hai worker: Antigravity `gemini-3.8-flash-high`
(high), OMP `openai-codex/gpt-6.1-sol`; các dispatch đã hoàn tất/release.

| Check thực chạy | Kết quả |
| --- | --- |
| Application regressions | 51 pass,1 live skip |
| Shared backend regressions | 105 pass |
| Owned PostgreSQL integration | 4 pass; migration/seed apply hai lần, cluster đã dọn |
| Application TypeScript + Next production build | Pass |
| Cloudflare build | Exit0; `.open-next/worker.js` được tạo; envfile khôi phục |
| HTTPS shell | 200 với0 query DB /0 provider |
| Warm business API families | 0 provider /0 self-identity lookup /0 generic access audit |
| Browser expiry / logout | Idle0 renew, action1 POST; logout1 DELETE, cookie mất, API401 |
| Browser Media | 24+7 mục; originals chỉ sau click; preview unmount khi rời màn |
| Browser B2B | Request→review→hold→lease không PDF; appointment create→confirm→cancel |

Staff listing vẫn cần query allowlist để trả dữ liệu quản lý tài khoản, không phải
tra lại quyền của caller. Browser còn kiểm selected-company relationship paging,
record-id detail, tenant empty search giữ focus, form-only floor/default dependencies,
Website logo picker20 và staff-only-on-tab. Tampered cookie401 và cross-origin403
trước DB/provider; Editor bị chặn staff/settings; DB kiểm CAS/replay/property và
expiry-precommit rollback.

Smoke dùng actual Next HTTPS + PostgreSQL disposable và managed-provider fixture,
không cloud mutation/live credentials. Cloudflare build dùng projection public thật
của owned runtime6 tầng/81 căn. Migrations 011+012 hiện đã áp dụng theo [database guide](../database/README.md); không có HAR sau deploy nên không khẳng định latency production đã giảm xuống một con số nào.
Neon live/provider mail, upload cloud và Workerd CPU quota chưa được smoke lần này.
Build vẫn có cảnh báo thư viện UI về `use client` và OpenNext Node middleware
experimental; không che/suppress chúng hoặc suy build pass thành Worker runtime pass.

## Cache public HTML/RSC — 16/10/2026 (chưa deploy)

- Root `revalidate=60`, năm trang public cố định được prerender; `generateStaticParams: []` cho căn để fill cache theo yêu cầu, không prerender 81 căn. OpenNext interception dùng R2/regional cache và D1 tags hiện có, giữ HTML/RSC/segment-prefetch variants. Admin/auth/private APIs không vào full-route cache; auth HTTP response bổ sung `private, no-store`.
- Build standalone/Cloudflare cùng bootstrap một lần từ public API của Worker hiện có (`PUBLIC_BUILD_ORIGIN` có thể đổi nguồn). DTO whitelist bỏ mọi trường private, hash nội dung tách cache build; thiếu nguồn hoặc DTO sai làm build thất bại. Snapshot chỉ dùng lúc build, không phải runtime fallback. Scan artifact cuối: **1.687 files, 13 credential candidates, 0 matches**; `.env.local` được khôi phục.
- [`public/_headers`](https://developers.cloudflare.com/workers/static-assets/headers/) đặt một năm/immutable chỉ cho `/_next/static/*` fingerprinted. Không dùng Pages `_routes.json`, không thêm Worker/Neon branch/native Workers Cache, không đổi billing/CPU quota.
- Kiểm chứng: typecheck, application tests **35 pass/1 deliberate live skip**, OpenNext build; actual Workerd HTML/RSC `HIT`, private routes `no-store`/API admin thiếu session **401**, static JS immutable. D1 hard expiration thực: **HIT → MISS → HIT** cho HTML và RSC; TTL thực **62 giây → STALE → queue cùng Worker tái tạo → HIT**. Auth provider thật + PostgreSQL disposable có attestation: committed website update → cả sáu public routes và RSC thấy marker ngay → restore xác nhận; không mutation production DB.
- Chrome **1440/390px**: HTML cache hydrate, sơ đồ đủ **23 links**, Escape trả focus, C.5 → C.6 → visit form đúng query C.6, **0 document reload/0 overflow/0 runtime errors**; browser nhận **14 cached RSC responses**.

| Local Workerd C.5, một lượt smoke | Wall time |
| --- | ---: |
| First document MISS, có render | 700 ms |
| Warm document HIT | 17,1 ms |
| Warm RSC HIT | 7,5 ms |

Đây không phải CPU ms, p95 hay benchmark production. HIT bỏ React SSR nhưng vẫn chạy routing/R2/D1; cold miss, revalidation, admin và auth vẫn dùng CPU. Cache TTL có thể giữ bản thành công cũ khi DB lỗi; không bảo đảm Error1102 biến mất hoặc refresh tab/layout đã mở. Mutation trong lúc build/deploy cũng không phải giao dịch đồng bộ với public snapshot build; availability khi ghi luôn được kiểm bằng DB.

## Snapshot lịch sử reset — 15/10/2026

- Tại thời điểm reset, Local dùng `.env.local`; `scripts/load-local-env.mjs` ghi đè inherited shell values cho dev/start/migration/password command. Worker ban đầu cùng trỏ production; sau đó được chuyển sang `lgc-bot-test`. Hiện trạng hai target xem [database guide](../database/README.md).
- Ngay sau reset chỉ còn branch `production`; sau đó tạo `lgc-bot-test` riêng cho stage2. Baseline+migrations 001–009 tạo catalog 6 tầng/81 căn approved, không còn customer/lease/request/lead/appointment cũ. Root/approved logo được khôi phục, provider Auth/storage được giữ, chỉ root Auth user còn lại.
- Root login trên cấu hình đã hợp nhất trả HTTP 200. Regression DB mới trên owned disposable local PostgreSQL **2/2 pass**; không tạo Neon test branch.
- Snapshot production trước reset: `snap-misty-sea-b3tgf6is`, tên `before-single-production-reset-20261015`, hết hạn **2026-10-22T23:59Z**.
- Private dump dữ liệu application cũ:
  `/Users/suntech/Library/Application Support/LeGrande/backups/2026-10-15-single-production/stage2-application.dump`,
  **298,708 bytes**, mode **0600**. Đây là backup operator-local, không một DB đang chạy. [Database guide](../database/README.md) ghi phạm vi/giới hạn.
- Tại snapshot 15/10 chưa có custom-domain/DNS cutover evidence. Không dùng domain response/header để kết luận hosting hay source commit. Owner xác nhận dự án không dùng Vercel; release target là Worker stage2. Private media Worker và tính ổn định mọi request chưa được chứng minh; xem [deployment runbook](deployment.md) và giới hạn CPU ở dưới.

### Kiểm chứng sau cutover

- Bản cache/cutover `93f7a38d-d53a-481c-8021-db89bde4af02`; bản giảm SSR payload mới nhất `7a46cff3-ab8f-4d74-9074-675445d30492`. Cả hai OpenNext build/deploy thành công.
- Root login HTTP 200, reload workspace HTTP 200; local standalone `localhost:3121` và Worker đọc cùng revision **17**, 6 tầng/81 căn, companies/leases/requests/leads/appointments đều **0**. Local logout hoàn tất → `/admin/`, protected API **401**.
- Authenticated mutation: ba vòng đổi description tầng 6 → đọc ngay public API và SSR `/mat-bang/` đều thấy marker mới → restore description gốc và đọc API xác nhận restore. Không còn marker hoặc dữ liệu giao dịch thử. Thời gian API+SSR từng vòng 581/307/355 ms, không phải p95.
- Raw Chromium page riêng, sau adjacent prefetch hoàn tất, C.2→C.3→C.4→C.5: desktop 1440px **60/44/40 ms**, mobile 390px **35/38/34 ms**, không overflow. Đây là click-to-content đã preload, không cold-load/network latency.
- Checks trước bước giảm SSR payload: typecheck pass; `test:admin` **30 pass/1 deliberate live skip**; owned local PostgreSQL `test:database` **2/2 pass**, apply migration/seed hai lần và cleanup cluster. Bản giảm payload sau đó đã qua Next typecheck/Next/OpenNext build và runtime UI thực, không thêm test mô phỏng markup.
- Trace thật bắt được `/admin/workspace/`, `/api/admin/workspace` và direct document `/mat-bang/C.5/` **Exceeded CPU Limit / Worker exceeded CPU time limit**; Chromium thấy public **Error 1102**, nên warm navigation nhanh không đủ để coi website ổn định. Một số probe khác trả auth/authorization 401/503 chập chờn trong khi get-session vẫn có session hợp lệ; chưa chứng minh tất cả cùng nguyên nhân CPU. Worker Settings API: `usage_model=standard`, không có explicit `limits`; quyền OAuth hiện có bị 403 khi đọc account subscriptions nên chưa xác minh gói billing. Không thêm retry/che lỗi hoặc tự nâng gói/CPU. [Workers Free CPU chỉ 10 ms/request](https://developers.cloudflare.com/workers/platform/limits/#cpu-time); [Paid từ $5/account/tháng, có overage](https://developers.cloudflare.com/workers/platform/pricing/). Cache/index DB không giải quyết CPU quota của Worker; cần quyết định hạ tầng trước khi tuyên bố release-ready.

### CPU profile và tối ưu không tăng phí

- Owner chọn giữ chi phí hiện tại. Không đổi billing, CPU quota, DB/Auth hoặc cache quyền/session xuyên request.
- Profile artifact thực trên local workerd qua inspector/CDP: cold public, warm public, authenticated admin. Warm public có nhiều stack React render/serialize và GC; source xác nhận root truyền 81 unit records vào provider không dùng, đồng thời serialize Server Component children của popup sơ đồ đang đóng. Admin có stack Neon WebSocket/protocol/Auth; không lấy thời gian đợi network làm CPU.
- Production profiling API lần đầu báo không có loaded isolate; lần sau trả capture chỉ **1 ms idle**, không đủ để quy hotspot/CPU ms production. Local runtime spans cũng báo CPU bằng 0. Không dùng tổng `timeDeltas` CDP trong lúc chờ I/O như số CPU chính xác.
- Fix: root chỉ truyền website/logo/floors vào client provider; `LeasingUnitMap` nhận geometry/area tối thiểu và chỉ dựng bản vẽ khi mở. Không đổi dữ liệu/markup sơ đồ khi mở, không tắt SSR phần thông tin căn.
- Local C.5 HTML giảm **87.333 → 63.040 UTF-16 code units (~28%)**; đây là số ký tự `.text().length`, không byte nén/transfer. Năm request warm local trước: 53/32/27/29/27 ms; sau: 53/28/25/28/21 ms. Đây là local wall time có profiler, không CPU quota hoặc p95 production.
- Browser local desktop/mobile 390px: popup đủ 23 căn, C.5 selected, hướng/diện tích đúng, không overflow; Escape đợi exit xong trả focus; click C.6 chuyển đúng và popup mới đóng. Browser bản deploy mới cũng mở đúng 23 căn/C.5 và trả focus.
- Vòng đọc public 12 giây cùng hai document C.2/C.5: bản trước **19 HTTP 200 + 35 HTTP 503**; bản mới **48/48 HTTP 200**. Số request khác nhau do duration cố định; không coi đây là benchmark tải/concurrency hoặc bằng chứng mọi cold isolate đều dưới quota.
- Bản mới: năm public routes và `/admin/` đều HTTP 200; authenticated workspace HTTP 200/revision17, không phát sinh dữ liệu giao dịch. Lỗi CPU đã quan sát ở bản trước vẫn là rủi ro cần theo dõi; không kết luận hết Error1102 chỉ từ lượt smoke này.
- Bốn CPU profiles giữ riêng tại `/Users/suntech/Library/Application Support/LeGrande/profiles/2026-10-15-worker-cpu/` (directory0700/files0600), không chứa request cookies hoặc env secrets. Profiling bindings/R2/D1 local, không ghi object production.

### Tối ưu payload, media và workspace — 15/10/2026

- Không thêm Neon branch, index hay migration; giữ nguyên billing/CPU quota và xác minh quyền từng request. Shared/backend tests **105/105**, application admin **31 pass/1 deliberate live skip**, owned PostgreSQL regression **3/3**; Next/OpenNext build thành công.
- Một GET workspace thực, dùng session Neon Auth thật và PostgreSQL local được attestation, phát sinh **3 get-session + 3 kết nối DB**, so với **7 + 5** ở baseline instrumentation. Đây là số round trips, không phải benchmark latency DB local so với Neon. Outer authorization context/batch audit vẫn kiểm tra đầu/cuối; deny thiếu property và Editor sửa cấu hình vẫn 403, có durable audit.
- Snapshot giới hạn companies/leads/appointments ở **20 bản ghi mỗi collection**, kèm tổng/trang. Các collection API lọc/search/count/page trong SQL, max100/page; individual/related-ID reads giữ quyền/property scope. Lead intake được batch projection thay N+1. Partial reads không thay revision CAS; command lấy facts cần validation rồi trả một snapshot cuối.
- UI chạy trên **105 companies +105 leads +105 appointments** trong owned PostgreSQL, không seed production: trang6 hiển thị101–105; tìm/sửa company105, lead001, appointment105 ngoài snapshot, company picker và request labels resolve đúng company ngoài trang. Media review POST trả ready/revision321, reconcile gửi đúng321 và trả322; cả hai **0 GET workspace thừa**. PDF fixture thật đã kiểm checksum/đọc nội dung; object riêng đã xóa. Các revision này chỉ thuộc DB disposable.
- API client đã dùng canonical trailing slash. Browser command cuối trả200/revision323 trên DB disposable, **0 redirect API**, không GET workspace sau command.
- Homepage1440×900: **0 request/0 byte MP4 trong 4 giây đầu**, SSR/source chưa gắn; video phát muted/loop/inline khi vào viewport, có sound toggle và pause ngoài viewport. Nguồn chỉ gắn từ15% visible, `preload=none`; không native autoPlay/metadata preload sớm. Font preload hints **16→12**, giữ nguyên font families/styles.
- Mobile C.5 ở390×844/DPR2: ảnh ban đầu khoảng **2,25MB→128.571bytes (~94% giảm)**, gồm logo; 5 thumbnail52px lấy variant128px thay ảnh gốc. 116 derivative WebP từ13 nguồn approved đã publish public R2 và verify SHA-256; filename content hash +1-year immutable cache, nguồn gốc không đổi. Lightbox giữ URL gốc, không đưa derivative vào catalog admin.
- Bản tích hợp đầu `c7a18228-76e2-4eb7-bc11-d0f011a225ae` deploy thành công; public routes đều200 trong smoke đầu, nhưng workspace có mẫu503 sau ba lần200 ở4527/3890/3652ms. Trace sau đó bắt **503/exceededCpu** trên public calibration, không chứng minh chính503 workspace cùng cause. Năm workspace trace200 có raw tail CPU550/1233/1063/992/445ms; [workerd xác định các field này làms](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/trace.c++), khác GraphQL microseconds. CPU vượt hạn vẫn có thể thành công nhờ [rollover](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution), nên không dùng200 đơn lẻ để tuyên bố hết quota risk. 41 mẫu pg_stat_activity không blocker/Lock wait; không đổi grant locks theo giả thuyết chưa chứng minh.
- Follow-up source gộp chín SELECT nền snapshot thành một query tham số hóa cùng transaction, giữ ba bounded guarded CRUD lists và final authorization/audit; gộp `BEGIN; SET LOCAL ROLE` giảm thêm một lượt setup mỗi transaction. Không thay DB schema/index, không tăng connection concurrency hoặc cache quyền.
- Compiled standalone trước/sau batching đọc **cùng105×3 records/revision323**: toàn bộ JSON deep-equal, gồm manual-review timestamp được giữ ISO chính xác. Đếm PostgreSQL frontend `Parse/Query` messages trên toàn GET (kể cả resolver/transaction/audit): **35→24**, ba session checks/ba connections không đổi. Local wall1641→594ms chỉ là một cặp đo, không dùng làm tốc độ Neon/production. Regression timestamp4/4 và owned DB3/3 qua; build tiếp theo qua.
- Responsive reel giữ4 frame, candidate sets đúng cả frame dùng derivative lẫn nguồn nhỏ không cần derivative; desktop End→footer **13.810ms**, không phá minimum10s. Mobile lightbox tải đúng bản gốc1600px; map23 links/C.5selected.
- Bản cuối **`e45155d8-035d-47d1-b561-bff1bb1b079b`**, deploy16/10/2026, đã qua browser/live API. Sáu GET workspace nối tiếp **6/6 HTTP200**, client wall3094/1466/2301/1510/3536/1511ms (median1906ms), so với median3890ms của ba mẫu200 trước batching; mẫu503 lịch sử vẫn ghi ở trên, không bị loại khỏi kết luận reliability. Đây là hai bounded sets khác thời điểm, không A/B tải/p95. Companies/leads/appointments collection endpoints200/tổng0; revision17/catalog6tầng81căn/business0 được giữ, chưa đăng nhập401.
- Public routes `/`, `/mat-bang/`, `/tong-quan/`, `/lien-he/`, `/tong-quan-tang/`, `/admin/` và public projection200. Browser deployment: MP4 ban đầu0request/0byte/4s, fontpreload12, video vào viewport phát muted/loop và toggle âm thanh đúng. Mobile390×844DPR2 nhận231352byte ảnh trong lượt chuyển từ homepage (khác cold standalone128571byte); 5thumbnail128px, map23/C.5, C.5→C.6 sau adjacent prefetch190ms. Không browser exception trong smoke.
- Final sanitized tail không quan sát `exceededCpu` trong các request này, nhưng workspace CPU428–1150ms vẫn cao hơn free nominal budget; **không tuyên bố đã loại bỏ mọi503/1102 hoặc đạt p95**. Không tăng quota/phí, không DNS/Neon branch changes, không migration/index mới. Giảm SQL round trips và payload đã chứng minh; bảo đảm cold-request reliability cần thiết kế runtime/cache tiếp hoặc quyết định hosting/quota riêng, không tự ý thay trong patch này.

## Performance proof lịch sử trước hợp nhất — 15/10/2026

Các số đo/version/branch dưới đây ghi đúng bối cảnh **trước reset và hợp nhất**; không phải cấu hình hiện tại, deployment version mới nhất hay bằng chứng cache invalidation sau cutover. Không dùng chúng làm hướng dẫn tạo lại profile/branch cũ.

- HAR gốc: 3 navigation RSC trung vị 1.244 ms, 7 prefetch cũng khoảng 1,2–1,8 giây. Lượt SQL probe đầu chạy vào production do inherited process env ưu tiên hơn Node `--env-file`; không được coi kết quả 3,7 ms là stage2. Sau khi nạp cấu hình stage2 tường minh, query cũ lấy 81 slot chạy 2,115 ms (801 shared-buffer hits, 0 reads); chi phí round trips vẫn là nút thắt chính.
- Reader mới được đối chiếu lại trên **đúng stage2** (`ep-purple-morning-b3xmea7o`) sau audit: deep-equal projection cũ gồm toàn bộ settings/logo, 6 tầng, 81 căn, thứ tự/diện tích/status; ba lần đọc 225/170/53 ms. Số 178/178/56 ms trước đó là phép đo production, không phải stage2. Không tạo index hoặc thay schema nghiệp vụ.
- Next production standalone có instrumentation tạm: warm API và SSR, sau đó chặn mọi HTTP SQL từ process; `/api/public/website`, C.2 và C.3 vẫn trả 200 (5/20/19 ms), không phát sinh SQL sau khi chặn. Instrumentation/runtime tạm đã dừng, không vào source.
- Shared loading UI đã được quan sát khi cố ý trì hoãn request navigation; header vẫn hiện và thông báo trạng thái đọc được. Các lượt qua browser wrapper có long tasks; phép đo navigation cuối dùng raw Puppeteer page riêng, không overlay, để tránh nhiễu từ công cụ.
- `typecheck` pass; `test:admin` 30 pass/1 deliberate live skip; isolated `test:database` 2/2 pass, có kiểm tra trạng thái thuê và diện tích version mới qua reader public; owned branch đã xóa. OpenNext build và deploy stage2 pass.
- D1 expiration tag của deployed build đã được ghi và public API đọc lại trả 200, 6 tầng/81 căn, không tenant fields. Chưa chứng minh authenticated admin mutation. Audit issuer 15/10 xác nhận Worker đang dùng Auth stage2, còn `.neon`/`.env.local` dùng production. Mật khẩu owner cung cấp được Auth production chấp nhận khi áp prefix local; Worker stage2 trả `INVALID_EMAIL_OR_PASSWORD`. Không đổi password/hash/Auth secrets; chờ thống nhất branch trước mutation.
- Bản performance stage2 hiện tại: `d4b2f3e7-d544-4ae5-8bbd-6b04c45e973a`. Sau khi adjacent prefetch hoàn tất, C.2→C.3→C.4→C.5 mất 65/51/43 ms ở 1440px và 194/40/42 ms ở 390px; không overflow. Đây là click-to-content khi đã preload, không phải cold-load/p95. Background fetch đầu mobile vẫn có mẫu 1.125 ms; cache miss/network chưa biến thành tức thì.
- Cuộn danh sách căn khác ở 390px không sinh thêm RSC requests. Trong lượt probe HTTP khác có một `/mat-bang/` trả 503 rỗng; curl chẩn đoán sau đó trả 200. Chưa có Worker trace xác định nguyên nhân cho response đơn lẻ đó, không coi build hoặc các mẫu warm là bằng chứng mọi cold request đều nhanh/thành công.

**Audit lịch sử trước reset:** khi đó có ba Neon branch và regression clone từ empty template. Hiện trạng đã bị thay thế bởi cutover một production ở trên; không khôi phục branch/profile cũ. Bài học vẫn áp dụng: inherited process env có thể ưu tiên hơn Node `--env-file`; canonical local loader nay gán `.env.local` tường minh trước kết nối.

## Bằng chứng runtime lịch sử trong giai đoạn phase 2

Các kết quả sau được ghi nhận **trước reset/hợp nhất**, ở localhost:3100 chạy Node Next với Neon/R2 thật; không chứng minh trạng thái dữ liệu hiện tại hay private media trên Worker hiện có:

- Neon Auth sign-in HTTP 200 và authorized workspace HTTP 200.
- PNG upload 200, public object GET 200; sau xóa, physical object GET 404.
- Private PDF upload 200; ordinary view khi quarantine 403; manual external review 200; authorized Range đọc 206.
- Ghi hồ sơ thuê từ held B.1/B.2 chuyển toàn bộ sang Đang thuê; appointment requested → confirmed.
- Browser public form POST 201 tạo lead/intake thực, không tạo appointment.
- Migrations 001–004 trên stage2 và branch disposable; sau đó backend production cũng đã được khởi tạo baseline+migrations, 6 tầng/81 căn approved brochure, chỉ configured owner allowlist và approved Neon logo (native authorized GET kiểm bytes/hash, 25.230 bytes). Không có production frontend deployment trong bằng chứng này.
- Tắt quyền fixture DB khi Auth session còn hợp lệ: get-session 200 nhưng workspace/private PDF đều 403; đăng xuất qua UI đưa về /admin và cả hai API trả 401.
- PDF R2 không liên kết: upload/rename/delete đều 200, GET sau xóa 404; used bytes trở về đúng mức trước upload và reserved bytes bằng 0.
- Local localhost:3101 dùng backend production đã seed sạch: public API/homepage 200, 6 tầng/81 căn đều Trống, logo Neon đúng branch, không tenant fields; admin chưa đăng nhập 401. Domain/DNS và frontend production không đổi.
- Artifact standalone: npm start chạy server.js không cảnh báo next-start/standalone; năm trang public, /mat-bang/A.1/ và JS asset trả 200, admin chưa đăng nhập 401.

**Regression lịch sử:** `npm run test:database` từng **2/2 pass, không skip** trên owned Neon child từ empty template, apply baseline+migrations+approved seed hai lần, verify logo bytes/hash rồi xóa child. Chiến lược đó đã được thay bằng owned local PostgreSQL, không còn yêu cầu Neon template/CLI. `test:admin` **30 pass/1 deliberate live skip**; shared backend **101/101 pass**, UI **63/63 pass**. Typecheck và OpenNext Worker build pass; CI run `38691562845` passed. Các con số này không phải checks mới của lần cập nhật tài liệu.

Worker lịch sử đã deploy tại URL hiện vẫn giữ `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev` (version cũ `d6bc1c5f-69cf-48e5-9ceb-1a4b77fe247c`). Chromium smoke lúc đó: homepage, `/tong-quan-tang/`, `/admin/` đúng, không browser errors; public API 200, unauthenticated workspace 401; public logo URL 200 PNG trực tiếp tới Neon origin. Version/branch cũ không mô tả deployment sau hợp nhất.
Root password accounts trước đây được operator cấp/xác minh theo yêu cầu owner, không phải proof mailbox delivery. Local `:3108` từng vào workspace, đọc 6 tầng/81 căn, reload giữ session, logout → API 401. Nhánh test riêng lúc đó cũng chạy login/wrong password/reload. Không suy thành OTP/mail recovery/OAuth đã hoạt động.


## Giới hạn còn thật

Các probe trước đây ghi nhận native Worker → Neon S3/Functions trả 403 HTML. Smoke Worker hiện tại không kiểm tra server-to-server private media/origin flow; request logo 200 đi thẳng từ browser tới public Neon object URL, không chứng minh đường Worker → origin. Không tuyên bố private media path đã sẵn sàng.

Worker stage2 được cấu hình noindex. `NEON_BRANCH=lgc-bot-test` trong Wrangler không xác nhận giá trị runtime `DATABASE_URL`; ghi Worker version/deployment ID, source SHA, DB branch và runtime bindings theo [deployment runbook](deployment.md). Owner xác nhận dự án này không triển khai trên Vercel; không suy hosting từ domain response/header. Provider Auth verification/OTP settings không chứng minh email delivery/recovery; root login 200 không thay các bằng chứng đó.

## Lệnh và CI

Xem [README](../README.md) và [Neon setup](neon-setup.md): Node 22.22+, canonical `.env.local`, remote R2 thật. Không dùng Node `--env-file` để spawn Next dev.

- `npm run dev -- --port 3000`, `npm start`: local dev / standalone server; cùng production DB/Auth, không sandbox.
- `npm run check:backend`, `typecheck`, `test:backend`, `test:admin`: integrity/type/pure checks.
- `npm run test:database`: runner sở hữu disposable local PostgreSQL; `postgres`, `initdb`, `pg_ctl` phải có trên PATH (Homebrew PostgreSQL trên macOS). Không Neon CLI/branch, không inherited live credentials; cleanup chỉ cluster do lần chạy tạo.
- `npm run db:migrate`: `.env.local` → **DATABASE_URL_UNPOOLED** direct URL; không override pooled DATABASE_URL, không trong build/deploy job.
- `npm run auth:set-password -- root@legrandecentre.vn`: operator cập nhật identity hiện có, đọc `ROOT_ADMIN_PASSWORD` riêng từ `.env.local`, không staff grant.
- `npm run build` và `build:cloudflare`: standalone/OpenNext artifacts, không cloud proof.
- `npm run deploy`: build và deploy Worker hiện có; không deploy aliases hoặc profile thứ hai.

`.github/workflows/backend-ci.yml` dùng environment tên lịch sử `github-pages` để đọc secret `COMPONENT_UI_READ_TOKEN`, fetch đúng packages/ui + packages/backend; archive 3D bị loại. CI không có CF/Neon runtime secrets, không deploy hay tự migrate. Shared backend integrity/type/tests vẫn giữ. Cloudinary generic còn thuộc library nhưng không phải provider được yêu cầu cấp cho Mall hiện tại.

Tài liệu: [structure](backend-structure.md), [private documents](private-documents-r2.md), [portability](database-portability.md), [DB migrations](../database/README.md).
