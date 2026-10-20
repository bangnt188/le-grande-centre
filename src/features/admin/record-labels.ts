import type { Slot } from "@/shared/admin/space-model";
export const requestLabels = { submitted: "Chờ xét duyệt", reviewing: "Đang xét duyệt", approved: "Đã duyệt", rejected: "Đã từ chối" };
export const appointmentLabels = { requested: "Chờ xác nhận", confirmed: "Đã xác nhận", completed: "Đã hoàn tất", cancelled: "Đã hủy", no_show: "Không đến" };
export function slotCodes(ids: string[], slots: readonly Slot[] = []) { return ids.map(id => slots.find(slot => slot.id === id)?.code ?? "Mã mặt bằng chưa tải").join(" + "); }
export function dateLabel(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value)); }
export function timeLabel(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
export function remainingLabel(value: string) { const hours = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 3600000)); return hours === 0 ? "Đã hết hạn" : hours >= 24 ? `Còn ${Math.floor(hours / 24)} ngày${hours % 24 ? ` ${hours % 24} giờ` : ""}` : `Còn ${hours} giờ`; }
