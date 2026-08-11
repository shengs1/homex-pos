"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastObj = useMemo(() => ({
    success: (message: string) => addToast("success", message),
    error: (message: string) => addToast("error", message),
    info: (message: string) => addToast("info", message),
    warning: (message: string) => addToast("warning", message),
  }), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: toastObj }}>
      {children}
      {isMounted ? (
        <div suppressHydrationWarning className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
          {toasts.map((t) => (
            <div
              key={t.id}
              suppressHydrationWarning
              className={`flex items-start gap-3 rounded-xl border p-4 pr-10 shadow-lg backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-300 relative
                ${t.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : ""}
                ${t.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : ""}
                ${t.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" : ""}
                ${t.type === "info" ? "bg-blue-50 border-blue-200 text-blue-800" : ""}
              `}
            >
              {t.type === "success" && <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />}
              {t.type === "error" && <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600" />}
              {t.type === "warning" && <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />}
              {t.type === "info" && <Info className="h-5 w-5 shrink-0 mt-0.5 text-blue-600" />}
              
              <p className="text-sm font-semibold">{t.message}</p>
              
              <button
                onClick={() => removeToast(t.id)}
                className="absolute right-2 top-2 rounded-lg p-1 opacity-50 hover:opacity-100 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
