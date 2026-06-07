"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/language-context";
import { getAuthUser, getDefaultPathByRole, isAuthenticated } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    const user = getAuthUser();

    if (isAuthenticated() && user) {
      router.replace(getDefaultPathByRole(user.role));
      return;
    }

    router.replace("/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      {t("home.redirecting")}
    </div>
  );
}
