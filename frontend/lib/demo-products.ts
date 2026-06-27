import { compactProductPrice } from "@/lib/format";
import type { ProductPayload } from "@/services/homex.service";
import type { Category, Supplier } from "@/types/domain";

export const REAL_PRODUCT_FALLBACK_IMAGE = "/assets/real-products/fallback.jpg";

type DemoCategoryCode = "KIT" | "DGD" | "COOK" | "CLEAN" | "STO" | "HOME";

type DemoProductTemplate = {
  categoryCode: DemoCategoryCode;
  categoryKeywords: string[];
  brandCode: string;
  modelPrefix: string;
  name: string;
  description: string;
  imageUrls: string[];
  baseCost: number;
  warrantyMonths: number;
};

function realImage(fileName: string) {
  return `/assets/real-products/${fileName}`;
}

export const sampleProductTemplates: DemoProductTemplate[] = [
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "SH",
    modelPrefix: "NC",
    name: "Nồi cơm điện 1.8L",
    description: "Sản phẩm mẫu - Nồi cơm điện dung tích 1.8L cho gia đình.",
    imageUrls: [realImage("rice-cooker.jpg"), realImage("rice-cooker-02.jpg"), realImage("rice-cooker-03.jpg"), realImage("rice-cooker-04.jpg")],
    baseCost: 520000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "KG",
    modelPrefix: "AS",
    name: "Ấm siêu tốc inox 1.7L",
    description: "Sản phẩm mẫu - Ấm siêu tốc inox dùng cho gia đình và văn phòng.",
    imageUrls: [realImage("electric-kettle.jpg"), realImage("electric-kettle-02.jpg"), realImage("electric-kettle-03.jpg"), realImage("electric-kettle-04.jpg")],
    baseCost: 210000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "PN",
    modelPrefix: "BT",
    name: "Bếp điện từ đơn",
    description: "Sản phẩm mẫu - Bếp điện từ đơn nhỏ gọn cho căn hộ và nhà bếp.",
    imageUrls: [realImage("induction-cooker.jpg"), realImage("induction-cooker-02.jpg"), realImage("induction-cooker-03.jpg"), realImage("induction-cooker-04.jpg")],
    baseCost: 680000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "EL",
    modelPrefix: "LN",
    name: "Lò nướng điện 25L",
    description: "Sản phẩm mẫu - Lò nướng điện dung tích 25L cho gia đình.",
    imageUrls: [realImage("oven.jpg"), realImage("oven-02.jpg"), realImage("oven-03.jpg")],
    baseCost: 980000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "PN",
    modelPrefix: "NCK",
    name: "Nồi chiên không dầu",
    description: "Sản phẩm mẫu - Nồi chiên không dầu dùng cho nấu ăn ít dầu mỡ.",
    imageUrls: [realImage("air-fryer.jpg"), realImage("air-fryer-02.jpg")],
    baseCost: 860000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "KG",
    modelPrefix: "MX",
    name: "Máy xay sinh tố thủy tinh",
    description: "Sản phẩm mẫu - Máy xay sinh tố cối thủy tinh cho nhà bếp.",
    imageUrls: [realImage("blender.jpg")],
    baseCost: 390000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["kit", "thiet bi nha bep", "thiết bị nhà bếp", "nha bep", "nhà bếp", "kitchen"],
    brandCode: "KG",
    modelPrefix: "ME",
    name: "Máy ép trái cây mini",
    description: "Sản phẩm mẫu - Máy ép trái cây mini cho gia đình.",
    imageUrls: [realImage("juicer.jpg")],
    baseCost: 460000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dgd", "dien gia dung", "điện gia dụng", "appliance", "dien", "điện"],
    brandCode: "LG",
    modelPrefix: "ML",
    name: "Máy lọc không khí phòng ngủ",
    description: "Sản phẩm mẫu - Máy lọc không khí cho phòng ngủ và phòng khách.",
    imageUrls: [realImage("air-purifier.jpg"), realImage("air-purifier-02.jpg")],
    baseCost: 1380000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dgd", "dien gia dung", "điện gia dụng", "appliance", "dien", "điện"],
    brandCode: "EL",
    modelPrefix: "HB",
    name: "Máy hút bụi cầm tay",
    description: "Sản phẩm mẫu - Máy hút bụi cầm tay phục vụ vệ sinh nhà cửa.",
    imageUrls: [realImage("vacuum-cleaner.jpg"), realImage("vacuum-cleaner-02.jpg"), realImage("vacuum-cleaner-03.jpg")],
    baseCost: 820000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dgd", "dien gia dung", "điện gia dụng", "appliance", "dien", "điện"],
    brandCode: "SH",
    modelPrefix: "QT",
    name: "Quạt cây điều khiển từ xa",
    description: "Sản phẩm mẫu - Quạt cây điện gia dụng có điều khiển từ xa.",
    imageUrls: [realImage("standing-fan.jpg"), realImage("standing-fan-02.jpg")],
    baseCost: 450000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dgd", "dien gia dung", "điện gia dụng", "appliance", "dien", "điện"],
    brandCode: "SS",
    modelPrefix: "BU",
    name: "Bàn ủi hơi nước",
    description: "Sản phẩm mẫu - Bàn ủi hơi nước cho gia đình.",
    imageUrls: [realImage("steam-iron.jpg")],
    baseCost: 260000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dgd", "dien gia dung", "điện gia dụng", "appliance", "dien", "điện"],
    brandCode: "SS",
    modelPrefix: "MS",
    name: "Máy sấy tóc gia đình",
    description: "Sản phẩm mẫu - Máy sấy tóc gia đình công suất vừa phải.",
    imageUrls: [realImage("hair-dryer.jpg")],
    baseCost: 240000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "COOK",
    categoryKeywords: ["cook", "dung cu nau an", "dụng cụ nấu ăn", "nau an", "nấu ăn", "dao", "chao", "chảo"],
    brandCode: "KG",
    modelPrefix: "CH",
    name: "Chảo chống dính đáy từ",
    description: "Sản phẩm mẫu - Chảo chống dính đáy từ cho bếp gia đình.",
    imageUrls: [realImage("nonstick-pan.jpg")],
    baseCost: 180000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "COOK",
    categoryKeywords: ["cook", "dung cu nau an", "dụng cụ nấu ăn", "nau an", "nấu ăn", "hop", "hộp"],
    brandCode: "LC",
    modelPrefix: "HD",
    name: "Hộp đựng thực phẩm",
    description: "Sản phẩm mẫu - Hộp đựng thực phẩm dùng trong bếp và tủ lạnh.",
    imageUrls: [realImage("food-container.jpg")],
    baseCost: 85000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "CLEAN",
    categoryKeywords: ["clean", "ve sinh", "vệ sinh", "lau", "rac", "rác", "choi", "chổi"],
    brandCode: "HM",
    modelPrefix: "TR",
    name: "Thùng rác nhựa đạp chân",
    description: "Sản phẩm mẫu - Thùng rác nhựa đạp chân cho nhà bếp và nhà vệ sinh.",
    imageUrls: [realImage("trash-bin.jpg"), realImage("trash-bin-02.jpg"), realImage("trash-bin-03.jpg"), realImage("trash-bin-04.jpg")],
    baseCost: 160000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "STO",
    categoryKeywords: ["sto", "luu tru", "lưu trữ", "sap xep", "sắp xếp", "ke", "kệ", "moc", "móc"],
    brandCode: "LC",
    modelPrefix: "KD",
    name: "Kệ để đồ nhà bếp",
    description: "Sản phẩm mẫu - Kệ để đồ nhà bếp giúp tối ưu không gian.",
    imageUrls: [realImage("storage-shelf.jpg"), realImage("storage-shelf-02.jpg"), realImage("storage-shelf-03.jpg")],
    baseCost: 260000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "STO",
    categoryKeywords: ["sto", "luu tru", "lưu trữ", "sap xep", "sắp xếp", "moc", "móc", "quan ao", "quần áo"],
    brandCode: "LC",
    modelPrefix: "MT",
    name: "Móc treo quần áo inox",
    description: "Sản phẩm mẫu - Móc treo quần áo inox dùng cho tủ đồ và ban công.",
    imageUrls: [realImage("hanger.jpg")],
    baseCost: 55000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "HOME",
    categoryKeywords: ["home", "vat dung gia dinh", "vật dụng gia đình", "gia dinh", "gia đình", "tham", "thảm"],
    brandCode: "LC",
    modelPrefix: "TH",
    name: "Thảm sàn phòng khách",
    description: "Sản phẩm mẫu - Thảm sàn mềm dùng cho phòng khách và phòng ngủ.",
    imageUrls: [realImage("floor-carpet.jpg"), realImage("floor-carpet-02.jpg"), realImage("floor-carpet-03.jpg"), realImage("floor-carpet-04.jpg")],
    baseCost: 240000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "HOME",
    categoryKeywords: ["home", "vat dung gia dinh", "vật dụng gia đình", "gia dinh", "gia đình", "den", "đèn"],
    brandCode: "PN",
    modelPrefix: "DN",
    name: "Đèn ngủ cảm ứng",
    description: "Sản phẩm mẫu - Đèn ngủ cảm ứng dùng cho phòng ngủ.",
    imageUrls: [realImage("night-lamp.jpg"), realImage("night-lamp-02.jpg"), realImage("night-lamp-03.jpg")],
    baseCost: 180000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "HOME",
    categoryKeywords: ["home", "vat dung gia dinh", "vật dụng gia đình", "gia dinh", "gia đình", "binh", "bình"],
    brandCode: "PN",
    modelPrefix: "BG",
    name: "Bình giữ nhiệt inox",
    description: "Sản phẩm mẫu - Bình giữ nhiệt inox cho gia đình, văn phòng và du lịch.",
    imageUrls: [realImage("thermos.jpg")],
    baseCost: 140000,
    warrantyMonths: 6,
  },
];

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getCategoryCodeFromName(categoryName: string) {
  const normalizedName = normalizeText(categoryName);
  const codeMatch = categoryName.match(/\(([A-Z]+)\)/);

  if (codeMatch) return codeMatch[1].toUpperCase();
  if (normalizedName.includes("kit") || normalizedName.includes("thiet bi nha bep")) return "KIT";
  if (normalizedName.includes("dgd") || normalizedName.includes("dien gia dung")) return "DGD";
  if (normalizedName.includes("cook") || normalizedName.includes("dung cu nau an")) return "COOK";
  if (normalizedName.includes("clean") || normalizedName.includes("ve sinh")) return "CLEAN";
  if (normalizedName.includes("sto") || normalizedName.includes("luu tru") || normalizedName.includes("sap xep")) return "STO";
  if (normalizedName.includes("home") || normalizedName.includes("vat dung gia dinh")) return "HOME";

  return "";
}

function findCategoryForTemplate(template: DemoProductTemplate, categories: Category[], index: number) {
  const activeCategories = categories.filter((category) => category.status === "ACTIVE");

  const matchedByCode = activeCategories.find((category) => getCategoryCodeFromName(category.name) === template.categoryCode);
  if (matchedByCode) return matchedByCode;

  const matchedByKeyword = activeCategories.find((category) => {
    const categoryName = normalizeText(category.name);
    const categoryDescription = normalizeText(category.description || "");
    return template.categoryKeywords.some((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return categoryName.includes(normalizedKeyword) || categoryDescription.includes(normalizedKeyword);
    });
  });

  return matchedByKeyword || activeCategories[index % activeCategories.length];
}

function buildModelCode(template: DemoProductTemplate, index: number, batchSeed: number) {
  const modelNumber = batchSeed + index + 1;
  return `${template.modelPrefix}${String(modelNumber).padStart(6, "0")}`;
}

function getTemplateImage(template: DemoProductTemplate, index: number) {
  if (template.imageUrls.length === 0) return REAL_PRODUCT_FALLBACK_IMAGE;
  return template.imageUrls[index % template.imageUrls.length];
}

export function resolveRealProductImageFromProductName(productName: string, variantSeed = 0) {
  const name = normalizeText(productName);
  const matchedTemplate = sampleProductTemplates.find((template) => name.includes(normalizeText(template.name)) || name.includes(normalizeText(template.modelPrefix)));

  if (matchedTemplate) return getTemplateImage(matchedTemplate, variantSeed);

  const fallbackRules: Array<{ keywords: string[]; imageUrls: string[] }> = [
    { keywords: ["noi com"], imageUrls: [realImage("rice-cooker.jpg"), realImage("rice-cooker-02.jpg"), realImage("rice-cooker-03.jpg"), realImage("rice-cooker-04.jpg")] },
    { keywords: ["am sieu toc"], imageUrls: [realImage("electric-kettle.jpg"), realImage("electric-kettle-02.jpg"), realImage("electric-kettle-03.jpg"), realImage("electric-kettle-04.jpg")] },
    { keywords: ["bep dien tu"], imageUrls: [realImage("induction-cooker.jpg"), realImage("induction-cooker-02.jpg"), realImage("induction-cooker-03.jpg"), realImage("induction-cooker-04.jpg")] },
    { keywords: ["lo nuong"], imageUrls: [realImage("oven.jpg"), realImage("oven-02.jpg"), realImage("oven-03.jpg")] },
    { keywords: ["may loc khong khi"], imageUrls: [realImage("air-purifier.jpg"), realImage("air-purifier-02.jpg")] },
    { keywords: ["may hut bui"], imageUrls: [realImage("vacuum-cleaner.jpg"), realImage("vacuum-cleaner-02.jpg"), realImage("vacuum-cleaner-03.jpg")] },
    { keywords: ["quat cay"], imageUrls: [realImage("standing-fan.jpg"), realImage("standing-fan-02.jpg")] },
    { keywords: ["thung rac"], imageUrls: [realImage("trash-bin.jpg"), realImage("trash-bin-02.jpg"), realImage("trash-bin-03.jpg"), realImage("trash-bin-04.jpg")] },
    { keywords: ["ke"], imageUrls: [realImage("storage-shelf.jpg"), realImage("storage-shelf-02.jpg"), realImage("storage-shelf-03.jpg")] },
    { keywords: ["tham"], imageUrls: [realImage("floor-carpet.jpg"), realImage("floor-carpet-02.jpg"), realImage("floor-carpet-03.jpg"), realImage("floor-carpet-04.jpg")] },
    { keywords: ["den ngu"], imageUrls: [realImage("night-lamp.jpg"), realImage("night-lamp-02.jpg"), realImage("night-lamp-03.jpg")] },
  ];

  const matchedRule = fallbackRules.find((rule) => rule.keywords.some((keyword) => name.includes(keyword)));
  if (matchedRule) return matchedRule.imageUrls[variantSeed % matchedRule.imageUrls.length];

  return REAL_PRODUCT_FALLBACK_IMAGE;
}

export function buildProductImageFallback() {
  return REAL_PRODUCT_FALLBACK_IMAGE;
}

export function buildDemoProductPayloads(categories: Category[], suppliers: Supplier[], total = 150, batchSeed = 1000): ProductPayload[] {
  const activeCategories = categories.filter((category) => category.status === "ACTIVE");
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "ACTIVE");

  if (activeCategories.length === 0 || activeSuppliers.length === 0) return [];

  return Array.from({ length: total }, (_, index) => {
    const template = sampleProductTemplates[index % sampleProductTemplates.length];
    const modelCode = buildModelCode(template, index, batchSeed);
    const sku = `${template.categoryCode}-${template.brandCode}-${modelCode}`;
    const productName = `${template.name} Homex ${modelCode}`;
    const category = findCategoryForTemplate(template, activeCategories, index);
    const supplier = activeSuppliers[index % activeSuppliers.length];
    const costPrice = template.baseCost + (index % 12) * 15000 + Math.floor(index / 20) * 8000;
    const salePrice = Math.round((costPrice * 1.32) / 1000) * 1000;
    const imageUrl = getTemplateImage(template, Math.floor(index / sampleProductTemplates.length));

    return {
      sku,
      name: productName,
      description: `${template.description} Sản phẩm mẫu Homex - ảnh thật cố định theo template, lưu local trong public/assets/real-products, không dùng ảnh random online.`,
      categoryId: category.id,
      supplierId: supplier.id,
      costPrice: compactProductPrice(costPrice),
      salePrice: compactProductPrice(salePrice),
      stockQuantity: 15 + (index % 45),
      minStock: 5 + (index % 6),
      warrantyMonths: template.warrantyMonths,
      qrCode: sku,
      imageUrl,
    };
  });
}

export function parseProductImportFileContent(content: string): ProductPayload[] {
  const trimmedContent = content.trim();

  if (!trimmedContent) return [];

  if (trimmedContent.startsWith("[") || trimmedContent.startsWith("{")) {
    type ProductImportRow = ProductPayload & { imageBase64?: string; image?: string };
    const parsed = JSON.parse(trimmedContent) as ProductImportRow[] | { items?: ProductImportRow[]; data?: ProductImportRow[] };
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.data) ? parsed.data : [];

    return rows.map((row, index) => ({
      ...row,
      costPrice: compactProductPrice(row.costPrice),
      salePrice: compactProductPrice(row.salePrice),
      originalPrice: row.originalPrice ? compactProductPrice(row.originalPrice) : undefined,
      imageUrl: row.imageUrl || row.image || row.imageBase64 || resolveRealProductImageFromProductName(row.name || "", index),
    }));
  }

  const lines = trimmedContent.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const row = headers.reduce<Record<string, string>>((result, header, valueIndex) => {
      result[header] = values[valueIndex] || "";
      return result;
    }, {});

    return {
      sku: row.sku,
      name: row.name,
      description: row.description || "",
      categoryId: Number(row.categoryId),
      supplierId: Number(row.supplierId),
      costPrice: compactProductPrice(row.costPrice),
      salePrice: compactProductPrice(row.salePrice),
      stockQuantity: Number(row.stockQuantity || 0),
      minStock: Number(row.minStock || 0),
      warrantyMonths: Number(row.warrantyMonths || 0),
      qrCode: row.qrCode || row.sku,
      imageUrl: row.imageUrl || row.image || row.imageBase64 || resolveRealProductImageFromProductName(row.name || "", index),
    };
  });
}
