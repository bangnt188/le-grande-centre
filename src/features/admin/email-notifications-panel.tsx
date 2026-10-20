"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AdminPanel, Alert, Badge, Button, TextareaField } from "@mall/ui";
import type { ToastTone } from "@mall/ui";
import { isEmailNotificationSettings } from "@/shared/admin/email-notifications";
import type { EmailNotificationSettings } from "@/shared/admin/email-notifications";
import { AdminEditor } from "./admin-editor";
import { makeCacheKey, screenCache } from "./memory-cache";
import { AdminSessionError, adminRequest, ensureSession, getSessionSnapshot, useAdminSession } from "./session";
import type { AdminSession } from "./session";
import type { AdminData } from "./use-admin-data";
import styles from "./staff-accounts.module.css";
import records from "./admin-records.module.css";

type Props = { data: AdminData; onMessage: (message: string, tone?: ToastTone) => void };
const endpoint = "/api/admin/notifications/email/";
const identityOf = (session: AdminSession | null) => session ? JSON.stringify([session.actorId, session.propertyId, session.role]) : "";

async function readSettings(response: Response): Promise<EmailNotificationSettings> {
  const value: unknown = await response.json();
  if (!isEmailNotificationSettings(value)) throw new Error("Dữ liệu cấu hình email không hợp lệ. Hãy tải lại.");
  return value;
}

export function EmailNotificationsPanel(props: Props) {
  const session = useAdminSession();
  const [error, setError] = useState("");
  if (session?.role === "administrator") return <EmailNotificationsContent key={identityOf(session)} identity={identityOf(session)} {...props}/>;
  return <AdminPanel className={`records-panel ${styles.panel}`}>
    <div className={styles.heading}><h2>Thông báo email</h2></div>
    <Alert tone="error">{error || (session ? "Chỉ Administrator được quản lý thông báo email." : "Phiên quản trị đã hết hạn. Tải lại để tiếp tục.")}</Alert>
    {!session && <Button variant="secondary" onClick={() => { void ensureSession({ userAction: true }).catch(issue => setError(issue instanceof Error ? issue.message : "Không thể khôi phục phiên quản trị.")); }}>Tải lại cấu hình email</Button>}
  </AdminPanel>;
}

function EmailNotificationsContent({ data, onMessage, identity }: Props & { identity: string }) {
  const key = makeCacheKey(identity, "", "email-notifications");
  const cacheVersion = useSyncExternalStore(screenCache.subscribe, screenCache.getVersion, screenCache.getVersion);
  const [result, setResult] = useState<{ version: number; settings: EmailNotificationSettings } | null>(null);
  const [failure, setFailure] = useState("");
  const [actionError, setActionError] = useState("");
  const [editing, setEditing] = useState<EmailNotificationSettings | null>(null);
  const [pending, setPending] = useState<"save" | "verify" | "reload" | null>(null);
  const lock = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const initialRead = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    initialRead.current = controller;
    setFailure("");
    screenCache.load(key, async signal => {
      const settings = await readSettings(await adminRequest(endpoint, {}, { signal }));
      // The cache's numeric metadata is not the remote, opaque configuration CAS revision.
      return { revision: 0, settings };
    }, controller.signal).then(value => {
      if (!controller.signal.aborted && cacheVersion === screenCache.getVersion() && identityOf(getSessionSnapshot()) === identity) setResult({ version: cacheVersion, settings: value.settings });
    }).catch(issue => {
      if (!controller.signal.aborted && cacheVersion === screenCache.getVersion() && identityOf(getSessionSnapshot()) === identity) setFailure(issue instanceof Error ? issue.message : "Không tải được cấu hình email. Hãy thử tải lại.");
    });
    return () => controller.abort();
  }, [identity, key, cacheVersion]);
  const settings = result?.version === cacheVersion ? result.settings : null;
  const loading = !settings && !failure;
  const busy = !!pending || data.pending;
  const current = (controller: AbortController) => !controller.signal.aborted && identityOf(getSessionSnapshot()) === identity;

  async function reload() {
    const controller = lifetime.current;
    if (!controller || lock.current || data.pending) return false;
    lock.current = true; setPending("reload");
    initialRead.current?.abort();
    try {
      await ensureSession({ userAction: true });
      if (!current(controller)) return false;
      if (!editing) setActionError("");
      setFailure("");
      const saved = await readSettings(await adminRequest(endpoint, {}, { userAction: true, signal: controller.signal }));
      if (!current(controller)) return false;
      screenCache.set(key, { revision: 0, settings: saved }, 0);
      setResult({ version: screenCache.getVersion(), settings: saved });
      return true;
    } catch (issue) {
      if (current(controller)) setFailure(issue instanceof Error ? issue.message : "Không tải lại được cấu hình email.");
      return false;
    } finally {
      lock.current = false;
      if (current(controller)) setPending(null);
    }
  }
  async function openEditor() {
    const controller = lifetime.current;
    if (!controller || !settings || lock.current || data.pending) return;
    try {
      await ensureSession({ userAction: true });
      if (!current(controller)) return;
      setActionError("");
      setEditing(settings);
    } catch (issue) {
      if (current(controller)) setActionError(issue instanceof Error ? issue.message : "Không mở được cấu hình email.");
    }
  }
  async function mutate(mode: "save" | "verify", form?: FormData) {
    const controller = lifetime.current;
    const source = mode === "save" ? editing : settings;
    if (!controller || !source || lock.current || data.pending) return false;
    lock.current = true; setPending(mode); setActionError("");
    try {
      await ensureSession({ userAction: true });
      if (!current(controller)) return false;
      const recipients = mode === "save" ? String(form?.get("recipients") ?? "").split(/\r?\n/).map(email => email.trim()).filter(Boolean) : undefined;
      const saved = await readSettings(await adminRequest(mode === "verify" ? `${endpoint}verify/` : endpoint, {
        method: mode === "verify" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: source.revision, ...(mode === "save" ? { recipients } : {}) }),
      }, { signal: controller.signal }));
      if (!current(controller)) return false;
      screenCache.set(key, { revision: 0, settings: saved }, 0);
      setResult({ version: screenCache.getVersion(), settings: saved });
      setFailure("");
      if (mode === "save") onMessage(saved.recipients.length ? "Đã lưu danh sách nhận thông báo. Địa chỉ chưa xác minh chưa đủ điều kiện nhận email." : "Đã xóa danh sách nhận và tắt thông báo email.");
      else onMessage("Đã cập nhật trạng thái xác minh từ nhà cung cấp. Xem kết quả người gửi và từng người nhận; thao tác này không gửi email thử.", "info");
      return true;
    } catch (issue) {
      if (current(controller)) setActionError(issue instanceof AdminSessionError && issue.status === 409
        ? "Cấu hình đã thay đổi ở nơi khác. Bản nháp được giữ nguyên; sao chép danh sách nếu cần, đóng biểu mẫu rồi tải lại và mở lại trước khi lưu."
        : issue instanceof Error ? issue.message : "Không cập nhật được cấu hình email. Thông tin chưa được xác nhận lưu.");
      return false;
    } finally {
      lock.current = false;
      if (current(controller)) setPending(null);
    }
  }
  const verifiedCount = settings?.recipients.filter(recipient => recipient.verifiedAt !== null).length ?? 0;
  const ready = !!settings?.providerConfigured && !!settings.from && !!settings.senderVerifiedAt && !!settings.recipients.length && verifiedCount === settings.recipients.length;
  return <AdminPanel className={`records-panel ${styles.panel}`}>
    <div className={styles.heading}>
      <div><h2>Thông báo email</h2><p>Chọn email nhân viên nhận thông báo khi website tiếp nhận yêu cầu mới. Danh sách này độc lập với tài khoản nhân viên và email liên hệ công khai trên website.</p></div>
      <Button disabled={busy || !settings || !!editing} aria-haspopup="dialog" onClick={() => void openEditor()}>Sửa danh sách nhận</Button>
    </div>
    <div className={records.filters}>
      <Button variant="secondary" disabled={busy} onClick={() => void reload()}>Tải lại cấu hình email</Button>
      <Button variant="secondary" disabled={busy || !settings?.providerConfigured || !!editing} loading={pending === "verify"} loadingLabel="Đang kiểm tra…" onClick={() => void mutate("verify")}>Kiểm tra xác minh</Button>
    </div>
    {failure && <Alert tone="error">Không tải được cấu hình thông báo email. {failure}</Alert>}
    {actionError && !editing && <Alert tone="error">{actionError}</Alert>}
    {loading && <p role="status" className={styles.loading}>Đang tải cấu hình thông báo email…</p>}
    {settings && <>
      {!settings.providerConfigured && <Alert tone="warning">Chưa kết nối dịch vụ gửi email. Chủ bot cần hoàn tất cấu hình nhà cung cấp tại Render; màn hình này không lưu khóa dịch vụ. Lưu người nhận không tự bật dịch vụ gửi.</Alert>}
      <div className={styles.listSection}>
        <div className={styles.heading}><h3>Người gửi và trạng thái</h3><Badge tone={ready ? "success" : settings.recipients.length ? "warning" : "neutral"}>{!settings.recipients.length ? "Đã tắt · chưa có người nhận" : ready ? "Cấu hình đã xác minh" : !settings.providerConfigured ? "Dịch vụ gửi chưa sẵn sàng" : !settings.from || !settings.senderVerifiedAt ? "Người gửi chưa xác minh" : `Người nhận: ${verifiedCount}/${settings.recipients.length} đã xác minh`}</Badge></div>
        <dl className={records.floorMobileFacts}>
          <div><dt>Email người gửi (From)</dt><dd>{settings.from || "Chưa cấu hình"}<Badge tone={settings.from && settings.senderVerifiedAt ? "success" : "warning"}>{settings.from && settings.senderVerifiedAt ? "Đã xác minh người gửi" : "Chưa xác minh người gửi"}</Badge>{settings.senderVerifiedAt && <span className={records.secondary}>Lần xác minh: <time dateTime={settings.senderVerifiedAt}>{new Date(settings.senderVerifiedAt).toLocaleString("vi-VN")}</time></span>}</dd></div>
          <div><dt>Email trả lời (Reply-To)</dt><dd>{settings.replyTo || "Chưa cấu hình riêng"}</dd></div>
          <div><dt>Giới hạn lượt gửi mỗi ngày (UTC)</dt><dd>{settings.dailyLimit}</dd></div>
        </dl>
        <p>Người gửi, địa chỉ trả lời và giới hạn do chủ bot quản lý. Đã xác minh chỉ phản ánh kết quả kiểm tra cấu hình, không cam kết thư đã gửi hoặc vào hộp thư đến.</p>
      </div>
      <div className={styles.listSection}>
        <div className={styles.heading}><h3>Nhân viên nhận thông báo ({settings.recipients.length}/20)</h3><span>{verifiedCount} địa chỉ đã xác minh</span></div>
        {!settings.recipients.length ? <div className={styles.empty}><p>Chưa có email nhận thông báo.</p><span>Thêm tối đa 20 địa chỉ để cấu hình. Danh sách trống nghĩa là tắt kênh email, không ảnh hưởng thông báo Zalo.</span></div> : <ul className={styles.list}>{settings.recipients.map(recipient => <li key={recipient.email} className={styles.item}>
          <div className={styles.accountInfo}><strong className={styles.accountEmail}>{recipient.email}</strong><Badge tone={recipient.verifiedAt ? "success" : "warning"}>{recipient.verifiedAt ? "Đã xác minh" : "Chưa xác minh"}</Badge></div>
          {recipient.verifiedAt && <time className={records.secondary} dateTime={recipient.verifiedAt}>{new Date(recipient.verifiedAt).toLocaleString("vi-VN")}</time>}
        </li>)}</ul>}
        <p>Mọi địa chỉ trong danh sách và domain gửi phải được Cloudflare xác minh trước khi nhận thông báo mới. Nếu còn địa chỉ chưa xác minh, kênh email tiếp tục chờ; Zalo không bị chặn. Chủ bot đăng ký địa chỉ tại Cloudflare, nhân viên xác nhận trong hộp thư rồi chọn Kiểm tra xác minh. Thao tác này không gửi thư thử.</p>
      </div>
    </>}
    {editing && <AdminEditor data={{ ...data, loading: false, pending: busy, error: actionError, reload }} title="Danh sách nhận thông báo email" description="Chỉ sửa người nhận thông báo nội bộ; không sửa tài khoản nhân viên, email công khai hay người gửi." onClose={() => { setEditing(null); setActionError(""); }} onSave={form => mutate("save", form)}>
      <TextareaField id="notification-email-recipients" name="recipients" label="Email nhân viên — mỗi dòng một địa chỉ" rows={10} maxLength={5120} defaultValue={editing.recipients.map(recipient => recipient.email).join("\n")} autoComplete="off" autoCapitalize="none" spellCheck={false}/>
      <p>Tối đa 20 địa chỉ. Hệ thống chuẩn hóa và bỏ địa chỉ trùng khi lưu. Xóa hết nội dung để tắt thông báo email; kênh Zalo không thay đổi.</p>
      <p>Địa chỉ mới cần được chủ bot đăng ký tại Cloudflare và nhân viên xác nhận trong hộp thư. Lưu danh sách không gửi thư xác minh hoặc thư thử.</p>
    </AdminEditor>}
  </AdminPanel>;
}
