# Architecture Decision — Backend core dùng chung Mall và Solar

Ngày quyết định 07/10/2026; cập nhật kiến trúc gần nhất 14/10/2026: Mall đã có adapter Neon Auth/PostgreSQL/media thật và Next SSR/OpenNext. Tại lần cập nhật ADR, source SHA/cutover production chưa được xác minh. Owner xác nhận dự án không triển khai trên Vercel; release target hiện tại là Worker stage2, xem [deployment runbook](../deployment.md). Không giữ Pages static hoặc backend riêng như phương án cũ.

## Thiết kế

Repo `lib-ts-be` duy trì `@shared/backend`; Mall và Solar dùng submodule `packages/backend`, mỗi app ghim commit đã review. Core không dependency runtime hoặc cache quyền xuyên request; giữ operation authorization, query selection, SQL parameterization, validation, transport và crypto. App giữ schema, session/staff mapping, B2B transitions, audit và deploy.

Mall dùng `createCrud`/`createPostgresRepository` của shared BE cho list/create/update/delete của doanh nghiệp, lead và lịch hẹn. `src/server/admin-crud.ts` ghép scope theo property, quyền theo role đã xác minh, row-version CAS và soft-delete; adapter doanh nghiệp giữ quan hệ organization/brand/contact, adapter lịch hẹn giữ kiểm tra trùng khung giờ. Xóa doanh nghiệp/lead có lịch sử tham chiếu và lịch hẹn đã xác nhận/hoàn tất/không đến bị từ chối; public intake vẫn ghi lead trong một giao dịch domain riêng. Snapshot/command envelope vẫn nguyên vẹn; merge/split/lease/hold/media và xác nhận/hủy lịch tiếp tục là domain commands.

Solar có adapter/schema riêng; fixedScope chỉ phù hợp DB đơn tenant đã kiểm chứng. Không copy Solar tenant mapping/keyring hoặc giả định app khác tự có Mall policy. Mọi key/credential tách ứng dụng và môi trường.

## Security và trade-off

Threats gồm forged scope, cross-tenant/property/record reads, leaked count/fields, stale policy/write, lost audit và shared secrets. Scope áp dụng trước count/paging; Neon Auth session và active assignment được kiểm tra lại trong operation, assignment khóa tới commit. Policy-decision audit commit độc lập; outcome audit cùng transaction nghiệp vụ. CRUD CAS/tombstone không thay lease/hold/media invariants.

Migration `009-shared-backend-crud.sql` bổ sung row version cho company-property, lead và appointment cùng append-only policy-decision audit. Tại lần cập nhật ADR migration này chưa áp dụng; trạng thái migration hiện hành đối chiếu trong [database guide](../../database/README.md). Mỗi runtime DB cần được xác minh/migrate riêng trước khi app đọc CRUD services.

Adapter nhiều cấu hình hơn browser demo nhưng giữ business contract và portability. Gitlink/checksum chống drift; không update nhánh tự động trong build. Shared library fixtures/tests không là fallback runtime trong Mall.

## Migration và build

Build core trước consumer, đồng bộ dependency/lockfile. Giữ `npm run check:backend`, `typecheck:backend`, `test:backend` và handoff tarball integrity. App CI thêm full typecheck, pure admin boundaries và `build:cloudflare` (Next standalone + OpenNext), không live DB test/deploy khi không có CF/Neon secrets. Chỉ fetch packages/ui/backend, không archive 3D.

Baseline + migrations 001–004 áp dụng stage2/regression disposable và backend production tại thời điểm cập nhật ADR, seed chỉ approved 6 tầng/81 brochure slots, configured owner allowlist và verified Neon logo, không fake customer/financial records. Production Auth verification/OTP configured không chứng minh delivery/onboarding; source SHA production chưa được ghi nhận khi cập nhật ADR. Model transfer là schema+migrations, relational data và object keys/catalog với verified size/hash, không opaque snapshots hay presigned URLs.

Local Node real-cloud proof không chứng minh Worker media ready: native Worker fetch tới Neon S3/Functions còn 403 HTML trước provider. Trusted protected Neon origin có code nhưng chưa chứng minh sửa denial. Domain/DNS được hoãn tại thời điểm cập nhật ADR. Owner xác nhận không có Vercel deployment; trạng thái source SHA, Worker version và runtime DB xem [deployment runbook](../deployment.md). [Readiness](../backend-readiness.md) ghi bằng chứng cụ thể; không có build/test mới trong lần chỉnh ADR này.

Shared contracts: [application decision](../../packages/backend/docs/shared-applications.md), [submodule workflow](../../packages/backend/docs/submodules.md).
