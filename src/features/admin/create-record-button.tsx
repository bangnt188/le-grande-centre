"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@mall/ui";

type Props = Omit<ButtonProps, "children" | "variant"> & { children: ReactNode };

/** Shared entry point for creating a business record in admin workspaces. */
export function CreateRecordButton({ children, className, ...props }: Props) {
  return <Button {...props} variant="primary" className={["admin-create-button", className].filter(Boolean).join(" ")}>
    <Plus size={18} aria-hidden="true"/>{children}
  </Button>;
}
