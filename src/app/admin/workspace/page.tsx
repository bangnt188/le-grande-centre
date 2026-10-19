import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminSessionError } from "@/server/admin-session";
import { requireAdmin } from "@/server/auth";
import AdminWorkspace from "../admin-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quản lý khai thác", robots: { index: false, follow: false } };

export default async function AdminWorkspacePage() {
  let loginRequired = false;
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminSessionError) loginRequired = true;
    else throw error;
  }
  if (loginRequired) redirect("/admin/");

  return <AdminWorkspace />;
}
