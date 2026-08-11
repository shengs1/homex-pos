import prisma from "../src/lib/prisma";

const BATCH_PREFIX = "DEMO-AI-202608";
const SELLER_USER_ID = 1;

type OrderItemSpec = {
  productId: number;
  quantity: number;
};

type DemoOrderSpec = {
  orderCode: string;
  createdAt: Date;
  items: OrderItemSpec[];
};

const businessTimes = ["09:15:00", "11:20:00", "15:10:00", "19:05:00"];

function localDate(day: number, time: string) {
  return new Date(`2026-08-${String(day).padStart(2, "0")}T${time}+07:00`);
}

function buildOrderSpecs(): DemoOrderSpec[] {
  const specs: DemoOrderSpec[] = [];

  for (let day = 5; day <= 10; day += 1) {
    const dayIndex = day - 5;
    const dailyOrders: OrderItemSpec[][] = [
      [
        { productId: 9, quantity: 1 + Math.floor(dayIndex / 2) },
        { productId: 11, quantity: 1 },
      ],
      [
        { productId: 13, quantity: 1 + Math.floor(dayIndex / 3) },
        { productId: 18, quantity: 1 },
      ],
      [
        { productId: 22, quantity: 1 },
        { productId: 30, quantity: dayIndex >= 4 ? 2 : 1 },
      ],
      [
        { productId: 9, quantity: 1 },
        { productId: 14, quantity: dayIndex >= 4 ? 2 : 1 },
        { productId: 37, quantity: 1 },
      ],
    ];

    dailyOrders.forEach((items, index) => {
      specs.push({
        orderCode: `${BATCH_PREFIX}${String(day).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
        createdAt: localDate(day, businessTimes[index]),
        items,
      });
    });
  }

  specs.push({
    orderCode: `${BATCH_PREFIX}11-01`,
    createdAt: localDate(11, "00:05:00"),
    items: [
      { productId: 9, quantity: 4 },
      { productId: 11, quantity: 1 },
    ],
  });

  return specs;
}

async function main() {
  const specs = buildOrderSpecs();
  const existingCodes = new Set(
    (await prisma.order.findMany({
      where: { orderCode: { startsWith: BATCH_PREFIX } },
      select: { orderCode: true },
    })).map((order) => order.orderCode),
  );

  const productIds = [...new Set(specs.flatMap((spec) => spec.items.map((item) => item.productId)))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      salePrice: true,
      costPrice: true,
      stockQuantity: true,
    },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const missingProductIds = productIds.filter((id) => !productMap.has(id));
  if (missingProductIds.length > 0) {
    throw new Error(`Không tìm thấy sản phẩm ACTIVE: ${missingProductIds.join(", ")}`);
  }

  const requiredQuantities = new Map<number, number>();
  for (const spec of specs) {
    if (existingCodes.has(spec.orderCode)) continue;
    for (const item of spec.items) {
      requiredQuantities.set(item.productId, (requiredQuantities.get(item.productId) || 0) + item.quantity);
    }
  }

  for (const [productId, requiredQuantity] of requiredQuantities) {
    const product = productMap.get(productId)!;
    if (product.stockQuantity < requiredQuantity) {
      throw new Error(
        `Sản phẩm ${product.name} chỉ còn ${product.stockQuantity}, cần ${requiredQuantity} để tạo batch.`,
      );
    }
  }

  let createdCount = 0;
  let skippedCount = 0;
  let createdRevenue = 0;

  for (const spec of specs) {
    if (existingCodes.has(spec.orderCode)) {
      skippedCount += 1;
      continue;
    }

    const details = spec.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = Number(product.salePrice);
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
        unitCost: Number(product.costPrice),
      };
    });
    const totalAmount = details.reduce((sum, detail) => sum + detail.lineTotal, 0);
    const paymentMethod = createdCount % 3 === 0
      ? "CASH"
      : createdCount % 3 === 1
        ? "TRANSFER"
        : "CARD";

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderCode: spec.orderCode,
          userId: SELLER_USER_ID,
          customerId: null,
          totalAmount,
          status: "COMPLETED",
          createdAt: spec.createdAt,
          updatedAt: spec.createdAt,
          orderDetails: {
            create: details.map((detail) => ({
              productId: detail.productId,
              quantity: detail.quantity,
              unitPrice: detail.unitPrice,
              lineTotal: detail.lineTotal,
              unitCost: detail.unitCost,
              status: "ACTIVE",
              createdAt: spec.createdAt,
              updatedAt: spec.createdAt,
            })),
          },
          payment: {
            create: {
              method: paymentMethod,
              amount: totalAmount,
              cashReceived: paymentMethod === "CASH" ? totalAmount : null,
              changeAmount: paymentMethod === "CASH" ? 0 : null,
              status: "PAID",
              provider: "DEMO_SEED",
              paidAt: spec.createdAt,
              createdAt: spec.createdAt,
              updatedAt: spec.createdAt,
            },
          },
        },
      });

      for (const detail of details) {
        await tx.product.update({
          where: { id: detail.productId },
          data: { stockQuantity: { decrement: detail.quantity } },
        });
        await tx.stockTransaction.create({
          data: {
            productId: detail.productId,
            userId: SELLER_USER_ID,
            orderId: order.id,
            type: "SALE",
            quantity: -detail.quantity,
            note: `Dữ liệu demo AI Kho - đơn ${spec.orderCode}`,
            createdAt: spec.createdAt,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: SELLER_USER_ID,
          action: "CREATE_DEMO_ORDER",
          entityType: "Order",
          entityId: order.id,
          description: `Tạo đơn ảo phục vụ AI Kho ${spec.orderCode}`,
          createdAt: spec.createdAt,
        },
      });
    });

    createdCount += 1;
    createdRevenue += totalAmount;
  }

  const summary = await prisma.order.groupBy({
    by: ["createdAt"],
    where: { orderCode: { startsWith: BATCH_PREFIX } },
    _count: { _all: true },
    _sum: { totalAmount: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(JSON.stringify({
    batchPrefix: BATCH_PREFIX,
    requestedOrders: specs.length,
    createdCount,
    skippedCount,
    createdRevenue,
    orderTimestamps: summary.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      orderCount: row._count._all,
      revenue: Number(row._sum.totalAmount || 0),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
