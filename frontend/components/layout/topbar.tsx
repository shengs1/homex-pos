"use client";

import { useEffect, useState } from "react";
import { Bell, LogOut, Menu } from "lucide-react";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { Badge } from "@/components/ui/badge";
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

export function Topbar({ user, onMenuClick, onLogout }: TopbarProps) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  async function markAllRead() {
    await notificationService.markAllRead();
    await loadNotifications();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 shadow-sm shadow-slate-950/5 backdrop-blur-xl md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 min-w-9 md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("topbar.greeting")}</p>
          <h1 className="truncate text-sm font-semibold md:text-base">{user.fullName}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <LanguageToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="relative h-9 w-9 min-w-9 bg-background/80" title={t("notifications.title")}>
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
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
        <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
        <Button variant="outline" size="sm" className="bg-background/80" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{t("topbar.logout")}</span>
        </Button>
      </div>
    </header>
  );
}
