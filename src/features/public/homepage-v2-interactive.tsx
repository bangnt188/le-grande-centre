"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { LayeredScrollStory, TransitionImage } from "@mall/ui";
import { RevealLifecycle, ScrollMotion } from "@mall/ui/motion";
import { responsiveImageProps } from "./responsive-images";

import styles from "./homepage-v2.module.css";

export function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>;
}

export function HomeScrollStory({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return <>
    <ScrollMotion refreshKey="homepage-v2" revealSelector={`#main-content [data-ui-layered-surface] > section:not([aria-label]):not(#phan-khu):not(#gioi-thieu):not(.${styles.location})`}/>
    <RevealLifecycle
      rootSelector="#main-content"
      entranceSelector={`.${styles.hero} [data-reveal]`}
      scrollSelector={`#gioi-thieu [data-reveal], .${styles.location} [data-reveal]`}
    />
    <LayeredScrollStory className={styles.story}>
      <LayeredScrollStory.Hero>{hero}</LayeredScrollStory.Hero>
      <LayeredScrollStory.Surface>{children}</LayeredScrollStory.Surface>
    </LayeredScrollStory>
  </>;
}
const spaces = [
  { id: "retail", title: "Bán lẻ / Shophouse", floor: 1 },
  { id: "office", title: "Văn phòng", floor: 3 },
  { id: "cafe", title: "Ẩm thực", floor: 1 },
  { id: "services", title: "Dịch vụ", floor: 4 },
  { id: "entertainment", title: "Giải trí", floor: 5 },
  { id: "market", title: "Siêu thị mini", floor: 1 },
];

export function SpacesGallery({ assetBase }: { assetBase: string }) {
  return <ul className={styles.spacesGallery} aria-label="Các loại hình không gian kinh doanh">
    {spaces.map(space => <li className={styles.spaceTile} key={space.id}>
      <Link href={`/mat-bang/#tang-${space.floor}`} prefetch={false} className={styles.spacePanel}>
        <img {...responsiveImageProps(`/images/home-v2/${space.id}.webp`, assetBase, "(max-width: 1000px) 50vw, 24vw")} alt="" loading="lazy" decoding="async"/>
        <span className={styles.spaceIllustration}>Minh họa</span>
        <span className={styles.spaceLabel}>{space.title}</span>
      </Link>
    </li>)}
  </ul>;
}

const views = [
  { title: "Bối cảnh đô thị", path: "/images/le-grande-aerial-context.webp", caption: "Le Grande Centre bên vòng xoay Tượng đài 3 Cô Gái và Hồ Nước Ngọt." },
  { title: "Công trình thực tế", path: "/images/le-grande-aerial-close.webp", caption: "Góc nhìn cận cảnh công trình Le Grande Centre." },
  { title: "Phối cảnh kiến trúc", path: "/client-reference/canva/project-perspective.jpg", caption: "Phối cảnh minh họa kiến trúc và cảnh quan dự án." },
];

export function OverviewGallery({ assetBase }: { assetBase: string }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState({ index: 0, exitingIndex: null as number | null, direction: 1 });
  const selected = selection.index;
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isInViewport, setIsInViewport] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const isPaused = isHovered || hasFocus;
  const currentView = views[selected] ?? views[0];

  useEffect(() => {
    if (selection.exitingIndex === null) return;
    if (prefersReducedMotion) {
      setSelection(current => current.exitingIndex === null ? current : { ...current, exitingIndex: null });
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSelection(current => current.exitingIndex === selection.exitingIndex ? { ...current, exitingIndex: null } : current);
    }, 480);
    return () => window.clearTimeout(timeoutId);
  }, [prefersReducedMotion, selection.exitingIndex]);

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    if (!("IntersectionObserver" in window)) {
      setIsInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(entries => setIsInViewport(entries[0]?.isIntersecting ?? false), { threshold: 0.1 });
    observer.observe(gallery);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncDocumentVisibility = () => setIsDocumentVisible(document.visibilityState === "visible");
    syncDocumentVisibility();
    document.addEventListener("visibilitychange", syncDocumentVisibility);
    return () => document.removeEventListener("visibilitychange", syncDocumentVisibility);
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);
    syncMotionPreference();
    motionPreference.addEventListener("change", syncMotionPreference);
    return () => motionPreference.removeEventListener("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    if (isPaused || !isInViewport || !isDocumentVisible || prefersReducedMotion || views.length < 2) return;
    const timeoutId = window.setTimeout(() => {
      setSelection(current => ({ index: (current.index + 1) % views.length, exitingIndex: current.index, direction: 1 }));
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [isDocumentVisible, isInViewport, isPaused, prefersReducedMotion, selected]);

  const move = (step: number) => {
    setSelection(current => ({ index: (current.index + step + views.length) % views.length, exitingIndex: current.index, direction: step }));
  };

  const select = (index: number) => {
    setSelection(current => {
      if (current.index === index) return current;
      const forwardDistance = (index - current.index + views.length) % views.length;
      return { index, exitingIndex: current.index, direction: forwardDistance <= views.length / 2 ? 1 : -1 };
    });
  };

  return <div
    ref={galleryRef}
    className={styles.overviewGallery}
    role="region"
    aria-label="Tổng quan Le Grande Centre"
    aria-roledescription="carousel"
    onMouseEnter={() => setIsHovered(true)}
    onMouseLeave={() => setIsHovered(false)}
    onFocusCapture={() => setHasFocus(true)}
    onBlurCapture={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
    }}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }
    }}
  >
    <figure id="project-view" className={styles.overviewSlide} role="group" aria-label={`Ảnh ${selected + 1} trên ${views.length}: ${currentView.title}`} aria-roledescription="slide">
      <div className={styles.overviewImageFrame} data-direction={selection.direction > 0 ? "forward" : "backward"}>
        {selection.exitingIndex !== null && !prefersReducedMotion && <img
          key={selection.exitingIndex}
          {...responsiveImageProps(views[selection.exitingIndex]?.path ?? currentView.path, assetBase, "(max-width: 1340px) 88vw, 1180px")}
          className={styles.overviewImageOutgoing}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
        />}
        <TransitionImage {...responsiveImageProps(currentView.path, assetBase, "(max-width: 1340px) 88vw, 1180px")} className={styles.overviewImage} alt={currentView.caption} loading="eager" decoding="async"/>
        {views.length > 1 && <div className={styles.overviewArrows} role="group" aria-label="Điều hướng ảnh">
          <button type="button" className={styles.overviewArrow} aria-label="Ảnh trước" onClick={() => move(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
          </button>
          <button type="button" className={styles.overviewArrow} aria-label="Ảnh tiếp theo" onClick={() => move(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>
          </button>
        </div>}
      </div>
      <figcaption aria-live={isPaused || prefersReducedMotion ? "polite" : "off"} aria-atomic="true">{currentView.caption}</figcaption>
    </figure>
    {views.length > 1 && <div className={styles.overviewDots} role="group" aria-label="Chọn ảnh tổng quan">
      {views.map((view, index) => <button
        key={view.title}
        type="button"
        className={styles.overviewDotButton}
        aria-label={`Ảnh ${index + 1}: ${view.title}`}
        aria-pressed={selected === index}
        onClick={() => select(index)}
      ><span className={styles.overviewDot} aria-hidden="true"/></button>)}
    </div>}
  </div>;
}
