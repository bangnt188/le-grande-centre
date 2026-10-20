"use client";

import * as React from "react";
import type { AdminSession } from "../../shared/admin/contracts";
import { screenCache } from "./memory-cache";
import { clearAdminOperationState } from "./admin-operation-state";

export type { AdminSession };
export class AdminSessionError extends Error {
  constructor(message: string, readonly status: number, readonly code: string = "REQUEST_FAILED") {
    super(message);
    this.name = "AdminSessionError";
  }
}

let session: AdminSession | null = null;
let hydrated = false;
let generation = 0;
let localInFlight: Promise<AdminSession | null> | null = null;
let renewalInFlight: Promise<AdminSession> | null = null;
const sessionRequests = new Set<AbortController>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSessionSnapshot = () => session;
const serverSnapshot = () => null;
export function useAdminSession(): AdminSession | null {
  return React.useSyncExternalStore(subscribe, getSessionSnapshot, serverSnapshot);
}
export function sessionCacheKey(value: AdminSession | null): string {
  return value ? JSON.stringify([value.actorId, value.propertyId, value.role, value.expiresAt]) : "";
}
function publish(value: AdminSession | null) {
  if (sessionCacheKey(session) === sessionCacheKey(value)) return;
  const identity = (item: AdminSession | null) => item && JSON.stringify([item.actorId, item.propertyId, item.role]);
  if (identity(session) !== identity(value)) { screenCache.clear(); clearAdminOperationState(); }
  session = value;
  for (const listener of listeners) listener();
}
/** Call after a deliberate provider account change, before opening the workspace. */
export function clearAdminSession(): void {
  generation++;
  for (const controller of sessionRequests) controller.abort();
  sessionRequests.clear();
  hydrated = false;
  localInFlight = null;
  renewalInFlight = null;
  publish(null);
  screenCache.clear();
}

function parseSession(value: unknown): AdminSession {
  if (!value || typeof value !== "object" || !("actorId" in value) || typeof value.actorId !== "string" || !value.actorId ||
      !("propertyId" in value) || typeof value.propertyId !== "string" || !value.propertyId ||
      !("role" in value) || (value.role !== "administrator" && value.role !== "editor") ||
      !("expiresAt" in value) || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) {
    throw new AdminSessionError("Dữ liệu phiên quản trị không hợp lệ.", 502, "INVALID_RESPONSE");
  }
  return { actorId: value.actorId, propertyId: value.propertyId, role: value.role, expiresAt: value.expiresAt };
}
export async function adminResponseError(response: Response): Promise<AdminSessionError> {
  const value: unknown = await response.json().catch(() => null);
  const problem = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nested = problem.error && typeof problem.error === "object" ? problem.error as Record<string, unknown> : {};
  const message = typeof problem.error === "string" ? problem.error : typeof nested.message === "string" ? nested.message :
    response.status === 401 ? "Phiên đăng nhập hết hạn. Thao tác để đăng nhập lại." : response.status === 403 ? "Bạn không có quyền thực hiện thao tác này." : `Yêu cầu thất bại (${response.status}). Thử lại.`;
  const code = typeof problem.code === "string" ? problem.code : typeof nested.code === "string" ? nested.code :
    response.status === 401 ? "SESSION_MISSING" : response.status === 403 ? "FORBIDDEN" : "REQUEST_FAILED";
  return new AdminSessionError(message.slice(0, 2000), response.status, code);
}
function assertGeneration(expected: number): void {
  if (generation !== expected) throw new DOMException("Session changed", "AbortError");
}

/** Hydrate the signed cookie locally once; never consult the provider here. */
export async function getLocalSession(): Promise<AdminSession | null> {
  if (hydrated) return session && session.expiresAt > Date.now() ? session : null;
  if (localInFlight) return localInFlight;
  const expected = generation;
  const controller = new AbortController();
  sessionRequests.add(controller);
  const task = (async () => {
    const response = await fetch("/api/admin/session/", { method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal });
    assertGeneration(expected);
    if (!response.ok) {
      const error = await adminResponseError(response);
      assertGeneration(expected);
      if (error.status !== 401) throw error;
      hydrated = true;
      publish(null);
      return null;
    }
    const value = parseSession(await response.json());
    assertGeneration(expected);
    hydrated = true;
    publish(value);
    return value;
  })();
  localInFlight = task;
  try { return await task; } finally { sessionRequests.delete(controller); if (localInFlight === task) localInFlight = null; }
}

/** POST is reachable only from an explicit action and only for missing/expired cookies. */
export async function ensureSession({ userAction = false }: { userAction?: boolean } = {}): Promise<AdminSession> {
  const local = await getLocalSession();
  if (local) return local;
  if (!userAction) throw new AdminSessionError("Phiên đăng nhập hết hạn. Thao tác để đăng nhập lại.", 401, session ? "SESSION_EXPIRED" : "SESSION_MISSING");
  if (renewalInFlight) return renewalInFlight;
  const expected = generation;
  const controller = new AbortController();
  sessionRequests.add(controller);
  const task = (async () => {
    const response = await fetch("/api/admin/session/", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal });
    assertGeneration(expected);
    if (!response.ok) {
      const error = await adminResponseError(response);
      assertGeneration(expected);
      if (error.status === 401 || error.status === 403) publish(null);
      throw error;
    }
    const value = parseSession(await response.json());
    assertGeneration(expected);
    hydrated = true;
    publish(value);
    return value;
  })();
  renewalInFlight = task;
  try { return await task; } finally { sessionRequests.delete(controller); if (renewalInFlight === task) renewalInFlight = null; }
}

/** Passive effects may read, but cannot renew. Writes are never automatically replayed. */
export async function adminRequest(path: string, init: RequestInit = {}, { userAction = false, signal = init.signal ?? undefined }: { userAction?: boolean; signal?: AbortSignal } = {}): Promise<Response> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const expected = generation;
  const identity = sessionCacheKey(await ensureSession({ userAction }));
  assertGeneration(expected);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", signal });
  assertGeneration(expected);
  if (identity !== sessionCacheKey(session)) throw new DOMException("Session changed", "AbortError");
  if (!response.ok) {
    const error = await adminResponseError(response);
    assertGeneration(expected);
    if (identity !== sessionCacheKey(session)) throw new DOMException("Session changed", "AbortError");
    if (error.status === 401) { publish(null); hydrated = true; }
    throw error;
  }
  return response;
}

/** DELETE owns provider signout server-side; surface failure rather than claiming success. */
export async function logoutSession(): Promise<void> {
  clearAdminSession();
  hydrated = true;
  const response = await fetch("/api/admin/session/", { method: "DELETE", credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw await adminResponseError(response);
}
