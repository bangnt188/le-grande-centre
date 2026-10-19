# Slot gốc, cam kết theo thời gian và tài liệu private

Trạng thái tại lần cập nhật 14/10/2026: quyết định đã triển khai trong phase2 relational backend. Baseline + migrations 001–004 đã áp dụng trên stage2, regression disposable và backend production với approved project seed/owner allowlist/logo, không customer/financial fixtures; source SHA/domain cutover production chưa được ghi nhận khi đó. Owner xác nhận dự án không triển khai trên Vercel; release target hiện tại là Cloudflare Worker stage2, xem [deployment runbook](../deployment.md).

Dùng slot gốc ổn định, phiên bản mặt bằng tham chiếu slot và phân bổ theo thời gian để hỗ trợ phương án ghép mà không cho cam kết trùng. Luồng khách là **gửi yêu cầu → chủ đầu tư duyệt → giữ chỗ có hạn**; lịch hẹn độc lập. Public form chỉ tạo lead/intake, không booking. Public projection không công bố tenant/contact nội bộ hoặc countdown hợp đồng/hold.

Workspace ghi quan hệ bằng transaction/property lock, revision CAS, idempotency receipt, audit và RLS; không opaque snapshot/IndexedDB fallback. Occupancy chỉ Trống/Đang thuê, selection là UI. Hold vẫn Trống nhưng chặn mutation xung đột. Không tạo tài chính/chữ ký giả.

Tài liệu hợp đồng upload/quản lý/liên kết PDF có sẵn vào R2 private `mall-documents` (`mall-documents-stage2` ở stage2), xem qua same-origin `/api/admin/media/{id}/view` kiểm tra session/property mỗi GET/HEAD/Range. Quarantine cần **manual external review**, không antivirus-clean, không eSign hoặc xác nhận đã ký. Giữ nguyên bytes/hash, retention và liên kết chặn xóa.

## Trade-off

- Quan hệ nhiều hơn browser snapshot, đổi lại kiểm soát chồng slot, lịch sử bản vẽ và hồ sơ mà không thay slot gốc.
- Authenticated streaming/Range phức tạp hơn public URL, nhưng không biến document URL thành bearer permission. Bytes đã tải không thể thu hồi.
- Label không quyết định quyền hoặc giải phóng slot; thay lifecycle phải review command/invariant và migration.

## Migration và deployment

Baseline `database/schema.sql`, numbered migrations ở `database/migrations/`; operator `db:migrate` dùng direct connection, không tự apply production khi build. Chuyển tài khoản cần schema+migrations, relational IDs và object keys/catalog + verified metadata/bytes, không opaque snapshots.

Native Worker→Neon S3/Functions còn 403 HTML trước provider; local Node real-cloud proof không phải all-Worker readiness. Domain/DNS bị hoãn tại thời điểm cập nhật ADR; hiện trạng source SHA/DB xem [deployment runbook](../deployment.md). Xem [readiness](../backend-readiness.md), [private documents](../private-documents-r2.md), [thiết kế B2B](../b2b-leasing-design.md).
