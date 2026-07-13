import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./lib/prisma";
import authRoutes from "./routes/auth.routes";
import testRoutes from "./routes/test.routes";
import categoryRoutes from "./routes/category.routes";
import supplierRoutes from "./routes/supplier.routes";
import productRoutes from "./routes/product.routes";
import customerRoutes from "./routes/customer.routes";
import inventoryRoutes from "./routes/inventory.routes";
import orderRoutes from "./routes/order.routes";
import userRoutes from "./routes/user.routes";
import warrantyRoutes from "./routes/warranty.routes";
import paymentRoutes from "./routes/payment.routes";
import reportRoutes from "./routes/report.routes";
import auditLogRoutes from "./routes/audit-log.routes";
import promotionRoutes from "./routes/promotion.routes";
import settingRoutes from "./routes/setting.routes";
import shiftRoutes from "./routes/shift.routes";
import purchaseOrderRoutes from "./routes/purchase-order.routes";
import returnOrderRoutes from "./routes/return-order.routes";
import vatInvoiceRoutes from "./routes/vat-invoice.routes";
import notificationRoutes from "./routes/notification.routes";
import publicInvoiceRoutes from "./routes/public-invoice.routes";
import remoteScanRoutes from "./routes/remote-scan.routes";
import salesAssistantRoutes from "./routes/sales-assistant.routes";
import { demoModeMiddleware } from "./middlewares/demo-mode.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(demoModeMiddleware);

app.get("/", (req, res) => {
  res.send("Homex POS Backend is running");
});

app.get("/api/health/db", async (req, res) => {
  try {
    const roleCount = await prisma.role.count();
    const userCount = await prisma.user.count();
    const categoryCount = await prisma.category.count();
    const supplierCount = await prisma.supplier.count();
    const productCount = await prisma.product.count();
    const customerCount = await prisma.customer.count();
    const orderCount = await prisma.order.count();
    const orderDetailCount = await prisma.orderDetail.count();
    const paymentCount = await prisma.payment.count();
    const stockTransactionCount = await prisma.stockTransaction.count();
    const warrantyCount = await prisma.warranty.count();
    const auditLogCount = await prisma.auditLog.count();
    
    

    res.json({
      success: true,
      message: "Kết nối database thành công",
      data: {
        roles: roleCount,
        users: userCount,
        categories: categoryCount,
        suppliers: supplierCount,
        products: productCount,
        customers: customerCount,
        orders: orderCount,
        orderDetails: orderDetailCount,
        payments: paymentCount,
        stockTransactions: stockTransactionCount,
        warranties: warrantyCount,
        auditLogs: auditLogCount,
      },
    });
  } catch (error) {
    console.error("Lỗi kết nối database:", error);

    res.status(500).json({
      success: false,
      message: "Không thể kết nối database",
    });
  }
});

app.get("/api/health", (req, res) => {
  return res.json({
    success: true,
    message: "Homex POS API đang hoạt động",
    data: {
      app: "Homex POS Backend",
      status: "OK",
      timestamp: new Date().toISOString(),
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);
app.use("/api/warranties", warrantyRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/return-orders", returnOrderRoutes);
app.use("/api/vat-invoices", vatInvoiceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/invoices/public", publicInvoiceRoutes);
app.use("/api/pos", remoteScanRoutes);
app.use("/api/pos", salesAssistantRoutes);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
