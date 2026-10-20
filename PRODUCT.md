# Le Grande Centre

<!-- impeccable:product-schema 1 -->

## Platform

web

## Runtime

Next.js SSR/standalone + OpenNext, same-origin admin/API/public.

## Users

Chủ đầu tư và đội vận hành được cấp quyền quản lý doanh nghiệp, yêu cầu, mặt bằng,
lịch hẹn và tài liệu. Public khách gửi nhu cầu tư vấn/tham quan; chưa có portal khách thuê.

## Product Purpose

Giúp đội vận hành đọc đúng quan hệ tầng/slot/mặt bằng ghép và hồ sơ doanh nghiệp,
tiếp nhận nhu cầu thật, theo dõi giữ chỗ/hồ sơ thuê mà không giả availability, tiền
hoặc chữ ký từ nội dung minh họa.

## Capabilities and Constraints

- Sáu tầng cố định. Nội dung/công năng website có trường DB được chỉnh rõ ràng;
  không tự sửa brochure hoặc coi geometry tham khảo là bản vẽ khảo sát.
- Slot thuộc một tầng; chỉ ghép liền kề cùng tầng, không qua sảnh/thông tầng.
  Ghép/tách giữ danh tính/diện tích thành viên và chặn khi có cam kết.
- Public tầng 1–2 có 11 cặp A.n/B.n liên thông; khách có thể thuê riêng/kết hợp,
  không mặc định thuê cả cặp. Đây không là ghép admin xuyên tầng.
- Occupancy chỉ **Trống / Đang thuê**; **Đang chọn** là UI. Hold vẫn Trống nhưng
  active/unexpired hold khóa thao tác xung đột.
- `/admin/` dùng Neon Auth thật, verified email + DB staff allowlist/assignment
  active. Signup không tự cấp quyền; không demo auth/IndexedDB fallback.
- Relational Neon PostgreSQL commands có CAS/idempotency/audit/RLS. Metadata DB,
  raster/logo Neon-only, PDF R2 private; không opaque snapshot persistence.
- Baseline+migrations001–004 có trên stage2/regression/production backend;
  production chỉ seed 6 tầng/81 approved brochure slots, owner allowlist và verified
  Neon logo, không fake customer/financial transactions. Frontend production/domain/
  DNS **chưa cutover theo yêu cầu người dùng**.
- Worker→Neon S3/Functions còn 403 HTML trước provider; local Node real-cloud
  proof không chứng minh all-Worker media ready. Auth OTP configured không chứng
  minh email delivery/owner onboarding.

## B2B workflow confirmed

- Gửi yêu cầu → chủ đầu tư duyệt → giữ chỗ có hạn; lịch hẹn độc lập.
- Public live form commit lead/intake trước báo tiếp nhận, không tạo/xác nhận booking.
  Public projection không tenant/contact nội bộ, hold deadline hoặc hợp đồng private.
- Hợp đồng chỉ upload/quản lý/liên kết/thay PDF có sẵn, không draft editor/eSign/
  tự xác nhận đã ký. PDF quarantine cần **manual external review**, không antivirus.
  Financial fields thiếu vẫn unknown/null, không số mẫu giả.
- Sidebar giữ một mục **Doanh nghiệp**: một danh sách có search/status filter và một pagination server, không còn ba tab lớn. Tổng quan toàn property độc lập bộ lọc.
- Hồ sơ mở bằng shared Sheet bên phải (~45% desktop, toàn màn hình mobile), gồm **Tổng quan / Yêu cầu / Mặt bằng thuê / Hợp đồng**. Chỉ tải dữ liệu phần đang mở; tài liệu private nằm cùng hợp đồng. Không có lịch sử hoạt động trên giao diện, vẫn giữ business audit.
- Card category là projection theo thứ tự: recorded lease → **Đang thuê**; else
  active hold chưa hết hạn → **Đang giữ chỗ**; else submitted/reviewing request →
  **Đang tư vấn**; else **Chưa thuê**. Không lưu category như master field riêng.
- Hồ sơ→Hợp đồng giữ đúng record ID; biểu mẫu có thay đổi chưa lưu vẫn được bảo vệ.
  Arrow keys di chuyển focus tab, Enter kích hoạt. Không giả mất context bằng
  chọn record đầu tiên sau chuyển tab.
- Bỏ global `AdminPageHeader` title/description/reload trên mọi screen. Giữ heading
  nội bộ panel và error-only **Thử lại** để phục hồi empty workspace; shell vẫn có
  breadcrumb/Mở website/Đăng xuất.
- Website settings lưu DB và public dùng approved projection, không giới hạn browser.
  Zalo độc lập hotline; logo chỉ Neon, private PDF không public CDN.

## Brand Commitments

Tên đúng **Le Grande Centre**, domain tham chiếu https://legrandecentre.vn/ (chưa
kết nối/cutover lần này). Semantic theme shopping-mall từ packages/ui là nguồn màu;
Zalo giữ xanh nhận diện riêng. Shared motion/forms/toasts ở component-ui, app giữ
nội dung/business validation. Source 3D đã archive, homepage 2D giữ nguyên.

## Evidence on Hand

- Approved brochure seed 6 tầng/81 căn; geometry/dimensions là tham khảo có nguồn,
  không cam kết bản vẽ chính thức hoặc quyền tháo tường.
- Local real-cloud sign-in/workspace/media/lease/appointment/intake đã quan sát;
  chi tiết và giới hạn tại docs/backend-readiness.md.
- Latest Main browser checks tại 1440/390/320px: không page overflow, bảng tenant
  min720 cuộn trong panel; Tabs/record entry/draft confirmation đúng.
- Main reported `test:admin` 23 pass/1 live skip, isolated `test:database` 2/2 pass,
  typecheck/backend integrity/tests/OpenNext build pass; không rerun bởi doc editor.

## Product Principles

- Giữ slot identity/relationships và nhãn status đọc được, không chỉ màu.
- Category suy ra từ workflow thật, không thêm nguồn dữ liệu mâu thuẫn.
- Không bỏ draft/record context khi điều hướng, không false-success trước commit.
- Tách bằng chứng local/CI khỏi production deploy, OTP delivery, antivirus và pháp lý.
