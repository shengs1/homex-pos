import fs from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { payOS } from "../src/services/payos.service";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const prisma = new PrismaClient();
const checksumKey = process.env.PAYOS_CHECKSUM_KEY || "";
const baseUrl = "http://localhost:5000/api";

function signature(data: Record<string, any>) {
  const query = Object.keys(data).sort().filter((key) => data[key] !== undefined).map((key) => {
    let value = data[key];
    if (value && Array.isArray(value)) value = JSON.stringify(value.map((item) => Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))));
    if ([null, undefined, "undefined", "null"].includes(value)) value = "";
    return `${key}=${value}`;
  }).join("&");
  return createHmac("sha256", checksumKey).update(query).digest("hex");
}

async function main() {
  if (!checksumKey) throw new Error("PAYOS_CHECKSUM_KEY is not configured");
  const user = await prisma.user.findFirst({ where: { status: "ACTIVE" }, orderBy: { id: "asc" } });
  const product = await prisma.product.findFirst({ where: { status: "ACTIVE", stockQuantity: { gte: 2 } }, orderBy: { id: "asc" } });
  if (!user || !product) throw new Error("Demo data is insufficient");

  const nonce = Date.now();
  const providerOrderCode = Number(String(nonce).slice(-8)) + 700000000;
  const orderCode = `TST-WEBHOOK-${nonce}`;
  const amount = Number(product.salePrice);
  let orderId: number | undefined;
  let paymentId: number | undefined;
  let detailId: number | undefined;
  const stockBefore = product.stockQuantity;

  const signaturePayload = {
    orderCode: providerOrderCode,
    amount,
    description: `HOMEX-TEST`,
    accountNumber: "TEST",
    reference: `TEST-REF-${nonce}`,
    transactionDateTime: "2026-07-26 23:50:00",
    currency: "VND",
    paymentLinkId: `test-link-${nonce}`,
    code: "00",
    desc: "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
  };
  const validWebhook = { code: "00", desc: "success", success: true, data: signaturePayload, signature: signature(signaturePayload) };
  const signatureValid = (await payOS.webhooks.verify(validWebhook as any)).orderCode === providerOrderCode;
  let tamperedRejected = false;
  try {
    await payOS.webhooks.verify({ ...validWebhook, data: { ...signaturePayload, amount: amount + 1 } } as any);
  } catch {
    tamperedRejected = true;
  }

  try {
    const fixture = await prisma.order.create({
      data: {
        orderCode,
        userId: user.id,
        totalAmount: amount,
        status: "DRAFT",
        orderDetails: { create: { productId: product.id, quantity: 1, unitPrice: product.salePrice, lineTotal: product.salePrice, status: "ACTIVE" } },
        payment: { create: { method: "TRANSFER", amount, status: "PENDING", provider: "PAYOS", providerOrderCode, paymentCode: "HOMEX-TEST" } },
      },
      include: { orderDetails: true, payment: true },
    });
    orderId = fixture.id;
    paymentId = fixture.payment!.id;
    detailId = fixture.orderDetails[0].id;

    const send = () => fetch(`${baseUrl}/payments/webhook/payos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validWebhook),
    }).then(async (response) => ({ status: response.status, body: await response.json() }));

    const responses = await Promise.all([send(), send()]);
    const [payment, order, currentProduct, saleTransactions, logs, warranties] = await Promise.all([
      prisma.payment.findUnique({ where: { id: paymentId } }),
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.product.findUnique({ where: { id: product.id } }),
      prisma.stockTransaction.findMany({ where: { orderId, type: "SALE" } }),
      prisma.paymentWebhookLog.findMany({ where: { paymentId }, orderBy: { id: "asc" } }),
      prisma.warranty.findMany({ where: { orderDetailId: detailId } }),
    ]);

    const checks = {
      signatureValid,
      tamperedRejected,
      bothRequestsAcknowledged: responses.every((item) => item.status === 200),
      paymentPaid: payment?.status === "PAID",
      orderCompleted: order?.status === "COMPLETED",
      stockDecrementedOnce: currentProduct?.stockQuantity === stockBefore - 1,
      oneSaleTransaction: saleTransactions.length === 1 && saleTransactions[0].quantity === -1,
      oneProcessedLog: logs.filter((log) => log.status === "PROCESSED").length === 1,
      replayLoggedDuplicate: logs.filter((log) => log.status === "DUPLICATE").length === 1,
      warrantyAtMostOnce: warranties.length <= 1,
    };
    const summary = { checkCount: Object.keys(checks).length, passRate: Object.values(checks).filter(Boolean).length / Object.keys(checks).length, checks, responses, logStatuses: logs.map((log) => log.status), evaluatedAt: new Date().toISOString() };
    const outDir = path.resolve(process.cwd(), "..", "docs", "benchmarks");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "payos-webhook-benchmark.json"), JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary));
  } finally {
    if (orderId && paymentId) {
      await prisma.$transaction(async (tx) => {
        const saleQuantity = await tx.stockTransaction.aggregate({ where: { orderId, productId: product.id, type: "SALE" }, _sum: { quantity: true } });
        const delta = Number(saleQuantity._sum.quantity || 0);
        await tx.paymentWebhookLog.deleteMany({ where: { paymentId } });
        await tx.auditLog.deleteMany({ where: { entityType: "Payment", entityId: paymentId } });
        if (detailId) await tx.warranty.deleteMany({ where: { orderDetailId: detailId } });
        await tx.stockTransaction.deleteMany({ where: { orderId } });
        await tx.payment.deleteMany({ where: { id: paymentId } });
        await tx.orderDetail.deleteMany({ where: { orderId } });
        await tx.order.deleteMany({ where: { id: orderId } });
        if (delta < 0) await tx.product.update({ where: { id: product.id }, data: { stockQuantity: { increment: -delta } } });
      });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
