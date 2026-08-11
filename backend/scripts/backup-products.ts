import fs from "fs/promises";
import path from "path";
import prisma from "../src/lib/prisma";

async function main() {
  console.log("📦 Đang khởi tạo quá trình sao lưu dữ liệu sản phẩm...");

  // 1. Fetch Categories, Suppliers, Products
  const categories = await prisma.category.findMany({ orderBy: { id: "asc" } });
  const suppliers = await prisma.supplier.findMany({ orderBy: { id: "asc" } });
  const products = await prisma.product.findMany({
    orderBy: { id: "asc" },
    include: {
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } }
    }
  });

  const backupData = {
    exportedAt: new Date().toISOString(),
    totalCategories: categories.length,
    totalSuppliers: suppliers.length,
    totalProducts: products.length,
    categories,
    suppliers,
    products
  };

  // 2. Prepare output folder
  const backupDir = path.resolve(process.cwd(), "backups");
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filenameDated = path.join(backupDir, `products-backup-${timestamp}.json`);
  const filenameLatest = path.join(backupDir, `products-backup-latest.json`);

  const jsonContent = JSON.stringify(backupData, null, 2);

  await fs.writeFile(filenameDated, jsonContent, "utf8");
  await fs.writeFile(filenameLatest, jsonContent, "utf8");

  console.log(`✅ Sao lưu thành công!`);
  console.log(`   - Tổng danh mục: ${categories.length}`);
  console.log(`   - Tổng nhà cung cấp: ${suppliers.length}`);
  console.log(`   - Tổng sản phẩm: ${products.length}`);
  console.log(`📂 Đã lưu tệp sao lưu tại:`);
  console.log(`   1. ${filenameLatest}`);
  console.log(`   2. ${filenameDated}`);
}

main()
  .catch((err) => {
    console.error("❌ Lỗi khi sao lưu dữ liệu:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
