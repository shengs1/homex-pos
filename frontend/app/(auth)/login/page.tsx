"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/language-context";
import { api, getApiErrorMessage } from "@/lib/api";
import { getAuthUser, getDefaultPathByRole, isAuthenticated, saveAuth } from "@/lib/auth";
import type { ApiSuccess } from "@/types/api";
import type { LoginResponseData } from "@/types/auth";

const loginSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
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
      email: "admin@homex.com",
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
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-blue-50 p-4">
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {infoMessage ? (
              <Alert>
                <AlertTitle>{t("login.info")}</AlertTitle>
                <AlertDescription>{infoMessage}</AlertDescription>
              </Alert>
            ) : null}

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTitle>{t("login.failed")}</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input id="email" type="email" placeholder="admin@homex.com" autoComplete="email" disabled={isSubmitting} {...form.register("email")} />
              {form.formState.errors.email ? <p className="text-sm text-destructive">{form.formState.errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input id="password" type="password" placeholder={t("login.passwordPlaceholder")} autoComplete="current-password" disabled={isSubmitting} {...form.register("password")} />
              {form.formState.errors.password ? <p className="text-sm text-destructive">{form.formState.errors.password.message}</p> : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </Button>

            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{t("login.demoTitle")}</p>
              <p>ADMIN: admin@homex.com / 123456</p>
              <p>CASHIER: cashier@homex.com / 123456</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
