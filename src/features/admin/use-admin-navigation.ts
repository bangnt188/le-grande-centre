"use client";

import { useEffect, useState } from "react";
import { useAdminSession } from "./session";
import { hasAdminUnsavedDrafts } from "./admin-operation-state";

export type AdminNavigationGuard = {
  navigate: (action: () => void) => void;
  pendingNavigation: (() => void) | null;
  stay: () => void;
  continue: () => void;
};

/** Record editors own drafts; navigation only guards against discarding them. */
export function useAdminNavigation(hasUnsaved: boolean): AdminNavigationGuard {
  const session = useAdminSession();
  const identity = session && JSON.stringify([session.actorId, session.propertyId]);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  useEffect(() => { setPendingNavigation(null); }, [identity]);
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);
  return {
    navigate: action => {
      if (identity && hasAdminUnsavedDrafts(identity)) setPendingNavigation(() => action);
      else action();
    },
    pendingNavigation,
    stay: () => setPendingNavigation(null),
    continue: () => { const action = pendingNavigation; setPendingNavigation(null); action?.(); },
  };
}
