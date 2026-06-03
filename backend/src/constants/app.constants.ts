export const USER_ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
} as const;

export const RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export const ORDER_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
} as const;

export const PAYMENT_STATUS = {
  UNPAID: "UNPAID",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
} as const;

export const PAYMENT_METHOD = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  MIXED: "MIXED",
} as const;