import type { UserRole } from "@/types/auth";

export type RecordStatus = "ACTIVE" | "INACTIVE";
export type OrderStatus = "DRAFT" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "WALLET";
export type PaymentStatus = "PAID" | "PENDING" | "FAILED" | "REFUNDED";
export type StockTransactionType = "IMPORT" | "SALE" | "ADJUSTMENT" | "RESTORE";
export type WarrantyStatus = "ACTIVE" | "EXPIRED" | "CANCELLED";
export type UserStatus = "ACTIVE" | "INACTIVE";

export type Category = {
  id: number;
  name: string;
  description: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  email?: string | null;
  address: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  categoryId: number;
  supplierId: number;
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  minStock: number;
  warrantyMonths: number;
  qrCode: string | null;
  imageUrl: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
  category?: Pick<Category, "id" | "name">;
  supplier?: Pick<Supplier, "id" | "name" | "phone">;
};

export type Customer = {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  address: string | null;
  points: number;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type OrderDetail = {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  status: RecordStatus;
  createdAt?: string;
  updatedAt?: string;
  product?: Product;
  warranty?: Warranty | null;
};

export type Payment = {
  id: number;
  orderId: number;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  order?: Order;
};

export type Order = {
  id: number;
  orderCode: string;
  userId: number;
  customerId: number | null;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: number;
    fullName: string;
    email: string;
  };
  customer?: Customer | null;
  orderDetails: OrderDetail[];
  payment?: Payment | null;
};

export type StockTransaction = {
  id: number;
  productId: number;
  userId: number;
  orderId: number | null;
  type: StockTransactionType;
  quantity: number;
  note: string | null;
  createdAt: string;
  product?: Pick<Product, "id" | "sku" | "name" | "stockQuantity" | "minStock">;
  user?: {
    id: number;
    fullName: string;
    email: string;
  };
  order?: Pick<Order, "id" | "orderCode" | "status"> | null;
};

export type Warranty = {
  id: number;
  warrantyCode: string;
  orderDetailId: number;
  customerId: number;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
  createdAt: string;
  updatedAt?: string;
  customer?: Customer;
  orderDetail?: OrderDetail & {
    order?: Order;
  };
};

export type UserAccount = {
  id: number;
  fullName: string;
  email: string;
  roleId: number;
  role: {
    id: number;
    name: UserRole;
    description?: string | null;
  };
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: number;
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  description: string | null;
  createdAt: string;
  user?: {
    id: number;
    fullName: string;
    email: string;
  };
};

export type ReportSummary = {
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  paidPayments: number;
  refundedPayments: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  draftOrders: number;
  totalCustomers: number;
  activeProducts: number;
  lowStockProducts: number;
  activeWarranties: number;
};

export type RevenueReportItem = {
  period: string;
  revenue: number;
  paymentCount: number;
};

export type TopProductReportItem = {
  productId: number;
  product: Product | null;
  totalQuantity: number;
  totalRevenue: number;
};

export type TopCustomerReportItem = {
  customerId: number | null;
  customer: Customer | null;
  totalOrders: number;
  totalSpent: number;
};

export type CustomerReportItem = Customer & {
  totalOrders: number;
  totalSpent: number;
  latestOrder: Pick<Order, "id" | "orderCode" | "totalAmount" | "createdAt"> | null;
};
