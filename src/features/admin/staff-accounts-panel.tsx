"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AdminPanel, Alert, Badge, Button, Input, Select, type ToastTone } from "@mall/ui";
import { adminRequest, ensureSession, useAdminSession } from "./session";
import { makeCacheKey, screenCache } from "./memory-cache";
import { AdminEditor } from "./admin-editor";
import type { AdminData } from "./use-admin-data";
import styles from "./staff-accounts.module.css";

type StaffAccount = {
  id: string;
  email: string;
  role: "administrator" | "editor";
  status: "revoked" | "invited" | "active";
};
const roleLabels = { administrator: "Admin", editor: "Editor" } as const;
const statusLabels = { revoked: "Đã thu hồi", invited: "Chưa kích hoạt", active: "Đang hoạt động" } as const;
const statusTones: Record<StaffAccount["status"], "neutral" | "warning" | "success"> = { revoked: "neutral", invited: "warning", active: "success" };

export function StaffAccountsPanel({ data, onMessage }: { data: AdminData; onMessage: (message: string, tone?: ToastTone) => void }) {
  const session = useAdminSession();
  const identity = session ? JSON.stringify([session.actorId, session.propertyId, session.role]) : "";
  const key = makeCacheKey(identity, "", "staff");
  const cacheVersion = useSyncExternalStore(screenCache.subscribe, screenCache.getVersion, screenCache.getVersion);
  const [result, setResult] = useState<{ key: string; version: number; items: StaffAccount[] } | null>(null);
  const [editing, setEditing] = useState<{ account: StaffAccount | null } | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    setFailure(null);
    screenCache.load(key, async signal => {
      const response = await adminRequest("/api/admin/staff/", {}, { signal });
      const items: unknown = await response.json();
      if (!Array.isArray(items) || !items.every(item => item && typeof item.id === "string" && typeof item.email === "string" && (item.role === "administrator" || item.role === "editor") && (item.status === "active" || item.status === "revoked" || item.status === "invited"))) throw new Error("Dữ liệu tài khoản không hợp lệ.");
      return { items: items as StaffAccount[], revision: 0 };
    }, controller.signal).then(value => { if (!controller.signal.aborted) setResult({ key, version: cacheVersion, items: value.items }); }).catch(issue => { if (!controller.signal.aborted) setFailure({ key, message: issue instanceof Error ? issue.message : "Không tải được danh sách tài khoản." }); });
    return () => controller.abort();
  }, [identity, key, cacheVersion]);
  const accounts = result?.key === key && result.version === cacheVersion ? result.items : null;
  const error = actionError || (!identity ? "Phiên quản trị đã hết hạn. Thao tác để tiếp tục." : failure?.key === key ? failure.message : "");
  const loading = !!identity && !accounts && !error;
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); setActionError(""); change(); }
    catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác."); }
  }
  async function save(form: FormData) {
    if (lock.current || data.pending) return false;
    lock.current = true; setPending(true); setActionError("");
    try {
      const email = editing?.account?.email ?? String(form.get("email") ?? "");
      const role = String(form.get("role") ?? "editor");
      const response = await adminRequest("/api/admin/staff/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) }, { userAction: true });
      const saved: StaffAccount = await response.json();
      screenCache.markAllStale();
      onMessage(saved.status === "invited" ? "Đã cấp quyền. Nhân viên có thể tạo mật khẩu tại trang đăng nhập admin." : "Đã cập nhật vai trò tài khoản.");
      return true;
    } catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không lưu được tài khoản."); return false; }
    finally { lock.current = false; setPending(false); }
  }
  async function revoke(account: StaffAccount) {
    if (lock.current) return;
    lock.current = true; setPending(true);
    try {
      await adminRequest("/api/admin/staff/", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email }) }, { userAction: true });
      setActionError(""); screenCache.markAllStale(); onMessage(`Đã thu hồi quyền của ${account.email}.`);
    } catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không thu hồi được tài khoản."); }
    finally { lock.current = false; setPending(false); }
  }
  return <AdminPanel className={`records-panel ${styles.panel}`}>
    <div className={styles.heading}><div><h2>Tài khoản nhân viên</h2><p>Thêm email và chọn vai trò. Nhân viên tự tạo mật khẩu tại trang đăng nhập; tài khoản root được bảo vệ và ẩn khỏi danh sách này.</p></div><Button disabled={pending || data.pending} onClick={() => void action(() => setEditing({ account: null }))}>Thêm tài khoản</Button></div>
    {error && <Alert tone="error">{error}</Alert>}
    <div className={styles.listSection}><div className={styles.listHeader}><h3>Danh sách tài khoản {accounts && `(${accounts.length})`}</h3><Button variant="quiet" disabled={pending} onClick={() => void action(() => screenCache.markAllStale())}>Tải lại tài khoản</Button></div>
      {loading ? <p role="status" className={styles.loading}>Đang tải danh sách tài khoản…</p> : accounts?.length === 0 ? <div className={styles.empty}><p>Chưa có tài khoản nhân viên nào được cấp quyền.</p><span>Chọn Thêm tài khoản để phân quyền nhân viên mới.</span></div> : accounts && <ul className={styles.list}>{accounts.map(account => <li key={account.id} className={styles.item}><div className={styles.accountInfo}><strong className={styles.accountEmail}>{account.email}</strong><div className={styles.badges}><Badge tone={account.role === "administrator" ? "action" : "neutral"}>{roleLabels[account.role]}</Badge><Badge tone={statusTones[account.status]}>{statusLabels[account.status]}</Badge></div></div><div className={styles.actions}><Button variant={account.status === "revoked" ? "secondary" : "quiet"} disabled={pending || data.pending} onClick={() => void action(() => setEditing({ account }))}>{account.status === "revoked" ? "Cấp lại" : "Sửa vai trò"}</Button>{account.status !== "revoked" && <Button variant="quiet" disabled={pending || data.pending} onClick={() => void revoke(account)}>Thu hồi</Button>}</div></li>)}</ul>}
    </div>
    {editing && <AdminEditor data={{ ...data, pending: data.pending || pending, error: actionError || data.error }} title={editing.account ? editing.account.status === "revoked" ? "Cấp lại quyền tài khoản" : "Sửa vai trò tài khoản" : "Thêm tài khoản nhân viên"} description={editing.account ? `Tài khoản: ${editing.account.email}. Chọn vai trò để cập nhật quyền trên hệ thống.` : "Nhập email và chọn vai trò. Nhân viên tự tạo mật khẩu tại trang đăng nhập admin."} saveLabel={editing.account ? editing.account.status === "revoked" ? "Cấp lại quyền" : "Lưu vai trò" : "Cấp quyền"} onClose={() => setEditing(null)} onSave={save}>
      <label>Email nhân viên<Input name="email" type="email" defaultValue={editing.account?.email ?? ""} readOnly={!!editing.account} onChange={() => void action(() => {})} placeholder="nhanvien@example.com" maxLength={254} autoComplete="off" required/></label>
      <label>Vai trò<Select name="role" defaultValue={editing.account?.role ?? "editor"} onChange={() => void action(() => {})}><option value="editor">Editor (Biên tập)</option><option value="administrator">Admin (Quản trị)</option></Select></label>
    </AdminEditor>}
  </AdminPanel>;
}
