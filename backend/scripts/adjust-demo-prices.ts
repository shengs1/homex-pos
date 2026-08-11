import prisma from "../src/lib/prisma";

const PROPORTIONAL_PRICES: Record<number, { costPrice: number; salePrice: number; originalPrice?: number }> = {
  // Tủ lạnh (Large Appliances: 8,800 - 9,500)
  37: { salePrice: 9500, costPrice: 6800, originalPrice: 10500 }, // Samsung Refrigerator
  39: { salePrice: 8800, costPrice: 6200, originalPrice: 9800 },  // Haier Refrigerator
  38: { salePrice: 5500, costPrice: 4000, originalPrice: 6200 },  // Midea Refrigerator

  // Máy hút bụi & Robot (Large / Mid: 5,200 - 8,500)
  16: { salePrice: 8500, costPrice: 6000, originalPrice: 9500 },  // Roborock S5
  15: { salePrice: 5200, costPrice: 3800, originalPrice: 6000 },  // Bissell Steam Mop

  // Cây lau nhà (Mid / Small: 3,500 - 4,200)
  13: { salePrice: 4200, costPrice: 3000, originalPrice: 4800 },  // Bona Mop
  14: { salePrice: 3500, costPrice: 2500, originalPrice: 4000 },  // Rubbermaid Mop

  // Lọc không khí (Large / Mid: 4,500 - 9,000)
  26: { salePrice: 9000, costPrice: 6500, originalPrice: 10000 }, // Austin Healthmate Air Purifier
  27: { salePrice: 8800, costPrice: 6300, originalPrice: 9800 },  // Healthmate Plus White
  25: { salePrice: 6200, costPrice: 4500, originalPrice: 7000 },  // Medify Air Purifier
  28: { salePrice: 2200, costPrice: 1500, originalPrice: 2600 },  // BAPF30 Air Purifier Filter

  // Nồi cơm điện (Mid: 3,800 - 8,000)
  8:  { salePrice: 8000, costPrice: 5800, originalPrice: 9000 },  // Nồi cơm Lock&Lock 1L
  10: { salePrice: 4700, costPrice: 3400, originalPrice: 5500 },  // Aroma 8-Cup Digital Rice Multicooker
  9:  { salePrice: 3800, costPrice: 2700, originalPrice: 4500 },  // Aroma 6-Cup Rice Cooker

  // Ấm siêu tốc (Mid / Small: 3,600 - 4,000)
  12: { salePrice: 4000, costPrice: 2800, originalPrice: 4800 },  // Electric Tea Kettle 1.7L
  11: { salePrice: 3600, costPrice: 2500, originalPrice: 4200 },  // Ovente Electric Kettle

  // Dụng cụ nấu ăn & Bộ nồi chảo (Mid / Large: 4,500 - 7,800)
  23: { salePrice: 7800, costPrice: 5600, originalPrice: 8800 },  // Ninja Foodi 8-Piece Set
  21: { salePrice: 7500, costPrice: 5400, originalPrice: 8500 },  // T-fal Ingenio Cookware Set
  24: { salePrice: 6500, costPrice: 4700, originalPrice: 7300 },  // Legend Cookware 5 Quart Pot
  22: { salePrice: 4500, costPrice: 3200, originalPrice: 5200 },  // CONCORD Steamer Cookware Set

  // Ổ cắm & Thiết bị điện (Small: 1,200 - 3,600)
  30: { salePrice: 3600, costPrice: 2500, originalPrice: 4200 },  // POWERADD Power Strip 6 Outlets
  31: { salePrice: 3200, costPrice: 2200, originalPrice: 3800 },  // Iron Forge Cable Extension Cord
  29: { salePrice: 2800, costPrice: 1900, originalPrice: 3300 },  // Radiant 2-Outlet Power Strip
  32: { salePrice: 1200, costPrice: 800,  originalPrice: 1500 },  // LOHAS LED Refrigerator Light Bulb

  // Đồ dùng gia đình & Hộp đựng (Small / Mid: 1,800 - 3,000)
  20: { salePrice: 3000, costPrice: 2100, originalPrice: 3500 },  // Cosco Outdoor Storage Box
  17: { salePrice: 2800, costPrice: 1900, originalPrice: 3200 },  // Sterilite 85L Storage Box
  19: { salePrice: 2700, costPrice: 1800, originalPrice: 3200 },  // LEGO Storage Brick
  18: { salePrice: 1800, costPrice: 1200, originalPrice: 2200 },  // Sterilite 30Qt Storage Box

  // Đồ phòng tắm (Small: 1,400 - 1,800)
  36: { salePrice: 1800, costPrice: 1200, originalPrice: 2200 },  // Vanderbilt Shower Caddy
  35: { salePrice: 1600, costPrice: 1100, originalPrice: 2000 },  // Skip Hop Bath Mat
  33: { salePrice: 1500, costPrice: 1000, originalPrice: 1800 },  // Binffeey Shower Shelf
  34: { salePrice: 1400, costPrice: 900,  originalPrice: 1700 },  // Rubber Bath Mat

  // Khác (Small: 1,000)
  7:  { salePrice: 1000, costPrice: 600,  originalPrice: 1000 },  // Nước tinh khiết Dasani 1.5L
};

async function main() {
  console.log("🛠️ Đang cập nhật bảng giá DEMO tỷ lệ chuẩn (1.000đ - 9.500đ) cho tất cả sản phẩm...");

  const products = await prisma.product.findMany();
  let updatedCount = 0;

  for (const p of products) {
    const customPrice = PROPORTIONAL_PRICES[p.id];

    let salePrice: number;
    let costPrice: number;
    let originalPrice: number | undefined;

    if (customPrice) {
      salePrice = customPrice.salePrice;
      costPrice = customPrice.costPrice;
      originalPrice = customPrice.originalPrice;
    } else {
      // Fallback proportionally for any newly added product
      const currentPrice = Number(p.salePrice);
      if (currentPrice > 10000) {
        salePrice = Math.min(Math.round(currentPrice / 1000), 9500);
      } else {
        salePrice = Math.max(Math.min(currentPrice, 9500), 1000);
      }
      costPrice = Math.round(salePrice * 0.7);
      originalPrice = Math.round(salePrice * 1.15);
    }

    await prisma.product.update({
      where: { id: p.id },
      data: {
        salePrice,
        costPrice,
        originalPrice: originalPrice || null
      }
    });

    console.log(`  [OK] Product #${p.id} (${p.name.substring(0, 35)}...): Giá bán = ${salePrice.toLocaleString("vi-VN")}đ | Giá vốn = ${costPrice.toLocaleString("vi-VN")}đ`);
    updatedCount++;
  }

  console.log(`\n🎉 Đã cập nhật giá DEMO tỉ lệ chuẩn cho ${updatedCount} sản phẩm!`);
}

main()
  .catch((err) => {
    console.error("❌ Lỗi khi cập nhật giá:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
