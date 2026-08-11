"use client";

import { LanguageToggle } from "@/components/shared/language-toggle";
import { useLanguage } from "@/contexts/language-context";

export default function PayOSCancelPage() {
  const { t } = useLanguage();

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="absolute right-4 top-4"><LanguageToggle /></div>
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{t("payos.cancelTitle")}</h1>
        <p className="mt-3 text-sm text-slate-600">{t("payos.cancelDescription")}</p>
      </div>
    </main>
  );
}