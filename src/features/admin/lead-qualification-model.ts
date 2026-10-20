import type { CompanyInput } from "../../shared/admin/b2b-model";
import type { Lead } from "../../shared/admin/contracts";
import { BUSINESS_OPTIONS } from "../contact/contact-model";

/** Website company text is a proposal, not an existing company identity. */
export function companyDraftFromLead(lead: Lead): CompanyInput {
  const company = lead.contactDetails?.company.trim();
  const business = lead.contactDetails?.business;
  return {
    name: (company || lead.name).slice(0, 80),
    industry: (BUSINESS_OPTIONS.find(option => option.value === business)?.label ?? business ?? "").slice(0, 120),
    brand: "",
    contact: lead.name.slice(0, 80),
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    owner: "",
    note: "",
  };
}
