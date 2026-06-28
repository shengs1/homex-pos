import prisma from "../src/lib/prisma";

async function test() {
  try {
    console.log("Querying settings...");
    const settings = await prisma.setting.findFirst();
    console.log("Raw settings:", settings);
    
    const settingUpsert = await prisma.setting.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        storeName: "Homex POS",
        printPaperSize: "K80",
        currency: "VND",
        defaultPaymentMethod: "CASH",
        enableBarcodeScanner: true,
      },
    });
    console.log("Upserted settings:", settingUpsert);
    
    const formatted = {
      ...settingUpsert,
      maxDiscount: Number(settingUpsert.maxDiscount),
    };
    console.log("Formatted settings:", formatted);
  } catch (error) {
    console.error("Test error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
