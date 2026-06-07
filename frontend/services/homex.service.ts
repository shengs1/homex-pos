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
  ReportSummary,
  RevenueReportItem,
  StockTransaction,
  Supplier,
  TopCustomerReportItem,
  TopProductReportItem,
  UserAccount,
  Warranty,
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

async function deleteData<T>(url: string) {
  const response = await api.delete<ApiSuccess<T>>(url);
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
  sku: string;
  name: string;
  description?: string;
  categoryId: number;
  supplierId: number;
  costPrice: number;
  salePrice: number;
  stockQuantity?: number;
  minStock?: number;
  warrantyMonths?: number;
  qrCode?: string;
  imageUrl?: string;
};

export const productService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Product>("/products", params),
  detail: (id: number) => getData<Product>(`/products/${id}`),
  create: (body: ProductPayload) => postData<Product>("/products", body),
  update: (id: number, body: ProductPayload) => putData<Product>(`/products/${id}`, body),
  remove: (id: number) => deleteData<Product>(`/products/${id}`),
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

export const orderService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Order>("/orders", params),
  detail: (id: number) => getData<Order>(`/orders/${id}`),
  createDraft: (body: { customerId?: number; items: { productId: number; quantity: number }[] }) => postData<Order>("/orders/draft", body),
  updateDraft: (id: number, body: { customerId?: number; items: { productId: number; quantity: number }[] }) => putData<Order>(`/orders/${id}/draft`, body),
  checkout: (id: number, body: { paymentMethod: string }) => patchData<Order>(`/orders/${id}/checkout`, body),
  cancel: (id: number) => patchData<Order>(`/orders/${id}/cancel`),
};

export const warrantyService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<Warranty>("/warranties", params),
  detail: (id: number) => getData<Warranty>(`/warranties/${id}`),
  lookup: (code: string) => getData<Warranty>(`/warranties/code/${encodeURIComponent(code)}`),
  create: (body: { orderDetailId: number; startDate?: string }) => postData<Warranty>("/warranties", body),
  cancel: (id: number) => patchData<Warranty>(`/warranties/${id}/cancel`),
  restore: (id: number) => patchData<Warranty>(`/warranties/${id}/restore`),
  expire: (id: number) => patchData<Warranty>(`/warranties/${id}/expire`),
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
  topProducts: (params?: ListParams) => getData<{ items: TopProductReportItem[] }>("/reports/top-products", params),
  topCustomers: (params?: ListParams) => getData<{ items: TopCustomerReportItem[] }>("/reports/top-customers", params),
  lowStock: (params?: ListParams) => getData<{ items: Product[] }>("/reports/low-stock", params),
  customers: (params?: ListParams) => getData<{ items: CustomerReportItem[] }>("/reports/customers", params),
};

export type UserPayload = {
  fullName: string;
  email: string;
  password?: string;
  role: "ADMIN" | "CASHIER";
  status?: "ACTIVE" | "INACTIVE";
};

export const userService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<UserAccount>("/users", params),
  detail: (id: number) => getData<UserAccount>(`/users/${id}`),
  create: (body: Required<Pick<UserPayload, "fullName" | "email" | "password" | "role">>) => postData<UserAccount>("/users", body),
  update: (id: number, body: Required<Pick<UserPayload, "fullName" | "email" | "role" | "status">>) => putData<UserAccount>(`/users/${id}`, body),
  changePassword: (id: number, body: { newPassword: string }) => patchData<UserAccount>(`/users/${id}/change-password`, body),
  lock: (id: number) => deleteData<UserAccount>(`/users/${id}`),
  restore: (id: number) => patchData<UserAccount>(`/users/${id}/restore`),
};

export const auditLogService = {
  list: (params?: ListParams) => getPaginatedDataByIdAsc<AuditLog>("/audit-logs", params),
  detail: (id: number) => getData<AuditLog>(`/audit-logs/${id}`),
};
