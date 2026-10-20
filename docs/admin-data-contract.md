# Admin nội bộ — session cache và dữ liệu theo màn hình

Contract hiện hành 19/10/2026; thay cho snapshot/IndexedDB demo và thiết kế kiểm tra provider/quyền DB trên từng request. Khoảng ba người sử dụng, hai vai trò nghiệp vụ; hợp đồng gốc lưu ngoài ứng dụng. Source cần build, migrate và deploy theo quy trình; ghi chú này không tuyên bố đã deploy production.

## Session và hai quyền

- Neon Auth xác thực email/password. Chỉ user có email verified, issuer/subject được bind đúng và allowlist/assignment active mới được mint app session.
- `POST /api/admin/session/` kiểm tra provider và DB authoritative, ký cookie `__Host-lgc_admin`: `HttpOnly; Secure; SameSite=Lax; Path=/`, không Domain. Hạn cố định **900 giây**, không vượt provider expiry, không sliding. Key HKDF purpose-separated từ secret server, HS256/issuer/audience/type/version được kiểm tra.
- `GET /api/admin/session/` và business APIs chỉ kiểm tra cookie chữ ký/expiry tại Worker, không gọi provider hoặc tra quyền DB. Cookie không hợp lệ/hết hạn trả 401 trước query nghiệp vụ.
- **Chỉ thao tác chủ động** (login/navigation/tab/search/filter/page/save/upload/delete/reload) mới được renew khi thiếu/hết cache. Không timer, focus refresh, polling hoặc tự POST vì passive request gặp 401. Managed session còn hiệu lực thì renew không cần mật khẩu; provider/DB lỗi không được fallback expired session.
- Thu hồi quyền/remote logout có thể chậm tối đa **15 phút**. Đây là tradeoff đã chọn, không có guarantee immediate remote revoke/in-flight revoke. Mutation kiểm expiry cục bộ trước commit.
- Administrator quản lý tài khoản/cấu hình; Editor dùng nghiệp vụ nhưng bị chặn staff/system settings ở server. Owner/root là nội bộ, UI và app session hiển thị Administrator, giữ bảo vệ owner hiện hữu.
- Logout xóa app cookie, provider session và browser cache. HTTP lỗi logout phải hiển thị, không khẳng định remote logout thành công khi chưa xác nhận. Identity đổi thì abort/discard request cũ và xóa dữ liệu private trong memory.
- Không token/private data trong localStorage, không cache global role/Pool/socket, không thêm Redis/KV. API mutation vẫn kiểm Origin, input bounds và property scope.

## HTTP contracts

Mọi API private dùng `Cache-Control: private, no-store`, canonical trailing slash. API lỗi có `status` và error `code`, không dùng localized message làm control flow.

| Endpoint | Success |
| --- | --- |
| GET/POST `/api/admin/session/` | `{actorId,propertyId,role,expiresAt}`; expiresAt epoch ms |
| DELETE `/api/admin/session/` | 204 sau local/provider logout; clear cookie ngay cả khi provider lỗi |
| GET `/api/admin/screens/[screen]/` | `{revision,...data của màn}` |
| GET `/api/admin/collections/{companies,leads,appointments}/` | `{items,page,pageSize,totalItems,totalPages,revision}` |
| GET collection `/:id/` | `{item,revision}` |
| POST `/api/admin/commands/` | `{revision,entityId}` |
| POST `/api/admin/media/` | `{revision,mediaIds}` |
| POST media review/reconcile | `{revision,entityId}` |
| GET `/api/admin/media/` | `{items,page,pageSize,totalItems,totalPages,revision,storage}` |
| GET `/api/admin/media/:id/` | `{item,revision}` metadata; `/:id/view/` vẫn bảo vệ binary |

### Mã tra cứu và ID nội bộ

UUID tiếp tục là khóa DB và tham số API nội bộ. Admin hiển thị `LGC-xxxxx` cho lead, `LGC-YC-xxxxx` cho yêu cầu, `LGC-GC-xxxxx` cho giữ chỗ và `LGC-HD-xxxxx` cho hồ sơ thuê; slot dùng mã mặt bằng và doanh nghiệp dùng tên. Mã tra cứu không phải bí mật, không cấp quyền và không thay server authorization, property scope hoặc RLS. Migration **016** tạo các sequence/mã này; phải áp dụng đúng runtime DB trước khi phát hành source tương ứng.

Số hợp đồng theo tài liệu gốc là trường riêng, tùy chọn. Không dùng UUID hay mã hồ sơ để điền thay số hợp đồng.

Migration016 đã áp dụng vào DB production dùng chung local/Worker ngày19/10/2026 sau khi xác minh branch và checksum. Khi backfill hồ sơ đã có giữ chỗ/hợp đồng, phải chạy deferred integrity checks trước DDL (`SET CONSTRAINTS ALL IMMEDIATE`); không disable trigger. Thiếu016 khiến cả slot dossier và danh sách yêu cầu lỗi503 dù slot không có yêu cầu liên quan, vì SQL vẫn phải resolve các cột projection. Chi tiết kiểm tra thực tại [backend readiness](backend-readiness.md#khắc-phục-api-slotyêu-cầu503--19102026).

Command body chỉ `{command,expectedRevision}`; `Idempotency-Key` nằm ở header. Media upload multipart gồm files/scope/expectedRevision. Replay trả receipt đã commit, không đọc lại full workspace hoặc ghi mutation lần hai. Không còn aggregate `/api/admin/workspace/` production endpoint/full snapshot response.

## Tải theo màn

Shell không đọc public/admin DB hoặc provider để render. Public projection/provider nằm trong layout nhóm public, URL public giữ nguyên. Heavy screen modules chỉ mount khi active.

Màn đăng nhập và shell tải logo tùy chọn qua `GET /api/public/branding/` sau khi hydrate. Route chỉ trả `{logoUrl}` từ public projection đã lọc, đặt `Cache-Control: no-store`; client không gửi credentials và chỉ nhận URL HTTPS không kèm thông tin đăng nhập. Nếu thiếu logo hoặc route lỗi, tên thương hiệu dạng chữ vẫn hiển thị và không chặn đăng nhập hay render shell.

- Floors: tầng và inventory cần tổng quan, không load leads/companies/media/staff.
- Spaces: slots/groups theo tầng; Slot: hồ sơ liên quan đúng id.
- Customers/Leads/Appointments: collection page/detail riêng, không chờ global workspace revision. Forms/pickers chỉ load dependencies khi mở.
- Companies: `status` lọc category suy ra tại server trước COUNT/LIMIT/OFFSET. `includeSummary=true` chỉ cho companies, trả thêm `{summary:{totalCompanies,rentingCompanies,withContracts}}` toàn property, không phụ thuộc search/status/page và không chứa PII. Pickers mặc định không yêu cầu summary. Rule hiện tại recorded/executed lease xác định Đang thuê nên hai số rentingCompanies/withContracts bằng nhau.
- Doanh nghiệp không còn ba tab quản lý lớn; một danh sách mở Sheet hồ sơ. Company detail chỉ đọc khi Sheet mở; requests/tenants/leases chỉ đọc khi chọn phần tương ứng và luôn truyền companyId. Documents private nằm trong Hợp đồng; không render activity history, vẫn giữ audit server.
- Requests/Leases/Tenants: server pages có related labels của page, detail theo id dù ngoài trang hiện tại.
- Settings: tải khi mở; staff chỉ tải khi mở phần tài khoản, email chỉ tải khi mở **Thông báo email**. Operational defaults cho form có endpoint nhỏ riêng.
- Mỗi response mang revision được đọc cùng dữ liệu đó. Không dùng revision từ picker mới hơn để hợp thức hóa draft cũ; 409 giữ draft và yêu cầu người dùng tải lại, không tự overwrite.

Browser cache private trong memory **60 giây**, key theo session/property/screen/filter/page/id, in-flight dedupe + abort/stale response protection. Sau save đánh dấu cache stale, chỉ mounted active view refetch; không fetch tất cả tab. Loading/error/empty phải tách biệt; dữ liệu chưa đọc không được coi là catalog rỗng đã tải.

### Thông báo email nhân viên

`GET/PUT /api/admin/notifications/email/` và `POST /api/admin/notifications/email/verify/` chỉ dành cho Administrator của property Le Grande. Cookie/role được kiểm tra trước DB hoặc bot; mutation cùng origin, JSON bounded8KiB, mọi phản hồi `private,no-store`. Proxy dùng website key server-only tới `/v1/email-settings[/verify]`; browser không được chọn provider/sender hoặc biết service key.

Registry Render giữ sender/Reply-To và danh sách0–20 địa chỉ, xác minh riêng từng mailbox. PUT chỉ `{expectedRevision,recipients}`; verify chỉ `{expectedRevision}`. Revision là chuỗi CAS của **cấu hình bot**, không workspace revision và không số metadata cache. Sheet giữ revision lúc mở;409 giữ draft, không tự rebase. Địa chỉ được trim/lowercase/dedupe, danh sách trống tắt admission email; không thay đổi queued snapshots hay Zalo, không backfill lead cũ.

Email dùng cache private60giây theo identity; chỉ mount/tải khi chọn tab. Lưu/xác minh cập nhật đúng cache email, tải lại là request chủ động; không `markAllStale` cho workspace vì sẽ unmount Settings và làm mất tab đang chọn. Không polling/passive session renewal. Lỗi provider/config/unreleased API hiển thị lỗi thật, không giả trạng thái ready. Người gửi và **mọi** người nhận phải verified trước admission; verified không phải delivery/inbox proof.

Source này cần bot migration0007 sau0004 và bot API mới; không cần migration website. Triển khai/migration/secrets/domain verification là release gate riêng.

### Sheet thống nhất trong admin

Mọi form thêm/sửa nghiệp vụ dùng `AdminEditor` với `@mall/ui Sheet`: tầng, mặt bằng/nhóm ghép, doanh nghiệp/ghi chú, khách tiềm năng, yêu cầu/giữ chỗ/hồ sơ thuê, lịch hẹn, media, cấu hình, nhân viên và upload logo. Inspector/hồ sơ chỉ đọc và có nút mở Sheet; tìm kiếm/lọc/phân trang vẫn inline. **Xác nhận bỏ thay đổi chưa lưu dùng popup `ConfirmDialog` giữa màn hình**, cả khi đóng form và khi rời màn hình/đăng xuất. `ConfirmSheet` chỉ giữ cho các xác nhận nghiệp vụ khác như tách nhóm, xóa media và hủy lịch. Tài liệu hợp đồng lịch sử mở bằng Sheet. Trang đăng nhập/đăng ký và public không chuyển sang Sheet.

Sheet cạnh phải rộng tối đa36rem, mobile toàn chiều ngang, header/nút đóng trong viewport và cuộn riêng nội dung. Lưu/Hủy, Escape/backdrop và trả focus giữ nguyên; editor/xác nhận lồng nằm trong cây Sheet cha. Đang lưu không được đóng/gửi lặp; lỗi giữ trường và hiện ngay trong Sheet, thành công mới đóng. Revision lấy từ nguồn bản ghi khi mở sửa, không cập nhật draft theo refetch. Nhân viên dùng API quyền riêng, không dùng revision giả để thay quyền server; email khi sửa vai trò là read-only.

Khách tiềm năng và Yêu cầu & giữ chỗ giữ danh sách toàn chiều ngang, phân trang server/bộ lọc hiện có; click dòng mới mở chi tiết, không tự chọn hồ sơ đầu hoặc tải tất cả dữ liệu.

Kiểm tra UI cục bộ 19/10/2026: shared UI build/typecheck, TypeScript ứng dụng và production Next build pass; `test:admin`52pass/2skip. Chrome1440/390/320px kiểm thêm/sửa, form lồng, Hủy/Escape/focus, giữ draft sau409, chống đóng/gửi lặp khi pending và đóng sau receipt thành công. Đã mở form tầng/slot/ghép/slot dossier/doanh nghiệp/ghi chú/lead/request/duyệt/lịch hẹn/cấu hình/nhân viên/logo/media; lỗi hủy lịch/xóa media hiện trong Sheet. API browser được chặn và cấp fixture, không ghi DB/cloud; bằng chứng này không xác nhận mutation nghiệp vụ/deployment.

Điều chỉnh20/10/2026: xác nhận bỏ draft/rời màn hình quay về popup Dialog theo yêu cầu chủ đầu tư; portal xác nhận chung đặt sau nội dung để không bị Sheet mobile che. Chrome1440/390/320px kiểm popup nằm giữa/trên Sheet, Tab/Escape/focus, Tiếp tục sửa/Ở lại giữ nguyên draft, Bỏ thay đổi đóng editor và Tiếp tục điều hướng mở màn được chọn. API smoke dùng fixture chặn trong browser, không ghi DB.

## Media

- Pagination **server**, default24/max100; filters query/kind/source/scope được validate. Uploaded SQL COUNT + LIMIT/OFFSET, sort `uploaded_at DESC,id DESC`.
- Project manifest ở server. `source=all` xếp uploads trước project catalog, tính đúng offset qua biên nguồn mà không query hết uploads. Không import/transmit full manifest trong admin bootstrap/client bundle.
- Quota là DB aggregate, không storage inventory scan lúc render gallery. Reconcile là thao tác riêng; upload reservation/finalize/compensation và quota safety giữ nguyên.
- Grid dùng thumbnail đã có; mục chưa có thumbnail hiện metadata tile. Không ảnh gốc vài MB làm thumbnail, không tự chọn item đầu; ảnh/video/PDF gốc chỉ mount sau click, đóng detail thì unmount.
- Detail/picker theo id, không cần tải cả catalog. `canDelete/protectedReason` phía server không thay server-side protection của logo, linked documents, retention và property ownership.
- Generic PDF/private historical media vẫn quarantine/review/ownership như cũ; bỏ upload hợp đồng không phải lệnh xóa mọi PDF.

## Ghi nhận thuê không upload hợp đồng

`record-lease` nhận reservationId + rentNote/referenceNumber tùy chọn, **không mediaId**. Ghi lease version với actor/time/company/space/period snapshot thật, không fake PDF hoặc fake chữ ký. `attach-lease-document` không còn trong workflow mới.

Migration **011-metadata-only-leases.sql** thay điều kiện bắt private PDF bằng recorded lease metadata hợp lệ; giữ approved inventory, period, đủ member slots, transition và exclusivity constraints. Projection lease không phụ thuộc inner join document links; file/link/lịch sử cũ không bị xóa hoặc public hóa. Không sửa migration đã apply.

## Verification và phát hành

- `npm run test:admin`: **51 pass / 1 live skip**; `npm run test:backend`: **105 pass** (shared engine không đổi).
- `npm run test:database`: **4 pass**. Runner tạo PostgreSQL disposable có ownership attestation, apply migrations/seed hai lần, kiểm CAS/replay/property/retention/pagination/no-PDF rồi xóa đúng cluster; không mutation Neon live.
- TypeScript ứng dụng và production Next build pass; `npm run build:cloudflare` exit0, tạo `.open-next/worker.js`. Build dùng DTO public thật từ owned HTTPS runtime (6floors/81units), không production credentials hoặc provider fixture làm runtime fallback; script giấu envfiles và đã khôi phục `.env.local`.
- Migration không tự chạy ở build/deploy. Operator phải apply 011 đúng DB đích trước release ứng dụng mới; không tự reset database/storage. `npm run db:migrate` dùng credential local thật, không phải sandbox.
- Smoke HTTPS Next + PostgreSQL disposable + provider fixture: HTML admin200 với0DB/0provider; warm business APIs không provider/self-identity lookup/access-decision writes. Staff tab đọc một allowlist query để trả danh sách nhân viên, không re-authorize identity của caller. Cookie Secure/HttpOnly900s; tamper401/cross-origin403 trước DB/provider; receipt replay/CAS409; Editor staff/settings403; expired read401 không DB/provider, explicit renewal200, logout204.
- Browser Chrome thực tế: Floors/Companies/Leads chỉ fetch màn được chọn; company classification/counts phản ánh lease thật; related requests load company-filtered page, detail theo id. Tạo request F.2→review→hold→ghi lease có reference/note và **0 input file / 0 media request**; tạo→confirm→cancel lịch hẹn thành công. Tenant search rỗng vẫn hiện empty state, giữ focus/input.
- Media page1 **24** mục, page2 **7** mục đúng server slice; không iframe/video/ảnh gốc trước click. Click project-facade tải ảnh1200×800; rời màn unmount preview. Upload/link picker chỉ đọc `spaces?floor=2` sau chọn tầng, không tải toàn bộ inventory/catalog.
- Settings chỉ GET settings lúc mở; Website tab đọc current-logo metadata, editor mới GET uploaded-image page20; Staff tab mới GET staff. Không upload bytes lên Neon/R2 trong smoke. Idle qua provider-bounded expiry không POST; click Media tiếp theo POST session **đúng1 lần**, không nhập mật khẩu. Logout browser chỉ DELETE session, xóa cookie; protected read sau đó401.
- Runtime/Chrome/owned PostgreSQL, smoke config và scripts đã dọn; generated route types trở lại `.next`. Không deploy, không apply011 trên DB live, không đổi region/plan/secrets hoặc xóa media cũ. Provider fixture/Node smoke **không chứng minh Neon live latency, Workerd CPU quota, email delivery hoặc upload cloud**; cần HAR sau release để đo chênh lệch mili giây thật.


## Logo doanh nghiệp và upload theo tầng

Migration `017-company-logos.sql` bổ sung `property_customers.logo_media_id` theo property, FK ghép tới document_versions; không gắn logo vào organization dùng chung. Logo là ảnh PNG/JPEG/WebP đã xử lý, ready/clean trên Neon của cùng property. Metadata đầy đủ chỉ trả cho admin; public projection chỉ thêm tên và logo public của doanh nghiệp có hợp đồng đang hiệu lực, không kèm hồ sơ/contact/lease. Ảnh đang dùng được bảo vệ khỏi xóa/đổi scope cho tới khi gỡ/thay logo; không xóa bytes khi đổi logo.

Migration `018-internal-business-status.sql` bổ sung `slots.business_status`, chỉ nhận sáu trạng thái CMS. Lead intake không cập nhật trường này. Admin đọc/ghi trạng thái nội bộ; public map chỉ trả `Còn trống`, `Liên hệ` hoặc `Đã thuê`, không serialize tên hay giá trị nội bộ. `Đã ký` chỉ map thành `Đã thuê` khi có hợp đồng executed trong kỳ hiệu lực; `Đã thuê` là lựa chọn CMS độc lập theo yêu cầu nghiệp vụ.

Form dùng shared `UploadField`, `CheckboxField`, `Avatar`; upload trước rồi gắn đúng `mediaIds[0]` từ receipt, dùng revision của receipt cho lệnh lưu doanh nghiệp. Chỉ tiến revision sau upload do chính form này thực hiện thành công; không lấy revision mới từ picker hay refetch để bỏ qua xung đột. Nếu lưu doanh nghiệp lỗi, ảnh đã tải vẫn ở Media; draft giữ ID ảnh để lưu lại không upload trùng. Callback receipt của `uploadFiles` là tùy chọn, các caller cũ vẫn nhận boolean.

Tổng quan tầng có nút Tải media mở AdminEditor tại chỗ, cố định scope `Tầng n`, không điều hướng sang Media. Biểu mẫu nội dung tầng chứa shared UploadField và picker media đã sẵn sàng; tệp có sẵn được gắn vào tầng ngay tại form. Khi tải tệp mới, dùng revision receipt cho thao tác tiếp theo để không upload trùng khi lưu nội dung lỗi. Logo doanh nghiệp và website cũng có thể tải mới hoặc chọn media có sẵn ngay trong form. Trang Media là thư viện để tải, tìm, xem, đổi tên và xóa; không đổi liên kết/scope tại đây. CSS app chỉ đặt grid cho native wrapper labels không có class, để label/dấu bắt buộc và checkbox của shared fields giữ layout chuẩn.

Bản nguồn yêu cầu áp dụng migration017 trước khi chạy. Regression dùng PostgreSQL disposable và metadata ảnh fixture; không phải bằng chứng đã upload cloud hay phát hành production.
