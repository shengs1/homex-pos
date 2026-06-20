"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { NetworkStatusBar } from "@/components/shared/network-status-bar";
import { clearAuthStorage, getAuthToken, getAuthUser, isRoleAllowed } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/language-context";
import type { AuthUser, UserRole } from "@/types/auth";

const DEFAULT_ALLOWED_ROLES: UserRole[] = ["ADMIN", "CASHIER"];

// CASHIER chỉ được truy cập 5 route này. Các route quản trị còn lại sẽ bị chặn dù gõ URL trực tiếp.
const CASHIER_ALLOWED_ROUTE_PREFIXES = ["/dashboard", "/pos", "/orders", "/customers", "/warranties", "/shifts", "/products"];

function isCashierRouteAllowed(pathname: string) {
  return CASHIER_ALLOWED_ROUTE_PREFIXES.some((allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`));
}

type DashboardShellProps = {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
};

export function DashboardShell({ children, allowedRoles = DEFAULT_ALLOWED_ROLES }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isRouteBlocked, setIsRouteBlocked] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const noPermissionMessage = useMemo(() => {
    return t("rbac.noAccess") === "rbac.noAccess" ? "Bạn không có quyền truy cập trang này" : t("rbac.noAccess");
  }, [t]);

  useEffect(() => {
    const saved = window.localStorage.getItem("homex-pos-sidebar-collapsed");
    setIsSidebarCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    const currentUser = getAuthUser();

    if (!token || !currentUser) {
      clearAuthStorage();
      router.replace("/login");
      return;
    }

    if (!isRoleAllowed(currentUser.role, allowedRoles)) {
      router.replace("/unauthorized");
      return;
    }

    // RBAC client-side: CASHIER không được truy cập trực tiếp URL quản trị.
    if (currentUser.role === "CASHIER" && !isCashierRouteAllowed(pathname)) {
      setUser(currentUser);
      setIsRouteBlocked(true);
      setIsChecking(false);
      setToastMessage(noPermissionMessage);
      router.replace("/pos");
      return;
    }

    setUser(currentUser);
    setIsRouteBlocked(false);
    setIsChecking(false);
  }, [allowedRoles, noPermissionMessage, pathname, router]);

  useEffect(() => {
    if (!toastMessage) return;

    const timer = window.setTimeout(() => {
      setToastMessage("");
    }, 2800);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    function handleUnauthorized() {
      clearAuthStorage();
      router.replace("/login?expired=1");
    }

    window.addEventListener("homex-pos:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("homex-pos:unauthorized", handleUnauthorized);
    };
  }, [router]);

  function handleToggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("homex-pos-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function handleLogout() {
    clearAuthStorage();
    router.replace("/login");
  }

  if (isChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground shadow-sm">{t("app.loadingAuth")}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full min-w-0 overflow-hidden bg-background text-foreground">
      <div className="z-30 hidden h-full md:block shrink-0">
        <Sidebar role={user.role} collapsed={isSidebarCollapsed} onToggleCollapsed={handleToggleSidebar} onLogout={handleLogout} />
      </div>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t("topbar.closeMenu")}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative h-full w-64 shadow-2xl">
            <Sidebar role={user.role} onNavigate={() => setIsMobileSidebarOpen(false)} onLogout={handleLogout} />
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive font-bold shadow-lg backdrop-blur-md">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      ) : null}

      <div className="flex h-screen min-w-0 flex-1 flex-col bg-slate-50">
        <Topbar user={user} onMenuClick={() => setIsMobileSidebarOpen(true)} onLogout={handleLogout} />
        <NetworkStatusBar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-5 xl:p-6">
          <ErrorBoundary>
            {isRouteBlocked ? (
              <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">{noPermissionMessage}</div>
            ) : (
              children
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
