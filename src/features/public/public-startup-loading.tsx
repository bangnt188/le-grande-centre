"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LoadingScreen } from "@mall/ui";

type StartupContent = { logoUrl: string | null };
const StartupContext = createContext<((content: StartupContent) => void) | null>(null);

/** The shell renders before the public data, and persists across client navigation. */
export function PublicStartupLoading({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<StartupContent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") setReady(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready]);

  useEffect(() => {
    if (ready || !content) return;
    let active = true;
    const finish = () => { if (active) setReady(true); };
    const timeout = window.setTimeout(finish, 5000);
    let firstFrame = 0;
    let secondFrame = 0;
    const painted = new Promise<void>(resolve => {
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => resolve());
      });
    });
    const images = Array.from(document.images).filter(image => image.fetchPriority === "high");
    void Promise.allSettled([painted, document.fonts.ready, ...images.map(image => image.decode())]).then(finish);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [ready, content]);

  return <StartupContext.Provider value={setContent}>
    <div data-ui-theme="shopping-mall" data-ui-scheme="light">
      <LoadingScreen
        logo={content?.logoUrl ? <img src={content.logoUrl} width={76} height={76} alt="" fetchPriority="high"/> : undefined}
        brand={<span style={{ fontFamily: "var(--font-charis-sil), Georgia, serif" }}>Le Grande<small>Centre</small></span>}
        label="Đang mở Le Grande Centre"
        ready={ready}
        onSkip={() => setReady(true)}
        skipLabel="Vào thẳng website"
      />
    </div>
    <noscript><style>{"[data-ui-loading-screen]{display:none!important}div[hidden]:has(> [data-public-startup-content]){display:contents!important}"}</style></noscript>
    {children}
  </StartupContext.Provider>;
}

/** Only a resolved public-data subtree can release the initial shell. */
export function PublicStartupContentReady({ logoUrl }: StartupContent) {
  const signalReady = useContext(StartupContext);
  useEffect(() => {
    signalReady?.({ logoUrl });
  }, [signalReady, logoUrl]);
  return null;
}
