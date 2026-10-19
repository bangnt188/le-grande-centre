# Vercel Serverless và source maps

> Tài liệu tham khảo kỹ thuật chung cho ứng dụng chạy trên Vercel Functions, không phải cấu hình hoặc runbook phát hành của Le Grande Center.
> Owner xác nhận dự án hiện không triển khai trên Vercel; release target là Cloudflare Worker stage2.

## Kết luận

- Vercel Functions chạy mã server đã build; source map phục vụ đọc stack trace/debug, không phải thành phần bắt buộc để Function chạy.
- Phân biệt browser map và server map. Next.js tắt **browser source maps trong production** mặc định; `productionBrowserSourceMaps` bật xuất và tự serve `.map` cạnh JavaScript.
- Với Next.js trên Vercel, `experimental.serverSourceMaps: true` tạo server maps lúc build; `NODE_OPTIONS=--enable-source-maps` yêu cầu Node.js dùng chúng để resolve stack trace runtime. Hai cài đặt riêng biệt.
- Vercel khuyến nghị `serverSourceMaps: process.env.VERCEL_ENV !== 'production'` nếu muốn stack trace có source ở Preview nhưng không muốn maps nằm trong Production artifact. Vercel Protected Source Maps chỉ giới hạn browser `.map`; không áp dụng cho server maps trong build artifact, inline maps, hoặc maps tải lên error tracker. Điều đó không có nghĩa browser có thể tải trực tiếp server maps.
- Không có source map không làm serverless an toàn hơn theo nghĩa xác thực/phân quyền. Không bật browser maps công khai nếu không cần; quyết định riêng việc tạo server maps theo yêu cầu debug và mức chấp nhận đưa maps vào artifact.

## Phạm vi trong repo này

Repo dùng Next.js output standalone và OpenNext/Cloudflare Worker. Các thiết lập source map dành cho Vercel Functions dưới đây chỉ áp dụng nếu một ứng dụng khác thực sự chạy trên Vercel; chúng không mô tả cấu hình, hosting hay release hiện tại của Le Grande Center. Không dùng domain response/header làm deployment evidence. Xem deployment runbook tại deployment.md.

## Nguồn chính thức

- [Next.js `productionBrowserSourceMaps`](https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps): browser source maps production bị tắt mặc định; khi bật sẽ được xuất và tự serve cạnh JavaScript.
- [Vercel Protected Source Maps](https://vercel.com/docs/deployment-protection/protected-source-maps): khi bật, browser `.map` bị giới hạn theo Vercel Authentication; mặc định bật cho project mới, project cũ cần opt-in. Server-side maps dùng bởi Vercel Functions không thuộc phạm vi tính năng này.
- [Structured application logs for Vercel Functions](https://vercel.com/kb/guide/add-structured-application-logs-to-vercel-functions): `experimental.serverSourceMaps` tạo server maps; Node chỉ resolve stack traces qua maps khi bật `NODE_OPTIONS=--enable-source-maps`; khuyến nghị không đưa maps vào Production artifact nếu không cần.
- [Vercel Build Output API: Primitives](https://vercel.com/docs/build-output-api/primitives): `shouldAddSourcemapSupport` điều khiển hỗ trợ map cho stack traces Node trong Build Output API; mặc định `false`.
- [Vercel Functions runtimes](https://vercel.com/docs/functions/runtimes): các runtime và cách Vercel chuyển source code thành Function.
- [Vercel sensitive environment variables](https://vercel.com/docs/cli/secrets): đánh dấu secrets là sensitive để giá trị không đọc lại được từ dashboard/CLI và được redacted trong build logs theo điều kiện tài liệu nêu.
