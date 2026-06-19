"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type SyntheticEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createColumnHelper, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { AlertTriangle, CheckSquare, Clipboard, Database, Edit, FileUp, ImageIcon, LockKeyhole, MoreHorizontal, Plus, Printer, QrCode, RotateCcw, Trash2, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import { getApiErrorMessage } from "@/lib/api";
import { buildDemoProductPayloads, parseProductImportFileContent, resolveRealProductImageFromProductName, REAL_PRODUCT_FALLBACK_IMAGE } from "@/lib/demo-products";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { categoryService, productService, supplierService, type ProductPayload } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { Category, Product, Supplier } from "@/types/domain";

const formSchema = z.object({
  sku: z.string().trim().min(1, "SKU không được để trống").max(50),
  name: z.string().trim().min(1, "Tên sản phẩm không được để trống").max(150),
  description: z.string().trim().max(500, "Mô tả tối đa 500 ký tự").optional(),
  categoryId: z.coerce.number().int().positive("Vui lòng chọn danh mục"),
  supplierId: z.coerce.number().int().positive("Vui lòng chọn nhà cung cấp"),
  costPrice: z.coerce.number().min(0, "Giá nhập không được âm"),
  salePrice: z.coerce.number().positive("Giá bán phải lớn hơn 0"),
  originalPrice: z.coerce.number().min(0).optional(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  warrantyMonths: z.coerce.number().int().min(0).optional(),
  qrCode: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
});

type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

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
};

const jsonStructureExample = `[
  {
    "sku": "KIT-SH-NC000001",
    "name": "Nồi cơm điện 1.8L Homex NC000001",
    "categoryId": 1,
    "supplierId": 1,
    "costPrice": 520000,
    "salePrice": 750000,
    "stockQuantity": 30,
    "minStock": 5,
    "warrantyMonths": 24,
    "imageUrl": "/assets/real-products/rice-cooker.jpg",
    "imageBase64": "data:image/png;base64,..."
  }
]`;

const csvStructureExample = `sku,name,categoryId,supplierId,costPrice,salePrice,stockQuantity,minStock,warrantyMonths,imageUrl
KIT-SH-NC000001,Nồi cơm điện 1.8L Homex NC000001,1,1,520000,750000,30,5,24,/assets/real-products/rice-cooker.jpg`;

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

export default function ProductsPage() {
  const { t } = useLanguage();
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
  const [lastDeletedProductIds, setLastDeletedProductIds] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const form = useForm<FormInput, unknown, FormValues>({resolver: zodResolver(formSchema), defaultValues: emptyForm, });

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((key) => rowSelection[key]).map((key) => Number(key)), [rowSelection]);
  const selectedCount = selectedIds.length;
  const currentImageUrl = form.watch("imageUrl");

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

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    loadData(page);
  }, [page, status, categoryId, supplierId, lowStock]);

  function openCreateForm() {
    setEditingItem(null);
    form.reset(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(item: Product) {
    setEditingItem(item);
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
    });
    setIsFormOpen(true);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  async function onSubmit(values: FormValues) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      const payload = { ...values, qrCode: values.qrCode || values.sku, imageUrl: values.imageUrl || resolveRealProductImageFromProductName(values.name) };
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
    if (!window.confirm(t("products.deleteConfirm", { name: item.name }))) return;

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
    if (!window.confirm(t("products.restoreConfirm", { name: item.name }))) return;

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
      setToastMessage("Chưa có batch sản phẩm vừa xóa để khôi phục. Nút này chỉ khôi phục batch xóa tất cả gần nhất.");
      window.setTimeout(() => setToastMessage(""), 4000);
      return;
    }

    if (!window.confirm(`Khôi phục ${lastDeletedProductIds.length} sản phẩm vừa xóa gần nhất và chuyển trạng thái về ACTIVE?`)) return;

    try {
      setIsBulkLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      const result = await restoreProductIds(lastDeletedProductIds);
      clearLastDeletedProductIds();
      setStatus("ACTIVE");
      setPage(1);
      setRowSelection({});
      setSuccessMessage(`Đã khôi phục ${result.restored} sản phẩm về trạng thái ACTIVE. Lỗi: ${result.failed}.`);
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
      const results = await Promise.allSettled(batch.map((payload) => productService.create({ ...payload, qrCode: payload.qrCode || payload.sku })));
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
        setErrorMessage("Cần có ít nhất 1 danh mục ACTIVE và 1 nhà cung cấp ACTIVE trước khi nhập dữ liệu mẫu.");
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
        qrCode: payload.qrCode || payload.sku,
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

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t("products.bulkDeleteConfirm", { count: selectedIds.length }))) return;

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
      setToastMessage("Mật khẩu xác nhận không đúng. Hành động xóa tất cả đã bị hủy.");
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
        const data = await productService.list({ page: 1, limit: 100, status: "ACTIVE" });
        const targetIds = data.items.map((item) => item.id);

        if (targetIds.length === 0) {
          break;
        }

        const result = await softDeleteProducts(targetIds);
        totalDeleted += result.deleted;
        totalFailed += result.failed;
        deletedIds.push(...result.deletedIds);

        if (result.deleted === 0 && result.failed > 0) {
          break;
        }
      }

      rememberLastDeletedProductIds(deletedIds);
      setRowSelection({});
      setDeleteAllPassword("");
      setIsDeleteAllDialogOpen(false);
      setSuccessMessage(`Đã xóa mềm ${totalDeleted} sản phẩm. Lỗi: ${totalFailed}. Có thể bấm Khôi phục sản phẩm để chỉ khôi phục batch vừa xóa này.`);
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
      setToastMessage("Vui lòng chọn đúng file hình ảnh.");
      window.setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "");
      form.setValue("imageUrl", base64, { shouldDirty: true, shouldValidate: true });
      setToastMessage("Đã tải ảnh từ máy và gán vào form sản phẩm.");
      window.setTimeout(() => setToastMessage(""), 3500);
    };
    reader.onerror = () => {
      setToastMessage("Không đọc được file ảnh. Vui lòng chọn file khác.");
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

  const columns = useMemo<ColumnDef<Product>[]>(() => [
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
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
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
      cell: ({ getValue }) => <div className="truncate font-medium" title={getValue()}>{getValue()}</div>,
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
      id: "qr",
      size: 62,
      header: t("products.qrCode"),
      cell: ({ row }) => {
        const qrValue = row.original.qrCode || row.original.sku;
        return (
          <div className="text-center">
            <button type="button" className="inline-flex rounded-md border bg-white p-1 transition hover:scale-105" title={t("products.openQr")} onClick={() => setSelectedQrProduct(row.original)}>
              <QRCodeSVG value={qrValue} size={36} />
            </button>
          </div>
        );
      },
      meta: { headerClassName: "px-2 text-center whitespace-nowrap", cellClassName: "px-2 text-center" },
    }),
    columnHelper.display({
      id: "product",
      size: 230,
      header: t("products.product"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium" title={row.original.name}>{row.original.name}</div>
          <div className="truncate text-xs text-muted-foreground">{t("products.updatedAt", { date: formatDateTime(row.original.updatedAt) })}</div>
        </div>
      ),
      meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
    }),
    columnHelper.display({
      id: "category",
      size: 112,
      header: t("products.category"),
      cell: ({ row }) => <div className="truncate" title={row.original.category?.name || String(row.original.categoryId)}>{row.original.category?.name || row.original.categoryId}</div>,
      meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
    }),
    columnHelper.display({
      id: "supplier",
      size: 112,
      header: t("products.supplierShort"),
      cell: ({ row }) => <div className="truncate" title={row.original.supplier?.name || String(row.original.supplierId)}>{row.original.supplier?.name || row.original.supplierId}</div>,
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
          <div className="truncate" title={formatCurrency(salePrice)}>
            {originalPrice > salePrice ? <div className="text-xs text-muted-foreground line-through">{formatCurrency(originalPrice)}</div> : null}
            <div className="font-medium">{formatCurrency(salePrice)}</div>
          </div>
        );
      },
      meta: { headerClassName: "px-2 whitespace-nowrap", cellClassName: "px-2" },
    }),
    columnHelper.display({
      id: "stock",
      size: 78,
      header: t("products.stock"),
      cell: ({ row }) => {
        const isLowStock = row.original.stockQuantity <= row.original.minStock;
        return (
          <div>
            <span className={cn("font-semibold", isLowStock ? "text-destructive" : "text-foreground")}>{row.original.stockQuantity}/{row.original.minStock}</span>
            {isLowStock ? <Badge variant="destructive" className="mt-1 block w-fit text-[10px]">{t("products.lowShort")}</Badge> : null}
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
    }),
    columnHelper.display({
      id: "actions",
      size: 108,
      header: () => <span className="whitespace-nowrap">{t("common.actions")}</span>,
      cell: ({ row }) => (
        <ProductActionMenu
          label={t("common.actions")}
          items={[
            { label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEditForm(row.original) },
            row.original.status === "ACTIVE"
              ? { label: t("common.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(row.original), variant: "destructive" }
              : { label: t("common.restore"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(row.original) },
          ]}
        />
      ),
      meta: { headerClassName: "min-w-[100px] whitespace-nowrap px-3 text-right", cellClassName: "min-w-[100px] px-3 pr-4 text-right" },
    }),
  ], [t, rowSelection]);

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
      <PageHeader title={t("products.title")} description={t("products.description")}>
        <Button type="button" onClick={openCreateForm}>
          <Plus className="h-4 w-4" />
          {t("common.addNew")}
        </Button>
      </PageHeader>

      <ErrorState message={errorMessage} />
      {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}
      {toastMessage ? <div className="fixed right-5 top-5 z-[60] rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-xl">{toastMessage}</div> : null}

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

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex w-full flex-wrap items-center gap-2">
              <input ref={importFileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={handleFileImport} />
              <Button variant="outline" size="sm" className="h-10" onClick={() => setIsImportGuideOpen(true)} disabled={isBulkLoading}>
                <FileUp className="h-4 w-4" />
                {t("products.importFile")}
              </Button>
              <Button variant="outline" size="sm" className="h-10" onClick={handleBulkDemoImport} disabled={isBulkLoading}>
                <Database className="h-4 w-4" />
                {isBulkLoading ? t("products.bulkRunning") : t("products.bulkAdd")}
              </Button>
              <Button variant="outline" size="sm" className="h-10" onClick={handleRestoreLastDeletedBatch} disabled={isBulkLoading}>
                <RotateCcw className="h-4 w-4" />
                {lastDeletedProductIds.length > 0 ? `Khôi phục sản phẩm (${lastDeletedProductIds.length})` : "Khôi phục sản phẩm"}
              </Button>
              <Button variant="destructive" size="sm" className="h-10" onClick={() => setIsDeleteAllDialogOpen(true)} disabled={isBulkLoading}>
                <Trash2 className="h-4 w-4" />
                {t("products.deleteAll")}
              </Button>
            </div>

            {selectedCount > 0 ? (
              <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
                <Button type="button" variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isBulkLoading}>
                  <CheckSquare className="h-4 w-4" />
                  {t("products.deleteSelected", { count: selectedCount })}
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Create/update form */}
      {isFormOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>{editingItem ? t("products.updateTitle") : t("products.createTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("products.sku")}</Label>
                <Input placeholder="DGD-SH-NC18" {...form.register("sku")} />
                {form.formState.errors.sku ? <p className="text-sm text-destructive">{form.formState.errors.sku.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.name")}</Label>
                <Input placeholder="Nồi cơm điện Homex 1.8L" {...form.register("name")} />
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
                <Input type="number" placeholder="500000" {...form.register("costPrice")} />
                {form.formState.errors.costPrice ? <p className="text-sm text-destructive">{form.formState.errors.costPrice.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.salePrice")}</Label>
                <Input type="number" placeholder="750000" {...form.register("salePrice")} />
                {form.formState.errors.salePrice ? <p className="text-sm text-destructive">{form.formState.errors.salePrice.message}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t("products.originalPrice")}</Label>
                <Input type="number" placeholder="950000" {...form.register("originalPrice")} />
              </div>
              <div className="space-y-2"><Label>{t("products.stockQuantity")}</Label><Input type="number" placeholder="30" {...form.register("stockQuantity")} /></div>
              <div className="space-y-2"><Label>{t("products.minStock")}</Label><Input type="number" placeholder="5" {...form.register("minStock")} /></div>
              <div className="space-y-2"><Label>{t("products.warrantyMonths")}</Label><Input type="number" placeholder="12" {...form.register("warrantyMonths")} /></div>
              <div className="space-y-2"><Label>{t("products.qrCode")}</Label><Input {...form.register("qrCode")} placeholder={t("products.qrPlaceholder")} /></div>
              <div className="space-y-3 md:col-span-2 xl:col-span-3">
                <Label>{t("products.imageUrl")}</Label>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    {...form.register("imageUrl")}
                    placeholder="Dán URL ảnh hoặc tải ảnh từ máy tính"
                  />
                  <Button type="button" variant="outline" onClick={() => productImageFileRef.current?.click()}>
                    <ImageIcon className="h-4 w-4" />
                    Tải ảnh từ máy
                  </Button>
                </div>
                <input
                  ref={productImageFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProductImageFileChange}
                />
                <p className="text-xs text-muted-foreground">Có thể dùng link ảnh CDN hoặc chọn file ảnh từ máy. File cục bộ sẽ được chuyển sang Base64 để demo nhanh.</p>
                {currentImageUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                    <div className="h-16 w-16 overflow-hidden rounded-md border bg-background">
                      <img src={currentImageUrl} alt="Ảnh sản phẩm xem trước" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">Ảnh xem trước</p>
                      <p className="truncate text-muted-foreground">{currentImageUrl}</p>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-3">
                <Label>{t("products.descriptionField")}</Label>
                <Textarea {...form.register("description")} placeholder="Nhập mô tả ngắn về sản phẩm, công suất, dung tích, chất liệu..." />
                {form.formState.errors.description ? <p className="text-sm text-destructive">{form.formState.errors.description.message}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
                <Button type="submit" disabled={form.formState.isSubmitting}>{editingItem ? t("common.saveChanges") : t("common.createNew")}</Button>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>{t("common.cancel")}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Product TanStack Data Table */}
      <Card className="overflow-hidden">
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
              <p className="font-semibold">Hướng dẫn ảnh khi import</p>
              <p>Trường <code>imageUrl</code> nên dùng ảnh thật cố định trong project, ví dụ <code>/assets/real-products/rice-cooker.jpg</code>, hoặc chuỗi Base64 dạng <code>data:image/png;base64,...</code>. Không dùng link random online như <code>source.unsplash.com</code>. Nếu bỏ trống, hệ thống sẽ dùng ảnh fallback cục bộ.</p>
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
                <p>Hành động này sẽ xóa mềm toàn bộ sản phẩm đang hoạt động trong cơ sở dữ liệu, không bị giới hạn bởi phân trang.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nhập mật khẩu xác nhận</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9"
                  placeholder="Nhập Admin@123 để xác nhận"
                  value={deleteAllPassword}
                  onChange={(event) => setDeleteAllPassword(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">Mật khẩu demo: Admin@123</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setIsDeleteAllDialogOpen(false); setDeleteAllPassword(""); }}>{t("products.cancelDanger")}</Button>
              <Button type="button" variant="destructive" disabled={isBulkLoading} onClick={handleDeleteAllProducts}>
                <Trash2 className="h-4 w-4" />
                {isBulkLoading ? "Đang xóa..." : t("products.deleteAll")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR preview dialog */}
      <Dialog open={Boolean(selectedQrProduct)} onOpenChange={(open) => !open && setSelectedQrProduct(null)}>
        <DialogContent className="max-w-md">
          {selectedQrProduct ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" />{t("products.qrDialogTitle")}</DialogTitle>
                <DialogDescription>{t("products.qrDialogDescription")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 text-center">
                <div id="homex-product-qr-print-area" className="rounded-xl border bg-white p-5">
                  <QRCodeSVG value={selectedQrProduct.qrCode || selectedQrProduct.sku} size={220} />
                </div>
                <div>
                  <p className="font-bold">{selectedQrProduct.sku}</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">{selectedQrProduct.name}</p>
                </div>
                <Button type="button" onClick={() => printQrCode(selectedQrProduct)}>
                  <Printer className="h-4 w-4" />
                  {t("products.printQr")}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
