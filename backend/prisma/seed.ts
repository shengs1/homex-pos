import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("123456", 10);

  // 1. Tạo 3 vai trò
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: {
      name: "ADMIN",
      description: "Chủ cửa hàng, quản lý toàn bộ hệ thống",
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: "MANAGER" },
    update: {},
    create: {
      name: "MANAGER",
      description: "Quản lý cửa hàng, sản phẩm, kho và hóa đơn",
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: "CASHIER" },
    update: {},
    create: {
      name: "CASHIER",
      description: "Nhân viên bán hàng tại quầy",
    },
  });

  // 2. Tạo 3 tài khoản demo
  await prisma.user.upsert({
    where: { email: "admin@homex.com" },
    update: {},
    create: {
      fullName: "Admin Homex",
      email: "admin@homex.com",
      passwordHash,
      roleId: adminRole.id,
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "manager@homex.com" },
    update: {},
    create: {
      fullName: "Quản lý Homex",
      email: "manager@homex.com",
      passwordHash,
      roleId: managerRole.id,
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { email: "cashier@homex.com" },
    update: {},
    create: {
      fullName: "Nhân viên bán hàng",
      email: "cashier@homex.com",
      passwordHash,
      roleId: cashierRole.id,
      status: "ACTIVE",
    },
  });

  // 3. Tạo danh mục mẫu
  const categoryCount = await prisma.category.count();

  if (categoryCount === 0) {
    await prisma.category.createMany({
      data: [
        {
          name: "Thiết bị nhà bếp",
          description: "Nồi cơm điện, bếp điện, máy xay",
          status: "ACTIVE",
        },
        {
          name: "Thiết bị làm sạch",
          description: "Máy hút bụi, cây lau nhà",
          status: "ACTIVE",
        },
        {
          name: "Đồ dùng gia đình",
          description: "Hộp đựng, kệ và vật dụng gia đình",
          status: "ACTIVE",
        },
      ],
    });
  }

  // 4. Tạo nhà cung cấp mẫu
  const supplierCount = await prisma.supplier.count();

  if (supplierCount === 0) {
    await prisma.supplier.createMany({
      data: [
        {
          name: "Công ty Gia Dụng Việt",
          phone: "0901234567",
          address: "TP. Hồ Chí Minh",
          status: "ACTIVE",
        },
        {
          name: "Nhà cung cấp Home Star",
          phone: "0907654321",
          address: "Cần Thơ",
          status: "ACTIVE",
        },
      ],
    });
  }

  console.log("Seed dữ liệu ban đầu thành công!");
  console.log("Tài khoản demo:");
  console.log("- admin@homex.com / 123456");
  console.log("- manager@homex.com / 123456");
  console.log("- cashier@homex.com / 123456");
}

main()
  .catch((error) => {
    console.error("Seed thất bại:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });