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



  // 5. Tạo sản phẩm mẫu
  const productCount = await prisma.product.count();

  if (productCount === 0) {
    const kitchenCategory = await prisma.category.findFirst({
      where: {
        name: "Thiết bị nhà bếp",
      },
    });

    const cleaningCategory = await prisma.category.findFirst({
      where: {
        name: "Thiết bị làm sạch",
      },
    });

    const homeSupplier = await prisma.supplier.findFirst({
      where: {
        name: "Công ty Gia Dụng Việt",
      },
    });

    const starSupplier = await prisma.supplier.findFirst({
      where: {
        name: "Nhà cung cấp Home Star",
      },
    });

    if (kitchenCategory && cleaningCategory && homeSupplier && starSupplier) {
      await prisma.product.createMany({
        data: [
          {
            sku: "NOICOM001",
            name: "Nồi cơm điện Homex 1.8L",
            description: "Nồi cơm điện dung tích 1.8L phù hợp gia đình 3-5 người",
            categoryId: kitchenCategory.id,
            supplierId: homeSupplier.id,
            costPrice: 550000,
            salePrice: 790000,
            stockQuantity: 20,
            minStock: 5,
            warrantyMonths: 12,
            qrCode: "NOICOM001",
            imageUrl: null,
            status: "ACTIVE",
          },
          {
            sku: "MAYXAY001",
            name: "Máy xay sinh tố Homex",
            description: "Máy xay sinh tố gia đình công suất 350W",
            categoryId: kitchenCategory.id,
            supplierId: homeSupplier.id,
            costPrice: 420000,
            salePrice: 650000,
            stockQuantity: 15,
            minStock: 4,
            warrantyMonths: 12,
            qrCode: "MAYXAY001",
            imageUrl: null,
            status: "ACTIVE",
          },
          {
            sku: "HUTBUI001",
            name: "Máy hút bụi mini Home Star",
            description: "Máy hút bụi mini dùng cho phòng ngủ và phòng khách",
            categoryId: cleaningCategory.id,
            supplierId: starSupplier.id,
            costPrice: 700000,
            salePrice: 990000,
            stockQuantity: 8,
            minStock: 3,
            warrantyMonths: 18,
            qrCode: "HUTBUI001",
            imageUrl: null,
            status: "ACTIVE",
          },
        ],
      });
    }
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