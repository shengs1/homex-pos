import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./lib/prisma";
import authRoutes from "./routes/auth.routes";
import testRoutes from "./routes/test.routes";
import categoryRoutes from "./routes/category.routes";

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

    res.json({
      message: "Kết nối database thành công",
      data: {
        roles: roleCount,
        users: userCount,
        categories: categoryCount,
        suppliers: supplierCount,
      },
    });
  } catch (error) {
    console.error("Lỗi kết nối database:", error);

    res.status(500).json({
      message: "Không thể kết nối database",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/categories", categoryRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});