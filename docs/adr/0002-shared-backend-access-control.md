# Architecture Decision — Thư viện backend xác thực và phân quyền

Trạng thái kiến trúc ghi ngày 14/10/2026: shared library có primitives và Mall đã có adapter Neon Auth/PostgreSQL thật. Đây không còn đề xuất chọn Vercel/auth provider. Lần cập nhật ADR đó không ghi nhận source SHA/cutover. Owner xác nhận dự án không triển khai trên Vercel; release target hiện tại là Cloudflare Worker stage2. Xem [deployment runbook](../deployment.md) và [readiness](../backend-readiness.md) cho bằng chứng release/runtime.

## Shared core

`packages/backend` (`@shared/backend`) độc lập React/app, không Redis/filesystem/global permission state. Web Request interface hỗ trợ managed runtime. Core cung cấp access/policy, CRUD/SQL/transaction contracts, HTTP/validation, crypto và generic storage; app giữ business schema/workflows, session, role mapping, audit và runtime. Orbit là nguồn nghiên cứu, không backend clone: [research](../orbit-auth-research.md).

`createAccessBackend({verifySession, loadPrincipal, recordDecision})` và `requireAccess(request, {permission, resource})` dùng resource từ DB, không tin client tenant/property/org/owner. Permission stable `resource:action`, không UI label. Grant deny ưu tiên; scopes là điều kiện đồng thời, nhiều allows là lựa chọn riêng, không trộn dimensions giữa grants để mở rộng quyền. Không wildcard/superadmin bypass trong engine.

Collection scope phải áp dụng trước count/paging; object guard không tự thêm SQL predicates. Deny giao collection có thể chặn collection; partial result cần projection/query được kiểm chứng. Không gửi toàn workspace rồi ẩn React. Audit policy decision không là bằng chứng command đã commit; outcome audit phải trong transaction.

## Mall adapter hiện tại

- `/admin/` dùng email + mật khẩu qua Neon Auth, không Google OAuth. Admin/root cấp staff email và role Admin/Editor trong app; nhân viên tạo mật khẩu rồi xác minh email. Signup tự nó không cấp quyền.
- `src/server/database.ts` ánh xạ email đã xác minh qua allowlist/assignment. Role Editor không quản lý tài khoản hoặc sửa cấu hình vận hành; admin/root quản lý staff trong `/admin/`. Root có toàn bộ quyền app, dùng allowlist riêng, bị ẩn khỏi projections/list nhân viên.
- Migrations 005–006 tách và cấp root password-only. Migration 007 thêm Editor/staff management; ghi chú “chỉ có trong source” mô tả trạng thái tại lần cập nhật ADR, không phải trạng thái schema hiện hành. Đối chiếu migrations đã áp dụng trong [database guide](../../database/README.md) trước release. Root không phải operator của Neon/project; schema role `leasing/legal/finance/operations` không đồng nghĩa workflows đã triển khai.
- Neon request-local Pool, `leasing_runtime`, actor context/RLS; command parser, property lock/CAS, receipt và audit gắn transaction. Public có projection riêng, không tenant/contact/hold/private documents.
- Media resolve ownership/key DB; PDF quarantine/manual external review và GET/HEAD/Range cùng session guard. Không tự viết password hashing, JWT protocol, MFA hay gọi manual review là antivirus-clean/signature.
Không browser demo login, role switch hoặc IndexedDB fallback. Secrets chỉ server; static Pages không chạy admin/API.

Baseline + migrations 001–006 đã áp dụng trên stage2 và production tại thời điểm ADR được cập nhật; migration 007 khi đó chưa áp dụng. Đây là bằng chứng lịch sử, không phải schema/UI trạng thái hiện tại; xem [database guide](../../database/README.md) và [deployment runbook](../deployment.md). Root `root@legrandecentre.vn` được operator cấp/xác minh theo yêu cầu owner; root Google cũ đã thu hồi. Production không có dữ liệu khách hàng/tài chính giả. Local production-backed root password login → workspace 200 (6 tầng/81 slot), reload giữ session, logout → API 401 đã quan sát. Không phải proof email delivery hoặc Cloudflare deployment.

## Security và trade-off

Fail closed khi session/principal/scope/audit lỗi; không cache permission xuyên request chỉ bằng TTL. Sensitive mutation phải kiểm tra lại assignment/state dưới khóa transaction. Threats: IDOR, forged scope/role, revoked session reuse, broad admin bypass, leaked fields và stale writes. Trusted session, DB-owned resources, exact policy, scoped projection, transaction guard/RLS và audit giải quyết từng boundary, không tự suy mọi endpoint dùng generic engine là đã đúng.

Crypto generic dùng AES-256-GCM/Web Crypto với tenant/record/field context và key ID; không copy 3DES/Redis từ nguồn cũ. Backend compromise vẫn lộ plaintext khi có runtime keys; KMS chỉ khi custody thực sự cần. Không tự thêm KMS vào Mall chỉ vì thư viện có thể mở rộng.

Core nhỏ dễ thay provider nhưng app phải giữ invariants và identity mapping. Auth provider migration không chỉ copy cookies/emailVerified. Transfer gồm schema/migrations/relational data + object keys/catalog/verified metadata, không opaque snapshots.

## Runtime và kiểm chứng

Next SSR standalone và OpenNext thay static export. Native Worker→Neon S3/Functions còn 403 HTML trước provider dù Node works; không claim all-Worker media ready. Owner xác nhận dự án không triển khai trên Vercel; Worker stage2 là release target, xem [deployment runbook](../deployment.md) để đối chiếu release/version/DB. CI chỉ shared integrity/types/pure tests và application build, không fake live provider checks khi không có secrets. Không có verification mới trong lần sửa ADR này.

Tham khảo: [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [shared integration](../../packages/backend/docs/integration.md), [portability](../../packages/backend/docs/portability.md), [app adapters ADR](0003-shared-backend-app-adapters.md).
