import { isAdminSettings, LEAD_STATUSES, type AdminCommand, type LeadInput } from "./contracts";
import { INTERNAL_BUSINESS_STATUSES } from "./space-model";
import { isWebsiteSettings } from "./website-settings";
import { dates, email, phone, text } from "./validation";
import type { AppointmentInput, CompanyInput } from "./b2b-model";

type Rule = (value: unknown) => unknown;
function object(value: unknown, fields: Record<string, Rule>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !Object.hasOwn(fields,key))) throw new Error("Unexpected command field");
  return Object.fromEntries(Object.entries(fields).map(([key,rule]) => [key,rule(input[key])]));
}
const id: Rule = value => { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid record ID"); return value; };
const optional = (rule: Rule): Rule => value => value === undefined ? undefined : rule(value);
const bounded = (max: number, empty = false): Rule => value => { if (typeof value !== "string") throw new Error("Expected text"); return text(value,max,empty); };
const number = (min: number,max: number,whole = false): Rule => value => { if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max||(whole&&!Number.isInteger(value))) throw new Error("Invalid number");return value; };
const enumeration = (values:readonly unknown[]):Rule => value => { if(!values.includes(value)) throw new Error("Invalid option");return value; };
const ids:Rule = value => { if(!Array.isArray(value)||value.length<1||value.length>100||new Set(value).size!==value.length) throw new Error("Invalid member list");return value.map(id); };
const mail:Rule = value => email(bounded(254,true)(value) as string,true);
const tel:Rule = value => phone(bounded(30,true)(value) as string,true);
const floor=number(1,6,true),status=enumeration(INTERNAL_BUSINESS_STATUSES),note=bounded(600,true);
const companyFields: Record<string, Rule> = {name:bounded(80),industry:bounded(120,true),brand:bounded(80,true),contact:bounded(80,true),email:mail,phone:tel,owner:bounded(80,true),note,taxId:optional(bounded(30,true)),address:optional(bounded(240,true)),logoMediaId:optional(value=>value===""?"":id(value))};
const company:Rule = value=>object(value,companyFields);
const leadFields: Record<string, Rule> = {name:bounded(100),interest:bounded(160),floor,source:bounded(80),status:enumeration(LEAD_STATUSES),note:bounded(2000,true),companyId:optional(id),email:optional(mail),phone:optional(value=>{const result=bounded(32,true)(value) as string;if(result&&(!/^[+\d().\s-]+$/.test(result)||!/^\d{7,15}$/.test(result.replace(/\D/g,''))))throw new Error('Invalid phone');return result;})};
const lead:Rule = value=>object(value,leadFields);
const appointmentFields: Record<string, Rule> = {companyId:id,purpose:bounded(80),startsAt:bounded(40),location:bounded(160),durationMinutes:number(15,240,true)};
const appointment:Rule=value=>{const result=object(value,appointmentFields);if(!Number.isFinite(Date.parse(result.startsAt as string)))throw new Error("Invalid appointment timestamp");return result;};
function partial(value: unknown, fields: Record<string, Rule>): Record<string, unknown> {
 const input = object(value, Object.fromEntries(Object.entries(fields).map(([key,rule])=>[key,optional(rule)])));
 if (!Object.keys(input).some(key=>input[key]!==undefined)) throw new Error("At least one field is required");
 return Object.fromEntries(Object.entries(input).filter(([,entry])=>entry!==undefined));
}
export function parseCompanyInput(value:unknown):CompanyInput { return company(value) as CompanyInput; }
export function parseCompanyPatch(value:unknown):Partial<CompanyInput> { return partial(value,companyFields) as Partial<CompanyInput>; }
export function parseLeadInput(value:unknown):LeadInput { return lead(value) as LeadInput; }
export function parseAppointmentInput(value:unknown):AppointmentInput { return appointment(value) as AppointmentInput; }
const request:Rule=value=>{const result=object(value,{companyId:id,floor,slotIds:ids,start:bounded(10),end:bounded(10),note});dates(result.start as string,result.end as string);return result;};
const website:Rule=value=>{if(!isWebsiteSettings(value))throw new Error("Invalid website settings");return object(value,{logoMediaId:bounded(240),email:bounded(254),hotline:bounded(32),secondaryPhone:bounded(32,true),managementPhone:bounded(32,true),address:bounded(400),zaloUrl:bounded(240)});};
const settings:Rule=value=>{if(!isAdminSettings(value))throw new Error("Invalid settings");return object(value,{propertyName:bounded(120),contactEmail:bounded(254,true),contactPhone:bounded(32,true),defaultHoldHours:number(1,720,true),appointmentMinutes:number(15,240,true),appointmentLocation:bounded(160),website});};
const variants:Record<AdminCommand["type"],Record<string,Rule>>={
 "update-floor":{floor,purpose:bounded(120),publicTitle:bounded(120),publicDescription:bounded(600)},"update-website-settings":{values:website},"update-settings":{values:settings},
 merge:{floor,slotIds:ids,name:bounded(80)},split:{groupId:id},"update-slot":{slotId:id,status,tenant:bounded(80,true),area:optional(number(.01,100000))},"update-group":{groupId:id,name:bounded(80),status},
 "save-lead":{leadId:optional(id),values:lead},"delete-lead":{leadId:id},
 "link-lead-company":{leadId:id,companyId:id},"create-company-from-lead":{leadId:id,values:company},
 "link-media":{mediaId:id,scope:bounded(100)},"rename-media":{mediaId:id,name:bounded(160)},"delete-media":{mediaId:id},"save-company":{companyId:id,note},"upsert-company":{companyId:optional(id),values:company},"delete-company":{companyId:id},"delete-appointment":{appointmentId:id},
 "save-request":{requestId:optional(id),values:request},"approve-request":{requestId:id,holdHours:number(1,720,true),note},"review-request":{requestId:id},"reject-request":{requestId:id,reason:bounded(600)},"cancel-hold":{reservationId:id,reason:bounded(600)},"record-lease":{reservationId:id,rentNote:optional(note),referenceNumber:optional(bounded(120,true))},"save-appointment":{appointmentId:optional(id),values:appointment},"confirm-appointment":{appointmentId:id},"cancel-appointment":{appointmentId:id},
};
export function parseAdminCommand(value:unknown):AdminCommand {
  if(!value||typeof value!=="object"||Array.isArray(value)||!("type" in value)||typeof value.type!=="string"||!Object.hasOwn(variants,value.type))throw new Error("Unsupported command");
  return object(value,{type:enumeration([value.type]),...variants[value.type as AdminCommand["type"]]}) as AdminCommand;
}
