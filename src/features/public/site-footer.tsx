"use client";

import Link from "next/link";
import { PUBLIC_NAVIGATION } from "./site-content";
import { useWebsiteSettings, WebsiteLeasingPhones } from "./website-settings";
import { telephoneHref } from "@/shared/admin/website-defaults";
import styles from "./site-shell.module.css";
import { ContactDock } from "./contact-dock";

export function SiteFooter() {
  const { settings } = useWebsiteSettings();
  return <><footer className={styles.footer}>
    <section><Link className={styles.footerBrand} href="/">Le Grande Centre</Link><p>Nơi hội tụ thương mại – văn phòng – giải trí trong một không gian tinh tế và hiện đại.</p></section>
    <section><h2>Liên hệ</h2><address>{settings.address}</address><h3>Cho thuê</h3><WebsiteLeasingPhones/>{settings.managementPhone && <><h3>Ban quản lý</h3><a href={telephoneHref(settings.managementPhone)}>{settings.managementPhone}</a></>}<a href={`mailto:${settings.email}`}>{settings.email}</a></section>
    <nav aria-label="Khám phá dự án"><h2>Khám phá</h2>{PUBLIC_NAVIGATION.filter(item => item.href !== "/").map(item => <Link key={item.href} href={item.href} prefetch={true}>{item.label}</Link>)}</nav>
  </footer><ContactDock/></>;
}
