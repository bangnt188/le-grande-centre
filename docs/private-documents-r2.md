# Private documents trên R2 — phase 2

Cập nhật 19/10/2026. Private PDF pipeline đã có implementation và bằng chứng lịch sử local real-cloud; không còn design-only. Không soạn thảo hợp đồng, online signing/eSign hoặc tự xác nhận chữ ký. Wrangler bind bucket `mall-documents` cho Worker; runtime DB `DATABASE_URL` hiện trỏ Neon `production`, còn Auth/function targets là secrets riêng. Custom-domain/DNS chưa cutover.

## Storage và quyền

PDF giữ nguyên bytes trong R2 **private `mall-documents`** theo Wrangler binding; không public r2.dev/custom bucket domain. `PRIVATE_DOCUMENTS` binding là `remote: true` cả khi Next dev; public `mall-assets` không phải fallback private storage. Worker và local được cấu hình cùng bucket names, vì vậy stage2 không cô lập dữ liệu trong các bucket này. Hậu tố `stage2` không chọn Neon branch. Local `.env.local` và Worker `DATABASE_URL` hiện cùng trỏ production; Auth/function endpoints là runtime values riêng.

Browser dùng cùng origin `/api/admin/media/{id}/view`, không truyền object key/presigned bearer URL. Server kiểm tra Neon Auth session mới, emailVerified, DB active administrator allowlist/assignment và property-owned document version trước resolve provider/bucket/key. Hiện chỉ staff administrator được hỗ trợ; không tuyên bố customer portal/document grants UI đã triển khai. GET/HEAD/Range đều cùng guard.

## Upload → quarantine → external manual review

1. Bounded multipart, origin/session/scope, CAS/idempotency và quota inventory/reservation. Tối đa 4 file/batch, 20 MiB tổng, 10 MiB/file. PDF signature phải khớp MIME; đây **không** là parser/antivirus hoặc xác thực chữ ký.
2. Tạo immutable owned key/document version mới, store SHA-256 và size; không biến đổi bytes PDF hoặc ghi đè file gốc. PNG/JPEG/WebP là pipeline raster decode/re-encode riêng, lưu Neon chứ không R2 document bucket.
3. Upload PDF vào private storage, finalize metadata với state **quarantine**, vẫn tính quota. Ordinary view trả 403.
4. Admin có quyền tải bản quarantine bằng `/api/admin/media/{id}/view?review=1`, response attachment để **kiểm tra bên ngoài**. Không tự mở inline quarantine như tệp đã được duyệt.
5. Sau khi thực sự kiểm tra ngoài hệ thống, admin POST `/api/admin/media/{id}/review` với `confirmedExternalReview: true`, note 10–2000 ký tự, `expectedRevision` và UUID idempotency header. Server ghi manual reviewer/time/note, sealed_at, chuyển object ready và audit `reviewMethod: external-manual`, `virusScanPerformed: false`.
6. Tài liệu ready được xem qua authorized endpoint. Manual review **không đổi `scan_state` thành clean** và không chứng minh antivirus sạch, pháp lý hoặc chữ ký hợp lệ. Không có scanner/OCR/signature-verifier trong app.

Review là xác nhận thao tác kiểm tra ngoại bộ của người có quyền, không thay chính sách an toàn vận hành. Nếu chưa kiểm tra, giữ quarantine, không bypass bằng sửa state trong browser. `sealed_at` là metadata khóa phiên bản của ứng dụng, không phải bằng chứng WORM pháp lý hay chữ ký số.

## Delivery contract

`GET` / `HEAD /api/admin/media/{id}/view`:

- Full GET 200; valid single byte Range 206 với Content-Range/Length; invalid hoặc multi-range không hỗ trợ trả 416 (`bytes */size`). HEAD trả headers không body theo cùng quyền.
- Stream private provider body; không expose provider secret/link. Key từ DB, không key tùy ý của client.
- `Content-Type: application/pdf`, sanitized encoded filename, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, CSP sandbox/default-src none/frame-ancestors self.
- Review download dùng attachment; ordinary ready view inline. Session/ownership kiểm tra mỗi request, không cache permission xuyên request. Không tuyên bố đã ghi access audit mỗi GET/Range: audit hiện có cho mutation/upload/review/quota, không phải một access log hoàn chỉnh.

Byte đã được tải không thể thu hồi bằng revoke. CORS không thay authorization; không cấp browser presigned download như cơ chế mặc định. Các file public brochure đã được duyệt là catalog khác, không là hợp đồng private.

## Liên kết, retention và deletion

DB giữ document/version stable IDs, location provider/bucket/object_key, bytes/hash, quarantine/ready state và manual-review metadata; lease/plan liên kết bằng FK version. Không lưu signed URL dài hạn.

File được liên kết hợp đồng/bản vẽ, retention/legal hold active hoặc selected website logo không được xóa/đổi liên kết tùy ý. Xóa vật lý hoàn tất mới giảm ledger; failed/expired batches giữ reservation đến cleanup thật. DB và R2 không distributed atomic commit; reconcile inventory/ledger khóa upload khi mismatch. Xem [quota](storage-quota.md).

Không tự bật bucket indefinite lock hoặc tuyên bố R2 là WORM không thể bypass. Chính sách retention/backup và quyền provider là trách nhiệm operator/owner; metadata soft-delete không phải backup bytes. Không ghi bytes/cookies/secrets/presigned URLs vào audit.

## Bằng chứng và giới hạn

**Bằng chứng lịch sử trước reset:** local Node Next localhost:3100 với Neon/R2 remote đã quan sát PDF upload 200 → ordinary quarantine read 403 → manual external review 200 → authorized Range 206. Đây không phải proof antivirus/signature hoặc private-media flow trên Worker sau hợp nhất. Test fixture emailVerified không chứng minh OTP delivery. Không có build/test/cloud smoke mới trong lần chỉnh docs này.

Các probe trước đây ghi nhận native Cloudflare Worker fetch tới Neon S3/Functions 403 HTML trước provider; R2 binding không chứng minh Neon path ready. Protected Neon image origin chưa chứng minh sửa cross-zone denial. Worker `DATABASE_URL` hiện trỏ Neon `production`; `NEON_BRANCH` đã gỡ khỏi Wrangler. Auth target chưa được xác minh cùng lần cập nhật này. Custom-domain/DNS vẫn hoãn. Reset app DB đã xóa business data cũ nhưng giữ provider Auth/storage; không suy rằng private bucket đã trống. Snapshot/private backup ở [database guide](../database/README.md); [readiness](backend-readiness.md) tách trạng thái hiện tại và bằng chứng lịch sử.

Khi chuyển storage: giữ schema+migrations/relational IDs, copy object keys/catalog cùng verified metadata và bytes/hash; đổi locator có audit sau đối soát. Không export/import opaque snapshots hoặc biến hợp đồng thành public để đơn giản migration.

## Nguồn chính thức

- [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- [R2 Workers bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
- [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).
