"use client";

import { useRequireRole } from "@/lib/use-require-role";
import { StaffTopBar } from "@/components/staff-top-bar";
import { AdminNav } from "@/components/admin-nav";
import { Skeleton } from "@/components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { checking, allowed } = useRequireRole("ADMIN");

  if (checking || !allowed) {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <StaffTopBar label="Admin" />
      <AdminNav />
      {children}
    </div>
  );
}
