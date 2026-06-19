"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileClock,
  FileText,
  Home,
  LayoutDashboard,
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
import { Button } from "@/components/ui/button";
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
};

export function Sidebar({ role, collapsed = false, onToggleCollapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLanguage();

  const visibleMenuItems = useMemo(() => {
    return SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role));
  }, [role]);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-slate-900 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-950/20 transition-all duration-200",
        collapsed ? "w-20" : "w-72"
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-white/10 px-4", collapsed ? "justify-center" : "gap-3")}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
          <Home className="h-5 w-5" />
        </div>

        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold leading-none text-white">Homex POS</p>
            <p className="mt-1 truncate text-xs text-slate-400">{t("app.subtitle")}</p>
          </div>
        ) : null}

        {onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "hidden text-slate-300 hover:bg-white/10 hover:text-white md:inline-flex",
              collapsed && "absolute left-[4.25rem] bg-slate-950 shadow-lg"
            )}
            title={collapsed ? t("topbar.expandSidebar") : t("topbar.collapseSidebar")}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const label = t(item.titleKey);
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? label : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white",
                collapsed ? "justify-center" : "gap-3",
                isActive && "bg-white text-slate-950 shadow-sm hover:bg-white hover:text-slate-950"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span className="truncate">{label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
