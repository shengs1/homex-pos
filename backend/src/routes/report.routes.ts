import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { authenticateToken, authorizeRoles } from "../middlewares/auth.middleware";
import {
  USER_ROLES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  RECORD_STATUS,
  WARRANTY_STATUS,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

const VIETNAM_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;

function getDateOnlyParts(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function createVietnamStartOfDayUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - VIETNAM_TIMEZONE_OFFSET_MS);
}

function getDateValue(value: unknown, fieldName: string) {
  if (!value) {
    return null;
  }

  const rawValue = String(value);
  const dateOnlyParts = getDateOnlyParts(rawValue);

  if (dateOnlyParts) {
    const dateValue = createVietnamStartOfDayUtcDate(
      dateOnlyParts.year,
      dateOnlyParts.month,
      dateOnlyParts.day
    );

    Object.defineProperty(dateValue, "__isVietnamDateOnly", {
      value: true,
      enumerable: false,
    });

    return dateValue;
  }

  const dateValue = new Date(rawValue);

  if (Number.isNaN(dateValue.getTime())) {
    throw new AppError(`${fieldName} không hợp lệ`, 400);
  }

  return dateValue;
}

function isVietnamDateOnly(dateValue: Date) {
  return Boolean((dateValue as Date & { __isVietnamDateOnly?: boolean }).__isVietnamDateOnly);
}

function getLimitValue(value: unknown, defaultValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return Math.min(numberValue, 100);
}

function buildDateRange(fromDate: Date | null, toDate: Date | null) {
  if (!fromDate && !toDate) {
    return undefined;
  }

  const range: Prisma.DateTimeFilter = {};

  if (fromDate) {
    range.gte = fromDate;
  }

  if (toDate) {
    if (isVietnamDateOnly(toDate)) {
      range.lte = new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    } else {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      range.lte = endDate;
    }
  }

  return range;
}

function formatMoney(value: Prisma.Decimal | number | null | undefined) {
  return Number(value || 0);
}

function getDateKey(date: Date, groupBy: "day" | "month") {
  const vietnamDate = new Date(date.getTime() + VIETNAM_TIMEZONE_OFFSET_MS);
  const year = vietnamDate.getUTCFullYear();
  const month = String(vietnamDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vietnamDate.getUTCDate()).padStart(2, "0");

  if (groupBy === "month") {
    return `${year}-${month}`;
  }

  return `${year}-${month}-${day}`;
}

// GET /api/reports/summary?fromDate=2026-01-01&toDate=2026-12-31
router.get(
  "/summary",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");
    const dateRange = buildDateRange(fromDate, toDate);

    const [
      paidPaymentAgg,
      refundedPaymentAgg,
      totalOrders,
      completedOrders,
      cancelledOrders,
      draftOrders,
      totalCustomers,
      activeProducts,
      lowStockProducts,
      activeWarranties,
    ] = await prisma.$transaction([
      prisma.payment.aggregate({
        where: {
          status: PAYMENT_STATUS.PAID,
          createdAt: dateRange,
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.payment.aggregate({
        where: {
          status: PAYMENT_STATUS.REFUNDED,
          createdAt: dateRange,
        },
        _sum: {
          amount: true,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.order.count({
        where: {
          createdAt: dateRange,
        },
      }),
      prisma.order.count({
        where: {
          status: ORDER_STATUS.COMPLETED,
          createdAt: dateRange,
        },
      }),
      prisma.order.count({
        where: {
          status: ORDER_STATUS.CANCELLED,
          createdAt: dateRange,
        },
      }),
      prisma.order.count({
        where: {
          status: ORDER_STATUS.DRAFT,
          createdAt: dateRange,
        },
      }),
      prisma.customer.count({
        where: {
          status: RECORD_STATUS.ACTIVE,
        },
      }),
      prisma.product.count({
        where: {
          status: RECORD_STATUS.ACTIVE,
        },
      }),
      prisma.product.count({
        where: {
          status: RECORD_STATUS.ACTIVE,
          stockQuantity: {
            lte: prisma.product.fields.minStock,
          },
        },
      }),
      prisma.warranty.count({
        where: {
          status: WARRANTY_STATUS.ACTIVE,
        },
      }),
    ]);

    const grossRevenue = formatMoney(paidPaymentAgg._sum.amount);
    const refundedAmount = formatMoney(refundedPaymentAgg._sum.amount);
    const netRevenue = grossRevenue - refundedAmount;

    return res.json({
      success: true,
      message: "Lấy báo cáo tổng quan thành công",
      data: {
        grossRevenue,
        refundedAmount,
        netRevenue,
        paidPayments: paidPaymentAgg._count._all,
        refundedPayments: refundedPaymentAgg._count._all,
        totalOrders,
        completedOrders,
        cancelledOrders,
        draftOrders,
        totalCustomers,
        activeProducts,
        lowStockProducts,
        activeWarranties,
      },
    });
  })
);

// GET /api/reports/revenue?fromDate=2026-01-01&toDate=2026-12-31&groupBy=day
router.get(
  "/revenue",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");
    const groupByParam = String(req.query.groupBy || "day").trim().toLowerCase();

    if (groupByParam !== "day" && groupByParam !== "month") {
      throw new AppError("groupBy chỉ được là day hoặc month", 400);
    }

    const groupBy = groupByParam as "day" | "month";
    const dateRange = buildDateRange(fromDate, toDate);

    const payments = await prisma.payment.findMany({
      where: {
        status: PAYMENT_STATUS.PAID,
        createdAt: dateRange,
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const map = new Map<string, { revenue: number; paymentCount: number }>();

    for (const payment of payments) {
      const key = getDateKey(payment.createdAt, groupBy);
      const current = map.get(key) || {
        revenue: 0,
        paymentCount: 0,
      };

      current.revenue += Number(payment.amount);
      current.paymentCount += 1;

      map.set(key, current);
    }

    const items = Array.from(map.entries()).map(([period, value]) => ({
      period,
      revenue: value.revenue,
      paymentCount: value.paymentCount,
    }));

    return res.json({
      success: true,
      message: "Lấy báo cáo doanh thu thành công",
      data: {
        groupBy,
        items,
      },
    });
  })
);

// GET /api/reports/top-products?fromDate=2026-01-01&toDate=2026-12-31&limit=10
router.get(
  "/top-products",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");
    const limit = getLimitValue(req.query.limit, 10);
    const dateRange = buildDateRange(fromDate, toDate);

    const groupedItems = await prisma.orderDetail.groupBy({
      by: ["productId"],
      where: {
        status: RECORD_STATUS.ACTIVE,
        order: {
          status: ORDER_STATUS.COMPLETED,
          createdAt: dateRange,
        },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: limit,
    });

    const productIds = groupedItems.map((item) => item.productId);

    const products = await prisma.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        salePrice: true,
        stockQuantity: true,
        minStock: true,
        status: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const items = groupedItems.map((groupedItem) => {
      const product = products.find(
        (productItem) => productItem.id === groupedItem.productId
      );

      return {
        productId: groupedItem.productId,
        product: product
          ? {
              ...product,
              salePrice: formatMoney(product.salePrice),
            }
          : null,
        totalQuantity: groupedItem._sum.quantity || 0,
        totalRevenue: formatMoney(groupedItem._sum.lineTotal),
      };
    });

    return res.json({
      success: true,
      message: "Lấy báo cáo sản phẩm bán chạy thành công",
      data: {
        items,
      },
    });
  })
);

// GET /api/reports/top-customers?fromDate=2026-01-01&toDate=2026-12-31&limit=10
router.get(
  "/top-customers",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const fromDate = getDateValue(req.query.fromDate, "Ngày bắt đầu");
    const toDate = getDateValue(req.query.toDate, "Ngày kết thúc");
    const limit = getLimitValue(req.query.limit, 10);
    const dateRange = buildDateRange(fromDate, toDate);

    const groupedItems = await prisma.order.groupBy({
      by: ["customerId"],
      where: {
        customerId: {
          not: null,
        },
        status: ORDER_STATUS.COMPLETED,
        createdAt: dateRange,
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          totalAmount: "desc",
        },
      },
      take: limit,
    });

    const customerIds = groupedItems
      .map((item) => item.customerId)
      .filter((customerId): customerId is number => typeof customerId === "number");

    const customers = await prisma.customer.findMany({
      where: {
        id: {
          in: customerIds,
        },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        address: true,
        points: true,
        status: true,
      },
    });

    const items = groupedItems.map((groupedItem) => {
      const customer = customers.find(
        (customerItem) => customerItem.id === groupedItem.customerId
      );

      return {
        customerId: groupedItem.customerId,
        customer: customer || null,
        totalOrders: groupedItem._count._all,
        totalSpent: formatMoney(groupedItem._sum.totalAmount),
      };
    });

    return res.json({
      success: true,
      message: "Lấy báo cáo khách hàng mua nhiều thành công",
      data: {
        items,
      },
    });
  })
);

// GET /api/reports/low-stock?limit=20
router.get(
  "/low-stock",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const limit = getLimitValue(req.query.limit, 20);

    const products = await prisma.product.findMany({
      where: {
        status: RECORD_STATUS.ACTIVE,
        stockQuantity: {
          lte: prisma.product.fields.minStock,
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: [
        {
          stockQuantity: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: limit,
    });

    const items = products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      supplier: product.supplier,
      salePrice: formatMoney(product.salePrice),
      costPrice: formatMoney(product.costPrice),
      stockQuantity: product.stockQuantity,
      minStock: product.minStock,
      status: product.status,
    }));

    return res.json({
      success: true,
      message: "Lấy báo cáo sản phẩm sắp hết hàng thành công",
      data: {
        items,
      },
    });
  })
);

// GET /api/reports/customers?limit=10
router.get(
  "/customers",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const limitValue = Number(req.query.limit || 10);

    const limit =
      Number.isInteger(limitValue) && limitValue > 0
        ? Math.min(limitValue, 100)
        : 10;

    const customers = await prisma.customer.findMany({
      where: {
        status: RECORD_STATUS.ACTIVE,
      },
      include: {
        orders: {
          where: {
            status: ORDER_STATUS.COMPLETED,
          },
          select: {
            id: true,
            orderCode: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });

    const reportItems = customers
      .map((customer) => {
        const totalOrders = customer.orders.length;

        const totalSpent = customer.orders.reduce((sum, order) => {
          return sum + Number(order.totalAmount);
        }, 0);

        const latestOrder = customer.orders.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )[0];

        return {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          points: customer.points,
          status: customer.status,
          totalOrders,
          totalSpent,
          latestOrder: latestOrder
            ? {
                id: latestOrder.id,
                orderCode: latestOrder.orderCode,
                totalAmount: Number(latestOrder.totalAmount),
                createdAt: latestOrder.createdAt,
              }
            : null,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);

    return res.json({
      success: true,
      message: "Lấy báo cáo khách hàng thành công",
      data: {
        items: reportItems,
      },
    });
  })
);

export default router;