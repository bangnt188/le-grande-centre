# Form liên hệ và section từ website cũ

Cập nhật 14/10/2026: contact/callback đã chuyển sang **live intake**, thay quyết định UI-only/demo ngày 08/10. Không còn random success hoặc tuyên bố mô phỏng đã gửi lead.

## Form và trust boundary

`ProjectContact` ghép `ContactForm`; fields dùng public exports `@mall/ui`. App giữ business validation/focus/reset trong `contact-model.ts` và `use-contact-form.ts`; shared `SurveyForm`/`useSurveySubmission` giữ submission state, Toast và UX cooldown. Adapter chọn `mode: live`, gọi `createContactSubmitter` → cùng origin `POST /api/contact`.

Họ tên, doanh nghiệp, điện thoại, email, loại hình, diện tích, thời gian thuê, căn quan tâm và ghi chú là nhu cầu khách cung cấp; consent không tick sẵn. Visit intent thêm ngày/giờ mong muốn, không phải availability đã xác nhận. Validation lỗi không submit; gửi lỗi giữ dữ liệu, thành công reset và giữ ngữ cảnh căn. Không lưu PII/draft trong browser storage. Shared local-storage key `legrande:contact-live-rate-limit:v1` chỉ lưu timestamps/cooldown UX (maxSuccesses 1), không persistence lead và không là backend anti-abuse authority.

Server `src/app/api/contact/route.ts` + `src/server/public.ts`:

- Same-origin guard; JSON content type, stream cap 16 KiB, UTF-8/field/consent validation.
- UUID idempotency header; retry cùng payload reuse key, different payload không reuse receipt. Client chỉ reset receipt attempt sau `{accepted: true}`.
- Unit ID đối chiếu public DB catalog; pair chỉ hợp lệ shophouse A/B. Không nhận diện tích/tầng/geometry từ query làm dữ liệu chuẩn.
- HMAC IP với server-only `CONTACT_RATE_LIMIT_SECRET`; deployed ingress phải bảo đảm `cf-connecting-ip` từ proxy tin cậy. Local requests không có IP header dùng bucket `local`, không chứng minh rate policy phân biệt clients production.
- DB transaction/property lock, durable intake payload hash/receipt, cooldown một request/5 phút và tối đa 20/24h theo hash; retry receipt trước rate check không tạo lead trùng. Không lưu raw IP như application identity.
- Commit lead/intake + audit/revision rồi trả HTTP 201 `{accepted: true}`. Visit request **không tạo appointment hoặc booking đã xác nhận**, không tự tạo company giả. Nhân viên xử lý lead và tạo/xác nhận lịch trong workflow riêng.

Không có Turnstile/Siteverify, email notification hoặc cam kết abuse protection toàn diện trong implementation này. Không yêu cầu thêm provider/domain/DNS để hoàn tất code; domain cutover đã được người dùng hoãn.

## Public projection và ngữ cảnh căn

Root public SSR đọc `readPublicWebsite()`; contact options/catalog lấy DB projection, không IndexedDB/fixture fallback. Company/customer contact nội bộ, hold expiry và hợp đồng không được gửi ra public. Mã căn hợp lệ từ `/lien-he/?unit=C.12` điền ngữ cảnh và nhu cầu diện tích; không coi hướng mặt ngoài brochure là hướng cửa đã khảo sát. Mã không hợp lệ giữ form chung, không phản chiếu chuỗi tùy ý thành dự án thật. CTA visit giữ intent/date/time mong muốn, không xác nhận còn trống hoặc đặt lịch thành công.

## Section và file legacy

Giữ menu/kiến trúc component đã chốt; public không hiển thị hướng dẫn triển khai/nguồn nhập nội dung. Không nhúng raw HTML/script từ website cũ.

- `InvestorLetter` nhận copy/ảnh nền, title/emphasis vàng, divider, trích dẫn/chữ ký trình bày từ nguồn cũ. Không phải tính năng ký hợp đồng.
- `project-document-model.ts` giữ group/download contract; `ProjectDocuments` nhận props, file có URL thật mới có link. Tệp chưa có ghi rõ chờ, không URL giả.
- Route Tổng quan ghép `legacy-content.ts`; nguồn/checksum lịch sử tại `public/client-reference/legacy/SOURCE.md`. Public files hiện được phục vụ từ R2; không dùng bucket tài liệu private cho download brochure.

Kết quả khảo sát nguồn **08/10/2026** (không phải fetch lại trong lần cập nhật này):

| Tài liệu | Kết quả nguồn lúc khảo sát | Cách dùng |
| --- | --- | --- |
| Brochure | URL website cũ 404 | Dùng brochure 17 trang đã có, hash khớp nguồn sơ đồ |
| Sơ đồ | 200 nhưng bytes/hash trùng brochure | Brochure mở đúng trang; không gọi là technical plan độc lập |
| Quyết định | 200 application/pdf, 2 trang | Giữ nguyên public document đã duyệt |
| Giấy phép XD | 404 | Chờ file đúng; không tạo broken link |

Download file không xác nhận tình trạng pháp lý ngoài nội dung của file. Stock background từ site cũ là trang trí, không phải ảnh công trình. Website không có viewer 3D từ 13/10/2026; cảnh homepage 2D/brochure không biến thành surveyed geometry.

## Bằng chứng và giới hạn

Browser local real-cloud phase2 đã POST `/api/contact` 201 và tạo lead/intake DB, không appointment. Kết quả demo/visual checks ngày 08/10 chỉ là lịch sử UI, không bằng chứng backend production. Test auth fixture emailVerified không chứng minh email OTP delivery. Lần chỉnh docs này không chạy build/test hoặc browser smoke mới.

Next dùng SSR/standalone/OpenNext, không static export/Pages. Owner xác nhận dự án không triển khai trên Vercel; release target hiện tại là Cloudflare Worker stage2. Xem [deployment runbook](deployment.md) để ghi nhận version/source SHA/runtime DB. Native Worker→Neon S3/Functions còn 403 HTML trước provider, không claim all-Worker media ready. [Backend readiness](backend-readiness.md) ghi ranh giới proof và giới hạn. Public/form không đọc opaque browser snapshots khi DB lỗi.
