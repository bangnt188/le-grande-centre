# Admin nội bộ — session cache và dữ liệu theo màn hình

Contract hiện hành 21/10/2026; thay cho snapshot/IndexedDB demo và thiết kế kiểm tra provider/quyền DB trên từng request. Khoảng ba người sử dụng, hai vai trò nghiệp vụ; hợp đồng gốc lưu ngoài ứng dụng. Source cần build, migrate và deploy theo quy trình; ghi chú này không tuyên bố đã deploy production.

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

Sheet biểu mẫu cạnh phải rộng tối đa36rem. Root Sheet đọc hồ sơ rộng68vw, tối đa64rem, tối thiểu640px nhưng không vượt viewport; từ720px trở xuống dùng toàn chiều ngang. Header/nút đóng trong viewport và cuộn riêng nội dung. Lưu/Hủy, Escape/backdrop và trả focus giữ nguyên; editor/xác nhận lồng nằm trong cây Sheet cha. Đang lưu không được đóng/gửi lặp; lỗi giữ trường và hiện ngay trong Sheet, thành công mới đóng. Revision lấy từ nguồn bản ghi khi mở sửa, không cập nhật draft theo refetch. Nhân viên dùng API quyền riêng, không dùng revision giả để thay quyền server; email khi sửa vai trò là read-only.

Khách tiềm năng và Yêu cầu & giữ chỗ giữ danh sách toàn chiều ngang, phân trang server/bộ lọc hiện có; click dòng mới mở chi tiết, không tự chọn hồ sơ đầu hoặc tải tất cả dữ liệu.

Kiểm tra UI cục bộ 19/10/2026: shared UI build/typecheck, TypeScript ứng dụng và production Next build pass; `test:admin`52pass/2skip. Chrome1440/390/320px kiểm thêm/sửa, form lồng, Hủy/Escape/focus, giữ draft sau409, chống đóng/gửi lặp khi pending và đóng sau receipt thành công. Đã mở form tầng/slot/ghép/slot dossier/doanh nghiệp/ghi chú/lead/request/duyệt/lịch hẹn/cấu hình/nhân viên/logo/media; lỗi hủy lịch/xóa media hiện trong Sheet. API browser được chặn và cấp fixture, không ghi DB/cloud; bằng chứng này không xác nhận mutation nghiệp vụ/deployment.

Điều chỉnh20/10/2026: xác nhận bỏ draft/rời màn hình quay về popup Dialog theo yêu cầu chủ đầu tư; portal xác nhận chung đặt sau nội dung để không bị Sheet mobile che. Chrome1440/390/320px kiểm popup nằm giữa/trên Sheet, Tab/Escape/focus, Tiếp tục sửa/Ở lại giữ nguyên draft, Bỏ thay đổi đóng editor và Tiếp tục điều hướng mở màn được chọn. API smoke dùng fixture chặn trong browser, không ghi DB.

### Flow nghiệp vụ và ngữ cảnh điều hướng — 20/10/2026

- `link-lead-company` nhận leadId/companyId; `create-company-from-lead` nhận leadId/CompanyInput. Cả hai giữ thông tin/trạng thái lead và trả companyId qua receipt. Tạo organization/customer + liên kết lead cùng transaction/property lock/CAS; lỗi liên kết rollback cả doanh nghiệp mới. Lead đã liên kết không tạo thêm doanh nghiệp. Replay cùng actor/property/key trả receipt cũ; client chỉ tái dùng key khi người dùng gửi lại cùng command/revision/identity, không tự replay request nền.
- Hồ sơ doanh nghiệp mở yêu cầu hoặc lịch hẹn với companyId đã chọn. Lựa chọn mặt bằng/nhóm và slot dossier mở yêu cầu với tầng + đầy đủ member slot IDs; không tự giữ chỗ khi tạo yêu cầu hoặc lịch hẹn.
- Thành công dùng `receipt.entityId` mở đúng doanh nghiệp/lead/yêu cầu/lịch hẹn/hợp đồng. Receipt duyệt/hủy giữ chỗ định danh reservation nên UI giữ yêu cầu nguồn, không dùng hold ID làm request ID. `leases?reservationId=` là truy vấn chỉ dành cho leases để tìm đúng hợp đồng của giữ chỗ đã chuyển thuê.
- Reservation projection giữ riêng `expired` và `cancelled`. Request filter/label phân biệt hai trạng thái; giữ chỗ active đã qua expiresAt không được đề nghị ghi hợp đồng. Không mở thêm nghiệp vụ gia hạn, thanh lý/bàn giao hoặc transition completed/no_show.
- `admin-workspace-navigation` là contract chung; controller sở hữu native URL/history. Root chỉ có một Sheet đọc hồ sơ; link liên quan thay nội dung trong Sheet, không đổi module danh sách nguồn. Chuyển tầng/module/thư viện chỉ qua hành động rõ ràng. Media theo slot/nhóm/tầng có nút quay về hồ sơ nguồn.
- URL chứa view/floor/selected IDs, detail kind/id/floor/tab/relatedPage, action và IDs nguồn, page/size/status/media filters, panel cấu hình và tab bản vẽ tham chiếu. `formCompany` tách companyId của form khỏi `companyId` bộ lọc danh sách hợp đồng. Search tự do không đi vào URL. Native history.state chỉ giữ chỉ số frame/đích đóng, không chứa hồ sơ hoặc draft.
- Back lùi một bước; Đóng về danh sách nguồn; Hủy về hồ sơ trước form; lưu thay action bằng hồ sơ từ receipt. Browser Back/Forward/Refresh/deep link khôi phục vị trí nghiệp vụ. Private list state, DOM focus và scroll ở memory theo document/identity; trở lại hồ sơ/danh sách phục hồi focus và vị trí khi nội dung sẵn sàng. Refresh không lưu hay phục hồi draft; beforeunload cảnh báo thay đổi chưa lưu.
- Dirty/pending registry chung cho cùng identity. `AdminEditor` đăng ký cả vòng đời submit, kể cả form dùng API riêng như tài khoản/email; request mutex của repository tách khỏi pending editor để form không tự chặn command của chính nó. Back/đổi màn/đóng khi dirty cần xác nhận; Ở lại giữ URL và trường nhập. Pending khóa đóng/điều hướng/gửi lặp. 409/refetch không thay snapshot CAS hoặc xóa draft. Lỗi lưu hiển thị inline; không phát thêm toast lỗi trùng từ workspace che nút lưu.
- Map trong hồ sơ yêu cầu/giữ chỗ và hồ sơ thuê dùng `FloorPlanMap` variant `admin`, cùng projection hình học với màn Căn / Mặt bằng. Giữ mã slot, diện tích, kích thước, trạng thái và hai cạnh định hướng hồ/đường; slot thuộc hồ sơ tô đậm. Sơ đồ giữ thang hiển thị chuẩn và cuộn ngang bên trong Sheet, không ép thành thumbnail mất nhãn. Click slot mở hồ sơ mặt bằng trong cùng root Sheet/ngữ cảnh danh sách. Chưa có plan sau khi tải xong phải hiện cảnh báo, không im lặng bỏ map.

Kiểm chứng map hồ sơ20/10/2026: Chrome localhost1440/390/320px, mỗi kích thước mở yêu cầu và hợp đồng trên tầng1/3/6 (18trường hợp). Kiểm đủ mã slot11/23/2, hai slot hồ sơ tô đậm, hướng hồ/đường, giữ tỷ lệ và cuộn trong Sheet không tràn trang; click mã slot, kể cả F.2 đa giác, mở đúng hồ sơ trong một root Sheet. Repro trước sửa không có nhãn, highlight hoặc hướng; sau sửa pass. App TypeScript và `test:admin`71pass/4live skips. API browser dùng fixture chặn, không ghi DB/cloud; không thay hình học, migration hoặc deploy.

Kiểm chứng source local: `test:admin`71pass/4live skips; shared backend105pass. PostgreSQL disposable5/5 relational,2/2 outbox,2/2 email, bao gồm create+link atomic/rollback/replay/already-linked/cross-property, expired khác cancelled và lookup hợp đồng theo reservation. Database tự dọn; không ghi Neon live.

Chrome dev1366/390px thực hiện doanh nghiệp trang2 → request →409/manual retry cùng key+CAS → duyệt giữ chỗ → hợp đồng đúng ID; giữ chỗ converted mở lại đúng hợp đồng; lịch hẹn có companyId; hai cách liên kết lead; chọn nhóm/slot prefill; Back Stay/discard với form nghiệp vụ và form local; pending Back/Escape; media quay nguồn, phục hồi scroll/focus và kiểm URL/storage không có nội dung private. Preview PDF lịch sử được kiểm ở mức mount iframe đúng URL private, không chứng minh nội dung PDF/provider production.

Production Next build và TypeScript pass với `PUBLIC_BUILD_ORIGIN=http://localhost:3000` lấy public projection thật6tầng/81căn. Origin Worker mặc định trả404 trong lần chạy này; không sửa cấu hình hay coi endpoint đó đã phục hồi. Standalone production chạy loopback được Chrome1366/390px kiểm page2/detail/tab/Back/Forward/Refresh/dirty Stay/discard, không tràn Sheet, lưu command workspace và pending Back/Escape của form gọi staff API riêng; lỗi staff giữ draft và Refresh giữ tab nhân sự. Mọi API browser dùng fixture intercept, không mutation cloud/DB; không runtime exception quan sát được. Đây không phải bằng chứng đã commit/push/deploy bản thay đổi.

### Autocomplete doanh nghiệp có phân trang

`CompanyPicker` dùng một `ComboboxField` chung của `@mall/ui`, không còn input tìm kiếm + select + pagination riêng bên ngoài. Áp dụng cho yêu cầu thuê, lịch hẹn, khách tiềm năng và liên kết lead với doanh nghiệp có sẵn.

- Chỉ tải danh sách khi mở gợi ý; server trả tối đa10doanh nghiệp/trang. Mở lại bắt đầu trang1; gõ tìm tên/ngành hàng debounce250ms và reset trang1. Không fetch toàn bộ catalog hoặc lọc lại một trang bằng tên ở client.
- Popup hiện tên + ngành hàng; footer Trước/Sau, Trang X/Y và tổng kết quả. Chuyển trang không đóng popup hoặc đổi companyId. Loading/error/empty có trạng thái riêng, không hiển thị tổng0 hoặc tỷ lệ trang giả trong lúc chưa đọc được dữ liệu.
- Prefill tải theo ID riêng. `selectedOption` không được append vào10kết quả, nên doanh nghiệp ngoài trang vẫn hiển thị đúng trong ô nhưng không tạo dòng11.
- Chữ đang gõ chỉ là query, không phải doanh nghiệp mới. Khi chưa chọn kết quả hợp lệ, form không gửi lại ID cũ dưới nội dung đang gõ; Escape khôi phục lựa chọn trước và chỉ đóng gợi ý. Bỏ chọn là thao tác riêng. Search/pagination không đánh dirty; chọn/bỏ doanh nghiệp mới đánh dirty.
- Arrow/Enter chọn kết quả; Tab tới actions popup và Shift+Tab quay về ô nhập. Popup dùng theme root, giới hạn viewport và có vùng cuộn riêng; không bị Sheet cắt. Quyền/session, business commands, CAS và scope server giữ nguyên; không tạo migration.

Kiểm chứng20/10/2026: shared UI64tests pass, admin71pass/4live skips; UI/app TypeScript và production Next build pass (`PUBLIC_BUILD_ORIGIN=http://localhost:3000`). Chrome dev và standalone production1366/390px kiểm một ô duy nhất, prefill doanh nghiệp25 ngoài10kết quả, các trang10/10/5, tìm ngành hàng và reset trang1, reopen trang1, Tab/Shift+Tab/Enter phân trang, Arrow/Enter chọn, Escape giữ form/lựa chọn cũ, search không dirty, empty/lỗi/retry, chặn text chưa chọn, submit đúng companyId12 và409 giữ draft. Popup được đo trong viewport và kiểm ảnh desktop/mobile. Mọi API browser bị intercept bằng fixture; không ghi DB/cloud, không commit/push/deploy.

### Avatar upload dùng chung

Logo doanh nghiệp và logo website dùng `AvatarUploadField` của `@mall/ui`: một vòng tròn duy nhất, bấm vào để chọn ảnh, không còn khối kéo-thả lớn.

- Component dùng chung sở hữu vòng tròn, nút chọn, nút gỡ, ẩn file input native và vòng đời object URL: URL cũ bị revoke khi đổi ảnh hoặc khi field unmount, nên không rò rỉ blob trong bộ nhớ.
- Ảnh đã chọn hiển thị ngay bằng object URL ở FE, **không upload** cho tới khi bấm Lưu. File chỉ nằm trong memory của tab, không ghi localStorage/URL.
- Validate tệp vẫn do tầng app chạy (`validateMediaFiles`): sai định dạng, quá10MiB, quá4096px hoặc trên4megapixel bị từ chối và giữ nguyên ảnh trước đó. Chỉ server mới quyết định quota/scope/decode.
- Upload chỉ chạy **một lần** cho mỗi lần chọn ảnh. Lưu bị 409 giữ preview và media id đã upload, nên lưu lại không tải lại bytes. Chọn ảnh khác xoá media id đã upload để tải đúng bản mới.
- Logo doanh nghiệp: nút gỡ đặt cờ xoá logo đã lưu; chọn ảnh mới xoá cờ này. Logo website bắt buộc nên nút gỡ chỉ khôi phục logo đang lưu, không tạo website không logo.
- Thư viện ảnh vẫn là nguồn chọn ảnh đã tải lên; ở biến thể avatar nó là hành động gọn, không hiện bộ đếm ảnh hay danh sách thumbnail trùng lặp. Chọn ảnh thư viện và tệp cục bộ loại trừ nhau.
- Quyền, session, revision CAS, idempotency và scope server không đổi; không có migration hay API mới.

Kiểm chứng20/10/2026: shared UI65tests pass, admin71pass/4live skips, UI/app TypeScript và production Next build pass. Chrome dev và standalone production1366/390px đo vùng logo cao158px desktop/204px mobile, không còn dropzone hay danh sách tệp; preview ảnh tại chỗ bằng blob URL, thay ảnh revoke URL cũ, tệp sai định dạng giữ ảnh cũ, gỡ logo quay về chữ viết tắt, không upload trước khi bấm Lưu, 409 giữ preview và lưu lại không tải lại ảnh, hủy form thả file, unmount không rò blob URL. Mọi API browser bị intercept bằng fixture; không ghi DB/cloud, không commit/push/deploy.

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

Mọi nơi upload/chọn media dùng `AdminMediaField`, tái sử dụng `@mall/ui UploadField`, `Modal size="large"` và `ImagePreview`; không còn dropdown hay checkbox thư viện inline riêng cho logo. Logo doanh nghiệp/website chọn1ảnh; media/nội dung tầng chọn tối đa4ảnh hoặc tải tối đa4tệp mới. Trang Media dùng cùng field ở chế độ chỉ tải mới. Client kiểm số lượng, dung lượng, MIME/signature và kích thước trước khi nhận lựa chọn; server vẫn authoritative cho decode, quota, property và quyền.

Modal thư viện chỉ GET khi mở, server lọc `source=uploaded&kind=Ảnh`, phân trang24mục và tìm tên/phạm vi. Grid chỉ dùng thumbnail; xem lớn mới tải ảnh gốc và không toggle chọn. Lựa chọn nháp giữ qua tìm kiếm/trang; đủ4 khóa ảnh chưa chọn nhưng vẫn bỏ chọn được. Hủy/Escape giữ nguyên form cha, Dùng N ảnh mới áp dụng vào draft. Tìm kiếm/lọc không đánh dấu dirty. Modal/preview portal vào theme root để không bị transform/overflow của Sheet hoặc modal cha cắt, vẫn lồng trong React dialog tree cho Escape/focus.

Thêm media tầng mở AdminEditor tại danh sách tầng, cố định scope `Tầng n`, không chuyển sang Media. Không có tệp/ảnh thì khóa Lưu media; lựa chọn thư viện không cần có file mới. Tệp protected/quarantine và ảnh thuộc tầng/slot khác hiển thị lý do khóa; không âm thầm chuyển scope. Ảnh đã thuộc đúng tầng không link lại. PDF mới vẫn private/quarantine; bộ chọn thư viện chỉ dành cho ảnh.

Sau upload/link thành công, form chỉ tiến CAS từ receipt của chính nó, giữ ID ảnh đã upload và scope link đã hoàn thành; nếu bước sau lỗi thì retry không tải/link lại phần đã ACK. Refetch/reload không nâng CAS của draft. `useAdminData` giữ dữ liệu của cùng identity/screen/visit trong lúc revalidate để editor không unmount và mất file; đổi identity/screen/visit vẫn loại dữ liệu cũ. Popup bỏ draft dùng shared ConfirmDialog có actions gap12px, mobile xếp dọc; đang lưu chặn đóng/gửi lặp.

Bản nguồn yêu cầu áp dụng migration017 trước khi chạy. Regression dùng PostgreSQL disposable và metadata ảnh fixture; không phải bằng chứng đã upload cloud hay phát hành production.

Kiểm chứng flow media dùng chung20/10/2026: shared UI build/typecheck, app TypeScript và66admin tests pass/4live skips;63shared UI tests pass. Chrome localhost1440/390/320px với API bị chặn bằng fixture đã kiểm library-only floor save, lưu nội dung tầng kèm ảnh, giới hạn4qua trang, search/cancel không dirty, preview chỉ tải original khi mở, ảnh protected/cross-floor bị khóa, lỗi từng phần→reload giữ draft→retry không relink phần đã ACK, chặn batch5tệp và đóng khi pending, gap12px/confirm mobile xếp dọc, logo website1ảnh và retry cấu hình không upload trùng, logo doanh nghiệp và upload trang Media. Fixture không ghi DB/cloud và không chứng minh upload provider production.

Lần chạy đầu của `test:database` phát hiện kỳ vọng cũ sau khi tách trạng thái nội bộ/public và một query dùng sai projection; đã cập nhật test để hợp đồng hiệu lực được thể hiện `Đã ký` và chỉ kiểm tra tenant đang hiệu lực. Lần chạy lại trên PostgreSQL disposable pass 5/5 relational, 2/2 outbox và 2/2 email; runner tự dọn database. Build OpenNext và public smoke qua contract parser pass. Đây là kiểm chứng trên fixture/local; không phải bằng chứng gửi mail hoặc upload file production thành công.
