"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/language-context";

export function AccessDenied() {
  const { t } = useLanguage();

  return (
    <div className="flex-1 w-full h-full min-h-[450px] flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center border-slate-100 shadow-xl rounded-2xl bg-white">
        <CardHeader className="space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 border border-rose-100 mb-2">
            <ShieldAlert className="h-6 w-6 text-rose-600" />
          </div>
          <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight">
            {t("auth.noPermission")}
          </CardTitle>
          <CardDescription className="text-sm text-slate-500 font-medium leading-relaxed">
            {t("auth.noPermissionDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants({ variant: "default" })}>
            {t("auth.backDashboard")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
