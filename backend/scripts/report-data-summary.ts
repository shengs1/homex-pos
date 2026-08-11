import prisma from "../src/lib/prisma";

async function main() {
  const now = new Date();
  const date30 = new Date(now);
  date30.setDate(date30.getDate() - 30);
  date30.setHours(0, 0, 0, 0);

  const [activeProducts, activeCategories, productsWithBarcode, productsWithImage, eligibleOrders, eligibleDetails, demoOrders] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.category.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { status: "ACTIVE", barcode: { not: null } } }),
    prisma.product.count({ where: { status: "ACTIVE", imageUrl: { not: null } } }),
    prisma.order.count({
      where: {
        createdAt: { gte: date30 },
        OR: [{ status: "COMPLETED" }, { payment: { status: "PAID" } }],
        NOT: [{ status: "CANCELLED" }, { payment: { status: "REFUNDED" } }],
      },
    }),
    prisma.orderDetail.findMany({
      where: {
        createdAt: { gte: date30 },
        order: {
          OR: [{ status: "COMPLETED" }, { payment: { status: "PAID" } }],
          NOT: [{ status: "CANCELLED" }, { payment: { status: "REFUNDED" } }],
        },
      },
      select: { productId: true, quantity: true, createdAt: true },
    }),
    prisma.order.count({ where: { orderCode: { startsWith: "DEMO-AI-202608" } } }),
  ]);

  console.log(JSON.stringify({
    evaluatedAt: now.toISOString(),
    activeProducts,
    activeCategories,
    productsWithBarcode,
    productsWithImage,
    eligibleOrdersLast30Days: eligibleOrders,
    eligibleOrderDetailsLast30Days: eligibleDetails.length,
    eligibleUnitsLast30Days: eligibleDetails.reduce((sum, item) => sum + item.quantity, 0),
    eligibleSkusLast30Days: new Set(eligibleDetails.map((item) => item.productId)).size,
    sellingDaysLast30Days: new Set(eligibleDetails.map((item) => item.createdAt.toISOString().slice(0, 10))).size,
    augustDemoOrders: demoOrders,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
