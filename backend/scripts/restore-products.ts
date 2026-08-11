import fs from "fs/promises";
import path from "path";
import prisma from "../src/lib/prisma";

async function main() {
  const customFile = process.argv[2];
  const backupDir = path.resolve(process.cwd(), "backups");
  const targetFilePath = customFile
    ? path.resolve(process.cwd(), customFile)
    : path.join(backupDir, "products-backup-latest.json");

  console.log(`🔄 Đang chuẩn bị phôi phục dữ liệu sản phẩm từ: ${targetFilePath}`);

  let rawData = "";
  try {
    rawData = await fs.readFile(targetFilePath, "utf8");
  } catch (err) {
    console.error(`❌ Không tìm thấy tệp sao lưu tại: ${targetFilePath}`);
    process.exit(1);
  }

  const backupData = JSON.parse(rawData);

  if (!Array.isArray(backupData.products)) {
    console.error("❌ Tệp sao lưu không chứa mảng danh sách sản phẩm hợp lệ!");
    process.exit(1);
  }

  console.log(`📊 Thông tin tệp sao lưu:`);
  console.log(`   - Thời gian sao lưu: ${backupData.exportedAt || "Không xác định"}`);
  console.log(`   - Số sản phẩm: ${backupData.products.length}`);

  // 1. Restore Categories
  if (Array.isArray(backupData.categories)) {
    for (const cat of backupData.categories) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: {
          name: cat.name,
          description: cat.description,
          status: cat.status
        },
        create: {
          id: cat.id,
          name: cat.name,
          description: cat.description,
          status: cat.status
        }
      });
    }
    console.log(`✅ Đã đồng bộ ${backupData.categories.length} danh mục sản phẩm.`);
  }

  // 2. Restore Suppliers
  if (Array.isArray(backupData.suppliers)) {
    for (const sup of backupData.suppliers) {
      await prisma.supplier.upsert({
        where: { id: sup.id },
        update: {
          name: sup.name,
          phone: sup.phone,
          email: sup.email,
          taxCode: sup.taxCode,
          address: sup.address,
          status: sup.status
        },
        create: {
          id: sup.id,
          name: sup.name,
          phone: sup.phone,
          email: sup.email,
          taxCode: sup.taxCode,
          address: sup.address,
          status: sup.status
        }
      });
    }
    console.log(`✅ Đã đồng bộ ${backupData.suppliers.length} nhà cung cấp.`);
  }

  // 3. Restore Products
  let restoredCount = 0;
  for (const p of backupData.products) {
    const productPayload = {
      sku: p.sku,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      supplierId: p.supplierId,
      costPrice: p.costPrice,
      salePrice: p.salePrice,
      originalPrice: p.originalPrice ? p.originalPrice : null,
      stockQuantity: p.stockQuantity,
      minStock: p.minStock,
      warrantyMonths: p.warrantyMonths,
      qrCode: p.qrCode || p.sku,
      barcode: p.barcode || null,
      imageUrl: p.imageUrl || null,
      status: p.status || "ACTIVE"
    };

    await prisma.product.upsert({
      where: { sku: p.sku },
      update: productPayload,
      create: productPayload
    });
    restoredCount++;
  }

  console.log(`🎉 Đã khôi phục hoàn tất ${restoredCount} sản phẩm vào cơ sở dữ liệu!`);
}

main()
  .catch((err) => {
    console.error("❌ Lỗi khi khôi phục dữ liệu sản phẩm:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
