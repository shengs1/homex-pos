"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Download, Upload } from "lucide-react";
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
  storeBranch: "",
  taxCode: "",
  businessHours: "",
  currency: "VND",
  storeAddress: "",
  storeHotline: "",
  printPaperSize: "K80",
  printCopies: 1,
  autoOpenPrint: false,
  requireCustomerPhone: false,
  bankName: "",
  bankAccountNumber: "",
  bankAccountName: "",
  vietQrTemplate: "",
  transferContentTemplate: "",
  defaultPaymentMethod: "CASH",
  productsPerPage: 24,
  autoLockMinutes: 30,
  allowOrderDiscount: true,
  confirmBeforeCheckout: true,
  barcodeAutoAdd: true,
  compactPosMode: false,
  minStock: 0,
  warnLowStockSale: true,
  allowOversell: false,
  maxDiscount: 0,
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>;
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
      <span className="min-w-0 truncate">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  );
}

export default function SettingsPage() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
        storeBranch: data.storeBranch || "",
        taxCode: data.taxCode || "",
        businessHours: data.businessHours || "",
        currency: data.currency || "VND",
        storeAddress: data.storeAddress || "",
        storeHotline: data.storeHotline || "",
        printPaperSize: data.printPaperSize || "K80",
        printCopies: data.printCopies || 1,
        autoOpenPrint: Boolean(data.autoOpenPrint),
        requireCustomerPhone: Boolean(data.requireCustomerPhone),
        bankName: data.bankName || "",
        bankAccountNumber: data.bankAccountNumber || "",
        bankAccountName: data.bankAccountName || "",
        vietQrTemplate: data.vietQrTemplate || "",
        transferContentTemplate: data.transferContentTemplate || "",
        defaultPaymentMethod: data.defaultPaymentMethod || "CASH",
        productsPerPage: data.productsPerPage || 24,
        autoLockMinutes: data.autoLockMinutes || 30,
        allowOrderDiscount: Boolean(data.allowOrderDiscount),
        confirmBeforeCheckout: Boolean(data.confirmBeforeCheckout),
        barcodeAutoAdd: Boolean(data.barcodeAutoAdd),
        compactPosMode: Boolean(data.compactPosMode),
        minStock: data.minStock,
        warnLowStockSale: Boolean(data.warnLowStockSale),
        allowOversell: Boolean(data.allowOversell),
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

  async function saveSettings(payload: SettingPayload) {
    try {
      setIsSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await settingService.update(payload);
      setSuccessMessage(t("message.saved"));
      await loadSettings();
    } finally {
      setIsSaving(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await saveSettings(form);
    } catch (error) {
      setIsSaving(false);
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "homex-pos-settings.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importConfig(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as SettingPayload;
      if (!parsed.storeName) {
        setErrorMessage(t("settings.invalidConfig"));
        return;
      }
      const nextForm = { ...emptyForm, ...parsed };
      setForm(nextForm);
      await saveSettings(nextForm);
    } catch {
      setErrorMessage(t("settings.invalidConfig"));
    }
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="min-w-0 space-y-6">
        <PageHeader title={t("settings.title")} description={t("settings.description")}>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportConfig}><Download className="h-4 w-4" />{t("settings.exportConfig")}</Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" />{t("settings.importConfig")}</Button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importConfig} />
          </div>
        </PageHeader>
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{successMessage}</div> : null}
        {isLoading ? <LoadingState /> : null}

        <form onSubmit={onSubmit} className="space-y-6">
          <Card className="rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("settings.storeInfo")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label={t("settings.storeName")}><Input value={form.storeName} onChange={(event) => updateField("storeName", event.target.value)} required /></Field>
              <Field label={t("settings.storeBranch")}><Input value={form.storeBranch || ""} onChange={(event) => updateField("storeBranch", event.target.value)} /></Field>
              <Field label={t("settings.taxCode")}><Input value={form.taxCode || ""} onChange={(event) => updateField("taxCode", event.target.value)} /></Field>
              <Field label={t("settings.businessHours")}><Input value={form.businessHours || ""} onChange={(event) => updateField("businessHours", event.target.value)} /></Field>
              <Field label={t("settings.storeHotline")}><Input value={form.storeHotline || ""} onChange={(event) => updateField("storeHotline", event.target.value)} /></Field>
              <Field label={t("settings.currency")}><Input value={form.currency} onChange={(event) => updateField("currency", event.target.value)} /></Field>
              <div className="space-y-2 md:col-span-2"><Label>{t("settings.storeAddress")}</Label><Textarea value={form.storeAddress || ""} onChange={(event) => updateField("storeAddress", event.target.value)} /></div>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardHeader><CardTitle>{t("settings.posSection")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Field label={t("settings.defaultPaymentMethod")}><Select value={form.defaultPaymentMethod} onChange={(event) => updateField("defaultPaymentMethod", event.target.value)}><option value="CASH">{t("paymentMethod.CASH")}</option><option value="TRANSFER">{t("paymentMethod.TRANSFER")}</option></Select></Field>
                <Field label={t("settings.productsPerPage")}><Input type="number" value={form.productsPerPage} onChange={(event) => updateField("productsPerPage", Number(event.target.value || 24))} /></Field>
                <Field label={t("settings.autoLockMinutes")}><Input type="number" value={form.autoLockMinutes} onChange={(event) => updateField("autoLockMinutes", Number(event.target.value || 30))} /></Field>
                <Field label={t("settings.maxDiscount")}><Input type="number" value={form.maxDiscount} onChange={(event) => updateField("maxDiscount", Number(event.target.value || 0))} /></Field>
                <ToggleField label={t("settings.allowOrderDiscount")} checked={form.allowOrderDiscount} onChange={(value) => updateField("allowOrderDiscount", value)} />
                <ToggleField label={t("settings.confirmBeforeCheckout")} checked={form.confirmBeforeCheckout} onChange={(value) => updateField("confirmBeforeCheckout", value)} />
                <ToggleField label={t("settings.barcodeAutoAdd")} checked={form.barcodeAutoAdd} onChange={(value) => updateField("barcodeAutoAdd", value)} />
                <ToggleField label={t("settings.compactPosMode")} checked={form.compactPosMode} onChange={(value) => updateField("compactPosMode", value)} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardHeader><CardTitle>{t("settings.printSection")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Field label={t("settings.printPaperSize")}><Select value={form.printPaperSize} onChange={(event) => updateField("printPaperSize", event.target.value)}><option value="K80">K80</option><option value="A4">A4</option></Select></Field>
                <Field label={t("settings.printCopies")}><Input type="number" value={form.printCopies} onChange={(event) => updateField("printCopies", Number(event.target.value || 1))} /></Field>
                <ToggleField label={t("settings.autoOpenPrint")} checked={form.autoOpenPrint} onChange={(value) => updateField("autoOpenPrint", value)} />
                <ToggleField label={t("settings.requireCustomerPhone")} checked={form.requireCustomerPhone} onChange={(value) => updateField("requireCustomerPhone", value)} />
              </CardContent>
            </Card>
          </div>

          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardHeader><CardTitle>{t("settings.inventorySection")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Field label={t("settings.minStock")}><Input type="number" value={form.minStock} onChange={(event) => updateField("minStock", Number(event.target.value || 0))} /></Field>
                <ToggleField label={t("settings.warnLowStockSale")} checked={form.warnLowStockSale} onChange={(value) => updateField("warnLowStockSale", value)} />
                <ToggleField label={t("settings.allowOversell")} checked={form.allowOversell} onChange={(value) => updateField("allowOversell", value)} />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardHeader><CardTitle>{t("settings.vietQrSection")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Field label={t("settings.bankName")}><Input value={form.bankName || ""} onChange={(event) => updateField("bankName", event.target.value)} /></Field>
                <Field label={t("settings.bankAccountNumber")}><Input value={form.bankAccountNumber || ""} onChange={(event) => updateField("bankAccountNumber", event.target.value)} /></Field>
                <Field label={t("settings.bankAccountName")}><Input value={form.bankAccountName || ""} onChange={(event) => updateField("bankAccountName", event.target.value)} /></Field>
                <Field label={t("settings.transferContentTemplate")}><Input value={form.transferContentTemplate || ""} onChange={(event) => updateField("transferContentTemplate", event.target.value)} /></Field>
                <Field label={t("settings.vietQrTemplate")}><Input value={form.vietQrTemplate || ""} onChange={(event) => updateField("vietQrTemplate", event.target.value)} /></Field>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader><CardTitle>{t("settings.permissionSection")}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                <p className="mb-2 font-black">{t("role.ADMIN")}</p>
                <p>{t("settings.adminPermissionSummary")}</p>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                <p className="mb-2 font-black">{t("role.CASHIER")}</p>
                <p>{t("settings.cashierPermissionSummary")}</p>
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-0 flex justify-end border-t bg-background/95 py-4 backdrop-blur">
            <Button type="submit" disabled={isSaving}>{t("common.saveChanges")}</Button>
          </div>
        </form>
      </div>
    </RoleGuard>
  );
}

