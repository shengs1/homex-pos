import type { UserRole } from "@/types/auth";

export type RecordStatus = "ACTIVE" | "INACTIVE";
export type OrderStatus = "DRAFT" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "WALLET";
export type PaymentStatus = "PAID" | "PENDING" | "FAILED" | "REFUNDED";
export type StockTransactionType = "IMPORT" | "SALE" | "ADJUSTMENT" | "RESTORE";
export type WarrantyStatus = "ACTIVE" | "CLAIMED" | "COMPLETED" | "REJECTED" | "EXPIRED" | "CANCELLED";
export type UserStatus = "ACTIVE" | "INACTIVE";
export type VatInvoiceStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ShiftStatus = "OPEN" | "CLOSED";

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
  taxCode?: string | null;
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
  originalPrice: number | null;
  stockQuantity: number;
  minStock: number;
  warrantyMonths: number;
  qrCode: string | null;
  barcode: string | null;
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
  tier: "NONE" | "SILVER" | "GOLD" | "DIAMOND" | string;
  totalSpent?: number;
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
  unitCost?: number | null;
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
  cashReceived: number | null;
  changeAmount: number | null;
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
  shiftId?: number | null;
  totalAmount: number;
  promotionCode?: string | null;
  discountAmount?: number | null;
  status: OrderStatus;
  earnedPoints?: number;
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
  vatInvoiceRequest?: VatInvoiceRequest | null;
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
  customerId: number | null;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
  note: string | null;
  createdAt: string;
  updatedAt?: string;
  customer?: Customer;
  orderDetail?: OrderDetail & {
    order?: Order;
    product?: Product;
  };
};

export type UserAccount = {
  id: number;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  roleId: number;
  role: {
    id: number;
    name: UserRole;
    description?: string | null;
  };
  status: UserStatus;
  lastLoginAt: string | null;
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
  productsSold: number;
};

export type RevenueReportItem = {
  period: string;
  revenue: number;
  paymentCount: number;
};

export type ProfitReportItem = {
  period: string;
  revenue: number;
  cogs: number;
  netProfit: number;
  orderCount: number;
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

export type Setting = {
  id: number;
  storeName: string;
  storeBranch: string | null;
  taxCode: string | null;
  businessHours: string | null;
  currency: string;
  storeAddress: string | null;
  storeHotline: string | null;
  printPaperSize: string;
  printCopies: number;
  autoOpenPrint: boolean;
  requireCustomerPhone: boolean;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  vietQrTemplate: string | null;
  transferContentTemplate: string | null;
  defaultPaymentMethod: string;
  productsPerPage: number;
  autoLockMinutes: number;
  allowOrderDiscount: boolean;
  confirmBeforeCheckout: boolean;
  barcodeAutoAdd: boolean;
  compactPosMode: boolean;
  minStock: number;
  warnLowStockSale: boolean;
  allowOversell: boolean;
  maxDiscount: number;
  maxEmployeesPerShift: number;
  vatEmailEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  enableBarcodeScanner: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VatInvoiceRequest = {
  id: number;
  orderId: number;
  companyName: string;
  taxCode: string;
  companyAddress: string;
  buyerEmail: string | null;
  note: string | null;
  status: VatInvoiceStatus;
  redInvoiceCode: string | null;
  adminNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedById: number | null;
  order?: Order;
};

export type ShiftType = "MORNING" | "EVENING";

export type Shift = {
  id: number;
  userId: number;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  discrepancyAmount: number | null;
  shiftType: ShiftType;
  cashRevenue?: number;
  transferRevenue?: number;
  totalRevenue?: number;
  note: string | null;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: Pick<UserAccount, "id" | "fullName" | "email">;
};

export type PurchaseOrderItem = {
  id: number;
  purchaseOrderId: number;
  productId: number;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  product?: Product;
};

export type PurchaseOrder = {
  id: number;
  code: string;
  supplierId: number;
  userId: number;
  totalAmount: number;
  note: string | null;
  status: "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  user?: Pick<UserAccount, "id" | "fullName" | "email">;
  items: PurchaseOrderItem[];
};

export type ReturnOrderItem = {
  id: number;
  returnOrderId: number;
  orderDetailId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product?: Product;
  orderDetail?: OrderDetail;
};

export type ReturnOrder = {
  id: number;
  returnCode: string;
  orderId: number;
  userId: number;
  totalAmount: number;
  reason: string | null;
  status: "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  order?: Order;
  user?: Pick<UserAccount, "id" | "fullName" | "email">;
  items: ReturnOrderItem[];
};

export type NotificationItem = {
  id: number;
  type: "LOW_STOCK" | "OUT_OF_STOCK" | "VAT_PENDING" | "WARRANTY_EXPIRING" | "SHIFT_OPEN" | "ORDER_ISSUE" | "SYSTEM" | string;
  title: string;
  message: string;
  targetRole: string | null;
  userId: number | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  severity?: "INFO" | "WARNING" | "IMPORTANT";
  href?: string;
};

export type PublicInvoice = Pick<Order, "id" | "orderCode" | "totalAmount" | "status" | "createdAt" | "orderDetails" | "payment"> & {
  cashierName: string | null;
  customer: Pick<Customer, "fullName" | "phone"> | null;
  vatInvoiceRequest: VatInvoiceRequest | null;
  setting: Setting;
};

export type PromotionDiscountType = "AMOUNT" | "PERCENT";
export type PromotionStatus = "ACTIVE" | "INACTIVE";

export type Promotion = {
  id: number;
  code: string;
  name: string | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number;
  usageLimit: number | null;
  usedCount: number;
  customerLimit: number | null;
  eligibleTiers: string;
  startDate: string;
  expiredAt: string;
  status: PromotionStatus;
  createdAt: string;
  updatedAt: string;
};
