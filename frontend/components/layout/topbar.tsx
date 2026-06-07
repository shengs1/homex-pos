"use client";

import { LogOut, Menu } from "lucide-react";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import type { AuthUser } from "@/types/auth";

type TopbarProps = {
  user: AuthUser;
  onMenuClick: () => void;
  onLogout: () => void;
};

export function Topbar({ user, onMenuClick, onLogout }: TopbarProps) {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t("topbar.greeting")}</p>
          <h1 className="truncate text-base font-semibold md:text-lg">{user.fullName}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <LanguageToggle />
        <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{t("topbar.logout")}</span>
        </Button>
      </div>
    </header>
  );
}
