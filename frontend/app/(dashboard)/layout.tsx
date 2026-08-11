import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DashboardShell>{children}</DashboardShell>;
}

