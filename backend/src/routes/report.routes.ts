import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import {
  authenticateToken,
  authorizeRoles,
} from "../middlewares/auth.middleware";
import {
  USER_ROLES,
  RECORD_STATUS,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from "../constants/app.constants";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";

const router = Router();

type DateRange = {
  fromDate: Date | null;
  toDate: Date | null;
};

function formatMoney(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function getDateValue(value: unknown, fieldName: string) {
  if (!value) {
    return null;
  }

  const dateValue = new Date(String(value));

  if (Number.isNaN(dateValue.getTime())) {
    throw new AppError(`${fieldName} không hợp lệ`, 400);
  }

  return dateValue;
}

function getDateRange(query: { fromDate?: unknown; toDate?: unknown }): DateRange {
  const fromDate = getDateValue(query.fromDate, "Ngày bắt đầu");
  const toDate = getDateValue(query.toDate, "Ngày kết thúc");

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    throw new AppError("Ngày bắt đầu không được lớn hơn ngày kết thúc", 400);
  }

  return {
    fromDate,
    toDate,
  };
}

function getLimitValue(value: unknown, defaultValue: number, maxValue: number) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return defaultValue;
  }

  return Math.min(numberValue, maxValue);
}

function getCompletedPaidOrderWhere(dateRange: DateRange): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    status: ORDER_STATUS.COMPLETED,
    payment: {
      status: PAYMENT_STATUS.PAID,
    },
  };

  if (dateRange.fromDate || dateRange.toDate) {
    where.createdAt = {};

    if (dateRange.fromDate) {
      where.createdAt.gte = dateRange.fromDate;
    }

    if (dateRange.toDate) {
      where.createdAt.lte = dateRange.toDate;
    }
  }

  return where;
}

function getGroupKey(date: Date, groupBy: string) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (groupBy === "year") {
    return `${year}`;
  }

  if (groupBy === "month") {
    return `${year}-${month}`;
  }

  return `${year}-${month}-${day}`;
}

function validateGroupBy(value: unknown) {
  const groupBy = String(value || "day").trim().toLowerCase();

  if (groupBy !== "day" && groupBy !== "month" && groupBy !== "year") {
    throw new AppError("Kiểu nhóm báo cáo không hợp lệ", 400);
  }

  return groupBy;
}

function formatProductForReport(product: {
  id: number;
  sku: string;
  name: string;
  costPrice: Prisma.Decimal;
  salePrice: Prisma.Decimal;
  stockQuantity: number;
  minStock: number;
  warrantyMonths: number;
  status: string;
  category: {
    id: number;
    name: string;
  };
  supplier: {
    id: number;
    name: string;
  };
}) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    costPrice: formatMoney(product.costPrice),
    salePrice: formatMoney(product.salePrice),
    stockQuantity: product.stockQuantity,
    minStock: product.minStock,
    warrantyMonths: product.warrantyMonths,
    status: product.status,
    category: product.category,
    supplier: product.supplier,
  };
}

// GET /api/reports/overview?fromDate=2026-01-01&toDate=2026-12-31
router.get(
  "/overview",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const dateRange = getDateRange(req.query);
    const completedPaidOrderWhere = getCompletedPaidOrderWhere(dateRange);

    const [
      revenueAggregate,
      completedOrderCount,
      draftOrderCount,
      cancelledOrderCount,
      refundedPaymentAggregate,
      customerCount,
      productCount,
      activeProducts,
    ] = await prisma.$transaction([
      prisma.order.aggregate({
        where: completedPaidOrderWhere,
        _sum: {
          totalAmount: true,
        },
        _avg: {
          totalAmount: true,
        },
      }),
      prisma.order.count({
        where: completedPaidOrderWhere,
      }),
      prisma.order.count({
        where: {
          status: ORDER_STATUS.DRAFT,
        },
      }),
      prisma.order.count({
        where: {
          status: ORDER_STATUS.CANCELLED,
        },
      }),
      prisma.payment.aggregate({
        where: {
          status: PAYMENT_STATUS.REFUNDED,
        },
        _sum: {
          amount: true,
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
      prisma.product.findMany({
        where: {
          status: RECORD_STATUS.ACTIVE,
        },
        select: {
          costPrice: true,
          salePrice: true,
          stockQuantity: true,
          minStock: true,
        },
      }),
    ]);

    let inventoryCostValue = 0;
    let inventorySaleValue = 0;
    let lowStockProductCount = 0;

    for (const product of activeProducts) {
      inventoryCostValue += Number(product.costPrice) * product.stockQuantity;
      inventorySaleValue += Number(product.salePrice) * product.stockQuantity;

      if (product.stockQuantity <= product.minStock) {
        lowStockProductCount += 1;
      }
    }

    const totalRevenue = formatMoney(revenueAggregate._sum.totalAmount);
    const refundedAmount = formatMoney(refundedPaymentAggregate._sum.amount);

    return res.json({
      success: true,
      message: "Lấy báo cáo tổng quan thành công",
      data: {
        revenue: {
          totalRevenue,
          refundedAmount,
          netRevenue: totalRevenue - refundedAmount,
          averageOrderValue: formatMoney(revenueAggregate._avg.totalAmount),
        },
        orders: {
          completed: completedOrderCount,
          draft: draftOrderCount,
          cancelled: cancelledOrderCount,
        },
        customers: {
          active: customerCount,
        },
        products: {
          active: productCount,
          lowStock: lowStockProductCount,
        },
        inventory: {
          costValue: inventoryCostValue,
          saleValue: inventorySaleValue,
          estimatedProfitValue: inventorySaleValue - inventoryCostValue,
        },
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
    const dateRange = getDateRange(req.query);
    const groupBy = validateGroupBy(req.query.groupBy);

    const orders = await prisma.order.findMany({
      where: getCompletedPaidOrderWhere(dateRange),
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const reportMap = new Map<
      string,
      {
        period: string;
        revenue: number;
        orderCount: number;
      }
    >();

    for (const order of orders) {
      const period = getGroupKey(order.createdAt, groupBy);
      const current = reportMap.get(period) || {
        period,
        revenue: 0,
        orderCount: 0,
      };

      current.revenue += Number(order.totalAmount);
      current.orderCount += 1;
      reportMap.set(period, current);
    }

    const items = Array.from(reportMap.values()).map((item) => ({
      ...item,
      averageOrderValue:
        item.orderCount > 0 ? item.revenue / item.orderCount : 0,
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
    const dateRange = getDateRange(req.query);
    const limit = getLimitValue(req.query.limit, 10, 100);

    const orderDetails = await prisma.orderDetail.findMany({
      where: {
        status: RECORD_STATUS.ACTIVE,
        order: getCompletedPaidOrderWhere(dateRange),
      },
      include: {
        product: {
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
              },
            },
          },
        },
      },
    });

    const productMap = new Map<
      number,
      {
        product: ReturnType<typeof formatProductForReport>;
        totalQuantity: number;
        totalRevenue: number;
        orderLineCount: number;
      }
    >();

    for (const detail of orderDetails) {
      const current = productMap.get(detail.productId) || {
        product: formatProductForReport(detail.product),
        totalQuantity: 0,
        totalRevenue: 0,
        orderLineCount: 0,
      };

      current.totalQuantity += detail.quantity;
      current.totalRevenue += Number(detail.lineTotal);
      current.orderLineCount += 1;
      productMap.set(detail.productId, current);
    }

    const items = Array.from(productMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, limit);

    return res.json({
      success: true,
      message: "Lấy báo cáo sản phẩm bán chạy thành công",
      data: {
        items,
      },
    });
  })
);

// GET /api/reports/low-stock?limit=50
router.get(
  "/low-stock",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const limit = getLimitValue(req.query.limit, 50, 200);

    const products = await prisma.product.findMany({
      where: {
        status: RECORD_STATUS.ACTIVE,
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
          },
        },
      },
      orderBy: {
        stockQuantity: "asc",
      },
    });

    const items = products
      .filter((product) => product.stockQuantity <= product.minStock)
      .slice(0, limit)
      .map((product) => ({
        ...formatProductForReport(product),
        missingQuantity: Math.max(product.minStock - product.stockQuantity, 0),
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

// GET /api/reports/customers?fromDate=2026-01-01&toDate=2026-12-31&limit=10
router.get(
  "/customers",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const dateRange = getDateRange(req.query);
    const limit = getLimitValue(req.query.limit, 10, 100);

    const orders = await prisma.order.findMany({
      where: {
        ...getCompletedPaidOrderWhere(dateRange),
        customerId: {
          not: null,
        },
      },
      include: {
        customer: true,
      },
    });

    const customerMap = new Map<
      number,
      {
        customer: {
          id: number;
          fullName: string;
          phone: string;
          email: string | null;
          address: string | null;
          points: number;
          status: string;
        };
        totalOrders: number;
        totalSpent: number;
      }
    >();

    for (const order of orders) {
      if (!order.customer) {
        continue;
      }

      const current = customerMap.get(order.customer.id) || {
        customer: {
          id: order.customer.id,
          fullName: order.customer.fullName,
          phone: order.customer.phone,
          email: order.customer.email,
          address: order.customer.address,
          points: order.customer.points,
          status: order.customer.status,
        },
        totalOrders: 0,
        totalSpent: 0,
      };

      current.totalOrders += 1;
      current.totalSpent += Number(order.totalAmount);
      customerMap.set(order.customer.id, current);
    }

    const items = Array.from(customerMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);

    return res.json({
      success: true,
      message: "Lấy báo cáo khách hàng thành công",
      data: {
        items,
      },
    });
  })
);

// GET /api/reports/inventory-summary
router.get(
  "/inventory-summary",
  authenticateToken,
  authorizeRoles(USER_ROLES.ADMIN),
  catchAsync(async (req, res) => {
    const products = await prisma.product.findMany({
      where: {
        status: RECORD_STATUS.ACTIVE,
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
          },
        },
      },
    });

    let totalQuantity = 0;
    let totalCostValue = 0;
    let totalSaleValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const categoryMap = new Map<
      number,
      {
        categoryId: number;
        categoryName: string;
        productCount: number;
        totalQuantity: number;
        costValue: number;
        saleValue: number;
      }
    >();

    for (const product of products) {
      const costValue = Number(product.costPrice) * product.stockQuantity;
      const saleValue = Number(product.salePrice) * product.stockQuantity;

      totalQuantity += product.stockQuantity;
      totalCostValue += costValue;
      totalSaleValue += saleValue;

      if (product.stockQuantity <= product.minStock) {
        lowStockCount += 1;
      }

      if (product.stockQuantity === 0) {
        outOfStockCount += 1;
      }

      const currentCategory = categoryMap.get(product.categoryId) || {
        categoryId: product.categoryId,
        categoryName: product.category.name,
        productCount: 0,
        totalQuantity: 0,
        costValue: 0,
        saleValue: 0,
      };

      currentCategory.productCount += 1;
      currentCategory.totalQuantity += product.stockQuantity;
      currentCategory.costValue += costValue;
      currentCategory.saleValue += saleValue;
      categoryMap.set(product.categoryId, currentCategory);
    }

    return res.json({
      success: true,
      message: "Lấy báo cáo tổng hợp tồn kho thành công",
      data: {
        summary: {
          productCount: products.length,
          totalQuantity,
          totalCostValue,
          totalSaleValue,
          estimatedProfitValue: totalSaleValue - totalCostValue,
          lowStockCount,
          outOfStockCount,
        },
        byCategory: Array.from(categoryMap.values()).sort(
          (a, b) => b.saleValue - a.saleValue
        ),
      },
    });
  })
);

export default router;