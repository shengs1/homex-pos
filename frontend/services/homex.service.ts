import { api } from "@/lib/api";
import type { ApiSuccess, PaginatedData } from "@/types/api";
import type {
  AuditLog,
  Category,
  Customer,
  CustomerReportItem,
  Order,
  Payment,
  Product,
  ProfitReportItem,
  PublicInvoice,
  PurchaseOrder,
  ReturnOrder,
  ReportSummary,
  RevenueReportItem,
  Setting,
  Shift,
  StockTransaction,
  Supplier,
  TopCustomerReportItem,
  TopProductReportItem,
  UserAccount,
  VatInvoiceRequest,
  Warranty,
  NotificationItem,
} from "@/types/domain";

export type ListParams = Record<string, string | number | boolean | undefined | null>;

function cleanParams(params?: ListParams) {
  const result: Record<string, string | number | boolean> = {};

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  });

  return result;
}

async function getData<T>(url: string, params?: ListParams) {
  const response = await api.get<ApiSuccess<T>>(url, { params: cleanParams(params) });
  return response.data.data;
}

async function postData<T>(url: string, body?: unknown) {
  const response = await api.post<ApiSuccess<T>>(url, body || {});
  return response.data.data;
}

async function putData<T>(url: string, body?: unknown) {
  const response = await api.put<ApiSuccess<T>>(url, body || {});
  return response.data.data;
}

async function patchData<T>(url: string, body?: unknown) {
  const response = await api.patch<ApiSuccess<T>>(url, body || {});
  return response.data.data;
}

async function deleteData<T>(url: string, config?: { data?: any }) {
  const response = await api.delete<ApiSuccess<T>>(url, config);
  return response.data.data;
}

function sortItemsByIdAsc<T extends { id: number }>(items: T[]) {
  return [...items].sort((a, b) => a.id - b.id);
}

async function getPaginatedDataByIdAsc<T extends { id: number }>(url: string, params?: ListParams) {
  const requestedPage = Number(params?.page || 1);
  const requestedLimit = Number(params?.limit || 10);
  const backendMaxLimit = 100;
  const baseParams = { ...cleanParams(params), page: 1, limit: backendMaxLimit };

  const firstPage = await getData<PaginatedData<T>>(url, baseParams);
  const totalItems = firstPage.pagination.totalItems;
  const totalBackendPages = Math.max(1, Math.ceil(totalItems / backendMaxLimit));
  let allItems = [...firstPage.items];

  if (totalBackendPages > 1) {
    const restPages = await Promise.all(
      Array.from({ length: totalBackendPages - 1 }, (_, index) => {
        return getData<PaginatedData<T>>(url, { ...baseParams, page: index + 2 });
      })
    );
    allItems = allItems.concat(restPages.flatMap((pageData) => pageData.items));
  }

  const sortedItems = sortItemsByIdAsc(allItems);
  const startIndex = (requestedPage - 1) * requestedLimit;
  const pageItems = sortedItems.slice(startIndex, startIndex + requestedLimit);
  const totalPages = Math.max(1, Math.ceil(totalItems / requestedLimit));

  return {
    items: pageItems,
    pagination: {
      page: requestedPage,
      limit: requestedLimit,
      totalItems,
      totalPages,
    },
    summary: firstPage.summary,
  };
}

export type CategoryPayload = { name: string; description?: string };

export const categoryService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Category>("/categories", params),
  detail: (id: number) => getData<Category>(`/categories/${id}`),
  create: (body: CategoryPayload) => postData<Category>("/categories", body),
  update: (id: number, body: CategoryPayload) => putData<Category>(`/categories/${id}`, body),
  remove: (id: number) => deleteData<Category>(`/categories/${id}`),
  restore: (id: number) => patchData<Category>(`/categories/${id}/restore`),
};

export type SupplierPayload = { name: string; phone: string; email?: string; address?: string };

export const supplierService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Supplier>("/suppliers", params),
  detail: (id: number) => getData<Supplier>(`/suppliers/${id}`),
  create: (body: SupplierPayload) => postData<Supplier>("/suppliers", body),
  update: (id: number, body: SupplierPayload) => putData<Supplier>(`/suppliers/${id}`, body),
  remove: (id: number) => deleteData<Supplier>(`/suppliers/${id}`),
  restore: (id: number) => patchData<Supplier>(`/suppliers/${id}/restore`),
};

export type ProductPayload = {
  sku?: string;
  name: string;
  description?: string;
  categoryId: number;
  supplierId: number;
  costPrice: number;
  salePrice: number;
  originalPrice?: number | null;
  stockQuantity?: number;
  minStock?: number;
  warrantyMonths?: number;
  qrCode?: string;
  imageUrl?: string;
  barcode?: string;
};

export const productService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Product>("/products", params),
  detail: (id: number) => getData<Product>(`/products/${id}`),
  findByBarcode: (code: string) => getData<Product>(`/products/barcode/${encodeURIComponent(code)}`),
  getProductByBarcode: (code: string) => getData<Product>(`/products/barcode/${encodeURIComponent(code)}`),
  enrichProductByBarcode: (code: string) => postData<{
    barcode: string;
    name?: string;
    category?: string;
    brand?: string;
    supplierName?: string;
    unit?: string;
    estimatedImportPrice?: number;
    estimatedSalePrice?: number;
    originalPrice?: number;
    stockQuantity?: number;
    minStock?: number;
    warrantyMonths?: number;
    imageUrl?: string;
    description?: string;
    source: "DATABASE" | "UPCITEMDB" | "BARCODE_SPIDER" | "BARCODE_LOOKUP" | "OPEN_FOOD_FACTS" | "OPEN_PRODUCTS_FACTS" | "ICHECK" | "AI" | "HYBRID";
    missingFields?: string[];
    confidence?: number;
    existingProductId?: number;
  }>("/products/enrich", { barcode: code }),
  create: (body: ProductPayload) => postData<Product>("/products", body),
  update: (id: number, body: ProductPayload) => putData<Product>(`/products/${id}`, body),
  remove: (id: number) => deleteData<Product>(`/products/${id}`),
  hardRemove: (id: number, body: { adminPassword: string }) => deleteData<{ id: number }>(`/products/${id}/hard`, { data: body }),
  restore: (id: number) => patchData<Product>(`/products/${id}/restore`),
};

export type CustomerPayload = { fullName: string; phone: string; email?: string; address?: string };

export const customerService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Customer>("/customers", params),
  detail: (id: number) => getData<Customer>(`/customers/${id}`),
  create: (body: CustomerPayload) => postData<Customer>("/customers", body),
  update: (id: number, body: CustomerPayload) => putData<Customer>(`/customers/${id}`, body),
  remove: (id: number) => deleteData<Customer>(`/customers/${id}`),
  restore: (id: number) => patchData<Customer>(`/customers/${id}/restore`),
};

export const inventoryService = {
  lowStock: (params?: ListParams) => getPaginatedDataByIdAsc<Product>("/inventory/low-stock", params),
  transactions: (params?: ListParams) => getPaginatedDataByIdAsc<StockTransaction>("/inventory/transactions", params),
  importStock: (body: { productId: number; quantity: number; note?: string }) => postData<StockTransaction>("/inventory/import", body),
  adjustStock: (body: { productId: number; newQuantity: number; note?: string }) => postData<StockTransaction>("/inventory/adjust", body),
};

export type OrderLinePayload = { productId: number; quantity: number };

export type DraftOrderPayload = {
  customerId?: number;
  discountAmount?: number;
  promotionCode?: string;
  items: OrderLinePayload[];
};

export type CheckoutOrderPayload = {
  paymentMethod: string;
  cashReceived?: number;
  discountAmount?: number;
  promotionCode?: string;
};

export const orderService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Order>("/orders", params),
  detail: (id: number) => getData<Order>(`/orders/${id}`),
  getByCode: (orderCode: string) => getData<Order>(`/orders/code/${encodeURIComponent(orderCode)}`),
  createDraft: (body: DraftOrderPayload) => postData<Order>("/orders/draft", body),
  updateDraft: (id: number, body: DraftOrderPayload) => putData<Order>(`/orders/${id}/draft`, body),
  checkout: (id: number, body: CheckoutOrderPayload) => patchData<Order>(`/orders/${id}/checkout`, body),
  cancel: (id: number) => patchData<Order>(`/orders/${id}/cancel`),
};

export type SettingPayload = Omit<Setting, "id" | "createdAt" | "updatedAt">;

export const settingService = {
  get: () => getData<Setting>("/settings"),
  update: (body: SettingPayload) => putData<Setting>("/settings", body),
};

export const publicInvoiceService = {
  detail: (orderCode: string) => getData<PublicInvoice>(`/invoices/public/${encodeURIComponent(orderCode)}`),
  requestVat: (
    orderCode: string,
    body: {
      companyName: string;
      taxCode: string;
      companyAddress: string;
      buyerEmail?: string;
      note?: string;
    }
  ) => postData<VatInvoiceRequest>(`/invoices/public/${encodeURIComponent(orderCode)}/vat-request`, body),
};

export const vatInvoiceService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<VatInvoiceRequest>("/vat-invoices", params),
  approve: (id: number, body: { redInvoiceCode: string; adminNote?: string }) => patchData<VatInvoiceRequest>(`/vat-invoices/${id}/approve`, body),
  reject: (id: number, body: { adminNote?: string }) => patchData<VatInvoiceRequest>(`/vat-invoices/${id}/reject`, body),
  taxLookup: (taxCode: string) => getData<{ taxCode: string; companyName: string; companyAddress: string; source: string }>(`/vat-invoices/tax-lookup?taxCode=${encodeURIComponent(taxCode)}`),
  create: (body: { orderCode: string; companyName: string; taxCode: string; companyAddress?: string; buyerEmail?: string; note?: string }) => postData<VatInvoiceRequest>("/vat-invoices", body),
  resendEmail: (id: number) => postData<{ success: boolean; message: string }>(`/vat-invoices/${id}/resend-email`, {}),
  adjust: (id: number, body: {
    companyName?: string;
    taxCode?: string;
    companyAddress?: string;
    buyerEmail?: string | null;
    note?: string | null;
    redInvoiceCode?: string | null;
    adminNote?: string | null;
    status?: "PENDING" | "APPROVED" | "REJECTED";
  }) => putData<VatInvoiceRequest>(`/vat-invoices/${id}/adjust`, body),
  delete: (id: number) => deleteData<{ success: boolean; message: string }>(`/vat-invoices/${id}`),
};

export const shiftService = {
  current: () => getData<Shift | null>("/shifts/current"),
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Shift>("/shifts", params),
  open: (body: { openingCash: number; shiftType: "MORNING" | "EVENING"; userId?: number; note?: string }) => postData<Shift>("/shifts/open", body),
  close: (id: number, body: { closingCash: number; note?: string }) => patchData<Shift>(`/shifts/${id}/close`, body),
};

export const purchaseOrderService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<PurchaseOrder>("/purchase-orders", params),
  create: (body: { supplierId: number; note?: string; items: { productId: number; quantity: number; unitCost: number }[] }) =>
    postData<PurchaseOrder>("/purchase-orders", body),
};

export const returnOrderService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<ReturnOrder>("/return-orders", params),
  create: (body: { orderId: number; reason?: string; items: { orderDetailId: number; quantity: number }[] }) => postData<ReturnOrder>("/return-orders", body),
};

export const notificationService = {
  list: (params?: ListParams) => getData<{ items: NotificationItem[]; unreadCount: number; pagination: PaginatedData<NotificationItem>["pagination"] }>("/notifications", params),
  markRead: (id: number) => patchData<NotificationItem>(`/notifications/${id}/read`),
  markAllRead: () => patchData<{ count: number }>("/notifications/read-all"),
  delete: (id: number) => deleteData<{ success: boolean }>(`/notifications/${id}`),
  deleteRead: () => deleteData<{ count: number }>("/notifications?read=true"),
};

export const warrantyService = {
  stats: () => getData<{ total: number; active: number; expiringSoon: number; expired: number }>("/warranties/stats"),
  lookupOrder: (code: string) => getData<any>(`/warranties/lookup-order?code=${encodeURIComponent(code)}`),
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Warranty>("/warranties", params),
  detail: (id: number) => getData<Warranty>(`/warranties/${id}`),
  lookup: (code: string) => getData<Warranty>(`/warranties/code/${encodeURIComponent(code)}`),
  create: (body: { orderDetailId: number; startDate?: string }) => postData<Warranty>("/warranties", body),
  cancel: (id: number) => patchData<Warranty>(`/warranties/${id}/cancel`),
  restore: (id: number) => patchData<Warranty>(`/warranties/${id}/restore`),
  expire: (id: number) => patchData<Warranty>(`/warranties/${id}/expire`),
  claim: (id: number, note?: string) => patchData<Warranty>(`/warranties/${id}/claim`, { note }),
  complete: (id: number, note?: string) => patchData<Warranty>(`/warranties/${id}/complete`, { note }),
  reject: (id: number, note?: string) => patchData<Warranty>(`/warranties/${id}/reject`, { note }),
  updateNote: (id: number, note: string) => patchData<Warranty>(`/warranties/${id}/note`, { note }),
};

export const paymentService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Payment>("/payments", params),
  detail: (id: number) => getData<Payment>(`/payments/${id}`),
  byOrder: (orderId: number) => getData<Payment>(`/payments/order/${orderId}`),
  refund: (id: number) => patchData<Payment>(`/payments/${id}/refund`),
};

export const reportService = {
  summary: (params?: ListParams) => getData<ReportSummary>("/reports/summary", params),
  revenue: (params?: ListParams) => getData<{ groupBy: "day" | "month"; items: RevenueReportItem[] }>("/reports/revenue", params),
  profit: (params?: ListParams) => getData<{ groupBy: "day" | "month"; items: ProfitReportItem[] }>("/reports/profit", params),
  topProducts: (params?: ListParams) => getData<{ items: TopProductReportItem[] }>("/reports/top-products", params),
  topCustomers: (params?: ListParams) => getData<{ items: TopCustomerReportItem[] }>("/reports/top-customers", params),
  lowStock: (params?: ListParams) => getData<{ items: Product[] }>("/reports/low-stock", params),
  customers: (params?: ListParams) => getData<{ items: CustomerReportItem[] }>("/reports/customers", params),
};

export type UserPayload = {
  employeeCode?: string;
  fullName: string;
  email?: string;
  phone?: string;
  password?: string;
  role: "ADMIN" | "CASHIER";
  status?: "ACTIVE" | "INACTIVE";
};

export const userService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<UserAccount>("/users", params),
  detail: (id: number) => getData<UserAccount>(`/users/${id}`),
  create: (body: Pick<UserPayload, "employeeCode" | "fullName" | "email" | "phone" | "role"> & { password: string }) => postData<UserAccount>("/users", body),
  update: (id: number, body: Pick<UserPayload, "employeeCode" | "fullName" | "email" | "phone" | "role"> & { status: "ACTIVE" | "INACTIVE", adminPassword?: string }) => putData<UserAccount>(`/users/${id}`, body),
  changePassword: (id: number, body: { newPassword: string; adminPassword?: string }) => patchData<UserAccount>(`/users/${id}/change-password`, body),
  lock: (id: number, body: { adminPassword?: string }) => patchData<UserAccount>(`/users/${id}/lock`, body),
  remove: (id: number, body: { adminPassword?: string }) => deleteData<UserAccount>(`/users/${id}`, { data: body }),
  restore: (id: number) => patchData<UserAccount>(`/users/${id}/restore`),
  verifyPassword: (body: { adminPassword?: string }) => postData<{ success: boolean }>("/users/verify-password", body),
};

export const auditLogService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<AuditLog>("/audit-logs", params),
  detail: (id: number) => getData<AuditLog>(`/audit-logs/${id}`),
};

export const posService = {
  sendRemoteScan: (body: { sessionId: string; barcode: string }) => postData<{ success: boolean; message: string }>("/pos/remote-scan", body),
  pollRemoteScan: (sessionId: string) => getData<{ success: boolean; barcode?: string }>(`/pos/remote-scan-poll/${encodeURIComponent(sessionId)}`),
};







