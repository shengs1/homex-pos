"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { NetworkStatusBar } from "@/components/shared/network-status-bar";
import { clearAuthStorage, getAuthToken, getAuthUser, isRoleAllowed } from "@/lib/auth";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { useSettings } from "@/contexts/settings-context";
import type { AuthUser, UserRole } from "@/types/auth";

const DEFAULT_ALLOWED_ROLES: UserRole[] = ["ADMIN", "CASHIER"];

// CASHIER chỉ được truy cập 5 route này. Các route quản trị còn lại sẽ bị chặn dù gõ URL trực tiếp.
const CASHIER_ALLOWED_ROUTE_PREFIXES = ["/dashboard", "/pos", "/orders", "/customers", "/warranties", "/shifts"];

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
  const { toast } = useToast();
  const { settings } = useSettings();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const redirectRef = useRef<string | null>(null);

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
      if (redirectRef.current !== "/login") {
        redirectRef.current = "/login";
        router.replace("/login");
      }
      setUser(null);
      setIsRouteBlocked(false);
      setIsChecking(false);
      return;
    }

    if (!isRoleAllowed(currentUser.role, allowedRoles)) {
      setUser(currentUser);
      setIsRouteBlocked(true);
      setIsChecking(false);
      return;
    }

    // RBAC client-side: CASHIER không được truy cập trực tiếp URL quản trị.
    if (currentUser.role === "CASHIER" && !isCashierRouteAllowed(pathname)) {
      if (redirectRef.current !== pathname) {
        redirectRef.current = pathname;
        toast.error(noPermissionMessage);
      }
      setUser(currentUser);
      setIsRouteBlocked(true);
      setIsChecking(false);
      return;
    }

    redirectRef.current = null;
    setUser(currentUser);
    setIsRouteBlocked(false);
    setIsChecking(false);
  }, [allowedRoles, noPermissionMessage, pathname, router, toast]);

  useEffect(() => {
    function handleUnauthorized() {
      clearAuthStorage();
      setUser(null);
      setIsRouteBlocked(false);
      setIsChecking(false);
      if (redirectRef.current !== "/login?expired=1") {
        redirectRef.current = "/login?expired=1";
        router.replace("/login?expired=1");
      }
    }

    window.addEventListener("homex-pos:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("homex-pos:unauthorized", handleUnauthorized);
    };
  }, [router]);

  useEffect(() => {
    const minutes = settings?.autoLockMinutes;
    if (!user || user.role !== "CASHIER" || !minutes) return;

    let timeout: number;

    function resetTimer() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        clearAuthStorage();
        setUser(null);
        setIsRouteBlocked(false);
        setIsChecking(false);
        router.replace("/login?expired=1");
      }, (minutes as number) * 60 * 1000);
    }

    resetTimer();

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    for (const event of events) {
      window.addEventListener(event, resetTimer);
    }

    return () => {
      window.clearTimeout(timeout);
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [user, settings?.autoLockMinutes, router]);

  function handleToggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("homex-pos-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function handleLogout() {
    clearAuthStorage();
    setUser(null);
    setIsRouteBlocked(false);
    setIsChecking(false);
    router.replace("/login");
  }

  if (isChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground shadow-sm">Checking authentication</div>
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
