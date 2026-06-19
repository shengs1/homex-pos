"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit, Plus, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActionMenu } from "@/components/shared/action-menu";
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
import { formatCurrency } from "@/lib/format";
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
  discountType: PromotionDiscountType;
  discountValue: string;
  minOrderAmount: string;
  usageLimit: string;
  expiredAt: string;
  status: "ACTIVE" | "INACTIVE";
};

const initialForm: PromotionFormState = {
  code: "",
  discountType: "AMOUNT",
  discountValue: "",
  minOrderAmount: "0 đ",
  usageLimit: "",
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
  return `${formatThousands(numberValue)} đ`;
}

function formatPercentInput(value: string) {
  const numberValue = Math.min(toNumber(value), 100);
  if (numberValue <= 0) return "";
  return `${numberValue}%`;
}

function formatAmountByType(value: number, discountType: PromotionDiscountType) {
  if (discountType === "PERCENT") return `${Math.min(value, 100)}%`;
  return value > 0 ? `${formatThousands(value)} đ` : "";
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

  if (backendMessage && backendMessage !== "Có lỗi xảy ra" && backendMessage !== "Something went wrong") {
    return backendMessage;
  }

  if (response?.status === 500) {
    return translate("promotions.backendNotConfigured");
  }

  return getApiErrorMessage(error);
}

export default function PromotionsPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Promotion[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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

  function openCreateForm() {
    setEditingPromotion(null);
    setForm(initialForm);
    setIsFormOpen(true);
  }

  function openEditForm(promotion: Promotion) {
    setEditingPromotion(promotion);
    setForm({
      code: promotion.code,
      discountType: promotion.discountType,
      discountValue: formatAmountByType(promotion.discountValue, promotion.discountType),
      minOrderAmount: promotion.minOrderAmount > 0 ? `${formatThousands(promotion.minOrderAmount)} đ` : "0 đ",
      usageLimit: promotion.usageLimit ? String(promotion.usageLimit) : "",
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
      minOrderAmount: formatMoneyInput(value) || "0 đ",
    }));
  }

  function buildPayload(): PromotionPayload {
    return {
      code: normalizeCode(form.code),
      discountType: form.discountType,
      discountValue: toNumber(form.discountValue),
      minOrderAmount: toNumber(form.minOrderAmount),
      usageLimit: form.usageLimit ? toNumber(form.usageLimit) : null,
      expiredAt: form.expiredAt,
      status: form.status,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      const payload = buildPayload();

      if (!payload.code || payload.discountValue <= 0 || !payload.expiredAt) {
        setErrorMessage(t("promotions.formInvalid"));
        return;
      }

      if (payload.discountType === "PERCENT" && payload.discountValue > 100) {
        setErrorMessage(t("promotions.percentInvalid"));
        return;
      }

      if (editingPromotion) {
        await promotionService.update(editingPromotion.id, payload);
        setSuccessMessage(t("promotions.updated"));
      } else {
        await promotionService.create(payload);
        setSuccessMessage(t("promotions.created"));
      }

      setIsFormOpen(false);
      await loadData(page);
    } catch (error) {
      setErrorMessage(getPromotionApiErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(promotion: Promotion) {
    const ok = window.confirm(t("promotions.deleteConfirm", { code: promotion.code }));
    if (!ok) return;

    try {
      setErrorMessage("");
      setSuccessMessage("");
      await promotionService.remove(promotion.id);
      setSuccessMessage(t("promotions.deleted"));
      await loadData(page);
    } catch (error) {
      setErrorMessage(getPromotionApiErrorMessage(error, t));
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t("promotions.title")}</h1>
            <p className="mt-2 text-base text-muted-foreground">{t("promotions.description")}</p>
          </div>

          <Button onClick={openCreateForm} className="h-12 shrink-0 bg-blue-600 px-5 text-white hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            {t("promotions.add")}
          </Button>
        </div>

        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-4">
              <Input
                className="w-full md:w-[320px]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("promotions.searchPlaceholder")}
              />
              <Select
                className="w-full md:w-[220px]"
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
              <Button type="submit">{t("common.search")}</Button>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}

        {!isLoading && items.length > 0 ? (
          <DataTable noHorizontalScroll>
            <thead>
              <tr>
                <Th className="w-[80px] whitespace-nowrap">{t("common.no")}</Th>
                <Th>{t("promotions.code")}</Th>
                <Th>{t("promotions.discountType")}</Th>
                <Th>{t("promotions.discountValue")}</Th>
                <Th>{t("promotions.minOrderAmount")}</Th>
                <Th className="whitespace-nowrap">{t("promotions.quantity")}</Th>
                <Th>{t("common.status")}</Th>
                <Th className="w-[110px] whitespace-nowrap text-right">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((promotion, index) => {
                const statusValue = getPromotionStatus(promotion);
                return (
                  <tr key={promotion.id}>
                    <Td>{(page - 1) * PAGE_SIZE + index + 1}</Td>
                    <Td className="font-semibold">{promotion.code}</Td>
                    <Td>{promotion.discountType === "AMOUNT" ? t("promotions.amountType") : t("promotions.percentType")}</Td>
                    <Td>{promotion.discountType === "AMOUNT" ? formatCurrency(promotion.discountValue) : `${promotion.discountValue}%`}</Td>
                    <Td>{formatCurrency(promotion.minOrderAmount)}</Td>
                    <Td className="font-medium">{getRemainingUsageText(promotion, t("promotions.unlimited"))}</Td>
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
