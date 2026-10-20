import type { Company, Appointment } from "./b2b-model";
import type { Lead } from "./contracts";

export type AdminCollectionItems = { companies: Company; leads: Lead; appointments: Appointment };
export type AdminCollectionName = keyof AdminCollectionItems;
export type AdminCollectionQuery = { page?: number; pageSize?: number; query?: string; status?: string; ids?: string[]; companyId?: string; includeSummary?: boolean };
export type AdminCollectionMetadata = { page: number; pageSize: number; totalItems: number; totalPages: number };
export type CompanySummary = { totalCompanies: number; rentingCompanies: number; withContracts: number };
export type AdminCollectionPage<T> = AdminCollectionMetadata & { items: T[]; revision: number; summary?: CompanySummary };
export type AdminCollectionDetail<T> = { item: T; revision: number };
export type AdminCollections = Record<AdminCollectionName, AdminCollectionMetadata>;
