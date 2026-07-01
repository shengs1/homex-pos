"use client";

import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function useConfirmDialog() {
  const { t } = useLanguage();
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const ConfirmDialog = useMemo(() => (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) close(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.title || t("common.confirm")}</DialogTitle>
          <DialogDescription>{state?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {state?.cancelLabel || t("common.cancel")}
          </Button>
          <Button type="button" variant={state?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {state?.confirmLabel || t("common.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ), [close, state, t]);

  return { confirm, ConfirmDialog };
}