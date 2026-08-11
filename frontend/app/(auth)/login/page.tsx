"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Home, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/language-context";
import { api, getApiErrorMessage } from "@/lib/api";
import { getAuthUser, getDefaultPathByRole, isAuthenticated, saveAuth } from "@/lib/auth";
import type { ApiSuccess } from "@/types/api";
import type { LoginResponseData } from "@/types/auth";

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "ADMIN",
      password: "123456",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("expired") === "1") {
      setInfoMessage(t("login.expired"));
    }

    const currentUser = getAuthUser();

    if (isAuthenticated() && currentUser) {
      router.replace(getDefaultPathByRole(currentUser.role));
    }
  }, [router, t]);

  async function onSubmit(values: LoginFormValues) {
    try {
      setErrorMessage("");
      setInfoMessage("");

      const response = await api.post<ApiSuccess<LoginResponseData>>("/auth/login", values);
      const { token, user } = response.data.data;

      saveAuth(token, user);
      router.replace(getDefaultPathByRole(user.role));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  return (
    <div suppressHydrationWarning className="relative flex min-h-screen items-center justify-center bg-[#0b1326] p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-36 h-[500px] w-[500px] animate-pulse rounded-full bg-[radial-gradient(circle,rgba(15,118,110,0.12)_0%,transparent_70%)]" />
        <div className="absolute -bottom-24 -left-20 h-[400px] w-[400px] animate-pulse rounded-full bg-[radial-gradient(circle,rgba(15,118,110,0.08)_0%,transparent_70%)]" style={{ animationDelay: "1s" }} />
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(15,118,110,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="absolute right-4 top-4 z-10">
        <LanguageToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-lg shadow-primary/10">
            <Home className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">{t("login.title")}</h1>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("login.description")}</p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-[#0f172a] p-6 shadow-2xl backdrop-blur-sm">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {infoMessage ? (
              <Alert className="border-blue-800/50 bg-blue-950/30 text-blue-300">
                <AlertTitle className="font-bold text-blue-200">{t("login.info")}</AlertTitle>
                <AlertDescription className="text-xs text-blue-400">{infoMessage}</AlertDescription>
              </Alert>
            ) : null}

            {errorMessage ? (
              <Alert variant="destructive" className="border-rose-800/50 bg-rose-950/30">
                <AlertTitle className="font-bold">{t("login.failed")}</AlertTitle>
                <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{t("login.identifier")}</label>
              <input
                id="email"
                type="text"
                placeholder="ADMIN"
                autoComplete="username"
                disabled={isSubmitting}
                {...form.register("email")}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              {form.formState.errors.email ? <p className="text-xs font-bold text-rose-400">{t("login.identifierRequired")}</p> : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{t("login.password")}</label>
              <input
                id="password"
                type="password"
                placeholder={t("login.passwordPlaceholder")}
                autoComplete="current-password"
                disabled={isSubmitting}
                {...form.register("password")}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-semibold text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
              {form.formState.errors.password ? <p className="text-xs font-bold text-rose-400">{t("login.passwordRequired")}</p> : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </button>

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs">
              <p className="mb-1 font-bold text-slate-300">{t("login.demoTitle")}</p>
              <p className="font-semibold text-slate-500">{t("login.demoAdmin")}</p>
              <p className="font-semibold text-slate-500">{t("login.demoCashier")}</p>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600">
          {t("login.footer")}
        </p>
      </div>
    </div>
  );
}
