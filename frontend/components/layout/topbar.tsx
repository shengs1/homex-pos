"use client";

import { useEffect, useState } from "react";
import { Bell, Calendar, LogOut, Menu, Check, X, Trash2, Info, AlertTriangle, AlertCircle } from "lucide-react";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/language-context";
import { notificationService } from "@/services/homex.service";
import { useToast } from "@/contexts/toast-context";
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

function getNotificationIcon(type: string) {
  switch (type) {
    case "LOW_STOCK":
    case "OUT_OF_STOCK":
    case "ORDER_ISSUE":
    case "WARRANTY_EXPIRING":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case "VAT_PENDING":
    case "SHIFT_OPEN":
      return <Info className="h-5 w-5 text-blue-500" />;
    case "SYSTEM":
    default:
      return <AlertCircle className="h-5 w-5 text-slate-500" />;
  }
}

export function Topbar({ user, onMenuClick, onLogout }: TopbarProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isOpen, setIsOpen] = useState(false);

  async function loadNotifications() {
    try {
      const data = await notificationService.list({ page: 1, limit: 10 });
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
    if (unreadCount === 0) return;
    try {
      await notificationService.markAllRead();
      await loadNotifications();
      toast.success(t("notifications.markedAllRead") || "Đã đánh dấu tất cả thông báo là đã đọc.");
    } catch {
      toast.error(t("notifications.deleteFailed") || "Có lỗi xảy ra.");
    }
  }

  async function handleDeleteNotification(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await notificationService.delete(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - (notifications.find(n => n.id === id && !n.isRead) ? 1 : 0)));
      toast.success(t("notifications.deleted") || "Đã xóa thông báo.");
    } catch {
      toast.error(t("notifications.deleteFailed") || "Không thể xóa thông báo.");
    }
  }

  async function handleDeleteRead() {
    const readCount = notifications.filter(n => n.isRead).length;
    if (readCount === 0) {
      toast.info(t("notifications.noReadToDelete") || "Không có thông báo đã đọc để xóa.");
      return;
    }
    try {
      await notificationService.deleteRead();
      await loadNotifications();
      toast.success(t("notifications.deleteReadSuccess") || "Đã xóa tất cả thông báo đã đọc.");
    } catch {
      toast.error(t("notifications.deleteFailed") || "Không thể xóa thông báo.");
    }
  }

  const formattedTime = currentTime.toLocaleTimeString("vi-VN", { hour12: false });
  const formattedDate = currentTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-white px-3 md:px-4 xl:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 min-w-9 md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>

        {/* Page title area with portal */}
        <div id="page-title-portal" className="flex min-w-0 flex-1 items-center gap-2"></div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3">
        <div className="hidden lg:flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>{formattedDate}</span>
        </div>
        <div className="hidden md:flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono tracking-wider">{formattedTime}</span>
        </div>
        <LanguageToggle />

        {/* Notifications */}
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
          <DropdownMenuContent align="end" className="w-[360px] p-0 shadow-lg overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b px-4 py-3 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm uppercase tracking-wider">{t("notifications.title")}</span>
                {unreadCount > 0 && (
                  <span className="flex h-5 items-center justify-center rounded-full bg-destructive px-2 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:text-emerald-600 hover:bg-emerald-50" onClick={markAllRead} title={t("notifications.markAllRead")}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:text-slate-900 hover:bg-slate-200" onClick={() => setIsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  {t("notifications.empty")}
                </div>
              ) : (
                <div className="flex flex-col">
                  {notifications.map((item) => (
                    <div key={item.id} className="group relative flex items-start gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50">
                      <div className="mt-0.5 shrink-0">
                        {getNotificationIcon(item.type)}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold leading-tight text-slate-800">
                            {item.title}
                          </span>
                          {!item.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                        </div>
                        <span className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {item.message}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {new Date(item.createdAt).toLocaleString("vi-VN", { 
                            hour: "2-digit", minute: "2-digit", 
                            day: "2-digit", month: "2-digit", year: "numeric" 
                          })}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 h-6 w-6 shrink-0 rounded-full text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => handleDeleteNotification(e, item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t bg-slate-50 p-1">
              <Button
                variant="ghost"
                className="w-full justify-center gap-2 text-xs font-semibold text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                onClick={handleDeleteRead}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("notifications.deleteRead") || "Xóa tất cả thông báo đã đọc"}
              </Button>
            </div>
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
