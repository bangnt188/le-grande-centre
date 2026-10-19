"use client";

import { useEffect, useState } from "react";

function publicHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function useAdminLogoUrl(): string | undefined {
  const [logoUrl, setLogoUrl] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetch("/api/public/branding/", {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return undefined;
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
      return publicHttpsUrl((payload as Record<string, unknown>).logoUrl);
    }).then(value => {
      if (active) setLogoUrl(value);
    }).catch(() => {
      // Branding is optional and never gates login or admin access.
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return logoUrl;
}
