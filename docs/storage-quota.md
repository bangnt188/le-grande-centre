# Storage quota — phase 2

## Chính sách

App cap **8,500,000,000 bytes (8.5 decimal GB)**. Đây là ngân sách ứng dụng bảo thủ, không phải quota vật lý/giới hạn thanh toán của R2 hay Neon và không cộng free tier hai provider thành một cam kết miễn phí.

Meter `(usedBytes + reservedBytes) / 8,500,000,000`:

- ≤65%: bình thường; >65% đến 85%: cảnh báo; >85%: nguy cấp.
- Đạt 100%: chặn upload mới; vẫn cho authorized reads.
- Thiếu usage/inventory hoặc ledger mismatch: unavailable, khóa upload.
- Có thể đạt đúng cap, không vượt cap; không tin byte count/quota do browser gửi.

Không còn quota scenario/demo/local IndexedDB accounting. UI dùng shared `AdminPanel`, `ProgressBar`, `Badge`, fields và Toast; enforcement thuộc server/DB.

## Phạm vi được tính

`src/server/media/repository.ts` đối soát trước upload:

1. Liệt kê **toàn bộ public R2 `mall-assets`** qua `PUBLIC_ASSETS`, gồm ảnh/video/brochure và object public còn giữ dù không có trong filtered media list.
2. Liệt kê private R2 `PRIVATE_DOCUMENTS`: **`mall-documents`** cho cả local và Worker hiện có. So sánh từng key/size, count và bytes với tracked active/reserved document versions.
3. Cộng tracked upload bytes trong Neon `media` và private R2 ở trạng thái ready/quarantine, cùng durable reserved bytes.
4. So sánh ledger với relational metadata. Inventory lỗi, untracked/missing/mismatched private object hoặc vượt cap đặt external usage unavailable và audit lý do; khóa upload đến khi operator xử lý/đối soát.

`usedBytes` trả UI = tracked used + verified public inventory bytes; `reservedBytes` trả riêng. Public project catalog là metadata chỉ đọc, **không dùng để giả đo dung lượng bucket**. Neon bytes hiện theo tracked metadata, không tuyên bố đã full-inventory Neon bucket hay mọi account/bucket bên ngoài. Writer/object không thuộc scope phải được kiểm soát và phân bổ ngân sách riêng; app cap không enforce toàn tài khoản provider. Local `.env.local` trỏ production; Wrangler bind R2 buckets `mall-assets`/`mall-documents`, nhưng Worker DB/Auth target cần xác minh từ runtime secrets. Không xem stage2 là budget hoặc provider isolation.

## Upload và cleanup thật

- Session verified + active staff allowlist, origin và property/scope từ DB.
- Bounded multipart: tối đa 4 files, 10 MiB/file, 20 MiB batch (+64 KiB multipart overhead). Raster PNG/JPEG/WebP kiểm signature/dimensions (4096px/4MP), decode/re-encode bằng Photon; PDF giữ nguyên bytes, quarantine.
- Property lock + revision CAS/idempotency; reservation/keys tồn tại bền vững trước provider writes. Reserve tổng **bytes sau xử lý** chỉ khi used + public inventory + reserved + incoming ≤ cap.
- Upload ảnh qua x-secret protected Neon origin; S3 write keys chỉ ở origin. PDF qua R2 private binding. Node dev dùng `remote: true`, không storage giả.
- Finalize chuyển reserved → used sau writes; retry finalized receipt không tạo bản mới. PDF quarantine vẫn tính used; ảnh đã re-encode có thể ready.
- Failure/expired reservation: xóa owned temporary objects trước release quota. Cleanup lỗi giữ reservation để retry; không fake release. Cleanup expired batches (>15 phút) chạy theo authorized upload flow, không tuyên bố có cron tự động.
- Delete bị chặn khi file liên kết hợp đồng/bản vẽ/retention hoặc là selected logo; chỉ giảm ledger sau delete provider hoàn tất. Reconcile API `/api/admin/media/reconcile` yêu cầu quyền, CAS/idempotency và audit.

DB và object storage không có distributed atomic commit. Low-volume property lock/provider-call serialization là chủ đích hiện tại; durable reservations và đối soát fail-closed bảo vệ khi lỗi/uncertain commit. Không gọi đây là cleanup mọi orphan/provider writer trong tài khoản.

`AdminSnapshot.storage` là `null` khi không biết hoặc `{ usedBytes: number; reservedBytes: number }` với nonnegative safe integer bytes. HTTP 413 cho size cap, 507 cho quota, 503 khi không xác nhận inventory; client checks chỉ UX.

## Evidence và deployment

**Bằng chứng lịch sử trước reset:** local Node với Neon/R2 thật đã upload/read/delete PNG, private PDF quarantine→manual-review→Range. Không có antivirus-clean claim. Không có run quota/build/test mới trong lần chỉnh tài liệu này; [readiness](backend-readiness.md) ghi bằng chứng chính xác.

Ngày 15/10/2026, owner-approved reset application DB đã giữ catalog/root/logo và provider Auth/storage, xóa business data cũ; không phải xóa mọi provider object hoặc bằng chứng bucket rỗng. Sau reset đã tạo branch `lgc-bot-test`; lần schema verification gần nhất ghi nhận 001–013 ở hai branch. Wrangler hiện có nhãn `NEON_BRANCH=lgc-bot-test`, nhưng runtime `DATABASE_URL` chưa được xác minh; tên Worker/cache `stage2` tự nó không chứng minh DB/budget/provider isolation. Inventory/ledger vẫn phải đối soát fail-closed theo chính sách trên. Snapshot/private backup ở [database guide](../database/README.md).

Các probe Worker → Neon S3/Functions trước đây trả 403 HTML; full Worker media readiness chưa chứng minh. Runtime DB/Auth targets chưa được kiểm tra mới; custom-domain/DNS vẫn hoãn. Không dùng việc đổi domain như yêu cầu để hoàn thành scope code.

R2 Standard pricing tham chiếu 06/10/2026 có 10 GB-month storage allowance và Class A/B riêng; vượt operation allowance vẫn có thể tính tiền dù app dưới 8.5 GB. Kiểm tra giá/account thực tại [R2 pricing](https://developers.cloudflare.com/r2/pricing/) và [Neon research](neon-free-tier-research.md) trước quyết định ngân sách.
