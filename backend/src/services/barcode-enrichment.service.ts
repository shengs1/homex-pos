import OpenAI from "openai";
import prisma from "../lib/prisma";

export type EnrichedProductSource = "DATABASE" | "UPCITEMDB" | "BARCODE_SPIDER" | "BARCODE_LOOKUP" | "OPEN_FOOD_FACTS" | "OPEN_PRODUCTS_FACTS" | "ICHECK" | "AI" | "HYBRID";

export type EnrichedProductData = {
  barcode: string;
  name?: string;
  category?: string;
  brand?: string;
  supplierName?: string;
  unit?: string;
  estimatedImportPrice?: number;
  estimatedSalePrice?: number;
  originalPrice?: number;
  warrantyMonths?: number;
  stockQuantity?: number;
  minStock?: number;
  imageUrl?: string;
  description?: string;
  source: EnrichedProductSource;
  missingFields?: string[];
  confidence?: number;
  existingProductId?: number;
};

const externalTimeoutMs = 35000;
const maxDescriptionLength = 500;

function normalizePrice(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return undefined;
  return Math.round(numberValue >= 10000 ? numberValue / 1000 : numberValue);
}

function cleanString(value: unknown, maxLength = 250) {
  if (typeof value !== "string") return undefined;
  const cleanValue = value.trim().replace(/\s+/g, " ");
  if (!cleanValue) return undefined;
  return cleanValue.slice(0, maxLength);
}

function cleanImageUrl(value: unknown) {
  const cleanValue = cleanString(value, 500);
  if (!cleanValue) return undefined;

  try {
    const url = new URL(cleanValue);
    if (url.protocol === "http:" || url.protocol === "https:") return cleanValue;
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeDescription(value: unknown) {
  return cleanString(value, maxDescriptionLength);
}

function isBadBrand(value?: string) {
  const normalized = normalizeText(value || "");
  return !normalized || normalized.includes("icheck") || normalized.includes("mang xa hoi san pham");
}

function buildCleanDescription(data: Partial<EnrichedProductData>) {
  const name = cleanString(data.name, 180);
  if (!name) return undefined;
  const unit = cleanString(data.unit, 40);
  const parts = [name];
  if (unit && normalizeText(unit) !== "cai" && !normalizeText(name).includes(normalizeText(unit))) parts.push(`quy cách ${unit}`);
  return `${parts.join(", ")}.`;
}

function sanitizeDescriptionAgainstProduct(value: unknown, data: Partial<EnrichedProductData>) {
  const description = normalizeDescription(value);
  if (!description) return undefined;
  const normalized = normalizeText(description);
  if (normalized.includes("icheck") || normalized.includes("du lieu ma vach") || normalized.includes("ai") || normalized.includes("kiem tra lai truoc khi luu") || normalized.includes("thuoc nhom") || normalized.includes("home garden")) {
    return buildCleanDescription(data);
  }
  return description;
}


function removeVietnameseTones(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeText(value: string) {
  return removeVietnameseTones(value).toLowerCase().trim().replace(/\s+/g, " ");
}

function extractCategoryCode(value: string) {
  return value.match(/\(([A-Z0-9]{2,8})\)/i)?.[1]?.toUpperCase() || "";
}

function getCategoryAliases(value: string) {
  const normalized = normalizeText(value);
  const code = extractCategoryCode(value).toLowerCase();
  const aliases = new Set([normalized, code]);

  if (/kitchen|nha bep|thiet bi nha bep/.test(normalized) || code === "kit") aliases.add("kit");
  if (/clean|lam sach|ve sinh|care/.test(normalized) || code === "care") aliases.add("care");
  if (/util|do dung gia dinh|vat dung gia dinh|home goods/.test(normalized) || code === "util") aliases.add("util");
  if (/other|khac|ngoai pham tru|do choi|toy|bang keo|y te|medical|beverage|drink|water|nuoc|food|thuc pham/.test(normalized) || code === "other") aliases.add("other");
  if (/cook|dung cu nau an|nau an|pan|pot|chao|noi/.test(normalized) || code === "cook") aliases.add("cook");
  if (/cool|lam mat|quat|fan|air conditioner/.test(normalized) || code === "cool") aliases.add("cool");
  if (/elec|dien|electric|electrical/.test(normalized) || code === "elec") aliases.add("elec");
  if (/bath|phong tam|bathroom/.test(normalized) || code === "bath") aliases.add("bath");

  return Array.from(aliases).filter(Boolean);
}

async function normalizeCategoryToExisting(categoryName?: string) {
  const cleanCategory = cleanString(categoryName, 120);
  if (!cleanCategory) return undefined;

  const categories = await prisma.category.findMany({
    where: { status: "ACTIVE" },
    select: { name: true },
  });
  const inputAliases = getCategoryAliases(cleanCategory);
  const inputNormalized = normalizeText(cleanCategory);

  const matchedCategory = categories.find((category) => {
    const categoryNormalized = normalizeText(category.name);
    const categoryAliases = getCategoryAliases(category.name);

    return (
      categoryNormalized === inputNormalized ||
      categoryNormalized.includes(inputNormalized) ||
      inputNormalized.includes(categoryNormalized) ||
      inputAliases.some((alias) => categoryAliases.includes(alias))
    );
  });

  return matchedCategory?.name || cleanCategory;
}

async function normalizeEnrichedCategory<T extends Partial<EnrichedProductData>>(data: T) {
  if (!data.category) return data;
  return {
    ...data,
    category: await normalizeCategoryToExisting(data.category),
  };
}

function getSupplierMatchWords(supplierName: string) {
  return normalizeText(supplierName)
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 3 && !["cong", "ty", "tnhh", "co", "phan", "tap", "doan", "viet", "nam", "thuong", "hieu", "nha", "cung", "cap"].includes(word));
}

async function normalizeSupplierToExisting(data: Partial<EnrichedProductData>) {
  const suppliers = await prisma.supplier.findMany({
    where: { status: "ACTIVE" },
    select: { name: true },
  });
  const fallbackSupplier = suppliers.find((supplier) => normalizeText(supplier.name) === normalizeText("Nhà cung cấp lẻ"));
  const productIdentityText = normalizeText(`${data.brand || ""} ${data.name || ""}`);

  const identityMatchedSupplier = suppliers.find((supplier) => {
    const words = getSupplierMatchWords(supplier.name);
    return words.length > 0 && words.some((word) => productIdentityText.includes(word));
  });
  if (identityMatchedSupplier) return identityMatchedSupplier.name;

  const requestedSupplier = normalizeText(data.supplierName || "");
  const explicitMatchedSupplier = suppliers.find((supplier) => {
    const supplierName = normalizeText(supplier.name);
    return Boolean(requestedSupplier) && (
      supplierName === requestedSupplier ||
      supplierName.includes(requestedSupplier) ||
      requestedSupplier.includes(supplierName)
    );
  });
  if (explicitMatchedSupplier) return explicitMatchedSupplier.name;

  return fallbackSupplier?.name || "Nhà cung cấp lẻ";
}

async function normalizeEnrichedSupplier<T extends Partial<EnrichedProductData>>(data: T) {
  return {
    ...data,
    supplierName: await normalizeSupplierToExisting(data),
  };
}


function calculateMissingFields(data: Partial<EnrichedProductData>) {
  const missingFields: string[] = [];
  if (!data.name) missingFields.push("name");
  if (!data.category) missingFields.push("category");
  if (typeof data.estimatedSalePrice !== "number") missingFields.push("estimatedSalePrice");
  if (!data.imageUrl && !data.description) missingFields.push("imageUrlOrDescription");
  return missingFields;
}

function hasEnoughData(data: Partial<EnrichedProductData>) {
  return calculateMissingFields(data).length === 0;
}

function calculateAiSuggestionFields(data: Partial<EnrichedProductData>) {
  const fields = calculateMissingFields(data);
  if (typeof data.estimatedImportPrice !== "number") fields.push("estimatedImportPrice");
  if (typeof data.originalPrice !== "number") fields.push("originalPrice");
  if (typeof data.stockQuantity !== "number") fields.push("stockQuantity");
  if (typeof data.minStock !== "number") fields.push("minStock");
  if (typeof data.warrantyMonths !== "number") fields.push("warrantyMonths");
  if (!data.description) fields.push("description");
  if (!data.supplierName) fields.push("supplierName");
  return Array.from(new Set(fields));
}


function hasUsefulData(data: Partial<EnrichedProductData>) {
  return Boolean(data.name || data.category || data.imageUrl || data.description || data.estimatedSalePrice || data.estimatedImportPrice || data.originalPrice || data.stockQuantity || data.minStock || data.warrantyMonths || data.supplierName || data.brand);
}

function hasIdentityData(data: Partial<EnrichedProductData>) {
  return Boolean(data.name || data.brand || data.category);
}

function hasTrustedProductName(data: Partial<EnrichedProductData>) {
  const name = cleanString(data.name, 150);
  if (!name) return false;
  const normalized = normalizeText(name);
  if (normalized.length < 3) return false;
  if (/^san pham\s+\d+$/i.test(normalized)) return false;
  if (/unknown|khong ro|not found|barcode|ma vach/.test(normalized)) return false;
  return true;
}

function getImportantWords(value: unknown) {
  const normalized = normalizeText(String(value || ""));
  const stopWords = new Set([
    "san",
    "pham",
    "product",
    "hang",
    "chinh",
    "the",
    "and",
    "with",
    "for",
    "cua",
    "voi",
    "loai",
  ]);

  return normalized
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function hasWordOverlap(candidate: unknown, evidenceValues: unknown[]) {
  const candidateWords = getImportantWords(candidate);
  if (candidateWords.length === 0) return false;

  const evidenceWords = new Set(evidenceValues.flatMap(getImportantWords));
  if (evidenceWords.size === 0) return false;

  return candidateWords.some((word) => evidenceWords.has(word));
}

function sanitizeAiDataAgainstExternal(
  aiData: Partial<EnrichedProductData>,
  externalData: Partial<EnrichedProductData>
) {
  const cleanAi = sanitizePartialData(aiData);
  const evidence = [
    externalData.name,
    externalData.brand,
    externalData.category,
    externalData.description,
  ].filter(Boolean);

  if (!hasTrustedProductName(externalData)) {
    delete cleanAi.name;
    delete cleanAi.brand;
  } else if (cleanAi.name && !hasWordOverlap(cleanAi.name, evidence)) {
    delete cleanAi.name;
  }

  if (cleanAi.description && cleanAi.name && !hasWordOverlap(cleanAi.description, [cleanAi.name, ...evidence])) {
    delete cleanAi.description;
  }

  return cleanAi;
}

function isOutOfScopeRetailProduct(data: Partial<EnrichedProductData>) {
  const text = normalizeText(`${data.name || ""} ${data.category || ""} ${data.description || ""}`);
  return /sua|nuoc|chai|hop|goi|thuc pham|food|drink|beverage|kem|banh|keo|tra|ca phe|coffee|gia vi|dau an|do choi|toy|bang keo|y te|medical|thuoc|bandage/.test(text);
}
function isConsumableProduct(data: Partial<EnrichedProductData>) {
  const text = normalizeText(`${data.name || ""} ${data.category || ""} ${data.description || ""}`);
  return /sua|nuoc|chai|hop|goi|thuc pham|food|drink|beverage|kem|banh|keo|tra|ca phe|coffee|gia vi|dau an/.test(text);
}

function roundToNicePrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value < 10) return Math.max(1, Math.round(value));
  return Math.max(1, Math.round(value / 5) * 5);
}

function applyAiOperationalSuggestions(data: EnrichedProductData) {
  if (!hasTrustedProductName(data)) return data;

  const suggested = { ...data };
  const consumable = isConsumableProduct(suggested);
  const outOfScope = isOutOfScopeRetailProduct(suggested);

  if (outOfScope) {
    suggested.category = "Khác (OTHER)";
    suggested.supplierName = "Nhà cung cấp lẻ";
  }

  if (typeof suggested.estimatedSalePrice === "number") {
    if (typeof suggested.estimatedImportPrice !== "number" || suggested.estimatedImportPrice >= suggested.estimatedSalePrice) {
      suggested.estimatedImportPrice = roundToNicePrice(suggested.estimatedSalePrice * (consumable ? 0.78 : 0.72));
    }
    if (
      typeof suggested.originalPrice !== "number" ||
      suggested.originalPrice <= suggested.estimatedSalePrice ||
      suggested.originalPrice > suggested.estimatedSalePrice * 2
    ) {
      suggested.originalPrice = roundToNicePrice(suggested.estimatedSalePrice * (consumable ? 1.12 : 1.18));
    }
  } else if (typeof suggested.estimatedImportPrice === "number") {
    suggested.estimatedSalePrice = roundToNicePrice(suggested.estimatedImportPrice * (consumable ? 1.25 : 1.35));
    suggested.originalPrice = roundToNicePrice((suggested.estimatedSalePrice || suggested.estimatedImportPrice) * (consumable ? 1.12 : 1.18));
  }

  if (typeof suggested.stockQuantity !== "number") {
    suggested.stockQuantity = consumable ? 30 : 10;
  }
  if (typeof suggested.minStock !== "number") {
    suggested.minStock = consumable ? 5 : 2;
  }
  if (typeof suggested.warrantyMonths !== "number") {
    suggested.warrantyMonths = consumable ? 0 : 12;
  }
  suggested.description = sanitizeDescriptionAgainstProduct(suggested.description, suggested) || buildCleanDescription(suggested);

  return suggested;
}
function sanitizePartialData(data: Partial<EnrichedProductData>) {
  const cleanData: Partial<EnrichedProductData> = {};
  cleanData.barcode = cleanString(data.barcode, 100);
  cleanData.name = cleanString(data.name, 150);
  cleanData.category = cleanString(data.category, 120);
  cleanData.brand = isBadBrand(cleanString(data.brand, 120)) ? undefined : cleanString(data.brand, 120);
  cleanData.supplierName = cleanString(data.supplierName, 150);
  cleanData.unit = cleanString(data.unit, 40);
  cleanData.estimatedImportPrice = normalizePrice(data.estimatedImportPrice);
  cleanData.estimatedSalePrice = normalizePrice(data.estimatedSalePrice);
  cleanData.originalPrice = normalizePrice(data.originalPrice);
  if (cleanData.estimatedImportPrice === 0) delete cleanData.estimatedImportPrice;
  if (cleanData.estimatedSalePrice === 0) delete cleanData.estimatedSalePrice;
  if (cleanData.originalPrice === 0) delete cleanData.originalPrice;
  cleanData.warrantyMonths = normalizePrice(data.warrantyMonths);
  cleanData.stockQuantity = normalizePrice(data.stockQuantity);
  cleanData.minStock = normalizePrice(data.minStock);
  cleanData.imageUrl = cleanImageUrl(data.imageUrl);
  cleanData.description = sanitizeDescriptionAgainstProduct(data.description, cleanData);
  if (["DATABASE", "UPCITEMDB", "BARCODE_SPIDER", "BARCODE_LOOKUP", "OPEN_FOOD_FACTS", "OPEN_PRODUCTS_FACTS", "ICHECK", "AI", "HYBRID"].includes(String(data.source))) {
    cleanData.source = data.source;
  }
  cleanData.confidence = typeof data.confidence === "number" ? Math.min(1, Math.max(0, data.confidence)) : undefined;
  cleanData.existingProductId = typeof data.existingProductId === "number" ? data.existingProductId : undefined;
  return cleanData;
}

export function mergeEnrichedData(
  externalData: Partial<EnrichedProductData>,
  aiData: Partial<EnrichedProductData>
): EnrichedProductData {
  const external = sanitizePartialData(externalData);
  const ai = sanitizePartialData(aiData);
  const merged: EnrichedProductData = {
    barcode: external.barcode || ai.barcode || "",
    source: external.source && ai.source ? "HYBRID" : (external.source || ai.source || "HYBRID") as EnrichedProductSource,
  };

  for (const key of [
    "name",
    "category",
    "brand",
    "supplierName",
    "unit",
    "estimatedImportPrice",
    "estimatedSalePrice",
    "originalPrice",
    "warrantyMonths",
    "stockQuantity",
    "minStock",
    "imageUrl",
    "description",
    "confidence",
    "existingProductId",
  ] as const) {
    const externalValue = external[key];
    const aiValue = ai[key];
    (merged as any)[key] = externalValue !== undefined && externalValue !== "" ? externalValue : aiValue;
  }

  merged.missingFields = calculateMissingFields(merged);
  return merged;
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), externalTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "HomexPOS/1.0 barcode enrichment",
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function shouldWarnLookupError(error: unknown) {
  const status = (error as { status?: number })?.status;
  return status !== 404 && status !== 429;
}

async function lookupUpcItemDb(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  const apiKey = process.env.UPCITEMDB_API_KEY?.trim();
  const endpoint = apiKey
    ? "https://api.upcitemdb.com/prod/v1/lookup"
    : "https://api.upcitemdb.com/prod/trial/lookup";

  try {
    const data = await fetchJsonWithTimeout(`${endpoint}?upc=${encodeURIComponent(barcode)}`, apiKey ? {
      headers: { user_key: apiKey, key_type: "3scale" },
    } : undefined);
    const item = Array.isArray(data?.items) ? data.items[0] : null;
    if (!item) return null;

    const offer = Array.isArray(item.offers) ? item.offers.find((entry: any) => entry?.price) : null;
    return {
      barcode,
      name: item.title,
      brand: item.brand,
      category: item.category,
      estimatedSalePrice: normalizePrice(offer?.price),
      imageUrl: Array.isArray(item.images) ? item.images[0] : undefined,
      description: item.description,
      source: "UPCITEMDB",
      confidence: 0.82,
    };
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("UPCitemdb barcode lookup failed:", error);
    return null;
  }
}

async function lookupBarcodeSpider(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  const apiKey = process.env.BARCODE_SPIDER_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const data = await fetchJsonWithTimeout(`https://api.barcodespider.com/v1/lookup?token=${encodeURIComponent(apiKey)}&upc=${encodeURIComponent(barcode)}`);
    const item = Array.isArray(data?.item_response) ? data.item_response[0] : data?.item_response;
    if (!item) return null;

    return {
      barcode,
      name: item.title || item.item_name,
      brand: item.brand,
      category: item.category,
      estimatedSalePrice: normalizePrice(item.lowest_recorded_price || item.highest_recorded_price),
      imageUrl: item.image,
      description: item.description,
      source: "BARCODE_SPIDER",
      confidence: 0.8,
    };
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("Barcode Spider lookup failed:", error);
    return null;
  }
}

async function lookupBarcodeLookup(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  const apiKey = process.env.BARCODE_LOOKUP_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const data = await fetchJsonWithTimeout(`https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&key=${encodeURIComponent(apiKey)}`);
    const item = Array.isArray(data?.products) ? data.products[0] : null;
    if (!item) return null;

    const firstStore = Array.isArray(item.stores) ? item.stores.find((store: any) => store?.sale_price || store?.price) : null;
    const features = Array.isArray(item.features) ? item.features.filter(Boolean).join(". ") : "";
    const description = item.description || features || item.model || item.mpn;

    return {
      barcode,
      name: item.title,
      brand: item.brand || item.manufacturer,
      category: item.category,
      estimatedSalePrice: normalizePrice(firstStore?.sale_price || firstStore?.price),
      imageUrl: Array.isArray(item.images) ? item.images[0] : undefined,
      description,
      source: "BARCODE_LOOKUP",
      confidence: 0.84,
    };
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("Barcode Lookup lookup failed:", error);
    return null;
  }
}

async function lookupOpenFoodFacts(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  try {
    const data = await fetchJsonWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    const product = data?.product;
    if (!product || data?.status !== 1) return null;

    const name = product.product_name || product.generic_name;
    const category = product.categories_tags?.[0]?.replace(/^en:/, "") || product.categories;
    const description = product.generic_name || product.ingredients_text;
    if (!name && !category && !description) return null;

    return {
      barcode,
      name,
      brand: product.brands,
      category,
      unit: product.quantity,
      imageUrl: product.image_front_url || product.image_url,
      description,
      source: "OPEN_FOOD_FACTS",
      confidence: 0.58,
    };
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("Open Food Facts lookup failed:", error);
    return null;
  }
}

async function lookupOpenProductsFacts(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  try {
    const data = await fetchJsonWithTimeout(`https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    const product = data?.product;
    if (!product || data?.status !== 1) return null;

    const name = product.product_name || product.generic_name;
    const category = product.categories_tags?.[0]?.replace(/^en:/, "") || product.categories;
    const description = product.generic_name || product.description || product.abbreviated_product_name;
    if (!name && !category && !description) return null;

    return {
      barcode,
      name,
      brand: product.brands,
      category,
      unit: product.quantity || product.product_quantity_unit,
      imageUrl: product.image_front_url || product.image_url,
      description,
      source: "OPEN_PRODUCTS_FACTS",
      confidence: 0.62,
    };
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("Open Products Facts lookup failed:", error);
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function lookupICheckPublic(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(`https://icheck.vn/san-pham/${encodeURIComponent(barcode)}`, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (!response.ok) return null;
      const html = await response.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (!titleMatch) return null;

      const name = decodeHtmlEntities(titleMatch[1])
        .replace(/\s*\|\s*iCheck(\.vn)?\s*$/i, "")
        .trim();
      const normalizedName = normalizeText(name);
      if (
        !name ||
        normalizedName.includes("mang xa hoi san pham") ||
        normalizedName.includes("khong tim thay") ||
        normalizedName === "icheck"
      ) {
        return null;
      }

      const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      const rawImageUrl = imageMatch?.[1]?.trim();
      const imageUrl = rawImageUrl && !/avatar-default|logo-|default/i.test(rawImageUrl)
        ? rawImageUrl
        : undefined;
      const companyMatch = html.match(/(Công\s+ty\s+TNHH\s+[^<]+)/i) || html.match(/(Công\s+ty\s+Cổ\s+phần\s+[^<]+)/i);
      const brand = companyMatch?.[1]?.replace(/Doanh nghiệp sở hữu/i, "").trim();

      return {
        barcode,
        name,
        brand,
        imageUrl,
        source: "ICHECK",
        confidence: 0.76,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("iCheck public lookup failed:", error);
    return null;
  }
}
async function lookupICheck(barcode: string): Promise<Partial<EnrichedProductData> | null> {
  const baseUrl = process.env.ICHECK_API_BASE_URL?.trim();
  const apiKey = process.env.ICHECK_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;

  try {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const data = await fetchJsonWithTimeout(`${normalizedBaseUrl}/products/${encodeURIComponent(barcode)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const product = data?.data || data?.product || data;
    if (!product) return null;

    return {
      barcode,
      name: product.name || product.title,
      brand: product.brand,
      category: product.category || product.categoryName,
      estimatedSalePrice: normalizePrice(product.price || product.salePrice),
      originalPrice: normalizePrice(product.originalPrice || product.listPrice),
      imageUrl: product.imageUrl || product.image || product.thumbnail,
      description: product.description,
      source: "ICHECK",
      confidence: 0.78,
    };
  } catch (error) {
    if (shouldWarnLookupError(error)) console.warn("iCheck lookup failed:", error);
    return null;
  }
}

function mergeExternalResults(barcode: string, results: Partial<EnrichedProductData>[]) {
  let merged: EnrichedProductData = { barcode, source: "HYBRID", missingFields: calculateMissingFields({}) };
  let firstSource: EnrichedProductSource | undefined;

  for (const result of results) {
    if (!result || !hasUsefulData(result)) continue;
    if (!firstSource && result.source) firstSource = result.source;
    merged = mergeEnrichedData(merged, result);
  }

  merged.source = results.filter(hasUsefulData).length > 1 ? "HYBRID" : (firstSource || "HYBRID");
  merged.missingFields = calculateMissingFields(merged);
  return hasUsefulData(merged) ? merged : null;
}

async function enrichFromImageWithAi(barcode: string, imageUrl: string) {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token || !imageUrl) return null;

  try {
    const client = new OpenAI({
      baseURL: "https://models.inference.ai.azure.com",
      apiKey: token,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Bạn là hệ thống đọc nhãn sản phẩm từ ảnh thật. Chỉ dựa vào chữ/nhãn nhìn thấy trong ảnh, không suy đoán từ barcode. BẮT BUỘC trả về duy nhất JSON thuần túy gồm: name, brand, category, supplierName, unit, estimatedImportPrice, estimatedSalePrice, originalPrice, stockQuantity, minStock, warrantyMonths, description. Nếu không đọc rõ tên sản phẩm từ ảnh, trả về object rỗng {}. Category chỉ chọn một trong: Thiết bị nhà bếp (KIT), Thiết bị làm sạch (CARE), Đồ dùng gia đình (UTIL), Dụng cụ nấu ăn (COOK), Thiết bị làm mát (COOL), Thiết bị điện (ELEC), Đồ phòng tắm (BATH), Khác (OTHER). Với sản phẩm ngoài phạm trù đồ gia dụng như đồ chơi trẻ em, băng keo cá nhân, nước, thực phẩm, hàng tiêu dùng linh tinh thì dùng Khác (OTHER) và supplierName là Nhà cung cấp lẻ. Giá tiền là số nguyên VND, nếu không chắc thì bỏ trống giá.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Barcode: ${barcode}\nHãy đọc nhãn sản phẩm trong ảnh và trả JSON. Không dùng dữ liệu ngoài ảnh.` },
            { type: "image_url", image_url: { url: imageUrl } },
          ] as any,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
    if (!parsed.name || typeof parsed.name !== "string") return null;

    return {
      barcode,
      name: parsed.name,
      brand: parsed.brand,
      category: parsed.category,
      unit: parsed.unit,
      estimatedImportPrice: parsed.estimatedImportPrice,
      estimatedSalePrice: parsed.estimatedSalePrice,
      originalPrice: parsed.originalPrice,
      stockQuantity: parsed.stockQuantity,
      minStock: parsed.minStock,
      warrantyMonths: parsed.warrantyMonths,
      description: parsed.description,
      source: "AI" as const,
      confidence: 0.7,
    };
  } catch (error) {
    console.warn("AI image barcode enrichment failed:", error);
    return null;
  }
}
async function enrichMissingFieldsWithAi(barcode: string, externalData: Partial<EnrichedProductData>) {
  const token = process.env.GITHUB_TOKEN?.trim();
  const missingFields = calculateAiSuggestionFields(externalData);
  const supplierOptions = await prisma.supplier.findMany({ where: { status: "ACTIVE" }, select: { name: true } });
  if (!token || missingFields.length === 0 || !hasTrustedProductName(externalData)) return null;

  try {
    const client = new OpenAI({
      baseURL: "https://models.inference.ai.azure.com",
      apiKey: token,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Bạn là hệ thống chuẩn hóa dữ liệu sản phẩm cho Homex POS. BẮT BUỘC trả về duy nhất một object JSON thuần túy, không markdown, không giải thích. JSON gồm: name, category, supplierName, unit, estimatedImportPrice, estimatedSalePrice, originalPrice, stockQuantity, minStock, warrantyMonths, description. Không được thay đổi danh tính sản phẩm. Field name/brand chỉ được trả về nếu trùng khớp rõ với tên/thương hiệu trong dữ liệu external. Nếu external không có tên sản phẩm thật, bỏ trống name. Không được bịa URL ảnh. Category chỉ được chọn một trong các nhóm Homex: Thiết bị nhà bếp (KIT), Thiết bị làm sạch (CARE), Đồ dùng gia đình (UTIL), Dụng cụ nấu ăn (COOK), Thiết bị làm mát (COOL), Thiết bị điện (ELEC), Đồ phòng tắm (BATH), Khác (OTHER). Với sản phẩm ngoài phạm trù đồ gia dụng như đồ chơi trẻ em, băng keo cá nhân, nước, thực phẩm, hàng tiêu dùng linh tinh thì chọn Khác (OTHER) và supplierName là Nhà cung cấp lẻ. Description phải mô tả đúng name/brand từ external; nếu không chắc thì bỏ trống.",
        },
        {
          role: "user",
          content: `Barcode: ${barcode}\n\nDữ liệu đã lấy được từ external APIs:\n${JSON.stringify(externalData)}\n\nNhà cung cấp hiện có, supplierName phải chọn đúng một tên trong danh sách này nếu có thể:\n${JSON.stringify(supplierOptions.map((supplier) => supplier.name))}\n\nCác field còn thiếu:\n${missingFields.join(", ")}\n\nChỉ bù các field còn thiếu nếu không mâu thuẫn dữ liệu external. Không đổi tên sản phẩm. Không bịa sản phẩm khác cùng barcode. Giá tiền là số nguyên theo đơn vị hiển thị Homex: 25 nghĩa là 25.000 VND, 120 nghĩa là 120.000 VND. Gợi ý stockQuantity là tồn kho ban đầu hợp lý, minStock là tồn kho tối thiểu cảnh báo. Nếu là hàng tiêu dùng không bảo hành thì warrantyMonths = 0; hàng điện/gia dụng thường 6-24 tháng.`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
    return {
      barcode,
      name: parsed.name,
      category: parsed.category,
      unit: parsed.unit,
      estimatedImportPrice: parsed.estimatedImportPrice,
      estimatedSalePrice: parsed.estimatedSalePrice,
      originalPrice: parsed.originalPrice,
      stockQuantity: parsed.stockQuantity,
      minStock: parsed.minStock,
      warrantyMonths: parsed.warrantyMonths,
      description: parsed.description,
      source: "AI" as const,
      confidence: 0.62,
    };
  } catch (error) {
    console.warn("AI barcode enrichment failed:", error);
    return null;
  }
}

export async function enrichProductByBarcode(barcode: string) {
  const cleanBarcode = barcode.trim();

  const existingProduct = await prisma.product.findFirst({
    where: { barcode: { equals: cleanBarcode, mode: "insensitive" } },
    include: { category: true, supplier: true },
  });

  if (existingProduct) {
    const data: EnrichedProductData = {
      barcode: cleanBarcode,
      name: existingProduct.name,
      category: existingProduct.category.name,
      unit: "Cái",
      estimatedImportPrice: normalizePrice(existingProduct.costPrice),
      estimatedSalePrice: normalizePrice(existingProduct.salePrice),
      originalPrice: normalizePrice(existingProduct.originalPrice),
      warrantyMonths: existingProduct.warrantyMonths,
      imageUrl: existingProduct.imageUrl || undefined,
      description: existingProduct.description || undefined,
      source: "DATABASE",
      missingFields: [],
      confidence: 1,
      existingProductId: existingProduct.id,
    };

    return { data, foundInDatabase: true };
  }

  const externalResults: Partial<EnrichedProductData>[] = [];
  for (const lookup of [lookupUpcItemDb, lookupBarcodeSpider, lookupBarcodeLookup, lookupOpenProductsFacts, lookupOpenFoodFacts, lookupICheck, lookupICheckPublic]) {
    const result = await lookup(cleanBarcode);
    if (result && hasUsefulData(result)) {
      externalResults.push(result);
    }

    const merged = mergeExternalResults(cleanBarcode, externalResults);
    if (merged && hasEnoughData(merged) && calculateAiSuggestionFields(merged).length === 0) {
      return { data: await normalizeEnrichedSupplier(await normalizeEnrichedCategory(merged)), foundInDatabase: false };
    }
  }

  const externalData = mergeExternalResults(cleanBarcode, externalResults) || { barcode: cleanBarcode, source: "HYBRID" as const };
  if (!hasUsefulData(externalData)) {
    return { data: null, foundInDatabase: false };
  }

  const normalizedExternalData = await normalizeEnrichedSupplier(await normalizeEnrichedCategory(externalData));
  const imageAiData = !hasIdentityData(normalizedExternalData) && normalizedExternalData.imageUrl
    ? await enrichFromImageWithAi(cleanBarcode, normalizedExternalData.imageUrl)
    : null;
  const rawAiData = imageAiData || await enrichMissingFieldsWithAi(cleanBarcode, normalizedExternalData);
  const aiData = rawAiData
    ? sanitizeAiDataAgainstExternal(await normalizeEnrichedCategory(rawAiData), normalizedExternalData)
    : null;
  const mergedData = aiData && hasUsefulData(aiData)
    ? mergeEnrichedData(normalizedExternalData, aiData)
    : mergeEnrichedData(normalizedExternalData, {});
  const suggestedData = await normalizeEnrichedSupplier(aiData && hasUsefulData(aiData) ? applyAiOperationalSuggestions(mergedData) : mergedData);
  suggestedData.source = aiData && hasUsefulData(aiData) && hasUsefulData(normalizedExternalData) ? "HYBRID" : (aiData && hasUsefulData(aiData) ? "AI" : suggestedData.source);
  suggestedData.missingFields = calculateMissingFields(suggestedData);

  return {
    data: hasUsefulData(suggestedData) ? suggestedData : null,
    foundInDatabase: false,
  };
}







































