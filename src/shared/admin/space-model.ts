export const FLOORS = [1, 2, 3, 4, 5, 6] as const;
export const INTERNAL_BUSINESS_STATUSES = ["Còn trống", "Có Lead", "Đang thương lượng", "Giữ chỗ", "Đã ký", "Đã thuê"] as const;
export type InternalBusinessStatus = (typeof INTERNAL_BUSINESS_STATUSES)[number];
export type SlotStatus = InternalBusinessStatus;
export type PublicAvailability = "Còn trống" | "Liên hệ" | "Đã thuê";
export function isInternalBusinessStatus(value: unknown): value is InternalBusinessStatus {
  return INTERNAL_BUSINESS_STATUSES.some(status => status === value);
}
export function isSlotStatus(value: unknown): value is SlotStatus | PublicAvailability {
  return isInternalBusinessStatus(value) || value === "Liên hệ";
}
export function mapBusinessStatusToPublic(status: InternalBusinessStatus, effectiveLease = false): PublicAvailability {
  if (status === "Còn trống") return "Còn trống";
  if (status === "Đã thuê" || (status === "Đã ký" && effectiveLease)) return "Đã thuê";
  return "Liên hệ";
}
export type Floor = (typeof FLOORS)[number];
export type Slot = {
  id: string; floor: Floor; code: string; order: number;
  side: "west" | "east" | null; area: number; width: number; status: SlotStatus; tenant: string;
  connectedSlotIds?: string[];
};
export type SpaceGroup = {
  id: string; floor: Floor; name: string; slotIds: string[]; status: SlotStatus;
};
export type FloorConfiguration = { number: Floor; purpose: string; publicTitle: string; publicDescription: string };
export const FLOOR_PUBLIC_TITLE_MAX_LENGTH = 120;
export const FLOOR_PUBLIC_DESCRIPTION_MAX_LENGTH = 600;
export const DEFAULT_FLOOR_CONTENT: readonly Pick<FloorConfiguration, "number" | "publicTitle" | "publicDescription">[] = [
  { number: 1, publicTitle: "Shophouse liên thông", publicDescription: "11 căn shophouse riêng biệt liên thông lên tầng 2. Sảnh giữa tiếp cận tầng 3–6 bằng thang máy hoặc thang bộ." },
  { number: 2, publicTitle: "Shophouse liên thông", publicDescription: "11 căn shophouse liên thông từ tầng 1. Khoảng thông tầng giữa tạo không gian trưng bày cho B.5 hoặc B.6." },
  { number: 3, publicTitle: "Mặt bằng linh hoạt", publicDescription: "3 khu mặt bằng lớn với phương án phân chia linh hoạt thành 23 ô C.1–C.23, phù hợp nhiều quy mô kinh doanh." },
  { number: 4, publicTitle: "Mặt bằng linh hoạt", publicDescription: "3 khu mặt bằng lớn với phương án phân chia linh hoạt thành 23 ô D.1–D.23, phù hợp nhiều quy mô kinh doanh." },
  { number: 5, publicTitle: "Mặt bằng & rạp dự kiến", publicDescription: "2 khu mặt bằng có thể phân chia linh hoạt. Không gian E.5 rộng 1.000 m² được định hướng cho cụm rạp chiếu phim." },
  { number: 6, publicTitle: "Dịch vụ ngoài trời", publicDescription: "F.1: 46 m²; F.2: 1.020 m² không gian ngoài trời. Kết nối với khoảng thông tầng của không gian rạp chiếu phim dự kiến." },
];
export const FLOOR_PURPOSE_MAX_LENGTH = 120;
export function isFloorConfigurations(value: unknown): value is FloorConfiguration[] {
  return Array.isArray(value) && value.length === FLOORS.length && value.every((item, index) => item && item.number === FLOORS[index] && bounded(item.purpose, FLOOR_PURPOSE_MAX_LENGTH) && bounded(item.publicTitle, FLOOR_PUBLIC_TITLE_MAX_LENGTH) && bounded(item.publicDescription, FLOOR_PUBLIC_DESCRIPTION_MAX_LENGTH));
}
function bounded(value: unknown, max: number) { return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= max; }

export function mergeIssue(slots: Slot[], groups: SpaceGroup[], ids: string[], floor: Floor): string | null {
  if (ids.length < 2) return "Chọn ít nhất 2 slot liền kề để ghép.";
  if (new Set(ids).size !== ids.length) return "Mỗi slot chỉ được chọn một lần.";
  const members = ids.map((id) => slots.find((slot) => slot.id === id));
  if (members.some((slot) => !slot)) return "Có slot không tồn tại. Hãy chọn lại.";
  const valid = members.filter((slot): slot is Slot => !!slot).sort((a, b) => a.order - b.order);
  if (valid.some((slot) => slot.floor !== floor)) return "Chỉ ghép các slot trên cùng tầng đang xem.";
  if (valid.some(slot => slot.side === null)) {
    const reached = new Set([valid[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const slot of valid) if (reached.has(slot.id)) for (const id of slot.connectedSlotIds ?? []) {
        if (ids.includes(id) && !reached.has(id)) { reached.add(id); changed = true; }
      }
    }
    if (reached.size !== valid.length) return "Chưa có cạnh nối được phê duyệt; không ghép theo số thứ tự slot.";
  } else {
    if (valid.some(slot => slot.side !== valid[0].side)) return "Không thể ghép qua sảnh hoặc khoảng thông tầng.";
    if (valid.some((slot, i) => i > 0 && slot.order !== valid[i - 1].order + 1)) return "Các slot phải liền kề. Chọn thêm slot ở giữa hoặc bỏ slot cách xa.";
  }
  if (groups.some((group) => group.slotIds.some((id) => ids.includes(id)))) return "Slot đã thuộc một mặt bằng ghép. Tách nhóm hiện có trước.";
  if (valid.some(slot => slot.tenant || slot.status !== "Còn trống")) return "Chỉ ghép slot Còn trống, chưa có đối tác. Rà soát trạng thái trước.";
  return null;
}

export function slotLeft(slot: Pick<Slot, "order" | "side">): number {
  // Frontage is 100 units in total, including an 8-unit central core.
  return slot.order === 1 ? 0 : 10 + (slot.order - 2) * 8 + (slot.side === "east" ? 8 : 0);
}

export function hasCommitment(data: Pick<import("./b2b-model").B2BData, "reservations" | "leases">, ids: string[], now = Date.now()) {
  return data.reservations.some(hold => hold.status === "active" && Date.parse(hold.expiresAt) > now && hold.slotIds.some(id => ids.includes(id))) || data.leases.some(lease => lease.slotIds.some(id => ids.includes(id)));
}
