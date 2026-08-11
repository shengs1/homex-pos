"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit, Plus, Trash2, Tag, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useToast } from "@/contexts/toast-context";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  promotionService,
  type Promotion,
  type PromotionDiscountType,
  type PromotionPayload,
} from "@/services/promotion.service";
import type { Pagination } from "@/types/api";

const PAGE_SIZE = 10;

type PromotionFormState = {
  code: string;
  name: string;
  discountType: PromotionDiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minOrderAmount: string;
  usageLimit: string;
  customerLimit: string;
  eligibleTiers: string;
  startDate: string;
  expiredAt: string;
  status: "ACTIVE" | "INACTIVE";
};

const initialForm: PromotionFormState = {
  code: "",
  name: "",
  discountType: "AMOUNT",
  discountValue: "",
  maxDiscountAmount: "",
  minOrderAmount: "",
  usageLimit: "",
  customerLimit: "",
  eligibleTiers: "ALL",
  startDate: new Date().toISOString().slice(0, 10),
  expiredAt: "",
  status: "ACTIVE",
};

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getDigits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function toNumber(value: string) {
  const digits = getDigits(value);
  if (!digits) return 0;
  const numberValue = Number(digits);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function formatThousands(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

function formatMoneyInput(value: string) {
  const numberValue = toNumber(value);
  if (numberValue <= 0) return "";
  return formatThousands(numberValue);
}

function formatPercentInput(value: string) {
  const numberValue = Math.min(toNumber(value), 100);
  if (numberValue <= 0) return "";
  return `${numberValue}%`;
}

function formatAmountByType(value: number, discountType: PromotionDiscountType) {
  if (discountType === "PERCENT") return `${Math.min(value, 100)}%`;
  return value > 0 ? formatThousands(value) : "";
}

function FormatVnd({ value }: { value: number }) {
  if (!value) return <span>-</span>;
  return (
    <span className="whitespace-nowrap font-semibold text-slate-950">
      {formatThousands(value)}
      <span className="ml-1 text-xs font-medium text-slate-400">VND</span>
    </span>
  );
}

function formatDate(dateString?: string) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB").format(d);
}

function getPromotionStatus(promotion: Promotion) {
  if (promotion.status !== "ACTIVE") return promotion.status;

  const expiredTime = new Date(promotion.expiredAt).getTime();
  if (!Number.isNaN(expiredTime) && expiredTime < Date.now()) return "EXPIRED";

  const usageLimit = Number(promotion.usageLimit || 0);
  const usedCount = Number(promotion.usedCount || 0);
  if (usageLimit > 0 && usedCount >= usageLimit) return "USED_UP";

  return "ACTIVE";
}

function getRemainingUsageText(promotion: Promotion, unlimitedText: string) {
  const usageLimit = Number(promotion.usageLimit || 0);
  const usedCount = Number(promotion.usedCount || 0);

  if (usageLimit <= 0) {
    return `${unlimitedText}`;
  }

  const remaining = Math.max(usageLimit - usedCount, 0);
  return `${remaining}/${usageLimit}`;
}

function getPromotionApiErrorMessage(error: unknown, translate: (key: string) => string) {
  const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
  const backendMessage = response?.data?.message;

  if (response?.status === 404) {
    return translate("promotions.apiNotMounted");
  }

  if (backendMessage && backendMessage !== "C\u00f3 l\u1ed7i x\u1ea3y ra" && backendMessage !== "Something went wrong") {
    return backendMessage;
  }

  if (response?.status === 500) {
    return translate("promotions.backendNotConfigured");
  }

  return getApiErrorMessage(error);
}

export default function PromotionsPage() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [items, setItems] = useState<Promotion[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<PromotionFormState>(initialForm);

  const formTitle = useMemo(() => {
    return editingPromotion ? t("promotions.editTitle") : t("promotions.createTitle");
  }, [editingPromotion, t]);

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await promotionService.list({ page: currentPage, limit: PAGE_SIZE, search, status });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getPromotionApiErrorMessage(error, t));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, status]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (tierFilter && tierFilter !== "ALL") {
      result = result.filter(p => {
        if (!p.eligibleTiers || p.eligibleTiers === "ALL") return true;
        const tiers = p.eligibleTiers.split(",").map(t => t.trim());
        return tiers.includes(tierFilter);
      });
    }
    return result;
  }, [items, tierFilter]);

  const metrics = useMemo(() => {
    let total = pagination?.totalItems || items.length;
    let active = items.filter(i => getPromotionStatus(i) === "ACTIVE").length;
    let expired = items.filter(i => getPromotionStatus(i) === "EXPIRED").length;
    let usedUp = items.filter(i => getPromotionStatus(i) === "USED_UP").length;
    return { total, active, expired, usedUp };
  }, [items, pagination]);

  function openCreateForm() {
    setEditingPromotion(null);
    setForm(initialForm);
    setIsFormOpen(true);
  }

  function openEditForm(promotion: Promotion) {
    setEditingPromotion(promotion);
    setForm({
      code: promotion.code,
      name: promotion.name || "",
      discountType: promotion.discountType,
      discountValue: formatAmountByType(promotion.discountValue, promotion.discountType),
      maxDiscountAmount: promotion.maxDiscountAmount ? formatAmountByType(promotion.maxDiscountAmount, "AMOUNT") : "",
      minOrderAmount: promotion.minOrderAmount > 0 ? formatThousands(promotion.minOrderAmount) : "",
      usageLimit: promotion.usageLimit ? String(promotion.usageLimit) : "",
      customerLimit: promotion.customerLimit ? String(promotion.customerLimit) : "",
      eligibleTiers: promotion.eligibleTiers || "ALL",
      startDate: promotion.startDate ? promotion.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      expiredAt: promotion.expiredAt ? promotion.expiredAt.slice(0, 10) : "",
      status: promotion.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });
    setIsFormOpen(true);
  }

  function handleDiscountTypeChange(nextType: PromotionDiscountType) {
    setForm((current) => ({
      ...current,
      discountType: nextType,
      discountValue: "",
    }));
  }

  function handleDiscountValueChange(value: string) {
    setForm((current) => ({
      ...current,
      discountValue: current.discountType === "PERCENT" ? formatPercentInput(value) : formatMoneyInput(value),
    }));
  }

  function handleMinOrderAmountChange(value: string) {
    setForm((current) => ({
      ...current,
      minOrderAmount: formatMoneyInput(value) || "0 VND",
    }));
  }

  function buildPayload(): PromotionPayload {
    return {
      code: normalizeCode(form.code),
      name: form.name.trim() || null,
      discountType: form.discountType,
      discountValue: toNumber(form.discountValue),
      maxDiscountAmount: toNumber(form.maxDiscountAmount) > 0 ? toNumber(form.maxDiscountAmount) : null,
      minOrderAmount: toNumber(form.minOrderAmount),
      usageLimit: form.usageLimit ? toNumber(form.usageLimit) : null,
      customerLimit: form.customerLimit ? toNumber(form.customerLimit) : null,
      eligibleTiers: form.eligibleTiers,
      startDate: form.startDate,
      expiredAt: form.expiredAt,
      status: form.status,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      const payload = buildPayload();

      if (!payload.code || payload.discountValue <= 0 || !payload.expiredAt || !payload.startDate) {
        setErrorMessage(t("promotions.formInvalid"));
        return;
      }

      if (payload.discountType === "AMOUNT" && payload.discountValue > payload.minOrderAmount) {
        setErrorMessage(t("promotions.amountInvalid"));
        return;
      }

      if (payload.discountType === "PERCENT" && payload.discountValue > 100) {
        setErrorMessage(t("promotions.percentInvalid"));
        return;
      }

      if (editingPromotion) {
        await promotionService.update(editingPromotion.id, payload);
        toast.success(t("promotions.updated"));
      } else {
        await promotionService.create(payload);
        toast.success(t("promotions.created"));
      }

      setIsFormOpen(false);
      await loadData(page);
    } catch (error) {
      toast.error(getPromotionApiErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(promotion: Promotion) {
    const ok = await confirmAction({ description: t("promotions.deleteConfirm", { code: promotion.code }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true });
    if (!ok) return;

    try {
      setErrorMessage("");
      await promotionService.remove(promotion.id);
      toast.success(t("promotions.deleted"));
      await loadData(page);
    } catch (error) {
      toast.error(getPromotionApiErrorMessage(error, t));
    }
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("promotions.title")} description={t("promotions.description")}>
          <Button onClick={openCreateForm}>
            <Plus className="mr-2 h-4 w-4" />
            {t("promotions.add")}
          </Button>
        </PageHeader>

        <ErrorState message={errorMessage} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("promotions.totalCodes")}</p>
              <p className="text-2xl font-black text-slate-900">{formatNumber(metrics.total)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalPromotionsDesc")}</p>
            </div>
            <Tag className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("promotions.activeCodes")}</p>
              <p className="text-2xl font-black text-emerald-600">{formatNumber(metrics.active)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.activePromotionsDesc")}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("promotions.expiredCodes")}</p>
              <p className="text-2xl font-black text-amber-600">{formatNumber(metrics.expired)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.expiredPromotionsDesc")}</p>
            </div>
            <Clock className="h-8 w-8 text-amber-500/50" />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase">{t("promotions.limitReached")}</p>
              <p className="text-2xl font-black text-rose-600">{formatNumber(metrics.usedUp)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.usedOutPromotionsDesc")}</p>
            </div>
            <XCircle className="h-8 w-8 text-rose-500/50" />
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-4">
              <Input
                className="h-10 w-full text-sm md:w-[320px]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("promotions.searchPlaceholder")}
              />
              <Select
                className="h-10 w-full text-sm md:w-[180px]"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t("common.allStatus")}</option>
                <option value="ACTIVE">{t("status.ACTIVE")}</option>
                <option value="EXPIRED">{t("status.EXPIRED")}</option>
                <option value="USED_UP">{t("promotions.usedUp")}</option>
                <option value="INACTIVE">{t("status.INACTIVE")}</option>
              </Select>
              <Select
                className="h-10 w-full text-sm md:w-[180px]"
                value={tierFilter}
                onChange={(event) => setTierFilter(event.target.value)}
              >
                <option value="">{t("promotions.tierAll")}</option>
                <option value="NONE">{t("promotions.tierNone")}</option>
                <option value="SILVER">{t("promotions.tierSilver")}</option>
                <option value="GOLD">{t("promotions.tierGold")}</option>
                <option value="DIAMOND">{t("promotions.tierDiamond")}</option>
              </Select>
              <Button type="submit" className="h-10 text-sm">{t("common.search")}</Button>
              <Button type="button" variant="outline" className="h-10 text-sm ml-auto">{t("common.export")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}

        {!isLoading && items.length > 0 ? (
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              <DataTable className="rounded-none border-0 shadow-none">
                <thead>
                  <tr>
                    <Th className="w-[60px] whitespace-nowrap">{t("common.no")}</Th>
                    <Th>{t("promotions.code")}</Th>
                    <Th>{t("promotions.discountType")}</Th>
                    <Th className="text-right">{t("promotions.discountValue")}</Th>
                    <Th className="text-right">{t("promotions.minOrderAmount")}</Th>
                    <Th>{t("promotions.eligibleTiers")}</Th>
                    <Th className="text-center whitespace-nowrap">{t("promotions.usageLimit")}</Th>
                    <Th>{t("promotions.startDate")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th className="w-[100px] whitespace-nowrap text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((promotion, index) => {
                    const statusValue = getPromotionStatus(promotion);
                    return (
                      <tr key={promotion.id}>
                        <Td>{(page - 1) * PAGE_SIZE + index + 1}</Td>
                        <Td>
                          <div className="font-semibold text-slate-800">{promotion.code}</div>
                          {promotion.name ? <div className="text-xs text-slate-400 mt-0.5">{promotion.name}</div> : null}
                        </Td>
                        <Td>{promotion.discountType === "AMOUNT" ? t("promotions.amountType") : t("promotions.percentType")}</Td>
                        <Td className="text-right">
                          {promotion.discountType === "AMOUNT" ? (
                            <FormatVnd value={promotion.discountValue} />
                          ) : (
                            <span className="whitespace-nowrap font-semibold text-slate-950">{promotion.discountValue}%</span>
                          )}
                        </Td>
                        <Td className="text-right"><FormatVnd value={promotion.minOrderAmount} /></Td>
                        <Td>
                          {(() => {
                            if (!promotion.eligibleTiers || promotion.eligibleTiers === "ALL") return <span className="text-xs font-medium text-slate-600">{t("promotions.tierAll")}</span>;
                            const tiers = promotion.eligibleTiers.split(",").map(t => t.trim());
                            return (
                              <div className="flex flex-wrap gap-1">
                                {tiers.map(tier => {
                                  let label = tier;
                                  if (tier === "NONE") label = t("promotions.tierNone");
                                  if (tier === "SILVER") label = t("promotions.tierSilver");
                                  if (tier === "GOLD") label = t("promotions.tierGold");
                                  if (tier === "DIAMOND") label = t("promotions.tierDiamond");
                                  return (
                                    <span key={tier} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 uppercase">
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </Td>
                        <Td className="text-center font-medium">{getRemainingUsageText(promotion, t("promotions.unlimited"))}</Td>
                        <Td className="text-xs font-medium text-slate-600 whitespace-nowrap">
                          {formatDate(promotion.startDate)} - {formatDate(promotion.expiredAt)}
                        </Td>
                        <Td><StatusBadge status={statusValue} /></Td>
                        <Td className="text-right">
                          <ActionMenu
                            label={t("common.actions")}
                            items={[
                              { label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(promotion) },
                              { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, variant: "destructive", onClick: () => handleDelete(promotion) },
                            ]}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        ) : null}

        <PaginationControls pagination={pagination} onPageChange={setPage} />

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{formTitle}</DialogTitle>
              <DialogDescription>{t("promotions.formDescription")}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("promotions.code")}</Label>
                <Input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: normalizeCode(event.target.value) }))}
                  placeholder={t("promotions.codePlaceholder")}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>{t("promotions.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t("promotions.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("promotions.discountType")}</Label>
                <Select value={form.discountType} onChange={(event) => handleDiscountTypeChange(event.target.value as PromotionDiscountType)}>
                  <option value="AMOUNT">{t("promotions.amountType")}</option>
                  <option value="PERCENT">{t("promotions.percentType")}</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("promotions.discountValue")}</Label>
                <Input
                  inputMode="numeric"
                  value={form.discountValue}
                  onChange={(event) => handleDiscountValueChange(event.target.value)}
                  placeholder={form.discountType === "AMOUNT" ? t("promotions.discountValueMoneyPlaceholder") : t("promotions.discountValuePercentPlaceholder")}
                  required
                />
              </div>

              {form.discountType === "PERCENT" && (
                <div className="space-y-2">
                  <Label>{t("promotions.maxDiscountAmount")}</Label>
                  <Input
                    inputMode="numeric"
                    value={form.maxDiscountAmount}
                    onChange={(event) => setForm((current) => ({ ...current, maxDiscountAmount: formatMoneyInput(event.target.value) }))}
                    placeholder={t("promotions.maxDiscountAmountPlaceholder")}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>{t("promotions.minOrderAmount")}</Label>
                <Input
                  inputMode="numeric"
                  value={form.minOrderAmount}
                  onChange={(event) => handleMinOrderAmountChange(event.target.value)}
                  placeholder={t("promotions.minOrderAmountPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("promotions.usageLimit")}</Label>
                <Input
                  inputMode="numeric"
                  value={form.usageLimit}
                  onChange={(event) => setForm((current) => ({ ...current, usageLimit: getDigits(event.target.value) }))}
                  placeholder={t("promotions.unlimited")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("promotions.customerLimit")}</Label>
                <Input
                  inputMode="numeric"
                  value={form.customerLimit}
                  onChange={(event) => setForm((current) => ({ ...current, customerLimit: getDigits(event.target.value) }))}
                  placeholder={t("promotions.unlimited")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("promotions.eligibleTiers")}</Label>
                <Select value={form.eligibleTiers} onChange={(event) => setForm((current) => ({ ...current, eligibleTiers: event.target.value }))}>
                  <option value="ALL">{t("promotions.tierAll")}</option>
                  <option value="NONE">{t("promotions.tierNone")}</option>
                  <option value="SILVER">{t("promotions.tierSilver")}</option>
                  <option value="GOLD">{t("promotions.tierGold")}</option>
                  <option value="DIAMOND">{t("promotions.tierDiamond")}</option>
                </Select>
              </div>

              <div className="space-y-2">
                <DateFilterInput
                  label={t("promotions.startDate")}
                  value={form.startDate}
                  onChange={(value) => setForm((current) => ({ ...current, startDate: value }))}
                />
              </div>

              <div className="space-y-2">
                <DateFilterInput
                  label={t("promotions.expiredAt")}
                  value={form.expiredAt}
                  onChange={(value) => setForm((current) => ({ ...current, expiredAt: value }))}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>{t("common.status")}</Label>
                <Select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "ACTIVE" | "INACTIVE" }))}>
                  <option value="ACTIVE">{t("status.ACTIVE")}</option>
                  <option value="INACTIVE">{t("status.INACTIVE")}</option>
                </Select>
              </div>

              <div className="flex justify-end gap-2 md:col-span-2">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {editingPromotion ? t("common.saveChanges") : t("common.confirm")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}


