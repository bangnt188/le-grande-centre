"use client";

import NextLink from "next/link";
import { useEffect, useId, useState } from "react";
import { AdminPanel, Alert, Button, Input, Textarea, type ToastTone } from "@mall/ui";
import type { WebsiteSettings } from "@/shared/admin/website-settings";
import type { AdminMediaDetail, AdminUploadReceipt, MediaItem } from "@/shared/admin/contracts";
import { AdminMediaField } from "./admin-media-field";
import { AdminEditor } from "./admin-editor";
import type { AdminData } from "./use-admin-data";
import { adminRequest, ensureSession } from "./session";
import { makeCacheKey, screenCache } from "./memory-cache";
import { parseMediaDetail } from "./http-repository";
import styles from "./admin-records.module.css";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function WebsiteSettingsPanel({ data, onMessage }: { data: AdminData; onMessage: (message: string, tone?: ToastTone) => void }) {
  const [editing, setEditing] = useState<{ website: WebsiteSettings; revision: number } | null>(null);
  const [selectedLogo, setSelectedLogo] = useState("");
  const [preview, setPreview] = useState(false);
  const [actionError, setActionError] = useState("");
  const [logoFailure, setLogoFailure] = useState<{ key: string; message: string } | null>(null);
  const [logoResult, setLogoResult] = useState<{ key: string; version: number; value: AdminMediaDetail } | null>(null);
  const [logoFiles, setLogoFiles] = useState<File[]>([]);
  const [libraryLogo, setLibraryLogo] = useState<MediaItem[]>([]);
  const [uploadedLogoId, setUploadedLogoId] = useState("");
  const zaloNoteId = useId();
  const website = editing?.website ?? data.settings?.website;
  const logoId = website?.logoMediaId;
  const logoKey = makeCacheKey(data.sessionKey, "", "media-detail", { id: logoId });
  useEffect(() => {
    if (!logoId) return;
    const controller = new AbortController();
    setLogoFailure(null);
    screenCache.load(logoKey, async signal => parseMediaDetail(await (await adminRequest(`/api/admin/media/${encodeURIComponent(logoId)}/`, {}, { signal })).json()), controller.signal).then(value => { if (!controller.signal.aborted) setLogoResult({ key: logoKey, version: data.cacheVersion, value }); }).catch(issue => { if (!controller.signal.aborted) setLogoFailure({ key: logoKey, message: issue instanceof Error ? issue.message : "Không tải được thông tin logo." }); });
    return () => controller.abort();
  }, [logoId, logoKey, data.cacheVersion]);
  const currentLogo = logoResult?.key === logoKey && logoResult.version === data.cacheVersion ? logoResult.value.item : null;
  const logoError = logoFailure?.key === logoKey ? logoFailure.message : "";
  async function action(change: () => void) {
    try { await ensureSession({ userAction: true }); setActionError(""); change(); }
    catch (issue) { setActionError(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác."); }
  }
  function openEditor() {
    const revision = data.screenData?.revision;
    if (!website || revision == null) return;
    void action(() => {
      setEditing({ website, revision });
      setSelectedLogo(website.logoMediaId);
      setLogoFiles([]);
      setLibraryLogo([]);
      setUploadedLogoId("");
    });
  }
  return <AdminPanel className={`records-panel ${styles.detail}`}>
    <div className={styles.heading}><h2>Cấu hình website</h2><Button disabled={!website || !!editing || data.pending || data.loading} onClick={openEditor}>Sửa cấu hình website</Button></div>
    <p>Thông tin liên hệ được công bố từ hệ thống. Logo được lưu trong Neon Object Storage, không lưu dữ liệu riêng tư trong trình duyệt.</p>
    {actionError && <Alert tone="error">{actionError}</Alert>}
    {website && <dl className={styles.facts}>
      <dt>Logo hiện tại</dt><dd>{currentLogo ? <><span>{currentLogo.name}</span>{currentLogo.url && <Button variant="quiet" onClick={() => void action(() => setPreview(value => !value))}>{preview ? "Ẩn logo" : "Xem logo"}</Button>}{preview && currentLogo.url && <img src={currentLogo.url} alt="Logo website hiện tại" width={160} height={96} style={{ objectFit: "contain", maxWidth: "100%" }}/>}</> : logoError ? <Alert tone="error">{logoError} <Button variant="quiet" onClick={() => void action(() => screenCache.markAllStale())}>Thử lại</Button></Alert> : <span role="status">Đang tải thông tin logo…</span>}</dd>
      <dt>Email</dt><dd>{website.email}</dd><dt>Hotline</dt><dd>{website.hotline}</dd><dt>Điện thoại bổ sung</dt><dd>{website.secondaryPhone || "Không sử dụng"}</dd><dt>Điện thoại ban quản lý</dt><dd>{website.managementPhone || "Không sử dụng"}</dd><dt>Địa chỉ</dt><dd>{website.address}</dd><dt>Đường dẫn Zalo</dt><dd>{website.zaloUrl}</dd>
    </dl>}
    <div className={styles.actions}><NextLink href="/" target="_blank" rel="noopener noreferrer">Mở website<span className="sr-only"> (tab mới)</span></NextLink></div>
    {website && <Button disabled={!!editing || data.pending || data.loading} onClick={openEditor}>Thay logo website</Button>}
    {editing && <AdminEditor data={data} title="Cấu hình website" description="Lưu thông tin liên hệ công khai. Chọn logo từ thư viện hoặc tải ảnh mới lên Neon; logo được công bố cùng cấu hình khi lưu." onClose={() => setEditing(null)} onSave={async form => {
      let revision = editing.revision;
      let logoMediaId = libraryLogo[0]?.id ?? (uploadedLogoId || selectedLogo);
      // Upload once, keep the local preview, and reuse the same media after a conflicting save.
      if (logoFiles.length && !uploadedLogoId) {
        let receipt: AdminUploadReceipt | undefined;
        const uploaded = await data.uploadFiles(logoFiles, "Toàn dự án", revision, saved => {
          receipt = saved;
          setUploadedLogoId(saved.mediaIds[0] ?? "");
          setSelectedLogo(saved.mediaIds[0] ?? "");
          setEditing(current => current ? { ...current, revision: saved.revision } : current);
          setLibraryLogo([]);
        });
        if (!uploaded || !receipt) return false;
        revision = receipt.revision;
        logoMediaId = receipt.mediaIds[0] ?? "";
      }
      const values: WebsiteSettings = { logoMediaId, email: field(form, "email"), hotline: field(form, "hotline"), secondaryPhone: field(form, "secondaryPhone"), managementPhone: field(form, "managementPhone"), address: field(form, "address"), zaloUrl: field(form, "zaloUrl") };
      const saved = await data.execute({ type: "update-website-settings", values }, revision, receipt => {
        setEditing(current => current ? { ...current, website: values, revision: receipt.revision } : current);
      });
      if (saved) onMessage("Đã lưu cấu hình website trên hệ thống.");
      return saved;
    }}>
      <AdminMediaField data={data} id="website-logo-file" name="logoFile" label="Logo website" files={logoFiles} onFilesChange={files => { setLogoFiles(files); if (files.length) { setLibraryLogo([]); setUploadedLogoId(""); } }} library={libraryLogo} onLibraryChange={items => { setLibraryLogo(items); if (items.length) { setLogoFiles([]); setUploadedLogoId(""); } }} max={1} variant="avatar" src={libraryLogo[0]?.url ?? currentLogo?.url} fallback="LGC" removeLabel="Giữ lại logo hiện tại" onRemove={() => { setSelectedLogo(editing.website.logoMediaId); setLogoFiles([]); setLibraryLogo([]); setUploadedLogoId(""); }}/>
      <p className={styles.secondary}>Bấm vào vòng tròn để chọn ảnh mới; ảnh chỉ được tải lên khi bấm Lưu thay đổi. Logo mới chỉ được công bố khi lưu cấu hình thành công.</p>
      {(logoFiles.length > 0 || libraryLogo.length > 0) && <p role="status">Đang chờ tải ảnh logo lên. Lưu cấu hình để công bố; thử lưu lại sẽ không tải ảnh lần nữa.</p>}
      <label>Email liên hệ website<Input name="email" type="email" required maxLength={254} defaultValue={editing.website.email}/></label><label>Hotline website<Input name="hotline" type="tel" required maxLength={32} defaultValue={editing.website.hotline}/></label><label>Điện thoại bổ sung (không bắt buộc)<Input name="secondaryPhone" type="tel" maxLength={32} defaultValue={editing.website.secondaryPhone}/></label><label>Điện thoại ban quản lý (không bắt buộc)<Input name="managementPhone" type="tel" maxLength={32} defaultValue={editing.website.managementPhone}/></label><label>Địa chỉ liên hệ<Textarea name="address" required maxLength={400} defaultValue={editing.website.address}/></label><label>Đường dẫn Zalo<Input name="zaloUrl" type="url" required maxLength={240} defaultValue={editing.website.zaloUrl} aria-describedby={zaloNoteId}/></label><p id={zaloNoteId} className={styles.secondary}>Nhập đường dẫn tài khoản cụ thể dạng https://zalo.me/…; không tự tạo từ số hotline.</p>
    </AdminEditor>}
  </AdminPanel>;
}
