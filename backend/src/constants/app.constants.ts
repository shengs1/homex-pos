export const USER_ROLES = {
  ADMIN: "ADMIN",
  CASHIER: "CASHIER",
} as const;

export const RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export const ORDER_STATUS = {
  DRAFT: "DRAFT",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export const PAYMENT_STATUS = {
  PAID: "PAID",
  PENDING: "PENDING",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;

export const PAYMENT_METHOD = {
  CASH: "CASH",
  CARD: "CARD",
  TRANSFER: "TRANSFER",
  WALLET: "WALLET",
} as const;