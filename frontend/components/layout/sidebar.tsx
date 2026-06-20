"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  FileClock,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Package,
  ClipboardList,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  TicketPercent,
  Truck,
  Users,
  Warehouse,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

type SidebarMenuItem = {
  titleKey: string;
  href: string;
  icon: React.ElementType;
};

type SidebarMenuSection = {
  titleKey: string;
  items: SidebarMenuItem[];
};

const ADMIN_SIDEBAR_SECTIONS: SidebarMenuSection[] = [
  {
    titleKey: "nav.groupOverview",
    items: [{ titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    titleKey: "nav.groupSales",
    items: [
      { titleKey: "nav.pos", href: "/pos", icon: ShoppingCart },
      { titleKey: "nav.invoices", href: "/orders", icon: ReceiptText },
      { titleKey: "nav.customers", href: "/customers", icon: Users },
      { titleKey: "nav.warranties", href: "/warranties", icon: ShieldCheck },
      { titleKey: "nav.promotions", href: "/promotions", icon: TicketPercent },
      { titleKey: "nav.vatInvoices", href: "/vat-invoices", icon: FileClock },
    ],
  },
  {
    titleKey: "nav.groupInventory",
    items: [
      { titleKey: "nav.inventory", href: "/inventory", icon: Warehouse },
      { titleKey: "nav.products", href: "/products", icon: Package },
      { titleKey: "nav.categories", href: "/categories", icon: Tags },
      { titleKey: "nav.suppliers", href: "/suppliers", icon: Truck },
      { titleKey: "nav.purchaseOrders", href: "/purchase-orders", icon: ClipboardList },
    ],
  },
  {
    titleKey: "nav.groupOperations",
    items: [
      { titleKey: "nav.shifts", href: "/shifts", icon: FileText },
      { titleKey: "nav.employees", href: "/users", icon: Boxes },
    ],
  },
  {
    titleKey: "nav.groupAdmin",
    items: [
      { titleKey: "nav.reports", href: "/reports", icon: BarChart3 },
      { titleKey: "nav.settings", href: "/settings", icon: Settings },
      { titleKey: "nav.auditLogs", href: "/audit-logs", icon: FileClock },
    ],
  },
];

const CASHIER_SIDEBAR_SECTIONS: SidebarMenuSection[] = [
  {
    titleKey: "nav.groupOverview",
    items: [{ titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    titleKey: "nav.groupSales",
    items: [
      { titleKey: "nav.pos", href: "/pos", icon: ShoppingCart },
      { titleKey: "nav.invoices", href: "/orders", icon: ReceiptText },
      { titleKey: "nav.customers", href: "/customers", icon: Users },
      { titleKey: "nav.warranties", href: "/warranties", icon: ShieldCheck },
    ],
  },
  {
    titleKey: "nav.groupOperations",
    items: [{ titleKey: "nav.shifts", href: "/shifts", icon: FileText }],
  },
];

type SidebarProps = {
  role: UserRole;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function Sidebar({ role, collapsed = false, onToggleCollapsed, onNavigate, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLanguage();

  const visibleSections = useMemo(() => {
    return role === "ADMIN" ? ADMIN_SIDEBAR_SECTIONS : CASHIER_SIDEBAR_SECTIONS;
  }, [role]);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col bg-slate-900 text-slate-400 transition-all duration-200",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo Header */}
      <div className={cn("flex h-16 shrink-0 items-center border-b border-slate-800/40 px-4", collapsed ? "justify-center" : "gap-3")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Home className="h-5 w-5" />
        </div>

        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black leading-none tracking-tight text-white">Homex POS</p>
            <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("app.subtitle")}</p>
          </div>
        ) : null}

        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white shrink-0",
              collapsed ? "absolute -right-4 top-4 z-50 bg-slate-800 border border-slate-700 rounded-full shadow-md" : ""
            )}
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <div className="space-y-4 px-3">
          {visibleSections.map((section) => (
            <div key={section.titleKey} className="min-w-0">
              {!collapsed ? (
                <p className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">{t(section.titleKey)}</p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const label = t(item.titleKey);
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? label : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "flex min-w-0 items-center rounded-xl px-3 py-2.5 transition-all duration-200",
                          collapsed ? "justify-center" : "gap-3",
                          isActive
                            ? "bg-primary text-white font-bold shadow-md shadow-primary/20"
                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {!collapsed ? <span className="truncate text-xs font-bold uppercase tracking-wide">{label}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Logout Button - Bottom */}
      {onLogout ? (
        <div className="shrink-0 border-t border-slate-800/40 p-3">
          <button
            type="button"
            onClick={onLogout}
            className={cn(
              "flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition-all duration-200 hover:bg-red-950/30 hover:text-red-400",
              collapsed ? "gap-0" : "gap-2"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>{t("topbar.logout")}</span> : null}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
