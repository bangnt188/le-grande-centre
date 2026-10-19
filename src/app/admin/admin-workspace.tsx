"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FLOORS, SLOT_STATUSES, hasCommitment, isSlotStatus, mergeIssue } from "../../shared/admin/space-model";
import type { Floor, Slot } from "../../shared/admin/space-model";
import type { AdminScreenName, AdminScreenQuery } from "@/shared/admin/contracts";
import { useAdminData } from "@/features/admin/use-admin-data";
import { AdminSessionError, clearAdminSession, ensureSession, getSessionSnapshot, logoutSession, useAdminSession } from "@/features/admin/session";
import { BROCHURE_FLOORS, BROCHURE_UNITS, BROCHURE_PATH } from "@/features/public/brochure-leasing";
import { planStyle, planLabelStyle } from "@/features/public/leasing-plan-style";
import planStyles from "@/features/public/canva-pages.module.css";
import { r2AssetUrl } from "@/config/site";
import type { SlotRecordEntry } from "@/features/admin/slot-detail";

import { useRecordDetail } from "@/features/admin/use-record-detail";
import { useCompanyNotes } from "@/features/admin/use-company-notes";

import { FloorOverview } from "./content-overviews";
import { LeGrandeAdminShell } from "@/features/admin/le-grande-admin-shell";
import { AdminPanel, PaginatedContent, ConfirmDialog, Button, Input, Select, Checkbox, Badge, Table, Tabs, Breadcrumbs, LoadingIndicator, Alert, type ToastTone, type AdminNavigationItem } from "@mall/ui";
import { AdminNotificationsProvider, useAdminNotifications } from "@/features/admin/admin-notifications";
import { AdminPagination, useAdminPagination } from "@/features/admin/admin-pagination";
import type { B2BView } from "./b2b-workspace";

const MediaWorkspace = lazy(() => import("@/features/admin/media-workspace").then(m => ({ default: m.MediaWorkspace })));
const LeadsWorkspace = lazy(() => import("@/features/admin/admin-records").then(m => ({ default: m.LeadsWorkspace })));
const AdminSettingsWorkspace = lazy(() => import("@/features/admin/admin-records").then(m => ({ default: m.AdminSettingsWorkspace })));
const B2BWorkspace = lazy(() => import("./b2b-workspace"));
const SlotDetail = lazy(() => import("@/features/admin/slot-detail"));
const TenantOverview = lazy(() => import("./content-overviews").then(m => ({ default: m.TenantOverview })));

type View = "slot" | "floors" | "tenants" | "spaces" | "leads" | "media" | "settings" | B2BView;
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
  const tone = value === "Còn trống" || value === "Trống" ? "success" : value === "Liên hệ" ? "warning" : "action";
  return <Badge className="slot-state-badge" data-slot-status={value} tone={tone}>{value}</Badge>;
}
const fmt = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const labels: Record<View, string> = { slot: "Hồ sơ slot", floors: "Tầng", tenants: "Khách đang thuê", customers: "Doanh nghiệp", requests: "Yêu cầu & giữ chỗ", leases: "Hợp đồng", appointments: "Lịch hẹn", spaces: "Căn / Mặt bằng", leads: "Khách tiềm năng", media: "Media", settings: "Cấu hình" };


export default function AdminWorkspace() {
  return <AdminNotificationsProvider><AdminWorkspaceContent/></AdminNotificationsProvider>;
}
function AdminWorkspaceContent() {
  const router = useRouter();
  const [view, setActiveView] = useState<View>("floors");
  const [leavingSession, setLeavingSession] = useState(false);
  const [slotId, setSlotId] = useState("");
  const [recordEntry, setRecordEntry] = useState<SlotRecordEntry | undefined>();
  const [floor, setFloor] = useState<Floor>(2);
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

  const [reqPage, setReqPage] = useState(1);
  const [reqFilter, setReqFilter] = useState("");
  const [lPage, setLPage] = useState(1);
  const [lCompany, setLCompany] = useState("");
  const [lQuery, setLQuery] = useState("");
  const [tenantPage, setTenantPage] = useState(1);
  const [tenantQuery, setTenantQuery] = useState("");

  const activeScreen: AdminScreenName | null =
    view === "floors" ? "floors" :
    view === "spaces" ? "spaces" :
    view === "slot" ? "slot" :
    view === "tenants" ? "tenants" :
    view === "requests" ? "requests" :
    view === "leases" ? "leases" :
    view === "settings" ? "settings" :
    null;

  const screenQuery = useMemo<AdminScreenQuery>(() => {
    if (view === "spaces") return { floor };
    if (view === "slot") return slotId ? { id: slotId } : {};
    if (view === "requests") return { page: reqPage, status: reqFilter || undefined };
    if (view === "leases") return { page: lPage, query: lQuery || undefined, companyId: lCompany || undefined };
    if (view === "tenants") return { page: tenantPage, query: tenantQuery || undefined };
    return {};
  }, [view, floor, slotId, reqPage, reqFilter, lPage, lQuery, lCompany, tenantPage, tenantQuery]);

  const admin = useAdminData(activeScreen, screenQuery);
  const details = useRecordDetail(view);
  const notes = useCompanyNotes(admin.execute, admin.hasUnsavedDrafts);
  const dialogContainer = useRef<HTMLDivElement>(null);
  const { slots, groups, pending, loading, error, execute, reload } = admin;
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [spaceDirty, setSpaceDirty] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const { markDraft } = admin;
  useEffect(() => {
    if (view !== "spaces" && spaceDirty) { setSpaceDirty(false); setGroupName(""); }
    markDraft("space-inspector", view === "spaces" && spaceDirty);
    return () => markDraft("space-inspector", false);
  }, [view, spaceDirty, markDraft]);
  const { notify } = useAdminNotifications();
  function setMessage(message: string, tone: ToastTone = "success") { if (message) notify(message, tone); }
  useEffect(() => { if (error) notify(error, "error"); }, [error, notify]);
  const [planTab, setPlanTab] = useState<"plan" | "reference">("plan");
  const [slotQuery, setSlotQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [activeMedia, setActiveMedia] = useState<string | undefined>();
  const [uploadScope, setUploadScope] = useState("Toàn dự án");
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const previousView = useRef<View>("floors");
  const historyIndex = useRef(0);
  const pendingHistoryDelta = useRef(0);
  const restoringHistory = useRef(false);
  useEffect(() => {
    const scrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const syncLocation = () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const state = window.history.state;
      historyIndex.current = state?.leasingIndex ?? historyIndex.current;
      const savedFloor = state?.leasingFloor;
      setRecordEntry(state?.leasingRecord);
      if (FLOORS.includes(savedFloor)) setFloor(savedFloor);
      if (hash.has("slot")) {
        const id = hash.get("slot") ?? "";
        setSlotId(id); setActiveView("slot");
        if (!FLOORS.includes(savedFloor)) {
          const linkedFloor = Number(/^T([1-6])-B\d+$/.exec(id)?.[1]) as Floor;
          if (FLOORS.includes(linkedFloor)) setFloor(linkedFloor);
        }
      } else {
        const next = state?.leasingView;
        setActiveView(next && next !== "slot" && Object.hasOwn(labels, next) && (canManageAccounts || next !== "settings") ? next : "spaces");
      }
    };
    historyIndex.current = window.history.state?.leasingIndex ?? 0;
    window.history.replaceState({ ...window.history.state, leasingIndex: historyIndex.current }, "");
    if (new URLSearchParams(window.location.hash.slice(1)).has("slot")) syncLocation();
    else window.history.replaceState({ ...window.history.state, leasingView: "floors", leasingFloor: 2 }, "");
    const onHistory = () => {
      if (restoringHistory.current) { restoringHistory.current = false; return; }
      const delta = (window.history.state?.leasingIndex ?? historyIndex.current) - historyIndex.current;
      let proceeded = false;
      notesRef.current.navigate(() => {
        proceeded = true; pendingHistoryDelta.current = 0;
        void ensureSession({ userAction: true }).then(syncLocation).catch(issue => setMessage(issue instanceof Error ? issue.message : "Không thể tải phiên.", "error"));
      });
      if (!proceeded) pendingHistoryDelta.current = delta;
    };
    window.addEventListener("popstate", onHistory);
    return () => { window.removeEventListener("popstate", onHistory); window.history.scrollRestoration = scrollRestoration; };
  }, []);
  useEffect(() => {
    if (loading) return;
    if (view === "slot" || previousView.current === "slot") {
      const heading = details.scopeRef.current?.querySelector<HTMLElement>("h1");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start" });
    }
    previousView.current = view;
  }, [view, slotId, loading, details.scopeRef]);
  async function setView(next: View, entry?: SlotRecordEntry) {
    if (next === "settings" && !canManageAccounts) return;
    try {
      await ensureSession({ userAction: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Phiên đăng nhập hết hạn.", "error");
      return;
    }
    if (next !== view) {
      window.history.replaceState({ ...window.history.state, leasingView: view, leasingFloor: floor, leasingRecord: recordEntry }, "");
      window.history.pushState({ ...window.history.state, leasingIndex: ++historyIndex.current, leasingView: next, leasingFloor: floor, leasingRecord: entry }, "", "#admin-workspace");
    }
    setRecordEntry(entry);
    setActiveView(next);
  }
  function openSlot(id: string) {
    notes.navigate(async () => {
      try {
        await ensureSession({ userAction: true });
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Phiên đăng nhập hết hạn.", "error");
        return;
      }
      if (view === "slot" && slotId === id) return;
      window.history.replaceState({ ...window.history.state, leasingView: view, leasingFloor: floor }, "");
      window.history.pushState({ ...window.history.state, leasingIndex: ++historyIndex.current, leasingView: "slot", leasingFloor: floor }, "", `#slot=${encodeURIComponent(id)}`);
      setSlotId(id); setActiveView("slot");
    });
  }

  const floorSlots = slots.filter((slot) => slot.floor === floor);
  const floorGroups = groups.filter((group) => group.floor === floor);
  const selectedSlots = floorSlots.filter((slot) => selected.includes(slot.id));
  const activeGroup = floorGroups.find((group) => group.slotIds.length === selected.length && group.slotIds.every((id) => selected.includes(id)));
  const protectedSelection = hasCommitment(admin, selected);
  const problem = protectedSelection ? "Mặt bằng có giữ chỗ hoặc hợp đồng. Xử lý hồ sơ nghiệp vụ trước khi sửa hoặc ghép/tách." : mergeIssue(slots, groups, selected, floor);
  const area = selectedSlots.reduce((sum, slot) => sum + slot.area, 0);
  const statusOptions = SLOT_STATUSES;

  async function changeFloor(next: Floor) {
    try { await ensureSession({ userAction: true }); }
    catch (issue) { setMessage(issue instanceof Error ? issue.message : "Không thể tải phiên.", "error"); return false; }
    setSpaceDirty(false); setFloor(next); setSelected([]); setSlotQuery(""); setSlotFilter(""); setGroupName("");
    return true;
  }
  function choose(slot: Slot) {
    notes.navigate(() => {
      setSpaceDirty(false);
      const group = floorGroups.find(item => item.slotIds.includes(slot.id));
      if (group) { setSelected(group.slotIds); setGroupName(group.name); return; }
      const next = selected.some(id => floorGroups.some(item => item.slotIds.includes(id)))
        ? [slot.id] : selected.includes(slot.id) ? selected.filter(id => id !== slot.id) : [...selected, slot.id];
      setSelected(next);
      setGroupName(`Mặt bằng ${floorSlots.filter(item => next.includes(item.id)).map(item => item.code).join("–")}`);
    });
  }
  async function merge() {
    const issue = protectedSelection ? problem : mergeIssue(slots, groups, selected, floor);
    if (issue || !groupName.trim()) { setMessage(issue ?? "Nhập tên mặt bằng trước khi ghép.", "warning"); return; }
    if (await execute({ type: "merge", floor, slotIds: selected, name: groupName.trim() })) {
      setSpaceDirty(false);
      setMessage(`Đã ghép ${selectedSlots.map((slot) => slot.code).join(" + ")} thành ${fmt(area)} m². Slot gốc được giữ nguyên.`);
    }
  }
  async function split() {
    if (!activeGroup) return;
    if (await execute({ type: "split", groupId: activeGroup.id })) {
      setSpaceDirty(false); setSplitOpen(false);
      setMessage(`Đã tách ${activeGroup.name}. Slot giữ trạng thái ${activeGroup.status}; media của nhóm chuyển về tầng ${activeGroup.floor}.`);
    }
  }
  async function saveSpace(form: HTMLFormElement) {
    if (protectedSelection) return;
    const fields = new FormData(form);
    const status = String(fields.get("status") ?? "").trim();
    const tenant = String(fields.get("tenant") ?? "").trim();
    const name = String(fields.get("name") ?? "").trim();
    if (!isSlotStatus(status) || (activeGroup && !name)) { setMessage("Chọn Còn trống, Liên hệ hoặc Đã thuê và nhập tên mặt bằng.", "warning"); return; }
    const command = activeGroup
      ? { type: "update-group" as const, groupId: activeGroup.id, name, status }
      : { type: "update-slot" as const, slotId: selected[0], status, tenant, area: Number(fields.get("area")) };
    if (await execute(command)) { setSpaceDirty(false); setMessage("Đã cập nhật dữ liệu."); }
  }
  const visibleSlots = floorSlots.filter((slot) => {
    const group = floorGroups.find((item) => item.slotIds.includes(slot.id));
    return `${slot.code} ${group?.name ?? ""} ${slot.tenant}`.toLowerCase().includes(slotQuery.toLowerCase()) && (!slotFilter || (group?.status ?? slot.status) === slotFilter);
  });
  const slotPages = useAdminPagination(visibleSlots, `${floor}:${slotQuery}:${slotFilter}`);

  const primaryViews: View[] = ["floors", "spaces", "customers", "leads", "requests", "appointments", "media", ...(canManageAccounts ? ["settings" as const] : [])];
  const companyView = view === "customers" || view === "tenants" || view === "leases";
  function openSpace(nextFloor: Floor, slotId?: string) {
    notes.navigate(async () => {
      if (!await changeFloor(nextFloor)) return;
      if (slotId) setSelected([slotId]);
      await setView("spaces");
    });
  }
  async function openFloorSelection(nextFloor: Floor, ids: string[]) {
    try {
      await ensureSession({ userAction: true });
      setFloor(nextFloor); setSelected(ids); await setView("spaces");
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : "Không thể tải phiên.", "error"); }
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
    destination: { kind: "action", onSelect: () => notes.navigate(() => { void setView(item); }) }
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

  return <LeGrandeAdminShell propertyName={admin.settings?.propertyName} navigation={navigation} activeItemId={view === "slot" ? "spaces" : companyView ? "customers" : view} onLogout={() => { setLeavingSession(true); notes.navigate(() => { void logout(); }); }} location={<Breadcrumbs label="Vị trí quản trị" items={[{ label: "Quản trị", href: "#admin-workspace", linkProps: { onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); notes.navigate(() => setView("floors")); } } }, ...(view === "slot" ? [{ label: `Căn / Mặt bằng · Tầng ${floor}`, href: "#admin-workspace", linkProps: { onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); notes.navigate(() => setView("spaces")); } } }, { label: slotId || "Slot không xác định", href: `#slot=${encodeURIComponent(slotId)}`, current: true }] : companyView ? [{ label: "Doanh nghiệp", href: "#admin-workspace", linkProps: { onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); notes.navigate(() => setView("customers")); } } }, { label: view === "customers" ? "Tất cả" : labels[view], href: "#admin-workspace", current: true }] : [{ label: labels[view], href: "#admin-workspace", current: true }])]}/>}>
        <div ref={dialogContainer} className="admin-dialog-host"/>
        <ConfirmDialog open={splitOpen && !!activeGroup} title="Tách mặt bằng ghép?" description={activeGroup ? `${activeGroup.name} sẽ trở về ${selectedSlots.length} slot gốc. Media liên kết nhóm chuyển về tầng ${floor}; trạng thái được giữ nguyên.` : ""} confirmLabel="Xác nhận tách" cancelLabel="Giữ nhóm" onClose={() => { if (!pending) setSplitOpen(false); }} onConfirm={() => void split()} portalContainer={dialogContainer}/>
        <ConfirmDialog open={!!notes.pendingNavigation} title={leavingSession ? "Đăng xuất?" : "Có thay đổi chưa lưu"} description={leavingSession ? "Đăng xuất sẽ bỏ những thay đổi chưa lưu. Dữ liệu đã lưu vẫn được giữ trên hệ thống." : "Tiếp tục có thể bỏ các thay đổi đang sửa. Chọn Ở lại để lưu trước."} confirmLabel={leavingSession ? "Đăng xuất, bỏ thay đổi" : "Tiếp tục điều hướng"} cancelLabel="Ở lại" onClose={() => {
          const delta = pendingHistoryDelta.current;
          pendingHistoryDelta.current = 0;
          if (delta) { restoringHistory.current = true; window.history.go(-delta); }
          notes.stay();
          setLeavingSession(false);
        }} onConfirm={notes.continue} portalContainer={dialogContainer}/>
        <div ref={details.scopeRef}>
        {sessionGate}
        {liveSession && <>


        {view === "floors" && !loading && slots.length > 0 && <FloorOverview data={admin} onSpace={openSpace} onMessage={setMessage}/>}

        {view !== "slot" && loading && <LoadingIndicator label="Đang tải dữ liệu…"/>}
        {view !== "slot" && error && <Alert tone="error">{error}<Button variant="secondary" onClick={reload}>Thử lại</Button></Alert>}

        <Suspense fallback={<LoadingIndicator label="Đang tải dữ liệu…" />}>
          {view === "slot" && <SlotDetail key={slotId} id={slotId} data={admin} onBack={() => notes.navigate(() => setView("spaces"))} onSlot={openSlot} onMessage={setMessage} onRecord={entry => notes.navigate(() => setView(entry.view, entry))} onMedia={(id, scope) => notes.navigate(() => { setActiveMedia(id); setUploadScope(scope ?? "Toàn dự án"); setView("media"); })}/>}
          {companyView && <Tabs className="company-module-tabs" label="Các phần quản lý doanh nghiệp" scrollable value={view} onValueChange={value => { if (value === "customers" || value === "tenants" || value === "leases") notes.navigate(() => { void setView(value); }); }} items={[
            { value: "customers", label: "Tất cả", content: <B2BWorkspace view="customers" entry={recordEntry} data={admin} notes={notes} onView={setView} onMessage={setMessage} onFloor={(nextFloor, ids) => notes.navigate(() => openFloorSelection(nextFloor, ids))}/> },
            { value: "tenants", label: "Khách đang thuê", content: <TenantOverview data={admin} onSpace={openSpace} onMessage={setMessage} tenantPage={tenantPage} setTenantPage={setTenantPage} tenantQuery={tenantQuery} setTenantQuery={setTenantQuery}/> },
            { value: "leases", label: "Hợp đồng", content: <B2BWorkspace view="leases" entry={recordEntry} data={admin} notes={notes} onView={setView} onMessage={setMessage} onFloor={(nextFloor, ids) => notes.navigate(() => openFloorSelection(nextFloor, ids))} leasePage={lPage} setLeasePage={setLPage} leaseCompany={lCompany} setLeaseCompany={setLCompany} leaseQuery={lQuery} setLeaseQuery={setLQuery}/> },
          ]}/>}
          {(view === "requests" || view === "appointments") && <B2BWorkspace view={view} entry={recordEntry} data={admin} notes={notes} onView={setView} onMessage={setMessage} onFloor={(nextFloor, ids) => notes.navigate(() => openFloorSelection(nextFloor, ids))} requestPage={reqPage} setRequestPage={setReqPage} requestFilter={reqFilter} setRequestFilter={setReqFilter} leasePage={lPage} setLeasePage={setLPage} leaseCompany={lCompany} setLeaseCompany={setLCompany} leaseQuery={lQuery} setLeaseQuery={setLQuery}/>}
        </Suspense>

        {view === "spaces" && <>
          <div className="floor-nav" role="group" aria-label="Chọn tầng">{admin.floors.map(item => <Button variant="quiet" className={`floor-tab ${floor === item.number ? "is-active" : ""}`} aria-pressed={floor === item.number} key={item.number} onClick={() => notes.navigate(() => changeFloor(item.number))}><span>Tầng {item.number}</span><small>{item.purpose}</small></Button>)}</div>
          <div className="floor-summary"><div><h2>Tầng {floor} <span>{admin.floors.find(item => item.number === floor)?.purpose}</span></h2><p>{floorSlots.length} slot gốc <span>·</span> {floorSlots.length - floorGroups.reduce((sum, group) => sum + group.slotIds.length - 1, 0)} mặt bằng <span>·</span> {fmt(floorSlots.reduce((sum, slot) => sum + slot.area, 0))} m²</p></div><span className="text-note">6 tầng cố định</span></div>
          <div className="space-layout">
            <AdminPanel className="plan-panel" labelledBy="plan-heading">
              <div className="section-toolbar"><div className="segmented"><Button variant="quiet" id="plan-heading" aria-pressed={planTab === "plan"} className={planTab === "plan" ? "is-active" : ""} onClick={() => setPlanTab("plan")}><Icon name="plan" size={16}/>Sơ đồ tương tác</Button><Button variant="quiet" aria-pressed={planTab === "reference"} className={planTab === "reference" ? "is-active" : ""} onClick={() => setPlanTab("reference")}>Bản vẽ tham chiếu</Button></div><span className="plan-scale">Không theo tỷ lệ kỹ thuật</span></div>
              {planTab === "plan" ? <>
                <div className={`approved-plan ${planStyles.planScroll}`} tabIndex={0} role="region" aria-label={`Sơ đồ tầng ${floor} theo brochure`}><div className={planStyles.plan}>
                  {BROCHURE_FLOORS.find(item => item.id === floor)?.sharedAreas.map((space, index) => <div key={index} className={planStyles.sharedArea} style={planStyle(space)}>{space.label}</div>)}
                  {BROCHURE_UNITS.filter(item => item.floorId === floor).map(unit => { const slot = floorSlots.find(item => item.code === unit.id); if (!slot) return null; return <button type="button" key={unit.id} className={planStyles.planSlot} data-slot-status={slot.status} style={planStyle(unit.plan)} aria-pressed={selected.includes(slot.id)} aria-label={`${unit.id}, ${fmt(slot.area)} mét vuông, ${slot.status}`} onClick={() => choose(slot)}><span className={planStyles.slotLabel} style={planLabelStyle(unit.plan)}><strong>{unit.id}</strong><span>{fmt(slot.area)} m²</span><span>{slot.status}</span></span></button>; })}
                </div></div>
              </> : <div className="reference-view"><a href={r2AssetUrl(BROCHURE_PATH)} target="_blank" rel="noopener noreferrer">Mở brochure gốc · Trang {BROCHURE_FLOORS.find(item => item.id === floor)?.sourcePage}</a></div>}
              <p className="plan-caption">Sơ đồ tham khảo theo brochure, không phải bản vẽ kỹ thuật. Còn trống là trạng thái chưa thuê; giữ chỗ được quản lý riêng và vẫn khóa các thao tác xung đột.</p>
            </AdminPanel>
            <aside className="space-inspector" aria-label="Chi tiết lựa chọn">
              <div className="inspector-title"><h3>{activeGroup ? "Mặt bằng đã ghép" : selected.length > 1 ? "Ghép mặt bằng" : "Chi tiết slot"}</h3>{selected.length > 0 && <Button variant="quiet" className="icon-button" aria-label="Bỏ chọn tất cả slot" onClick={() => notes.navigate(() => { setSpaceDirty(false); setSelected([]); })}><Icon name="close" size={17}/></Button>}</div>
              {!selected.length ? <div className="selection-empty"><Icon name="plan" size={32}/><h4>Chọn slot trên sơ đồ</h4><p>Chọn một slot để xem chi tiết, hoặc nhiều slot đủ điều kiện để ghép mặt bằng.</p></div> : <>
                <div className="selection-chips">{selectedSlots.map((slot) => <span key={slot.id}>{slot.code}{!activeGroup && <Button variant="quiet" aria-label={`Bỏ chọn ${slot.code}`} onClick={() => choose(slot)}><Icon name="close" size={12}/></Button>}</span>)}</div>
                <div className="inspector-slot-links">{selectedSlots.map(slot => <Button key={slot.id} variant="quiet" onClick={() => openSlot(slot.id)}>Hồ sơ {slot.id}<Icon name="arrow" size={14}/></Button>)}</div>
                <div className="selected-area"><span>Tổng diện tích</span><strong>{fmt(area)} <small>m²</small></strong></div>
                <div className="selection-facts"><span>Tầng <strong>{floor}</strong></span><span>Slot gốc <strong>{selectedSlots.length}</strong></span></div>
                {activeGroup || selected.length === 1 ? <form key={`${selected.join("-")}-${activeGroup?.id ?? "slot"}-${activeGroup?.status ?? selectedSlots[0]?.status}-${activeGroup?.name ?? selectedSlots[0]?.tenant}-${selectedSlots[0]?.area}`} onChange={() => setSpaceDirty(true)} onReset={() => setSpaceDirty(false)} onSubmit={event => { event.preventDefault(); void saveSpace(event.currentTarget); }}><fieldset disabled={pending || loading || protectedSelection}>
                  {protectedSelection && <Alert tone="warning">{problem}</Alert>}
                  {activeGroup && <label>Tên mặt bằng<Input name="name" maxLength={80} defaultValue={activeGroup.name} required/></label>}
                  <label>Trạng thái<Select aria-label="Trạng thái mặt bằng" name="status" defaultValue={activeGroup?.status ?? selectedSlots[0]?.status} required>{SLOT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</Select></label>
                  {!activeGroup && <label>Tenant / Đối tác<Input name="tenant" maxLength={80} defaultValue={selectedSlots[0]?.tenant} placeholder="Chưa có đối tác"/></label>}
                  {!activeGroup && <label>Diện tích · m²<Input name="area" type="number" min={0.01} max={100000} step="0.01" defaultValue={selectedSlots[0]?.area} required/></label>}
                  <Button variant="primary" loading={pending} loadingLabel="Đang lưu…" className="button primary full" disabled={pending || loading} type="submit">Lưu thay đổi</Button>
                  <Button variant="secondary" type="reset" disabled={pending || loading}>Hủy thay đổi</Button>
                  {spaceDirty && <p className="draft-status" role="status">Có thay đổi chưa lưu.</p>}
                  {activeGroup && <Button variant="secondary" className="button secondary full split-button" type="button" onClick={() => setSplitOpen(true)}><Icon name="split" size={17}/>Tách về {selectedSlots.length} slot gốc</Button>}
                </fieldset></form> : <>
                  <label>Tên mặt bằng ghép<Input value={groupName} maxLength={80} onChange={event => { setGroupName(event.target.value); setSpaceDirty(true); }} placeholder="Ví dụ: Mặt bằng B.2–B.3"/></label>
                  <Alert tone={problem ? "warning" : "success"}>{problem ?? "Slot liền kề, cùng tầng, không đi qua sảnh. Có thể ghép mặt bằng."}</Alert>
                  <Button variant="primary" className="button primary full" disabled={pending || loading || !!problem || !groupName.trim()} onClick={merge}><Icon name="merge" size={17}/>Ghép {selected.length} slot</Button>
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
              { id: "action", header: "Thao tác", cell: slot => <Button variant="quiet" className="text-button" aria-label={`Chi tiết slot ${slot.id}`} onClick={() => openSlot(slot.id)}>Chi tiết<Icon name="arrow" size={14}/></Button> },
            ]}/>
            </PaginatedContent><AdminPagination state={slotPages} label="slot"/>
          </AdminPanel>
        </>}

        <Suspense fallback={<LoadingIndicator label="Đang tải dữ liệu…" />}>
          {view === "leads" && !loading && <LeadsWorkspace data={admin} onMessage={setMessage} onFloor={next => openSpace(next)}/>}
          {view === "media" && !loading && <MediaWorkspace data={admin} onMessage={setMessage} initialMediaId={activeMedia} initialScope={uploadScope}/>}
          {view === "settings" && canManageAccounts && !loading && <AdminSettingsWorkspace data={admin} onMessage={setMessage} canManageAccounts={canManageAccounts}/>}
        </Suspense>
        </>}
        </div>
    </LeGrandeAdminShell>;
}
