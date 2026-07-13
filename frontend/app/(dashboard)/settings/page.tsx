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
import { confirmAction } from "@/lib/confirm-action";
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
  enablePayOSPayment: false,
  defaultPaymentMethod: "CASH",
  productsPerPage: 24,
  autoLockMinutes: 30,
  allowOrderDiscount: true,
  confirmBeforeCheckout: true,
  barcodeAutoAdd: true,
  enableBarcodeScanner: true,
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
  
  async function handleReset() {
    if (await confirmAction({ description: t("common.confirmReset"), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true })) {
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
            {t("settings.resetDefault")}
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
                <Field label={t("settings.operatingHours")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.businessHours || ""} onChange={(event) => updateField("businessHours", event.target.value)} />
                </Field>
                <Field label={t("settings.hotline")}>
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
                    {user?.role === "ADMIN" ? t("settings.adminAutoLockNotApplied") : t("settings.minutes", { count: form.autoLockMinutes || 30 })}
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
                <Field label={t("settings.productsPerPage")}>
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
                <ToggleField label={t("settings.enableBarcodeScanner")} checked={form.enableBarcodeScanner} onChange={(value) => updateField("enableBarcodeScanner", value)} />
                <ToggleField label={t("settings.confirmBeforeCheckout")} checked={form.confirmBeforeCheckout} onChange={(value) => updateField("confirmBeforeCheckout", value)} />
                <ToggleField label={t("settings.compactPOS")} checked={form.compactPosMode} onChange={(value) => updateField("compactPosMode", value)} />
                <ToggleField label="Bật thanh toán payOS" checked={form.enablePayOSPayment} onChange={(value) => updateField("enablePayOSPayment", value)} />
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
                  <Field label={t("settings.tableCount")}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="1" value={form.printCopies} onChange={(event) => updateField("printCopies", Number(event.target.value || 1))} />
                  </Field>
                </div>
                <Field label={t("settings.invoiceThanks")}>
                  <Textarea className="min-h-[80px] w-full resize-y border-slate-200 text-sm text-slate-800" value={t("settings.invoiceThanksDefault")} readOnly />
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
          <div className="grid grid-cols-1 gap-6 items-start xl:grid-cols-3">
            {/* Column 1: VIETQR */}
            <SectionCard title={t("settings.vietqrTransfer")} icon={QrCode}>
              <div className="space-y-4">
                <Field label={t("settings.beneficiaryBank")}>
                  <Select
                    value={form.bankName || ""}
                    onChange={(event) => updateField("bankName", event.target.value)}
                  >
                    <option value="">-- Chọn ngân hàng --</option>
                    <option value="VCB">Vietcombank - Ngân hàng TMCP Ngoại Thương Việt Nam (VCB)</option>
                    <option value="CTG">VietinBank - Ngân hàng TMCP Công thương Việt Nam (CTG)</option>
                    <option value="BIDV">BIDV - Ngân hàng TMCP Đầu tư và Phát triển Việt Nam</option>
                    <option value="VBA">Agribank - Ngân hàng Nông nghiệp và Phát triển Nông thôn (VBA)</option>
                    <option value="TCB">Techcombank - Ngân hàng TMCP Kỹ thương Việt Nam (TCB)</option>
                    <option value="MB">MB Bank - Ngân hàng TMCP Quân đội</option>
                    <option value="ACB">ACB - Ngân hàng TMCP Á Châu</option>
                    <option value="STB">Sacombank - Ngân hàng TMCP Sài Gòn Thương Tín</option>
                    <option value="VPB">VPBank - Ngân hàng TMCP Việt Nam Thịnh Vượng</option>
                    <option value="HDB">HDBank - Ngân hàng TMCP Phát triển TP. Hồ Chí Minh</option>
                    <option value="TPB">TPBank - Ngân hàng TMCP Tiên Phong</option>
                    <option value="VIB">VIB - Ngân hàng TMCP Quốc tế Việt Nam</option>
                    <option value="MSB">MSB - Ngân hàng TMCP Hàng Hải</option>
                    <option value="SHB">SHB - Ngân hàng TMCP Sài Gòn - Hà Nội</option>
                    <option value="OCB">OCB - Ngân hàng TMCP Phương Đông</option>
                    <option value="EIB">Eximbank - Ngân hàng TMCP Xuất Nhập khẩu Việt Nam</option>
                    <option value="SEAB">SeABank - Ngân hàng TMCP Đông Nam Á</option>
                    <option value="BAB">Bac A Bank - Ngân hàng TMCP Bắc Á</option>
                    <option value="PVC">PVcomBank - Ngân hàng TMCP Đại Chúng Việt Nam</option>
                    <option value="ABB">ABBANK - Ngân hàng TMCP An Bình</option>
                    <option value="DAB">DongA Bank - Ngân hàng TMCP Đông Á</option>
                    <option value="BVB">BVBank - Ngân hàng TMCP Bản Việt</option>
                    <option value="KLB">Kienlongbank - Ngân hàng TMCP Kiên Long</option>
                    <option value="LPB">LPBank - Ngân hàng TMCP Bưu điện Liên Việt</option>
                    <option value="NAB">Nam A Bank - Ngân hàng TMCP Nam Á</option>
                    <option value="SGB">Saigonbank - Ngân hàng TMCP Sài Gòn Công Thương</option>
                    <option value="VAB">Vietbank - Ngân hàng TMCP Việt Nam Thương Tín</option>
                    <option value="NCB">NCB - Ngân hàng TMCP Quốc Dân</option>
                    <option value="CBB">CB - Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam</option>
                    <option value="OCEAN">OceanBank - Ngân hàng Thương mại TNHH MTV Đại Dương</option>
                    <option value="GPB">GPBank - Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu</option>
                    <option value="SHBVN">Shinhan Bank - Ngân hàng Shinhan Việt Nam</option>
                    <option value="HSBC">HSBC - Ngân hàng TNHH một thành viên HSBC Việt Nam</option>
                    <option value="SCB">Standard Chartered - Ngân hàng TNHH MTV Standard Chartered Việt Nam</option>
                    <option value="PBVN">Public Bank - Ngân hàng TNHH MTV Public Bank Việt Nam</option>
                    <option value="UOB">UOB - Ngân hàng TNHH MTV United Overseas Bank Việt Nam</option>
                    <option value="WOORI">Woori Bank - Ngân hàng TNHH MTV Woori Việt Nam</option>
                    <option value="CIMB">CIMB - Ngân hàng TNHH MTV CIMB Việt Nam</option>
                    <option value="CAKE">Cake by VPBank - Ngân hàng số Cake</option>
                    <option value="TIMO">Timo - Ngân hàng số Timo</option>
                  </Select>
                </Field>
                <Field label={t("settings.beneficiaryAccount")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.bankAccountNumber || ""} onChange={(event) => updateField("bankAccountNumber", event.target.value)} />
                </Field>
                <Field label={t("settings.beneficiaryName")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.bankAccountName || ""} onChange={(event) => updateField("bankAccountName", event.target.value)} />
                </Field>
                <Field label={t("settings.vietQrTemplate")}>
                  <Select value={["compact2", "compact", "qr_only", "print"].includes(form.vietQrTemplate || "") ? (form.vietQrTemplate as string) : "compact2"} onChange={(event) => updateField("vietQrTemplate", event.target.value)}>
                    <option value="compact2">compact2</option>
                    <option value="compact">compact</option>
                    <option value="qr_only">qr_only</option>
                    <option value="print">print</option>
                  </Select>
                  <p className="text-[10px] text-slate-500 mt-1">{t("settings.vietQrTemplateHelpCompact") || t("settings.vietQrTemplateHelp")}</p>
                </Field>
                <Field label={t("settings.transferContentDefault")}>
                  <Input className="h-10 border-slate-200 text-sm text-slate-800" value={form.transferContentTemplate || "HOMEX {orderCodeLast6}"} onChange={(event) => updateField("transferContentTemplate", event.target.value)} placeholder={t("settings.transferContentPlaceholder")} />
                  <p className="text-[10px] text-slate-500 mt-1">{t("settings.transferContentHelp")}</p>
                </Field>
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-800">
                  <p className="font-bold">Cấu hình payOS đặt ở backend env, không nhập secret tại frontend.</p>
                  <div className="mt-2 grid gap-1 font-mono text-[11px]">
                    <span>PAYOS_CLIENT_ID</span>
                    <span>PAYOS_API_KEY</span>
                    <span>PAYOS_CHECKSUM_KEY</span>
                    <span>PAYOS_WEBHOOK_URL</span>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Column 2: SHIFT CONFIG, VAT EMAIL, CONFIG DATA */}
            <div className="flex flex-col gap-6">
              {/* SHIFT CONFIG */}
              <SectionCard title={t("settings.shiftConfig")} icon={Clock}>
                <div className="space-y-4">
                  <Field label={t("settings.maxEmployeesPerShift")} hint={t("settings.maxEmployeesPerShiftHint")}>
                    <Input className="h-10 border-slate-200 text-sm text-slate-800" type="number" min="1" max="20" value={form.maxEmployeesPerShift} onChange={(event) => updateField("maxEmployeesPerShift", Number(event.target.value || 1))} />
                  </Field>
                </div>
              </SectionCard>

              {/* EMAIL CONFIG */}
              <SectionCard title={t("settings.vatEmailConfig")} icon={Receipt}>
                <div className="space-y-4">
                  <ToggleField
                    label={t("settings.vatEmailEnabled")}
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
                      <Field label={t("settings.smtpUser")}>
                        <Input
                          className="h-10 border-slate-200 text-sm text-slate-800"
                          value={form.smtpUser || ""}
                          onChange={(event) => updateField("smtpUser", event.target.value)}
                          placeholder="user@example.com"
                        />
                      </Field>
                      <Field label={t("settings.smtpPassword")}>
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

              {/* CONFIG DATA */}
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

            {/* Column 3: PERMISSION MATRIX */}
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
                      { key: "nav.dashboard", cashier: true },
                      { key: "nav.pos", cashier: true },
                      { key: "nav.vatInvoices", cashier: true },
                      { key: "nav.customers", cashier: true },
                      { key: "nav.warranties", cashier: true },
                      { key: "nav.promotions", cashier: false },
                      { key: "nav.inventory", cashier: false },
                      { key: "nav.products", cashier: true },
                      { key: "nav.categories", cashier: false },
                      { key: "nav.suppliers", cashier: false },
                      { key: "nav.shifts", cashier: true },
                      { key: "nav.users", cashier: false },
                      { key: "nav.reports", cashier: false },
                      { key: "nav.settings", cashier: false },
                      { key: "nav.auditLogs", cashier: false },
                    ].map((feature, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-medium text-slate-800">{t(feature.key)}</td>
                        <td className="p-3 font-medium text-emerald-600">{t("settings.yes")}</td>
                        <td className="p-3">
                          {feature.cashier ? (
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




