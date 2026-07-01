"use client";
 
import { useCurrentUser } from "@/hooks/use-current-user";
import { AccessDenied } from "@/components/auth/access-denied";
import { useLanguage } from "@/contexts/language-context";
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
    return <AccessDenied />;
  }
 
  return <>{children}</>;
}
