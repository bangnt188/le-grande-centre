"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Alert, Button, ConfirmDialog, Sheet } from "@mall/ui";
import type { AdminData } from "./use-admin-data";
import { useOptionalAdminWorkspaceNavigation } from "./admin-workspace-navigation";
import { ensureSession, useAdminSession } from "./session";
import { useAdminOperationState } from "./admin-operation-state";

const EditorChangeContext = createContext<(() => void) | null>(null);
export function useAdminEditorChange() {
  const change = useContext(EditorChangeContext);
  if (!change) throw new Error("Media fields require an AdminEditor.");
  return change;
}

/** One save/cancel/dirty boundary for admin record forms. */
export function AdminEditor({ data, title, description, children, onClose, onSave, saveLabel = "Lưu thay đổi", saveDisabled = false }: {
  data: AdminData; title: string; description: string; children: ReactNode;
  onClose: () => void; onSave: (values: FormData) => Promise<boolean>; saveLabel?: string; saveDisabled?: boolean;
}) {
  const id = useId();
  const session = useAdminSession();
  const identity = session ? JSON.stringify([session.actorId, session.propertyId]) : "";
  const { markSaving } = useAdminOperationState(identity);
  useEffect(() => () => markSaving(id, false), [id, markSaving]);
  const host = useRef<HTMLDivElement>(null);
  const [returnFocus] = useState(() => ({ current: typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null }));
  const saving = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const { markDraft } = data;
  const changed = useCallback(() => {
    markDraft(id, true); setDirty(true); setFailed(false);
    void ensureSession({ userAction: true }).then(() => setSessionError("")).catch(issue => setSessionError(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa hồ sơ."));
  }, [id, markDraft]);
  const navigation = useOptionalAdminWorkspaceNavigation();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const registerEditor = navigation?.registerLocalEditor;
  useEffect(() => {
    if (!registerEditor) return;
    let cancelled = false;
    let unregister: (() => void) | undefined;
    queueMicrotask(() => { if (!cancelled) unregister = registerEditor(id, () => closeRef.current()); });
    return () => { cancelled = true; unregister?.(); };
  }, [id, registerEditor]);
  useEffect(() => {
    markDraft(id, dirty);
    return () => markDraft(id, false);
  }, [id, dirty, markDraft]);
  function close() {
    if (saving.current || data.pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  return <EditorChangeContext.Provider value={changed}><div ref={host} className="admin-editor-host">
    <Sheet open title={title} description={description} closeLabel="Đóng biểu mẫu" onOpenChange={open => { if (!open) close(); }} portalContainer={host} returnFocusRef={returnFocus}>
      <form className="admin-editor-form" onChange={event => {
        if (event.target instanceof Element && !event.target.closest("[data-admin-draft-ignore]")) changed();
      }} onSubmit={async event => {
        event.preventDefault();
        if (saving.current || data.pending || data.loading || saveDisabled) return;
        const values = new FormData(event.currentTarget);
        saving.current = true; markSaving(id, true); setFailed(false);
        try {
          if (await onSave(values)) { markDraft(id, false); onClose(); }
          else setFailed(true);
        } catch { setFailed(true); }
        finally { saving.current = false; markSaving(id, false); }
      }}>
        <fieldset disabled={data.pending}>{children}</fieldset>
        {sessionError && <Alert tone="error">{sessionError}</Alert>}
        {(failed || data.error) && <Alert tone="error">{data.error || "Chưa lưu được. Kiểm tra thông tin đã nhập và thử lại."}{data.error && <Button variant="quiet" type="button" disabled={data.pending} onClick={async () => { if (await data.reload()) setFailed(false); }}>Tải lại dữ liệu</Button>}</Alert>}
        <p className="draft-status" aria-live="polite">{dirty ? "Có thay đổi chưa lưu." : "Thay đổi chỉ được áp dụng sau khi lưu."}</p>
        <div className="admin-editor-actions">
          <Button variant="secondary" type="button" disabled={data.pending} onClick={close}>Hủy</Button>
          <Button type="submit" loading={data.pending} loadingLabel="Đang lưu…" disabled={data.pending || data.loading || saveDisabled}>{saveLabel}</Button>
        </div>
      </form>
      <ConfirmDialog open={discard} title="Bỏ thay đổi chưa lưu?" description="Thông tin đang sửa chưa được lưu. Bạn có thể quay lại để tiếp tục hoặc bỏ thay đổi." confirmLabel="Bỏ thay đổi" cancelLabel="Tiếp tục sửa" onClose={() => { if (!data.pending && !saving.current) setDiscard(false); }} onConfirm={() => { if (data.pending || saving.current) return; markDraft(id, false); onClose(); }} portalContainer={host}/>
    </Sheet>
  </div></EditorChangeContext.Provider>;
}
