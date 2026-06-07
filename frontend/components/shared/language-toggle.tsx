"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();
  const nextLanguage = language === "vi" ? "EN" : "VI";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      title={language === "vi" ? t("language.switchToEnglish") : t("language.switchToVietnamese")}
    >
      <Languages className="h-4 w-4" />
      {nextLanguage}
    </Button>
  );
}
