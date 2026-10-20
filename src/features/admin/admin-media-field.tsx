"use client";

import { useEffect, useRef, useState } from "react";
import { UploadField } from "@mall/ui";
import type { MediaItem } from "@/shared/admin/contracts";
import type { AdminData } from "./use-admin-data";
import { useAdminEditorChange } from "./admin-editor";
import { MediaLibraryPicker } from "./media-library-picker";
import { sameMediaIds, validateMediaFiles } from "./media-selection";
import styles from "./admin-media-field.module.css";

type Props = {
  data: AdminData;
  id: string;
  name: string;
  label: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  max?: number;
  allowPdf?: boolean;
  targetScope?: string;
} & ({ libraryEnabled: false; library?: never; onLibraryChange?: never } | {
  libraryEnabled?: true; library: MediaItem[]; onLibraryChange: (items: MediaItem[]) => void;
});

export function AdminMediaField({ data, id, name, label, files, onFilesChange, library, onLibraryChange, max = 4, allowPdf = false, libraryEnabled = true, targetScope }: Props) {
  const markChanged = useAdminEditorChange();
  const control = useRef<HTMLInputElement>(null);
  const validation = useRef(0);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const limit = Math.min(4, Math.max(1, max));
  useEffect(() => () => { validation.current++; }, []);
  const chooseFiles = async (next: File[]) => {
    if (data.pending || data.loading) return;
    const serial = ++validation.current;
    const changed = next.length !== files.length || next.some((file, index) => file !== files[index]);
    if (!next.length) {
      setError(""); setValidating(false); control.current?.setCustomValidity("");
      if (changed) { onFilesChange([]); markChanged(); }
      return;
    }
    setValidating(true);
    setError("");
    control.current?.setCustomValidity("Đang kiểm tra tệp. Vui lòng đợi trước khi lưu.");
    const issue = await validateMediaFiles(next, limit, allowPdf);
    if (serial !== validation.current) return;
    setValidating(false);
    setError(issue);
    control.current?.setCustomValidity(issue);
    if (issue) return;
    if (changed || library?.length) {
      onFilesChange(next);
      if (library?.length) onLibraryChange?.([]);
      markChanged();
    }
  };
  return <div className={styles.field} data-admin-draft-ignore="">
    <UploadField id={id} name={name} label={label} files={files} multiple={limit > 1} controlRef={control}
      accept={`image/png,image/jpeg,image/webp${allowPdf ? ",application/pdf" : ""}`} disabled={data.pending || data.loading}
      onFilesChange={next => { void chooseFiles(next); }} error={error}
      description={`${limit === 1 ? "1 tệp" : `Tối đa ${limit} tệp/lần`} · 10 MiB/tệp · tổng dưới 20 MiB. PNG, JPEG, WebP${allowPdf ? ", PDF" : ""}; ảnh tối đa 4 megapixel và 4096 px mỗi cạnh.`}/>
    {validating && <p className={styles.note} role="status">Đang kiểm tra tệp…</p>}
    {libraryEnabled && library && onLibraryChange && <MediaLibraryPicker data={data} label="Chọn ảnh từ thư viện" value={library} max={limit} targetScope={targetScope} onChange={items => {
      validation.current++;
      setValidating(false); setError(""); control.current?.setCustomValidity("");
      if (!sameMediaIds(library, items)) {
        onLibraryChange(items);
        if (items.length && files.length) onFilesChange([]);
        markChanged();
      }
    }}/>}
  </div>;
}
