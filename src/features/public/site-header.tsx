"use client";

import { useRef } from "react";
import Link from "next/link";
import { useShowcaseReelHeaderMotion } from "@mall/ui/motion";
import { useWebsiteSettings } from "./website-settings";
import { PUBLIC_NAVIGATION } from "./site-content";
import styles from "./site-shell.module.css";

export function SiteHeader({ active = "/", overlay = false, showAdminLink = false }: { active?: string; overlay?: boolean; showAdminLink?: boolean }) {
  const header = useRef<HTMLElement>(null);
  useShowcaseReelHeaderMotion(header, active === "/tong-quan-tang/");
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => mobileMenu.current?.removeAttribute("open");
  const navigateToTop = () => {
    closeMenu();
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const { logoUrl } = useWebsiteSettings();
  const links = PUBLIC_NAVIGATION.map(item => <Link key={item.href} href={item.href} data-ui-interaction="underline" prefetch={true} onNavigate={navigateToTop} aria-current={active === item.href ? "page" : undefined} className={item.href === "/lien-he/" ? styles.visitLink : undefined}>{item.label}{item.href === "/lien-he/" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>}</Link>);
  const navigation = links;
  return <header ref={header} className={`${styles.header} ${overlay ? styles.overlay : ""}`} data-ui-interaction-group="colors">
    <Link href="/" className={styles.brand} data-ui-header-brand aria-label="Le Grande Centre — Trang chủ" onNavigate={navigateToTop}>
      {logoUrl && <img className={styles.brandMark} data-ui-header-mark src={logoUrl} width="40" height="40" alt=""/>}
      <span className={styles.brandText} data-ui-header-text><strong>Le Grande</strong><span>Centre</span></span>
    </Link>
    <nav className={styles.desktopNavigation} data-ui-header-navigation aria-label="Điều hướng chính">{navigation}</nav>
    <details className={styles.mobileMenu} data-ui-header-navigation ref={mobileMenu} onKeyDown={event => { if (event.key === "Escape") { closeMenu(); mobileMenu.current?.querySelector("summary")?.focus(); } }}>
      <summary>Menu<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5"/></svg></summary>
      <nav aria-label="Điều hướng chính trên điện thoại">{navigation}</nav>
    </details>
    {showAdminLink && <Link className={styles.adminLink} data-ui-header-navigation href="/admin/" prefetch={false} onNavigate={navigateToTop}>Quản trị</Link>}
  </header>;
}
