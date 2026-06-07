"use client";

import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/language-context";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center justify-center rounded-lg border bg-card p-8 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label || t("message.loading")}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useLanguage();

  if (!message) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>{t("message.errorTitle")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useLanguage();

  return (
    <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
      {message || t("message.empty")}
    </div>
  );
}
