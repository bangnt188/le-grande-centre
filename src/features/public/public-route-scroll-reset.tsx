"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Give public page-to-page navigation a consistent top-of-page starting point. */
export function PublicRouteScrollReset() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const historyPathname = useRef<string | null>(null);

  useEffect(() => {
    const rememberHistoryTarget = () => {
      historyPathname.current = window.location.pathname;
    };

    window.addEventListener("popstate", rememberHistoryTarget);
    return () => window.removeEventListener("popstate", rememberHistoryTarget);
  }, []);

  useEffect(() => {
    if (pathname === previousPathname.current) return;
    previousPathname.current = pathname;

    const isHistoryNavigation = historyPathname.current === window.location.pathname;
    historyPathname.current = null;
    if (isHistoryNavigation || window.location.hash) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
