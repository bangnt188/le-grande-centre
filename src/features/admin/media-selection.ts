import type { MediaItem } from "@/shared/admin/contracts";
import { fileType, imageDimensions, MAX_BATCH_BYTES, MAX_FILE_BYTES, MAX_FILES } from "@/server/media/validation";

/** Client feedback only: upload decoding, quota and scope protection remain authoritative on the server. */
export async function validateMediaFiles(files: readonly File[], max: number, allowPdf: boolean): Promise<string> {
  if (files.length > Math.min(max, MAX_FILES)) return `Chỉ chọn tối đa ${Math.min(max, MAX_FILES)} tệp mỗi lần.`;
  if (files.reduce((sum, file) => sum + file.size, 0) >= MAX_BATCH_BYTES) return "Tổng dung lượng tệp phải dưới 20 MiB.";
  for (const file of files) {
    const prefix = `${file.name || "Tệp không tên"}: `;
    if (!file.name.trim() || file.name.length > 160 || /[\x00-\x1f\x7f]/.test(file.name)) return prefix + "tên tệp không hợp lệ (tối đa 160 ký tự).";
    if (!file.size) return prefix + "tệp rỗng.";
    if (file.size > MAX_FILE_BYTES) return prefix + "vượt giới hạn 10 MiB/tệp.";
    if (!["image/png", "image/jpeg", "image/webp", ...(allowPdf ? ["application/pdf"] : [])].includes(file.type)) return prefix + `chỉ nhận PNG, JPEG, WebP${allowPdf ? " hoặc PDF" : ""}.`;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      fileType(bytes, file.type);
      if (file.type !== "application/pdf") imageDimensions(bytes, file.type);
    } catch (issue) {
      return prefix + (issue instanceof Error ? issue.message : "không đọc được tệp.");
    }
  }
  return "";
}

export function mediaSelectionReason(item: MediaItem, targetScope?: string, disabledIds: readonly string[] = []): string | undefined {
  if (item.projectAsset || !item.hasUploadedFile) return "Tài nguyên dự án không phải ảnh tải lên để tái sử dụng.";
  if (item.uploadState !== "ready" || !item.mimeType?.startsWith("image/")) return "Ảnh chưa sẵn sàng để sử dụng.";
  if (disabledIds.includes(item.id)) return "Ảnh này không khả dụng trong lựa chọn hiện tại.";
  if (!targetScope) return;
  if (item.protectedReason) return item.protectedReason;
  if (!["Toàn dự án", "Chưa xác nhận tầng", targetScope].includes(item.scope)) return `Ảnh đang thuộc ${item.scope}; không thể chuyển sang ${targetScope} tại đây.`;
}

export function toggleMediaSelection(value: readonly MediaItem[], item: MediaItem, max: number): MediaItem[] {
  if (value.some(selected => selected.id === item.id)) return value.filter(selected => selected.id !== item.id);
  if (max === 1) return [item];
  return value.length < max ? [...value, item] : [...value];
}

export function sameMediaIds(left: readonly MediaItem[], right: readonly MediaItem[]): boolean {
  return left.length === right.length && left.every(item => right.some(other => other.id === item.id));
}
