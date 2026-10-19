# Architecture Decision: Admin Le Grande Centre

## Trạng thái hiện tại — 19/10/2026

Phase2 đã thay phương án prototype/static ở phần lịch sử dưới đây: Next SSR standalone/OpenNext, `/admin/` Neon Auth verified email + DB active staff allowlist, cùng-origin API; không demo login/IndexedDB fallback. Relational Neon commands có property lock/CAS/idempotency/audit/RLS. Public đọc projection tối thiểu; live form tạo lead/intake, không booking.

Sidebar chỉ **Doanh nghiệp**; outer shared Tabs **Tất cả / Khách đang thuê / Hợp đồng**, không sidebar tenants/contracts riêng. Card category suy ra recorded lease trước, rồi unexpired active hold, rồi submitted/reviewing request, cuối cùng Chưa thuê; không persisted category. Dossier→contract chuyển đúng record ID; unsaved notes có confirm; arrows focus/Enter activate. Bỏ global AdminPageHeader title/description/reload trên mọi screen, giữ panel headings và error-only Thử lại phục hồi empty workspace.

Logo/raster upload Neon-only, PDF R2 private `mall-documents` quarantine + manual external review; không antivirus-clean, online signature hoặc fake financials. Mốc reset ngày 15/10 là lịch sử: khi đó baseline+migrations 001–009 được áp dụng trên `production`, catalog 6 tầng/81 slot và root allowlist được giữ, business data cũ bị xóa. Production hiện có migrations 001–015 và seed plan; stage2 Worker `DATABASE_URL` đã đồng bộ về production, còn branch test stage2 cũ đã xóa. Root login HTTP 200 không chứng minh Worker source/schema hiện tại; xem release evidence, source SHA và route checks trong [deployment runbook](../deployment.md) và [database guide](../database/README.md).

Operator dùng `npm run dev`, `npm start`, `npm run db:migrate`, `npm run auth:set-password` với canonical `.env.local`; `npm run deploy` build/deploy Worker hiện có, không deploy aliases/profile. Regression `npm run test:database` nay dùng owned disposable local PostgreSQL (`postgres`, `initdb`, `pg_ctl` trên PATH, macOS có thể cài Homebrew), không tạo Neon branch; đã quan sát 2/2 pass. Worker giữ noindex, custom-domain/DNS hoãn; media Worker→Neon và cache invalidation/performance không được tuyên bố hoàn tất.

**Bằng chứng lịch sử trước reset:** browser 1440/390/320px không page overflow, tenant table min720 cuộn nội bộ; admin tests23pass/1liveskip, isolated Neon DB2/2pass, typecheck/backend integrity/backend tests/OpenNext build pass. Không rerun trong doc edit; không coi các kết quả đó là trạng thái mới sau reset. Xem [readiness](backend-readiness.md).

## Lịch sử quyết định ban đầu — đã bị phase2 thay thế

Các phần dưới ghi bối cảnh/đề xuất và bằng chứng lúc prototype, **không mô tả runtime hiện tại**. Static export/Pages, demo auth/fixtures và split deployment không còn áp dụng; không làm theo migration/DNS tasks lịch sử như yêu cầu hiện tại.


## Bối cảnh

Landing page hiện hành đang chờ đội ngũ phát triển cũ bàn giao source, nội dung
và tài sản. Website công khai hiện có các nhóm nội dung tổng quan dự án, vị trí,
phân khu chức năng, hình ảnh, tiện ích, tài liệu và form tư vấn. Các chi tiết,
trạng thái và số liệu trên website cần được đối chiếu với source bàn giao trước
khi đưa thành dữ liệu quản trị.

Giao diện tại `/admin-preview/` là prototype để duyệt bố cục và luồng quản trị.
Các chỉ số, nhật ký, trạng thái và mã yêu cầu trên đó đều là dữ liệu minh họa.
Bản demo hiện hỗ trợ thao tác trên fixture trong bộ nhớ qua repository. Chưa có xác thực, database, gửi lead thật hoặc endpoint backend; adapter HTTP là transport để tích hợp sau này. Bản dev được phép publish GitHub Pages để duyệt giao diện; không phải hệ thống quản trị production.

## Quyết định

Tách hai bề mặt triển khai:

1. **Website công khai**: Next.js static export, build từ nội dung đã duyệt và
   phục vụ qua static hosting. Không chứa secret hay dữ liệu nội bộ.
2. **Admin vận hành**: Next.js App Router chạy trên managed serverless runtime.
   Xác thực, phân quyền, đọc/ghi dữ liệu và kiểm tra quyền đều thực hiện phía
   server. Không phát hành admin như một trang static trên GitHub Pages.

Admin dự kiến có dashboard, quản lý nội dung landing theo section, thư viện hình
ảnh/tài liệu, hộp thư yêu cầu tư vấn, nhật ký kiểm toán và cấu hình người dùng.
Nội dung xuất bản qua revision: editor tạo draft, người có quyền duyệt xác nhận,
sau đó pipeline build website công khai từ revision đã duyệt. Bản prototype
chưa thực hiện các nghiệp vụ này.

Sau khi nhận bàn giao, cần lập content inventory và xác nhận hợp đồng dữ liệu
trước khi chốt schema. Đề xuất ban đầu là cơ sở dữ liệu quan hệ managed cho nội
dung, trạng thái lead và audit; object storage riêng cho tài liệu. Chưa tạo cloud
resource hay kết nối dữ liệu thật.

## Lý do và trade-off

Static export phù hợp với website công khai ít thay đổi theo request, dễ cache và
không cần vận hành server thường trực. Admin cần session, authorization theo từng
hành động và ghi dữ liệu; do đó phải có runtime xử lý request. Managed serverless
giảm việc tự vận hành máy chủ nhưng thêm chi phí theo mức dùng, giới hạn runtime
và phụ thuộc nhà cung cấp.

Tách website và admin giữ bề mặt công khai nhỏ, cho phép triển khai nội dung tĩnh
độc lập với phiên bản quản trị. Đổi lại, cần version hóa schema/content contract
và pipeline publish giữa hai ứng dụng.

## Threat model ngắn

- **Truy cập trái phép**: kiểm tra session và quyền phía server trên mọi query,
  mutation và Server Action; ẩn nút trên giao diện không phải là kiểm soát quyền.
- **Lộ thông tin liên hệ**: chỉ trả DTO tối thiểu; giới hạn quyền xem lead, ghi
  audit access/export và đặt chính sách lưu trữ/xóa PII.
- **Nội dung hoặc tài liệu độc hại**: upload qua đường dẫn được cấp quyền, kiểm
  tra kích thước/MIME, quét tệp và không render HTML/URL tùy ý.
- **Sai lệch nội dung công khai**: draft và published revision tách biệt; mọi
  lần publish có actor, revision và khả năng rollback.
- **Chuỗi cung ứng CI**: ghim commit submodule và lockfile; CI chỉ có quyền đọc
  source, quyền deploy giới hạn theo môi trường; không đưa secret vào static
  bundle.

## Migration path

1. Nhận source, assets, tài liệu nội dung và cấu hình deploy từ đội ngũ cũ; kiểm
   tra quyền sở hữu, dependency, domain, redirect và dữ liệu form hiện có.
2. Đối chiếu từng section với landing được bàn giao; chốt field/schema, role,
   trạng thái nội dung, chính sách lead và quy trình duyệt.
3. Hoàn tất UI admin trước với dữ liệu fixture; sau đó kết nối auth và repository
   server-side qua interface ổn định.
4. Chạy song song preview website mới với website hiện hành. Chỉ cutover domain
   sau khi nội dung, form, SEO, redirect, bảo mật và quy trình rollback được duyệt.

## Tài liệu tham chiếu

- [Website Le Grande Center hiện tại](https://legrandecentre.vn/)
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
