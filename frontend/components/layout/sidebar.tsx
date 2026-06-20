"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CreditCard,
  FileClock,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Package,
  ClipboardList,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  TicketPercent,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/auth";

type SidebarMenuItem = {
  titleKey: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];
};

const SIDEBAR_MENU_ITEMS: SidebarMenuItem[] = [
  // CASHIER được phép thấy đúng 5 mục: Dashboard, POS, Orders, Customers, Warranties.
  { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["ADMIN", "CASHIER"] },
  { titleKey: "nav.pos", href: "/pos", icon: ShoppingCart, roles: ["ADMIN", "CASHIER"] },
  { titleKey: "nav.orders", href: "/orders", icon: ReceiptText, roles: ["ADMIN", "CASHIER"] },
  { titleKey: "nav.customers", href: "/customers", icon: Users, roles: ["ADMIN", "CASHIER"] },
  { titleKey: "nav.warranties", href: "/warranties", icon: ShieldCheck, roles: ["ADMIN", "CASHIER"] },

  // Các mục quản trị chỉ ADMIN mới được nhìn thấy.
  { titleKey: "nav.products", href: "/products", icon: Package, roles: ["ADMIN"] },
  { titleKey: "nav.categories", href: "/categories", icon: Tags, roles: ["ADMIN"] },
  { titleKey: "nav.suppliers", href: "/suppliers", icon: Truck, roles: ["ADMIN"] },
  { titleKey: "nav.inventory", href: "/inventory", icon: Warehouse, roles: ["ADMIN"] },
  { titleKey: "nav.purchaseOrders", href: "/purchase-orders", icon: ClipboardList, roles: ["ADMIN"] },
  { titleKey: "nav.returnOrders", href: "/return-orders", icon: RotateCcw, roles: ["ADMIN"] },
  { titleKey: "nav.shifts", href: "/shifts", icon: FileText, roles: ["ADMIN"] },
  { titleKey: "nav.vatInvoices", href: "/vat-invoices", icon: FileClock, roles: ["ADMIN"] },
  { titleKey: "nav.payments", href: "/payments", icon: CreditCard, roles: ["ADMIN"] },
  { titleKey: "nav.promotions", href: "/promotions", icon: TicketPercent, roles: ["ADMIN"] },
  { titleKey: "nav.reports", href: "/reports", icon: BarChart3, roles: ["ADMIN"] },
  { titleKey: "nav.settings", href: "/settings", icon: Settings, roles: ["ADMIN"] },
  { titleKey: "nav.users", href: "/users", icon: Boxes, roles: ["ADMIN"] },
  { titleKey: "nav.auditLogs", href: "/audit-logs", icon: FileClock, roles: ["ADMIN"] },
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

  const visibleMenuItems = useMemo(() => {
    return SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role));
  }, [role]);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col bg-slate-900 text-slate-400 transition-all duration-200",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo Header */}
      <div className={cn("flex h-16 shrink-0 items-center border-b border-slate-800/40 px-5", collapsed ? "justify-center" : "gap-3")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Home className="h-5 w-5" />
        </div>

        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black leading-none tracking-tight text-white">Homex POS</p>
            <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("app.subtitle")}</p>
          </div>
        ) : null}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <ul className="space-y-0.5 px-3">
          {visibleMenuItems.map((item) => {
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
                    "flex items-center rounded-xl px-4 py-2.5 transition-all duration-200",
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
