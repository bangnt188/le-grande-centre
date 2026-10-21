# Chuẩn hóa flow nghiệp vụ và điều hướng quản trị

Ngày: 20/10/2026. Trạng thái: **đã được chủ đầu tư duyệt và triển khai trong source; chưa phát hành bản thay đổi này**.

Yêu cầu mới “ok triển khai fix hết đi từ flow nghiệp vụ tới flow UX” thay thế quyết định để UX trong backlog. Phần dưới giữ lại triệu chứng trước nâng cấp và phương án được chọn; contract hiện hành và bằng chứng kiểm tra nằm trong [admin-data-contract.md](../admin-data-contract.md).

## Bằng chứng trước nâng cấp

Quan sát ứng dụng local trên browser thật với session và API fixture tổng hợp; mọi API browser được intercept, không ghi DB/cloud. Đây không phải kiểm thử private production hoặc kết luận về toàn bộ quy trình nghiệp vụ.

| Tình huống | Quan sát |
| --- | --- |
| Danh sách doanh nghiệp → hồ sơ → browser Back | Về Tầng thay vì chỉ đóng hồ sơ về danh sách doanh nghiệp. |
| Doanh nghiệp trang 2, tab Yêu cầu → chi tiết yêu cầu → Back | Đúng doanh nghiệp mở lại nhưng danh sách về trang 1, tab về Tổng quan. |
| Hồ sơ doanh nghiệp → hợp đồng → Quay lại doanh nghiệp | Về danh sách, không về hồ sơ nguồn; thêm bước history mới. |
| Refresh một màn không phải slot | Khởi tạo lại về Tầng. |

Nguồn khi audit: `src/app/admin/admin-workspace.tsx` và `src/app/admin/b2b-workspace.tsx`. Lúc đó state phân tán giữa hash/history, state màn cha và state cục bộ. Một số state danh sách doanh nghiệp mất khi nhánh màn bị unmount; request/lease page/filter ở màn cha không được coi là mất theo cùng cách. Chưa có bằng chứng mất draft âm thầm; `AdminEditor` đã đăng ký dirty với `markDraft` và điều hướng chung có guard.

## Phương án đã triển khai

Giữ màn xuất phát; xem hồ sơ liên quan trong một vùng chi tiết thống nhất có ngữ cảnh nguồn. Chỉ thao tác chuyển module rõ ràng mới rời khu vực đang làm việc. Desktop có thể dùng Sheet bên phải; mobile cùng semantics ở toàn chiều ngang. Không xếp chồng nhiều Sheet đọc hồ sơ chỉ để tạo đường quay lại.

- Back lùi đúng một bước; Đóng về danh sách nguồn; Hủy/Lưu form về đúng hồ sơ.
- Khôi phục module, ID hồ sơ, tab và bộ lọc cấu trúc từ URL; phục hồi trang, lựa chọn và vị trí cuộn trong ngữ cảnh danh sách.
- Dùng một chính sách điều hướng tập trung; không tiếp tục thêm các state/return callback riêng rẽ ở từng màn.
- Breadcrumb thể hiện hồ sơ và ngữ cảnh thực, không chỉ tên module.
- Link trực tiếp không có lịch sử vẫn có đích về danh sách hợp lệ.
- Không đưa token, nội dung draft, điện thoại/email hoặc nội dung hồ sơ riêng tư vào URL; không persist hồ sơ private vào localStorage.

## So sánh lựa chọn

| Lựa chọn | Trade-off |
| --- | --- |
| Vá từng nút Back | Ít sửa ban đầu nhưng duy trì nhiều quy tắc và nguồn state. |
| URL định danh trạng thái + vùng chi tiết theo ngữ cảnh | Đã chọn và triển khai; tái sử dụng màn/Sheet và chuẩn hóa history. |
| Tách mọi hồ sơ thành route Next riêng | Deep link rõ nhưng phạm vi lớn hơn; không mặc định cần thiết. |

## Điều kiện nghiệm thu

1. Trang 2 → doanh nghiệp → tab Yêu cầu → yêu cầu → sửa → quay lại giữ đúng ngữ cảnh.
2. Back/Forward/Refresh và mở link trực tiếp nhất quán trên desktop/mobile.
3. Lưu/Hủy/409/lỗi mạng giữ đúng hồ sơ và draft; đang lưu không gửi lặp hoặc đóng ngoài ý muốn.
4. Trở về danh sách phục hồi bộ lọc, trang, dòng và focus/scroll hợp lý.
5. Không thay quyền, session, CAS/idempotency, scope dữ liệu, schema hoặc workflow nghiệp vụ chỉ để làm navigation.

## Handoff nghiệp vụ đã nối

- Khách tiềm năng → liên kết doanh nghiệp có sẵn hoặc tạo doanh nghiệp và liên kết trong cùng transaction. Giữ thông tin/trạng thái lead; receipt và CAS ngăn tạo trùng khi retry.
- Doanh nghiệp → yêu cầu hoặc lịch hẹn có sẵn companyId. Mặt bằng/nhóm đang chọn → yêu cầu có đủ tầng và slot thành viên.
- Lưu thành công mở đúng entityId từ receipt; duyệt/hủy giữ chỗ vẫn ở yêu cầu nguồn. Giữ chỗ đã chuyển thuê mở đúng hợp đồng theo reservationId, không chọn hợp đồng tùy ý của doanh nghiệp.
- Hết hạn giữ chỗ và hủy giữ chỗ có trạng thái riêng. Không bổ sung gia hạn, thanh lý/bàn giao hoặc transition hoàn tất/vắng mặt cho lịch hẹn.

## Ownership và giới hạn

`admin-workspace-navigation.tsx` định nghĩa contract; `use-admin-workspace-controller.ts` sở hữu URL/history và ngữ cảnh private theo document; các màn chỉ yêu cầu mở hồ sơ/hành động. Root giữ một Sheet đọc hồ sơ; form có thể lồng nhưng không tạo nhiều Sheet chỉ đọc.

URL chỉ chứa loại màn/ID/tab/phân trang/bộ lọc cấu trúc. Search tự do, vị trí/focus và dữ liệu nháp không serialize vào URL/history.state/localStorage. Refresh khôi phục vị trí nghiệp vụ từ URL, không khôi phục nội dung chưa lưu; beforeunload cảnh báo draft. Đổi identity xóa ngữ cảnh private.

Chrome local đã kiểm desktop1366px/mobile390px bằng API fixture bị intercept, không ghi DB/cloud; PostgreSQL disposable kiểm transaction/CAS/replay/scope/rollback thật. Đây không phải kiểm thử mutation trên production hoặc bằng chứng đã deploy.
