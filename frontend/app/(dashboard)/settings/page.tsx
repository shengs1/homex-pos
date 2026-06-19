"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { settingService, type SettingPayload } from "@/services/homex.service";

const emptyForm: SettingPayload = {
  storeName: "Homex POS",
  storeAddress: "",
  storeHotline: "",
  printPaperSize: "K80",
  bankName: "",
  bankAccountNumber: "",
  bankAccountName: "",
  vietQrTemplate: "",
  minStock: 0,
  maxDiscount: 0,
};

export default function SettingsPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState<SettingPayload>(emptyForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadSettings() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await settingService.get();
      setForm({
        storeName: data.storeName,
        storeAddress: data.storeAddress || "",
        storeHotline: data.storeHotline || "",
        printPaperSize: data.printPaperSize || "K80",
        bankName: data.bankName || "",
        bankAccountNumber: data.bankAccountNumber || "",
        bankAccountName: data.bankAccountName || "",
        vietQrTemplate: data.vietQrTemplate || "",
        minStock: data.minStock,
        maxDiscount: data.maxDiscount,
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function updateField<K extends keyof SettingPayload>(field: K, value: SettingPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await settingService.update(form);
      setSuccessMessage(t("message.saved"));
      await loadSettings();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("settings.title")} description={t("settings.description")} />
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}
        {isLoading ? <LoadingState /> : null}

        <form onSubmit={onSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.storeInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.storeName")}</Label>
                <Input value={form.storeName} onChange={(event) => updateField("storeName", event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.storeHotline")}</Label>
                <Input value={form.storeHotline || ""} onChange={(event) => updateField("storeHotline", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("settings.storeAddress")}</Label>
                <Textarea value={form.storeAddress || ""} onChange={(event) => updateField("storeAddress", event.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.printAndBank")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.printPaperSize")}</Label>
                <Select value={form.printPaperSize} onChange={(event) => updateField("printPaperSize", event.target.value)}>
                  <option value="K80">K80</option>
                  <option value="A4">A4</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.bankName")}</Label>
                <Input value={form.bankName || ""} onChange={(event) => updateField("bankName", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.bankAccountNumber")}</Label>
                <Input value={form.bankAccountNumber || ""} onChange={(event) => updateField("bankAccountNumber", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.bankAccountName")}</Label>
                <Input value={form.bankAccountName || ""} onChange={(event) => updateField("bankAccountName", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("settings.vietQrTemplate")}</Label>
                <Input value={form.vietQrTemplate || ""} onChange={(event) => updateField("vietQrTemplate", event.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.businessRules")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("settings.minStock")}</Label>
                <Input type="number" value={form.minStock} onChange={(event) => updateField("minStock", Number(event.target.value || 0))} />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.maxDiscount")}</Label>
                <Input type="number" value={form.maxDiscount} onChange={(event) => updateField("maxDiscount", Number(event.target.value || 0))} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>{t("common.saveChanges")}</Button>
          </div>
        </form>
      </div>
    </RoleGuard>
  );
}
