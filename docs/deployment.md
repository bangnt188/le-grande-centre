# Deployment architecture and runbook

Cập nhật theo xác nhận owner và source checkout ngày **19/10/2026**. Đây là nguồn chuẩn cho target triển khai hiện tại của repository.

## Quyết định kiến trúc

Owner xác nhận source của dự án này **không được triển khai trên Vercel**. Target hiện tại là Cloudflare Worker đã có; Render chạy bot relay riêng. Không tạo/đăng nhập/link Vercel project, không chạy lệnh deploy Vercel, không chuyển secrets lên Vercel và không dùng HTTP response/header để suy luận source commit hoặc trạng thái release. Domain/DNS không được thay đổi bởi các lệnh trong repo.

| Thành phần | Target hiện tại | Cấu hình và ranh giới |
| --- | --- | --- |
| Website SSR/API | Cloudflare Worker `le-grande-centre-stage2` | `wrangler.jsonc`; URL `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev`; giữ `SEO_INDEXABLE=false` |
| Website database | Worker đọc runtime secret `DATABASE_URL`, hiện trỏ Neon `production` (`br-tiny-butterfly-b3uuw92p`) | Secret được cấp từ `.env.local` đã xác minh branch ID; không lưu credential trong source hoặc log |
| Auth và media | Wrangler bind R2 `mall-documents` và `mall-assets`; Auth/function endpoint lấy từ runtime config/secrets | Các binding R2 có tên bucket dùng chung; target Neon Auth/function hiện tại cần kiểm tra ở deployment, không suy ra từ nhãn stage2 |
| Notification relay | Render bot service | DB/queue riêng; Worker gửi source outbox tới Render. Không có external/Vercel cron target |

`src/server/database.ts` dùng `DATABASE_URL`; mã nguồn không dùng `NEON_BRANCH` để chọn DB, nên biến nhãn đó đã được gỡ khỏi Wrangler. Ngày 19/10/2026, owner xác nhận Worker phải dùng `production`; runtime secret được cập nhật từ local connection đã xác minh branch ID. Không in connection string hoặc secret vào log.

## Lệnh triển khai

Trong `package.json`, `npm run deploy` chạy:

```sh
npm run build:cloudflare && opennextjs-cloudflare deploy
```

Đây là lệnh deploy Worker theo `wrangler.jsonc`; không phải lệnh build/deploy Vercel. Repo hiện có một Wrangler config, không có alias theo môi trường. Lệnh này không đổi DNS/custom domain, không deploy Render bot, và không chạy migration Neon/business data. OpenNext có thể khởi tạo hoặc cập nhật schema D1 tag-cache do adapter quản lý theo cách idempotent, đồng thời nạp lại incremental cache lên R2.

`npm run build:cloudflare` chỉ tạo OpenNext artifact, không phát hành Worker. `.github/workflows/backend-ci.yml` lấy private submodules để chạy CI/build; workflow đó không tự deploy. Sau mỗi release, ghi nhận source commit, Worker version/deployment ID, URL, DB branch đã xác minh và kết quả route smoke. Build thành công không chứng minh Worker runtime, DB, R2 hay quota production hoạt động.

## Dữ liệu build và runtime

`PUBLIC_BUILD_ORIGIN` mặc định gọi public API của Worker stage2. `scripts/public-build-env.mjs` chỉ giữ public projection đã validate và đưa snapshot đó vào prerender; không lấy DB credentials làm dữ liệu build. Với target Worker stage2, kiểm tra endpoint và nội dung stage2 trước build. Nếu kiến trúc có thêm Worker production trong tương lai, phải quyết định riêng public projection origin và runtime DB trước khi sửa cấu hình; không đổi target bằng suy luận từ hostname.

Local `.env.local` dùng Neon `production` và lệnh migration nạp trực tiếp file đó. Ngày 19/10/2026, `DATABASE_URL` và `DATABASE_URL_UNPOOLED` đã được xác nhận cùng vào branch production; migration 014/015 và seed plan đã chạy thành công ở đó. Migration 016 bổ sung mã tra cứu admin vẫn chưa áp dụng; source mới chỉ được phát hành sau khi migration này chạy trên đúng runtime DB đã xác minh. Build/deploy không áp migration nghiệp vụ Neon; OpenNext có bước schema riêng cho D1 tag-cache như mô tả bên dưới.

Secrets DB/Auth/media/API được cấp ở đúng runtime secret store, không đặt trong `NEXT_PUBLIC_*`, source, log hoặc build artifact. `.env.local` là operator config cho production: không ghi đè bằng biến tải từ host khác và không dùng để tạo dữ liệu thử. `stage2` không tự chứng minh mức cô lập của database/Auth/storage; xác minh từng binding và secret target trước khi chạy thao tác có side effect.

## Notification boundary

Sau201 từ contact đã commit, Worker dispatch qua `ctx.waitUntil` và OpenNext self-binding; form không chờ network. Cron `*/15 * * * *` phục hồi outbox mất wake/lease hết hạn, không polling mỗi phút. Giữ stable idempotency key, fencing theo channel và payload khi lỗi. Giữ public workers.dev/previews disabled và không thêm domain route; cron vẫn hoạt động. Không đổi Neon Auth/DNS hoặc thêm external/Vercel cron. Xem [notification architecture](notification-architecture.md).

## Trình tự phát hành và bằng chứng

1. Kiểm tra `git status`, branch/commit và các gitlink private `packages/ui`, `packages/backend`; chỉ phát hành source đã được chọn rõ ràng.
2. Xác nhận target Worker cùng `wrangler.jsonc`, đặc biệt runtime `DATABASE_URL` và Auth/function secrets, noindex, buckets, D1/DO bindings và scheduled trigger. Không chỉnh bindings theo phỏng đoán.
3. Kiểm tra public build origin và public projection. Production đã có migration 014/015; migration 016 phải được áp dụng riêng trước khi phát hành source dùng mã tra cứu admin. Nếu runtime target đổi, xác minh branch trước khi phát hành. Không chạy migration nghiệp vụ Neon từ build hoặc deploy.
4. Chạy `npm run deploy` khi đã chủ định cập nhật Worker stage2. Nếu chỉ cần build, dùng `npm run build:cloudflare`.
5. Trong Cloudflare deployment details, đối chiếu source/version và trạng thái `Ready`; sau đó kiểm tra homepage, public API và route smoke phù hợp trên Worker URL. Ghi DB branch và side effects đã kiểm tra. Không dùng HTTP `Server` header của một hostname khác làm release proof.

## Release evidence — 19/10/2026

- Source/config commit `1a819d02f4bbfcee0d60a957bf243c4ec2680c30` đã push lên `origin/dev`; Worker được upload từ checkout commit này và private submodule gitlinks không đổi. Wrangler deployment metadata vẫn ghi `Source: Unknown`. Worker version `166e6004-3da2-4af3-96cc-4c9cb7ab933c` nhận 100% traffic từ 08:14 UTC tại URL stage2 phía trên.
- `npm run build:cloudflare` hoàn tất TypeScript, Next prerender và OpenNext build. Public projection lúc build có 6 tầng/81 căn, không chứa dữ liệu riêng tư. Artifact scan kiểm tra 1.759 file với 11 giá trị credential; không tìm thấy credential trong artifact. Neon S3 endpoint là public media origin được khai báo trong source, không chứa URL credentials.
- Worker secret `DATABASE_URL` được cập nhật từ local Neon connection đã xác minh bằng `current_setting('neon.branch_id')` là `br-tiny-butterfly-b3uuw92p` (`production`). Sau khi Worker chuyển nhánh, branch test `lgc-bot-test` đã được xóa theo yêu cầu owner.
- Worker smoke: `/`, `/mat-bang/`, `/tong-quan/`, `/tong-quan-tang/`, `/lien-he/`, `/robots.txt`, `/sitemap.xml`, `/api/public/website/` đều trả HTTP 200. API trả 6 tầng/81 căn; homepage trả đúng bốn feature icons với bốn SVG path khác nhau. 17/17 JS/CSS asset được tham chiếu trả HTTP 200; meta `noindex, nofollow` còn hiệu lực.
- Lần deploy 08:14 UTC in cảnh báo Durable Object class binding; follow-up bên dưới xác định cảnh báo phát ra từ Wrangler local proxy trong bước chuẩn bị của OpenNext, không phải từ upload Worker.
- Follow-up deploy cùng source commit `a0fdc645a667944431a9fddf366e17d15d7356d6` lúc 08:30 UTC tạo Worker version `8250f151-894a-4ab7-b973-6fc261c73222` và nhận 100% traffic. OpenNext nạp lại 12 cache objects vào R2 và chạy bước D1 tag-cache `CREATE TABLE IF NOT EXISTS`/compatibility `ALTER TABLE`; schema sau deploy có đủ `stale` và `expire`. `/`, `/mat-bang/`, `/tong-quan/`, `/api/public/website/` đều trả HTTP 200 sau deploy.
- Cảnh báo DO xuất hiện trong bước OpenNext gọi Wrangler `getPlatformProxy()` để lấy biến môi trường cục bộ, trước khi populate R2; Wrangler ghi rõ internal DO chỉ không hoạt động trong local development và sẽ hoạt động ở production. Bundle cuối cùng export `DOQueueHandler`, Wrangler upload thành công, báo Worker Startup Time 20 ms và liệt kê binding này. Không có thay đổi code/config để che cảnh báo.
- Local TTL smoke trả HTTP 200 nhưng local D1 emulator chưa có bảng `revalidations`, nên không xác nhận được tag-cache/revalidation end-to-end. Truy vấn schema chỉ đọc trên D1 production xác nhận bảng `revalidations` tồn tại; chưa ép revalidation production để kiểm tra hàng đợi.

### Client navigation performance — 19/10/2026

- HAR `log-hoempage.har`: 9/9 RSC requests cache HIT, nhưng menu/CTA tắt prefetch nên click vẫn chờ RSC rồi JS/CSS. Chuỗi tải Mặt bằng dài 1.065 ms. Thử full-prefetch trên browser live trước sửa source: Mặt bằng 895→52 ms, Không gian kinh doanh 558→57 ms; không phải benchmark p95.
- Source nền `c11eeda445fff6ed2afe9f95bba554ba4652afe8` cùng thay đổi navigation chưa commit tại `site-header.tsx`, `site-footer.tsx`, `homepage-v2.tsx` và comment `next.config.ts`. Private gitlinks giữ UI `8dd1fdf6660e3875c4492ba14efa56b993e653b4`, backend `2eccb06a3dbc01636cef509fe9d76efaae8cdd7e`. Không chỉnh các thay đổi tài liệu có sẵn của owner.
- Header/footer và CTA chính full-prefetch bốn route public khi vào viewport; mobile menu tải các link ẩn khi mở. Không prefetch inventory hàng loạt, không thêm scheduler/client cache riêng hoặc đổi TTL. Hero heading/mô tả/CTA hiện ngay; stats/scroll motion còn nguyên.
- `npm run build:cloudflare` và `npx tsc --noEmit` pass. Artifact scan 1.733 file, 11 credential values, 0 file chứa giá trị credential. Query chỉ đọc xác nhận local canonical DB vẫn `br-tiny-butterfly-b3uuw92p`; không đổi runtime secrets, DB/schema nghiệp vụ Neon, DNS hoặc billing.
- Production standalone Chromium 1440×900/390×844: cả bốn route được prefetch tự động, chuyển trang 75–82 ms; không request RSC bắt buộc sau click và không tải trước unit detail. Quay về homepage 52–59 ms, heading/CTA opacity 1 ngay; menu mobile đóng đúng, reduced motion và không overflow/runtime exception. Đây là bounded smoke sau prefetch hoàn tất, không bảo đảm click sớm/cold network luôn dưới 500 ms.
- Phát hành chính artifact đã smoke bằng `npx opennextjs-cloudflare deploy`, custom build guard không build lần nữa. Worker version `5d4ef8ea-e4e7-4383-8923-b8dde74683a1`; target/noindex/cron/bindings giữ nguyên. OpenNext populate 12 R2 cache entries và chạy bước D1 tag-cache idempotent. Cảnh báo local proxy DO giống lần trước; upload thực liệt kê `DOQueueHandler` và thành công.
- Live Chromium trên Worker 1440×900/390×844: 8/8 chuyển trang sau automatic prefetch đạt 78–86 ms, không request RSC bắt buộc sau click; về homepage 54–55 ms với heading/CTA opacity 1 ngay. Kiểm tra menu mobile, reduced motion, không prefetch unit detail, không overflow/runtime exception đều pass. Không đo p95 hoặc bảo đảm instant khi prefetch chưa xong.
- `/`, `/mat-bang/`, `/tong-quan-tang/`, `/tong-quan/`, `/lien-he/`, `/robots.txt`, `/sitemap.xml`, `/api/public/website/` đều HTTP 200 sau release; homepage giữ noindex, API giữ 6 tầng/81 căn. Không gửi form/intake hay tạo dữ liệu nghiệp vụ để smoke.

### Branded initial loading — 19/10/2026

- Build từ working tree trên source nền `74ca9cefb09f73889851950258e488c9c6f40726`, gồm shared UI `LoadingScreen` và public `PublicStartupLoading` chưa commit. Component/motion/CSS nằm trong `packages/ui`; app chỉ truyền logo Neon hiện hành, wordmark và trạng thái readiness. Không thêm package, logo fallback, request DB hoặc thay schema/secrets/DNS/billing.
- Màn chờ SSR chỉ mount một lần trong persistent public layout mỗi document; không replay khi chuyển menu/quay lại homepage. Đợi font và ảnh high-priority decode, có nút vào thẳng, Escape/Tab, deadline effect 5 giây, CSS fail-open 8 giây và no-JS bypass. Không dùng phần trăm giả, thời gian tối thiểu hoặc chờ video/background prefetch. Đây là feedback sau khi HTML đến, không giảm hoặc che TTFB trước đó.
- `npm run build:cloudflare`, app TypeScript và `npm run typecheck:ui` pass. Artifact scan 1.734 file/11 credential values/0 matches. Impeccable detector cho ba file UI mới trả không có findings.
- `npm run smoke:public -- http://127.0.0.1:3152/ --startup-only` pass trên production standalone: 1366×900 và mobile390×844 có logo tải thật, phủ đúng viewport, không overflow; readiness/skip, no route replay, reduced motion, Escape, stalled-decode deadline, normal image/font completion, no-JS và CSS escape khi chặn hydration chunks. Probe giữ promise decode chỉ để kiểm nhánh chờ/timeout; đây không phải số đo thời gian tải thực. Screenshot desktop/mobile đã kiểm bằng mắt.
- Đã deploy artifact đã smoke, không rebuild, Worker version `49163f20-5b1c-43e2-ae28-b2c680ee54d9`. R2 populate có transient write retries ở hai entries rồi báo thành công đủ 12; D1 init idempotent và custom build guard giữ nguyên. Không che/sửa cảnh báo local proxy DO đã ghi ở release trước.
- Live `--startup-only` trên Worker pass đầy đủ cùng ma trận desktop/mobile, ready/skip/no replay/reduced motion/Escape/deadline/normal completion/no-JS/blocked scripts. Năm route public và API đều HTTP 200; HTML có loader/noindex, catalog vẫn 6 tầng/81 căn. Không gửi form hoặc tạo dữ liệu nghiệp vụ.

### Full source publication and streaming correction — 19/10/2026

- Owner yêu cầu commit/push **toàn bộ** working tree rồi deploy. App source `91f8277` đã push `origin/dev`; shared UI `aa7e3ab` đã push `origin/shopping-mall`, gồm `LoadingScreen` và `Sheet`. Backend/archive gitlinks không đổi. Release bao gồm các thay đổi admin Sheet/appointments và tài liệu feedback đã có, không chỉ sửa loading.
- Loading được đưa ra ngoài async data boundary. Local với phản hồi DB cố ý chậm 4 giây: trước sửa loader/page cùng đến, sau sửa loader đi trước page 3981 ms; Chrome đã vẽ lớp che toàn viewport ở 288 ms khi chưa có header/homepage. Hai frame render, font/high-priority decode và data-ready signal quyết định mở trang; không ép thời gian chờ tối thiểu. Đồng hồ CSS fail-open tạm dừng khi server đang stream; smoke no-JS kiểm tra heading thực sự nhìn thấy.
- App TypeScript, shared UI typecheck, admin regression **52 pass/2 skip**, shared UI regression **63 pass**, Next standalone và OpenNext build pass. Local startup-only và 12 đường vào (6 public routes × 1366/390px) pass trên production standalone. Các skip là integration cần runner PostgreSQL riêng, không phải production DB test.
- Truy vấn chỉ đọc từ canonical local config xác nhận Neon branch `br-tiny-butterfly-b3uuw92p`; public Worker API trước release HTTP 200 và giữ 6 tầng/81 căn. Không thay runtime secrets, DB/schema nghiệp vụ, DNS, Render hoặc billing. Cloudflare OAuth hết hạn đã được đăng nhập lại.
- Scan 621 source files và 1736 OpenNext artifact files với 11 credential values: không có file khớp. Deploy dùng lại artifact đã build; lần đầu timeout ở bước populate R2 sau lỗi 500/timeout, chưa tới upload Worker. Tùy chọn được hỗ trợ `--cacheChunkSize 1` dùng cho lần thử tiếp theo; không patch dependency hoặc bỏ qua bước populate cache.
- Lần thử `npx opennextjs-cloudflare deploy --cacheChunkSize 1` thành công với cùng artifact/build ID; một cache entry cần retry sau timeout, cuối cùng đủ **12/12 entries**, D1 init idempotent hoàn tất, guard bỏ qua rebuild. Cảnh báo internal DO vẫn chỉ ở local proxy; upload thực liệt kê `DOQueueHandler` và thành công. Worker version **`e2acb66b-c0b5-41c2-8e27-461e559ca6c4`**, deployment lúc **15:20:48 UTC**, `wrangler deployments list` xác nhận **100% traffic**. URL: `https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev`.
- Live `npm run smoke:public -- https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev/ --startup-only` pass: desktop1366/mobile390, logo thật, phủ viewport, ready/skip, không replay khi chuyển menu/quay về, reduced motion, Escape, deadline khi decode bị giữ, font/image readiness, no-JS heading nhìn thấy và CSS fail-open khi chặn hydration scripts.
- HTTP live: `/`, `/mat-bang/`, `/tong-quan-tang/`, `/tong-quan/`, `/lien-he/`, `/mat-bang/C.5/`, `/admin/`, `/robots.txt`, `/sitemap.xml`, `/api/public/website/` đều **200**; cả sáu trang public có loader, marker streaming mới và noindex. **18/18** JS/CSS assets homepage trả200, catalog vẫn6tầng/81căn. Không gửi form, tạo record, thử private admin mutations hoặc thay DB để smoke; kết quả không bảo đảm mọi cold request dưới CPU quota.


## Chẩn đoán

| Triệu chứng | Kiểm tra |
| --- | --- |
| `npm run deploy` cập nhật nhầm môi trường | Kiểm tra duy nhất root `wrangler.jsonc`, `name`, bindings và URL; không có deploy alias theo env |
| Trang public dùng dữ liệu cũ/sai | Kiểm tra `PUBLIC_BUILD_ORIGIN`, phản hồi public projection tại build và cache tags; build snapshot chỉ có public fields |
| Login/upload test tạo side effect ngoài test DB | Kiểm tra riêng `DATABASE_URL`, Auth/function secrets và R2 bindings của deployment; nhãn stage2 không chứng minh provider isolation |
| Thông báo không đến nhóm | Lần theo committed website outbox → Worker dispatch receipt → Render event/recipient receipts; build/deploy không chứng minh provider delivery |
| Domain hiển thị nội dung khác với Worker | Xác nhận Worker URL/version trực tiếp và quyền DNS riêng; không gán nội dung domain cho repository từ response headers |

### Notification idle-compute hotfix — 20/10/2026

`dev` source `d1b3dbf` → Worker `d521332a-500a-4e2d-94ec-89fda9ee9414`,100%traffic. Cloudflare API xác nhận cron chỉ `*/15 * * * *`, workers.dev/previews vẫn disabled, không có domain route. Giữ nguyên Neon Auth và runtime secret bindings. Bản này không bao gồm admin/UI WIP hoặc migration mới.

Vì public Worker đã404 từ trước, build dùng public projection đã validate từ canonical DB branch production sau truy vấn identity chỉ đọc; cung cấp qua `LE_GRANDE_BUILD_PUBLIC_WEBSITE`. Không bật lại ingress hoặc lấy fixture giả để vượt lỗi build origin. Build/typecheck,6owned-PG tests và actual workerd boundary smoke pass; scan1736files/11credential values không khớp secret. Deploy dùng lại artifact đã kiểm tra, cacheChunkSize1,12/12R2 entries và D1 init idempotent. Chưa gửi form live hoặc đo Neon suspension/CU-hour savings.

### Admin workspace and internal availability release — 20/10/2026

- Source `353d196` on `origin/dev`; shared UI submodule `c54b055` on `origin/shopping-mall`. The Worker was built from this source/submodule pair. Migration **018** was applied with the documented migration runner after a read-only branch check confirmed Neon production `br-tiny-butterfly-b3uuw92p`; post-migration ledger and status constraint were verified, with 81 current slots still `Còn trống`.
- Verification: focused admin/public tests **16/16**, navigation/qualification tests **5/5**, owned disposable PostgreSQL **5/5 relational + 2/2 outbox + 2/2 email**, and `npx tsc --noEmit` passed. Cloudflare build passed with a validated public-only 6-floor/81-unit projection read from the verified production branch because the Worker public endpoint returns404.
- Worker version **`4f05b5c0-7120-4df6-bae4-dde26b1d18ef`** uploaded at **2026-10-20 16:20 UTC** and `wrangler deployments list` confirmed **100% traffic**. OpenNext populated **13/13** R2 cache objects; adapter D1 initialization succeeded. Cron remains `*/15 * * * *`; bindings, noindex and disabled public ingress were not changed.
- HTTP route smoke is intentionally unavailable: `workers_dev` is `false`, and `/` on the workers.dev hostname returns404. No route was enabled and no public API, contact submission, admin mutation, or provider delivery was tested live. Wrangler emitted its known local-proxy Durable Object warning; upload completed and listed `DOQueueHandler` as a Worker binding. Do not treat this release as proof of live route accessibility or external delivery.

