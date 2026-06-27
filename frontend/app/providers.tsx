"use client";

import { LanguageProvider } from "@/contexts/language-context";
import { ToastProvider } from "@/contexts/toast-context";
import { SettingsProvider } from "@/contexts/settings-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <SettingsProvider>{children}</SettingsProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
