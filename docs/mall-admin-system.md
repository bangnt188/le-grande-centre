# Architecture Decision — Mall admin dùng UI system

## Trạng thái hiện tại — 18/10/2026

Admin phase2 dùng Neon Auth verified email + active DB staff allowlist và same-origin HTTP repository, relational PostgreSQL CAS/idempotency/audit/RLS; không demo login, IndexedDB hoặc quota scenarios fallback. Next SSR standalone/OpenNext thay Pages/static. Website settings DB/public projection, live form lead/intake không booking; Neon-only branding/raster, private R2 PDF quarantine + manual external review, không antivirus-clean/eSign/fake financials.

- Sidebar chỉ mục **Doanh nghiệp**, không Khách đang thuê/Hợp đồng riêng. Outer `@mall/ui Tabs`: **Tất cả / Khách đang thuê / Hợp đồng**.
- Company card category derived precedence: recorded lease → Đang thuê; else active unexpired hold → Đang giữ chỗ; else submitted/reviewing request → Đang tư vấn; else Chưa thuê. Không category persisted field.
- Dossier→contract entry mang exact record ID qua subtab; unsaved note confirmation giữ nguyên, arrows focus/Enter activate.
- Global `AdminPageHeader` title/description/reload đã bỏ toàn bộ screen; local panel headings còn, error-only **Thử lại** còn để phục hồi empty workspace. Shell breadcrumb/Mở website/Đăng xuất giữ nguyên.
- Main browser1440/390/320px không page overflow, tenant table min720 scroll nội bộ. Latest `test:admin`23pass/1liveskip (category precedence/time-boundary regression), isolatedDB2/2pass + child cleanup, typecheck/backend integrity/backend tests/OpenNext build pass. Không rerun bởi doc editor.

Snapshot vận hành 14/10/2026 ghi nhận baseline+migrations001–004, owner allowlist/logo, chưa cutover domain và Worker→Neon S3/Functions 403. Đó là bằng chứng lịch sử, không phải release hiện tại. Source checkout nay có migrations 014/015; floor-plan readers cần 015. Schema live gần nhất được xác minh đến 013, còn Worker runtime `DATABASE_URL` cần xác nhận riêng. Owner xác nhận không deploy Vercel; xem [deployment](deployment.md), [database guide](../database/README.md) và [readiness](backend-readiness.md) để biết trạng thái mới nhất.

## Lịch sử thiết kế và bằng chứng — không phải runtime hiện tại

Các phần từ đây bảo tồn quyết định/capture/check cũ. Demo/IndexedDB/admin-preview/static-export/3D viewer/standalone tenant-contract menus và global AdminPageHeader trong các ghi chép này đã bị current status phía trên thay thế; không dùng lịch sử làm acceptance proof phase2.


## Hiểu

Yêu cầu: tăng độ sang của admin mall, dùng component hiện có, thay feedback banner bằng toast system và hiển thị pagination thật. Giữ quy trình B2B, dữ liệu mẫu, sáu tầng cố định và điều kiện ghép slot.

## Thiết kế

- App map semantic tokens sang nền kem, xanh sâu, đồng; sidebar tối và nội dung sáng. Tiêu đề serif tạo phân cấp, dữ liệu vẫn dùng sans dễ đọc. Đây là thay đổi admin, không chỉnh landing.
- Controls dùng `Button`, `Input`, `Select`, `Textarea`, `Checkbox`; trạng thái dùng `Badge`; navigation nội dung dùng `Tabs`/`ButtonGroup`; cấu trúc dùng `AdminShell`, `AdminPageHeader`, `AdminPanel`, `WorkspaceLayout` và `Breadcrumbs`.
- Bảng slot/hợp đồng dùng `Table` có props cộng thêm cho row selection/click và vùng cuộn ngang có tên. Semantic table được giữ; nút Chi tiết vẫn là đường truy cập keyboard.
- `AdminNotificationsProvider` chỉ quản lý hàng đợi app tối đa ba thông báo. `AdminToastViewport` render component `Toast` của system ở góc dưới, trong themed root. Success/warning/error có tone tương ứng, đóng được, tự hết hạn; pause khi hover/focus và live announcement do component system cung cấp. Không dùng feedback banner cũ.
- Pagination tái sử dụng `Pagination` + `Select`. Filter/sort xảy ra trước slice. Số dòng 2/5/10/20; chọn số dòng hoặc đổi filter đưa về trang đầu; page được clamp khi dữ liệu giảm. Footer hiển thị khoảng bản ghi và tổng số thật sau filter.
- Doanh nghiệp, yêu cầu, hợp đồng, lịch hẹn, slot, lead và media đều có pagination. Các register nhỏ dùng 2 dòng mặc định để người duyệt thấy nhiều trang mà không phải thêm dữ liệu giả không cần thiết.
- Loading dùng system indicator/Button loading. Thông tin nghiệp vụ lâu dài (giữ chỗ, deadline, cảnh báo hình học) là trạng thái hồ sơ; hướng dẫn ghép dùng `Alert`, không biến toàn bộ thông tin đó thành toast tự biến mất.

## Validate security

Text toast được React escape, không HTML injection. Queue không lưu dữ liệu ra storage/log và không chứa file hợp đồng thật. Pagination phía trình duyệt chỉ áp dụng snapshot demo hoặc dữ liệu API đã được cấp quyền; không phải ranh giới authorization. API production phải lọc quyền ở nguồn, giới hạn page size và trả total/cursor phù hợp trước khi render. Role/mode preview không cấp quyền.

## Lý do, trade-off và migration

Dùng primitives sẵn có giữ focus, disabled/loading, announced status và page semantics nhất quán. App chỉ quản lý domain state, presentation tokens và composition. Trade-off: current demo phân trang client vì repository cung cấp snapshot; với dữ liệu lớn cần server query, không tải toàn bộ snapshot rồi coi pagination là giới hạn dữ liệu.

Migration: thay read toàn bộ register bằng repository query có filter/sort/page hoặc cursor và metadata, giữ `Pagination`/toast/theme adapter. Không sửa component system khi nối DB. Package `Table` mở rộng props theo cách tương thích ngược, consumer cũ không cần thay đổi.

## Phạm vi bằng chứng

Các bản capture `.impeccable/review/mall-system-*` bao gồm desktop/mobile company, toast, lease, slot, lead, desktop request/media/topnav và mobile menu. Browser observation log ghi việc lưu ghi chú → toast, chuyển page doanh nghiệp/hợp đồng → records mới. Typecheck/static build và review cuối được báo riêng; không có production auth/storage/deployment được triển khai. Không thêm hoặc chạy automated tests.

## Architecture Decision — Pagination giữ vị trí ổn định

**Hiểu:** chiều cao danh sách trước đây co theo số item; trang cuối ít item kéo footer phân trang lên. Table auto-layout còn tính lại cột theo dữ liệu mỗi trang, làm chiều cao dòng thay đổi trên mobile.

**Thiết kế:** shared `PaginatedContent` giữ chiều cao lớn nhất đã render tại cùng độ rộng. Footer `Pagination` nằm sau vùng đó. Không tạo bản ghi/trống giả trong table. Đổi page size/density hoặc container width cho phép tính lại; filter, trang cuối và empty state giữ không gian hiện tại. Nội dung dài vẫn được phép nở để không mất dữ liệu. Bảng slot có độ rộng cột ổn định và cuộn ngang trong viewport hiện có.

**Validate security:** observer chỉ đo hình học DOM; không truy cập dữ liệu nghiệp vụ, storage hay network. Không đổi query, giới hạn quyền hoặc nội dung hợp đồng. Observer được ngắt khi unmount; markup bảng và controls system giữ nguyên semantics/focus.

**Trade-off:** khoảng trống ở trang cuối là không gian đã dành cho dữ liệu, giúp nút điều hướng không chạy khỏi vị trí người dùng đang thao tác. Nội dung dài hơn mọi trang đã xem có thể tăng chiều cao để tránh cắt nội dung. Không khoá một chiều cao desktop cho mobile. Quy tắc này là quyết định UX của sản phẩm, không phải một chứng nhận 'global'.

**Migration:** cả bảy register dùng cùng primitive của `@mall/ui`; khi thay snapshot bằng API chỉ giữ `layoutKey` cho page size/density, không thêm page number vào key và không mount lại region mỗi lần tải trang.

## Architecture Decision — Mobile master/detail và dữ liệu đang sửa (07/10/2026)

**Hiểu:** full review phát hiện chọn item trên mobile cập nhật chi tiết ngoài viewport, ghi chú có thể mất khi đổi doanh nghiệp, hủy lịch chưa có xác nhận và panel dung lượng đẩy danh sách tệp xuống quá xa.

**Thiết kế:**

- Khách hàng, yêu cầu, hợp đồng, lead, media và mặt bằng public dùng `WorkspaceLayout` có `mobilePresentation="drilldown"`. Mobile mở chi tiết với nút quay lại; desktop giữ hai vùng. `useRecordDetail` quản lý item phát sinh thao tác, focus khi quay lại, fallback khi trigger đã unmount và cuộn tới vùng phù hợp. Tablet hợp đồng vẫn cuộn khi cột chuyển sang stack đến 1200px.
- `useCompanyNotes` giữ draft theo company ID ở phía trên view switch. Form controlled hiển thị chưa lưu/đã lưu. Đổi doanh nghiệp hoặc màn hình có xác nhận qua `ConfirmDialog`, cho phép tiếp tục và giữ bản nháp. Đóng/tải lại trang có native beforeunload khi còn draft. Lưu thất bại giữ draft; lưu thành công chỉ xoá đúng phiên bản vừa gửi, không xoá chỉnh sửa phát sinh trong khi chờ.
- Hủy lịch dùng `ConfirmDialog` hiện doanh nghiệp, ngày/giờ và mục đích. Command chỉ chạy khi xác nhận; ref lock chặn click trùng. Không giả lập undo sau khi nghiệp vụ đã hoàn tất.
- Media mobile giữ progress %, badge trạng thái và dung lượng còn lại ở ngoài. `Button` mở/đóng thông tin chi tiết, số liệu dự phòng và select trạng thái demo. Trạng thái chưa có số liệu/đạt cap luôn cho biết upload đang khóa, độc lập với vùng thu gọn. Desktop tiếp tục hiện đầy đủ thông tin.
- Token text phụ và warning được tăng tương phản; các thao tác nhỏ trên mobile có vùng chạm ít nhất 44px. Sơ đồ và tab có hướng dẫn cuộn ngang. Dùng controls và dialog có sẵn trong `@mall/ui`.

**Validate security:** draft chỉ sống trong bộ nhớ phiên, không ghi PII vào localStorage. Điều hướng/focus không đổi quyền truy cập. Dialog xác nhận không thay thế kiểm tra authorization, trạng thái và transaction của cancellation phía backend; command hiện tại vẫn đi qua repository. Quota vẫn được kiểm tra ở repository, phần thu gọn chỉ thay cách trình bày.

**Trade-off:** drilldown giảm chiều dài mobile và làm kết quả click rõ hơn, nhưng cần một lần quay lại để so sánh item khác. Draft phiên tránh lưu dữ liệu nhạy cảm lâu dài, đồng thời không khôi phục được sau reload nếu người dùng bỏ qua cảnh báo. beforeunload phụ thuộc hành vi browser và không bảo đảm khi hệ điều hành đóng ứng dụng; draft bền vững cần một thiết kế lưu phía server riêng.

**Migration:** giữ `WorkspaceLayout`/`ConfirmDialog` và các hook phía app khi nối backend. Draft production cần version/optimistic concurrency, lưu có xác nhận và quyền theo company ID. Chính sách cancellation thực tế và quota được backend thực thi.

**Bằng chứng của lượt triển khai:** TypeScript pass; SSR render pass cho 5 B2B view và root admin; 3 test repository hiện có pass. UI/backend package build pass. Full Next build bị chặn khi fetch Google Fonts do network/DNS của sandbox. Server local bị chặn `listen EPERM`, Chromium bị chặn MachPort; vì vậy chưa có ảnh hoặc xác minh tương tác trình duyệt sau sửa. Backlog review được giữ mở cho bước xác minh trực quan.

## Animation điều hướng — 12/10/2026

Sửa CSS của shared AdminShell thay vì thêm override riêng ở Mall. Bỏ đổi justify-content/display tức thì khi sidebar thu gọn: icon giữ vị trí gần cố định, hàng giữ 44px, nhãn/footer fade và clip khi resize; grid/padding dùng cùng easing 220ms. Menu mobile dùng transform và backdrop opacity, reduced motion chuyển trạng thái tức thì. Desktop 1440px đo icon chỉ dịch khoảng 2,5px, hàng không đổi chiều cao/vị trí; kiểm tra bấm đảo chiều liên tục và Tenant. Mobile 390px không tràn ngang, Escape đóng và trả focus về nút mở. UI library build và app TypeScript pass; chưa deploy frontend.

## Điều hướng thống nhất và đăng nhập demo — 12/10/2026

- Sidebar cố định chia Mặt bằng (Tầng, Căn / Mặt bằng), Kinh doanh (Doanh nghiệp, Khách đang thuê, Khách tiềm năng, Yêu cầu & giữ chỗ, Hợp đồng, Lịch hẹn), Tài nguyên (Media). Bỏ dropdown Nghiệp vụ thuê và selector layout ở app; shared AdminShell giữ API preset cho consumer khác và nhận group label tùy chọn.
- Header giữ breadcrumb, link Mở website ở tab mới, Đăng xuất. Tabs chỉ nằm trong hồ sơ; filter, pagination, toast và danh sách/chi tiết vẫn dùng UI system. Dialog menu mobile kế thừa đúng theme xanh.
- Login /admin-preview/, workspace /admin-preview/workspace/. Username/password bắt buộc để trình diễn nhưng không lưu/gửi hoặc xác thực; sessionStorage chỉ giữ marker. Đăng xuất xóa marker, cảnh báo draft; dữ liệu đã lưu giữ trong IndexedDB. Không phải ranh giới bảo mật production.
- Form đăng nhập dùng trực tiếp TextField và PasswordField của @mall/ui; component system sở hữu label, required marker và nút mắt hiện/ẩn nằm bên trong viền input, có nhãn truy cập. Đã bỏ showPassword và CSS overlay/password riêng của app. Kiểm tra Chromium 1440/390px: password → text → password, không tràn ngang, Enter bằng admin/demo123 vào Tầng; TypeScript pass.
- Hồ sơ hợp đồng demo HD-2026-004 gắn PDF mẫu thật tại admin-demo/contract-sample.pdf. “Xem tài liệu” mở Modal với iframe PDF gốc cùng liên kết mở tab/tải xuống; các hợp đồng khác không có tệp thì không giả hiển thị bản mẫu. Snapshot IndexedDB cũ được bổ sung fixture nếu thiếu, chỉ gắn PDF vào hợp đồng này khi chưa có tệp. Tệp chỉ thuộc demo asset, không nằm trong export mặc định.
- Xóa màn public preview, portal ẩn, state/cờ/fixture/CSS và command submit-request chỉ phục vụ các màn đó; không đổi website public, form liên hệ hay schema SQL.
- Build demo static với INCLUDE_ADMIN_DEMO=true NEXT_PUBLIC_ADMIN_DEMO=true thành công; TypeScript và 3 test repository pass. Chromium kiểm tra cả 9 menu, login/logout, nhãn/mật khẩu, draft confirmation, reload và direct-entry gate. Production export ở 1440/390/320px không tràn ngang; menu mobile chọn Hợp đồng focus heading và đóng đúng. Không deploy frontend.

## Hai trạng thái slot và badge đồng nhất — 12/10/2026

- Khách hàng chốt Trống / Đang thuê; Đang chọn chỉ là UI selection. Shared SlotStatus và SLOT_STATUSES ràng buộc DTO/command, Select/filter và validation. Xóa trạng thái khác, text tự do, datalist và palette reserved khỏi slot; không đổi trạng thái Lead, request, hold hay lease.
- Fixture bắt đầu Trống/không có đối tác, sau đó suy ra occupancy/tenant từ lease mẫu. Giữ chỗ không tạo trạng thái slot thứ ba hoặc giả đã thuê. Cập nhật nhóm đồng bộ các slot ngay trước tách; về Trống xóa tên đối tác cũ. Shared hasCommitment bảo vệ cả UI lẫn repository khi sửa/ghép/tách.
- Sơ đồ, chú giải, badge danh sách và badge dossier dùng --ui-slot-available/leased/selected-* dẫn xuất từ semantic theme tokens. Trống xanh nhạt, thuê đồng nhạt, chọn xanh đậm/chữ sáng/viền accent; nhãn và dấu chọn vẫn hiện, không chỉ dựa màu. Không có màu hex trong quy tắc palette slot.
- Chromium 1440/390/320px kiểm chứng status/tenant và badge cập nhật cùng nhau, clear tenant khi Trống, nhóm cập nhật cả hai badge và giữ trạng thái sau tách, active hold và leased dossier khóa thao tác. Tương phản text đo khoảng 5,35:1 cho Trống và 5,39:1 cho Đang thuê; hover không đổi palette. Test admin 5/5, backend consumer 2/2, TypeScript và build static pass; chưa deploy.

## Toàn bộ admin vận hành để khách test, chưa nối DB — 12/10/2026

Phạm vi được chốt là toàn bộ phân hệ hiện có, không riêng tầng. Khách chọn lưu browser; hợp đồng chỉ upload và quản lý PDF, không có ký online/eSign hoặc bước xác nhận chữ ký.

- Thêm Cấu hình (tên/liên hệ nội bộ, giờ giữ chỗ, thời lượng/địa điểm hẹn mặc định), sửa công năng tầng, hồ sơ doanh nghiệp/lead, yêu cầu thuê và lịch hẹn. Khách thuê được tổng hợp từ hồ sơ thuê, không tạo master trùng.
- Form tái sử dụng AdminEditor + Modal/ConfirmDialog/fields/buttons của @mall/ui, có lưu/hủy, pending/error, cảnh báo draft và refresh ngay trong form mà không xóa nội dung đang nhập. Sửa trực tiếp/tách/ghép vẫn kiểm tra cam kết.
- Snapshot, metadata và Blob lưu bằng IndexedDB transaction/revision CAS; không dùng giả lập quota slider, không báo thành công trước commit và không fallback memory khi browser chặn. Asset demo tĩnh không tính vào byte ledger local; hasUploadedFile phân biệt file upload với mục/asset mẫu.
- Hợp đồng nhận PDF thực, liên kết/thay file, xem iframe/mở/tải từ URL thực. Lưu từ giữ chỗ chuyển toàn tổ hợp sang thuê qua thao tác rõ ràng; không tạo ngày ký hoặc xác nhận nội dung tài liệu.
- Deadline/lịch dùng giờ hiện tại, timezone Việt Nam; giữ chỗ hết hạn không khóa slot như cam kết còn hiệu lực. Không tự giải phóng lease theo ngày hết kỳ; cần quy trình bàn giao được chốt.
- Dark theme chỉ áp dụng sidebar/menu mobile qua data-admin-navigation, không phủ lên mọi dialog. Xóa CSS của lead/media/inspector/quota demo đã thay thế. Website public, SQL và kết nối cloud/auth không thay đổi.

Kiểm chứng nghiệp vụ trên Next dev và static export: công năng lưu/đồng bộ/reload/cancel; slot sửa diện tích/status/tenant, ghép/tách có xác nhận; doanh nghiệp/lead thêm-sửa/liên kết; yêu cầu thêm-sửa/duyệt → giữ chỗ → PDF → thuê; lịch tạo-sửa-xác nhận-hủy; ảnh upload-rename-relink-render sau reload-xóa; settings áp dụng vào defaults. Hai tab từ chối snapshot cũ, refresh giữ draft và chỉ lưu khi bấm lại; inject QuotaExceededError chứng minh commit thất bại không đổi snapshot hoặc mất draft, sau khôi phục lưu được. PDF thay thế đọc được 597 byte sau reload và URL download đúng; automation download/capture bổ sung bị lỗi tool nên không xác nhận file tải xuống OS. Không tuyên bố auth/private cloud, quota nhà cung cấp hoặc deploy frontend đã hoàn tất.

Cuối lượt: TypeScript, 14 repository regressions, 1 tenant projection regression, 1 backend-consumer security regression và build static opt-in pass. Form doanh nghiệp ở 390/320 px đo không tràn ngang (dialog có lề 16 px, scroll dọc nội bộ), tất cả fields nằm trong panel. Animation/capture/download automation phát sinh lỗi: drawer giữ data-starting-style và dialog đóng giữ data-ending-style khi browser timeline bị ngừng. Các phép đo mobile dùng reduced-motion/QA-only closed-overlay isolation; chưa xác nhận animation mobile của lượt này. Floor và modal desktop đã có capture trực quan trước lỗi tool. Không sửa code ứng dụng để che lỗi automation.

## Media thực và cấu hình website — 12/10/2026

Catalog tự sinh trước dev/build gồm 38 tệp local và video R2 hiện có: 27 ảnh, 3 PDF, 7 model 3D, 1 HDR, 1 video. Bộ lọc loại/nguồn và tìm tên/đường dẫn giữ upload IndexedDB khi cập nhật catalog. Asset website chỉ đọc, không có thao tác xóa/đổi metadata; ảnh dùng FilePreview, video dùng Video, PDF dùng viewer browser, model mở viewer công trình hiện có hoặc tải file. Không giả dung lượng/quota cho video ngoài.

WebsiteSettings dùng AdminEditor cho email, hotline, hai số tùy chọn, địa chỉ và link https://zalo.me/ riêng. Tải/chọn logo mới hiện bị khóa vì demo login không phải xác thực để ghi vào Neon; logo hiện tại/fallback được giữ nguyên cho tới khi có endpoint upload an toàn. Public đọc snapshot có sẵn, không tạo DB khi khách lần đầu mở website; refresh sau lưu, focus hoặc BroadcastChannel. SSR giữ giá trị mặc định. Các trường demo chỉ áp dụng cùng origin/trình duyệt; chưa có DB/cloud hoặc publish toàn cầu.

Browser đã kiểm tra lưu cấu hình cập nhật trang liên hệ ở tab khác, Zalo khác hotline, ẩn số tùy chọn trống và reload giữ giá trị. Tải/chọn logo mới bị khóa; không ghi logo mới vào IndexedDB.

Kiểm chứng cuối: R2 video phát thật (duration 51,413 s, currentTime tăng); 38 URL local trả HTTP 200; screenshot desktop/mobile xác nhận thumbnail thực. Media 390 px và form cấu hình 390/320 px không tràn ngang; form có scroll nội bộ. Public origin mới không tạo IndexedDB. Next dev/Turbopack trên 3106 đã đăng nhập → lưu email → trang liên hệ dùng email mới, không có page error. TypeScript, 18 regressions và static build opt-in pass; bản build UI được sinh lại trước typecheck để đồng bộ exports motion đang có trong source.
