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

Đây là lệnh deploy Worker theo `wrangler.jsonc`; không phải lệnh build/deploy Vercel. Repo hiện có một Wrangler config, không có alias theo môi trường. Lệnh này không đổi DNS/custom domain, không deploy Render bot và không chạy migration database.

`npm run build:cloudflare` chỉ tạo OpenNext artifact, không phát hành Worker. `.github/workflows/backend-ci.yml` lấy private submodules để chạy CI/build; workflow đó không tự deploy. Sau mỗi release, ghi nhận source commit, Worker version/deployment ID, URL, DB branch đã xác minh và kết quả route smoke. Build thành công không chứng minh Worker runtime, DB, R2 hay quota production hoạt động.

## Dữ liệu build và runtime

`PUBLIC_BUILD_ORIGIN` mặc định gọi public API của Worker stage2. `scripts/public-build-env.mjs` chỉ giữ public projection đã validate và đưa snapshot đó vào prerender; không lấy DB credentials làm dữ liệu build. Với target Worker stage2, kiểm tra endpoint và nội dung stage2 trước build. Nếu kiến trúc có thêm Worker production trong tương lai, phải quyết định riêng public projection origin và runtime DB trước khi sửa cấu hình; không đổi target bằng suy luận từ hostname.

Local `.env.local` dùng Neon `production` và lệnh migration nạp trực tiếp file đó. Ngày 19/10/2026, `DATABASE_URL` và `DATABASE_URL_UNPOOLED` đã được xác nhận cùng vào branch production; migration 014/015 và seed plan đã chạy thành công ở đó. Trước khi phát hành, Worker `DATABASE_URL` được đồng bộ với local production target để source có schema mà floor-plan projection cần. Build/deploy không áp migrations.

Secrets DB/Auth/media/API được cấp ở đúng runtime secret store, không đặt trong `NEXT_PUBLIC_*`, source, log hoặc build artifact. `.env.local` là operator config cho production: không ghi đè bằng biến tải từ host khác và không dùng để tạo dữ liệu thử. `stage2` không tự chứng minh mức cô lập của database/Auth/storage; xác minh từng binding và secret target trước khi chạy thao tác có side effect.

## Notification boundary

Cloudflare scheduled wrapper chạy mỗi phút qua OpenNext self-binding, dispatch source outbox theo batch tới Render bot với stable idempotency key. Chỉ receipt hợp lệ mới chuyển quyền xử lý; lỗi giữ source payload để retry. Render lưu queue/recipient state trong DB riêng và có thể giao nhận at-least-once. Không cấu hình Vercel cron hay external production dispatch URL. Xem [notification architecture](notification-architecture.md) và `AGENT.md` cho contract/limits hiện hành.

## Trình tự phát hành và bằng chứng

1. Kiểm tra `git status`, branch/commit và các gitlink private `packages/ui`, `packages/backend`; chỉ phát hành source đã được chọn rõ ràng.
2. Xác nhận target Worker cùng `wrangler.jsonc`, đặc biệt runtime `DATABASE_URL` và Auth/function secrets, noindex, buckets, D1/DO bindings và scheduled trigger. Không chỉnh bindings theo phỏng đoán.
3. Kiểm tra public build origin và public projection. Production đã có migration 014/015; nếu runtime target đổi, xác minh branch trước khi phát hành. Không chạy migration từ build hoặc deploy.
4. Chạy `npm run deploy` khi đã chủ định cập nhật Worker stage2. Nếu chỉ cần build, dùng `npm run build:cloudflare`.
5. Trong Cloudflare deployment details, đối chiếu source/version và trạng thái `Ready`; sau đó kiểm tra homepage, public API và route smoke phù hợp trên Worker URL. Ghi DB branch và side effects đã kiểm tra. Không dùng HTTP `Server` header của một hostname khác làm release proof.

## Chẩn đoán

| Triệu chứng | Kiểm tra |
| --- | --- |
| `npm run deploy` cập nhật nhầm môi trường | Kiểm tra duy nhất root `wrangler.jsonc`, `name`, bindings và URL; không có deploy alias theo env |
| Trang public dùng dữ liệu cũ/sai | Kiểm tra `PUBLIC_BUILD_ORIGIN`, phản hồi public projection tại build và cache tags; build snapshot chỉ có public fields |
| Login/upload test tạo side effect ngoài test DB | Kiểm tra riêng `DATABASE_URL`, Auth/function secrets và R2 bindings của deployment; nhãn stage2 không chứng minh provider isolation |
| Thông báo không đến nhóm | Lần theo committed website outbox → Worker dispatch receipt → Render event/recipient receipts; build/deploy không chứng minh provider delivery |
| Domain hiển thị nội dung khác với Worker | Xác nhận Worker URL/version trực tiếp và quyền DNS riêng; không gán nội dung domain cho repository từ response headers |
