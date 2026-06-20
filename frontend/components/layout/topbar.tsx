"use client";

import { useEffect, useState } from "react";
import { Bell, Calendar, LogOut, Menu } from "lucide-react";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/language-context";
import { notificationService } from "@/services/homex.service";
import type { AuthUser } from "@/types/auth";
import type { NotificationItem } from "@/types/domain";

type TopbarProps = {
  user: AuthUser;
  onMenuClick: () => void;
  onLogout: () => void;
};

function getUserInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Topbar({ user, onMenuClick, onLogout }: TopbarProps) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  async function loadNotifications() {
    try {
      const data = await notificationService.list({ page: 1, limit: 6 });
      setNotifications(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function markAllRead() {
    await notificationService.markAllRead();
    await loadNotifications();
  }

  const formattedTime = currentTime.toLocaleTimeString("vi-VN", { hour12: false });
  const formattedDate = currentTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-white px-3 md:px-4 xl:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 min-w-9 md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        {/* Page title area with icon */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden md:flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>{formattedDate}</span>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono tracking-wider">{formattedTime}</span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3">
        <LanguageToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9 min-w-9 text-slate-500 hover:text-slate-900" title={t("notifications.title")}>
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between gap-3 px-2 py-2">
              <div className="font-semibold">{t("notifications.title")}</div>
              <Button type="button" size="sm" variant="ghost" onClick={markAllRead}>{t("notifications.markAllRead")}</Button>
            </div>
            {notifications.length === 0 ? (
              <DropdownMenuItem disabled>{t("notifications.empty")}</DropdownMenuItem>
            ) : (
              notifications.map((item) => (
                <DropdownMenuItem key={item.id} className="flex flex-col items-start gap-1 whitespace-normal">
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-medium">{item.title}</span>
                    {!item.isRead ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{item.message}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Avatar + Name */}
        <div className="flex min-w-0 items-center gap-2.5 border-l border-slate-200 pl-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white shadow-sm">
            {getUserInitials(user.fullName)}
          </div>
          <div className="hidden min-w-0 max-w-[140px] leading-none md:block">
            <p className="truncate text-xs font-bold text-slate-800">{user.fullName}</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">{user.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
