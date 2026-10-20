import "server-only";
import { BackendError, createPostgresRepository, type CrudService, type CrudRepository, type CrudRow, type PgQuery, type PostgresOptions } from "@shared/backend";
import type { Company, CompanyInput, Appointment, AppointmentInput } from "../shared/admin/b2b-model";
import type { Lead, LeadInput } from "../shared/admin/contracts";
import type { AdminCollectionName, AdminCollectionQuery, CompanySummary } from "../shared/admin/collection-contracts";
import { parseAppointmentInput, parseCompanyInput, parseCompanyPatch, parseLeadInput } from "../shared/admin/parse-command";
import { initials } from "../shared/admin/validation";
import { WorkspaceError, type AdminIdentity, type PoolClient } from "./database";
import { assertSessionActive } from "./admin-session";
import { siteUrl } from "../config/site";

type DbRow = Record<string, unknown>;
const dbRow = (value: unknown): DbRow => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackendError("UNAVAILABLE");
  return value as DbRow;
};
const text = (value: unknown): string => {
  if (typeof value !== "string") throw new BackendError("UNAVAILABLE");
  return value;
};
const integer = (value: unknown, min = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) throw new BackendError("UNAVAILABLE");
  return parsed;
};
const nullableText = (value: unknown): string | undefined => value == null || value === "" ? undefined : text(value);
const iso = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.valueOf())) throw new BackendError("UNAVAILABLE");
  return date.toISOString();
};
const clientQuery = (client: PoolClient): PgQuery => async (statement, values) => {
  const result = await client.query(statement, [...values]);
  return { rows: result.rows };
};


// One derived relationship rule serves list filtering, rows and overview counts.
function companyCategorySql(customer: "pc" | "property_customers") {
  return `CASE WHEN EXISTS(SELECT 1 FROM leasing.leases l WHERE l.property_id=${customer}.property_id AND l.organization_id=${customer}.organization_id AND l.status='executed') THEN 'Đang thuê'
    WHEN EXISTS(SELECT 1 FROM leasing.reservations r WHERE r.property_id=${customer}.property_id AND r.organization_id=${customer}.organization_id AND r.status='active' AND r.expires_at>now()) THEN 'Đang giữ chỗ'
    WHEN EXISTS(SELECT 1 FROM leasing.leasing_requests q WHERE q.property_id=${customer}.property_id AND q.organization_id=${customer}.organization_id AND q.status IN ('submitted','under_review')) THEN 'Đang tư vấn'
    ELSE 'Chưa thuê' END`;
}

/** Property-wide totals stay independent of the active search, status and page. */
export async function readCompanySummary(client: PoolClient, propertyId: string): Promise<CompanySummary> {
  const result = await client.query(`SELECT count(*) AS total,
    count(*) FILTER(WHERE category='Đang thuê') AS renting
    FROM (SELECT ${companyCategorySql("pc")} AS category FROM leasing.property_customers pc
      WHERE pc.property_id=$1 AND pc.deleted_at IS NULL) companies`, [propertyId]);
  const row = result.rows[0];
  const rentingCompanies = integer(row.renting);
  // The current lifecycle has recorded/executed contracts only; both views agree.
  return { totalCompanies: integer(row.total), rentingCompanies, withContracts: rentingCompanies };
}

function collectionFilter(collection: AdminCollectionName, filter: AdminCollectionQuery): NonNullable<PostgresOptions<CrudRow>["listFilter"]> {
  return (_scope, bind) => {
    const conditions: string[] = [];
    const idColumn = collection === "companies" ? "organization_id" : "id";
    if (filter.ids) conditions.push(`${idColumn}=ANY(${bind(filter.ids)}::uuid[])`);
    if (filter.companyId) conditions.push(`organization_id=${bind(filter.companyId)}::uuid`);
    if (filter.status) conditions.push(`${collection === "companies" ? `(${companyCategorySql("property_customers")})` : "status"}=${bind(filter.status)}`);
    if (filter.query) {
      const pattern = bind(`%${filter.query.replace(/[\\%_]/g, "\\$&")}%`);
      if (collection === "companies") conditions.push(`EXISTS(SELECT 1 FROM leasing.organizations search_org WHERE search_org.id=property_customers.organization_id AND (search_org.legal_name ILIKE ${pattern} OR search_org.industry ILIKE ${pattern}))`);
      else if (collection === "leads") conditions.push(`(name ILIKE ${pattern} OR interest ILIKE ${pattern} OR email ILIKE ${pattern} OR phone ILIKE ${pattern} OR source ILIKE ${pattern} OR EXISTS(SELECT 1 FROM leasing.organizations search_org WHERE search_org.id=leads.organization_id AND search_org.legal_name ILIKE ${pattern}) OR EXISTS(SELECT 1 FROM leasing.contact_intake search_intake WHERE search_intake.property_id=leads.property_id AND search_intake.lead_id=leads.id AND search_intake.company_name ILIKE ${pattern}))`);
      else conditions.push(`(purpose ILIKE ${pattern} OR meeting_location ILIKE ${pattern} OR EXISTS(SELECT 1 FROM leasing.organizations search_org WHERE search_org.id=appointments.organization_id AND search_org.legal_name ILIKE ${pattern}))`);
    }
    return conditions.join(" AND ");
  };
}

export type CompanyRow = Company & { tenantId: string };
type CompanyLink = CrudRow;
type CompanyLinkChange = { updatedAt: string };
function decodeCompanyLink(input: unknown): CompanyLink {
  const row = dbRow(input);
  return { id: text(row.organization_id), version: integer(row.revision, 1), tenantId: text(row.property_id) };
}
async function loadCompanies(client: PoolClient, scopeId: string, ids: string[]): Promise<CompanyRow[]> {
  if (!ids.length) return [];
  const rows = (await client.query(`SELECT pc.organization_id AS id,pc.revision AS version,pc.property_id AS tenant_id,
      o.legal_name AS name,o.industry,coalesce(b.name,'') AS brand,coalesce(c.display_name,'') AS contact,
      coalesce(c.email,'') AS email,coalesce(c.phone,'') AS phone,o.account_owner AS owner,o.internal_note AS note,
      o.registration_number AS tax_id,o.registered_address AS address,pc.logo_media_id,
      CASE WHEN logo_state.state='ready' THEN coalesce(logo.public_url,'/api/admin/media/'||logo.id::text||'/view/') END AS logo_url,
      (SELECT count(*)::int FROM leasing.leasing_requests q WHERE q.property_id=pc.property_id AND q.organization_id=o.id) AS request_count,
      (SELECT count(*)::int FROM leasing.leases l WHERE l.property_id=pc.property_id AND l.organization_id=o.id AND l.status='executed') AS lease_count,
      ${companyCategorySql("pc")} AS category
    FROM leasing.property_customers pc JOIN leasing.organizations o ON o.id=pc.organization_id
    LEFT JOIN leasing.document_versions logo ON logo.id=pc.logo_media_id AND logo.property_id=pc.property_id
    LEFT JOIN leasing.media_object_state logo_state ON logo_state.document_version_id=logo.id AND logo_state.property_id=pc.property_id
    LEFT JOIN LATERAL(SELECT name FROM leasing.brands WHERE organization_id=o.id ORDER BY created_at LIMIT 1)b ON true
    LEFT JOIN LATERAL(SELECT display_name,email,phone FROM leasing.contacts WHERE organization_id=o.id ORDER BY created_at LIMIT 1)c ON true
    WHERE pc.property_id=$1 AND pc.organization_id=ANY($2::uuid[]) AND pc.deleted_at IS NULL`,[scopeId,ids])).rows;
  return rows.map(input => {
    const row=dbRow(input),name=text(row.name);
    return { id:text(row.id),version:integer(row.version,1),tenantId:text(row.tenant_id),name,initials:initials(name),
      industry:text(row.industry),brand:text(row.brand),contact:text(row.contact),email:text(row.email),phone:text(row.phone),
      owner:text(row.owner),note:text(row.note),taxId:nullableText(row.tax_id),address:nullableText(row.address),logoMediaId:nullableText(row.logo_media_id),logoUrl:nullableText(row.logo_url),
      category:text(row.category) as Company["category"],requestCount:integer(row.request_count),leaseCount:integer(row.lease_count) };
  });
}
async function assertCompanyLogo(client: PoolClient, propertyId: string, logoMediaId: string | undefined) {
  if (!logoMediaId) return;
  const result = await client.query(`SELECT v.id FROM leasing.document_versions v
    JOIN leasing.documents d ON d.id=v.document_id AND d.property_id=v.property_id
    JOIN leasing.media_object_state s ON s.document_version_id=v.id AND s.property_id=v.property_id
    WHERE v.id=$2 AND v.property_id=$1 AND v.storage_provider='neon'
      AND v.content_type IN ('image/png','image/jpeg','image/webp') AND v.scan_state='clean'
      AND s.state='ready' AND d.classification='public_media'`, [propertyId, logoMediaId]);
  if (!result.rows.length) throw new WorkspaceError("Logo phải là ảnh đã tải lên Neon của dự án.");
}

function companyRepository(client: PoolClient, filter: AdminCollectionQuery): CrudRepository<CompanyRow, CompanyInput, Partial<CompanyInput>> {
  const query=clientQuery(client);
  const links=createPostgresRepository<CompanyLink,CompanyLinkChange,CompanyLinkChange>({
    query,schema:"leasing",table:"property_customers",idColumn:"organization_id",versionColumn:"revision",
    columns:{updatedAt:"updated_at"},scopeColumns:{tenantId:"property_id"},softDelete:{column:"deleted_at"},decode:decodeCompanyLink,
    listFilter:collectionFilter("companies",filter),
  });
  const expand=async (rows:CompanyLink[],scope:{tenantId:string})=>{
    const mapped=await loadCompanies(client,scope.tenantId,rows.map(row=>row.id));
    const byId=new Map(mapped.map(row=>[row.id,row]));
    return rows.map(row=>byId.get(row.id)).filter((row):row is CompanyRow=>!!row);
  };
  const find=async(id:string,scope:{tenantId:string})=>{const link=await links.find(id,scope);return link?(await expand([link],scope))[0]??null:null;};
  return {
    find,
    async list(scope,page){const result=await links.list(scope,page);return {items:await expand(result.items,scope),totalItems:result.totalItems};},
    async listAuthorized(scope,page,selection){const result=await links.listAuthorized!(scope,page,selection);return {items:await expand(result.items,scope),totalItems:result.totalItems};},
    async insert(data,scope){
      await assertCompanyLogo(client,scope.tenantId,data.logoMediaId);
      const id=crypto.randomUUID();
      await client.query(`INSERT INTO leasing.organizations(id,legal_name,industry,account_owner,internal_note,registration_number,registered_address)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,data.name,data.industry,data.owner,data.note,data.taxId||null,data.address||null]);
      await client.query("INSERT INTO leasing.property_customers(property_id,organization_id,revision,logo_media_id) VALUES($1,$2,1,$3)",[scope.tenantId,id,data.logoMediaId||null]);
      await client.query("INSERT INTO leasing.brands(organization_id,name) VALUES($1,$2)",[id,data.brand]);
      await client.query("INSERT INTO leasing.contacts(organization_id,display_name,email,phone) VALUES($1,$2,$3,$4)",[id,data.contact,data.email,data.phone]);
      const created=await find(id,scope);if(!created)throw new BackendError("UNAVAILABLE");return created;
    },
    async update(id,data,expectedVersion,scope){
      await assertCompanyLogo(client,scope.tenantId,data.logoMediaId);
      const changed=await links.update(id,{updatedAt:new Date().toISOString()},expectedVersion,scope);if(!changed)return null;
      if(Object.hasOwn(data,"logoMediaId"))await client.query("UPDATE leasing.property_customers SET logo_media_id=$3 WHERE property_id=$1 AND organization_id=$2",[scope.tenantId,id,data.logoMediaId||null]);
      const orgFields:[keyof CompanyInput,string][]=[["name","legal_name"],["industry","industry"],["owner","account_owner"],["note","internal_note"],["taxId","registration_number"],["address","registered_address"]];
      const updates=orgFields.filter(([key])=>Object.hasOwn(data,key));
      if(updates.length){const values:unknown[]=[id];const sets=updates.map(([key,column])=>{values.push(key==="taxId"||key==="address"?(data[key]||null):data[key]);return `${column}=$${values.length}`;});await client.query(`UPDATE leasing.organizations SET ${sets.join(",")} WHERE id=$1`,values);}
      if(Object.hasOwn(data,"brand")){const result=await client.query("SELECT id FROM leasing.brands WHERE organization_id=$1 ORDER BY created_at LIMIT 1",[id]);if(result.rows[0])await client.query("UPDATE leasing.brands SET name=$2 WHERE id=$1",[dbRow(result.rows[0]).id,data.brand]);else await client.query("INSERT INTO leasing.brands(organization_id,name) VALUES($1,$2)",[id,data.brand]);}
      if(["contact","email","phone"].some(key=>Object.hasOwn(data,key))){const result=await client.query("SELECT id,coalesce(display_name,'') AS display_name,coalesce(email,'') AS email,coalesce(phone,'') AS phone FROM leasing.contacts WHERE organization_id=$1 ORDER BY created_at LIMIT 1",[id]);const current=result.rows[0]?dbRow(result.rows[0]):null;const contact=data.contact??(current?text(current.display_name):"");const email=data.email??(current?text(current.email):"");const phone=data.phone??(current?text(current.phone):"");if(current)await client.query("UPDATE leasing.contacts SET display_name=$2,email=$3,phone=$4 WHERE id=$1",[current.id,contact,email,phone]);else await client.query("INSERT INTO leasing.contacts(organization_id,display_name,email,phone) VALUES($1,$2,$3,$4)",[id,contact,email,phone]);}
      return find(id,scope);
    },
    async delete(id,expectedVersion,scope){
      const refs=await client.query(`SELECT EXISTS(SELECT 1 FROM leasing.leads WHERE property_id=$1 AND organization_id=$2)
        OR EXISTS(SELECT 1 FROM leasing.leasing_requests WHERE property_id=$1 AND organization_id=$2)
        OR EXISTS(SELECT 1 FROM leasing.reservations WHERE property_id=$1 AND organization_id=$2)
        OR EXISTS(SELECT 1 FROM leasing.leases WHERE property_id=$1 AND organization_id=$2)
        OR EXISTS(SELECT 1 FROM leasing.appointments WHERE property_id=$1 AND organization_id=$2) AS referenced`,[scope.tenantId,id]);
      if(dbRow(refs.rows[0]).referenced===true)throw new BackendError("CONFLICT");
      return links.delete(id,expectedVersion,scope);
    },
  };
}

function decodeContactDetails(input: unknown): NonNullable<Lead["contactDetails"]> {
  const row=dbRow(input),intent=text(row.intent);
  if(!["consultation","visit","callback"].includes(intent))throw new BackendError("UNAVAILABLE");
  const result:NonNullable<Lead["contactDetails"]>={intent:intent as NonNullable<Lead["contactDetails"]>["intent"],company:text(row.company),business:text(row.business),area:text(row.area),timing:text(row.timing),space:text(row.space)};
  for(const key of ["scope","visitDate","visitTime"] as const){const value=nullableText(row[key]);if(value)result[key]=value;}
  return result;
}
export type LeadRow = CrudRow & Omit<Lead,"contactDetails">;
function decodeLead(input: unknown): LeadRow {
  const row=dbRow(input),name=text(row.name),status=text(row.status);
  if(!["Mới","Đang tư vấn","Đã xử lý"].includes(status))throw new BackendError("UNAVAILABLE");
  return {id:text(row.id),referenceCode:text(row.reference_code),version:integer(row.revision,1),tenantId:text(row.property_id),name,initials:initials(name),interest:text(row.interest),floor:integer(row.floor_number,1) as Lead["floor"],source:text(row.source),time:iso(row.created_at),status:status as Lead["status"],note:text(row.note),companyId:nullableText(row.organization_id),email:nullableText(row.email),phone:nullableText(row.phone)};
}
type LeadStored = {name:string;interest:string;floor:Lead["floor"];source:string;status:Lead["status"];note:string;organizationId:string|null;email:string;phone:string};
const storedLead=(input:LeadInput):LeadStored=>({name:input.name,interest:input.interest,floor:input.floor,source:input.source,status:input.status,note:input.note,organizationId:input.companyId??null,email:input.email??"",phone:input.phone??""});
function leadRepository(client: PoolClient, filter: AdminCollectionQuery): CrudRepository<LeadRow,LeadInput,LeadInput> {
  const stored=createPostgresRepository<LeadRow,LeadStored,LeadStored>({
    query:clientQuery(client),schema:"leasing",table:"leads",versionColumn:"revision",scopeColumns:{tenantId:"property_id"},
    columns:{name:"name",interest:"interest",floor:"floor_number",source:"source",status:"status",note:"note",organizationId:"organization_id",email:"email",phone:"phone"},
    softDelete:{column:"deleted_at"},decode:decodeLead,
    listFilter:collectionFilter("leads",filter),listOrder:[{column:"created_at",direction:"DESC"}],
  });
  return {...stored,insert:(data,scope)=>stored.insert(storedLead(data),scope),update:(id,data,version,scope)=>stored.update(id,storedLead(data),version,scope),delete:async(id,version,scope)=>{
    const protectedRecord=await client.query("SELECT EXISTS(SELECT 1 FROM leasing.contact_intake WHERE property_id=$1 AND lead_id=$2) AS referenced",[scope.tenantId,id]);
    if(dbRow(protectedRecord.rows[0]).referenced===true)throw new BackendError("CONFLICT");
    return stored.delete(id,version,scope);
  }};
}

export type AppointmentRow = CrudRow & Omit<Appointment,"version">;
function scheduleRange(value: unknown): { startsAt:string; durationMinutes:number; range:string } {
  const range=text(value),match=/^\["([^\"]+)","([^\"]+)"\)$/.exec(range);
  if(!match)throw new BackendError("UNAVAILABLE");
  const start=Date.parse(match[1]!),end=Date.parse(match[2]!);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||(end-start)%60000!==0)throw new BackendError("UNAVAILABLE");
  return {startsAt:new Date(start).toISOString(),durationMinutes:(end-start)/60000,range};
}
function appointmentRange(input: AppointmentInput): string {
  const start=Date.parse(input.startsAt),end=start+input.durationMinutes*60000;
  if(!Number.isFinite(start)||!Number.isFinite(end))throw new BackendError("INVALID_INPUT");
  return `["${new Date(start).toISOString()}","${new Date(end).toISOString()}")`;
}
function decodeAppointment(input: unknown): AppointmentRow {
  const row=dbRow(input),range=scheduleRange(row.scheduled_period),status=text(row.status);
  if(!["requested","confirmed","completed","cancelled","no_show"].includes(status))throw new BackendError("UNAVAILABLE");
  return {id:text(row.id),version:integer(row.revision,1),tenantId:text(row.property_id),companyId:text(row.organization_id),purpose:text(row.purpose),startsAt:range.startsAt,status:status as Appointment["status"],location:row.meeting_location==null?"":text(row.meeting_location),durationMinutes:range.durationMinutes};
}
type AppointmentStored = {companyId:string;purpose:string;scheduledPeriod:string;location:string};
const storedAppointment=(input:AppointmentInput,scheduledPeriod:string):AppointmentStored=>({companyId:input.companyId,purpose:input.purpose,scheduledPeriod,location:input.location});
function appointmentRepository(client:PoolClient,filter:AdminCollectionQuery):CrudRepository<AppointmentRow,AppointmentInput,AppointmentInput> {
  const query=clientQuery(client);
  const stored=createPostgresRepository<AppointmentRow,AppointmentStored,AppointmentStored>({
    query,schema:"leasing",table:"appointments",versionColumn:"revision",scopeColumns:{tenantId:"property_id"},
    columns:{companyId:"organization_id",purpose:"purpose",scheduledPeriod:"scheduled_period",location:"meeting_location"},
    softDelete:{column:"deleted_at"},decode:decodeAppointment,
    listFilter:collectionFilter("appointments",filter),listOrder:[{column:"scheduled_period",direction:"ASC"}],
  });
  const checkTime=async(input:AppointmentInput,id:string|undefined,scope:{tenantId:string})=>{
    const start=Date.parse(input.startsAt);if(start<=Date.now())throw new BackendError("INVALID_INPUT");
    const range=appointmentRange(input);
    const conflict=await client.query(`SELECT 1 FROM leasing.appointments WHERE property_id=$1 AND deleted_at IS NULL AND status<>'cancelled'
      AND scheduled_period&&$2::tstzrange AND ($3::uuid IS NULL OR id<>$3) LIMIT 1`,[scope.tenantId,range,id??null]);
    if(conflict.rows.length)throw new BackendError("CONFLICT");
    return range;
  };
  return {
    ...stored,
    async insert(data,scope){return stored.insert(storedAppointment(data,await checkTime(data,undefined,scope)),scope);},
    async update(id,data,expectedVersion,scope){return stored.update(id,storedAppointment(data,await checkTime(data,id,scope)),expectedVersion,scope);},
    async delete(id,expectedVersion,scope){const row=await stored.find(id,scope);if(!row)return false;if(row.status==="confirmed"||row.status==="completed"||row.status==="no_show")throw new BackendError("CONFLICT");return stored.delete(id,expectedVersion,scope);},
  };
}

export interface AdminCrudServices { request:Request; companies:CrudService<Company>; leads:CrudService<Lead>; appointments:CrudService<Appointment> }
async function projectLeads(client:PoolClient,propertyId:string,rows:readonly LeadRow[]):Promise<Lead[]> {
  if (!rows.length) return [];
  const intake=(await client.query(`SELECT DISTINCT ON (lead_id) lead_id,jsonb_strip_nulls(jsonb_build_object('intent',intent,'company',company_name,'business',business,'area',area_preference,'timing',timing,'space',space_code,'scope',scope,'visitDate',visit_date::text,'visitTime',visit_time)) AS details
    FROM leasing.contact_intake WHERE property_id=$1 AND lead_id=ANY($2::uuid[]) ORDER BY lead_id,consented_at DESC,id DESC`,[propertyId,rows.map(row=>row.id)])).rows;
  const details=new Map(intake.map(row=>[row.lead_id,decodeContactDetails(row.details)]));
  return rows.map(row=>{
    const {tenantId:_,propertyId:__,organizationId:___,ownerId:____,dimensions:_____,...lead}=row;
    return {...lead,...(details.has(row.id)?{contactDetails:details.get(row.id)!}:{})};
  });
}
export function createAdminCrudServices(identity: AdminIdentity, client: PoolClient, request?: Request, options: { query?: AdminCollectionQuery } = {}): AdminCrudServices {
  assertSessionActive(identity);
  const scope = { tenantId: identity.propertyId }, filter = options.query ?? {};
  function service<Row extends CrudRow, Create, Update, DTO>(repository: CrudRepository<Row, Create, Update>, parseCreate: (input: unknown) => Create, parseUpdate: (input: unknown) => Update, project: (rows: Row[]) => DTO[] | Promise<DTO[]>): CrudService<DTO> {
    const check = () => assertSessionActive(identity);
    const found = async (id: string) => {
      check();
      const row = await repository.find(id, scope);
      if (!row || row.tenantId !== identity.propertyId) throw new BackendError("NOT_FOUND");
      return row;
    };
    return {
      async list(_request, pagination = {}) {
        check();
        const page = pagination.page ?? 1, pageSize = pagination.pageSize ?? 20;
        if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger((page - 1) * pageSize)) throw new BackendError("INVALID_INPUT");
        const result = await repository.list(scope, { offset: (page - 1) * pageSize, limit: pageSize });
        if (result.items.some(row => row.tenantId !== identity.propertyId)) throw new BackendError("UNAVAILABLE");
        return { items: await project(result.items), page, pageSize, totalItems: result.totalItems, totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)) };
      },
      async get(_request, id) { return (await project([await found(id)]))[0]!; },
      async create(_request, input) {
        check();
        let data: Create;
        try { data = parseCreate(input); } catch { throw new BackendError("INVALID_INPUT"); }
        return (await project([await repository.insert(data, scope)]))[0]!;
      },
      async update(_request, id, expectedVersion, input) {
        await found(id);
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new BackendError("INVALID_INPUT");
        let data: Update;
        try { data = parseUpdate(input); } catch { throw new BackendError("INVALID_INPUT"); }
        const row = await repository.update(id, data, expectedVersion, scope);
        if (!row) throw new BackendError("CONFLICT");
        return (await project([row]))[0]!;
      },
      async delete(_request, id, expectedVersion) {
        await found(id);
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new BackendError("INVALID_INPUT");
        if (!await repository.delete(id, expectedVersion, scope)) throw new BackendError("CONFLICT");
      },
    };
  }
  const companies = service(companyRepository(client, filter), parseCompanyInput, parseCompanyPatch, rows => rows.map(({ tenantId: _, ...row }) => row));
  const leads = service(leadRepository(client, filter), parseLeadInput, parseLeadInput, rows => projectLeads(client, identity.propertyId, rows));
  const appointments = service(appointmentRepository(client, filter), parseAppointmentInput, parseAppointmentInput, rows => rows.map(({ tenantId: _, propertyId: __, organizationId: ___, ownerId: ____, dimensions: _____, ...row }) => row));
  return { request: request ?? new Request(siteUrl), companies, leads, appointments };
}
