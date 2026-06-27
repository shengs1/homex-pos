"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Download, Upload, RotateCcw, Save, Store, User, CreditCard, Receipt, Package, QrCode, Shield, Settings2, Clock } from "lucide-react";
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
import { useToast } from "@/contexts/toast-context";
import { useSettings } from "@/contexts/settings-context";
import { getApiErrorMessage } from "@/lib/api";
import { settingService, type SettingPayload } from "@/services/homex.service";
import { getAuthUser } from "@/lib/auth";
import type { AuthUser } from "@/types/auth";

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
  maxEmployeesPerShift: 1,
  vatEmailEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
};

function formatDateTimeVN(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
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
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-slate-100 transition-colors">
      <span className="min-w-0 flex-1 text-sm text-slate-600 whitespace-normal">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-emerald-600 rounded" />
    </label>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }: { title: string; icon?: any; children: ReactNode; className?: string }) {
  return (
    <Card className={`rounded-xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      <CardHeader className="p-0 pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          {Icon && <Icon className="h-4 w-4 text-slate-400" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {children}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<SettingPayload>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const { toast } = useToast();
  const { settings, isLoading, refreshSettings } = useSettings();

  useEffect(() => {
    settingService.get().then(data => {
      if ((data as any)?.updatedAt) {
        setLastSavedAt((data as any).updatedAt);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  function updateField<K extends keyof SettingPayload>(field: K, value: SettingPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveSettings(payload: SettingPayload) {
    try {
      setIsSaving(true);
      const savedData = await settingService.update(payload);
      toast.success(t("settings.saveSuccess"));
      await refreshSettings();
      if ((savedData as any)?.updatedAt) {
        setLastSavedAt((savedData as any).updatedAt);
      } else {
        setLastSavedAt(new Date().toISOString());
      }
    } catch (error) {
      toast.error(t("settings.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSettings(form);
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
        toast.error(t("settings.invalidConfig"));
        return;
      }
      const nextForm = { ...emptyForm, ...parsed };
      setForm(nextForm);
      await saveSettings(nextForm);
    } catch {
      toast.error(t("settings.invalidConfig"));
    }
  }
  
  function handleReset() {
    if (window.confirm(t("common.confirmReset") || "Bạn có chắc muốn đặt lại tất cả cài đặt về mặc định?")) {
      setForm(emptyForm);
    }
  }

  if (isLoading) return <LoadingState />;

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="min-w-0 space-y-6 pb-12">
        <PageHeader title={t("settings.operationalTitle")} description={t("settings.operationalDescription")} />
        
        <div className="mb-6 flex flex-wrap items-center justify-start gap-3">
          <Button type="button" onClick={(e) => onSubmit({ preventDefault: () => {} } as FormEvent<HTMLFormElement>)} disabled={isSaving} className="h-10 bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
            {t("settings.saveSettings")}
          </Button>
          <Button type="button" onClick={handleReset} variant="outline" className="h-10 px-4 text-sm font-medium">
            {language === "vi" ? "Mặc định" : t("settings.resetDefault")}
          </Button>
          <Button type="button" onClick={() => fileInputRef.current?.click()} variant="outline" className="h-10 px-4 text-sm font-medium">
            {t("settings.importJsonFile")}
          </Button>
          <Button type="button" onClick={exportConfig} variant="outline" className="h-10 px-4 text-sm font-medium">
            {t("settings.exportJsonFile")}
          </Button>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importConfig} />
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* ROW 1: STORE INFO & ACCOUNT */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <SectionCard title={t("settings.storeInfo")} icon={Store}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t("settings.storeName")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.storeName} onChange={(event) => updateField("storeName", event.target.value)} required />
                </Field>
                <Field label={t("settings.branch")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.storeBranch || ""} onChange={(event) => updateField("storeBranch", event.target.value)} />
                </Field>
                <Field label={t("settings.taxCode")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.taxCode || ""} onChange={(event) => updateField("taxCode", event.target.value)} />
                </Field>
                <Field label={t("settings.operatingHours") || "Giờ hoạt động"}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.businessHours || ""} onChange={(event) => updateField("businessHours", event.target.value)} />
                </Field>
                <Field label={t("settings.hotline") || "Hotline"}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.storeHotline || ""} onChange={(event) => updateField("storeHotline", event.target.value)} />
                </Field>
                <Field label={t("settings.currencyFormat")}>
                  <Select value={form.currency} disabled onChange={(event) => updateField("currency", event.target.value)}>
                    <option value="VND">VND</option>
                  </Select>
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">{t("settings.currencyVndOnly")}</p>
                </Field>
                <div className="md:col-span-2">
                  <Field label={t("settings.storeAddress")}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.storeAddress || ""} onChange={(event) => updateField("storeAddress", event.target.value)} />
                  </Field>
                </div>
              </div>
            </SectionCard>

            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
                <User className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                  {t("settings.account")}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("settings.fullName")}</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {user?.fullName || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("settings.emailOrLogin")}</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {user?.email || (user?.employeeCode !== 'ADMIN' ? user?.employeeCode : null) || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("settings.role")}</p>
                  <span className="mt-1 inline-flex rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {user?.role === "ADMIN" ? t("settings.admin") : t("settings.cashier")}
                  </span>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("settings.sessionTimeout")}</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {user?.role === "ADMIN" ? t("settings.adminAutoLockNotApplied") : `${form.autoLockMinutes || 30} phút`}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-500">{t("settings.lastUpdated")}</p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {formatDateTimeVN(lastSavedAt || (form as any).updatedAt || (form as any).lastUpdatedAt || (form as any).updated_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 2: POS, INVOICE, INVENTORY */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard title={t("settings.pos")} icon={Settings2}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t("settings.defaultPayment")}>
                  <Select value={form.defaultPaymentMethod} onChange={(event) => updateField("defaultPaymentMethod", event.target.value)}>
                    <option value="CASH">{t("paymentMethod.CASH")}</option>
                    <option value="TRANSFER">{t("paymentMethod.TRANSFER")}</option>
                  </Select>
                </Field>
                <Field label={t("settings.productsPerPage") || "Số SP mỗi trang POS"}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="1" value={form.productsPerPage} onChange={(event) => updateField("productsPerPage", Number(event.target.value || 24))} />
                </Field>
                <Field label={t("settings.maxDiscountPercent")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="0" value={form.maxDiscount} onChange={(event) => updateField("maxDiscount", Number(event.target.value || 0))} />
                </Field>
                <Field label={t("settings.cashierAutoLock")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="1" value={form.autoLockMinutes} onChange={(event) => updateField("autoLockMinutes", Number(event.target.value || 30))} />
                </Field>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <ToggleField label={t("settings.allowDiscount")} checked={form.allowOrderDiscount} onChange={(value) => updateField("allowOrderDiscount", value)} />
                <ToggleField label={t("settings.autoAddBarcode")} checked={form.barcodeAutoAdd} onChange={(value) => updateField("barcodeAutoAdd", value)} />
                <ToggleField label={t("settings.confirmBeforeCheckout")} checked={form.confirmBeforeCheckout} onChange={(value) => updateField("confirmBeforeCheckout", value)} />
                <ToggleField label={t("settings.compactPOS")} checked={form.compactPosMode} onChange={(value) => updateField("compactPosMode", value)} />
              </div>
            </SectionCard>

            <SectionCard title={t("settings.invoicePrint")} icon={Receipt}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t("settings.paperSize")}>
                    <Select value={form.printPaperSize} onChange={(event) => updateField("printPaperSize", event.target.value)}>
                      <option value="K80">K80</option>
                      <option value="A4">A4</option>
                    </Select>
                  </Field>
                  <Field label={t("settings.tableCount") || "Số bản in"}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="1" value={form.printCopies} onChange={(event) => updateField("printCopies", Number(event.target.value || 1))} />
                  </Field>
                </div>
                <Field label={t("settings.invoiceThanks")}>
                  <Textarea className="min-h-[80px] w-full resize-y border-slate-200 text-sm text-slate-800" value="Cảm ơn quý khách!" readOnly />
                </Field>
                <div className="grid grid-cols-1 gap-3">
                  <ToggleField label={t("settings.autoPrintAfterCheckout")} checked={form.autoOpenPrint} onChange={(value) => updateField("autoOpenPrint", value)} />
                  <ToggleField label={t("settings.requireCustomerPhone")} checked={form.requireCustomerPhone} onChange={(value) => updateField("requireCustomerPhone", value)} />
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t("settings.inventory")} icon={Package}>
              <div className="space-y-4">
                <Field label={t("settings.defaultLowStockThreshold")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="0" value={form.minStock} onChange={(event) => updateField("minStock", Number(event.target.value || 0))} />
                </Field>
                <div className="grid grid-cols-1 gap-3">
                  <ToggleField label={t("settings.alertLowStock")} checked={form.warnLowStockSale} onChange={(value) => updateField("warnLowStockSale", value)} />
                  <ToggleField label={t("settings.allowOversell")} checked={form.allowOversell} onChange={(value) => updateField("allowOversell", value)} />
                </div>
              </div>
            </SectionCard>
          </div>

          {/* ROW 3: VIETQR & PERMISSIONS */}
          <div className="grid grid-cols-1 gap-6 items-start xl:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-6">
              <SectionCard title={t("settings.vietqrTransfer")} icon={QrCode}>
                <div className="space-y-4">
                  <Field label={t("settings.beneficiaryBank")}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.bankName || ""} onChange={(event) => updateField("bankName", event.target.value)} placeholder="MB, VCB, ACB..." />
                  </Field>
                  <Field label={t("settings.beneficiaryAccount")}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.bankAccountNumber || ""} onChange={(event) => updateField("bankAccountNumber", event.target.value)} />
                  </Field>
                  <Field label={t("settings.beneficiaryName")}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.bankAccountName || ""} onChange={(event) => updateField("bankAccountName", event.target.value)} />
                  </Field>
                  <Field label={t("settings.vietQrTemplate") || "Template VietQR"}>
                    <Select value={["compact2", "compact", "qr_only", "print"].includes(form.vietQrTemplate || "") ? (form.vietQrTemplate as string) : "compact2"} onChange={(event) => updateField("vietQrTemplate", event.target.value)}>
                      <option value="compact2">compact2</option>
                      <option value="compact">compact</option>
                      <option value="qr_only">qr_only</option>
                      <option value="print">print</option>
                    </Select>
                    <p className="text-[10px] text-slate-500 mt-1">{t("settings.vietQrTemplateHelpCompact") || t("settings.vietQrTemplateHelp")}</p>
                  </Field>
                  <Field label={t("settings.transferContentDefault") || "Template nội dung CK"}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.transferContentTemplate || "HOMEX {orderCodeLast6}"} onChange={(event) => updateField("transferContentTemplate", event.target.value)} placeholder={t("settings.transferContentPlaceholder") || "HOMEX {orderCodeLast6}"} />
                    <p className="text-[10px] text-slate-500 mt-1">{t("settings.transferContentHelp")}</p>
                  </Field>
                </div>
              </SectionCard>

              {/* SHIFT CONFIG */}
              <SectionCard title="Cài đặt ca làm việc" icon={Clock}>
                <div className="space-y-4">
                  <Field label="Số nhân viên tối đa trong 1 ca" hint="Hệ thống sẽ chặn mở thêm ca khi khung giờ Sáng/Chiều đã đạt giới hạn này.">
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="1" max="20" value={form.maxEmployeesPerShift} onChange={(event) => updateField("maxEmployeesPerShift", Number(event.target.value || 1))} />
                  </Field>
                </div>
              </SectionCard>

              {/* EMAIL CONFIG */}
              <SectionCard title="Cấu hình gửi email VAT" icon={Receipt}>
                <div className="space-y-4">
                  <ToggleField
                    label="Kích hoạt tự động gửi email VAT"
                    checked={form.vatEmailEnabled}
                    onChange={(value) => updateField("vatEmailEnabled", value)}
                  />
                  {form.vatEmailEnabled && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <Field label="SMTP Host">
                            <Input
                              className="h-10 border-slate-200 text-sm text-slate-800"
                              value={form.smtpHost || ""}
                              onChange={(event) => updateField("smtpHost", event.target.value)}
                              placeholder="smtp.gmail.com"
                            />
                          </Field>
                        </div>
                        <div>
                          <Field label="SMTP Port">
                            <Input
                              type="number"
                              className="h-10 border-slate-200 text-sm text-slate-800"
                              value={form.smtpPort || 587}
                              onChange={(event) => updateField("smtpPort", Number(event.target.value || 587))}
                              placeholder="587"
                            />
                          </Field>
                        </div>
                      </div>
                      <Field label="Tài khoản SMTP">
                        <Input
                          className="h-10 border-slate-200 text-sm text-slate-800"
                          value={form.smtpUser || ""}
                          onChange={(event) => updateField("smtpUser", event.target.value)}
                          placeholder="user@example.com"
                        />
                      </Field>
                      <Field label="Mật khẩu SMTP">
                        <Input
                          type="password"
                          className="h-10 border-slate-200 text-sm text-slate-800"
                          value={form.smtpPassword || ""}
                          onChange={(event) => updateField("smtpPassword", event.target.value)}
                          placeholder="••••••••"
                        />
                      </Field>
                    </>
                  )}
                </div>
              </SectionCard>

              {/* CONFIG DATA - Placed below VietQR */}
              <SectionCard title={t("settings.configData")}>
                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <Button type="button" variant="outline" className="h-10 w-full rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={exportConfig}>
                      <Download className="mr-2 h-4 w-4" />
                      {t("settings.exportJsonFile")}
                    </Button>
                    <Button type="button" variant="outline" className="h-10 w-full rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />
                      {t("settings.importJsonFile")}
                    </Button>
                  </div>
                  <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    {t("settings.configNote")}
                  </p>
                </div>
              </SectionCard>
            </div>

            <SectionCard title={t("settings.permissionMatrix")} icon={Shield}>
              <div className="w-full overflow-x-auto">
                <table className="w-full table-fixed text-left text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="w-1/2 p-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("settings.feature")}</th>
                      <th className="w-1/4 p-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("settings.admin")}</th>
                      <th className="w-1/4 p-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("settings.cashier")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      t("nav.dashboard") || "Tổng quan",
                      t("nav.pos") || "Bán hàng POS",
                      t("nav.vatInvoices") || "Hóa đơn",
                      t("nav.customers") || "Khách hàng",
                      t("nav.warranties") || "Bảo hành",
                      t("nav.promotions") || "Khuyến mãi",
                      t("nav.inventory") || "Kho hàng",
                      t("nav.products") || "Sản phẩm",
                      t("nav.categories") || "Danh mục",
                      t("nav.suppliers") || "Nhà cung cấp",
                      t("nav.shifts") || "Ca làm",
                      t("nav.users") || "Nhân viên",
                      t("nav.reports") || "Báo cáo",
                      t("nav.settings") || "Cài đặt",
                      t("nav.auditLogs") || "Lịch sử hệ thống",
                    ].map((feature, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-medium text-slate-800">{feature}</td>
                        <td className="p-3 font-medium text-emerald-600">{t("settings.yes")}</td>
                        <td className="p-3">
                          {["Bán hàng POS", "Hóa đơn", "Khách hàng", "Bảo hành", "Ca làm", "Sản phẩm", "Tổng quan"].includes(feature) ? (
                            <span className="font-medium text-emerald-600">{t("settings.yes")}</span>
                          ) : (
                            <span className="font-medium text-slate-300">{t("settings.no")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </form>
      </div>
    </RoleGuard>
  );
}
