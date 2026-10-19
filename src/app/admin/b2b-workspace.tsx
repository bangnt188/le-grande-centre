"use client";

import { useEffect, useRef, useState } from "react";
import { AdminPanel, Alert, PaginatedContent, WorkspaceLayout, Tabs, Button, Input, Select, Textarea, Table, Badge, EmptyState, ConfirmDialog, Modal, LoadingIndicator, type ToastTone } from "@mall/ui";
import { AdminPagination } from "@/features/admin/admin-pagination";
import { BusinessRecordEditor, isStoredPdf, type BusinessEditor } from "./b2b-editors";
import type { B2BCommand, Lease } from "@/shared/admin/b2b-model";
import type { AdminMediaDetail } from "@/shared/admin/contracts";
import { appointmentLabels, dateLabel, remainingLabel, requestLabels, slotCodes as formatSlotCodes, timeLabel } from "@/features/admin/record-labels";
import { useAdminData, type AdminData } from "@/features/admin/use-admin-data";
import type { SlotRecordEntry } from "@/features/admin/slot-detail";
import type { Floor } from "@/shared/admin/space-model";
import { FloorPlanMap } from "@/features/shared/floor-plan-map";
import { useRecordDetail } from "@/features/admin/use-record-detail";
import type { CompanyNotes } from "@/features/admin/use-company-notes";
import { CollectionFeedback, CompanyPicker, useAdminCollection, useAdminRecord, useRelatedCompanies } from "@/features/admin/admin-collections";
import { adminRequest, ensureSession } from "@/features/admin/session";
import { makeCacheKey, screenCache } from "@/features/admin/memory-cache";
import { parseMediaDetail } from "@/features/admin/http-repository";

export type B2BView = "customers" | "requests" | "leases" | "appointments";
type Props = {
  notes: CompanyNotes;
  view: B2BView; data: AdminData; entry?: SlotRecordEntry; onView: (view: B2BView, entry?: SlotRecordEntry) => void;
  onFloor: (floor: Floor, ids: string[]) => void; onMessage: (message: string, tone?: ToastTone) => void;
  requestPage?: number; setRequestPage?: (page: number) => void;
  requestFilter?: string; setRequestFilter?: (filter: string) => void;
  leasePage?: number; setLeasePage?: (page: number) => void;
  leaseQuery?: string; setLeaseQuery?: (query: string) => void;
  leaseCompany?: string; setLeaseCompany?: (company: string) => void;
};
const area = (value: number) => `${new Intl.NumberFormat("vi-VN").format(value)} m²`;
function Period({ start, end }: { start: string; end: string }) { return <>{dateLabel(start)} – {dateLabel(end)}</>; }
function Empty({ children }: { children: React.ReactNode }) { return <EmptyState title="Chưa có bản ghi phù hợp">{children}</EmptyState>; }
function ScreenFeedback({ data }: { data: AdminData }) { return <>{data.loading && <LoadingIndicator label="Đang tải hồ sơ…"/>}{data.error && <Alert tone="error">{data.error} <Button variant="quiet" onClick={() => void data.reload()}>Thử lại</Button></Alert>}</>; }

export default function B2BWorkspace(props: Props) {
  const { view, data, entry, notes, onView, onFloor, onMessage } = props;
  const details = useRecordDetail(view, view === "leases" ? 1200 : 1000);
  const dialogContainer = useRef<HTMLDivElement>(null);
  const documentDialogContainer = useRef<HTMLDivElement>(null);
  const [companyId, setCompanyId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [editor, setEditor] = useState<BusinessEditor | null>(null);
  const [actionError, setActionError] = useState("");
  const actionSequence = useRef(0);
  async function action(change: () => void | Promise<void>) {
    const sequence = ++actionSequence.current;
    try { await ensureSession({ userAction: true }); if (sequence !== actionSequence.current) return; setActionError(""); await change(); }
    catch (issue) { if (sequence === actionSequence.current) setActionError(issue instanceof Error ? issue.message : "Không thể thực hiện thao tác."); }
  }
  function openEditor(next: BusinessEditor, revision: number | null | undefined) {
    void action(() => { if (revision == null) throw new Error("Chưa tải phiên bản hồ sơ. Tải lại trước khi sửa."); notes.navigate(() => setEditor({ ...next, expectedRevision: revision })); });
  }
  const [localRequestPage, setLocalRequestPage] = useState(1);
  const [localRequestFilter, setLocalRequestFilter] = useState("");
  const [localLeasePage, setLocalLeasePage] = useState(1);
  const [localLeaseCompany, setLocalLeaseCompany] = useState("");
  const [localLeaseQuery, setLocalLeaseQuery] = useState("");
  const reqPage = props.requestPage ?? localRequestPage;
  const setReqPage = props.setRequestPage ?? setLocalRequestPage;
  const reqFilter = props.requestFilter ?? localRequestFilter;
  const setReqFilter = props.setRequestFilter ?? setLocalRequestFilter;
  const lPage = props.leasePage ?? localLeasePage;
  const setLPage = props.setLeasePage ?? setLocalLeasePage;
  const lCompany = props.leaseCompany ?? localLeaseCompany;
  const setLCompany = props.setLeaseCompany ?? setLocalLeaseCompany;
  const lQuery = props.leaseQuery ?? localLeaseQuery;
  const setLQuery = props.setLeaseQuery ?? setLocalLeaseQuery;
  const [query, setQuery] = useState("");
  const [appointmentQuery, setAppointmentQuery] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState("");
  const companyPages = useAdminCollection(data, "companies", { query }, view === "customers");
  const appointmentPages = useAdminCollection(data, "appointments", { query: appointmentQuery, status: appointmentStatus }, view === "appointments");
  const companyDetail = useAdminRecord(data, "companies", companyId, view === "customers");
  const company = companyDetail.item;
  const [companyTab, setCompanyTab] = useState<"overview" | "requests" | "contracts" | "documents">("overview");
  const [relationshipPage, setRelationshipPage] = useState(1);
  const companyRequests = useAdminData(view === "customers" && !!companyId && companyTab === "requests" ? "requests" : null, { companyId, page: relationshipPage, pageSize: 20 });
  const companyLeases = useAdminData(view === "customers" && !!companyId && (companyTab === "contracts" || companyTab === "documents") ? "leases" : null, { companyId, page: relationshipPage, pageSize: 20 });
  const requestOnPage = view === "requests" ? data.requests.find(item => item.id === requestId) : undefined;
  const leaseOnPage = view === "leases" ? data.leases.find(item => item.id === leaseId) : undefined;
  const outsideRequest = useAdminData(view === "requests" && !!requestId && !data.loading && !requestOnPage ? "requests" : null, { id: requestId });
  const outsideLease = useAdminData(view === "leases" && !!leaseId && !data.loading && !leaseOnPage ? "leases" : null, { id: leaseId });
  const requestData = requestOnPage ? data : outsideRequest;
  const leaseData = leaseOnPage ? data : outsideLease;
  const request = requestOnPage ?? outsideRequest.requests.find(item => item.id === requestId);
  const reservation = requestData.reservations.find(item => item.requestId === requestId);
  const lease = leaseOnPage ?? outsideLease.leases.find(item => item.id === leaseId);
  const requestRevision = requestData.screenData?.revision;
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const cancellation = useAdminRecord(data, "appointments", cancelAppointmentId, view === "appointments");
  const cancellationInFlight = useRef(false);
  const relatedCompanies = useRelatedCompanies(data, view === "appointments" ? [...appointmentPages.rows.map(item => item.companyId), cancellation.item?.companyId] : view === "requests" ? [request?.companyId, ...data.requests.map(item => item.companyId)].filter(id => !data.companies.some(item => item.id === id)) : view === "leases" ? [lease?.companyId, ...data.leases.map(item => item.companyId)].filter(id => !data.companies.some(item => item.id === id)) : [], view !== "customers");
  const companyName = (id: string) => data.companies.find(item => item.id === id)?.name ?? relatedCompanies.items.find(item => item.id === id)?.name ?? (company?.id === id ? company.name : relatedCompanies.loading ? "Đang tải doanh nghiệp…" : id);
  const slots = [...data.slots, ...requestData.slots, ...leaseData.slots, ...companyRequests.slots, ...companyLeases.slots];
  const slotCodes = (ids: string[]) => formatSlotCodes(ids, slots);
  function MiniPlan({ ids, floor }: { ids: string[]; floor: Floor }) {
    const plan = data.floorPlans.find(item => item.floor === floor);
    if (!plan) return null;
    return <FloorPlanMap className="b2b-mini-plan" ariaLabel={`Vị trí ${slotCodes(ids)} trên sơ đồ tham khảo tầng ${floor}`} plan={plan} slots={plan.slots} selectedIds={ids} variant="mini" showLabels={false} showArea={false} showStatus={false}/>;
  }
  const consumedEntry = useRef<SlotRecordEntry | undefined>(undefined);
  useEffect(() => {
    if (!entry || entry.view !== view || consumedEntry.current === entry) return;
    consumedEntry.current = entry;
    if (entry.view === "customers") { setCompanyId(entry.id); setCompanyTab("overview"); setRelationshipPage(1); }
    if (entry.view === "requests") setRequestId(entry.id);
    if (entry.view === "leases") setLeaseId(entry.id);
    details.openDetail(entry.view);
  }, [entry, view]);
  function goRecord(next: SlotRecordEntry, trigger?: HTMLElement) {
    void action(() => notes.navigate(() => {
      if (next.view === "customers") { setCompanyId(next.id); setCompanyTab("overview"); setRelationshipPage(1); }
      if (next.view === "requests") setRequestId(next.id);
      if (next.view === "leases") setLeaseId(next.id);
      onView(next.view, next); details.openDetail(next.view, trigger);
    }));
  }
  async function run(command: B2BCommand, message: string, revision: number | null | undefined) {
    if (revision == null) { setActionError("Chưa tải phiên bản hồ sơ. Tải lại trước khi lưu."); return; }
    if (await data.execute(command, revision)) onMessage(message);
  }
  async function confirmCancellation() {
    if (!cancellation.item || cancellation.revision == null || cancellationInFlight.current) return;
    cancellationInFlight.current = true;
    try { if (await data.execute({ type: "cancel-appointment", appointmentId: cancellation.item.id }, cancellation.revision)) { setCancelAppointmentId(null); onMessage("Đã hủy lịch hẹn. Cam kết trên mặt bằng không thay đổi."); } }
    finally { cancellationInFlight.current = false; }
  }
  function pagination(source: AdminData, page: number, select: (page: number) => void) {
    const info = source.screenPagination;
    return { page: info?.page ?? page, pageSize: info?.pageSize ?? 20, pageCount: info?.totalPages ?? 0, total: info?.totalItems ?? 0, start: ((info?.page ?? page) - 1) * (info?.pageSize ?? 20), setPage: (next: number) => { void action(() => select(next)); } };
  }
  const requestPages = pagination(data, reqPage, setReqPage);
  const leasePages = pagination(data, lPage, setLPage);
  const relationshipData = companyTab === "requests" ? companyRequests : companyLeases;
  const relationshipPages = pagination(relationshipData, relationshipPage, setRelationshipPage);
  const [documentLease, setDocumentLease] = useState<Lease | null>(null);
  const [documentResult, setDocumentResult] = useState<{ key: string; version: number; value: AdminMediaDetail } | null>(null);
  const [documentError, setDocumentError] = useState("");
  const documentId = documentLease?.documentMediaId;
  const documentKey = makeCacheKey(data.sessionKey, "", "media-detail", { id: documentId });
  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    setDocumentError("");
    screenCache.load<AdminMediaDetail>(documentKey, async signal => {
      const response = await adminRequest(`/api/admin/media/${encodeURIComponent(documentId)}/`, {}, { signal });
      return parseMediaDetail(await response.json());
    }, controller.signal).then(value => { if (!controller.signal.aborted) setDocumentResult({ key: documentKey, version: data.cacheVersion, value }); }).catch(issue => { if (!controller.signal.aborted) setDocumentError(issue instanceof Error ? issue.message : "Không tải được tài liệu."); });
    return () => controller.abort();
  }, [documentId, documentKey, data.cacheVersion]);
  const document = documentResult?.key === documentKey && documentResult.version === data.cacheVersion ? documentResult.value.item : null;
  const storedDocument = document && isStoredPdf(document) ? document : null;

  return <div ref={details.scopeRef} className="b2b-workspace">
    <div ref={dialogContainer} className="admin-dialog-host"/><div ref={documentDialogContainer} className="admin-dialog-host b2b-document-modal-host"/>
    {actionError && <Alert tone="error">{actionError}</Alert>}
    {view === "customers" && <><CollectionFeedback state={companyPages}/><CollectionFeedback state={companyDetail}/></>}
    {view === "appointments" && <><CollectionFeedback state={appointmentPages}/><CollectionFeedback state={cancellation}/></>}
    {view !== "customers" && <CollectionFeedback state={relatedCompanies}/>}
    <ConfirmDialog open={!!cancellation.item} title="Hủy lịch hẹn?" description={cancellation.item ? `${companyName(cancellation.item.companyId)} · ${dateLabel(cancellation.item.startsAt)} · ${cancellation.item.purpose}. Giữ chỗ và hợp đồng không thay đổi.` : ""} confirmLabel={data.pending ? "Đang hủy…" : "Xác nhận hủy lịch"} cancelLabel="Giữ lịch hẹn" onClose={() => { if (!cancellationInFlight.current) setCancelAppointmentId(null); }} onConfirm={() => void confirmCancellation()} portalContainer={dialogContainer}/>
    <Modal open={!!documentLease} onOpenChange={open => { if (!open) setDocumentLease(null); }} title="Xem tài liệu hợp đồng" description="Tài liệu lưu trước đây chỉ được mở khi bạn yêu cầu. Hợp đồng gốc mới lưu bên ngoài hệ thống." closeLabel="Đóng tài liệu" portalContainer={documentDialogContainer}>
      {documentError ? <Alert tone="error">{documentError} <Button onClick={() => void action(() => screenCache.markAllStale())}>Thử lại</Button></Alert> : storedDocument?.url ? <><p><a href={storedDocument.url} target="_blank" rel="noopener noreferrer">Mở PDF trong tab mới</a> · <a href={storedDocument.url} download={storedDocument.name}>Tải PDF</a></p><iframe className="b2b-document-pdf" src={storedDocument.url} title={storedDocument.name}/></> : documentId && !document ? <LoadingIndicator label="Đang tải tài liệu…"/> : <p>Hợp đồng gốc được lưu bên ngoài hệ thống.</p>}
    </Modal>
    {view === "customers" && <WorkspaceLayout className="b2b-dossier-layout" mobilePresentation="drilldown" detailOpen={details.open} onDetailOpenChange={open => void action(() => details.setOpen(open))} returnFocusRef={details.returnFocusRef} detailLabel="Hồ sơ doanh nghiệp" backLabel="Quay lại danh sách doanh nghiệp" primary={<section className="b2b-company-list records-panel" aria-label="Danh sách doanh nghiệp">
      <div className="b2b-panel-heading"><h2>Doanh nghiệp <span>{companyPages.total}</span></h2><Button variant="secondary" disabled={data.pending || companyPages.revision == null} onClick={() => openEditor({ kind: "company" }, companyPages.revision)}>Thêm doanh nghiệp</Button><label className="b2b-search"><span className="sr-only">Tìm doanh nghiệp</span><Input type="search" maxLength={200} placeholder="Tìm tên, ngành hàng…" value={query} onChange={event => { const next = event.target.value; void action(() => setQuery(next)); }}/></label></div>
      <PaginatedContent layoutKey={companyPages.pageSize}>{companyPages.rows.map(item => <Button variant="quiet" className={`b2b-company-row ${companyId === item.id ? "is-active" : ""}`} key={item.id} onClick={event => goRecord({ view: "customers", id: item.id }, event.currentTarget)} aria-pressed={companyId === item.id}><span className="lead-avatar">{item.initials}</span><span><strong>{item.name}</strong><small>{item.industry}</small><Badge tone={item.category === "Đang thuê" ? "action" : item.category === "Đang giữ chỗ" ? "warning" : "neutral"}>{item.category ?? "Chưa tải phân loại"}</Badge><span className="b2b-row-meta">{item.requestCount == null ? "Chưa tải số yêu cầu" : `${item.requestCount} yêu cầu`} · {item.leaseCount == null ? "Chưa tải số hợp đồng" : `${item.leaseCount} hợp đồng`}</span></span></Button>)}{!companyPages.loading && !companyPages.error && !companyPages.rows.length && <Empty>Không tìm thấy doanh nghiệp. <Button variant="quiet" onClick={() => void action(() => setQuery(""))}>Xóa tìm kiếm</Button></Empty>}</PaginatedContent><AdminPagination state={companyPages} label="doanh nghiệp"/>
    </section>} detail={<AdminPanel className="b2b-dossier records-panel">{company ? <>
      <div className="b2b-dossier-header"><span className="b2b-company-mark">{company.initials}</span><div><h2>{company.name}</h2><p>{company.brand} · {company.industry}</p></div><Button variant="secondary" onClick={() => openEditor({ kind: "company", record: company }, companyDetail.revision)}>Sửa doanh nghiệp</Button></div>
      <Tabs label="Các phần hồ sơ doanh nghiệp" className="b2b-dossier-tabs" scrollable value={companyTab} onValueChange={value => { if (value) void action(() => { setCompanyTab(value as typeof companyTab); setRelationshipPage(1); }); }} items={[
        { value: "overview", label: "Tổng quan", content: <div className="b2b-dossier-body">
          <div className="b2b-profile-columns"><section><h3>Thông tin liên hệ</h3><dl className="b2b-facts"><dt>Người liên hệ</dt><dd>{company.contact}</dd><dt>Email</dt><dd>{company.email}</dd><dt>Điện thoại</dt><dd>{company.phone}</dd><dt>Mã số thuế</dt><dd>{company.taxId || "Chưa bổ sung"}</dd><dt>Địa chỉ</dt><dd>{company.address || "Chưa bổ sung"}</dd></dl></section><section><h3>Quan hệ với trung tâm</h3><dl className="b2b-facts"><dt>Phụ trách</dt><dd>{company.owner}</dd><dt>Trạng thái</dt><dd>{company.category ?? "Chưa tải phân loại"}</dd><dt>Yêu cầu</dt><dd>{company.requestCount ?? "Chưa tải"}</dd><dt>Hợp đồng</dt><dd>{company.leaseCount ?? "Chưa tải"}</dd></dl></section></div>
          <Button variant="quiet" onClick={() => void action(() => { setCompanyTab("requests"); setRelationshipPage(1); })}>Xem yêu cầu & giữ chỗ</Button>
          <form className="b2b-note-form" key={company.id} onSubmit={event => {
            event.preventDefault();
            const revision = companyDetail.revision;
            if (revision != null) void action(async () => { if (await notes.save(company, revision)) onMessage("Đã lưu ghi chú doanh nghiệp trên hệ thống."); });
          }}>
            <label>Ghi chú nội bộ<Textarea name="note" rows={3} maxLength={600} value={notes.value(company)} onChange={event => {
              const next = event.target.value;
              const revision = companyDetail.revision;
              if (revision != null) void action(() => notes.update(company, next, revision));
            }}/></label>
            <p className="draft-status" aria-live="polite">{notes.dirty(company) ? "Chưa lưu · Bản nháp được giữ trong phiên này." : "Ghi chú đã lưu trên hệ thống."}</p>
            <Button variant="secondary" type="submit" disabled={data.pending || companyDetail.revision == null}>Lưu ghi chú</Button>
          </form>
        </div> },
        { value: "requests", label: "Yêu cầu & giữ chỗ", content: <div className="b2b-dossier-body"><ScreenFeedback data={companyRequests}/>{companyRequests.requests.map(item => { const hold = companyRequests.reservations.find(value => value.requestId === item.id); return <div className="b2b-activity-row" key={item.id}><div><strong>{item.id} · {slotCodes(item.slotIds)}</strong><small>Tầng {item.floor} · {area(item.area)} · <Period start={item.start} end={item.end}/></small>{hold?.status === "active" && <span className="b2b-deadline">{remainingLabel(hold.expiresAt)} giữ chỗ</span>}</div><Badge>{requestLabels[item.status]}</Badge><Button variant="quiet" onClick={() => goRecord({ view: "requests", id: item.id })}>Chi tiết</Button></div>; })}{companyRequests.isLoaded && !companyRequests.requests.length && <Empty>Chưa có yêu cầu thuê.</Empty>}<AdminPagination state={relationshipPages} label="yêu cầu của doanh nghiệp"/></div> },
        { value: "contracts", label: "Hợp đồng", content: <div className="b2b-dossier-body"><ScreenFeedback data={companyLeases}/>{companyLeases.leases.map(item => <div className="b2b-activity-row" key={item.id}><div><strong>{item.id}</strong><small>Tầng {item.floor} · {slotCodes(item.slotIds)} · <Period start={item.start} end={item.end}/></small></div><Badge tone="success">Hồ sơ đã lưu</Badge><Button variant="quiet" onClick={() => goRecord({ view: "leases", id: item.id })}>Mở hợp đồng</Button></div>)}{companyLeases.isLoaded && !companyLeases.leases.length && <Empty>Chưa có hợp đồng. Ghi nhận hợp đồng không yêu cầu tải PDF.</Empty>}<AdminPagination state={relationshipPages} label="hợp đồng của doanh nghiệp"/></div> },
        { value: "documents", label: "Tài liệu", content: <div className="b2b-dossier-body"><ScreenFeedback data={companyLeases}/>{companyLeases.leases.map(item => <div className="b2b-activity-row" key={item.id}><div><strong>{item.documentName || item.referenceNumber || item.id}</strong><small>{item.documentMediaId ? "Tệp hợp đồng lịch sử được lưu riêng tư" : "Hợp đồng gốc lưu bên ngoài hệ thống"}</small></div>{item.documentMediaId && <Button variant="quiet" onClick={() => void action(() => setDocumentLease(item))}>Xem tài liệu</Button>}</div>)}{companyLeases.isLoaded && !companyLeases.leases.length && <Empty>Chưa có hồ sơ hợp đồng.</Empty>}<AdminPagination state={relationshipPages} label="hồ sơ tài liệu"/></div> },
      ]}/>
    </> : !companyDetail.loading && !companyDetail.error && <Empty>Chọn một doanh nghiệp để xem hồ sơ.</Empty>}</AdminPanel>}/>}
    {view === "requests" && <>
      <ol className="b2b-process" aria-label="Quy trình thuê"><li><span>1</span>Gửi yêu cầu<small>Chưa giữ slot</small></li><li><span>2</span>Xét duyệt<small>Kiểm tra tổ hợp</small></li><li><span>3</span>Giữ chỗ<small>Có thời hạn</small></li><li><span>4</span>Hợp đồng<small>Ghi nhận thông tin thuê</small></li></ol>
      <WorkspaceLayout className="b2b-request-layout" mobilePresentation="drilldown" detailOpen={details.open} onDetailOpenChange={open => void action(() => details.setOpen(open))} returnFocusRef={details.returnFocusRef} detailLabel="Chi tiết yêu cầu thuê" backLabel="Quay lại danh sách yêu cầu" primary={<AdminPanel className="records-panel"><div className="b2b-panel-heading b2b-inline-heading"><h2>Yêu cầu thuê <span>{requestPages.total}</span></h2><Button variant="secondary" disabled={data.loading || data.pending || !data.screenData} onClick={() => openEditor({ kind: "request" }, data.screenData?.revision)}>Thêm yêu cầu thuê</Button><label><span className="sr-only">Lọc yêu cầu thuê</span><Select value={reqFilter} onChange={event => { const next = event.target.value; void action(() => { setReqFilter(next); setReqPage(1); }); }}><option value="">Tất cả trạng thái</option>{Object.entries(requestLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label></div><PaginatedContent layoutKey={requestPages.pageSize}>{data.requests.map(item => <Button variant="quiet" className={`b2b-request-row ${item.id === requestId ? "is-active" : ""}`} key={item.id} aria-pressed={item.id === requestId} onClick={event => goRecord({ view: "requests", id: item.id }, event.currentTarget)}><span className="b2b-request-company">{companyName(item.companyId)}<Badge>{requestLabels[item.status]}</Badge></span><strong>Tầng {item.floor} · {slotCodes(item.slotIds)}</strong><span>{area(item.area)} · <Period start={item.start} end={item.end}/></span><small>{item.id} · Gửi {dateLabel(item.received)}</small></Button>)}{data.isLoaded && !data.requests.length && <Empty>Không có yêu cầu ở trạng thái này. <Button variant="quiet" onClick={() => void action(() => { setReqFilter(""); setReqPage(1); })}>Xem tất cả</Button></Empty>}</PaginatedContent><AdminPagination state={requestPages} label="yêu cầu thuê"/></AdminPanel>} detail={<aside className="b2b-request-detail records-panel"><ScreenFeedback data={outsideRequest}/>{request ? <>
        <div className="b2b-section-heading"><h2>{companyName(request.companyId)}</h2><Badge>{requestLabels[request.status]}</Badge></div><p className="muted">{request.id} · Yêu cầu thuê</p>{["submitted", "reviewing"].includes(request.status) && <Button variant="secondary" onClick={() => openEditor({ kind: "request", record: request }, requestRevision)}>Sửa yêu cầu</Button>}<MiniPlan ids={request.slotIds} floor={request.floor}/><h3>Tầng {request.floor} · {slotCodes(request.slotIds)}</h3><dl className="b2b-facts"><dt>Diện tích tham khảo</dt><dd>{area(request.area)}</dd><dt>Kỳ thuê mong muốn</dt><dd><Period start={request.start} end={request.end}/></dd></dl><p className="b2b-customer-note">{request.note || "Khách chưa bổ sung ghi chú."}</p><Button variant="quiet" onClick={() => void action(() => onFloor(request.floor, request.slotIds))}>Xem mặt bằng trên sơ đồ</Button>
        {["submitted", "reviewing"].includes(request.status) && <div className="b2b-decision">{request.status === "submitted" && <Button variant="secondary" disabled={data.pending} onClick={() => void run({ type: "review-request", requestId: request.id }, "Đã tiếp nhận xét duyệt. Yêu cầu chưa giữ slot.", requestRevision)}>Tiếp nhận xét duyệt</Button>}<Button variant="primary" disabled={data.pending} onClick={() => openEditor({ kind: "approve", request }, requestRevision)}>Duyệt & giữ chỗ</Button><Button variant="secondary" disabled={data.pending} onClick={() => openEditor({ kind: "reject", request }, requestRevision)}>Từ chối yêu cầu</Button></div>}
        {reservation?.status === "active" && <div className="b2b-hold-panel"><h3>{Date.parse(reservation.expiresAt) <= Date.now() ? "Giữ chỗ đã hết hạn" : "Đang giữ chỗ"}</h3><strong>{remainingLabel(reservation.expiresAt)}</strong><p>Hết hạn {timeLabel(reservation.expiresAt)}, {dateLabel(reservation.expiresAt)} · {reservation.id}</p><Button variant="primary" disabled={data.pending || Date.parse(reservation.expiresAt) <= Date.now()} onClick={() => openEditor({ kind: "lease", reservation }, requestRevision)}>Ghi nhận hợp đồng & chuyển thuê</Button><p className="panel-note">Ghi nhận thông tin hợp đồng và chuyển slot sang trạng thái đang thuê, không yêu cầu tải PDF.</p><Button variant="secondary" disabled={data.pending} onClick={() => openEditor({ kind: "cancel-hold", reservation }, requestRevision)}>Hủy toàn bộ giữ chỗ</Button></div>}
        {reservation?.status === "converted" && <div className="b2b-hold-panel"><h3>Đã chuyển sang hợp đồng</h3><Button variant="secondary" onClick={() => void action(() => { setLCompany(reservation.companyId); setLQuery(""); setLPage(1); onView("leases"); })}>Xem hợp đồng của doanh nghiệp</Button></div>}{reservation?.status === "cancelled" && <p>Giữ chỗ đã hủy. Gửi yêu cầu mới để kiểm tra khả dụng.</p>}
      </> : !outsideRequest.loading && !outsideRequest.error && <Empty>{requestId ? "Không tìm thấy yêu cầu này." : "Chọn yêu cầu để xem chi tiết."}</Empty>}</aside>}/>
    </>}
    {view === "leases" && <WorkspaceLayout className="b2b-lease-layout" mobilePresentation="drilldown" detailOpen={details.open} onDetailOpenChange={open => void action(() => details.setOpen(open))} returnFocusRef={details.returnFocusRef} detailLabel="Chi tiết hợp đồng" backLabel="Quay lại danh sách hợp đồng" primary={<AdminPanel className="records-panel"><div className="b2b-panel-heading"><h2>Danh mục hợp đồng <span>{leasePages.total}</span></h2><div className="b2b-contract-filters"><label>Tìm hợp đồng<Input type="search" maxLength={200} value={lQuery} placeholder="Tìm mã, doanh nghiệp, slot…" onChange={event => { const next = event.target.value; void action(() => { setLQuery(next); setLPage(1); }); }}/></label><CompanyPicker data={data} label="Lọc doanh nghiệp" emptyLabel="Tất cả doanh nghiệp" value={lCompany} onValueChange={next => void action(() => { setLCompany(next); setLPage(1); })}/></div></div><PaginatedContent layoutKey={leasePages.pageSize}><Table viewportLabel="Danh sách hợp đồng, có thể cuộn ngang" rows={data.leases} getRowKey={item => item.id} getRowClassName={item => item.id === leaseId ? "selected-row" : undefined} onRowClick={item => goRecord({ view: "leases", id: item.id })} emptyLabel="Không tìm thấy hợp đồng phù hợp." columns={[
      { id: "company", header: "Hợp đồng / doanh nghiệp", cell: item => <><strong>{item.id}</strong><small>{companyName(item.companyId)}</small></> },
      { id: "space", header: "Mặt bằng", cell: item => <>Tầng {item.floor}<small>{slotCodes(item.slotIds)} · {area(item.area)}</small></> },
      { id: "end", header: "Ngày kết thúc", cell: item => dateLabel(item.end) },
      { id: "action", header: "Thao tác", cell: item => <Button variant="quiet" aria-label={`Xem hợp đồng ${item.id}`} onClick={event => { event.stopPropagation(); goRecord({ view: "leases", id: item.id }, event.currentTarget); }}>Chi tiết</Button> },
    ]}/></PaginatedContent><AdminPagination state={leasePages} label="hợp đồng"/><p className="panel-note">Hết kỳ thuê chưa đồng nghĩa sẵn sàng cho khách mới. Cần xác nhận gia hạn và bàn giao.</p></AdminPanel>} detail={<aside className="b2b-lease-detail records-panel" aria-label="Chi tiết hợp đồng đã chọn"><ScreenFeedback data={outsideLease}/>{lease ? <><div className="b2b-section-heading"><h2>{lease.id}</h2><Badge tone="success">Hồ sơ đã lưu</Badge></div><h3>{companyName(lease.companyId)}</h3><MiniPlan ids={lease.slotIds} floor={lease.floor}/><dl className="b2b-facts"><dt>Mặt bằng</dt><dd>Tầng {lease.floor} · {slotCodes(lease.slotIds)}</dd><dt>Diện tích tham khảo</dt><dd>{area(lease.area)}</dd><dt>Kỳ thuê</dt><dd><Period start={lease.start} end={lease.end}/></dd><dt>Điều khoản thuê</dt><dd>{lease.rentNote}</dd><dt>Số tham chiếu</dt><dd>{lease.referenceNumber || "Chưa nhập"}</dd><dt>Tài liệu</dt><dd>{lease.documentMediaId ? "Tệp hợp đồng lịch sử lưu riêng tư" : "Hợp đồng gốc lưu bên ngoài hệ thống"}</dd></dl><Button variant="secondary" onClick={() => void action(() => onFloor(lease.floor, lease.slotIds))}>Xem các slot liên kết</Button>{lease.documentMediaId && <Button variant="quiet" onClick={() => void action(() => setDocumentLease(lease))}>Xem tài liệu</Button>}</> : !outsideLease.loading && !outsideLease.error && <Empty>{leaseId ? "Không tìm thấy hợp đồng này." : "Chọn hợp đồng để xem chi tiết."}</Empty>}</aside>}/>}
    {view === "appointments" && <div className="b2b-appointments-layout"><AdminPanel className="records-panel"><div className="b2b-panel-heading"><h2>Lịch tư vấn & khảo sát</h2><Button variant="secondary" disabled={data.pending || appointmentPages.revision == null} onClick={() => openEditor({ kind: "appointment" }, appointmentPages.revision)}>Thêm lịch hẹn</Button><label>Tìm lịch hẹn<Input type="search" value={appointmentQuery} maxLength={200} placeholder="Tìm nội dung, địa điểm, doanh nghiệp…" onChange={event => { const next = event.target.value; void action(() => setAppointmentQuery(next)); }}/></label><label>Trạng thái<Select value={appointmentStatus} onChange={event => { const next = event.target.value; void action(() => setAppointmentStatus(next)); }}><option value="">Tất cả trạng thái</option>{Object.entries(appointmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><p className="muted">Giờ Việt Nam · Lịch hẹn không tạo cam kết giữ mặt bằng.</p></div><PaginatedContent layoutKey={appointmentPages.pageSize}>{appointmentPages.rows.map(item => <div className="b2b-appointment-row" key={item.id}><div className="b2b-time"><strong>{timeLabel(item.startsAt)}</strong><small>{dateLabel(item.startsAt)}</small></div><div><strong>{companyName(item.companyId)}</strong><span>{item.purpose}</span><small>{item.location} · {item.durationMinutes} phút</small><Badge>{appointmentLabels[item.status]}</Badge></div><div className="b2b-appointment-actions">{item.status !== "cancelled" && <Button variant="quiet" onClick={() => openEditor({ kind: "appointment", record: item }, appointmentPages.revision)}>Sửa lịch</Button>}{item.status === "requested" && <Button variant="quiet" disabled={data.pending} onClick={() => void run({ type: "confirm-appointment", appointmentId: item.id }, "Đã xác nhận lịch hẹn.", appointmentPages.revision)}>Xác nhận lịch</Button>}{item.status !== "cancelled" && <Button variant="quiet" disabled={data.pending} onClick={() => void action(() => setCancelAppointmentId(item.id))}>Hủy lịch</Button>}</div></div>)}{!appointmentPages.loading && !appointmentPages.error && !appointmentPages.total && <Empty>Không có lịch hẹn phù hợp. Thêm lịch hoặc đổi bộ lọc.</Empty>}</PaginatedContent><AdminPagination state={appointmentPages} label="lịch hẹn"/></AdminPanel></div>}
    {editor && <BusinessRecordEditor editor={editor} data={data} onClose={() => setEditor(null)} onSaved={onMessage}/>}
  </div>;
}
