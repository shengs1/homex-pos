import type { ProductPayload } from "@/services/homex.service";
import type { Category, Supplier } from "@/types/domain";

type DemoProductTemplate = {
  categoryCode: "KIT" | "DGD" | "CLN" | "BED" | "BAT";
  categoryKeywords: string[];
  brandCode: string;
  modelPrefix: string;
  name: string;
  description: string;
  imageUrl: string;
  baseCost: number;
  warrantyMonths: number;
};

const demoProductTemplates: DemoProductTemplate[] = [
  {
    categoryCode: "KIT",
    categoryKeywords: ["bep", "kitchen", "noi", "chao", "dung cu", "nha bep"],
    brandCode: "SH",
    modelPrefix: "NC",
    name: "Nồi cơm điện cao tần Homex",
    description: "Nồi cơm điện mẫu demo cho khu vực nhà bếp, phù hợp quầy POS đồ gia dụng.",
    imageUrl: "https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=900&q=80",
    baseCost: 520000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["bep", "kitchen", "noi", "chao", "dung cu", "nha bep"],
    brandCode: "KG",
    modelPrefix: "CH",
    name: "Chảo chống dính sâu lòng Homex",
    description: "Chảo chống dính mẫu demo, dùng ảnh và SKU theo nhóm nhà bếp.",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
    baseCost: 180000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["bep", "kitchen", "noi", "chao", "dung cu", "nha bep"],
    brandCode: "EL",
    modelPrefix: "MX",
    name: "Máy xay sinh tố thủy tinh Homex",
    description: "Máy xay sinh tố mẫu demo cho danh mục nhà bếp.",
    imageUrl: "https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?auto=format&fit=crop&w=900&q=80",
    baseCost: 390000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "KIT",
    categoryKeywords: ["bep", "kitchen", "noi", "chao", "dung cu", "nha bep"],
    brandCode: "PN",
    modelPrefix: "BT",
    name: "Bếp điện từ đơn Homex",
    description: "Bếp điện từ mẫu demo theo nhóm nhà bếp.",
    imageUrl: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80",
    baseCost: 690000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dien", "gia dung", "appliance", "quat", "may", "electric"],
    brandCode: "SH",
    modelPrefix: "QT",
    name: "Quạt cây điều khiển từ xa Homex",
    description: "Quạt cây mẫu demo cho danh mục điện gia dụng.",
    imageUrl: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=900&q=80",
    baseCost: 450000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dien", "gia dung", "appliance", "quat", "may", "electric"],
    brandCode: "LG",
    modelPrefix: "ML",
    name: "Máy lọc không khí phòng ngủ Homex",
    description: "Máy lọc không khí mẫu demo cho danh mục điện gia dụng.",
    imageUrl: "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=80",
    baseCost: 1380000,
    warrantyMonths: 24,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dien", "gia dung", "appliance", "quat", "may", "electric"],
    brandCode: "SS",
    modelPrefix: "MS",
    name: "Máy sấy tóc ion âm Homex",
    description: "Máy sấy tóc mẫu demo thuộc nhóm điện gia dụng.",
    imageUrl: "https://images.unsplash.com/photo-1522338140262-f46f5913618a?auto=format&fit=crop&w=900&q=80",
    baseCost: 260000,
    warrantyMonths: 12,
  },
  {
    categoryCode: "DGD",
    categoryKeywords: ["dien", "gia dung", "appliance", "quat", "may", "electric"],
    brandCode: "EL",
    modelPrefix: "HB",
    name: "Máy hút bụi cầm tay Homex",
    description: "Máy hút bụi mẫu demo thuộc nhóm điện gia dụng.",
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
    baseCost: 820000,
    warrantyMonths: 18,
  },
  {
    categoryCode: "CLN",
    categoryKeywords: ["ve sinh", "lau", "clean", "choi", "mop"],
    brandCode: "LC",
    modelPrefix: "LN",
    name: "Cây lau nhà xoay 360 Homex",
    description: "Bộ lau nhà mẫu demo cho nhóm vệ sinh nhà cửa.",
    imageUrl: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=80",
    baseCost: 145000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "CLN",
    categoryKeywords: ["ve sinh", "lau", "clean", "choi", "mop"],
    brandCode: "HM",
    modelPrefix: "TR",
    name: "Thùng rác inox đạp chân Homex",
    description: "Thùng rác inox mẫu demo cho nhóm vệ sinh nhà cửa.",
    imageUrl: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=900&q=80",
    baseCost: 210000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "BED",
    categoryKeywords: ["phong ngu", "bed", "chan", "ga", "goi"],
    brandCode: "ED",
    modelPrefix: "GG",
    name: "Bộ ga gối cotton Homex",
    description: "Bộ ga gối mẫu demo cho nhóm phòng ngủ.",
    imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
    baseCost: 320000,
    warrantyMonths: 6,
  },
  {
    categoryCode: "BAT",
    categoryKeywords: ["phong tam", "bath", "tam", "khan", "bathroom"],
    brandCode: "BL",
    modelPrefix: "VS",
    name: "Vòi sen tăng áp Homex",
    description: "Vòi sen mẫu demo cho nhóm phòng tắm.",
    imageUrl: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80",
    baseCost: 175000,
    warrantyMonths: 12,
  },
];

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findTemplatesForCategory(category: Category) {
  const normalizedName = normalizeText(category.name);
  const matchedTemplates = demoProductTemplates.filter((template) => template.categoryKeywords.some((keyword) => normalizedName.includes(normalizeText(keyword))));
  return matchedTemplates.length > 0 ? matchedTemplates : demoProductTemplates;
}

function buildModelCode(template: DemoProductTemplate, itemIndex: number) {
  const modelNumber = 18 + (itemIndex % 82);
  return `${template.modelPrefix}${String(modelNumber).padStart(2, "0")}`;
}

function buildSku(template: DemoProductTemplate, itemIndex: number) {
  const modelCode = buildModelCode(template, itemIndex);
  return `${template.categoryCode}-${template.brandCode}-${modelCode}`;
}

export function buildDemoProductPayloads(categories: Category[], suppliers: Supplier[], total = 150): ProductPayload[] {
  const activeCategories = categories.filter((category) => category.status === "ACTIVE");
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "ACTIVE");

  if (activeCategories.length === 0 || activeSuppliers.length === 0) return [];

  return Array.from({ length: total }, (_, index) => {
    const category = activeCategories[index % activeCategories.length];
    const supplier = activeSuppliers[index % activeSuppliers.length];
    const templates = findTemplatesForCategory(category);
    const template = templates[index % templates.length];
    const sku = buildSku(template, index);
    const modelCode = buildModelCode(template, index);
    const costPrice = template.baseCost + (index % 12) * 17000 + Math.floor(index / 12) * 9000;
    const salePrice = Math.round(costPrice * 1.32 / 1000) * 1000;

    return {
      sku,
      name: `${template.name} ${modelCode}`,
      description: `${template.description} SKU được ghép theo công thức ${template.categoryCode}-${template.brandCode}-${modelCode}, không dùng chuỗi ngẫu nhiên.`,
      categoryId: category.id,
      supplierId: supplier.id,
      costPrice,
      salePrice,
      stockQuantity: 15 + (index % 55),
      minStock: 5 + (index % 7),
      warrantyMonths: template.warrantyMonths,
      qrCode: sku,
      imageUrl: template.imageUrl,
    };
  });
}

export function parseProductImportFileContent(content: string): ProductPayload[] {
  const trimmedContent = content.trim();

  if (!trimmedContent) return [];

  if (trimmedContent.startsWith("[") || trimmedContent.startsWith("{")) {
    type ProductImportRow = ProductPayload & { imageBase64?: string };
    const parsed = JSON.parse(trimmedContent) as ProductImportRow[] | { items?: ProductImportRow[]; data?: ProductImportRow[] };
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.data) ? parsed.data : [];

    return rows.map((row) => ({
      ...row,
      imageUrl: row.imageUrl || row.imageBase64 || "",
    }));
  }

  const lines = trimmedContent.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row = headers.reduce<Record<string, string>>((result, header, index) => {
      result[header] = values[index] || "";
      return result;
    }, {});

    return {
      sku: row.sku,
      name: row.name,
      description: row.description || "",
      categoryId: Number(row.categoryId),
      supplierId: Number(row.supplierId),
      costPrice: Number(row.costPrice),
      salePrice: Number(row.salePrice),
      stockQuantity: Number(row.stockQuantity || 0),
      minStock: Number(row.minStock || 0),
      warrantyMonths: Number(row.warrantyMonths || 0),
      qrCode: row.qrCode || row.sku,
      imageUrl: row.imageUrl || row.imageBase64 || "",
    };
  });
}
