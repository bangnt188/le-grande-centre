# Đề xuất nâng cấp điều hướng UX quản trị — để sau

Ngày: 20/10/2026. Trạng thái: **backlog tùy chọn, chưa duyệt triển khai**.

Chủ đầu tư xác nhận yêu cầu hiện tại là kiểm tra **flow nghiệp vụ**, không phải refactor điều hướng UX. Tài liệu này chỉ giữ lại đề xuất trước đó để xem xét khi khách có nhu cầu nâng cấp. Không dùng nó làm điều kiện chặn sửa liên kết nghiệp vụ, không tự thực hiện thay đổi URL/history/Sheet, không coi đây là phạm vi đã đặt hàng.

## Bằng chứng hiện tại

Quan sát ứng dụng local trên browser thật với session và API fixture tổng hợp; mọi API browser được intercept, không ghi DB/cloud. Đây không phải kiểm thử private production hoặc kết luận về toàn bộ quy trình nghiệp vụ.

| Tình huống | Quan sát |
| --- | --- |
| Danh sách doanh nghiệp → hồ sơ → browser Back | Về Tầng thay vì chỉ đóng hồ sơ về danh sách doanh nghiệp. |
| Doanh nghiệp trang 2, tab Yêu cầu → chi tiết yêu cầu → Back | Đúng doanh nghiệp mở lại nhưng danh sách về trang 1, tab về Tổng quan. |
| Hồ sơ doanh nghiệp → hợp đồng → Quay lại doanh nghiệp | Về danh sách, không về hồ sơ nguồn; thêm bước history mới. |
| Refresh một màn không phải slot | Khởi tạo lại về Tầng. |

Source: `src/app/admin/admin-workspace.tsx:180–255,383–408`; `src/app/admin/b2b-workspace.tsx:46–87,110–125,204–260`. State phân tán giữa hash/history, state màn cha và state cục bộ. Một số state danh sách doanh nghiệp mất khi nhánh màn bị unmount; request/lease page/filter ở màn cha không được coi là mất theo cùng cách. Chưa có bằng chứng mất draft âm thầm; `AdminEditor` đăng ký dirty với `markDraft`, điều hướng chung có guard.

## Phương án nâng cấp được đề xuất, chưa phê duyệt

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
| URL định danh trạng thái + vùng chi tiết theo ngữ cảnh | Hướng đề xuất khi nâng cấp; tái sử dụng màn/Sheet và chuẩn hóa history. |
| Tách mọi hồ sơ thành route Next riêng | Deep link rõ nhưng phạm vi lớn hơn; không mặc định cần thiết. |

## Điều kiện nghiệm thu nếu khách duyệt nâng cấp

1. Trang 2 → doanh nghiệp → tab Yêu cầu → yêu cầu → sửa → quay lại giữ đúng ngữ cảnh.
2. Back/Forward/Refresh và mở link trực tiếp nhất quán trên desktop/mobile.
3. Lưu/Hủy/409/lỗi mạng giữ đúng hồ sơ và draft; đang lưu không gửi lặp hoặc đóng ngoài ý muốn.
4. Trở về danh sách phục hồi bộ lọc, trang, dòng và focus/scroll hợp lý.
5. Không thay quyền, session, CAS/idempotency, scope dữ liệu, schema hoặc workflow nghiệp vụ chỉ để làm navigation.

## Ranh giới với việc cần xử lý hiện tại

Kiểm tra business flow riêng phải trả lời: dữ liệu đầu vào đến từ đâu; lead được liên kết doanh nghiệp như thế nào; từ doanh nghiệp/mặt bằng tạo yêu cầu nào; duyệt tạo giữ chỗ gì; giữ chỗ chuyển thuê hoặc hủy/hết hạn ra sao; lịch hẹn độc lập thế nào; hành động tiếp theo phải mở đúng hồ sơ nghiệp vụ nào. Không dùng refactor UX ở tài liệu này để thay cho việc sửa các đứt gãy nghiệp vụ đó.
