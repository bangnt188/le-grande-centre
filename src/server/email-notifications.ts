import "server-only";
import { assertSameOrigin, requireAdmin } from "./auth";
import { requireAdministrator } from "./admin-session";
import { adminErrorResponse } from "./admin-http";
import { WorkspaceError, withAdminTransaction } from "./database";
import { isEmailNotificationSettings } from "../shared/admin/email-notifications";

const headers = { "Cache-Control": "private, no-store" };
const remoteErrors: Record<string, string> = {
  email_disabled: "Chưa cấu hình dịch vụ gửi email trên Render. Cần Cloudflare Email Account ID và API Token tại máy chủ bot.",
  email_not_configured: "Chủ bot cần cấu hình địa chỉ gửi và Reply-To trước khi xác minh.",
  email_not_verified: "Domain gửi hoặc email nhận chưa được Cloudflare xác minh.",
  email_verification_failed: "Cloudflare chưa xác minh được email. Kiểm tra quyền API Token, domain và hộp thư nhận rồi thử lại.",
  email_configuration_changed: "Cấu hình email đã thay đổi. Tải lại dữ liệu trước khi lưu hoặc xác minh.",
  invalid_request: "Danh sách email không hợp lệ. Nhập tối đa 20 địa chỉ email khác nhau.",
};

async function readBoundedJson(message: Request | Response, maximum: number): Promise<unknown> {
  if (Number(message.headers.get("content-length")) > maximum) throw new WorkspaceError("Nội dung yêu cầu quá lớn.", 413);
  const reader = message.body?.getReader();
  if (!reader) throw new WorkspaceError("Thiếu nội dung JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new WorkspaceError("Nội dung yêu cầu quá lớn.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new WorkspaceError("JSON không hợp lệ."); }
}

export async function handleEmailNotificationSettings(request: Request, verify = false): Promise<Response> {
  try {
    if (request.method !== "GET") assertSameOrigin(request);
    const identity = await requireAdmin(request);
    requireAdministrator(identity);
    if (new URL(request.url).search) throw new WorkspaceError("Tham số truy vấn không hợp lệ.");
    // This deployment's service key belongs only to the public Le Grande property.
    await withAdminTransaction(identity, async client => {
      const property = await client.query("SELECT id FROM leasing.properties WHERE id=$1 AND code='le-grande-centre'", [identity.propertyId]);
      if (!property.rowCount) throw new WorkspaceError("Không có quyền cấu hình thông báo cho dự án này.", 403);
    });
    let body: { expectedRevision: string; recipients?: string[] } | undefined;
    if (request.method !== "GET") {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new WorkspaceError("Cần gửi JSON.", 415);
      const input = await readBoundedJson(request, 8192);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new WorkspaceError("Nội dung yêu cầu không hợp lệ.");
      const value = input as Record<string, unknown>;
      if (Object.keys(value).some(key => key !== "expectedRevision" && (verify || key !== "recipients"))
        || typeof value.expectedRevision !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.expectedRevision)) throw new WorkspaceError("Thiếu phiên bản cấu hình email hợp lệ.");
      body = { expectedRevision: value.expectedRevision };
      if (!verify) {
        if (!Array.isArray(value.recipients) || value.recipients.length > 20
          || !value.recipients.every(item => typeof item === "string" && item.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.trim()))) throw new WorkspaceError(remoteErrors.invalid_request);
        body.recipients = [...new Set(value.recipients.map(item => item.trim().toLowerCase()))];
      }
    }
    const endpoint = process.env.NOTIFICATIONS_URL, key = process.env.NOTIFICATIONS_API_KEY;
    if (!endpoint || !key) throw new WorkspaceError("Chưa cấu hình kết nối máy chủ thông báo.", 503);
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/v1/notifications") throw new WorkspaceError("Kết nối máy chủ thông báo không hợp lệ.", 503);
    url.pathname = verify ? "/v1/email-settings/verify" : "/v1/email-settings";
    let response: Response;
    try {
      response = await fetch(url, {
        method: verify ? "POST" : request.method,
        headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "manual", signal: AbortSignal.timeout(40_000), cache: "no-store",
      });
    } catch { throw new WorkspaceError("Không kết nối được máy chủ thông báo. Thử tải lại sau.", 503); }
    if (!response.ok) {
      let code = "";
      try {
        const error = await readBoundedJson(response, 16384);
        if (error && typeof error === "object" && "error" in error && typeof error.error === "string") code = error.error;
      } catch { /* Never expose upstream response bodies or credentials. */ }
      const message = response.status === 404 ? "Máy chủ thông báo chưa phát hành API cấu hình email. Cần cập nhật bot trước khi sử dụng."
        : response.status === 401 || response.status === 403 ? "Kết nối máy chủ thông báo không được cấp quyền. Kiểm tra website API key tại máy chủ."
        : remoteErrors[code] ?? "Máy chủ thông báo chưa xử lý được yêu cầu. Thử tải lại sau.";
      throw new WorkspaceError(message, response.status === 409 ? 409 : response.status === 400 ? 400 : 503);
    }
    let settings: unknown;
    try { settings = await readBoundedJson(response, 16384); }
    catch { throw new WorkspaceError("Máy chủ thông báo trả dữ liệu không hợp lệ.", 503); }
    if (!isEmailNotificationSettings(settings)) throw new WorkspaceError("Máy chủ thông báo trả cấu hình email không hợp lệ.", 503);
    return Response.json({
      revision: settings.revision, from: settings.from, replyTo: settings.replyTo,
      senderVerifiedAt: settings.senderVerifiedAt, providerConfigured: settings.providerConfigured,
      dailyLimit: settings.dailyLimit,
      recipients: settings.recipients.map(({ email, verifiedAt }) => ({ email, verifiedAt })),
    }, { headers });
  } catch (error) { return adminErrorResponse(error); }
}
