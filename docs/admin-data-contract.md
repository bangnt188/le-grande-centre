# Admin nội bộ — session cache và dữ liệu theo màn hình

Contract hiện hành 17/10/2026; thay cho snapshot/IndexedDB demo và thiết kế kiểm tra provider/quyền DB trên từng request. Khoảng ba người sử dụng, hai vai trò nghiệp vụ; hợp đồng gốc lưu ngoài ứng dụng. Source cần build, migrate và deploy theo quy trình; ghi chú này không tuyên bố đã deploy production.

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

Command body chỉ `{command,expectedRevision}`; `Idempotency-Key` nằm ở header. Media upload multipart gồm files/scope/expectedRevision. Replay trả receipt đã commit, không đọc lại full workspace hoặc ghi mutation lần hai. Không còn aggregate `/api/admin/workspace/` production endpoint/full snapshot response.

## Tải theo màn

Shell không đọc public/admin DB hoặc provider để render. Public projection/provider nằm trong layout nhóm public, URL public giữ nguyên. Heavy screen modules chỉ mount khi active.

Màn đăng nhập và shell tải logo tùy chọn qua `GET /api/public/branding/` sau khi hydrate. Route chỉ trả `{logoUrl}` từ public projection đã lọc, đặt `Cache-Control: no-store`; client không gửi credentials và chỉ nhận URL HTTPS không kèm thông tin đăng nhập. Nếu thiếu logo hoặc route lỗi, tên thương hiệu dạng chữ vẫn hiển thị và không chặn đăng nhập hay render shell.

- Floors: tầng và inventory cần tổng quan, không load leads/companies/media/staff.
- Spaces: slots/groups theo tầng; Slot: hồ sơ liên quan đúng id.
- Customers/Leads/Appointments: collection page/detail riêng, không chờ global workspace revision. Forms/pickers chỉ load dependencies khi mở.
- Requests/Leases/Tenants: server pages có related labels của page, detail theo id dù ngoài trang hiện tại.
- Settings: tải khi mở; staff chỉ tải khi mở phần tài khoản. Operational defaults cho form có endpoint nhỏ riêng.
- Mỗi response mang revision được đọc cùng dữ liệu đó. Không dùng revision từ picker mới hơn để hợp thức hóa draft cũ; 409 giữ draft và yêu cầu người dùng tải lại, không tự overwrite.

Browser cache private trong memory **60 giây**, key theo session/property/screen/filter/page/id, in-flight dedupe + abort/stale response protection. Sau save đánh dấu cache stale, chỉ mounted active view refetch; không fetch tất cả tab. Loading/error/empty phải tách biệt; dữ liệu chưa đọc không được coi là catalog rỗng đã tải.

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
