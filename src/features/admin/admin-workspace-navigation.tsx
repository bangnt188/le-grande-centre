"use client";

import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Floor } from "@/shared/admin/space-model";

export type AdminView = "floors" | "spaces" | "customers" | "leads" | "requests" | "leases" | "appointments" | "media" | "settings";
export type CompanyTab = "overview" | "requests" | "spaces" | "contracts";
export type AdminRecordTarget = {
  kind: "customers" | "requests" | "leases" | "slot" | "leads" | "appointments" | "media";
  id: string;
  floor?: Floor;
  tab?: CompanyTab;
  page?: number;
};
export type AdminBusinessAction =
  | { kind: "company"; id?: string }
  | { kind: "request"; id?: string; companyId?: string; floor?: Floor; slotIds?: string[] }
  | { kind: "appointment"; id?: string; companyId?: string }
  | { kind: "lead"; id?: string }
  | { kind: "approve" | "reject"; requestId: string }
  | { kind: "lease" | "cancel-hold"; reservationId: string }
  | { kind: "qualify-lead"; leadId: string; mode: "existing" | "new" };
export type AdminLocation = {
  view: AdminView;
  floor: Floor;
  selectedIds: string[];
  scope?: string;
  detail?: AdminRecordTarget;
  action?: AdminBusinessAction;
};
export type AdminListState = Record<string, string | number>;
export type AdminWorkspaceNavigation = {
  location: AdminLocation;
  lists: Record<string, AdminListState>;
  busy: boolean;
  navigateView: (view: AdminView, options?: { floor?: Floor; selectedIds?: string[]; scope?: string }) => void;
  openRecord: (record: AdminRecordTarget) => void;
  updateDetail: (changes: Partial<Pick<AdminRecordTarget, "tab" | "page">>) => void;
  closeDetail: () => void;
  back: () => void;
  canGoBack: boolean;
  openAction: (action: AdminBusinessAction) => void;
  closeAction: () => void;
  completeAction: (record?: AdminRecordTarget) => void;
  setListState: (scope: string, next: SetStateAction<AdminListState>) => void;
  registerLocalEditor: (id: string, onClose: () => void) => () => void;
};
const NavigationContext = createContext<AdminWorkspaceNavigation | null>(null);
export function AdminWorkspaceNavigationProvider({ value, children }: { value: AdminWorkspaceNavigation; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function useOptionalAdminWorkspaceNavigation() { return useContext(NavigationContext); }
export function useAdminWorkspaceNavigation() {
  const navigation = useOptionalAdminWorkspaceNavigation();
  if (!navigation) throw new Error("Admin workspace navigation provider is missing");
  return navigation;
}
export function useAdminListState<T extends AdminListState>(scope: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const navigation = useAdminWorkspaceNavigation();
  const current = { ...initial, ...navigation.lists[scope] } as T;
  const set: Dispatch<SetStateAction<T>> = next => navigation.setListState(scope, previous => {
    const value = { ...initial, ...previous } as T;
    return typeof next === "function" ? next(value) : next;
  });
  return [current, set];
}
