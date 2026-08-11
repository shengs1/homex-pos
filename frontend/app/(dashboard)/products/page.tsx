"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { AlertTriangle, Barcode, Check, CheckSquare, Clipboard, Copy, Database, Edit, FileUp, ImageIcon, Link, LockKeyhole, MoreHorizontal, Plus, Printer, QrCode, RotateCcw, Search, SlidersHorizontal, Smartphone, Trash2, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import JsBarcode from "jsbarcode";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TanStackDataTable } from "@/components/shared/tanstack-data-table";
import { ErrorState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getApiErrorMessage } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { buildDemoProductPayloads, parseProductImportFileContent, resolveRealProductImageFromProductName, REAL_PRODUCT_FALLBACK_IMAGE } from "@/lib/demo-products";
import { compactProductPrice, formatCurrency, formatMoneyInputValue, formatNumber, formatDateTime, parseMoneyInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildMobileScanUrl, clearActiveRemoteBarcodeTarget, getOrCreateRemoteBarcodeSessionId, resetRemoteBarcodeSessionId, setActiveRemoteBarcodeTarget } from "@/lib/remote-barcode-session";
import { categoryService, posService, productService, supplierService, type ProductPayload } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Category, Product, Supplier } from "@/types/domain";

function createFormSchema(t: (key: string) => string) {
  return z.object({
  sku: z.string().trim().max(50).optional(),
  name: z.string().trim().min(1, t("products.nameRequired")).max(150),
  description: z.string().trim().max(500, t("products.descriptionMax")).optional(),
  categoryId: z.coerce.number().int().positive(t("products.categoryRequired")),
  supplierId: z.coerce.number().int().positive(t("products.supplierRequired")),
  costPrice: z.preprocess((value) => parseMoneyInput(value as string | number), z.number().min(0, t("products.costPriceMin"))),
  salePrice: z.preprocess((value) => parseMoneyInput(value as string | number), z.number().positive(t("products.salePricePositive"))),
  originalPrice: z.preprocess((value) => parseMoneyInput(value as string | number), z.number().min(0).optional()),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  warrantyMonths: z.coerce.number().int().min(0).optional(),
  qrCode: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  });
}

type FormInput = z.input<ReturnType<typeof createFormSchema>>;
type FormValues = z.output<ReturnType<typeof createFormSchema>>;

type ProductActionItem = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
};

const LAST_DELETED_PRODUCT_IDS_KEY = "homex_last_deleted_product_ids";

const emptyForm: FormValues = {
  sku: "",
  name: "",
  description: "",
  categoryId: 0,
  supplierId: 0,
  costPrice: 0,
  salePrice: 0,
  originalPrice: 0,
  stockQuantity: 0,
  minStock: 0,
  warrantyMonths: 0,
  qrCode: "",
  imageUrl: "",
  barcode: "",
  status: "ACTIVE",
};

const jsonStructureExample = `[
  {
    "sku": "KIT-SH-NC000001",
    "name": "Homex Rice Cooker 1.8L NC000001",
    "categoryId": 1,
    "supplierId": 1,
    "costPrice": 5200,
    "salePrice": 7500,
    "stockQuantity": 30,
    "minStock": 5,
    "warrantyMonths": 24,
    "imageUrl": "/assets/real-products/rice-cooker.jpg",
    "imageBase64": "data:image/png;base64,..."
  }
]`;

const csvStructureExample = `sku,name,categoryId,supplierId,costPrice,salePrice,stockQuantity,minStock,warrantyMonths,imageUrl
KIT-SH-NC000001,Homex Rice Cooker 1.8L NC000001,1,1,5200,7500,30,5,24,/assets/real-products/rice-cooker.jpg`;

function sortByIdAsc<T extends { id: number }>(items: T[]) {
  return [...items].sort((a, b) => a.id - b.id);
}

function ProductActionMenu({ label, items }: { label: string; items: ProductActionItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 min-w-9" title={label} aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-48">
          {items.map((item) => (
            <DropdownMenuItem
            key={item.label}
            onClick={item.onClick}
            className={cn(item.variant === "destructive" && "text-destructive hover:text-destructive")}
          >
            {item.icon}
            <span>{item.label}</span>
          </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

const columnHelper = createColumnHelper<Product>();

function BarcodeRenderer({ value }: { value: string }) {
  const elementRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (elementRef.current && value) {
      try {
        JsBarcode(elementRef.current, value, {
          format: "CODE128",
          width: 2,
          height: 80,
          displayValue: false,
          margin: 0,
        });
      } catch (e) {
        console.error("Barcode rendering failed:", e);
      }
    }
  }, [value]);

  return <svg ref={elementRef} className="mx-auto" />;
}

export default function ProductsPage() {
  const { t } = useLanguage();
  const user = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const productImageFileRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedQrProduct, setSelectedQrProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportGuideOpen, setIsImportGuideOpen] = useState(false);
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);
  const [deleteAllPassword, setDeleteAllPassword] = useState("");
  const [deleteAllMode, setDeleteAllMode] = useState<"soft" | "hard">("soft");
  const [lastDeletedProductIds, setLastDeletedProductIds] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isEnriching, setIsEnriching] = useState(false);
  const [remoteBarcodeOpen, setRemoteBarcodeOpen] = useState(false);
  const [remoteBarcodeSessionId, setRemoteBarcodeSessionId] = useState("");
  const [isBarcodeLinkCopied, setIsBarcodeLinkCopied] = useState(false);
  const [barcodeEnrichSource, setBarcodeEnrichSource] = useState("");
  const [barcodeEnrichMissingFields, setBarcodeEnrichMissingFields] = useState<string[]>([]);
  const { toast } = useToast();
  const remoteBarcodePollNetworkErrorShownRef = useRef(false);
  const lastRemoteBarcodeRef = useRef("");

  const formSchema = useMemo(() => createFormSchema(t), [t]);
  const form = useForm<FormInput, unknown, FormValues>({resolver: zodResolver(formSchema), defaultValues: emptyForm, });

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((key) => rowSelection[key]).map((key) => Number(key)), [rowSelection]);
  const selectedCount = selectedIds.length;
  const currentImageUrl = form.watch("imageUrl");
  const costPriceInput = form.watch("costPrice") as string | number | null | undefined;
  const salePriceInput = form.watch("salePrice") as string | number | null | undefined;
  const originalPriceInput = form.watch("originalPrice") as string | number | null | undefined;

  function setMoneyFormField(field: "costPrice" | "salePrice" | "originalPrice", value: string) {
    form.setValue(field, formatMoneyInputValue(value) as any, { shouldDirty: true, shouldValidate: true });
  }

  function openRemoteBarcodeScanner() {
    setActiveRemoteBarcodeTarget("products");
    setRemoteBarcodeSessionId(getOrCreateRemoteBarcodeSessionId());
    setRemoteBarcodeOpen(true);
    setIsBarcodeLinkCopied(false);
  }

  function resetRemoteBarcodeScanner() {
    const nextSessionId = resetRemoteBarcodeSessionId();
    setRemoteBarcodeSessionId(nextSessionId);
    setIsBarcodeLinkCopied(false);
    toast.success(t("barcode.remoteSessionReset"));
  }

  const remoteBarcodeScanUrl = useMemo(() => buildMobileScanUrl(remoteBarcodeSessionId), [remoteBarcodeSessionId]);

  async function copyRemoteBarcodeScanLink() {
    if (!remoteBarcodeScanUrl) return;

    try {
      await navigator.clipboard.writeText(remoteBarcodeScanUrl);
      setIsBarcodeLinkCopied(true);
      toast.success(t("barcode.scanLinkCopied"));
      window.setTimeout(() => setIsBarcodeLinkCopied(false), 2000);
    } catch {
      toast.error(t("barcode.copyLinkFailed"));
    }
  }

  useEffect(() => {
    if (!isFormOpen || !remoteBarcodeSessionId) return;
    setActiveRemoteBarcodeTarget("products");
    remoteBarcodePollNetworkErrorShownRef.current = false;

    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      try {
        const res = await posService.pollRemoteScan(remoteBarcodeSessionId);
        remoteBarcodePollNetworkErrorShownRef.current = false;

        if (res?.success && res.barcode) {
          const scannedBarcode = res.barcode.trim();
          if (!scannedBarcode || scannedBarcode === lastRemoteBarcodeRef.current) return;
          lastRemoteBarcodeRef.current = scannedBarcode;
          form.setValue("barcode", scannedBarcode, { shouldDirty: true, shouldValidate: true });
          toast.success(t("barcode.receivedBarcode", { barcode: scannedBarcode }));
          setRemoteBarcodeOpen(false);
          await enrichBarcode(scannedBarcode);
        }
      } catch (error) {
        if (!remoteBarcodePollNetworkErrorShownRef.current) {
          remoteBarcodePollNetworkErrorShownRef.current = true;
          if (remoteBarcodeOpen) {
            toast.error(t("barcode.pollBackendFailed"));
          }
        }
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [isFormOpen, remoteBarcodeOpen, remoteBarcodeSessionId, form, toast]);

  useEffect(() => {
    setRemoteBarcodeSessionId(getOrCreateRemoteBarcodeSessionId());
  }, []);

  useEffect(() => {
    if (!isFormOpen) {
      clearActiveRemoteBarcodeTarget("products");
      return;
    }

    setActiveRemoteBarcodeTarget("products");
    return () => clearActiveRemoteBarcodeTarget("products");
  }, [isFormOpen]);

  function handleProductImageError(event: SyntheticEvent<HTMLImageElement>, _productName?: string) {
    event.currentTarget.onerror = null;
    event.currentTarget.src = REAL_PRODUCT_FALLBACK_IMAGE;
  }

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(LAST_DELETED_PRODUCT_IDS_KEY);
      if (storedValue) {
        const parsedIds = JSON.parse(storedValue);
        if (Array.isArray(parsedIds)) {
          setLastDeletedProductIds(parsedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
        }
      }
    } catch {
      window.localStorage.removeItem(LAST_DELETED_PRODUCT_IDS_KEY);
    }
  }, []);

  function rememberLastDeletedProductIds(ids: number[]) {
    const cleanIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
    setLastDeletedProductIds(cleanIds);
    window.localStorage.setItem(LAST_DELETED_PRODUCT_IDS_KEY, JSON.stringify(cleanIds));
  }

  function clearLastDeletedProductIds() {
    setLastDeletedProductIds([]);
    window.localStorage.removeItem(LAST_DELETED_PRODUCT_IDS_KEY);
  }

  async function loadOptions() {
    try {
      const [categoryData, supplierData] = await Promise.all([
        categoryService.list({ page: 1, limit: 200, status: "ACTIVE" }),
        supplierService.list({ page: 1, limit: 200, status: "ACTIVE" }),
      ]);
      setCategories(sortByIdAsc(categoryData.items));
      setSuppliers(sortByIdAsc(supplierData.items));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await productService.list({ page: currentPage, limit: 10, search, status, categoryId, supplierId, lowStock });
      setItems(sortByIdAsc(data.items));
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function normalizeText(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function extractCategoryCode(value: string) {
    return value.match(/\(([A-Z0-9]{2,8})\)/i)?.[1]?.toLowerCase() || "";
  }

  function getCategoryAliases(value: string) {
    const normalized = normalizeText(value);
    const code = extractCategoryCode(value);
    const aliases = new Set([normalized, code]);

    if (/kitchen|nha bep|thiet bi nha bep/.test(normalized) || code === "kit") aliases.add("kit");
    if (/clean|lam sach|ve sinh|care/.test(normalized) || code === "care") aliases.add("care");
    if (/util|do dung gia dinh|vat dung gia dinh|home goods/.test(normalized) || code === "util") aliases.add("util");
    if (/other|khac|ngoai pham tru|do choi|toy|bang keo|y te|medical|beverage|drink|water|nuoc|food|thuc pham/.test(normalized) || code === "other") aliases.add("other");
    if (/cook|dung cu nau an|nau an|pan|pot|chao|noi/.test(normalized) || code === "cook") aliases.add("cook");
    if (/cool|lam mat|quat|fan|air conditioner/.test(normalized) || code === "cool") aliases.add("cool");
    if (/elec|dien|electric|electrical/.test(normalized) || code === "elec") aliases.add("elec");
    if (/bath|phong tam|bathroom/.test(normalized) || code === "bath") aliases.add("bath");

    return Array.from(aliases).filter(Boolean);
  }

  function hasEmptyFormValue(value: unknown) {
    return value === undefined || value === null || value === "" || Number(value) === 0;
  }

  function findMatchedCategory(categoryName?: string) {
    const normalizedCategory = normalizeText(categoryName || "");
    if (!normalizedCategory) return undefined;

    const inputAliases = getCategoryAliases(categoryName || "");

    return categories.find((category) => {
      const categoryDisplayName = normalizeText(category.name || "");
      const categoryCode = normalizeText((category as Category & { code?: string }).code || extractCategoryCode(category.name || ""));
      const categoryAliases = getCategoryAliases(category.name || "");

      return (
        categoryDisplayName === normalizedCategory ||
        categoryDisplayName.includes(normalizedCategory) ||
        normalizedCategory.includes(categoryDisplayName) ||
        (categoryCode && inputAliases.includes(categoryCode)) ||
        inputAliases.some((alias) => categoryAliases.includes(alias))
      );
    });
  }

  function findMatchedSupplier(supplierName?: string) {
    const normalizedSupplier = normalizeText(supplierName || "");
    if (!normalizedSupplier) return undefined;

    return suppliers.find((supplier) => {
      const supplierDisplayName = normalizeText(supplier.name || "");
      return (
        supplierDisplayName === normalizedSupplier ||
        supplierDisplayName.includes(normalizedSupplier) ||
        normalizedSupplier.includes(supplierDisplayName)
      );
    });
  }
  function applyEnrichedProductData(data: Awaited<ReturnType<typeof productService.enrichProductByBarcode>>) {
    setBarcodeEnrichSource(data.source || "");
    setBarcodeEnrichMissingFields(data.missingFields || []);

    if (data.existingProductId && (!editingItem || editingItem.id !== data.existingProductId)) {
      toast.warning(t("barcode.duplicate"));
    }

    if (data.barcode && !form.getValues("barcode")) {
      form.setValue("barcode", data.barcode, { shouldDirty: true, shouldValidate: true });
    }

    if (data.name && !form.getValues("name")) {
      form.setValue("name", data.name, { shouldDirty: true, shouldValidate: true });
    }

    if (typeof data.estimatedImportPrice === "number" && hasEmptyFormValue(form.getValues("costPrice"))) {
      form.setValue("costPrice", data.estimatedImportPrice as any, { shouldDirty: true, shouldValidate: true });
    }

    if (typeof data.estimatedSalePrice === "number" && hasEmptyFormValue(form.getValues("salePrice"))) {
      form.setValue("salePrice", data.estimatedSalePrice as any, { shouldDirty: true, shouldValidate: true });
    }

    if (typeof data.originalPrice === "number" && hasEmptyFormValue(form.getValues("originalPrice"))) {
      form.setValue("originalPrice", data.originalPrice as any, { shouldDirty: true, shouldValidate: true });
    }

    if (typeof data.stockQuantity === "number" && hasEmptyFormValue(form.getValues("stockQuantity"))) {
      form.setValue("stockQuantity", data.stockQuantity, { shouldDirty: true, shouldValidate: true });
    }

    if (typeof data.minStock === "number" && hasEmptyFormValue(form.getValues("minStock"))) {
      form.setValue("minStock", data.minStock, { shouldDirty: true, shouldValidate: true });
    }

    if (typeof data.warrantyMonths === "number" && hasEmptyFormValue(form.getValues("warrantyMonths"))) {
      form.setValue("warrantyMonths", data.warrantyMonths, { shouldDirty: true, shouldValidate: true });
    }

    if (data.imageUrl && !form.getValues("imageUrl")) {
      form.setValue("imageUrl", data.imageUrl, { shouldDirty: true, shouldValidate: true });
    }

    if (data.description && !form.getValues("description")) {
      form.setValue("description", data.description, { shouldDirty: true, shouldValidate: true });
    }

    if (data.category && hasEmptyFormValue(form.getValues("categoryId"))) {
      const matchedCategory = findMatchedCategory(data.category);
      if (matchedCategory) {
        form.setValue("categoryId", matchedCategory.id, { shouldDirty: true, shouldValidate: true });
      } else {
        toast.warning(t("barcode.categoryNotMatched"));
      }
    }

    if (data.supplierName && hasEmptyFormValue(form.getValues("supplierId"))) {
      const matchedSupplier = findMatchedSupplier(data.supplierName);
      if (matchedSupplier) {
        form.setValue("supplierId", matchedSupplier.id, { shouldDirty: true, shouldValidate: true });
      }
    }

    const hasUsefulEnrichedData = Boolean(data.name || data.category || data.supplierName || data.estimatedSalePrice || data.estimatedImportPrice || data.originalPrice || data.stockQuantity || data.minStock || data.warrantyMonths || data.imageUrl || data.description);
    const hasIdentityEnrichedData = Boolean(data.name || data.category);

    if (!hasUsefulEnrichedData) {
      toast.warning(t("barcode.noReliableData"));
      return;
    }

    if (!hasIdentityEnrichedData) {
      toast.warning(t("barcode.partialDataOnly"));
      return;
    }

    if (data.source === "DATABASE") {
      toast.warning(t("barcode.duplicate"));
      return;
    }

    if (data.source === "HYBRID") {
      toast.success(t("barcode.hybridFilled"));
      return;
    }

    if (data.source === "AI") {
      toast.success(t("barcode.aiSuggested"));
      return;
    }

    toast.success(t("barcode.dataFound"));
  }

  async function enrichBarcode(barcodeValue?: string) {
    const barcode = (barcodeValue || form.getValues("barcode") || "").trim();
    if (!barcode) {
      toast.error(t("barcode.enterBarcodeFirst"));
      return;
    }

    if (barcode.length < 8) return;

    try {
      setIsEnriching(true);
      const res = await productService.enrichProductByBarcode(barcode);
      applyEnrichedProductData(res);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || t("barcode.aiFailed"));
    } finally {
      setIsEnriching(false);
    }
  }

  async function handleAiEnrich() {
    await enrichBarcode();
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    loadData(page);
  }, [page, status, categoryId, supplierId, lowStock]);

  function openCreateForm() {
    setEditingItem(null);
    setBarcodeEnrichSource("");
    setBarcodeEnrichMissingFields([]);
    lastRemoteBarcodeRef.current = "";
    form.reset(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(item: Product) {
    setEditingItem(item);
    setBarcodeEnrichSource("");
    setBarcodeEnrichMissingFields([]);
    lastRemoteBarcodeRef.current = "";
    form.reset({
      sku: item.sku,
      name: item.name,
      description: item.description || "",
      categoryId: item.categoryId,
      supplierId: item.supplierId,
      costPrice: item.costPrice,
      salePrice: item.salePrice,
      originalPrice: item.originalPrice || 0,
      stockQuantity: item.stockQuantity,
      minStock: item.minStock,
      warrantyMonths: item.warrantyMonths,
      qrCode: item.qrCode || item.sku,
      imageUrl: item.imageUrl || "",
      barcode: item.barcode || "",
      status: item.status as "ACTIVE" | "INACTIVE",
    });
    setIsFormOpen(true);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  async function onSubmit(values: FormValues) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      const payload = {
        ...values,
        costPrice: compactProductPrice(values.costPrice),
        salePrice: compactProductPrice(values.salePrice),
        originalPrice: values.originalPrice ? compactProductPrice(values.originalPrice) : 0,
        sku: editingItem ? values.sku : undefined,
        qrCode: values.qrCode || undefined,
        imageUrl: values.imageUrl || resolveRealProductImageFromProductName(values.name),
        barcode: values.barcode || undefined,
      };
      if (editingItem) {
        await productService.update(editingItem.id, payload);
        setSuccessMessage(t("message.updated"));
      } else {
        await productService.create(payload);
        setSuccessMessage(t("message.created"));
      }
      setIsFormOpen(false);
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleDelete(item: Product) {
    if (!(await confirmAction({ description: t("products.deleteConfirm", { name: item.name }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true }))) return;

    try {
      setErrorMessage("");
      await productService.remove(item.id);
      setSuccessMessage(t("message.deleted"));
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleRestore(item: Product) {
    if (!(await confirmAction({ description: t("products.restoreConfirm", { name: item.name }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel") }))) return;

    try {
      setErrorMessage("");
      await productService.restore(item.id);
      if (lastDeletedProductIds.includes(item.id)) {
        const remainingIds = lastDeletedProductIds.filter((id) => id !== item.id);
        setLastDeletedProductIds(remainingIds);
        window.localStorage.setItem(LAST_DELETED_PRODUCT_IDS_KEY, JSON.stringify(remainingIds));
      }
      setSuccessMessage(t("message.restored"));
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function restoreProductIds(productIds: number[]) {
    let restored = 0;
    let failed = 0;

    for (let index = 0; index < productIds.length; index += 20) {
      const batch = productIds.slice(index, index + 20);
      const results = await Promise.allSettled(batch.map((id) => productService.restore(id)));
      restored += results.filter((result) => result.status === "fulfilled").length;
      failed += results.filter((result) => result.status === "rejected").length;
    }

    return { restored, failed };
  }

  async function handleRestoreLastDeletedBatch() {
    if (lastDeletedProductIds.length === 0) {
      setToastMessage(t("products.noDeletedBatch"));
      window.setTimeout(() => setToastMessage(""), 4000);
      return;
    }

    if (!(await confirmAction({ description: t("products.restoreLastDeletedConfirm", { count: lastDeletedProductIds.length }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel") }))) return;

    try {
      setIsBulkLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      const result = await restoreProductIds(lastDeletedProductIds);
      clearLastDeletedProductIds();
      setStatus("ACTIVE");
      setPage(1);
      setRowSelection({});
      setSuccessMessage(t("products.restoreBatchResult", { restored: result.restored, failed: result.failed }));
      await loadData(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsBulkLoading(false);
    }
  }

  async function createProductsInBatches(payloads: ProductPayload[]) {
    let created = 0;
    let failed = 0;

    for (let index = 0; index < payloads.length; index += 10) {
      const batch = payloads.slice(index, index + 10);
      const results = await Promise.allSettled(
        batch.map((payload) => productService.create({
          ...payload,
          costPrice: compactProductPrice(payload.costPrice),
          salePrice: compactProductPrice(payload.salePrice),
          originalPrice: payload.originalPrice ? compactProductPrice(payload.originalPrice) : undefined,
          qrCode: payload.qrCode || payload.sku || undefined,
        }))
      );
      created += results.filter((result) => result.status === "fulfilled").length;
      failed += results.filter((result) => result.status === "rejected").length;
    }

    return { created, failed };
  }

  async function handleBulkDemoImport() {
    try {
      setIsBulkLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const [categoryData, supplierData] = await Promise.all([
        categoryService.list({ page: 1, limit: 500, status: "ACTIVE" }),
        supplierService.list({ page: 1, limit: 500, status: "ACTIVE" }),
      ]);

      const activeCategories = categoryData.items.filter((item) => item.status === "ACTIVE");
      const activeSuppliers = supplierData.items.filter((item) => item.status === "ACTIVE");

      setCategories(sortByIdAsc(activeCategories));
      setSuppliers(sortByIdAsc(activeSuppliers));

      if (activeCategories.length === 0 || activeSuppliers.length === 0) {
        setErrorMessage(t("products.demoRequiresCategorySupplier"));
        return;
      }

      const now = new Date();
      const batchSeed = Number(`${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`);
      const payloads = buildDemoProductPayloads(activeCategories, activeSuppliers, 150, batchSeed);
      const result = await createProductsInBatches(payloads);

      setSuccessMessage(t("products.bulkResult", result));
      setStatus("ACTIVE");
      setPage(1);
      await Promise.all([loadOptions(), loadData(1)]);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsBulkLoading(false);
    }
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      setIsBulkLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      const content = await file.text();
      const payloads = parseProductImportFileContent(content).slice(0, 200).map((payload, index) => ({
        ...payload,
        qrCode: payload.qrCode || payload.sku || undefined,
        imageUrl: payload.imageUrl || resolveRealProductImageFromProductName(payload.name),
      }));

      if (payloads.length === 0) {
        setErrorMessage(t("products.importFileEmpty"));
        return;
      }

      const result = await createProductsInBatches(payloads);
      setSuccessMessage(t("products.bulkResult", result));
      setPage(1);
      await loadData(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsBulkLoading(false);
    }
  }

  async function softDeleteProducts(productIds: number[]) {
    let deleted = 0;
    let failed = 0;
    const deletedIds: number[] = [];

    for (let index = 0; index < productIds.length; index += 20) {
      const batch = productIds.slice(index, index + 20);
      const results = await Promise.allSettled(batch.map((id) => productService.remove(id)));

      results.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") {
          deleted += 1;
          deletedIds.push(batch[resultIndex]);
        } else {
          failed += 1;
        }
      });
    }

    return { deleted, failed, deletedIds };
  }

  async function hardDeleteProducts(productIds: number[]) {
    let deleted = 0;
    let failed = 0;

    for (let index = 0; index < productIds.length; index += 10) {
      const batch = productIds.slice(index, index + 10);
      const results = await Promise.allSettled(
        batch.map((id) => productService.hardRemove(id, { adminPassword: deleteAllPassword }))
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          deleted += 1;
        } else {
          failed += 1;
        }
      });
    }

    return { deleted, failed };
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!(await confirmAction({ description: t("products.bulkDeleteConfirm", { count: selectedIds.length }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true }))) return;

    try {
      setIsBulkLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      const result = await softDeleteProducts(selectedIds);
      setRowSelection({});
      setSuccessMessage( t("products.bulkDeleteResult", {deleted: result.deleted, failed: result.failed, }) );
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsBulkLoading(false);
    }
  }

  async function handleDeleteAllProducts() {
    if (deleteAllPassword !== "Admin@123") {
      setToastMessage(t("products.deleteAllPasswordIncorrect"));
      window.setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    try {
      setIsBulkLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      let totalDeleted = 0;
      let totalFailed = 0;
      let safeLoop = 0;
      const deletedIds: number[] = [];

      while (safeLoop < 200) {
        safeLoop += 1;
        const data = await productService.list({ page: 1, limit: 100, status: deleteAllMode === "soft" ? "ACTIVE" : "" });
        const targetIds = data.items.map((item) => item.id);

        if (targetIds.length === 0) {
          break;
        }

        if (deleteAllMode === "soft") {
          const result = await softDeleteProducts(targetIds);
          totalDeleted += result.deleted;
          totalFailed += result.failed;
          deletedIds.push(...result.deletedIds);

          if (result.deleted === 0 && result.failed > 0) {
            break;
          }
        } else {
          const result = await hardDeleteProducts(targetIds);
          totalDeleted += result.deleted;
          totalFailed += result.failed;

          if (result.deleted === 0 && result.failed > 0) {
            break;
          }
        }
      }

      if (deleteAllMode === "soft") {
        rememberLastDeletedProductIds(deletedIds);
      } else {
        clearLastDeletedProductIds();
      }

      setRowSelection({});
      setDeleteAllPassword("");
      setDeleteAllMode("soft");
      setIsDeleteAllDialogOpen(false);
      setSuccessMessage(
        deleteAllMode === "soft"
          ? t("products.softDeleteAllResult", { deleted: totalDeleted, failed: totalFailed })
          : t("products.hardDeleteAllResult", { deleted: totalDeleted, failed: totalFailed })
      );
      setPage(1);
      await loadData(1);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsBulkLoading(false);
    }
  }
  function handleProductImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setToastMessage(t("products.invalidImageFile"));
      window.setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "");
      form.setValue("imageUrl", base64, { shouldDirty: true, shouldValidate: true });
      setToastMessage(t("products.imageUploaded"));
      window.setTimeout(() => setToastMessage(""), 3500);
    };
    reader.onerror = () => {
      setToastMessage(t("products.imageReadFailed"));
      window.setTimeout(() => setToastMessage(""), 3500);
    };
    reader.readAsDataURL(file);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  async function copyImportStructure() {
    const text = `${t("products.jsonExample")}\n${jsonStructureExample}\n\n${t("products.csvExample")}\n${csvStructureExample}`;
    await navigator.clipboard.writeText(text);
    setSuccessMessage(t("products.structureCopied"));
  }

  function proceedFileUpload() {
    setIsImportGuideOpen(false);
    window.setTimeout(() => importFileRef.current?.click(), 80);
  }

  function printQrCode(product: Product) {
    const printArea = document.getElementById("homex-product-qr-print-area");
    if (!printArea) return;

    const printWindow = window.open("", "_blank", "width=420,height=560");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${product.sku}</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
            .wrap { text-align: center; border: 1px solid #ddd; padding: 24px; border-radius: 16px; }
            .sku { margin-top: 16px; font-size: 20px; font-weight: 700; }
            .name { margin-top: 8px; color: #475569; max-width: 300px; }
          </style>
        </head>
        <body>
          <div class="wrap">
            ${printArea.innerHTML}
            <div class="sku">${product.sku}</div>
            <div class="name">${product.name}</div>
          </div>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  const columns = useMemo<any[]>(() => {
    const cols: any[] = [
      columnHelper.display({
        id: "select",
        size: 42,
        header: ({ table }) => (
          <div className="flex justify-center">
            <input
              type="checkbox"
              checked={table.getIsAllPageRowsSelected()}
              ref={(element) => {
                if (element) element.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              aria-label={t("products.selectAll")}
              disabled={!isAdmin}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <input
              type="checkbox"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect() || !isAdmin}
              onChange={row.getToggleSelectedHandler()}
              aria-label={t("products.selectProduct", { sku: row.original.sku })}
            />
          </div>
        ),
        meta: { headerClassName: "px-2 text-center", cellClassName: "px-2 text-center" },
      }),
      columnHelper.accessor("sku", {
        id: "sku",
        size: 108,
        header: t("products.sku"),
        cell: ({ getValue }) => <div className="break-words whitespace-normal line-clamp-2 font-medium" title={getValue()}>{getValue()}</div>,
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      }),
      columnHelper.display({
        id: "image",
        size: 60,
        header: t("common.image"),
        cell: ({ row }) => (
          <div className="mx-auto h-11 w-11 overflow-hidden rounded-lg border bg-muted">
            <img
              src={row.original.imageUrl || REAL_PRODUCT_FALLBACK_IMAGE}
              alt={row.original.name}
              className="h-full w-full object-cover"
              onError={(event) => handleProductImageError(event, row.original.name)}
            />
          </div>
        ),
        meta: { headerClassName: "px-2 text-center whitespace-nowrap", cellClassName: "px-2" },
      }),

      columnHelper.display({
        id: "product",
        size: 230,
        header: t("products.product"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="line-clamp-2 font-medium" title={row.original.name}>{row.original.name}</div>
            <div className="break-words whitespace-normal line-clamp-2 text-xs text-muted-foreground">{t("products.updatedAt", { date: formatDateTime(row.original.updatedAt) })}</div>
          </div>
        ),
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      }),
      columnHelper.display({
        id: "category",
        size: 112,
        header: t("products.category"),
        cell: ({ row }) => <div className="break-words whitespace-normal line-clamp-2" title={row.original.category?.name || String(row.original.categoryId)}>{row.original.category?.name || row.original.categoryId}</div>,
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      }),
      columnHelper.display({
        id: "supplier",
        size: 112,
        header: t("products.supplierShort"),
        cell: ({ row }) => <div className="break-words whitespace-normal line-clamp-2" title={row.original.supplier?.name || String(row.original.supplierId)}>{row.original.supplier?.name || row.original.supplierId}</div>,
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      }),
      columnHelper.accessor("salePrice", {
        id: "salePrice",
        size: 105,
        header: t("products.salePrice"),
        cell: ({ row, getValue }) => {
          const salePrice = Number(getValue());
          const originalPrice = Number(row.original.originalPrice || 0);
          return (
            <div className="break-words whitespace-normal line-clamp-2" title={formatCurrency(salePrice)}>
              {originalPrice > salePrice ? <div className="text-xs text-muted-foreground line-through">{formatCurrency(originalPrice)}</div> : null}
              <div className="font-medium text-emerald-600">{formatCurrency(salePrice)}</div>
            </div>
          );
        },
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      }),
    ];

    if (isAdmin) {
      cols.push(
        columnHelper.accessor("costPrice", {
          id: "costPrice",
          size: 105,
          header: t("products.costPrice"),
          cell: ({ getValue }) => <div className="font-medium text-amber-600" title={formatCurrency(Number(getValue()))}>{formatCurrency(Number(getValue()))}</div>,
          meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
        })
      );
    }

    cols.push(
      columnHelper.display({
        id: "stock",
        size: 120,
        header: t("products.stock"),
        cell: ({ row }) => {
          const isLowStock = row.original.stockQuantity <= row.original.minStock;
          return (
            <div className="text-sm">
              <span className={cn("font-semibold", isLowStock ? "text-destructive" : "text-foreground")} title={`${row.original.stockQuantity} ${t("products.currentStock")} / ${row.original.minStock} ${t("products.minStock")}`}>
                {row.original.stockQuantity} <span className="text-xs text-muted-foreground font-normal">{t("products.currentStock")}</span>
              </span>
              <div className="text-xs text-muted-foreground">/ {row.original.minStock} {t("products.minStock")}</div>
              {isLowStock ? <Badge variant="destructive" className="mt-1 block w-fit text-[10px] px-1 py-0">{t("products.lowShort")}</Badge> : null}
            </div>
          );
        },
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      }),
      columnHelper.accessor("status", {
        id: "status",
        size: 92,
        header: t("common.status"),
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
        meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
      })
    );

    if (isAdmin) {
      cols.push(
        columnHelper.display({
          id: "actions",
          size: 108,
          header: () => <span className="whitespace-nowrap">{t("common.actions")}</span>,
          cell: ({ row }) => (
            <ProductActionMenu
              label={t("common.actions")}
              items={[
                { label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(row.original) },
                { label: t("products.viewBarcode"), icon: <Barcode className="h-4 w-4" />, onClick: () => setSelectedQrProduct(row.original) },
                row.original.status === "ACTIVE"
                  ? { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(row.original), variant: "destructive" }
                  : { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(row.original) },
              ]}
            />
          ),
          meta: { headerClassName: "min-w-[100px] whitespace-nowrap px-3 text-right", cellClassName: "min-w-[100px] px-3 pr-4 text-right" },
        })
      );
    }

    return cols;
  }, [t, rowSelection, isAdmin]);

  const headerActions = isAdmin ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" onClick={openCreateForm}>
        <Plus className="h-4 w-4" />
        {t("common.addNew")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" className="h-10 gap-2"><Upload className="h-4 w-4" />{t("products.importExport")}</Button></DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-100 p-1 shadow-lg rounded-lg">
            <DropdownMenuItem onClick={() => setIsImportGuideOpen(true)} disabled={isBulkLoading} className="gap-2 cursor-pointer"><FileUp className="h-4 w-4" />{t("products.importJsonCsv")}</DropdownMenuItem>
            <DropdownMenuItem onClick={handleBulkDemoImport} disabled={isBulkLoading} className="gap-2 cursor-pointer"><Database className="h-4 w-4" />{t("products.importDemoData")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" className="h-10 gap-2"><SlidersHorizontal className="h-4 w-4" />{t("products.otherActions")}</Button></DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-100 p-1 shadow-lg rounded-lg">
            <DropdownMenuItem onClick={handleRestoreLastDeletedBatch} disabled={isBulkLoading} className="gap-2 cursor-pointer"><RotateCcw className="h-4 w-4" />{lastDeletedProductIds.length > 0 ? t("products.restoreProductsCount", { count: lastDeletedProductIds.length }) : t("products.restoreProducts")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsDeleteAllDialogOpen(true)} disabled={isBulkLoading} className="text-destructive hover:text-destructive gap-2 cursor-pointer"><Trash2 className="h-4 w-4" />{t("products.deleteAllProducts")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    </div>
  ) : null;
  const table = useReactTable({
    data: items,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="w-full min-w-0 space-y-6 overflow-visible">
      <PageHeader title={t("products.title")} description={t("products.description")}>{headerActions}</PageHeader>

      {!isAdmin ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 shadow-sm">
          <div className="flex items-center gap-2 font-semibold">
            <LockKeyhole className="h-4 w-4" />
            {t("products.cashierReadOnlyTitle")}
          </div>
          <p className="mt-1">{t("products.cashierReadOnlyDescription")}</p>
        </div>
      ) : null}

      <ErrorState message={errorMessage} />
      {successMessage ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{successMessage}</div> : null}
      {toastMessage ? <div className="fixed right-5 top-5 z-[60] rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-xl">{toastMessage}</div> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase">{t("products.totalProducts")}</p>
            <p className="text-2xl font-black text-slate-900">{formatNumber(pagination?.totalItems || items.length)}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.totalProductsDesc")}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase">{t("products.activeProducts")}</p>
            <p className="text-2xl font-black text-emerald-600">{formatNumber(items.filter(i => i.status === 'ACTIVE').length)}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.activeProductsDesc")}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase">{t("products.inactiveProducts")}</p>
            <p className="text-2xl font-black text-slate-500">{formatNumber(items.filter(i => i.status === 'INACTIVE').length)}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.inactiveProductsDesc")}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase">{t("products.lowStock")}</p>
            <p className="text-2xl font-black text-amber-600">{formatNumber(items.filter(i => i.stockQuantity <= i.minStock).length)}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{t("stats.lowStockDesc")}</p>
          </div>
        </div>
      </div>

      {/* Filter toolbar and grouped product actions */}
      <Card className="w-full min-w-0">
        <CardContent className="space-y-4 pt-6">
          <form onSubmit={handleSearchSubmit} className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_160px_180px_180px_auto_auto] lg:items-center">
            <Input className="h-10" placeholder={t("products.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select className="h-10" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="ACTIVE">{t("status.ACTIVE")}</option>
              <option value="INACTIVE">{t("status.INACTIVE")}</option>
              <option value="">{t("common.all")}</option>
            </Select>
            <Select className="h-10" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}>
              <option value="">{t("common.allCategories")}</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <Select className="h-10" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPage(1); }}>
              <option value="">{t("products.supplierShort")}: {t("common.all")}</option>
              {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <label className="flex h-10 min-w-fit items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
              <input type="checkbox" checked={lowStock} onChange={(event) => { setLowStock(event.target.checked); setPage(1); }} />
              <span>{t("products.lowStockOnly")}</span>
            </label>
            <Button type="submit" className="h-10 w-full lg:w-auto">{t("common.search")}</Button>
          </form>

          {isAdmin ? <input ref={importFileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={handleFileImport} /> : null}

          {isAdmin && selectedCount > 0 ? (
            <div className="flex flex-wrap items-center justify-start gap-2">
              <Button type="button" variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isBulkLoading}>
                <CheckSquare className="h-4 w-4" />
                {t("products.deleteSelected", { count: selectedCount })}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Create/update form */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? t("products.updateTitle") : t("products.createTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("products.autoSku")}</Label>
                <Input value={editingItem ? form.watch("sku") || "" : ""} placeholder={t("products.autoSkuPlaceholder")} disabled readOnly />
                <p className="text-xs text-muted-foreground">{t("products.autoSkuHint")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("products.name")}</Label>
                <Input placeholder={t("products.namePlaceholder")} {...form.register("name")} />
                {form.formState.errors.name ? <p className="text-sm text-destructive">{form.formState.errors.name.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.category")}</Label>
                <Select {...form.register("categoryId")}>
                  <option value={0}>{t("common.chooseCategory")}</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                {form.formState.errors.categoryId ? <p className="text-sm text-destructive">{form.formState.errors.categoryId.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.supplier")}</Label>
                <Select {...form.register("supplierId")}>
                  <option value={0}>{t("common.chooseSupplier")}</option>
                  {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                {form.formState.errors.supplierId ? <p className="text-sm text-destructive">{form.formState.errors.supplierId.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.costPrice")}</Label>
                <Input inputMode="numeric" placeholder="5.000" value={formatMoneyInputValue(costPriceInput)} onChange={(event) => setMoneyFormField("costPrice", event.target.value)} />
                {form.formState.errors.costPrice ? <p className="text-sm text-destructive">{form.formState.errors.costPrice.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.salePrice")}</Label>
                <Input inputMode="numeric" placeholder="7.500" value={formatMoneyInputValue(salePriceInput)} onChange={(event) => setMoneyFormField("salePrice", event.target.value)} />
                {form.formState.errors.salePrice ? <p className="text-sm text-destructive">{form.formState.errors.salePrice.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.originalPrice")}</Label>
                <Input inputMode="numeric" placeholder="9.500" value={formatMoneyInputValue(originalPriceInput)} onChange={(event) => setMoneyFormField("originalPrice", event.target.value)} />
              </div>
              <div className="space-y-2"><Label>{t("products.stockQuantity")}</Label><Input type="number" placeholder="30" {...form.register("stockQuantity")} /></div>
              <div className="space-y-2"><Label>{t("products.minStock")}</Label><Input type="number" placeholder="5" {...form.register("minStock")} /></div>
              <div className="space-y-2"><Label>{t("products.warrantyMonths")}</Label><Input type="number" placeholder="12" {...form.register("warrantyMonths")} /></div>
              <div className="space-y-2"><Label>{t("products.qrCode")}</Label><Input {...form.register("qrCode")} placeholder={t("products.qrPlaceholder")} /></div>
              <div className="space-y-2 md:col-span-2 xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">{t("barcode.fieldLabel")}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openRemoteBarcodeScanner}
                      className="rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5 transition-colors h-7 whitespace-nowrap"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      {t("barcode.remoteScannerShort")}
                    </button>
                    <button
                      type="button"
                      disabled={isEnriching}
                      onClick={handleAiEnrich}
                      className="rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5 transition-colors h-7 whitespace-nowrap"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {isEnriching ? t("barcode.enriching") : t("barcode.lookupAi")}
                    </button>
                  </div>
                </div>
                <Input
                  placeholder={t("barcode.fieldPlaceholder")}
                  {...form.register("barcode", {
                    onBlur: (event) => void enrichBarcode(event.target.value),
                  })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void enrichBarcode(event.currentTarget.value);
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {isEnriching ? <span>{t("barcode.lookupInProgress")}</span> : null}
                  {barcodeEnrichSource ? <Badge variant="outline">{t("barcode.source", { source: barcodeEnrichSource === "HYBRID" ? "Hybrid" : barcodeEnrichSource })}</Badge> : null}
                  {barcodeEnrichMissingFields.length > 0 ? <span>{t("barcode.missingFields", { fields: barcodeEnrichMissingFields.join(", ") })}</span> : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("common.status")}</Label>
                <Select {...form.register("status")}>
                  <option value="ACTIVE">{t("status.ACTIVE")}</option>
                  <option value="INACTIVE">{t("status.INACTIVE")}</option>
                </Select>
              </div>
              <div className="space-y-3 md:col-span-2 xl:col-span-3">
                <Label>{t("products.imageUrl")}</Label>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    {...form.register("imageUrl")}
                    placeholder={t("products.imageUrlPlaceholder")}
                  />
                  <Button type="button" variant="outline" onClick={() => productImageFileRef.current?.click()}>
                    <ImageIcon className="h-4 w-4" />
                    {t("products.uploadImage")}
                  </Button>
                </div>
                <input
                  ref={productImageFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProductImageFileChange}
                />
                <p className="text-xs text-muted-foreground">{t("products.imageHelp")}</p>
                {currentImageUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                    <div className="h-16 w-16 overflow-hidden rounded-md border bg-background">
                      <img src={currentImageUrl} alt={t("products.imagePreview")} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{t("products.imagePreview")}</p>
                      <p className="break-words whitespace-normal line-clamp-2 text-muted-foreground">{currentImageUrl}</p>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-3">
                <Label>{t("products.descriptionField")}</Label>
                <Textarea {...form.register("description")} placeholder={t("products.descriptionPlaceholder")} />
                {form.formState.errors.description ? <p className="text-sm text-destructive">{form.formState.errors.description.message}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
                <Button type="submit" disabled={form.formState.isSubmitting}>{editingItem ? t("common.saveChanges") : t("common.createNew")}</Button>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>{t("common.cancel")}</Button>
              </div>
            </form>
        </DialogContent>
      </Dialog>

      {/* Product TanStack Data Table */}
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
        <CardContent className="p-0">
          <TanStackDataTable
            table={table}
            isLoading={isLoading}
            className="rounded-none border-0 shadow-none"
            tableClassName="w-full table-fixed"
          />
        </CardContent>
      </Card>
      <PaginationControls pagination={pagination} onPageChange={setPage} />

      {/* Import guide dialog */}
      <Dialog open={isImportGuideOpen} onOpenChange={setIsImportGuideOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("products.importGuideTitle")}</DialogTitle>
            <DialogDescription>{t("products.importGuideDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">{t("products.importImageGuideTitle")}</p>
              <p>{t("products.importImageGuideDescription")}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("products.jsonExample")}</p>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-4 text-xs leading-relaxed"><code>{jsonStructureExample}</code></pre>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("products.csvExample")}</p>
              <pre className="max-h-40 overflow-auto rounded-lg border bg-muted/50 p-4 text-xs leading-relaxed"><code>{csvStructureExample}</code></pre>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={copyImportStructure}>
                <Clipboard className="h-4 w-4" />
                {t("products.copyStructure")}
              </Button>
              <Button type="button" onClick={proceedFileUpload}>
                <Upload className="h-4 w-4" />
                {t("products.proceedUpload")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete all confirmation dialog */}
      <Dialog open={isDeleteAllDialogOpen} onOpenChange={setIsDeleteAllDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t("products.deleteAllConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("products.deleteAllConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>{deleteAllMode === "soft" ? t("products.softDeleteAllWarning") : t("products.hardDeleteAllWarning")}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("products.deleteMode")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                  <input type="radio" name="deleteAllMode" value="soft" checked={deleteAllMode === "soft"} onChange={() => setDeleteAllMode("soft")} />
                  <span><span className="block font-semibold">{t("products.softDelete")}</span><span className="text-xs text-muted-foreground">{t("products.softDeleteHint")}</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <input type="radio" name="deleteAllMode" value="hard" checked={deleteAllMode === "hard"} onChange={() => setDeleteAllMode("hard")} />
                  <span><span className="block font-semibold">{t("products.hardDelete")}</span><span className="text-xs opacity-80">{t("products.hardDeleteHint")}</span></span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("products.deleteAllPasswordLabel")}</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9"
                  placeholder={t("products.deleteAllPasswordPlaceholder")}
                  value={deleteAllPassword}
                  onChange={(event) => setDeleteAllPassword(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("products.deleteAllPasswordHint")}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setIsDeleteAllDialogOpen(false); setDeleteAllPassword(""); setDeleteAllMode("soft"); }}>{t("products.cancelDanger")}</Button>
              <Button type="button" variant="destructive" disabled={isBulkLoading} onClick={handleDeleteAllProducts}>
                <Trash2 className="h-4 w-4" />
                {isBulkLoading ? t("products.deleting") : deleteAllMode === "soft" ? t("products.softDeleteAll") : t("products.hardDeleteAll")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Remote barcode scanner dialog */}
      <Dialog open={remoteBarcodeOpen} onOpenChange={setRemoteBarcodeOpen}>
        <DialogContent className="max-w-xl bg-slate-900 border-slate-800 text-white rounded-3xl p-5 shadow-2xl">
          <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400 border border-emerald-500/20 shrink-0">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-extrabold uppercase tracking-wide text-white">
                  {t("products.scanBarcodeTitle")}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {t("products.scanBarcodeDescription")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-5 items-center py-2">
            {/* Cột trái: Mã QR & Sao chép link */}
            <div className="flex flex-col items-center gap-2.5">
              <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-800/20 shrink-0">
                {remoteBarcodeScanUrl ? <QRCodeSVG value={remoteBarcodeScanUrl} size={145} level="M" /> : null}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={copyRemoteBarcodeScanLink}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl h-8 px-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                {isBarcodeLinkCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">{t("common.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t("barcode.copyScanLink")}</span>
                  </>
                )}
              </Button>
            </div>

            {/* Cột phải: Mã ghép đôi & Hướng dẫn & Trạng thái */}
            <div className="flex flex-col justify-between gap-2.5">
              {/* Mã ghép đôi */}
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    {t("barcode.pairingCode")}
                  </span>
                  <span className="text-xl font-black text-emerald-400 tracking-[0.2em] font-mono select-all">
                    {remoteBarcodeSessionId}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetRemoteBarcodeScanner}
                  className="h-7 px-2.5 rounded-lg border-slate-700 bg-slate-800 text-[11px] text-white hover:bg-slate-700 shrink-0"
                  title={t("pos.newPairingCode")}
                >
                  {t("barcode.newPairingCode")}
                </Button>
              </div>

              {/* Hướng dẫn ngắn gọn */}
              <div className="text-[11px] text-slate-400 leading-tight space-y-1 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                <p className="flex items-start gap-1">
                  <span className="font-bold text-emerald-400">1.</span>
                  <span>{t("barcode.remoteInstruction1")}</span>
                </p>
                <p className="flex items-start gap-1">
                  <span className="font-bold text-emerald-400">2.</span>
                  <span>{t("barcode.remoteInstruction2")}</span>
                </p>
              </div>

              {/* Trạng thái real-time */}
              <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-semibold text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-400/80 animate-pulse shrink-0" />
                <span>{t("pos.phoneWaiting")}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Barcode preview dialog */}
      <Dialog open={Boolean(selectedQrProduct)} onOpenChange={(open) => !open && setSelectedQrProduct(null)}>
        <DialogContent className="max-w-md">
          {selectedQrProduct ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Barcode className="h-5 w-5" />{t("products.barcodeDialogTitle")}</DialogTitle>
                <DialogDescription>{t("products.barcodeDialogDescription")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 text-center">
                <div id="homex-product-qr-print-area" className="rounded-xl border bg-white p-5 w-full flex justify-center">
                  <BarcodeRenderer value={selectedQrProduct.barcode || selectedQrProduct.sku} />
                </div>
                <div>
                  <p className="font-bold">{selectedQrProduct.sku}</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">{selectedQrProduct.name}</p>
                </div>
                <Button type="button" onClick={() => printQrCode(selectedQrProduct)}>
                  <Printer className="h-4 w-4" />
                  {t("products.printBarcode")}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}




























