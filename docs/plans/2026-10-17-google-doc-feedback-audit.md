# Đối chiếu feedback Google Docs và kế hoạch hoàn thiện

Ngày kiểm tra: **17/10/2026**. Phạm vi: phân tích và lập kế hoạch, **không sửa application, không deploy, không đổi DB/billing/DNS, không đóng comment trên Google Docs**.

## 1. Kết luận và độ tin cậy

**Chưa đáp ứng đầy đủ feedback.** Có chức năng đã tồn tại nhưng bố trí chưa đúng; có thay đổi mới chỉ nằm trong source; có hạng mục hợp đồng/cấu hình nền tảng chưa có bằng chứng để kết luận.

Nguồn chính: [NỘI DUNG HỌP — Google Docs](https://docs.google.com/document/d/1R3g0ktWiW8ReF2pTm6WvOBsPFWtHcEY5K06Ze2YAw54/edit?usp=sharing). Đã đọc TXT, HTML, xem **19 ảnh nhúng**, và mở trình duyệt Google Docs → **Tất cả nhận xét / Tất cả các loại / Tất cả các thẻ**.

Bảng comment thực tế có **12 luồng: 11 chưa giải quyết, 1 đã giải quyết**. Tất cả tác giả hiển thị là Bang Tieu, ngày 16/10/2026. Mười một luồng mở có 0 phản hồi; luồng đã giải quyết có một bản ghi đánh dấu giải quyết lúc 19:32. Bản TXT/HTML chỉ chứa 11 comment a–k: **nếu chỉ đọc export sẽ bỏ sót yêu cầu popup đã đóng**. “Đã giải quyết” là trạng thái thảo luận, không phải bằng chứng tính năng đã chạy đúng.

Không gán tỷ lệ hoàn tất vì chưa có bản hợp đồng/phụ lục hiện hành, file Canva gốc, xác nhận bản vẽ cuối cùng hoặc bằng chứng cấu hình billing/native alerts trong phiên kiểm tra này.

### Ba bề mặt không được đánh đồng

| Bề mặt | Bằng chứng quan sát |
| --- | --- |
| Source và Next dev `http://localhost:3000/` | Hero có đoạn copy đề xuất; section “Nhiều loại hình. Một điểm đến.” và mosaic mới; chưa đổi nhãn “Đặt lịch tham quan”. |
| [Worker hiện có](https://le-grande-centre-stage2.nguyenbang-skyone.workers.dev/) | HTTP 200; hero có copy đề xuất, vẫn là section “Đa dạng loại hình, linh hoạt lựa chọn.”; popup A.11 còn bố cục cũ. API public trả 6 tầng / 81 căn. |
| [Tên miền công khai](https://legrandecentre.vn/) | HTTP 200 nhưng là website legacy có menu anchor Trang Chủ/Tổng Quan/Vị Trí/Phân Khu/Hình Ảnh…, khác ứng dụng đang review. Chưa có copy hero mới. |

Standalone local artifact cũ cũng khác source, vì vậy không dùng nó để kết luận trạng thái source hiện hành. Không thực hiện cutover tên miền trong lần kiểm tra.

## 2. Từng comment, kể cả comment đã giải quyết

Mã a–k là mã trong export; R là luồng bổ sung tìm thấy ở bảng tất cả nhận xét.

| Comment / giờ 16/10 | Yêu cầu và cách hiểu | Kết quả đối chiếu |
| --- | --- | --- |
| a · 20:10 | “đổi tên kh thêm ngà giờ”: đổi từ Đặt lịch sang Yêu cầu tư vấn; không phát triển thêm ngày/giờ để đáp ứng mục này. | **Chưa đủ.** Menu và hero còn Đặt lịch; form mặc định không có ngày/giờ nhưng nhánh `intent=visit` vẫn yêu cầu ngày/buổi. Không coi việc đã có nhánh visit là hoàn thành comment đổi tên. |
| b · 18:39 | “BĂNG” trên đoạn hero. | Là chỉ định người xử lý, không thêm tiêu chí UI. **Đoạn copy đã có** trong source và Worker. |
| c · 11:15 | “đổi thành hình như canva”, nằm ở phần intro. | **Chưa xác minh đúng Canva.** Có ảnh introduction hiện hữu; tài liệu không cung cấp hyperlink Canva gốc để so đúng bản mới. Không tự thay hero đã được đánh dấu OK. |
| d · 11:34 | Tách hover tầng 5–6 thành hai nút theo bố cục tòa nhà. | **Một phần.** Card có tab Tầng 5/Tầng 6 nhưng trên tòa nhà vẫn chỉ một hotspot chung cho nhóm 5–6. Tab trong card không tương đương hai hotspot trên công trình. |
| e · 19:04 | Kiếm ảnh phù hợp; chỉnh text khoảng 4 dòng ở khối đa dạng loại hình. | **Một phần, source mới hơn deploy.** Source có mosaic sáu loại hình, nhưng hai đoạn copy chưa được rút còn khoảng bốn dòng ở viewport review. Ảnh cần đối chiếu asset Canva được duyệt. |
| f · 19:09 | “Không cần thanh bộ lọc”, trên ví dụ section homepage. | **Đạt trong phạm vi section homepage hiện tại.** Không có filter bar ở section này. **Không được áp dụng để xóa bộ lọc trang Mặt bằng**, vì thân tài liệu yêu cầu Tầng/Diện tích/Trạng thái. |
| g · 19:15 | “thêm mục này”, trên dải logo “Cùng phát triển tại Le Grande Centre”. | **Chưa có public section + CMS publishing tương ứng.** Mục quản lý khách thuê trong admin không phải dải thương hiệu public. Giữ điều kiện chỉ hiện khi có tenant thật và được duyệt công bố. |
| h · 12:18 | Căn góc có hai mặt tiền. | **Một phần.** Có hướng tham khảo cho căn góc, nhưng chưa có nhãn/metadata rõ “căn góc / 2 mặt tiền”. Không lấy chuỗi Nam/Bắc/Đông làm chứng nhận số mặt tiền. |
| i · 13:11 | Map luôn hiện bên trái dưới ảnh; đổi tầng/căn như trang Mặt bằng; nhấn mạnh CTA tư vấn; bỏ câu 23 ô D; thay tag linh hoạt bằng hai tag được chỉ định. | **Chưa đủ.** Map hiện là modal chỉ có căn cùng tầng. CTA đã có nền vàng nhưng chưa thấy hiệu ứng attention riêng tại trigger. Câu mô tả và “Mặt bằng linh hoạt” vẫn tồn tại. Chưa có hai tag yêu cầu. |
| j · 13:26 | Bố cục Không gian kinh doanh theo ảnh. | **Chưa khớp.** Reference có hero + CTA, tổng thể ba ảnh + panel phân khu, tab Tổng thể/1–2/3–4/5/6, rồi ảnh và thông tin/CTA từng phân khu. Route hiện tại là metrics/tiện ích + scroll reel, thiếu hệ điều hướng/thông tin như reference. |
| k · 13:27 | “ĐỔI VỀ 1 FONT CHỮ”, gắn với ảnh khối thông tin liên hệ cuối tài liệu. | **Chưa đồng nhất.** Quan sát contact hiện có Charis cho heading, Playfair cho số/email/địa chỉ, Be Vietnam Pro cho label/form. Source root đã chỉ khai báo loader Be Vietnam Pro nhưng CSS vẫn còn các stack Charis/Playfair; bỏ loader không tự đồng nhất typography. Áp dụng đúng scope khối liên hệ; không tự đổi logo/admin. |
| R · 12:37, resolved 19:32 | Hai action ngay dưới Còn trống; bỏ hai dòng cuối và link sơ đồ tầng; tổng diện tích nằm cạnh tên cặp A.11–B.11. | **Chưa đạt dù đã đóng comment.** Source và popup Worker vẫn để action cuối khối, tổng diện tích là dòng riêng ở dưới, còn link Sơ đồ tầng 1/2 và hai đoạn note. Cần mở lại việc xử lý trong checklist, không tự thay trạng thái comment. |

## 3. Các yêu cầu trong thân tài liệu

### Website và dữ liệu

| ID | Yêu cầu | Trạng thái / việc còn lại | Bằng chứng source |
| --- | --- | --- | --- |
| W01 | Điều hướng từ căn về tầng/danh sách và sang căn khác | **Đã có.** Breadcrumb, quay lại tầng, căn trước/sau và các căn cùng tầng. Worker D.20 → D.21 đã chạy đúng. Giữ nguyên khi thay layout. | `src/features/public/leasing-unit-detail.tsx:17-37,67-76` |
| W02 | Public chỉ Còn trống / Liên hệ / Đã thuê | **Vocabulary đã có.** Nhưng badge vẫn ghi “Trạng thái mô phỏng · chờ kết nối dữ liệu” trong khi projection lấy DB. Cần thống nhất nguồn dữ liệu và copy, không tiếp tục coi toàn bộ trạng thái là demo. | `leasing-model.ts:15-38`; `src/server/public-leasing.ts:6-16`; `leasing-availability-badge.tsx:16-20` |
| W03 | Bộ lọc Tầng / Diện tích / Trạng thái | **Đã có chức năng cơ bản** và thêm Loại hình. Worker đổi tầng → 3 trả 23 căn; filter diện tích chạy. Cần rà bố trí theo ảnh và ý nghĩa nhóm tầng 1–2, không làm lại backend lọc khi chưa cần. | `leasing-explorer.tsx:54-74`; `leasing-model.ts:50-61` |
| W04 | Body desktop 18px; toolbar 12–14px | **Chưa đạt toàn bộ.** Intro đo 14px; menu desktop đo 10px; nhiều nút/metadata 10–12px. Cần phân biệt body với caption và kiểm lại breakpoints sau tăng chữ. | `homepage-v2.module.css:13,28,41,55-63`; `site-shell.module.css:15,39` |
| W05 | Hero giữ nguyên; cân nhắc đoạn copy mới | **Copy mới đã có** source/Worker. Không đổi hero image hay thêm 3D. | `homepage-v2.tsx:50-56` |
| W06 | Đổi Đặt lịch tham quan thành Yêu cầu tư vấn | **Chưa đồng bộ** menu, hero, khối contact, secondary actions. Nên giữ URL `/lien-he/`, đổi nhãn và public flow chứ không đổi URL vô ích. | `homepage-v2.tsx:55,139`; `site-content.ts`; `contact-form.tsx:22-50`; `leasing-unit-detail.tsx:62-65` |
| W07 | Căn lề full màn hình thay vì centered | **Một phần.** Section types đã fluid hơn, nhưng intro vẫn 1180px trên viewport 1440, lề 130px mỗi bên. Xác định các block được đánh dấu, giữ measure đọc phù hợp, không đặt mọi khối `100vw` gây overflow. | `homepage-v2.module.css:39,55,422-426` |
| W08 | Tất cả heading một màu xanh | **Một phần.** Source có token xanh nhưng vẫn xanh sáng trên nền tối, xanh đậm trên nền sáng, và kicker loại hình màu brass. Chốt “một sắc xanh literal” hay green semantic variants; nếu literal phải điều chỉnh nền để đủ contrast, không ép xanh đậm lên nền tối. | `homepage-v2.module.css:3-6,17,40,407,433,476-484` |
| W09 | Strategic location theo Canva | **Đã có section mới**, sơ đồ ảnh + mở Maps, header/quote/4 cards. Chưa thể chứng nhận pixel/layout match vì thiếu Canva gốc trong tài liệu. | `homepage-v2.tsx:80-114`; `home-strategic-map.tsx` |
| W10 | Khám phá không gian thêm chi tiết; tầng/công năng/diện tích rõ | **Một phần.** Có stack, floor content, area range và CTA. Cần tách tầng 5/6 trên hình và đối chiếu bản vẽ/xác nhận công năng, không tự nâng nội dung brochure thành thông số kỹ thuật cuối. | `floor-showcase.tsx:18-35,81-94,142-163` |
| W11 | Floor label to/sáng; CTA tất cả mặt bằng vàng/xanh | **Một phần.** Floor card title 30px và CTA vàng đã có; link “Khám phá tất cả mặt bằng” ở section card vẫn kiểu text link. Cần làm rõ CTA nào trong reference và nhấn đúng nó. | `floor-showcase.tsx:85-93`; `homepage-v2.tsx:118`; `homepage-v2.module.css:33,407-420` |
| W12 | Ảnh tự chuyển; giảm thao tác | **Chưa có ở OverviewGallery**: chỉ state index + nút bấm. Quan sát 6,5 giây không đổi ảnh/caption. Reel chuyển ảnh theo scroll không thay thế autoplay khối này. | `homepage-v2-interactive.tsx:50-61` |
| W13 | Cân đều bố cục hình/cards, reasons | **Đã có grid**, reasons 3 cột và mosaic. Chưa ký duyệt là khớp ảnh: cần vòng visual sau đổi chữ 18px, chiều cao nội dung và crop ảnh. | `homepage-v2.module.css:434-481` |
| W14 | Tenant brands thêm nhưng ẩn tới khi có dữ liệu thật; admin cập nhật | **Thiếu public section và publishing contract.** Không trưng logo ví dụ trong reference thành tenant thật. | `homepage-v2.tsx:42-144`; `src/shared/admin/website-settings.ts:1-9` |
| W15 | Map có Mặt tiền Nguyễn Chí Thanh / Mặt sau | **Một phần.** Hiện nằm trong disclosure “Hướng và nguồn sơ đồ”; chưa được đặt trực tiếp quanh từng plan. | `leasing-explorer.tsx:77-99` |
| W16 | Ngang × dọc từng căn | **Đã có dữ liệu kích thước cho 80/81 căn** và UI popup/detail; B.11 hiển thị 205 m², 10 × 20,5 m. Chưa có dimensions trực tiếp trên từng ô map; F.2 thiếu cạnh đầy đủ, phải giữ unknown/nhận bản vẽ chứ không suy từ diện tích. | `brochure-leasing.ts:32-76`; `leasing-explorer.tsx:85-86,109`; `leasing-unit-detail.tsx:45-49` |
| W17 | Lược phần thừa trên trang map theo dấu X trong ảnh | **Chưa thực hiện.** Ảnh đánh X dòng count bên trên và descriptions từng tầng; có dấu giữ đoạn giải thích 11 cặp. Không xóa hết copy hay các nguồn pháp lý một cách máy móc. | `leasing-explorer.tsx:73-79`; ảnh map annotated trong Google Doc |
| W18 | Bố cục hover/popup | **Chưa đủ**, theo comment R; không chỉ đổi màu popup. Cần action-first và pair summary gọn, vẫn giữ diện tích mỗi tầng/cặp đúng. | `leasing-explorer.tsx:103-114` |
| W19 | Trang chi tiết căn theo screenshot + comment i | **Có gallery trái/facts phải**, thiếu inline map dưới gallery và cross-floor navigation; câu/tags cũ còn ở DB defaults và model. | `leasing-unit-detail.tsx:33,38-67`; `leasing-unit-map.tsx:13-40`; `space-model.ts:19-25`; `brochure-leasing.ts:9` |
| W20 | Trang Không gian kinh doanh theo ảnh | **Cần đổi bố cục chính**, không coi reel hiện có là equivalent. Tránh tự xóa yêu cầu reel/minimum 10s đã có; giải quyết vai trò reel tại gate scope trước triển khai. | `src/app/(public)/tong-quan-tang/page.tsx:14-20`; `business-space-showcase-reel.tsx:58-65` |
| W21 | Lead mới báo đầu mối sales | **Có code tích hợp Zalo**, chỉ gọi khi tạo mới; lỗi thông báo không rollback lead. Chưa xác minh cấu hình runtime/đúng đầu mối/nhận tin thật. Không gửi lead thử vào DB live trong audit. | `src/app/api/contact/route.ts:32-37`; `src/server/zalo-survey-notification.ts:6-25` |

### Hợp đồng, UAT, vận hành

Không tìm thấy hợp đồng/phụ lục thương mại hiện hành trong các file dự án đã tra. `admin-data-contract.md` là contract kỹ thuật admin, **không phải hợp đồng dịch vụ với NTM**. Các mục dưới là việc phải đối chiếu/sửa trong văn bản đúng thẩm quyền, không thể ghi “đã hoàn tất” từ source.

| ID | Yêu cầu | Đánh giá / hành động |
| --- | --- | --- |
| C01 | Bỏ render 3D | Tài liệu tự mâu thuẫn: đã thống nhất bỏ 3D nhưng bước bàn giao vẫn ghi “sản phẩm 3D”. Xóa nghĩa vụ/dòng chi phí/deliverable 3D trong bản hợp đồng/phụ lục, không xóa ảnh phối cảnh 2D đang sử dụng hay source archive không liên quan. |
| C02 | Khối lượng dữ liệu ban đầu, trách nhiệm | Chốt danh mục 6 tầng/81 căn hiện có và giới hạn số ảnh/PDF/nội dung nhập ban đầu; NTM/chú Thanh cung cấp và duyệt dữ liệu; đội triển khai chuẩn hóa, nhập và hoàn thiện kỹ thuật. Inventory tồn tại không thay thỏa thuận về số lượng công nhập dữ liệu. |
| C03 | Phụ lục vận hành: cấu hình ban đầu, dự toán, cảnh báo/nâng cấp | Repo có nghiên cứu quota và readiness, chưa phải phụ lục ký duyệt. Phải mô tả đúng kiến trúc hiện hành, không bê nguyên tài liệu cũ static export/Pages. Ghi chi phí theo workload/usage, không cam kết miễn phí trọn đời. |
| C04 | R2 10 GB-month/tháng + requests | Cách diễn đạt đúng đã có trong research/quota; đưa vào phụ lục: Standard 10 GB-month/tháng, 1 triệu Class A, 10 triệu Class B; không phải mỗi tháng cộng mới 10 GB. Vượt requests vẫn có thể có phí khi storage thấp. |
| C05 | CMS meter chỉ storage | App cap 8,5 GB là policy ứng dụng, không trần hóa đơn Cloudflare/account. Dashboard native là nguồn request/usage/bill. Không gọi meter là cost limiter. |
| C06 | Workers Free nằm cùng Neon–R2 | Research đã ghi, phụ lục cần bổ sung rõ 100.000 requests/ngày, 10 ms CPU/request, 128 MB/isolate và rủi ro lỗi khi vượt. Account/plan thực tế cần xác minh riêng. Không tự nâng trả phí để hợp thức hóa scope. |
| C07 | Native cost alerts/spending limits; NTM sở hữu accounts/billing; mọi nâng phí phải được xác nhận | Chưa có bằng chứng cấu hình provider trong audit. Ghi rõ native alert không đồng nghĩa hard cap; nền tảng/gói nào không hỗ trợ spending limit phải nêu giới hạn và cách xử lý. NTM xác nhận trước mọi upgrade/add-on có phí. |
| C08 | UAT đủ build/account/checklist | Định nghĩa bộ bàn giao UAT, đúng URL/version và quyền/tài khoản; chưa coi website legacy/Worker/source local là cùng một build. |
| C09 | 7 ngày làm việc + một nhắc hạn | Thống nhất dùng **ngày làm việc** trong mọi điều khoản; xác định thời điểm bắt đầu khi bàn giao đủ đầu vào, cách nhắc và lưu vết email/văn bản. Không giữ chỗ khác là 5 ngày. |
| C10 | Không mặc định nghiệm thu phần có lỗi hợp lệ chưa sửa | Lập defect list đúng scope, sửa và retest; phần có lỗi hợp lệ đang tồn tại không tự chuyển accepted vì hết 7 ngày. |
| C11 | UAT → go-live → payment 3 → bàn giao | Đồng nhất trigger thanh toán đợt 3 và số ngày thanh toán giữa điều khoản, bảng mốc và phụ lục. Go-live sau UAT đạt; xác nhận production đúng scope; bàn giao source Git/config/access/docs sau thanh toán theo thỏa thuận. Không để deliverable 3D lọt lại. |

## 4. Tác động và nguyên tắc xử lý

1. **Không gom yêu cầu sai scope.** f không bỏ filters ở `/mat-bang/`; k nằm ở contact, không tự đổi admin/logo; c không yêu cầu thay hero đã OK.
2. **Không dùng tên gọi để thay chức năng.** Tab 5/6 trong popup chưa đủ yêu cầu hai hotspot; map modal chưa đủ map inline có chọn tầng; danh sách tenant admin chưa đủ brand strip có public approval.
3. **Nội dung tầng đến từ DB.** Chỉ sửa `DEFAULT_FLOOR_CONTENT` không đổi records hiện hữu. Cần cập nhật dữ liệu được duyệt và default/model đồng bộ, rồi kiểm cache API/SSR trên đúng môi trường. Không reset DB để sửa copy.
4. **Dữ liệu hình học không được tự phát minh.** Không tính lại diện tích từ width×depth (brochure có làm tròn), không suy F.2 từ polygon SVG, không gắn “hai mặt tiền” đại trà từ hướng compass.
5. **Map inline có tác động payload.** Modal hiện tránh dựng sơ đồ khi đóng; chuyển inline phải dùng DTO public tối thiểu, chỉ dựng tầng đang chọn, không nhét thêm 81 records private hoặc prefetch toàn bộ căn.
6. **Typography có tác động bố cục.** Body 18/menu12–14 dễ làm nav wrap/tràn; cần điều chỉnh breakpoint và đo tiếng Việt, không thu nhỏ chữ lại để che lỗi.
7. **Giữ các hành vi ngoài scope.** Shared forms/Toast/motion tiếp tục ở `@mall/ui`; không nhân bản trong app. Không đổi Auth/session/admin workflow, schema business, cloud plan hoặc xóa source archive 3D như việc phụ của feedback public.
8. **Không lấy HTTP 201 lead làm bằng chứng thông báo sales.** API hiện chấp nhận lead dù Zalo lỗi. Nghiệm thu thông báo phải có bằng chứng ở thiết bị/tài khoản nhận; không cần tự mở rộng thành queue/retry system nếu chưa có yêu cầu.
9. **Release là một công việc riêng.** Một phần source mới chưa lên Worker; tên miền chính là phiên bản khác. Phiên bản UAT, target deploy và kế hoạch domain phải được ghi rõ trước nghiệm thu.

## 5. Plan triển khai theo ưu tiên và phụ thuộc

### P0 — Chốt nguồn duyệt và phạm vi, không chặn các việc đã rõ

- Lập checklist 12 comment + W01–W21/C01–C11 trên một version review cụ thể. Mọi dòng có trạng thái, evidence URL/screenshot và người duyệt; không auto-close comment.
- Bổ sung Canva gốc/export cuối cho intro, strategic location và types nếu khác ảnh nhúng. Tài liệu hiện chỉ có link ngoài tới nhà đẹp S House, không có hyperlink Canva.
- Xác nhận map/bản vẽ dùng cho 6 tầng/81 căn, F.2 và danh sách căn góc có hai mặt tiền; chốt công năng chỉ mang tính định hướng hay đã được xác nhận.
- Chốt hai điểm phạm vi còn mâu thuẫn: một màu xanh tuyệt đối hay biến thể đảm bảo contrast; trang phân khu reference là bố cục chính còn reel là phần phụ hay thay thế. Đề xuất: dùng reference làm lối khám phá tầng trực tiếp, không để reel là nội dung thay thế; chưa tự xóa hành vi reel 10s đã có.
- Chốt bộ hợp đồng/phụ lục có quyền sửa và target UAT/production. Giữ domain/billing nguyên trạng tới lúc được duyệt triển khai.

**Gate:** checklist không còn yêu cầu vô chủ hoặc hiểu nhầm scope; phần thiếu asset/data được đánh dấu cụ thể, không chặn đổi nhãn, popup hay inline map đã rõ.

### P1 — Sửa điểm ảnh hưởng khách tìm và gửi nhu cầu

1. Đồng bộ “Yêu cầu tư vấn” ở `PUBLIC_NAVIGATION`, header/footer, hero, section contact và các CTA căn. Giữ `/lien-he/`, giữ context unit/scope. Đường public đang phục vụ consultation không yêu cầu ngày/giờ. Rà nhánh visit cũ: không tiếp tục quảng bá như yêu cầu mới và không xóa admin appointment độc lập.
2. Chỉnh `LeasingExplorer` popup: ảnh → badge → hai action → facts/cặp; tổng hai tầng cạnh tiêu đề cặp; bỏ link sơ đồ và các dòng thừa đúng comment R. Giữ từng diện tích A/B, cảnh báo nguồn phù hợp và return focus/Escape.
3. Bố trí unit detail: cột trái gallery + inline map; cột phải facts/CTA. Map chọn được các tầng và các căn, đánh dấu căn đang xem. Tái dùng dữ liệu và renderer plan hiện có, không nhúng cả trang explorer kèm toolbar/modal/CTA dư.
4. CTA consultation nền vàng/xanh rõ, hiệu ứng nhẹ có pause/reduced motion; không dùng nháy gắt. Kiểm tra effect đang nằm ở đâu trước khi thêm.
5. Thay câu mô tả 23 ô theo nội dung đã duyệt; hiển thị hai tag “Đa dạng công năng” và “Có thể liên thông các lô gần kề”. Phân biệt tag khả năng với quyền ghép/tháo vách đã được xác nhận; không đổi rule ghép admin.
6. Thống nhất public status là dữ liệu DB; bỏ copy “chờ kết nối” chỉ sau khi xác minh nguồn authoritative đúng target.

**Nghiệm thu:** từ căn bất kỳ chọn tầng/căn trên inline map đúng URL/highlight; quay lại giữ đúng tầng; trước/sau xử lý đầu/cuối tầng; consultation giữ mã căn và cặp, không bắt ngày/giờ; popup A.11/B.11 đúng vị trí action và tổng 395 m²; D.20 không còn câu/tag bị yêu cầu bỏ; không lộ dữ liệu nội bộ.

### P2 — Đóng checklist desktop homepage

- Body 18px và nav/toolbar12–14px theo đúng scope desktop; khối liên hệ dùng một family thống nhất (đề xuất Be Vietnam Pro, hỗ trợ tiếng Việt và đang là font form), không đổi logo/admin.
- Căn lại những section được đánh dấu theo bề ngang layout duyệt; giữ giới hạn line length cho body, không buộc paragraph chạy hết chiều rộng viewport.
- Đồng bộ heading green theo quyết định contrast của P0; không đổi riêng chữ lên nền không đọc được.
- Hoàn thiện strategic location/intro/types theo Canva cuối; rút text types khoảng bốn dòng tại viewport review, crop đúng ảnh và giữ disclosure minh họa khi cần.
- Tách hotspot5/6 trên tòa nhà; xử lý hit target/focus/touch/connector riêng, giữ nhóm1–2 và3–4. Dùng asset sẵn có, không tạo render3D mới.
- Làm rõ nhãn tầng và CTA tất cả mặt bằng; giữ homepage section không có filter bar.
- Thêm tự chuyển ảnh cho gallery được chỉ định, vẫn cho chọn tay; dừng khi hover/focus/tab ẩn/offscreen và tôn trọng reduced motion. Tái dùng shared gallery/motion nếu đã có, không viết engine thứ hai.
- Cân grid/crop/card heights sau khi tăng chữ, nhất là reasons và gallery.

**Nghiệm thu:** tại1440px đo computed body18/nav12–14; không wrap sai menu; intro/types/strategic location khớp asset duyệt; hai hotspot5/6 mở đúng tầng; ảnh tự đổi khi không thao tác, có cách dừng; không chữ đè dấu tiếng Việt;320/390px không overflow và thao tác touch dùng được.

### P3 — Nội dung phân khu, bản đồ và tenant CMS

- Thay bố cục chính `/tong-quan-tang/` theo ảnh: hero/CTA → tổng thể một ảnh lớn/hai ảnh nhỏ + panel phân khu → tabs/anchors → block ảnh/thumbnail + công năng/diện tích/CTA mặt bằng của từng nhóm1–2/3–4/5/6. Dùng existing images/floor public content; không tự lấy tenant hay công năng ví dụ làm thật. Vai trò reel xử lý theo quyết định P0.
- Trên leasing maps, đặt nhãn front/rear quanh sơ đồ và dimension/readable unit information; chỉ rõ căn góc theo dữ liệu được duyệt. Giữunknown F.2 nếu chưa có bản vẽ.
- Rút count/description theo dấu X trong reference, giữ đoạn giải thích cặp được đánh dấu giữ; tránh để source metadata choán nhiệm vụ chọn căn.
- Tenant brand section: trường tên thương hiệu/logo/thứ tự/duyệt hiển thị và công tắc công bố, quản trị qua pattern CMS hiện tại. Chỉ expose DTO public đã duyệt, không xuất dữ liệu contact/lease nội bộ. Khi chưa có tenant duyệt, ẩn toàn section chứ không bày logo mẫu/placeholder.

**Nghiệm thu:** mỗi phân khu dẫn đúng mặt bằng tầng; tab/anchor không mất context; image preview dùng được; front/rear và căn góc đọc được không chỉ bằng màu; F.2 không có số tự bịa; tenant chưa duyệt không xuất hiện trong HTML/API public, tenant đã duyệt sắp xếp đúng và chỉnh CMS có hiệu lực sau publish/invalidation.

### P4 — Hợp đồng, phụ lục và kiểm chứng vận hành

- Chỉnh C01–C11 trong bản hợp đồng/phụ lục thực; rà tìm tất cả điều khoản3D/5ngày/mốc đợt3 trái nhau.
- Appendix ghi kiến trúc/account/cấu hình hiện tại, quota Neon–R2–Workers, dự toán theo usage, người nhận cảnh báo và quy trình khi sắp hết quota. Không sao chép các đoạn Pages/static export lịch sử làm kiến trúc hiện tại.
- Xác minh native alerts/spending controls khả dụng trên gói thực; ghi screenshot cấu hình và người nhận. Ghi rõ không có hard spending cap nếu nền tảng không cung cấp. Mọi nâng phí có xác nhận NTM trước.
- Kiểm Zalo owner mapping và config trên target được duyệt; tạo một lead thử có định danh trong môi trường UAT được phép; quan sát đúng đầu mối nhận, không tạo trùng khi replay cùng idempotency key. Không gửi thử vào production chỉ vì local chạy được.

**Nghiệm thu:** văn bản không còn nghĩa vụ3D; UAT7ngày làm việc+nhắc hạn+ngoại lệ lỗi hợp lệ đồng nhất; payment3/go-live/handover có trigger rõ; phụ lục có bảng đủ3dịch vụ và approval rule; notification được nhận thật, không chỉ thấy log API.

### P5 — Chứng minh hoàn tất và phát hành đúng phiên bản

- Chạy một vòng typecheck/build và các regression hiện có bị ảnh hưởng sau khi tích hợp; chỉ bổ sung permanent test cho behavior/boundary thực sự có rủi ro.
- Browser thật1440/1366/390/320: homepage → leasing/filter → popup → detail/inline map/chọn tầng → consultation; keyboard/Tab/Escape/return focus, reduced motion và mobile touch.
- Kiểm cập nhật nội dung DB + invalidation trên target UAT; không chỉ sửa defaults. Không cần reset hoặc migrate lại catalog để đổi copy.
- Đánh dấu từng comment bằng evidence của build UAT, không bằng trạng thái export. Chỉ người có quyền mới resolve trên Doc sau duyệt.
- Sau UAT, deploy build đã nghiệm thu lên target được phê duyệt, smoke lại public/API/forms và khả năng nhận thông báo; ghi URL/version/time. Domain cutover chỉ khi được duyệt riêng, không suy từ việc Worker lên bản mới.

**Definition of done:** mọi mục có trạng thái/evidence; không còn công việc thiếu bị giấu dưới “resolved”; browser khách truy cập đúng release; hợp đồng/phụ lục và vận hành đã xác minh hoặc có ngoại lệ được người có thẩm quyền chấp thuận rõ ràng.

## 6. Kiểm chứng đã thực hiện trong lần audit này

- Google Docs browser: đọc panel tất cả loại/tất cả thẻ, thấy đủ11open+1resolved, tác giả/thời gian/nội dung; xem19ảnh nhúng. Không chỉnh tài liệu/comment.
- Next dev hiện có: quan sát homepage/contact/business/detail ở1440px; đo intro14px/menu10px; contact có ba stack font; gallery trong6,5giây không đổi ảnh/caption. Không dùng việc chờ6,5giây một mình để kết luận autoplay: source cũng chỉ có selection bằngclick.
- Dev interactive popup không cho kết quả quan sát được trong lượt thao tác này; không ghi là runtime pass. Popup được đối chiếu source và kiểm trực tiếp trên Worker đang public.
- Worker browser: mở popupA.11, thấy action vẫn dưới facts/tổng395m² riêng/link sơ đồ/note; đổi floor3→23căn, filterarea; D.20→D.21 đúng URL/title; B.11 có205m² và10×20,5m; mobile390px document scrollWidth390. Không sửa occupancy để tạo mẫu cho các trạng thái khác.
- Public API Worker HTTP200,6floors/81units. Chạy module dữ liệu source bằng Node/tsx:80căn códimensions, chỉF.2thiếu. Đây là dữ liệu brochure tham khảo, không chứng nhận đo đạc.
- Homepage local/Worker/domain đều HTTP200 nhưng nội dung khác nhau. Không kiểm đăng nhập CMS hoặc gửi form live; không tạo lead, không sửaDB, không gọi paid upgrade.
- Không chạy lại full tests/build vì đây là audit/plan, không sửa executable code.

## 7. Nguồn quota và giới hạn

Đọc lại nguồn chính thức trong phiên17/10/2026:

- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): Standard10GB-month/tháng,1triệuClassA,10triệuClassB; averaging daily peak storage; requests có phí riêng.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free100.000requests/ngày,10msCPU/request,128MB/isolate; CPUkhácwalltime; quá hạn có thể1102.
- [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/): email thông báo theo ngưỡng, **không pause/capusage**; chỉ khả dụng trên loạiaccount được hỗ trợ.

Nguồn repo cho đối chiếu, không tự xem là bằng chứng cấu hình nền tảng hiện tại: [backend readiness](../backend-readiness.md), [storage quota](../storage-quota.md), [Cloudflare research](../cloudflare-free-tier-research.md), [Neon research](../neon-free-tier-research.md). Các tài liệu có phần lịch sử; phần nào mô tả staticexport/Pages/nhánhDB cũ phải cập nhật khi soạn phụ lục chính thức.
