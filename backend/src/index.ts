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
import { errorMiddleware } from "./middlewares/error.middleware";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

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
    const stockTransactionCount = await prisma.stockTransaction.count();
    const orderCount = await prisma.order.count();
    const orderDetailCount = await prisma.orderDetail.count();
    const warrantyCount = await prisma.warranty.count();
    const paymentCount = await prisma.payment.count();
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
        stockTransactions: stockTransactionCount,
        orders: orderCount,
        orderDetails: orderDetailCount,
        payments: paymentCount,
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
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});