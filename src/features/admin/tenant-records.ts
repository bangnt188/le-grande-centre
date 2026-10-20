import type { B2BData } from "../../shared/admin/b2b-model";
import type { Slot } from "../../shared/admin/space-model";

export function companyCategory(data: Pick<B2BData, "leases" | "reservations" | "requests">, companyId: string, now = Date.now()) {
  if (data.leases.some(lease => lease.companyId === companyId)) return "Đang thuê";
  if (data.reservations.some(hold => hold.companyId === companyId && hold.status === "active" && Date.parse(hold.expiresAt) > now)) return "Đang giữ chỗ";
  if (data.requests.some(request => request.companyId === companyId && (request.status === "submitted" || request.status === "reviewing"))) return "Đang tư vấn";
  return "Chưa thuê";
}
/** A registered tenant requires a lease; a manually occupied slot remains a separate record. */
export function tenantRecords(data: Pick<B2BData, "companies" | "leases"> & { slots: Slot[] }) {
  const leasedIds = new Set(data.leases.flatMap(lease => lease.slotIds));
  const companyIds = [...new Set(data.leases.map(lease => lease.companyId))];
  const registered = companyIds.map(companyId => {
    const company = data.companies.find(item => item.id === companyId);
    const leases = data.leases.filter(lease => lease.companyId === companyId);
    const ids = new Set(leases.flatMap(lease => lease.slotIds));
    return { id: companyId, name: company?.name ?? "Doanh nghiệp chưa có thông tin", label: "Doanh nghiệp trong hồ sơ thuê", leases: leases.map(lease => lease.referenceCode).join(", "), slots: data.slots.filter(slot => ids.has(slot.id)) };
  });
  const manual = data.slots.filter(slot => ["Đã ký", "Đã thuê"].includes(slot.status) && !leasedIds.has(slot.id)).map(slot => ({ id: `manual:${slot.id}`, name: slot.tenant.trim() || "Chưa ghi tên bên thuê", label: "Ghi nhận trực tiếp trên slot · chưa có hồ sơ thuê liên kết", leases: "—", slots: [slot] }));
  return [...registered, ...manual];
}
