"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";

export default function UnauthorizedPage() {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <CardTitle>{t("auth.noPermission")}</CardTitle>
          <CardDescription>{t("auth.currentNoPermission")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants()}>{t("auth.backDashboard")}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
