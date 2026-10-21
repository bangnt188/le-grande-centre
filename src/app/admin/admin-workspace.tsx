"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FLOORS, INTERNAL_BUSINESS_STATUSES, hasCommitment, isInternalBusinessStatus, isSlotStatus, mergeIssue } from "../../shared/admin/space-model";
import type { Floor, Slot, SpaceGroup } from "../../shared/admin/space-model";
import type { AdminScreenName, AdminScreenQuery } from "@/shared/admin/contracts";
import { useAdminData, type AdminData } from "@/features/admin/use-admin-data";
import { AdminSessionError, clearAdminSession, ensureSession, getSessionSnapshot, logoutSession, useAdminSession } from "@/features/admin/session";
import { BROCHURE_PATH } from "@/features/public/brochure-leasing";
import planStyles from "@/features/public/canva-pages.module.css";
import { FloorPlanMap } from "@/features/shared/floor-plan-map";
import { r2AssetUrl } from "@/config/site";
import { AdminWorkspaceNavigationProvider, useAdminWorkspaceNavigation, type AdminBusinessAction, type AdminRecordTarget, type AdminView } from "@/features/admin/admin-workspace-navigation";
import { useAdminWorkspaceController } from "@/features/admin/use-admin-workspace-controller";
import { useAdminNavigation } from "@/features/admin/use-admin-navigation";
import { useAdminLogoUrl } from "@/features/admin/use-admin-logo";

import { FloorOverview } from "./content-overviews";
import { LeGrandeAdminShell } from "@/features/admin/le-grande-admin-shell";
import { AdminPanel, PaginatedContent, ConfirmDialog, ConfirmSheet, Sheet, Button, Input, Select, Checkbox, Badge, Table, Breadcrumbs, LoadingIndicator, Alert, type ToastTone, type AdminNavigationItem } from "@mall/ui";
import { AdminNotificationsProvider, useAdminNotifications } from "@/features/admin/admin-notifications";
import { AdminPagination } from "@/features/admin/admin-pagination";
import { AdminEditor } from "@/features/admin/admin-editor";

const MediaWorkspace = lazy(() => import("@/features/admin/media-workspace").then(m => ({ default: m.MediaWorkspace })));
const LeadsWorkspace = lazy(() => import("@/features/admin/admin-records").then(m => ({ default: m.LeadsWorkspace })));
const AdminSettingsWorkspace = lazy(() => import("@/features/admin/admin-records").then(m => ({ default: m.AdminSettingsWorkspace })));
const B2BWorkspace = lazy(() => import("./b2b-workspace"));
const SlotDetail = lazy(() => import("@/features/admin/slot-detail"));
const BusinessActionHost = lazy(() => import("./b2b-workspace").then(m => ({ default: m.BusinessActionHost })));
const LeadActionHost = lazy(() => import("@/features/admin/admin-records").then(m => ({ default: m.LeadActionHost })));
const LeadQualificationHost = lazy(() => import("@/features/admin/lead-qualification").then(m => ({ default: m.LeadQualificationHost })));

type SpaceEditor = { revision: number } & (
  | { kind: "edit"; slot: Slot; group?: SpaceGroup }
  | { kind: "merge"; floor: Floor; slots: Slot[]; name: string }
);
type IconName = "plan" | "people" | "media" | "arrow" | "search" | "check" | "merge" | "split" | "file" | "close" | "menu" | "calendar" | "request";
const iconPaths: Record<IconName, ReactNode> = {
  menu: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m4-10 2 2-2 2"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2"/></>,
  request: <><path d="M14 3H5v18h14V8zm0 0v5h5M8 12h8m-8 4h3"/><path d="m14 17 1 1 3-3"/></>,
  plan: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 10h18M10 10v11M15 3v7"/></>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>,
  media: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  merge: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v3m0 8v3m-5-7h10m-3-3 3 3-3 3"/></>,
  split: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14m-4-9-2 2 2 2m8-4 2 2-2 2"/></>,
  file: <><path d="M14 3H5v18h14V8zm0 0v5h5M8 12h8m-8 4h6"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}
function Status({ value }: { value: Slot["status"] }) {
  const tone = value === "Còn trống" ? "success" : ["Có Lead", "Đang thương lượng", "Giữ chỗ", "Đã ký"].includes(value) ? "warning" : "action";
  return <Badge className="slot-state-badge" data-slot-status={value} tone={tone}>{value}</Badge>;
}
const fmt = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const labels: Record<AdminView, string> = { floors: "Tầng", customers: "Doanh nghiệp", requests: "Yêu cầu & giữ chỗ", leases: "Hợp đồng", appointments: "Lịch hẹn", spaces: "Căn / Mặt bằng", leads: "Khách tiềm năng", media: "Media", settings: "Cấu hình" };


export default function AdminWorkspace() {
  const logoUrl = useAdminLogoUrl();
  return <AdminNotificationsProvider><AdminWorkspaceContent logoUrl={logoUrl}/></AdminNotificationsProvider>;
}
function AdminWorkspaceContent({ logoUrl }: { logoUrl?: string }) {
  const router = useRouter();
  const { notify } = useAdminNotifications();
  function setMessage(message: string, tone: ToastTone = "success") { if (message) notify(message, tone); }
  const operationData = useAdminData(null);
  const notes = useAdminNavigation(operationData.hasUnsavedDrafts);
  const workspace = useAdminWorkspaceController(notes, operationData.pending, message => setMessage(message, "error"));
  const { view, floor, selectedIds: selected } = workspace.location;
  const [leavingSession, setLeavingSession] = useState(false);
  const liveSession = useAdminSession();
  const wasAuthenticated = useRef(false);
  const [sessionResolving, setSessionResolving] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const canManageAccounts = liveSession?.role === "administrator";

  useEffect(() => {
    let active = true;
    ensureSession({ userAction: true })
      .then(s => {
        if (!active) return;
        setSessionResolving(false);
        if (!s) setSessionError("Phiên đăng nhập không tồn tại hoặc đã hết hạn.");
      })
      .catch(err => {
        if (!active) return;
        if (err instanceof AdminSessionError && err.status === 401) {
          window.location.replace("/admin/");
          return;
        }
        setSessionResolving(false);
        setSessionError(err instanceof Error ? err.message : "Không thể xác thực phiên đăng nhập.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!liveSession) {
      if (wasAuthenticated.current && !leavingSession) window.location.replace("/admin/");
      return;
    }

    wasAuthenticated.current = true;
    const expiresAt = liveSession.expiresAt;
    const redirectWhenExpired = () => {
      if (Date.now() < expiresAt || getSessionSnapshot()?.expiresAt !== expiresAt) return;
      wasAuthenticated.current = false;
      clearAdminSession();
      window.location.replace("/admin/");
    };
    const timeout = window.setTimeout(redirectWhenExpired, Math.max(0, expiresAt - Date.now()));
    window.addEventListener("focus", redirectWhenExpired);
    document.addEventListener("visibilitychange", redirectWhenExpired);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", redirectWhenExpired);
      document.removeEventListener("visibilitychange", redirectWhenExpired);
    };
  }, [leavingSession, liveSession]);

  const activeScreen: AdminScreenName | null = view === "floors" || view === "spaces" || view === "requests" || view === "leases" || view === "settings" ? view : null;
  const requestsList = workspace.lists.requests ?? {};
  const leasesList = workspace.lists.leases ?? {};
  const screenQuery = useMemo<AdminScreenQuery>(() => {
    if (view === "spaces") return { floor };
    if (view === "requests") return { page: Number(requestsList.page ?? 1), status: String(requestsList.status ?? "") || undefined };
    if (view === "leases") return { page: Number(leasesList.page ?? 1), query: String(leasesList.query ?? "") || undefined, companyId: String(leasesList.companyId ?? "") || undefined };
    return {};
  }, [view, floor, requestsList.page, requestsList.status, leasesList.page, leasesList.query, leasesList.companyId]);

  const admin = useAdminData(activeScreen, screenQuery);
  const dialogContainer = useRef<HTMLDivElement>(null);
  const detailHost = useRef<HTMLDivElement>(null);
  const pageScope = useRef<HTMLDivElement>(null);
  const { slots, groups, pending, loading, error, execute, reload } = admin;
  const currentFloorPlan = admin.floorPlans.find(item => item.floor === floor);
  const [spaceEditor, setSpaceEditor] = useState<SpaceEditor | null>(null);
  const [splitTarget, setSplitTarget] = useState<{ group: SpaceGroup; revision: number } | null>(null);
  const splitting = useRef(false);
  useEffect(() => {
    if (view !== "spaces") { setSpaceEditor(null); setSplitTarget(null); }
  }, [view]);
  const spaceList = workspace.lists.spaces ?? {};
  const planTab = spaceList.planTab === "reference" ? "reference" : "plan";
  const slotQuery = String(spaceList.query ?? "");
  const slotFilter = String(spaceList.status ?? "");
  const setPlanTab = (value: string) => workspace.setListState("spaces", previous => ({ ...previous, planTab: value }));
  const setSlotQuery = (value: string) => workspace.setListState("spaces", previous => ({ ...previous, query: value, page: 1 }));
  const setSlotFilter = (value: string) => workspace.setListState("spaces", previous => ({ ...previous, status: value, page: 1 }));
  const setSelected = (ids: string[]) => workspace.setListState("spaces", previous => ({ ...previous, selectedIds: ids.join(",") }));
  const openSlot = (id: string) => workspace.openRecord({ kind: "slot", id, floor });

  const floorSlots = slots.filter((slot) => slot.floor === floor);
  const floorGroups = groups.filter((group) => group.floor === floor);
  const selectedSlots = floorSlots.filter((slot) => selected.includes(slot.id));
  const activeGroup = floorGroups.find((group) => group.slotIds.length === selected.length && group.slotIds.every((id) => selected.includes(id)));
  const protectedSelection = hasCommitment(admin, selected);
  const problem = protectedSelection ? "Mặt bằng có giữ chỗ hoặc hợp đồng. Xử lý hồ sơ nghiệp vụ trước khi sửa hoặc ghép/tách." : mergeIssue(slots, groups, selected, floor);
  const area = selectedSlots.reduce((sum, slot) => sum + slot.area, 0);
  const statusOptions = INTERNAL_BUSINESS_STATUSES;

  function changeFloor(next: Floor) {
    workspace.navigateView("spaces", { floor: next, selectedIds: [] });
    return true;
  }
  function choose(slot: Slot) {
    notes.navigate(() => {
      const group = floorGroups.find(item => item.slotIds.includes(slot.id));
      setSpaceEditor(null);
      if (group) { setSelected(group.slotIds); return; }
      const next = selected.some(id => floorGroups.some(item => item.slotIds.includes(id)))
        ? [slot.id] : selected.includes(slot.id) ? selected.filter(id => id !== slot.id) : [...selected, slot.id];
      setSelected(next);
    });
  }
  async function openSpaceEditor(kind: "edit" | "merge") {
    const revision = admin.screenData?.revision;
    if (revision == null || pending || loading || protectedSelection) return;
    const editor: SpaceEditor | null = kind === "merge"
      ? problem ? null : { kind, revision, floor, slots: selectedSlots, name: `Mặt bằng ${selectedSlots.map(slot => slot.code).join("–")}` }
      : selectedSlots[0] ? { kind, revision, slot: selectedSlots[0], group: activeGroup } : null;
    if (!editor) return;
    try { await ensureSession({ userAction: true }); setSpaceEditor(editor); }
    catch (issue) { setMessage(issue instanceof Error ? issue.message : "Không thể tiếp tục sửa mặt bằng.", "error"); }
  }
  async function saveSpace(fields: FormData) {
    if (!spaceEditor || pending || loading) return false;
    const ids = spaceEditor.kind === "merge" ? spaceEditor.slots.map(slot => slot.id) : spaceEditor.group?.slotIds ?? [spaceEditor.slot.id];
    if (hasCommitment(admin, ids)) { setMessage("Mặt bằng có giữ chỗ hoặc hợp đồng. Xử lý hồ sơ nghiệp vụ trước khi sửa hoặc ghép/tách.", "warning"); return false; }
    if (spaceEditor.kind === "merge") {
      const issue = mergeIssue(slots, groups, ids, spaceEditor.floor);
      const name = String(fields.get("name") ?? "").trim();
      if (issue || !name) { setMessage(issue ?? "Nhập tên mặt bằng trước khi ghép.", "warning"); return false; }
      const saved = await execute({ type: "merge", floor: spaceEditor.floor, slotIds: ids, name }, spaceEditor.revision);
      if (saved) setMessage(`Đã ghép ${spaceEditor.slots.map(slot => slot.code).join(" + ")} thành ${fmt(spaceEditor.slots.reduce((sum, slot) => sum + slot.area, 0))} m². Slot gốc được giữ nguyên.`);
      return saved;
    }
    const status = String(fields.get("status") ?? "").trim();
    const tenant = String(fields.get("tenant") ?? "").trim();
    const name = String(fields.get("name") ?? "").trim();
    if (!isInternalBusinessStatus(status) || (spaceEditor.group && !name)) { setMessage("Chọn tình trạng kinh doanh nội bộ hợp lệ và nhập tên mặt bằng.", "warning"); return false; }
    const command = spaceEditor.group
      ? { type: "update-group" as const, groupId: spaceEditor.group.id, name, status }
      : { type: "update-slot" as const, slotId: spaceEditor.slot.id, status, tenant, area: Number(fields.get("area")) };
    const saved = await execute(command, spaceEditor.revision);
    if (saved) setMessage("Đã cập nhật dữ liệu.");
    return saved;
  }
  async function openSplit() {
    const revision = admin.screenData?.revision;
    if (!activeGroup || revision == null || pending || loading || protectedSelection) return;
    const target = { group: activeGroup, revision };
    try { await ensureSession({ userAction: true }); setSplitTarget(target); }
    catch (issue) { setMessage(issue instanceof Error ? issue.message : "Không thể tách mặt bằng.", "error"); }
  }
  async function split() {
    if (!splitTarget || pending || loading || splitting.current || hasCommitment(admin, splitTarget.group.slotIds)) return;
    splitting.current = true;
    try {
      if (await execute({ type: "split", groupId: splitTarget.group.id }, splitTarget.revision)) {
        setSplitTarget(null);
        setMessage(`Đã tách ${splitTarget.group.name}. Slot giữ trạng thái ${splitTarget.group.status}; media của nhóm chuyển về tầng ${splitTarget.group.floor}.`);
      }
    } finally { splitting.current = false; }
  }
  const visibleSlots = floorSlots.filter((slot) => {
    const group = floorGroups.find((item) => item.slotIds.includes(slot.id));
    return `${slot.code} ${group?.name ?? ""} ${slot.tenant}`.toLowerCase().includes(slotQuery.toLowerCase()) && (!slotFilter || (group?.status ?? slot.status) === slotFilter);
  });
  const slotPageSize = Number(spaceList.pageSize ?? 20);
  const slotPageCount = Math.ceil(visibleSlots.length / slotPageSize);
  const slotPage = Math.min(Number(spaceList.page ?? 1), Math.max(slotPageCount, 1));
  const slotStart = (slotPage - 1) * slotPageSize;
  const slotPages = { rows: visibleSlots.slice(slotStart, slotStart + slotPageSize), page: slotPage, pageSize: slotPageSize, pageCount: slotPageCount, total: visibleSlots.length, start: slotStart,
    setPage: (page: number) => workspace.setListState("spaces", previous => ({ ...previous, page })),
    setPageSize: (pageSize: number) => workspace.setListState("spaces", previous => ({ ...previous, pageSize, page: 1 })) };

  const primaryViews: AdminView[] = ["floors", "spaces", "customers", "leads", "requests", "appointments", "media", ...(canManageAccounts ? ["settings" as const] : [])];
  function openSpace(nextFloor: Floor, slotId?: string) {
    workspace.navigateView("spaces", { floor: nextFloor, selectedIds: slotId ? [slotId] : [] });
  }
  async function logout() {
    try {
      await logoutSession();
      router.replace("/admin/"); router.refresh();
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : "Không thể đăng xuất.", "error"); }
  }
  const navigation: AdminNavigationItem[] = primaryViews.map(item => ({
    id: item,
    label: labels[item],
    group: item === "floors" || item === "spaces" ? "Mặt bằng" : item === "media" ? "Tài nguyên" : item === "settings" ? "Hệ thống" : "Kinh doanh",
    icon: <Icon name={item === "floors" || item === "spaces" ? "plan" : item === "settings" ? "menu" : item === "media" ? "media" : item === "appointments" ? "calendar" : item === "requests" ? "request" : item === "leases" ? "file" : "people"}/>,
    badge: item === "leads" && admin.collections?.leads ? admin.collections.leads.totalItems : undefined,
    destination: { kind: "action", onSelect: () => workspace.navigateView(item) }
  }));

  const sessionNeedsLogin = !sessionError || sessionError === "Vui lòng đăng nhập." || sessionError === "Phiên đăng nhập không tồn tại hoặc đã hết hạn.";
  const sessionGate = sessionResolving ? <LoadingIndicator label="Đang kiểm tra quyền truy cập…"/> : !liveSession ? <Alert className="admin-session-alert" tone={sessionNeedsLogin ? "warning" : "error"}>
    <div className="admin-session-alert__layout">
      <p className="admin-session-alert__message">{sessionError || "Phiên đăng nhập không tồn tại hoặc đã hết hạn."}</p>
      <div className="admin-session-alert__actions">
        <Button onClick={() => {
          setSessionResolving(true);
          void ensureSession({ userAction: true }).then(() => setSessionError(null)).catch(issue => setSessionError(issue instanceof Error ? issue.message : "Không thể tải phiên.")).finally(() => setSessionResolving(false));
        }}>Tiếp tục phiên</Button>
        <a className="admin-session-alert__login" href="/admin/">Đăng nhập</a>
      </div>
    </div>
  </Alert> : null;

  const record = workspace.location.detail;
  const action = workspace.location.action;
  const detailLabels: Record<AdminRecordTarget["kind"], string> = { customers: "Hồ sơ doanh nghiệp", requests: "Chi tiết yêu cầu & giữ chỗ", leases: "Hồ sơ thuê", leads: "Chi tiết khách tiềm năng", slot: "Hồ sơ mặt bằng", appointments: "Chi tiết lịch hẹn", media: "Chi tiết media" };
  const workflowAction = action && <AdminWorkflowAction action={action} data={admin} onMessage={setMessage}/>;
  return <AdminWorkspaceNavigationProvider value={workspace}><LeGrandeAdminShell propertyName={admin.settings?.propertyName} logoUrl={logoUrl} navigation={navigation} activeItemId={view === "leases" ? "customers" : view} onLogout={() => { if (pending) return; setLeavingSession(true); notes.navigate(() => { void logout(); }); }} location={<Breadcrumbs label="Vị trí quản trị" items={[{ label: "Quản trị", href: "?view=floors", linkProps: { onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); workspace.navigateView("floors"); } } }, { label: labels[view], href: `?view=${view}`, current: !record, linkProps: { onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); workspace.closeDetail(); } } }, ...(record ? [{ label: detailLabels[record.kind], href: "#", current: true }] : [])]}/>}>
        <ConfirmSheet open={!!splitTarget} pending={pending} error={error ?? undefined} title="Tách mặt bằng ghép?" description={splitTarget ? `${splitTarget.group.name} sẽ trở về ${splitTarget.group.slotIds.length} slot gốc. Media liên kết nhóm chuyển về tầng ${splitTarget.group.floor}; trạng thái được giữ nguyên.` : ""} confirmLabel="Xác nhận tách" cancelLabel="Giữ nhóm" onClose={() => { if (!pending && !splitting.current) setSplitTarget(null); }} onConfirm={() => void split()} portalContainer={dialogContainer}/>
        <ConfirmDialog open={!!notes.pendingNavigation} title={leavingSession ? "Đăng xuất?" : "Có thay đổi chưa lưu"} description={leavingSession ? "Đăng xuất sẽ bỏ những thay đổi chưa lưu. Dữ liệu đã lưu vẫn được giữ trên hệ thống." : "Tiếp tục có thể bỏ các thay đổi đang sửa. Chọn Ở lại để lưu trước."} confirmLabel={leavingSession ? "Đăng xuất, bỏ thay đổi" : "Tiếp tục điều hướng"} cancelLabel="Ở lại" onClose={() => { if (!pending) { notes.stay(); setLeavingSession(false); } }} onConfirm={() => { if (!pending) notes.continue(); }} portalContainer={dialogContainer}/>
        <div ref={pageScope}>
        {sessionGate}
        {liveSession && <>
        {!record && workspace.canGoBack && <Button variant="quiet" disabled={pending} onClick={workspace.back}>Quay lại hồ sơ nguồn</Button>}


        {view === "floors" && !loading && slots.length > 0 && <FloorOverview data={admin} onSpace={openSpace} onMessage={setMessage}/>}

        {loading && <LoadingIndicator label="Đang tải dữ liệu…"/>}
        {error && <Alert tone="error">{error}<Button variant="secondary" onClick={reload}>Thử lại</Button></Alert>}

        <Suspense fallback={<LoadingIndicator label="Đang tải dữ liệu…" />}>
          {(view === "customers" || view === "leases" || view === "requests" || view === "appointments") && <B2BWorkspace view={view} data={admin} mode="list" onMessage={setMessage}/>}
        </Suspense>

        {view === "spaces" && <>
          <div className="floor-nav" role="group" aria-label="Chọn tầng">{admin.floors.map(item => <Button variant="quiet" className={`floor-tab ${floor === item.number ? "is-active" : ""}`} aria-pressed={floor === item.number} key={item.number} onClick={() => notes.navigate(() => changeFloor(item.number))}><span>Tầng {item.number}</span><small>{item.purpose}</small></Button>)}</div>
          <div className="floor-summary"><div><h2>Tầng {floor} <span>{admin.floors.find(item => item.number === floor)?.purpose}</span></h2><p>{floorSlots.length} slot gốc <span>·</span> {floorSlots.length - floorGroups.reduce((sum, group) => sum + group.slotIds.length - 1, 0)} mặt bằng <span>·</span> {fmt(floorSlots.reduce((sum, slot) => sum + slot.area, 0))} m²</p></div><span className="text-note">6 tầng cố định</span></div>
          <div className="space-layout">
            <AdminPanel className="plan-panel" labelledBy="plan-heading">
              <div className="section-toolbar"><div className="segmented"><Button variant="quiet" id="plan-heading" aria-pressed={planTab === "plan"} className={planTab === "plan" ? "is-active" : ""} onClick={() => setPlanTab("plan")}><Icon name="plan" size={16}/>Sơ đồ tương tác</Button><Button variant="quiet" aria-pressed={planTab === "reference"} className={planTab === "reference" ? "is-active" : ""} onClick={() => setPlanTab("reference")}>Bản vẽ tham chiếu</Button></div><span className="plan-scale">Không theo tỷ lệ kỹ thuật</span></div>
              {planTab === "plan" ? <>
                {currentFloorPlan ? <FloorPlanMap
                  ariaLabel={`Sơ đồ tham khảo tầng ${floor}`}
                  className={`approved-plan ${planStyles.planScroll}`}
                  variant="admin"
                  plan={currentFloorPlan}
                  slots={currentFloorPlan.slots}
                  selectedIds={selected}
                  showStatus
                  onSelect={item => { const slot = floorSlots.find(candidate => candidate.id === item.id); if (slot) choose(slot); }}
                /> : <Alert tone="warning">Chưa có dữ liệu sơ đồ tầng {floor} trong hệ thống.</Alert>}
                </> : <div className="reference-view">{currentFloorPlan?.sourceDocument === "le-grande-brochure.pdf" && currentFloorPlan.sourcePage ? <a href={`${r2AssetUrl(BROCHURE_PATH)}#page=${currentFloorPlan.sourcePage}`} target="_blank" rel="noopener noreferrer">Mở brochure gốc · trang {currentFloorPlan.sourcePage}</a> : currentFloorPlan?.sourceDocument ? <span>Nguồn: {currentFloorPlan.sourceDocument}{currentFloorPlan.sourcePage ? ` · PDF trang ${currentFloorPlan.sourcePage}` : ""}{currentFloorPlan.sourceSheet ? ` (${currentFloorPlan.sourceSheet})` : ""}</span> : <span>Chưa có nguồn tham chiếu trong dữ liệu tầng.</span>}</div>}
              <p className="plan-caption">Sơ đồ diễn giải theo tài liệu tham khảo, không phải bản vẽ khảo sát. Còn trống là trạng thái chưa thuê; giữ chỗ được quản lý riêng và vẫn khóa các thao tác xung đột.</p>
            </AdminPanel>
            <aside className="space-inspector" aria-label="Chi tiết lựa chọn">
              <div className="inspector-title"><h3>{activeGroup ? "Mặt bằng đã ghép" : selected.length > 1 ? "Ghép mặt bằng" : "Chi tiết slot"}</h3>{selected.length > 0 && <Button variant="quiet" className="icon-button" aria-label="Bỏ chọn tất cả slot" onClick={() => notes.navigate(() => { setSpaceEditor(null); setSelected([]); })}><Icon name="close" size={17}/></Button>}</div>
              {!selected.length ? <div className="selection-empty"><Icon name="plan" size={32}/><h4>Chọn slot trên sơ đồ</h4><p>Chọn một slot để xem chi tiết, hoặc nhiều slot đủ điều kiện để ghép mặt bằng.</p></div> : <>
                <div className="selection-chips">{selectedSlots.map((slot) => <span key={slot.id}>{slot.code}{!activeGroup && <Button variant="quiet" aria-label={`Bỏ chọn ${slot.code}`} onClick={() => choose(slot)}><Icon name="close" size={12}/></Button>}</span>)}</div>
                <div className="inspector-slot-links">{selectedSlots.map(slot => <Button key={slot.id} variant="quiet" onClick={() => openSlot(slot.id)}>Hồ sơ {slot.code}<Icon name="arrow" size={14}/></Button>)}</div>
                <div className="selected-area"><span>Tổng diện tích</span><strong>{fmt(area)} <small>m²</small></strong></div>
                <div className="selection-facts"><span>Tầng <strong>{floor}</strong></span><span>Slot gốc <strong>{selectedSlots.length}</strong></span></div>
                <Button variant="primary" disabled={pending || loading || protectedSelection || !selectedSlots.length || selectedSlots.some(slot => slot.status === "Đã thuê")} onClick={() => workspace.openAction({ kind: "request", floor, slotIds: selected })}>Lập yêu cầu thuê cho lựa chọn này</Button>
                {activeGroup || selected.length === 1 ? <>
                  {protectedSelection && <Alert tone="warning">{problem}</Alert>}
                  <dl className="slot-dossier-facts">
                    {activeGroup && <div><dt>Tên mặt bằng</dt><dd>{activeGroup.name}</dd></div>}
                    <div><dt>Trạng thái</dt><dd><Status value={activeGroup?.status ?? selectedSlots[0]?.status}/></dd></div>
                    {!activeGroup && <div><dt>Tenant / Đối tác</dt><dd>{selectedSlots[0]?.tenant || "Chưa có đối tác"}</dd></div>}
                  </dl>
                  <Button variant="primary" className="button primary full" disabled={liveSession.role !== "administrator" || pending || loading || protectedSelection || admin.screenData?.revision == null} onClick={() => void openSpaceEditor("edit")}>Sửa {activeGroup ? "mặt bằng" : "slot"}</Button>
                  {activeGroup && <Button variant="secondary" className="button secondary full split-button" disabled={pending || loading || protectedSelection || admin.screenData?.revision == null} onClick={() => void openSplit()}><Icon name="split" size={17}/>Tách về {selectedSlots.length} slot gốc</Button>}
                </> : <>
                  <Alert tone={problem ? "warning" : "success"}>{problem ?? "Slot liền kề, cùng tầng, không đi qua sảnh. Có thể ghép mặt bằng."}</Alert>
                  <Button variant="primary" className="button primary full" disabled={pending || loading || !!problem || admin.screenData?.revision == null} onClick={() => void openSpaceEditor("merge")}><Icon name="merge" size={17}/>Ghép {selected.length} slot</Button>
                  <p className="inspector-note">Giữ nguyên mã slot và diện tích gốc. Có thể tách lại sau khi ghép.</p>
                </>}
              </>}
            </aside>
          </div>
          <AdminPanel className="slot-register" labelledBy="register-heading">
            <div className="register-heading"><h2 id="register-heading">Danh sách slot <span>{floorSlots.length}</span></h2><div className="filters"><label className="search-field"><Icon name="search" size={17}/><span className="sr-only">Tìm slot hoặc đối tác</span><Input value={slotQuery} onChange={(event) => setSlotQuery(event.target.value)} placeholder="Tìm slot, đối tác…"/></label><label><span className="sr-only">Lọc trạng thái slot</span><Select value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)}><option value="">Tất cả trạng thái</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</Select></label></div></div>
            <PaginatedContent layoutKey={slotPages.pageSize}><p className="table-scroll-hint">Vuốt ngang để xem đầy đủ thông tin slot.</p><Table viewportLabel="Danh sách slot, có thể cuộn ngang" rows={slotPages.rows} getRowKey={slot => slot.id} getRowClassName={slot => selected.includes(slot.id) ? "selected-row" : undefined} emptyLabel="Không tìm thấy slot phù hợp." columns={[
              { id: "select", header: "Chọn", cell: slot => <Checkbox checked={selected.includes(slot.id)} onChange={() => choose(slot)} aria-label={`Chọn slot ${slot.code}`}/> },
              { id: "code", header: "Slot gốc", cell: slot => <><strong>{slot.code}</strong><small>Tầng {slot.floor}</small></> },
              { id: "area", header: "Diện tích", cell: slot => `${fmt(slot.area)} m²` },
              { id: "size", header: "Kích thước", cell: slot => `${slot.width} × 20,5 m` },
              { id: "status", header: "Trạng thái", cell: slot => <Status value={floorGroups.find(group => group.slotIds.includes(slot.id))?.status ?? slot.status}/> },
              { id: "tenant", header: "Mặt bằng / đối tác", cell: slot => { const group = floorGroups.find(group => group.slotIds.includes(slot.id)); return group ? <span className="group-reference"><Icon name="merge" size={14}/>{group.name}<small>{group.slotIds.map(id => floorSlots.find(item => item.id === id)?.code).join(" + ")}</small></span> : slot.tenant || <span className="muted">Chưa có đối tác</span>; } },
              { id: "action", header: "Thao tác", cell: slot => <Button variant="quiet" className="text-button" aria-label={`Chi tiết slot ${slot.code}`} onClick={() => openSlot(slot.id)}>Chi tiết<Icon name="arrow" size={14}/></Button> },
            ]}/>
            </PaginatedContent><AdminPagination state={slotPages} label="slot"/>
          </AdminPanel>
        </>}

        <Suspense fallback={<LoadingIndicator label="Đang tải dữ liệu…" />}>
          {view === "leads" && <LeadsWorkspace data={admin} onMessage={setMessage} mode="list"/>}
          {view === "media" && <MediaWorkspace data={admin} onMessage={setMessage} mode="list"/>}
          {view === "settings" && canManageAccounts && !loading && <AdminSettingsWorkspace data={admin} onMessage={setMessage} canManageAccounts={canManageAccounts}/>}
        </Suspense>
        <div ref={detailHost} className="admin-dialog-host admin-record-detail-host"/>
        <Sheet open={!!record} onOpenChange={open => { if (!open) workspace.closeDetail(); }} title={record ? detailLabels[record.kind] : "Chi tiết hồ sơ"} description="Hồ sơ liên quan trong ngữ cảnh đang làm việc." closeLabel="Đóng hồ sơ về danh sách" portalContainer={detailHost}>
          {record && <>
            <div className="admin-detail-navigation">{workspace.canGoBack && <Button variant="quiet" disabled={pending} onClick={workspace.back}>Quay lại hồ sơ trước</Button>}<Button variant="quiet" disabled={pending} onClick={workspace.closeDetail}>Về {labels[view].toLowerCase()}</Button></div>
            <Suspense fallback={<LoadingIndicator label="Đang tải hồ sơ…"/>}><AdminDetailView key={`${record.kind}:${record.id}`} record={record} onMessage={setMessage} canEditBusinessStatus={canManageAccounts}/></Suspense>
            <Suspense fallback={<LoadingIndicator label="Đang mở biểu mẫu…"/>}>{workflowAction}</Suspense>
          </>}
        </Sheet>
        {!record && <Suspense fallback={<LoadingIndicator label="Đang mở biểu mẫu…"/>}>{workflowAction}</Suspense>}
        {spaceEditor && <AdminEditor data={admin} title={spaceEditor.kind === "merge" ? `Ghép ${spaceEditor.slots.length} slot` : spaceEditor.group ? "Cập nhật nhóm ghép" : `Cập nhật slot ${spaceEditor.slot.code}`} description={spaceEditor.kind === "merge" ? "Giữ nguyên mã slot và diện tích gốc. Có thể tách lại sau khi ghép." : "Thay đổi chỉ áp dụng sau khi lưu; mặt bằng có giữ chỗ hoặc hợp đồng không được sửa trực tiếp."} saveLabel={spaceEditor.kind === "merge" ? `Ghép ${spaceEditor.slots.length} slot` : "Lưu thay đổi"} onClose={() => setSpaceEditor(null)} onSave={saveSpace}>
          {spaceEditor.kind === "merge" ? <>
            <p>{spaceEditor.slots.map(slot => slot.code).join(" + ")} · Tầng {spaceEditor.floor} · {fmt(spaceEditor.slots.reduce((sum, slot) => sum + slot.area, 0))} m²</p>
            <label>Tên mặt bằng ghép<Input name="name" maxLength={80} defaultValue={spaceEditor.name} placeholder="Ví dụ: Mặt bằng B.2–B.3" required/></label>
          </> : <>
            {spaceEditor.group && <label>Tên mặt bằng<Input name="name" maxLength={80} defaultValue={spaceEditor.group.name} required/></label>}
            <label>Tình trạng kinh doanh nội bộ<Select aria-label="Tình trạng kinh doanh nội bộ" name="status" defaultValue={spaceEditor.group?.status ?? spaceEditor.slot.status} required>{INTERNAL_BUSINESS_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</Select></label>
            {!spaceEditor.group && <label>Tenant / Đối tác<Input name="tenant" maxLength={80} defaultValue={spaceEditor.slot.tenant} placeholder="Chưa có đối tác"/></label>}
            {!spaceEditor.group && <label>Diện tích · m²<Input name="area" type="number" min={0.01} max={100000} step="0.01" defaultValue={spaceEditor.slot.area} required/></label>}
          </>}
        </AdminEditor>}
        </>}
        </div>
        <div ref={dialogContainer} className="admin-dialog-host"/>
    </LeGrandeAdminShell></AdminWorkspaceNavigationProvider>;
}

function AdminDetailView({ record, onMessage, canEditBusinessStatus }: { record: AdminRecordTarget; onMessage: (message: string, tone?: ToastTone) => void; canEditBusinessStatus: boolean }) {
  const workspace = useAdminWorkspaceNavigation();
  const screen = record.kind === "slot" || record.kind === "requests" || record.kind === "leases" ? record.kind : null;
  const data = useAdminData(screen, { id: record.id });
  if (record.kind === "slot") return <SlotDetail id={record.id} data={data} canEditBusinessStatus={canEditBusinessStatus} onMessage={onMessage} onSlot={id => workspace.openRecord({ kind: "slot", id, floor: record.floor })} onRecord={entry => workspace.openRecord({ kind: entry.view, id: entry.id })} onMedia={(id, scope) => id ? workspace.openRecord({ kind: "media", id }) : workspace.navigateView("media", { scope })}/>;
  if (record.kind === "leads") return <LeadsWorkspace mode="detail" record={record} data={data} onMessage={onMessage}/>;
  if (record.kind === "media") return <MediaWorkspace mode="detail" record={record} data={data} onMessage={onMessage}/>;
  return <B2BWorkspace view={record.kind} mode="detail" record={record} data={data} onMessage={onMessage}/>;
}

function AdminWorkflowAction({ action, data, onMessage }: { action: AdminBusinessAction; data: AdminData; onMessage: (message: string, tone?: ToastTone) => void }) {
  if (action.kind === "lead") return <LeadActionHost key={`lead:${action.id ?? "new"}`} action={action} data={data} onMessage={onMessage}/>;
  if (action.kind === "qualify-lead") return <LeadQualificationHost key={`qualify:${action.leadId}:${action.mode}`} action={action} data={data} onMessage={onMessage}/>;
  return <BusinessActionHost key={JSON.stringify(action)} action={action} data={data} onMessage={onMessage}/>;
}
