"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { UserRole } from "@/types/auth";

type RoleGuardProps = {
  allowedRoles: UserRole[];
  children: React.ReactNode;
};

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { t } = useLanguage();
  const user = useCurrentUser();

  if (!user) {
    return <div className="text-sm text-muted-foreground">{t("auth.checkingPermission")}</div>;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>{t("auth.noPermission")}</CardTitle>
            <CardDescription>{t("auth.noPermissionDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={buttonVariants()}>{t("auth.backDashboard")}</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
