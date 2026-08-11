"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/language-context";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

const DialogContext = React.createContext<{ onOpenChange: (open: boolean) => void } | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error("DialogContent must be used inside Dialog");
  return context;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const { t } = useLanguage();
  if (!open) return null;

  return (
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" aria-label={t("common.close")} className="absolute inset-0 bg-black/45 backdrop-blur-sm transition-all" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    </DialogContext.Provider>
  );
}

type DialogContentProps = {
  children: React.ReactNode;
  className?: string;
};

export function DialogContent({ children, className }: DialogContentProps) {
  const { onOpenChange } = useDialogContext();
  const { t } = useLanguage();

  return (
    <div className={cn("relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border/50 bg-white p-6 shadow-2xl", className)}>
      <Button type="button" variant="ghost" size="icon" className="absolute right-3 top-3" aria-label={t("common.close")} onClick={() => onOpenChange(false)}>
        <X className="h-4 w-4" />
      </Button>
      {children}
    </div>
  );
}

export function DialogHeader({ children, className }: DialogContentProps) {
  return <div className={cn("mb-5 space-y-1 pr-10", className)}>{children}</div>;
}

export function DialogTitle({ children, className }: DialogContentProps) {
  return <h2 className={cn("text-xl font-bold tracking-tight", className)}>{children}</h2>;
}

export function DialogDescription({ children, className }: DialogContentProps) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}
