# Architecture Decision — Demo quản trị mặt bằng Le Grande Centre

> **Tài liệu prototype lịch sử (06–12/10/2026).** IndexedDB, fixtures và `/admin-preview/` mô tả demo lúc đó, không phải kiến trúc hiện tại. Đối chiếu [admin architecture](admin-architecture-decision.md), [backend readiness](backend-readiness.md) và [database status](../database/README.md).

Quyết định ban đầu 06/10/2026; cập nhật 12/10/2026: admin dùng thử tại `/admin-preview/`, snapshot và tệp lưu IndexedDB trên trình duyệt, chưa có DB/API production.

## Hiểu bài toán

Đội vận hành/chủ đầu tư quản lý leads, media và mặt bằng theo 6 tầng cố định. Người dùng xác nhận chỉ ghép slot liền kề cùng tầng, không đi qua sảnh/thông tầng; chọn code-first để duyệt trực tiếp giao diện.

Bản vẽ khách hàng chứa B.1–B.11. B.1/B.11: 205 m², 10 × 20,5 m. B.2–B.10: 164 m², 8 × 20,5 m. Sảnh/thông tầng ở giữa B.5/B.6. Chưa xác nhận tầng của bản vẽ. Fixture lặp geometry trên cả 6 tầng chỉ nhằm mô phỏng, không được dùng làm inventory thực tế. Trạng thái, đối tác và leads là dữ liệu giả lập.

## Thiết kế và quyết định

- Sáu tầng cố định, sửa công năng qua command/repository và đồng bộ mọi màn; không thêm/xóa tầng.
- Slot là đơn vị gốc có ID chứa tầng, mã, diện tích, thứ tự và phía sảnh. Ghép tạo `SpaceGroup` tham chiếu các slot thành viên, không sửa geometry, mã hoặc diện tích gốc.
- Cho sửa diện tích slot chưa có cam kết và chưa thuộc nhóm. Tổng diện tích yêu cầu chưa quyết định được cập nhật theo slot; không tự thay geometry/brochure public.
- Bộ kiểm tra ghép xác nhận slot tồn tại, không trùng, cùng tầng, cùng phía sảnh, thứ tự liên tiếp, chưa thuộc nhóm khác. Demo chỉ cho ghép slot có text `Trống` và chưa có đối tác.
- Sơ đồ và bảng dùng chung selection. Nhóm hiện thành một footprint liên tục; bảng giữ từng slot gốc và chỉ rõ nhóm chứa nó. Diện tích nhóm là tổng diện tích thành viên.
- Cập nhật trạng thái nhóm đồng bộ ngay cho các slot thành viên; tách giữ trạng thái đó và chuyển media nhóm về tầng. Mã và diện tích gốc được bảo toàn.
- Theo yêu cầu 12/10/2026, slot/nhóm chỉ có Trống hoặc Đang thuê; Select và filter dùng chung SLOT_STATUSES, repository/API consumer từ chối trạng thái khác. Đang chọn chỉ là tương tác. Badge dùng UI system với --ui-slot-* token, cùng palette với sơ đồ.
- Leads/doanh nghiệp có form thêm/sửa, liên hệ và ghi chú; Lead có ba trạng thái hữu hạn, được liên kết doanh nghiệp. Khách đang thuê suy ra từ hồ sơ thuê, tên nhập trên slot không tự tạo doanh nghiệp.
- Media tìm/lọc, upload PNG/JPEG/WebP/PDF tối đa 10 MiB, kiểm tra header; Blob/snapshot commit nguyên tử. Đổi tên/liên kết, xóa có xác nhận và chặn tệp hợp đồng đang tham chiếu. Blob URL được tạo lại khi đọc sau reload, giải phóng khi dispose; không upload cloud.
- Hợp đồng chỉ upload/liên kết/thay PDF có sẵn, không ký online hoặc xác nhận tài liệu đã ký. Yêu cầu/giữ chỗ/lịch hẹn dùng giờ hiện tại; settings đặt mặc định nội bộ.
- Client Component nằm trong page Server Component với metadata noindex; public vẫn static export. Postbuild mặc định loại admin và asset demo; deploy demo opt-in. DTO/hàm thuần ở src/shared/admin/, hook gọi repository.

## Lý do và trade-off

Tách slot gốc và nhóm cho phép truy vết, tách lại và định danh media ổn định. Luồng ghép gần sơ đồ làm rõ quan hệ không gian trước khi thao tác. Sáu tầng cố định tránh phát sinh quy trình thay đổi cấu trúc công trình ngoài phạm vi.

IndexedDB giữ dữ liệu/tệp sau reload trong cùng origin/browser; không chia sẻ qua máy khác hoặc có auth/audit production. Revision CAS bảo vệ tab cũ, commit/quota lỗi không ghi dở hoặc báo thành công giả. Browser có thể chặn/evict; không dùng dữ liệu thật. Sơ đồ là mô phỏng; active hold chưa hết hạn và lease bảo vệ slot/nhóm khỏi thao tác sai luồng.

## Validate security / threat model

- **PII và quyền quản trị:** prototype chỉ có fixture, không có session, auth, API hoặc dữ liệu thật. `noindex` và loại route khỏi export không phải access control; production admin phải chạy trên managed runtime với authorization phía server.
- **XSS từ nội dung:** React render text, không render HTML tùy ý. Trạng thái, tên và ghi chú bị giới hạn độ dài. Tệp HTML/SVG bị loại khỏi demo; object URL không trở thành URL do người dùng tự nhập.
- **Tệp độc hại:** MIME/size ở client chỉ là kiểm tra trải nghiệm. Production cần xác thực upload, kiểm tra signature/size phía server, quét tệp, bucket private, download URL có thời hạn và Content-Disposition phù hợp. Không xem việc demo nhận PDF là chứng nhận tệp an toàn.
- **Ghép trùng do race condition:** kiểm tra trong browser chỉ đủ cho phiên demo. Production phải thực hiện validation và mutation trong transaction, khóa hoặc kiểm soát revision, và ràng buộc mỗi slot chỉ có một membership active.
- **Bịa số liệu dự án:** fixture được ghi rõ trên giao diện; inventory thật chỉ nhập từ bản vẽ đã xác nhận.

## Đề xuất và migration path production

1. Nhận bản vẽ được duyệt của từng tầng; lập inventory với ID ổn định, geometry và cạnh liền kề rõ ràng. Chưa chốt schema diện tích thật từ một ảnh.
2. Giữ hai trạng thái slot Trống/Đang thuê theo yêu cầu khách. Khả dụng và quyền ghép dựa vào lease/reservation và dữ liệu đã được duyệt, không chỉ nhãn Trống.
3. Giữ contract `Slot`, `SpaceGroup`, `Lead`, `Media` và thay React state bằng repository/API. Đưa merge/split sang server transaction; ghi actor, revision, before/after và hỗ trợ undo có kiểm tra xung đột.
4. Triển khai admin trên managed serverless runtime, managed relational database và private object storage. Áp dụng session, RBAC, audit, retention PII và upload policy trước khi nhập dữ liệu thật.
5. Chạy preview với dữ liệu đã xác nhận, kiểm tra nghiệp vụ và bàn giao; chỉ xuất nội dung được duyệt sang pipeline build của website công khai.

## Cách mở demo và giới hạn validation

`npm run dev -- --port 3106`, sau đó mở `http://localhost:3106/admin-preview/` với cấu hình mặc định không có base path. Nếu `NEXT_PUBLIC_SITE_URL` có path khác, dùng path đó.

Kiểm tra trình duyệt tại 1440, 768, 390 và 320 px; bảng và sơ đồ cuộn trong container ở màn hình nhỏ. Domain checks bao gồm valid merge, duplicate/missing IDs, khác tầng, qua sảnh, không liền kề, nhóm trùng và slot có đối tác. Browser kiểm tra ghép/tách, trạng thái text mới, lead, media, reload, ảnh tham chiếu và reduced motion. Kết quả chi tiết ở `.impeccable/review/checks.json`. Không chứng nhận bảo mật/hiệu năng của hệ thống production chưa triển khai.
