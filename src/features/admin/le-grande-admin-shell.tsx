"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminShell, Button, type AdminNavigationItem } from "@mall/ui";
import { AdminToastViewport } from "./admin-notifications";
import { AdminBrandImage } from "./admin-brand-image";

export function LeGrandeAdminShell({
  navigation,
  activeItemId,
  location,
  children,
  onLogout,
  propertyName = "Le Grande Centre",
  logoUrl,
}: {
  navigation: AdminNavigationItem[];
  activeItemId: string;
  location: ReactNode;
  children: ReactNode;
  onLogout: () => void;
  propertyName?: string;
  logoUrl?: string;
}) {
  const utilityActions = () => <>
    <Link className="admin-website-link" href="/" target="_blank" rel="noopener noreferrer" prefetch={false}>
      Mở website
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>
      </svg>
    </Link>
    <Button variant="quiet" size="sm" onClick={onLogout}>Đăng xuất</Button>
  </>;

  return (
    <div className="legrande-admin" data-ui-root data-ui-theme="shopping-mall" data-ui-scheme="light" data-ui-density="compact">
      <AdminShell
        className="mall-admin-shell"
        mainId="admin-workspace"
        mode="sidebar"
        navigation={navigation}
        activeItemId={activeItemId}
        navigationLabel="Điều hướng quản trị"
        brand={{
          name: propertyName,
          description: "Quản lý khai thác",
          mark: logoUrl ? <AdminBrandImage src={logoUrl} alt="" width={42} height={42}/> : undefined,
        }}
        location={location}
        headerActions={utilityActions()}
        mobileHeaderActions={utilityActions()}
        sidebarFooter={<><strong>Quản trị nội bộ</strong><p>6 tầng cố định</p></>}
        footer={<div className="admin-footer"><span>{propertyName} · Không gian quản trị</span><span>Dữ liệu được lưu an toàn trên hệ thống</span></div>}
      >
        {children}
      </AdminShell>
      <AdminToastViewport/>
    </div>
  );
}
