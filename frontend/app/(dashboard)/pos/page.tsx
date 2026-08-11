"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Download, Minus, Plus, Printer, QrCode, ReceiptText, Search, ShoppingCart, Trash2, UserPlus, XCircle, Smartphone, Link, Copy, Check, ArrowLeft, Info, ShieldCheck, Scan, User, Wallet, X, FileText, Coins, CreditCard, Sparkles, Package, FileClock, ChevronLeft, ChevronRight, MoreHorizontal, ChevronDown, Menu, Layers, Ticket } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import { RoleGuard } from "@/components/auth/role-guard";
import { useLanguage } from "@/contexts/language-context";
import { useSettings } from "@/contexts/settings-context";
import { useToast } from "@/contexts/toast-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PrintableInvoice } from "@/components/shared/printable-invoice";
import { CreateVatModal } from "@/components/invoices/create-vat-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { REAL_PRODUCT_FALLBACK_IMAGE } from "@/lib/demo-products";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildMobileScanUrl, getActiveRemoteBarcodeTarget, getOrCreateRemoteBarcodeSessionId, resetRemoteBarcodeSessionId, setActiveRemoteBarcodeTarget } from "@/lib/remote-barcode-session";
import { categoryService, customerService, orderService, paymentService, posService, productService, settingService, shiftService, type PayOSPayment } from "@/services/homex.service";
import { promotionService } from "@/services/promotion.service";
import type { Category, Customer, Order, PaymentMethod, Product, Setting, Shift, SalesAssistantResponse, SalesAssistantRequest } from "@/types/domain";
import type { Promotion } from "@/services/promotion.service";

type CartItem = {
  product: Product;
  quantity: number;
};

const POS_RESUME_DRAFT_ORDER_ID_KEY = "homex_pos_resume_draft_order_id";
type PosPaymentMethod = Extract<PaymentMethod, "CASH" | "TRANSFER">;
type CheckoutStep = "confirm" | "cash" | "qr";

const paymentMethods: PosPaymentMethod[] = ["CASH", "TRANSFER"];

function sortByIdAsc<T extends { id: number }>(items: T[]) {
  return [...items].sort((a, b) => a.id - b.id);
}

function getProductImage(product: Product) {
  const extendedProduct = product as Product & { image?: string | null };
  return extendedProduct.image || product.imageUrl || REAL_PRODUCT_FALLBACK_IMAGE;
}

function resolveProductImage(product: any) {
  const raw =
    product?.imageUrl ||
    product?.image ||
    product?.thumbnail ||
    product?.photoUrl ||
    "";

  if (!raw || typeof raw !== "string") return "";

  const value = raw.trim();

  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/assets/real-products/")) return value;
  if (value.startsWith("assets/real-products/")) return `/${value}`;
  if (value.startsWith("/")) return value;

  return `/assets/real-products/${value}`;
}

function getDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatMoneyInput(value: string) {
  const digits = getDigits(value);
  if (!digits) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(digits));
}

function getTierLabel(tier: string, t: (key: string) => string) {
  if (tier === "ALL") return t("promotions.tierAll");
  if (tier === "NONE") return t("promotions.tierNone");
  if (tier === "SILVER") return t("promotions.tierSilver");
  if (tier === "GOLD") return t("promotions.tierGold");
  if (tier === "DIAMOND") return t("promotions.tierDiamond");
  return tier;
}

function getMoneyInputAmount(value: string) {
  const digits = getDigits(value);
  return digits ? Number(digits) : 0;
}

function formatDiscountInput(value: string, type: "AMOUNT" | "PERCENT") {
  if (type === "PERCENT") {
    const digits = getDigits(value);
    if (!digits) return "";
    const num = Number(digits);
    if (num > 100) return "100";
    return digits;
  }
  return formatMoneyInput(value);
}

function buildVietQrDemoValue(setting: any, amount: number, content: string) {
  return [
    `bank=${setting?.bankName || "BANK"}`,
    `account=${setting?.bankAccountNumber || "0000000000"}`,
    `name=${setting?.bankAccountName || "HOMEX POS"}`,
    `amount=${Math.round(amount)}`,
    `content=${content}`,
  ].join("|");
}

function getOrderCodeLast6(orderCode?: string | null) {
  if (!orderCode) return "";
  return String(orderCode).slice(-6);
}

function sanitizeVietQrContent(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 50);
}

function formatCategoryName(name: string) {
  let s = name.trim();
  // Remove prefix THIẾT BỊ / Thiết bị
  s = s.replace(/^(thiết bị|THIẾT BỊ)\s+/i, "");
  
  // If it was all uppercase, convert to lowercase first so we can capitalize it nicely
  if (s === s.toUpperCase()) {
    s = s.toLowerCase();
  }
  
  // Capitalize the very first letter
  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  
  // Capitalize words inside parentheses to uppercase (e.g. (kit) -> (KIT))
  s = s.replace(/\((kit|care|pos|vat|sku)\)/i, (m) => m.toUpperCase());
  
  return s;
}

function getStockBadgeStyle(qty: number) {
  if (qty <= 0) {
    return "bg-red-600 text-white border-red-600";
  }
  if (qty < 20) {
    return "bg-amber-500 text-white border-amber-500";
  }
  return "bg-emerald-600 text-white border-emerald-600";
}

function renderCustomerTierBadge(tier: string | undefined | null, t: any) {
  const cleanTier = (tier || "SILVER").toUpperCase().trim();

  switch (cleanTier) {
    case "DIAMOND":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold bg-indigo-100 text-indigo-900 border border-indigo-300/90 shrink-0 shadow-2xs">
          💎 {t("customerTier.DIAMOND")}
        </span>
      );
    case "PLATINUM":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold bg-cyan-100 text-cyan-900 border border-cyan-300/90 shrink-0 shadow-2xs">
          🏆 {t("customerTier.PLATINUM")}
        </span>
      );
    case "GOLD":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold bg-amber-100 text-amber-900 border border-amber-300/90 shrink-0 shadow-2xs">
          🥇 {t("customerTier.GOLD")}
        </span>
      );
    case "SILVER":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold bg-slate-100 text-slate-800 border border-slate-300/90 shrink-0 shadow-2xs">
          🥈 {t("customerTier.SILVER")}
        </span>
      );
  }
}

export default function PosPage() {
  const router = useRouter();
  const [headerPortalTarget, setHeaderPortalTarget] = useState<HTMLElement | null>(null);
  const user = useCurrentUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [draftOrder, setDraftOrder] = useState<Order | null>(null);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);
  const { settings: setting, refreshSettings } = useSettings();
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [isMoreCategoriesOpen, setIsMoreCategoriesOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH");
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [discountInput, setDiscountInput] = useState("");
  const [discountMessage, setDiscountMessage] = useState("");
  const [appliedDiscountAmount, setAppliedDiscountAmount] = useState(0);
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [isPromoPopoverOpen, setIsPromoPopoverOpen] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [isCancelDraftDialogOpen, setIsCancelDraftDialogOpen] = useState(false);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("confirm");
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [quickCustomerEmail, setQuickCustomerEmail] = useState("");
  const [quickCustomerAddress, setQuickCustomerAddress] = useState("");
  const { toast } = useToast();
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [remoteScanOpen, setRemoteScanOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isPhoneConnected, setIsPhoneConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [isQrLoading, setIsQrLoading] = useState(true);
  const [payOSPayment, setPayOSPayment] = useState<PayOSPayment | null>(null);
  const [payOSStatusText, setPayOSStatusText] = useState("pos.payosWaiting");
  const [isCreateVatOpen, setIsCreateVatOpen] = useState(false);
  const [createVatInitialCode, setCreateVatInitialCode] = useState("");
  const { t, language } = useLanguage();

  const [salesAssistantOpen, setSalesAssistantOpen] = useState(false);
  const [salesNeed, setSalesNeed] = useState("");
  const [budgetMin, setBudgetMin] = useState<number | undefined>(undefined);
  const [budgetMax, setBudgetMax] = useState<number | undefined>(undefined);
  const [selectedQuickNeed, setSelectedQuickNeed] = useState("");
  const [salesAssistantLoading, setSalesAssistantLoading] = useState(false);
  const [salesAssistantResult, setSalesAssistantResult] = useState<SalesAssistantResponse | null>(null);
  const [salesAssistantError, setSalesAssistantError] = useState("");
  const [preferences, setPreferences] = useState({
    preferPromotion: false,
    preferWarranty: true,
    preferHighStock: false,
    crossSellFromCart: true,
  });

  function resetSalesAssistantState() {
    setSalesNeed("");
    setBudgetMin(undefined);
    setBudgetMax(undefined);
    setSelectedQuickNeed("");
    setSalesAssistantResult(null);
    setSalesAssistantError("");
    setSalesAssistantLoading(false);
    setPreferences({
      preferPromotion: false,
      preferWarranty: true,
      preferHighStock: false,
      crossSellFromCart: true,
    });
  }

  async function handleRequestSalesSuggestion() {
    let finalNeed = salesNeed.trim();
    if (selectedQuickNeed) {
      if (finalNeed) {
        finalNeed = `${selectedQuickNeed}: ${finalNeed}`;
      } else {
        finalNeed = selectedQuickNeed;
      }
    }

    if (!finalNeed) {
      toast.error(t("salesAssistant.empty"));
      return;
    }

    try {
      setSalesAssistantLoading(true);
      setSalesAssistantError("");
      setSalesAssistantResult(null);

      const payload: SalesAssistantRequest = {
        language,
        need: finalNeed,
        budgetMin,
        budgetMax,
        customerId: selectedCustomer?.id,
        cartItems: cart.map(item => ({
          productId: item.product.id,
          name: item.product.name,
          quantity: item.quantity
        })),
        preferences
      };

      const res = await posService.getSalesAssistantSuggestions(payload);
      if (res && Array.isArray(res.recommendations)) {
        setSalesAssistantResult(res);
        if (res.source === "HEURISTIC") {
          toast.info(t("salesAssistant.sourceFallback"));
        }
      } else {
        setSalesAssistantError(t("pos.aiLoadFailed"));
      }
    } catch (error) {
      setSalesAssistantError(getApiErrorMessage(error));
    } finally {
      setSalesAssistantLoading(false);
    }
  }

  async function handleAddSuggestionToCart(productId: number) {
    try {
      let product = products.find(p => p.id === productId);
      if (!product) {
        product = await productService.detail(productId);
      }

      if (product) {
        addToCart(product);
        toast.success(t("salesAssistant.addedToCart"));
      } else {
        toast.error(t("pos.suggestedProductNotFound"));
      }
    } catch (err) {
      toast.error(t("pos.addSuggestedProductFailed"));
    }
  }
  const cartScrollRef = useRef<HTMLDivElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const cashReceivedInputRef = useRef<HTMLInputElement | null>(null);
  const previousCartLengthRef = useRef(0);
  const barcodeBufferRef = useRef("");
  const barcodeTimerRef = useRef<number | null>(null);
  const discountMessageTimerRef = useRef<number | null>(null);

  const setTemporaryDiscountMessage = useCallback((msg: string, durationMs = 5000) => {
    if (discountMessageTimerRef.current) {
      window.clearTimeout(discountMessageTimerRef.current);
      discountMessageTimerRef.current = null;
    }
    setDiscountMessage(msg);
    if (msg && durationMs > 0) {
      discountMessageTimerRef.current = window.setTimeout(() => {
        setDiscountMessage("");
        discountMessageTimerRef.current = null;
      }, durationMs);
    }
  }, []);

  
  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.product.salePrice * item.quantity, 0);
  }, [cart]);

  const discountAmount = Math.min(Math.max(appliedDiscountAmount, 0), subtotal);
  const totalPayable = Math.max(subtotal - discountAmount, 0);
  const cashReceivedAmount = getMoneyInputAmount(cashReceivedInput);
  const changeAmount = paymentMethod === "CASH" ? Math.max(cashReceivedAmount - totalPayable, 0) : 0;

  const quickCashOptions = useMemo(() => {
    if (totalPayable <= 0) return [10000, 20000, 50000];

    const presets = new Set<number>([totalPayable]);

    const allBills = [
      1000, 2000, 5000, 10000, 15000, 20000, 30000, 40000, 50000,
      70000, 100000, 150000, 200000, 250000, 300000, 350000, 400000, 500000, 1000000
    ];

    // 1. Next rounded step based on magnitude
    let step = 1000;
    if (totalPayable >= 100000) step = 50000;
    else if (totalPayable >= 10000) step = 5000;
    else if (totalPayable >= 1000) step = 1000;

    const nextRounded = Math.ceil((totalPayable + 1) / step) * step;
    if (nextRounded > totalPayable) presets.add(nextRounded);

    // 2. Next major rounded step
    let nextMajorStep = 10000;
    if (totalPayable >= 100000) nextMajorStep = 100000;
    else if (totalPayable >= 10000) nextMajorStep = 20000;
    else nextMajorStep = 5000;

    const nextMajorRounded = Math.ceil((totalPayable + 1) / nextMajorStep) * nextMajorStep;
    if (nextMajorRounded > totalPayable) presets.add(nextMajorRounded);

    // 3. Fill remaining options from standard bills > totalPayable
    for (const bill of allBills) {
      if (bill > totalPayable) {
        presets.add(bill);
      }
      if (presets.size >= 4) break;
    }

    return Array.from(presets).sort((a, b) => a - b).slice(0, 4);
  }, [totalPayable]);

  const selectedCustomer = useMemo(() => customers.find((customer) => String(customer.id) === customerId) || null, [customerId, customers]);
  
  const eligiblePromotions = useMemo(() => {
    return promotions.filter(p => {
      // Bỏ qua kiểm tra thời hạn chi tiết quá khắt khe ở frontend vì backend đã check ACTIVE
      // Chỉ kiểm tra cơ bản
      if (p.expiredAt && new Date(p.expiredAt).getTime() < Date.now() - 86400000) return false;
      if (p.usageLimit && p.usedCount !== undefined && p.usedCount >= p.usageLimit) return false;
      
      // Khách lẻ hoặc khách chưa chọn sẽ có cTier = "NONE" (coi như khách mới)
      const cTier = selectedCustomer?.tier || "NONE";
      
      // Voucher công khai (áp dụng cho tất cả)
      const isPublic = !p.eligibleTiers || p.eligibleTiers.trim() === "" || p.eligibleTiers === "ALL" || p.eligibleTiers === "ALL_TIERS";
      
      if (!isPublic) {
        const tiers = p.eligibleTiers.split(",").map(t => t.trim().toUpperCase());
        if (!tiers.includes(cTier.toUpperCase())) return false;
      }
      return true;
    });
  }, [promotions, selectedCustomer]);

  const isCashPaymentInvalid = paymentMethod === "CASH" && cashReceivedAmount < totalPayable;
  const isCheckoutDisabled = isSubmitting || cart.length === 0 || !isOnline || (user?.role === "CASHIER" && !currentShift);
  const transferContent = (() => {
    let tpl = setting?.transferContentTemplate || "HOMEX {orderCodeLast6}";
    const code = draftOrder?.orderCode || "HOMEX POS";
    const raw = tpl
      .replaceAll("{orderCode}", code)
      .replaceAll("{orderCodeLast6}", getOrderCodeLast6(code))
      .replaceAll("{amount}", String(totalPayable))
      .replaceAll("{customerPhone}", selectedCustomer?.phone || "");
    return sanitizeVietQrContent(raw);
  })();
  const payOSPaymentCode = payOSPayment?.description || (() => {
    const digits = String(draftOrder?.orderCode || "").replace(/\D/g, "");
    return digits ? `HOMEX-${digits.slice(-5).padStart(5, "0")}` : "HOMEX-00000";
  })();
  const isBankConfigured = Boolean(setting?.bankName && setting?.bankAccountNumber && setting?.bankAccountName);
  const generateVietQRUrl = useCallback(() => {
    const bankId = setting?.bankName || "MB";
    const accountNo = setting?.bankAccountNumber || "0877724374";
    const amount = totalPayable;
    const memo = encodeURIComponent(payOSPaymentCode);
    const rawAccountName = setting?.bankAccountName || "MAI TRAN THIEN TAM";
    const cleanAccountName = encodeURIComponent(
      rawAccountName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toUpperCase()
    );

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${amount}&addInfo=${memo}&accountName=${cleanAccountName}`;
  }, [setting, totalPayable, payOSPaymentCode]);

  const transferQrValue = buildVietQrDemoValue(setting, totalPayable, payOSPaymentCode);
  const payOSQrValue = payOSPayment?.qrCode || payOSPayment?.checkoutUrl || generateVietQRUrl();
  const isPayOSQrImage = Boolean(payOSPayment?.qrCode && /^(https?:|data:image\/)/i.test(payOSPayment.qrCode));
  const getPublicBaseUrl = () => {
    if (typeof window === "undefined") return "https://disparate-sizable-brick.ngrok-free.dev";
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "https://disparate-sizable-brick.ngrok-free.dev";
    }
    return window.location.origin;
  };

  const lastInvoicePublicUrl =
    lastCompletedOrder
      ? `${getPublicBaseUrl()}/tra-cuu-bao-hanh?code=${lastCompletedOrder.orderCode}`
      : "";

  const isShiftEndingSoon = useMemo(() => {
    if (!currentShift) return false;
    const now = new Date();
    const endHour = currentShift.shiftType === "MORNING" ? 15 : 22;
    return now.getHours() >= endHour;
  }, [currentShift]);

  function focusBarcodeInput() {
    if (typeof window === "undefined") return;
    if (!setting?.enableBarcodeScanner) return;
    window.requestAnimationFrame(() => barcodeInputRef.current?.focus());
  }

  async function loadCategories() {
    try {
      const data = await categoryService.list({ page: 1, limit: 200, status: "ACTIVE" });
      setCategories(sortByIdAsc(data.items));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function loadProducts() {
    try {
      setIsLoadingProducts(true);
            const data = await productService.list({
        page: 1,
        limit: 80,
        search: productSearch,
        status: "ACTIVE",
        categoryId: selectedCategoryId,
      });
      setProducts(sortByIdAsc(data.items));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoadingProducts(false);
    }
  }

  async function searchCustomers(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    try {
            const data = await customerService.list({ page: 1, limit: 30, search: customerSearch, status: "ACTIVE" });
      setCustomers(sortByIdAsc(data.items));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function loadPromotions() {
    try {
      const data = await promotionService.list({ page: 1, limit: 100, status: "ACTIVE" });
      setPromotions(data.items);
    } catch {
      // ignore
    }
  }

  async function loadCurrentShift() {
    try {
      const shift = await shiftService.current();
      setCurrentShift(shift);
    } catch {
      // ignore
    }
  }

  function resetPosState() {
    window.localStorage.removeItem(POS_RESUME_DRAFT_ORDER_ID_KEY);
    setCart([]);
    setDraftOrder(null);
    setCustomerId("");
    setCustomerSearch("");
    setPaymentMethod("CASH");
    setCashReceivedInput("");
    setDiscountInput("");
    setDiscountMessage("");
    setAppliedDiscountAmount(0);
    setAppliedPromotionCode("");
    setIsCheckoutDialogOpen(false);
  }

  async function restoreDraftOrderFromStorage() {
    const storedOrderId = window.localStorage.getItem(POS_RESUME_DRAFT_ORDER_ID_KEY);

    if (!storedOrderId) return;

    window.localStorage.removeItem(POS_RESUME_DRAFT_ORDER_ID_KEY);

    try {
      setIsSubmitting(true);
            
      const order = await orderService.detail(Number(storedOrderId));

      if (order.status !== "DRAFT") {
        toast.error(t("toast.pos.resumeDraftInvalid"));
        return;
      }

      const restoredCart = await Promise.all(
        order.orderDetails.map(async (detail) => {
          try {
            const product = await productService.detail(detail.productId);
            return { product, quantity: detail.quantity };
          } catch {
            const fallbackProduct: Product = {
              id: detail.productId,
              sku: detail.product?.sku || `SP-${detail.productId}`,
              name: detail.product?.name || `${t("products.name")} #${detail.productId}`,
              description: null,
              categoryId: 0,
              supplierId: 0,
              costPrice: detail.unitPrice,
              salePrice: detail.unitPrice,
              originalPrice: null,
              stockQuantity: Math.max(detail.quantity, 999),
              minStock: 0,
              warrantyMonths: detail.product?.warrantyMonths || 0,
              qrCode: detail.product?.sku || null,
              barcode: null,
              imageUrl: detail.product?.imageUrl || REAL_PRODUCT_FALLBACK_IMAGE,
              status: "ACTIVE",
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
            };

            return { product: fallbackProduct, quantity: detail.quantity };
          }
        })
      );

      setDraftOrder(order);
      setCustomerId(order.customerId ? String(order.customerId) : "");
      setCart(restoredCart);
      toast.success(t("toast.pos.resumeDraftSuccess", { code: order.orderCode }));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    setHeaderPortalTarget(document.getElementById("page-title-portal"));
    setSessionId(getOrCreateRemoteBarcodeSessionId());
    loadCategories();
    loadProducts();
    searchCustomers();
    loadPromotions();
    loadCurrentShift();
    restoreDraftOrderFromStorage();
    focusBarcodeInput();
  }, []);

  useEffect(() => {
    if (checkoutStep === "qr") {
      setIsQrLoading(true);
    }
  }, [checkoutStep, transferContent]);

  useEffect(() => {
    if (!isCheckoutDialogOpen || checkoutStep !== "qr" || !payOSPayment?.paymentId) {
      return;
    }

    let isMounted = true;
    const poll = async () => {
      try {
        const status = await paymentService.getPaymentStatus(payOSPayment.paymentId);
        if (!isMounted) return;

        if (status.status === "PAID") {
          setPayOSStatusText("pos.payosSuccess");
          const completedOrder = await orderService.detail(status.orderId);
          if (!isMounted) return;
          setLastCompletedOrder(completedOrder);
          resetPosState();
          toast.success(t("pos.payosSuccess"));
          router.refresh();
          await loadProducts();
          if (setting?.autoOpenPrint) {
            window.setTimeout(() => window.print(), 1000);
          }
        } else if (status.status === "FAILED") {
          setPayOSStatusText("pos.payosAmountMismatch");
        }
      } catch (error) {
        if (isMounted) setPayOSStatusText(getApiErrorMessage(error));
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [checkoutStep, isCheckoutDialogOpen, payOSPayment?.paymentId, router, setting?.autoOpenPrint, toast]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.key === "F9") {
        event.preventDefault();
        if (!isCheckoutDisabled) {
          startCheckout();
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isCheckoutDisabled, startCheckout]);

  useEffect(() => {
    if (!isCheckoutDialogOpen) {
      focusBarcodeInput();
      return;
    }

    if (checkoutStep === "cash") {
      window.setTimeout(() => cashReceivedInputRef.current?.focus(), 0);
    }
  }, [checkoutStep, isCheckoutDialogOpen]);

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(window.navigator.onLine);
    }

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    loadProducts();
  }, [selectedCategoryId]);

  useEffect(() => {
    if (cart.length === 0) {
      setDiscountInput("");
      setDiscountMessage("");
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
    }
  }, [cart.length]);

  useEffect(() => {
    if (appliedDiscountAmount > subtotal) {
      setAppliedDiscountAmount(subtotal);
    }
  }, [subtotal, appliedDiscountAmount]);

  useEffect(() => {
    setVoucherInput(appliedPromotionCode);
  }, [appliedPromotionCode]);

  useEffect(() => {
    if (appliedPromotionCode) {
      setAppliedPromotionCode("");
      setAppliedDiscountAmount(0);
      setDiscountMessage("");
      toast.error(t("toast.pos.voucherRemovedCustomerChanged"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    const scrollContainer = cartScrollRef.current;
    const previousLength = previousCartLengthRef.current;

    if (scrollContainer && cart.length > previousLength) {
      window.requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }

    previousCartLengthRef.current = cart.length;
  }, [cart.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!setting?.enableBarcodeScanner) {
        return;
      }

      const activeElement = document.activeElement;

      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute("contenteditable") === "true" ||
        (activeElement as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }

      if (barcodeTimerRef.current) {
        window.clearTimeout(barcodeTimerRef.current);
      }

      if (event.key === "Enter") {
        const barcode = barcodeBufferRef.current;
        barcodeBufferRef.current = "";
        handleBarcodeScan(barcode);
        return;
      }

      if (event.key.length === 1) {
        barcodeBufferRef.current += event.key;
        barcodeTimerRef.current = window.setTimeout(() => {
          barcodeBufferRef.current = "";
        }, 120);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (barcodeTimerRef.current) {
        window.clearTimeout(barcodeTimerRef.current);
      }
    };
  }, [setting?.enableBarcodeScanner]);

  useEffect(() => {
    if (paymentMethod !== "CASH") {
      setCashReceivedInput("");
    }
  }, [paymentMethod]);

  function addToCart(product: Product) {
    if (!setting?.allowOversell && product.stockQuantity <= 0) {
      toast.error(t("settings.stockNotEnough"));
      return;
    }

    setCart((currentCart) => {
      const found = currentCart.find((item) => item.product.id === product.id);

      if (found) {
        return currentCart.map((item) => {
          if (item.product.id !== product.id) return item;
          const newQty = item.quantity + 1;
          if (!setting?.allowOversell && newQty > product.stockQuantity) {
            toast.warning(t("settings.stockNotEnough"));
            return item;
          }
          return { ...item, quantity: newQty };
        });
      }

      return [...currentCart, { product, quantity: 1 }];
    });
    focusBarcodeInput();
  }

  async function handleBarcodeScan(code: string) {
    const barcode = code.trim();
    if (!barcode) return;

    const localProduct = products.find(
      (p) => p.barcode === barcode || (p.sku && p.sku.toUpperCase() === barcode.toUpperCase())
    );

    if (localProduct) {
      if (localProduct.status !== "ACTIVE") {
        toast.error(t("pos.productInactive"));
        return;
      }
      if (!setting?.allowOversell && localProduct.stockQuantity <= 0) {
        toast.error(t("settings.stockNotEnough"));
        return;
      }
      addToCart(localProduct);
      toast.success(`${t("barcode.addedProduct")}: ${localProduct.name}`);
      focusBarcodeInput();
      return;
    }

    try {
      const product = await productService.getProductByBarcode(barcode);
      if (product.status !== "ACTIVE") {
        toast.error(t("pos.productInactive"));
        return;
      }
      if (!setting?.allowOversell && product.stockQuantity <= 0) {
        toast.error(t("settings.stockNotEnough"));
        return;
      }
      addToCart(product);
      toast.success(`${t("barcode.addedProduct")}: ${product.name}`);
    } catch (error) {
      toast.error(`${t("barcode.notFound")} ${barcode}`);
    } finally {
      focusBarcodeInput();
    }
  }

  const handleBarcodeFromRemotePhone = useCallback(async (code: string) => {
    const barcode = code.trim();
    if (!barcode) return;

    if (barcodeInputRef.current) {
      barcodeInputRef.current.value = barcode;
    }

    const localProduct = products.find(
      (p) => p.barcode === barcode || (p.sku && p.sku.toUpperCase() === barcode.toUpperCase())
    );

    if (localProduct) {
      if (localProduct.status !== "ACTIVE") {
        toast.error(t("pos.remoteProductInactive"));
        return;
      }
      if (!setting?.allowOversell && localProduct.stockQuantity <= 0) {
        toast.error(`${t("settings.stockNotEnough")} (${localProduct.name})`);
        return;
      }
      addToCart(localProduct);
      toast.success(`${t("barcode.phoneScanSuccess")}: ${localProduct.name}`);
      return;
    }

    try {
      const product = await productService.getProductByBarcode(barcode);
      if (product.status !== "ACTIVE") {
        toast.error(t("pos.remoteProductInactive"));
        return;
      }
      if (!setting?.allowOversell && product.stockQuantity <= 0) {
        toast.error(`${t("settings.stockNotEnough")} (${product.name})`);
        return;
      }
      addToCart(product);
      toast.success(`${t("barcode.phoneScanSuccess")}: ${product.name}`);
    } catch (error) {
      toast.error(`${t("barcode.notFound")} ${barcode}`);
    } finally {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.value = "";
      }
    }
  }, [products, setting?.allowOversell, t, toast]);

  const handleOpenRemoteScan = () => {
    setActiveRemoteBarcodeTarget("pos");
    const currentSessionId = getOrCreateRemoteBarcodeSessionId();
    setSessionId(currentSessionId);
    setRemoteScanOpen(true);
    setIsCopied(false);
  };

  const handleResetRemoteScanSession = () => {
    const nextSessionId = resetRemoteBarcodeSessionId();
    setSessionId(nextSessionId);
    setIsCopied(false);
    toast.success(t("barcode.remoteSessionReset"));
  };

  const mobileScanUrl = useMemo(() => buildMobileScanUrl(sessionId), [sessionId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(mobileScanUrl);
      setIsCopied(true);
      toast.success(t("barcode.scanLinkCopied"));
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error(t("barcode.copyLinkFailed"));
    }
  };

  useEffect(() => {
    if (!sessionId || setting?.enableBarcodeScanner === false) return;

    const timer = window.setInterval(async () => {
      try {
        if (document.visibilityState !== "visible") return;
        const activeTarget = getActiveRemoteBarcodeTarget();
        if (activeTarget && activeTarget !== "pos") return;
        const res = await posService.pollRemoteScan(sessionId);
        if (typeof res?.isConnected === "boolean") {
          setIsPhoneConnected(res.isConnected);
        }
        if (res && res.success && res.barcode) {
          await handleBarcodeFromRemotePhone(res.barcode);
        }
      } catch (error) {
        console.error("Remote scan polling failed:", error);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [sessionId, setting?.enableBarcodeScanner, handleBarcodeFromRemotePhone]);

  function changeQuantity(productId: number, delta: number) {
    setCart((currentCart) => {
      return currentCart
        .map((item) => {
          if (item.product.id !== productId) return item;
          return {
            ...item,
            quantity: setting?.allowOversell 
              ? Math.max(item.quantity + delta, 1)
              : Math.min(Math.max(item.quantity + delta, 1), item.product.stockQuantity),
          };
        })
        .filter((item) => item.quantity > 0);
    });
  }

  function removeFromCart(productId: number) {
    setCart((currentCart) => currentCart.filter((item) => item.product.id !== productId));
  }

  function buildOrderBody() {
    return {
      customerId: customerId ? Number(customerId) : undefined,
      discountAmount,
      promotionCode: appliedPromotionCode || undefined,
      items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    };
  }

  async function createDraft() {
    if (cart.length === 0) {
      toast.error(t("toast.pos.emptyCart"));
      return null;
    }

    try {
      setIsSubmitting(true);
                  const data = await orderService.createDraft(buildOrderBody());
      setDraftOrder(data);
      toast.success(t("toast.pos.draftCreated"));
      return data;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  function startCheckout() {
    if (setting?.requireCustomerPhone) {
      if (!customerId) {
        toast.error(t("settings.customerPhoneRequired"));
        return;
      }
      const c = customers.find(x => String(x.id) === customerId);
      if (!c?.phone) {
        toast.error(t("settings.customerPhoneRequired"));
        return;
      }
    }

    if (Number(setting?.maxDiscount) > 0 && discountAmount > Number(setting?.maxDiscount)) {
      toast.error(t("settings.discountLimitExceeded"));
      return;
    }

    if (setting?.confirmBeforeCheckout === false) {
      if (paymentMethod === "CASH") {
        setCheckoutStep("cash");
      } else {
        void prepareTransferCheckout();
        return;
      }
    } else {
      setCheckoutStep("confirm");
    }
    setIsCheckoutDialogOpen(true);
  }

  async function prepareTransferCheckout() {
    if (cart.length === 0) {
      toast.error(t("toast.pos.emptyCart"));
      return;
    }

    if (!isOnline) {
      toast.error(t("network.checkoutDisabled"));
      return;
    }

    try {
      setIsSubmitting(true);
      setPayOSStatusText("pos.payosCreating");
      
      const orderToPay = draftOrder
        ? await orderService.updateDraft(draftOrder.id, buildOrderBody())
        : await orderService.createDraft(buildOrderBody());
      setDraftOrder(orderToPay);

      try {
        const payOSData = await paymentService.createPayOSPayment({
          orderId: orderToPay.id,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
          promotionCode: appliedPromotionCode || undefined,
        });
        setPayOSPayment(payOSData);
        setPayOSStatusText("pos.payosWaiting");
        if (payOSData?.qrCode && payOSData.qrCode.startsWith("000201")) {
          setIsQrLoading(false);
        }
      } catch (payOSError) {
        console.error("PayOS create error:", payOSError);
        setPayOSPayment(null);
        setPayOSStatusText("pos.payosFallback");
      }

      setCheckoutStep("qr");
      setIsCheckoutDialogOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function checkout() {
    if (cart.length === 0) {
      toast.error(t("toast.pos.emptyCart"));
      return;
    }

    if (!isOnline) {
      toast.error(t("network.checkoutDisabled"));
      return;
    }

    if (paymentMethod === "CASH" && cashReceivedAmount < totalPayable) {
      toast.error(t("pos.cashNotEnough"));
      return;
    }

    try {
      setIsSubmitting(true);
            
      const orderToCheckout = draftOrder
        ? await orderService.updateDraft(draftOrder.id, buildOrderBody())
        : await orderService.createDraft(buildOrderBody());

      const completedOrder = await orderService.checkout(orderToCheckout.id, {
        paymentMethod,
        cashReceived: paymentMethod === "CASH" ? cashReceivedAmount : undefined,
        promotionCode: appliedPromotionCode || undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
      });
      setLastCompletedOrder(completedOrder);
      setIsCheckoutDialogOpen(false);
      resetPosState();
      toast.success(t("toast.pos.checkoutSuccess"));
      router.refresh();
      await loadProducts();
      
      if (setting?.autoOpenPrint) {
        setTimeout(() => {
          window.print();
        }, 1000);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function startNewOrder() {
    setLastCompletedOrder(null);
    resetPosState();
            focusBarcodeInput();
  }

  function downloadReceipt(order: Order) {
    const lines = [
      `${t("invoice.title")} ${order.orderCode}`,
      `${t("common.createdAt")}: ${new Date(order.createdAt).toLocaleString("vi-VN")}`,
      `${t("customers.title")}: ${order.customer?.fullName || t("customers.retail")}`,
      `${t("pos.cashier")}: ${order.user?.fullName || user?.fullName || "-"}`,
      "",
      ...order.orderDetails.map((detail) => {
        return `${detail.product?.name || detail.productId} x ${detail.quantity} - ${formatCurrency(detail.lineTotal)}`;
      }),
      "",
      `${t("pos.subtotal")}: ${formatCurrency(order.totalAmount)}`,
      `${t("orders.total")}: ${formatCurrency(order.totalAmount)}`,
      `${t("pos.cashReceived")}: ${order.payment?.cashReceived ? formatCurrency(order.payment.cashReceived) : "-"}`,
      `${t("pos.changeAmount")}: ${order.payment?.changeAmount ? formatCurrency(order.payment.changeAmount) : formatCurrency(0)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.orderCode}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function cancelDraftOrder() {
    if (!draftOrder) return;

    try {
      setIsSubmitting(true);
                  await orderService.cancel(draftOrder.id);
      resetPosState();
      setIsCancelDraftDialogOpen(false);
      toast.success(t("toast.pos.cancelDraftSuccess"));
      await loadProducts();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function applyVoucher(code: string) {
    if (cart.length === 0) return;
    
    if (!code) {
      setAppliedPromotionCode("");
      setAppliedDiscountAmount(0);
      setDiscountMessage("");
      return;
    }

    try {
      setIsSubmitting(true);
      setDiscountMessage("");
      const result = await promotionService.validate({
        code: code.toUpperCase(),
        subtotal,
        customerTier: selectedCustomer?.tier || "NONE",
        customerId: selectedCustomer?.id || null,
      });
      const amount = Math.min(Number(result.discountAmount || 0), subtotal);

      if (amount <= 0) {
        setAppliedDiscountAmount(0);
        setAppliedPromotionCode("");
        setTemporaryDiscountMessage(t("pos.voucherInvalid"), 5000);
        return;
      }

      setAppliedDiscountAmount(amount);
      setAppliedPromotionCode(code.toUpperCase());
      setTemporaryDiscountMessage(t("toast.pos.voucherAppliedWithAmount", { code: code.toUpperCase(), amount: formatCurrency(amount) }), 5000);
    } catch (error) {
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
      setTemporaryDiscountMessage(getApiErrorMessage(error) || t("pos.voucherInvalid"), 5000);
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyManualDiscount() {
    const rawValue = discountInput.trim();

    if (cart.length === 0) {
      setDiscountMessage(t("pos.discountNeedCart"));
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
      return;
    }

    if (!rawValue) {
      setAppliedDiscountAmount(0);
      setDiscountMessage("");
      return;
    }

    let amount = 0;

    if (discountType === "PERCENT") {
      const percent = Number(getDigits(rawValue));
      if (percent < 1 || percent > 100) {
        setDiscountMessage(t("pos.invalidDiscountPercent"));
        setAppliedDiscountAmount(0);
        setAppliedPromotionCode("");
        return;
      }
      amount = Math.floor((subtotal * percent) / 100);
    } else {
      const numValue = getMoneyInputAmount(rawValue);
      if (numValue <= 0) {
        setDiscountMessage(t("pos.invalidDiscountAmount"));
        setAppliedDiscountAmount(0);
        setAppliedPromotionCode("");
        return;
      }
      amount = Math.min(numValue, subtotal);
    }

    const maxDiscount = setting?.maxDiscount || 100;
    const maxDiscountAmount = Math.floor((subtotal * maxDiscount) / 100);

    if (discountType === "AMOUNT") {
      // Validate max discount for AMOUNT type if the setting is a percentage and applicable
      if (amount > maxDiscountAmount) {
        setDiscountMessage(t("settings.maxDiscountExceeded", { percent: maxDiscount, max: formatCurrency(maxDiscountAmount) }));
        setAppliedDiscountAmount(maxDiscountAmount);
        setAppliedPromotionCode("");
        return;
      }
    } else if (discountType === "PERCENT") {
      // For PERCENT type, we still validate against maxDiscountAmount
      if (amount > maxDiscountAmount) {
        setDiscountMessage(t("settings.maxDiscountExceeded", { percent: maxDiscount, max: formatCurrency(maxDiscountAmount) }));
        setAppliedDiscountAmount(maxDiscountAmount);
        setAppliedPromotionCode("");
        return;
      }
    }

    setAppliedDiscountAmount(amount);
    setAppliedPromotionCode("");
    if (discountType === "AMOUNT") {
      setDiscountMessage(t("toast.pos.manualDiscountAmountApplied", { amount: formatCurrency(amount) }));
    } else {
      setDiscountMessage(t("toast.pos.manualDiscountPercentApplied", { percent: getDigits(rawValue) }));
    }
  }

  async function createQuickCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
                  const data = await customerService.create({
        fullName: quickCustomerName,
        phone: quickCustomerPhone,
        email: quickCustomerEmail,
        address: quickCustomerAddress,
      });
      setCustomers((current) => [data, ...current]);
      setCustomerId(String(data.id));
      setIsCustomerDialogOpen(false);
      setQuickCustomerName("");
      setQuickCustomerPhone("");
      setQuickCustomerEmail("");
      setQuickCustomerAddress("");
      toast.success(t("toast.pos.customerCreated"));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleProductSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadProducts();
  }

  function renderReceiptView(order: Order) {
    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) startNewOrder(); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 py-4 border-b shrink-0 bg-emerald-50">
              <DialogTitle className="flex items-center gap-2 text-emerald-900">
                <ReceiptText className="h-5 w-5 shrink-0 text-emerald-700" />
                {t("pos.receiptTitle")} - {order.orderCode}
              </DialogTitle>
              <DialogDescription className="text-emerald-700">
                {t("pos.receiptDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("orders.orderCode")}</p>
                      <p className="truncate font-black text-slate-800">{order.orderCode}</p>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("common.createdAt")}</p>
                      <p className="font-bold text-slate-700">{new Date(order.createdAt).toLocaleString("vi-VN")}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("customers.title")}</p>
                      <p className="truncate font-bold text-slate-700">{order.customer?.fullName || t("customers.retail")}</p>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("pos.cashier")}</p>
                      <p className="truncate font-bold text-slate-700">{order.user?.fullName || user?.fullName || "-"}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                    {order.orderDetails.map((detail) => (
                      <div key={detail.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-800">{detail.product?.name || `#${detail.productId}`}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {detail.product?.sku || "-"} x {detail.quantity}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs font-black text-slate-800">{formatCurrency(detail.lineTotal)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm h-fit">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="font-semibold text-slate-500">{t("pos.subtotal")}</span>
                      <span className="font-black text-slate-800">{formatCurrency(order.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="font-semibold text-slate-500">{t("pos.discount")}</span>
                      <span className="font-black text-slate-800">{formatCurrency(order.discountAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-base">
                      <span className="font-black text-slate-900">{t("orders.total")}</span>
                      <span className="font-black text-primary">{formatCurrency(order.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="font-semibold text-slate-500">{t("pos.cashReceived")}</span>
                      <span className="font-black text-slate-800">{order.payment?.cashReceived ? formatCurrency(order.payment.cashReceived) : "-"}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="font-semibold text-slate-500">{t("pos.changeAmount")}</span>
                      <span className="font-black text-emerald-700">{formatCurrency(order.payment?.changeAmount || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t shrink-0 bg-slate-50">
              <div className="grid grid-cols-4 gap-3 w-full">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-teal-300 bg-white text-teal-900 hover:bg-teal-50 font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-w-0"
                  onClick={() => {
                    setCreateVatInitialCode(order.orderCode);
                    setIsCreateVatOpen(true);
                  }}
                >
                  <FileClock className="h-4 w-4 text-teal-700 shrink-0" />
                  <span className="truncate">{t("pos.vatRequest")}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-w-0"
                  onClick={() => downloadReceipt(order)}
                >
                  <Download className="h-4 w-4 text-slate-600 shrink-0" />
                  <span className="truncate">{t("pos.downloadInvoice")}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-all min-w-0"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4 text-slate-600 shrink-0" />
                  <span className="truncate">{t("orders.printInvoice")}</span>
                </Button>

                <Button
                  type="button"
                  className="h-11 bg-teal-800 hover:bg-teal-900 text-white font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all min-w-0"
                  onClick={startNewOrder}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("pos.newOrder")}</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
    );
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden print:hidden">
        <input
          ref={barcodeInputRef}
          className="sr-only"
          autoFocus
          autoComplete="off"
          aria-label={t("pos.barcodeInput")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleBarcodeScan(event.currentTarget.value);
              event.currentTarget.value = "";
            }
          }}
        />
        {/* Header cố định trong vùng POS (chỉ chứa nút cảnh báo ca làm việc nếu cần) */}
        {user?.role === "CASHIER" && !currentShift ? (
          <div className="shrink-0 flex items-center justify-end mb-2">
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 shadow-sm animate-in fade-in">
              <span className="font-semibold">{t("pos.shiftRequired")}</span>
            </div>
          </div>
        ) : null}

        {headerPortalTarget && createPortal(
          <div className="flex items-center justify-between w-full min-w-0 gap-3">
            <h2 className="truncate text-base font-black tracking-tight text-slate-800 lg:text-lg shrink-0">
              {t("pos.title")}
            </h2>
            
            <div className="flex items-center gap-2 flex-1 max-w-xl justify-end md:justify-start">
              <form onSubmit={handleProductSearch} className="flex-1 min-w-0">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="h-9 bg-slate-50 pl-8 pr-2.5 text-xs placeholder:text-[11px] placeholder:font-medium border-slate-200 focus:border-primary focus:bg-white transition-all rounded-lg w-full"
                    placeholder={t("pos.searchProduct")}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </div>
              </form>

              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 rounded-lg border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-xs cursor-pointer flex items-center justify-center"
                aria-label={t("salesAssistant.iconLabel")}
                title={t("salesAssistant.iconLabel")}
                onClick={() => setSalesAssistantOpen(true)}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
              
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const nextState = setting?.enableBarcodeScanner === false;
                      await settingService.update({ enableBarcodeScanner: nextState });
                      await refreshSettings();
                      if (nextState) {
                        toast.success(t("barcode.scannerEnabled"));
                      } else {
                        toast.info(t("barcode.scannerDisabled"));
                      }
                    } catch {
                      handleOpenRemoteScan();
                    }
                  }}
                  className={cn(
                    "h-9 px-3 text-xs font-medium rounded-lg border transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0 select-none",
                    setting?.enableBarcodeScanner !== false
                      ? "bg-emerald-100/80 text-emerald-900 border-emerald-300/80 hover:bg-emerald-200/80 hover:text-emerald-950 hover:border-emerald-400"
                      : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 hover:text-slate-900 hover:border-slate-400"
                  )}
                  title={t("pos.barcodeToggleTitle")}
                >
                  <Scan className={cn("h-3.5 w-3.5 shrink-0", setting?.enableBarcodeScanner !== false ? "text-emerald-800" : "text-slate-500")} />
                  <span>
                    {t("pos.barcodeToggleState", { state: setting?.enableBarcodeScanner !== false ? t("pos.enabled") : t("pos.disabled") })}
                  </span>
                  {setting?.enableBarcodeScanner !== false ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenRemoteScan();
                      }}
                      className="ml-1 rounded-md bg-emerald-200/80 p-1 hover:bg-emerald-300/90 text-emerald-900 transition-colors"
                      title={t("pos.phoneBarcodeTitle")}
                    >
                      <Smartphone className="h-3 w-3 text-emerald-900" />
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
          </div>,
          headerPortalTarget
        )}

        {/* Floating Notifications */}
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
          {!isOnline ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2">{t("network.checkoutDisabled")}</div> : null}
          {isShiftEndingSoon ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2">{t("shifts.shiftEndReached")}</div> : null}
        </div>

        {/* Main POS workspace: chỉ phần này */}
        {lastCompletedOrder ? renderReceiptView(lastCompletedOrder) : null}
        <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] xl:grid-cols-[minmax(0,1fr)_minmax(380px,420px)]">
          {/* Cột trái: tìm kiếm và danh sách sản phẩm */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border/50 bg-white shadow-sm relative">
            {/* Thanh chọn nhanh danh mục (0% Thanh cuộn - Canh chuẩn 5 ô & Nút 3 gạch đồng kích thước h-8) */}
            {(() => {
              // Nếu chọn 1 danh mục ngoài top, hiển thị 3 danh mục đầu + 1 danh mục đang chọn + Tất cả (Tổng 5 nút)
              const maxTopCount = selectedCategoryId && categories.slice(4).some(c => String(c.id) === selectedCategoryId) ? 3 : 4;
              const visibleCategories = categories.slice(0, maxTopCount);
              const extraCategories = categories.slice(maxTopCount);
              const selectedExtraCategory = extraCategories.find((c) => String(c.id) === selectedCategoryId);

              return (
                <div className="shrink-0 px-3.5 py-2 border-b border-border/40 bg-slate-50/50 flex items-center justify-between gap-2 relative z-20">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                    <button
                      type="button"
                      className={cn(
                        "h-8 shrink-0 flex items-center justify-center rounded-full px-3.5 text-xs font-semibold transition-all duration-150 border cursor-pointer whitespace-nowrap",
                        selectedCategoryId === ""
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                      )}
                      onClick={() => {
                        setSelectedCategoryId("");
                        setIsMoreCategoriesOpen(false);
                      }}
                    >
                      {t("common.all")}
                    </button>

                    {visibleCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className={cn(
                          "h-8 shrink-0 flex items-center justify-center rounded-full px-3 text-xs font-semibold transition-all duration-150 border cursor-pointer whitespace-nowrap",
                          selectedCategoryId === String(category.id)
                            ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                        )}
                        onClick={() => {
                          setSelectedCategoryId(String(category.id));
                          setIsMoreCategoriesOpen(false);
                        }}
                      >
                        {formatCategoryName(category.name)}
                      </button>
                    ))}

                    {selectedExtraCategory ? (
                      <button
                        type="button"
                        className="h-8 shrink-0 flex items-center justify-center rounded-full px-3 text-xs font-bold transition-all duration-150 border bg-primary text-primary-foreground border-primary shadow-xs cursor-pointer whitespace-nowrap"
                      >
                        {formatCategoryName(selectedExtraCategory.name)}
                      </button>
                    ) : null}
                  </div>

                  {/* Nút 3 gạch (Menu Button) góc phải - Canh hàng chuẩn h-8 trùng khớp với các ô */}
                  <div className="relative shrink-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => setIsMoreCategoriesOpen((prev) => !prev)}
                      title={t("common.allCategories")}
                      className={cn(
                        "h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border transition-all duration-150 cursor-pointer shadow-2xs",
                        isMoreCategoriesOpen || selectedExtraCategory
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <Menu className="h-4 w-4" />
                    </button>

                    {/* Popover Menu Bo cong 2xl sang trọng */}
                    {isMoreCategoriesOpen ? (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsMoreCategoriesOpen(false)} />
                        <div className="absolute right-0 top-full mt-2 z-50 min-w-[230px] rounded-2xl border border-slate-200/90 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1 flex items-center justify-between">
                            <span>{t("common.allCategories")}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-bold">{categories.length}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategoryId("");
                                setIsMoreCategoriesOpen(false);
                              }}
                              className={cn(
                                "flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-left transition-all cursor-pointer",
                                selectedCategoryId === ""
                                  ? "bg-primary/10 text-primary font-bold"
                                  : "text-slate-700 hover:bg-slate-100/80"
                              )}
                            >
                              <div className="flex items-center gap-2.5">
                                <Layers className="h-4 w-4 text-slate-400" />
                                <span>{t("common.all")}</span>
                              </div>
                              {selectedCategoryId === "" ? <Check className="h-4 w-4 text-primary" /> : null}
                            </button>

                            {categories.map((category) => {
                              const isSelected = selectedCategoryId === String(category.id);
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategoryId(String(category.id));
                                    setIsMoreCategoriesOpen(false);
                                  }}
                                  className={cn(
                                    "flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold text-left transition-all cursor-pointer",
                                    isSelected
                                      ? "bg-primary/10 text-primary font-bold"
                                      : "text-slate-700 hover:bg-slate-100/80"
                                  )}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className={cn("h-2 w-2 rounded-full", isSelected ? "bg-primary" : "bg-slate-300")} />
                                    <span>{formatCategoryName(category.name)}</span>
                                  </div>
                                  {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pr-2 scrollbar-thin">
              {isLoadingProducts ? <LoadingState /> : null}
              {!isLoadingProducts && products.length === 0 ? <EmptyState message={t("message.noProducts")} /> : null}

              <div className="grid min-w-0 grid-cols-2 gap-3 pb-4 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => {
                  const isLowStock = product.stockQuantity <= product.minStock;

                  return (
                    <Card
                      key={product.id}
                      className={cn(
                        "group flex min-w-0 flex-col overflow-hidden border border-slate-200/60 bg-white transition-all duration-300 rounded-xl hover:shadow-md",
                        product.stockQuantity > 0
                          ? "cursor-pointer hover:border-primary/45 hover:scale-[1.01]"
                          : "opacity-85 cursor-not-allowed"
                      )}
                      onClick={() => product.stockQuantity > 0 && addToCart(product)}
                    >
                      <div className="relative h-28 overflow-hidden bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                        <img
                          src={getProductImage(product)}
                          alt={product.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = REAL_PRODUCT_FALLBACK_IMAGE;
                          }}
                        />
                        <div
                          className={cn(
                            "absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold shadow-sm border",
                            getStockBadgeStyle(product.stockQuantity)
                          )}
                        >
                          {t("pos.stockLabel", { count: product.stockQuantity })}
                        </div>
                        {product.stockQuantity <= 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[0.5px]">
                            <span className="rounded bg-red-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white shadow-sm">
                              {t("pos.outOfStock")}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      
                      <div className="flex flex-col flex-1 p-3">
                        <h3 className="line-clamp-2 text-xs font-bold text-slate-800 leading-snug mb-1 h-8 flex-none" title={product.name}>
                          {product.name}
                        </h3>
                        
                        <div className="text-[10px] text-slate-400 font-mono font-semibold mb-2">
                          {product.sku || "N/A"}
                        </div>
                        
                        <div className="mt-auto flex items-baseline justify-between">
                          <div>
                            {product.originalPrice && product.originalPrice > product.salePrice ? (
                              <div className="text-[9px] font-semibold text-muted-foreground line-through mb-0.5">
                                {formatCurrency(product.originalPrice)}
                              </div>
                            ) : null}
                            <div className="font-black text-primary text-xs sm:text-sm">
                              {formatCurrency(product.salePrice)}
                            </div>
                          </div>
                        </div>

                        {/* Nút thêm ở đáy */}
                        <div className="mt-3 pt-2 border-t border-slate-100">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              "w-full h-8 text-[11px] font-bold rounded-lg border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all duration-200 flex items-center justify-center gap-1",
                              product.stockQuantity <= 0 && "opacity-50 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-50 hover:text-slate-400"
                            )}
                            disabled={product.stockQuantity <= 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (product.stockQuantity > 0) {
                                addToCart(product);
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            <span>{t("pos.addToCartShort")}</span>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cột phải: giỏ hàng cố định đúng chiều cao màn hình */}
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="shrink-0 border-b border-slate-100 px-3 py-2 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-wide text-slate-800">{t("pos.cart")}</span>
                {cart.length > 0 ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-white">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                ) : null}
              </div>
              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => { setCart([]); setAppliedDiscountAmount(0); setAppliedPromotionCode(""); setDiscountInput(""); setDiscountMessage(""); }}
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title={t("common.delete")}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

              {/* Vùng khách hàng */}
              <div className="shrink-0 space-y-2 border-b border-border/40 px-3 py-2 bg-slate-50/50">
                {selectedCustomer ? (
                  <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/70 p-2 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-600 text-white font-extrabold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                        {selectedCustomer.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-extrabold text-xs text-slate-900 truncate" title={selectedCustomer.fullName}>
                            {selectedCustomer.fullName}
                          </span>
                          {selectedCustomer.phone && (
                            <span className="text-[11px] font-mono font-semibold text-slate-600 shrink-0">
                              ({selectedCustomer.phone})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                          {renderCustomerTierBadge(selectedCustomer.tier, t)}
                          <span className="text-emerald-700 font-bold shrink-0">
                            • {formatNumber(selectedCustomer.points)} {t("customers.points")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId("");
                        setCustomerSearch("");
                      }}
                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-destructive hover:bg-emerald-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                      title={t("pos.clearCustomer")}
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-muted-foreground pointer-events-none">
                          <Search className="w-3.5 h-3.5" />
                        </span>
                        <form onSubmit={searchCustomers}>
                          <input
                            type="text"
                            value={customerSearch}
                            onChange={(event) => setCustomerSearch(event.target.value)}
                            placeholder={t("pos.customerPlaceholder")}
                            className="w-full bg-white border border-border pl-8 pr-2 py-1 rounded-md text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition h-8"
                          />
                        </form>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0 h-8 w-8 p-0 cursor-pointer"
                        title={t("customers.quickAdd")}
                        onClick={() => {
                          setQuickCustomerPhone(customerSearch);
                          setIsCustomerDialogOpen(true);
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="h-8 text-xs py-1">
                      <option value="">{t("customers.retail")}</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.fullName} {customer.phone ? `- ${customer.phone}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {/* Vùng danh sách sản phẩm trong giỏ: thiết kế dòng phẳng tối giản, cuộn nội bộ */}
              <div
                ref={cartScrollRef}
                className="flex-1 min-h-[160px] overflow-y-auto px-3 py-2 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:bg-transparent"
              >
                {cart.length === 0 ? (
                  <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 text-center">
                    <ShoppingCart className="mb-3 h-9 w-9 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">{t("message.emptyCart")}</p>
                    <p className="mt-1 text-xs text-gray-400">{t("pos.emptyCartHint")}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {cart.map((item) => {
                      const lineTotal = item.product.salePrice * item.quantity;

                      return (
                        <div
                          key={item.product.id}
                          className="py-3 flex items-start justify-between gap-3 group"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <img
                              src={getProductImage(item.product)}
                              alt={item.product.name}
                              className="w-11 h-11 rounded-lg border border-border/60 object-cover shrink-0 bg-white p-0.5"
                            />
                            
                            <div className="min-w-0 leading-tight">
                              <p className="text-xs font-black text-foreground truncate" title={item.product.name}>
                                {item.product.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5">{item.product.sku}</p>
                              
                              <div className="flex items-center gap-1 mt-2">
                                <button
                                  type="button"
                                  onClick={() => changeQuantity(item.product.id, -1)}
                                  className="w-6 h-6 rounded bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center text-xs font-extrabold disabled:opacity-40"
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="flex h-6 w-10 items-center justify-center rounded border border-border/60 text-xs font-black text-foreground">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => changeQuantity(item.product.id, 1)}
                                  className="w-6 h-6 rounded bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center text-xs font-extrabold disabled:opacity-40"
                                  disabled={item.quantity >= item.product.stockQuantity}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className="text-xs font-black text-foreground">
                              {formatCurrency(lineTotal)}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {formatCurrency(item.product.salePrice)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="text-[10px] font-bold text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition duration-150 self-end mt-1"
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Vùng đáy cố định: mã giảm giá + tiền + phương thức + nút hành động */}
              <div className="shrink-0 border-t border-gray-100 bg-card px-3 py-2 shadow-[0_-8px_20px_rgba(15,23,42,0.05)]">
                {/* Voucher & Discount Row */}
                <div className="mb-2 flex items-center gap-2">
                  {/* Smart Integrated Voucher Input & Popover List */}
                  <div className="relative flex-1 min-w-0">
                    <div className="relative flex items-center">
                      <Ticket className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 shrink-0 pointer-events-none" />
                      <Input
                        type="text"
                        value={voucherInput}
                        onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (voucherInput.trim()) {
                              void applyVoucher(voucherInput.trim());
                            }
                          }
                        }}
                        placeholder={t("pos.promotionPlaceholder")}
                        className={cn(
                          "h-10 pl-8 pr-8 text-xs font-semibold rounded-lg border-slate-200 transition-all w-full",
                          appliedPromotionCode
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                            : "bg-white text-slate-800"
                        )}
                        disabled={cart.length === 0 || isSubmitting}
                      />

                      <div className="absolute right-1 flex items-center gap-0.5">
                        {appliedPromotionCode ? (
                          <button
                            type="button"
                            onClick={() => {
                              setVoucherInput("");
                              void applyVoucher("");
                            }}
                            className="p-1.5 rounded-md text-slate-400 hover:text-destructive hover:bg-slate-100 transition-colors"
                            title={t("pos.removePromotion")}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsPromoPopoverOpen(!isPromoPopoverOpen)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title={t("pos.availablePromotions", { count: eligiblePromotions.length })}
                            disabled={cart.length === 0 || isSubmitting}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Popover danh sách mã khả dụng */}
                    {isPromoPopoverOpen && (
                      <div className="absolute bottom-full mb-1 left-0 right-0 z-50 rounded-xl bg-white border border-slate-200 shadow-2xl p-2 space-y-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 min-w-[240px]">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1 border-b border-slate-100 flex justify-between items-center">
                          <span>{t("pos.availablePromotions", { count: eligiblePromotions.length })}</span>
                          <button
                            type="button"
                            onClick={() => setIsPromoPopoverOpen(false)}
                            className="text-slate-400 hover:text-slate-600 font-bold px-1"
                          >
                            ✕
                          </button>
                        </div>

                        {eligiblePromotions.length === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400 font-medium">
                            {t("pos.noEligiblePromotion")}
                          </div>
                        ) : (
                          eligiblePromotions.map((p) => {
                            const tiersText = p.eligibleTiers === "ALL" || !p.eligibleTiers ? t("promotions.tierAll") : p.eligibleTiers.split(",").map(tier => getTierLabel(tier.trim(), t)).join(", ");
                            const discountLabel = t("pos.discountValue", { value: p.discountType === "PERCENT" ? `${p.discountValue}%` : formatCurrency(p.discountValue) });

                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setVoucherInput(p.code);
                                  void applyVoucher(p.code);
                                  setIsPromoPopoverOpen(false);
                                }}
                                className={cn(
                                  "w-full text-left p-2 rounded-lg border transition-all flex flex-col gap-1 cursor-pointer hover:border-primary/50 hover:bg-primary/5",
                                  appliedPromotionCode === p.code
                                    ? "border-emerald-300 bg-emerald-50/70"
                                    : "border-slate-100 bg-slate-50/60"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-extrabold text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-md">
                                    {p.code}
                                  </span>
                                  <span className="font-bold text-xs text-emerald-600">
                                    {discountLabel}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>{t("pos.minimumOrder")} <strong className="text-slate-700">{formatCurrency(p.minOrderAmount)}</strong></span>
                                  <span>•</span>
                                  <span>{t("pos.appliesTo")} <strong className="text-slate-700">{tiersText}</strong></span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Select
                      value={discountType}
                      onChange={(event) => {
                        setDiscountType(event.target.value as "AMOUNT" | "PERCENT");
                        setDiscountInput("");
                        setDiscountMessage("");
                        setAppliedDiscountAmount(0);
                      }}
                      disabled={cart.length === 0 || isSubmitting || appliedPromotionCode !== ""}
                      className="h-10 text-[11px] w-20 font-bold shrink-0"
                    >
                      <option value="AMOUNT">{t("pos.discountAmount")}</option>
                      <option value="PERCENT">{t("pos.discountPercent")}</option>
                    </Select>

                    <div className="relative w-28 shrink-0">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={discountInput}
                        onChange={(event) => setDiscountInput(formatDiscountInput(event.target.value, discountType))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyManualDiscount();
                          }
                        }}
                        placeholder={discountType === "AMOUNT" ? t("pos.manualDiscountPlaceholderAmount") : t("pos.manualDiscountPlaceholderPercent")}
                        className={cn("h-10 text-[11px] w-full px-2", discountType === "PERCENT" ? "pr-6" : "")}
                        disabled={cart.length === 0 || isSubmitting || appliedPromotionCode !== ""}
                        title={t("pos.discountInputPlaceholder")}
                      />
                      {discountType === "PERCENT" && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">
                          %
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {discountMessage ? (
                  <p className={cn("mb-1 text-[10px] font-bold uppercase", discountAmount > 0 ? "text-emerald-600" : "text-destructive")}>
                    {discountMessage}
                  </p>
                ) : null}

                {/* Summary */}
                <div className="space-y-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs mb-2">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 font-semibold">{t("pos.subtotal")}</span>
                    <span className="font-bold text-slate-700">{formatCurrency(subtotal)}</span>
                  </div>
                  {appliedPromotionCode ? (
                    <div className="flex justify-between gap-4">
                      <span className="text-emerald-600 font-semibold">{t("pos.voucher")} ({appliedPromotionCode})</span>
                      <span className="font-bold text-emerald-700">-{formatCurrency(discountAmount)}</span>
                    </div>
                  ) : null}
                  {!appliedPromotionCode && discountAmount > 0 ? (
                    <div className="flex justify-between gap-4">
                      <span className="text-amber-600 font-semibold">{t("pos.manualDiscount")}</span>
                      <span className="font-bold text-amber-700">-{formatCurrency(discountAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5 text-sm mt-1.5">
                    <span className="font-black text-slate-800">{t("pos.totalPayable")}</span>
                    <span className="font-black text-primary text-base">{formatCurrency(totalPayable)}</span>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {paymentMethods.map((method) => {
                    let PaymentIcon;
                    let label = "";
                    if (method === "CASH") {
                      PaymentIcon = Banknote;
                      label = t("paymentMethod.CASH");
                    } else {
                      PaymentIcon = QrCode;
                      label = t("paymentMethod.TRANSFER");
                    }

                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={cn(
                          "flex flex-col sm:flex-row items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-bold transition duration-200 cursor-pointer",
                          paymentMethod === method
                            ? "border-primary bg-primary text-white shadow-sm"
                            : "border-border bg-slate-50 text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        <PaymentIcon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {draftOrder ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-lg h-12 px-3 text-xs"
                      disabled={isSubmitting}
                      onClick={() => setIsCancelDraftDialogOpen(true)}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      {t("pos.cancelOrder")}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="rounded-lg h-12 px-3 text-xs shrink-0" disabled={isSubmitting || cart.length === 0} onClick={createDraft}>
                      {t("pos.createDraft")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    className="flex-1 rounded-lg bg-accent text-sm sm:text-base font-black uppercase tracking-wider text-white shadow-md hover:bg-accent/90 h-12 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                    disabled={isCheckoutDisabled}
                    onClick={startCheckout}
                  >
                    <span>{t("pos.checkout")} (F9)</span>
                  </Button>
                </div>
                {draftOrder ? (
                  <div className="mt-1.5 truncate text-center text-[10px] text-muted-foreground">
                    {t("pos.processingDraft")}: <span className="font-semibold">{draftOrder.orderCode}</span>
                  </div>
                ) : null}
              </div>
          </div>
        </div>

        <Dialog open={isCheckoutDialogOpen} onOpenChange={setIsCheckoutDialogOpen}>
          <DialogContent className={cn("max-h-[92vh] overflow-y-auto transition-all duration-300", checkoutStep === "qr" ? "max-w-4xl p-0" : "max-w-2xl p-4 sm:p-5")}>
            {checkoutStep !== "qr" ? (
              <DialogHeader className="space-y-0.5 mb-1">
                <DialogTitle className="text-base sm:text-lg">
                  {checkoutStep === "confirm" ? t("pos.confirmOrderTitle") : t("pos.cashCheckoutTitle")}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {checkoutStep === "confirm" ? t("pos.confirmOrderDescription") : t("pos.cashCheckoutDescription")}
                </DialogDescription>
              </DialogHeader>
            ) : null}

            <form
              className={cn(checkoutStep !== "qr" && "space-y-2.5")}
              onSubmit={(event) => {
                event.preventDefault();
                if (checkoutStep === "confirm") {
                  if (paymentMethod === "CASH") {
                    setCheckoutStep("cash");
                  } else {
                    void prepareTransferCheckout();
                  }
                  return;
                }

                if (checkoutStep === "cash" && !isCashPaymentInvalid && !isSubmitting) {
                  void checkout();
                  return;
                }

                if (checkoutStep === "qr" && !isSubmitting) {
                  void checkout();
                }
              }}
            >
              {checkoutStep !== "qr" ? (
                <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="min-w-0 rounded-xl border border-slate-100">
                    <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {t("pos.orderItems")}
                    </div>
                    <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
                      {cart.map((item) => (
                        <div key={item.product.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 px-3 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-800">{item.product.name}</p>
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {item.product.sku} x {item.quantity}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-black text-slate-800">{formatCurrency(item.product.salePrice * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-xl border bg-slate-50 p-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("customers.title")}</p>
                      <p className="truncate font-bold text-slate-800">{selectedCustomer?.fullName || t("customers.retail")}</p>
                      {selectedCustomer ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                          {renderCustomerTierBadge(selectedCustomer.tier, t)}
                          <span className="font-semibold text-slate-500">• {formatNumber(selectedCustomer.points)} {t("customers.points")}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("pos.paymentMethod")}</p>
                      <p className="truncate font-bold text-slate-800">{t(`paymentMethod.${paymentMethod}`)}</p>
                    </div>
                    <div className="space-y-1 border-t border-slate-200 pt-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500">{t("pos.subtotal")}</span>
                        <span className="font-bold text-slate-800">{formatCurrency(subtotal)}</span>
                      </div>
                      {appliedPromotionCode ? (
                        <div className="flex justify-between gap-2">
                          <span className="text-emerald-600 font-medium">Voucher ({appliedPromotionCode})</span>
                          <span className="font-bold text-emerald-700">-{formatCurrency(discountAmount)}</span>
                        </div>
                      ) : null}
                      {!appliedPromotionCode && discountAmount > 0 ? (
                        <div className="flex justify-between gap-2">
                          <span className="text-amber-600 font-medium">{t("pos.manualDiscount")}</span>
                          <span className="font-bold text-amber-700">-{formatCurrency(discountAmount)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-2 border-t border-slate-200 pt-1 text-sm">
                        <span className="font-black text-slate-900">{t("pos.totalPayable")}</span>
                        <span className="font-black text-primary">{formatCurrency(totalPayable)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {checkoutStep === "cash" ? (
                <div className="space-y-2 rounded-xl border bg-card p-2.5">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="pos-cash-received" className="text-xs">{t("pos.cashReceived")}</Label>
                      <Input
                        id="pos-cash-received"
                        ref={cashReceivedInputRef}
                        inputMode="numeric"
                        value={cashReceivedInput}
                        onChange={(event) => setCashReceivedInput(formatMoneyInput(event.target.value))}
                        placeholder={t("pos.cashReceivedPlaceholder")}
                        className="h-10 text-base font-semibold"
                        disabled={cart.length === 0 || isSubmitting}
                      />
                    </div>
                    <div className="flex flex-col justify-center rounded-xl bg-slate-50 p-2">
                      <span className="text-xs font-semibold text-muted-foreground">{t("pos.changeAmount")}</span>
                      <span className={cn("text-xl font-black", isCashPaymentInvalid ? "text-destructive" : "text-green-700")}>{formatCurrency(changeAmount)}</span>
                      {isCashPaymentInvalid ? <p className="mt-0.5 text-xs text-destructive">{t("pos.cashNotEnough")}</p> : null}
                    </div>
                  </div>

                  {/* 4 Quick Cash Suggestions in 4 Columns Side-by-Side on Single Row */}
                  <div className="border-t border-slate-100 pt-1.5">
                    <p className="text-[10px] font-extrabold text-slate-500 mb-1.5 flex items-center gap-1">
                      <Coins className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span>{t("pos.quickSelectCash")}</span>
                    </p>
                    <div className="grid grid-cols-4 gap-2 w-full">
                      {quickCashOptions.map((amount) => {
                        const isExact = amount === totalPayable;
                        const currentInputNum = getMoneyInputAmount(cashReceivedInput);
                        const isSelected = currentInputNum === amount;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setCashReceivedInput(formatMoneyInput(String(amount)))}
                            className={cn(
                              "px-2 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1 min-w-0 w-full",
                              isExact
                                ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 font-black shadow-xs"
                                : isSelected
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-400 font-extrabold"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-bold"
                            )}
                          >
                            {isExact ? (
                              <>
                                <Check className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{t("pos.exactCash")}</span>
                              </>
                            ) : (
                              <span className="truncate">{formatCurrency(amount)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {checkoutStep === "qr" ? (
                (() => {
                  const BANK_NAMES_MAP: Record<string, string> = {
                    VCB: "Vietcombank - Ngân hàng TMCP Ngoại Thương Việt Nam (VCB)",
                    CTG: "VietinBank - Ngân hàng TMCP Công thương Việt Nam (CTG)",
                    BIDV: "BIDV - Ngân hàng TMCP Đầu tư và Phát triển Việt Nam",
                    VBA: "Agribank - Ngân hàng Nông nghiệp và Phát triển Nông thôn (VBA)",
                    TCB: "Techcombank - Ngân hàng TMCP Kỹ thương Việt Nam (TCB)",
                    MB: "MB Bank - Ngân hàng TMCP Quân đội",
                    ACB: "ACB - Ngân hàng TMCP Á Châu",
                    STB: "Sacombank - Ngân hàng TMCP Sài Gòn Thương Tín",
                    VPB: "VPBank - Ngân hàng TMCP Việt Nam Thịnh Vượng",
                    HDB: "HDBank - Ngân hàng TMCP Phát triển TP. Hồ Chí Minh",
                    TPB: "TPBank - Ngân hàng TMCP Tiên Phong",
                    VIB: "VIB - Ngân hàng TMCP Quốc tế Việt Nam",
                    MSB: "MSB - Ngân hàng TMCP Hàng Hải",
                    SHB: "SHB - Ngân hàng TMCP Sài Gòn - Hà Nội",
                    OCB: "OCB - Ngân hàng TMCP Phương Đông",
                    EIB: "Eximbank - Ngân hàng TMCP Xuất Nhập khẩu Việt Nam",
                    SEAB: "SeABank - Ngân hàng TMCP Đông Nam Á",
                    BAB: "Bac A Bank - Ngân hàng TMCP Bắc Á",
                    PVC: "PVcomBank - Ngân hàng TMCP Đại Chúng Việt Nam",
                    ABB: "ABBANK - Ngân hàng TMCP An Bình",
                    DAB: "DongA Bank - Ngân hàng TMCP Đông Á",
                    BVB: "BVBank - Ngân hàng TMCP Bản Việt",
                    KLB: "Kienlongbank - Ngân hàng TMCP Kiên Long",
                    LPB: "LPBank - Ngân hàng TMCP Bưu điện Liên Việt",
                    NAB: "Nam A Bank - Ngân hàng TMCP Nam Á",
                    SGB: "Saigonbank - Ngân hàng TMCP Sài Gòn Công Thương",
                    VAB: "Vietbank - Ngân hàng TMCP Việt Nam Thương Tín",
                    NCB: "NCB - Ngân hàng TMCP Quốc Dân",
                    CBB: "CB - Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam",
                    OCEAN: "OceanBank - Ngân hàng Thương mại TNHH MTV Đại Dương",
                    GPB: "GPBank - Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu",
                    SHBVN: "Shinhan Bank - Ngân hàng Shinhan Việt Nam",
                    HSBC: "HSBC - Ngân hàng TNHH một thành viên HSBC Việt Nam",
                    SCB: "Standard Chartered - Ngân hàng TNHH MTV Standard Chartered Việt Nam",
                    PBVN: "Public Bank - Ngân hàng TNHH MTV Public Bank Việt Nam",
                    UOB: "UOB - Ngân hàng TNHH MTV United Overseas Bank Việt Nam",
                    WOORI: "Woori Bank - Ngân hàng TNHH MTV Woori Việt Nam",
                    CIMB: "CIMB - Ngân hàng TNHH MTV CIMB Việt Nam",
                    CAKE: "Cake by VPBank - Ngân hàng số Cake",
                    TIMO: "Timo - Ngân hàng số Timo",
                  };

                  const isMBBank = !setting?.bankName || setting.bankName.toUpperCase().includes("MB") || setting.bankName.toUpperCase() === "MB";
                  const qrCodeSrc = payOSPayment?.qrCode || generateVietQRUrl();
                  const isPayOSQrCodeSVG = payOSPayment?.qrCode && payOSPayment.qrCode.startsWith("000201");
                  
                  return (
                    <div className="min-h-0 bg-white rounded-b-2xl overflow-hidden flex flex-col">
                      <div className="grid grid-cols-1 lg:grid-cols-[40%_60%] min-h-[500px]">
                        
                        {/* CỘT TRÁI: KHUNG QUÉT QR */}
                        <div className="flex flex-col items-stretch justify-between gap-5 border-r border-slate-100 bg-[#f8fafc] px-8 py-7">
                          {/* Title Block Left Aligned */}
                          <div className="flex items-start gap-3 justify-start text-left">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0">
                              <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black tracking-tight text-slate-800 uppercase leading-none">
                                {t("pos.transferTitle")}
                              </h3>
                              <p className="text-[11px] text-slate-400 font-semibold leading-relaxed mt-1">
                                {t("pos.transferAutoDescription")}
                              </p>
                            </div>
                          </div>

                          {/* Badge + PAYOS AUTO Centered above QR */}
                          <div className="flex items-center justify-center">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[9px] font-black uppercase text-white tracking-wider">
                              + PAYOS AUTO
                            </span>
                          </div>

                          {/* Khung QR Scanner */}
                          <div className="relative flex h-[270px] w-[270px] flex-col items-center justify-between rounded-2xl bg-white p-4 shadow-sm border border-slate-100 mx-auto">
                            {/* Góc Scanner */}
                            <div className="absolute top-2 left-2 h-5 w-5 border-t-2 border-l-2 border-blue-600 rounded-tl"></div>
                            <div className="absolute top-2 right-2 h-5 w-5 border-t-2 border-r-2 border-blue-600 rounded-tr"></div>
                            <div className="absolute bottom-2 left-2 h-5 w-5 border-b-2 border-l-2 border-blue-600 rounded-bl"></div>
                            <div className="absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-blue-600 rounded-br"></div>

                            {/* Trạng thái Loading */}
                            {isQrLoading && !isPayOSQrCodeSVG && (
                              <div className="absolute inset-3 z-20 flex flex-col items-center justify-center bg-white rounded-lg space-y-2">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                                <span className="text-[10px] font-bold text-slate-400">{t("pos.qrLoading")}</span>
                              </div>
                            )}

                            {/* Hiển thị QR Code */}
                            <div className="flex-1 flex items-center justify-center w-full p-2">
                              {isPayOSQrCodeSVG ? (
                                <QRCodeSVG
                                  value={payOSPayment?.qrCode || ""}
                                  size={180}
                                  level="L"
                                  includeMargin={false}
                                />
                              ) : (
                                <img
                                  src={qrCodeSrc}
                                  alt={t("pos.transferQrAlt")}
                                  className={cn(
                                    "max-h-[180px] max-w-[180px] object-contain transition-opacity duration-300",
                                    isQrLoading ? "opacity-0" : "opacity-100"
                                  )}
                                  onLoad={() => setIsQrLoading(false)}
                                />
                              )}
                            </div>

                            {/* Scan label inside frame at bottom */}
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                              <Scan className="h-3.5 w-3.5 text-slate-400" />
                              <span>{t("pos.scanToPay")}</span>
                            </div>
                          </div>

                          {/* Trạng thái - Đang chờ thanh toán */}
                          <div className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-100 py-2.5 px-4">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700">
                              {t("pos.waitingAutoConfirm")}
                            </span>
                          </div>
                        </div>

                        {/* CỘT PHẢI: THÔNG TIN CHI TIẾT */}
                        <div className="relative flex flex-col justify-between p-8 bg-white text-left">
                          {/* Nút X đóng góc trên bên phải */}
                          <button
                            type="button"
                            onClick={() => {
                              setIsCheckoutDialogOpen(false);
                              setPayOSPayment(null);
                              setPayOSStatusText("pos.payosWaiting");
                            }}
                            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>

                          {/* Bank Header Info */}
                          <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
                            {/* Logo ngân hàng */}
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white p-1 shadow-sm overflow-hidden relative">
                              <img
                                src={`https://api.vietqr.io/img/${(setting?.bankName || "MB").toUpperCase()}.png`}
                                alt={setting?.bankName || "MB"}
                                className="h-full w-full object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const fallbackEl = e.currentTarget.parentElement?.querySelector(".fallback-text");
                                  if (fallbackEl) {
                                    fallbackEl.classList.remove("hidden");
                                  }
                                }}
                              />
                              <span className="fallback-text hidden text-xs font-black text-blue-600">
                                {(setting?.bankName || "MB").substring(0, 3).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none">{t("pos.beneficiaryBank")}</p>
                              <p className="mt-1 text-sm font-extrabold text-slate-800">
                                {BANK_NAMES_MAP[setting?.bankName || ""] || setting?.bankName || "MB Bank - Ngân hàng TMCP Quân đội"}
                              </p>
                            </div>
                          </div>

                          {/* Danh sách thẻ thông tin - Dàn hàng dọc 1 cột */}
                          <div className="my-5 flex flex-col gap-3">
                            {/* 1. Số tài khoản */}
                            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:border-slate-200">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                  <User className="h-4.5 w-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">{t("pos.bankAccountNumber")}</p>
                                  <p className="mt-1 font-mono font-bold text-slate-800 text-sm leading-none">
                                    {setting?.bankAccountNumber || "0877724374"}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0"
                                onClick={() => {
                                  void navigator.clipboard.writeText(setting?.bankAccountNumber || "0877724374");
                                  toast.success(t("pos.copiedField", { field: t("pos.bankAccountNumber") }));
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* 2. Chủ tài khoản */}
                            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:border-slate-200">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                  <User className="h-4.5 w-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">{t("pos.bankAccountName")}</p>
                                  <p className="mt-1 font-bold text-slate-800 text-xs leading-none uppercase truncate">
                                    {setting?.bankAccountName || "MAI TRAN THIEN TAM"}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0"
                                onClick={() => {
                                  void navigator.clipboard.writeText(setting?.bankAccountName || "MAI TRAN THIEN TAM");
                                  toast.success(t("pos.copiedField", { field: t("pos.bankAccountName") }));
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* 3. Số tiền thanh toán */}
                            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:border-slate-200">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                  <CreditCard className="h-4.5 w-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">{t("pos.paymentAmount")}</p>
                                  <p className="mt-1 font-extrabold text-blue-600 text-sm leading-none">
                                    {`${new Intl.NumberFormat(language === "en" ? "en-GB" : "vi-VN", { maximumFractionDigits: 0 }).format(payOSPayment?.amount || totalPayable)}đ`}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0"
                                onClick={() => {
                                  const amount = payOSPayment?.amount || totalPayable;
                                  void navigator.clipboard.writeText(String(amount));
                                  toast.success(t("pos.copiedField", { field: t("pos.paymentAmount") }));
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* 4. Nội dung chuyển khoản */}
                            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/10 p-3.5 shadow-sm transition-all hover:border-amber-300">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                                  <FileText className="h-4.5 w-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider leading-none">{t("pos.transferMemo")}</p>
                                  <p className="mt-1 font-mono font-bold text-slate-800 text-sm leading-none">
                                    {payOSPaymentCode}
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-100/50 rounded-lg cursor-pointer shrink-0"
                                onClick={() => {
                                  void navigator.clipboard.writeText(payOSPaymentCode);
                                  toast.success(t("pos.copiedField", { field: t("pos.transferMemo") }));
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Footer Message */}
                          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-[11px] font-semibold text-blue-700 leading-relaxed shadow-sm flex items-start gap-2.5">
                            <ShieldCheck className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />
                            <span>
                              {t("pos.payosAutoNotice")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Footer Action Row (Separated at the bottom) */}
                      <div className="flex flex-col sm:flex-row gap-3 border-t border-slate-100 p-6 bg-slate-50/30 rounded-b-2xl justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 px-8 flex items-center justify-center gap-2 text-sm font-bold text-slate-700 bg-white border-slate-200 hover:bg-slate-50 rounded-xl sm:w-[160px]"
                          onClick={() => {
                            setCheckoutStep("confirm");
                            setPayOSPayment(null);
                            setPayOSStatusText("pos.payosWaiting");
                          }}
                          disabled={isSubmitting}
                        >
                          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
                        </Button>
                        <Button
                          type="submit"
                          className="h-12 flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-md transition duration-200 flex flex-col items-center justify-center py-1 cursor-pointer"
                          disabled={isSubmitting}
                        >
                          <div className="flex items-center gap-1.5 font-bold text-sm">
                            <Check className="h-4 w-4" /> {t("pos.transferred")}
                          </div>
                          <span className="text-[9px] font-medium opacity-80 mt-0.5">{t("pos.f9ConfirmHint")}</span>
                        </Button>
                      </div>
                    </div>
                  );
                })()
              ) : null}

              {checkoutStep !== "qr" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (checkoutStep === "confirm") {
                        setIsCheckoutDialogOpen(false);
                      } else {
                        setCheckoutStep("confirm");
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    {checkoutStep === "confirm" ? t("common.cancel") : t("common.back")}
                  </Button>
                  <Button type="submit" size="lg" className="w-full text-base font-semibold" disabled={isSubmitting || (checkoutStep === "cash" && isCashPaymentInvalid)}>
                    {checkoutStep === "confirm"
                      ? paymentMethod === "CASH"
                        ? t("pos.continueToCash")
                        : t("pos.continueToQr")
                      : t("pos.confirmPayment")}
                  </Button>
                </div>
              ) : null}
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("customers.quickAdd")}</DialogTitle>
              <DialogDescription>{t("pos.quickCustomerDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createQuickCustomer} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("customers.fullName")}</Label>
                <Input placeholder={t("customers.fullNamePlaceholder")} value={quickCustomerName} onChange={(event) => setQuickCustomerName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t("common.phone")}</Label>
                <Input placeholder={t("customers.phonePlaceholder")} value={quickCustomerPhone} onChange={(event) => setQuickCustomerPhone(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t("common.email")}</Label>
                <Input placeholder={t("customers.emailPlaceholder")} value={quickCustomerEmail} onChange={(event) => setQuickCustomerEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("customers.address")}</Label>
                <Input placeholder={t("customers.addressPlaceholder")} value={quickCustomerAddress} onChange={(event) => setQuickCustomerAddress(event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("common.note")}</Label>
                <Textarea placeholder={t("customers.notePlaceholder")} />
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit">{t("customers.add")}</Button>
                <Button type="button" variant="outline" onClick={() => setIsCustomerDialogOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isCancelDraftDialogOpen} onOpenChange={setIsCancelDraftDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("pos.cancelDraftTitle")}</DialogTitle>
              <DialogDescription>{t("pos.cancelDraftDescription")}</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {t("pos.cancelDraftWarning")}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCancelDraftDialogOpen(false)} disabled={isSubmitting}>
                {t("pos.keepDraft")}
              </Button>
              <Button type="button" variant="destructive" onClick={cancelDraftOrder} disabled={isSubmitting}>
                {t("pos.confirmCancelDraft")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={remoteScanOpen} onOpenChange={setRemoteScanOpen}>
          <DialogContent className="max-w-xl bg-slate-900 border-slate-800 text-white rounded-3xl p-5 shadow-2xl">
            <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-500/10 p-2 text-blue-400 border border-blue-500/20 shrink-0">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-extrabold uppercase tracking-wide text-white">
                    {t("barcode.connectPhoneScanner")}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-400">
                    {t("barcode.remoteScannerDescription")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-5 items-center py-2">
              {/* Cột trái: Mã QR & Sao chép link */}
              <div className="flex flex-col items-center gap-2.5">
                <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-800/20 shrink-0">
                  <QRCodeSVG value={mobileScanUrl} size={145} level="M" />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCopyLink}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl h-8 px-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{t("common.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t("barcode.copyScanLink")}</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Cột phải: Mã ghép đôi & Hướng dẫn & Trạng thái */}
              <div className="flex flex-col justify-between gap-2.5">
                {/* Mã ghép đôi */}
                <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      {t("barcode.pairingCode")}
                    </span>
                    <span className="text-xl font-black text-blue-400 tracking-[0.2em] font-mono select-all">
                      {sessionId}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleResetRemoteScanSession}
                    className="h-7 px-2.5 rounded-lg border-slate-700 bg-slate-800 text-[11px] text-white hover:bg-slate-700 shrink-0"
                    title={t("pos.newPairingCode")}
                  >
                    {t("barcode.newPairingCode")}
                  </Button>
                </div>

                {/* Hướng dẫn ngắn gọn */}
                <div className="text-[11px] text-slate-400 leading-tight space-y-1 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                  <p className="flex items-start gap-1">
                    <span className="font-bold text-blue-400">1.</span>
                    <span>{t("barcode.remoteInstruction1")}</span>
                  </p>
                  <p className="flex items-start gap-1">
                    <span className="font-bold text-blue-400">2.</span>
                    <span>{t("barcode.remoteInstruction2")}</span>
                  </p>
                </div>

                {/* Trạng thái real-time */}
                {isPhoneConnected ? (
                  <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs font-bold text-emerald-400 animate-in fade-in duration-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span>{t("pos.phoneConnected")}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-semibold text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400/80 animate-pulse shrink-0" />
                    <span>{t("pos.phoneWaiting")}</span>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={salesAssistantOpen}
          onOpenChange={(open) => {
            setSalesAssistantOpen(open);
            if (!open) {
              resetSalesAssistantState();
            }
          }}
        >
          <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden p-0 border-slate-200">
            <DialogHeader className="px-6 py-4 border-b shrink-0 bg-emerald-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600 animate-pulse" />
                <DialogTitle className="text-emerald-900 font-extrabold">{t("salesAssistant.title")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 font-medium">
                {t("pos.salesAssistantDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1 overflow-hidden p-6 bg-slate-50/50">
              {/* Left Panel: Inputs & Filters (md:col-span-4) */}
              <div className="md:col-span-4 flex flex-col overflow-y-auto pl-3 pr-2 custom-scrollbar space-y-4">
                <div>
                  <Label className="text-xs font-bold text-slate-700">{t("salesAssistant.needLabel")}</Label>
                  <Textarea
                    className="mt-1 h-24 text-xs resize-none border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 rounded-lg"
                    placeholder={t("salesAssistant.needPlaceholder")}
                    value={salesNeed}
                    onChange={(e) => setSalesNeed(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        void handleRequestSalesSuggestion();
                      }
                    }}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">{t("pos.quickSuggestHint")}</p>
                </div>

                {/* Quick needs selection */}
                <div>
                  <Label className="text-xs font-bold text-slate-700">{t("salesAssistant.quickNeeds")}</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[
                      t("pos.quickNeedHousewarming"),
                      t("pos.quickNeedKitchen"),
                      t("pos.quickNeedCleaning"),
                      t("pos.quickNeedEnergy"),
                      t("pos.quickNeedBathroom"),
                      t("pos.quickNeedAir"),
                      t("pos.quickNeedPromotion")
                    ].map((need) => (
                      <button
                        key={need}
                        type="button"
                        onClick={() => setSelectedQuickNeed(selectedQuickNeed === need ? "" : need)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer",
                          selectedQuickNeed === need
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {need}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Budget Ranges */}
                <div>
                  <Label className="text-xs font-bold text-slate-700">{t("salesAssistant.budget")}</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {[
                      { label: t("salesAssistant.under10k"), min: 0, max: 3000 },
                      { label: t("salesAssistant.from10kTo30k"), min: 3000, max: 7000 },
                      { label: t("salesAssistant.from30kTo50k"), min: 7000, max: 15000 },
                      { label: t("salesAssistant.over50k"), min: 15000, max: 999999999 }
                    ].map((b) => {
                      const isSelected = budgetMin === b.min && budgetMax === b.max;
                      return (
                        <button
                          key={b.label}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setBudgetMin(undefined);
                              setBudgetMax(undefined);
                            } else {
                              setBudgetMin(b.min);
                              setBudgetMax(b.max);
                            }
                          }}
                          className={cn(
                            "px-2 py-1.5 text-[10px] font-bold rounded-lg border transition-all text-center cursor-pointer",
                            isSelected
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Budget Inputs */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      className="h-8 text-[11px] px-2 border-slate-200 focus:border-emerald-500 rounded-lg text-slate-700"
                      placeholder={t("pos.minPrice")}
                      value={budgetMin !== undefined ? budgetMin : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBudgetMin(val ? Number(val) : undefined);
                      }}
                    />
                  </div>
                  <span className="text-slate-400 text-xs font-semibold">→</span>
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      className="h-8 text-[11px] px-2 border-slate-200 focus:border-emerald-500 rounded-lg text-slate-700"
                      placeholder={t("pos.maxPrice")}
                      value={budgetMax !== undefined && budgetMax !== 999999999 ? budgetMax : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBudgetMax(val ? Number(val) : undefined);
                      }}
                    />
                  </div>
                </div>

                {/* Toggles Preferences - Formatted as 2-column Grid */}
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preferences.preferPromotion}
                      onChange={(e) => setPreferences({ ...preferences, preferPromotion: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                    />
                    <span className="truncate">{t("salesAssistant.preferPromotion")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preferences.preferWarranty}
                      onChange={(e) => setPreferences({ ...preferences, preferWarranty: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                    />
                    <span className="truncate">{t("salesAssistant.preferWarranty")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preferences.preferHighStock}
                      onChange={(e) => setPreferences({ ...preferences, preferHighStock: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                    />
                    <span className="truncate">{t("salesAssistant.preferHighStock")}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preferences.crossSellFromCart}
                      onChange={(e) => setPreferences({ ...preferences, crossSellFromCart: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                    />
                    <span className="truncate">{t("salesAssistant.crossSellFromCart")}</span>
                  </label>
                </div>

                <Button
                  type="button"
                  onClick={handleRequestSalesSuggestion}
                  disabled={salesAssistantLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs h-10 mt-2 cursor-pointer shadow-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <Sparkles className="h-4 w-4" />
                  {t("salesAssistant.suggest")}
                </Button>
              </div>

              {/* Right Panel: Results (md:col-span-8) */}
              <div className="md:col-span-8 flex flex-col overflow-y-auto pl-2 custom-scrollbar overflow-x-hidden bg-white border border-slate-100 rounded-2xl p-5 shadow-xs h-full min-h-[350px] justify-between">
                {salesAssistantLoading ? (
                  <div className="flex flex-col items-center justify-center flex-1 space-y-3 py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
                    <p className="text-xs font-bold text-slate-400 animate-pulse">{t("salesAssistant.loading")}</p>
                  </div>
                ) : salesAssistantError ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-center py-16">
                    <p className="text-sm font-extrabold text-rose-500">{t("message.errorTitle")}</p>
                    <p className="text-xs text-slate-400 mt-1 font-semibold">{salesAssistantError}</p>
                  </div>
                ) : salesAssistantResult ? (
                  <div className="space-y-5 flex-1">
                    {/* Summary text */}
                    <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed font-semibold">
                      {salesAssistantResult.summary}
                    </div>

                    {/* Suggestions list */}
                    <div className="space-y-3">
                      {salesAssistantResult.recommendations.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8 font-semibold">{t("salesAssistant.noResult")}</p>
                      ) : (
                        salesAssistantResult.recommendations.map((rec) => {
                          const badgeColors = {
                            NEED_MATCH: "bg-blue-50 text-blue-600 border-blue-100",
                            CROSS_SELL: "bg-indigo-50 text-indigo-600 border-indigo-100",
                            BUDGET_MATCH: "bg-slate-50 text-slate-600 border-slate-100",
                            PROMOTION: "bg-amber-50 text-amber-600 border-amber-100"
                          };

                          const badgeLabels = {
                            NEED_MATCH: t("salesAssistant.needMatch"),
                            CROSS_SELL: t("salesAssistant.crossSell"),
                            BUDGET_MATCH: t("salesAssistant.budgetMatch"),
                            PROMOTION: t("salesAssistant.promotion")
                          };

                          return (
                            <div key={rec.productId} className="flex items-center gap-4 p-4 border border-slate-100 rounded-xl w-full bg-white hover:border-slate-200 transition-all">
                              {/* Image resolve */}
                              <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                                {rec.imageUrl ? (
                                  <img
                                    src={resolveProductImage(rec)}
                                    alt={rec.name}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <Package className="h-6 w-6 text-slate-300" />
                                )}
                              </div>

                              {/* Info Column (flex-1 min-w-0 to prevent overflow) */}
                              <div className="flex-1 min-w-0 text-xs">
                                <h4 className="font-extrabold text-slate-800 truncate line-clamp-1" title={rec.name}>{rec.name}</h4>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] text-slate-400 font-bold">{t("pos.inventoryLabel", { count: rec.stockQuantity })}</span>
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0",
                                    badgeColors[rec.type] || badgeColors.NEED_MATCH
                                  )}>
                                    {badgeLabels[rec.type] || badgeLabels.NEED_MATCH}
                                  </span>
                                </div>
                                <p className="mt-2 text-[11px] text-slate-600 leading-relaxed bg-slate-50/80 rounded-lg p-2 border border-slate-200/60 font-medium whitespace-normal break-words">
                                  {rec.reason}
                                </p>
                              </div>

                              {/* Price & Add to Cart Column (shrink-0 flex flex-col items-end gap-2) */}
                              <div className="shrink-0 flex flex-col items-end gap-2">
                                <span className="font-extrabold text-slate-800 text-sm">
                                  {new Intl.NumberFormat(language === "en" ? "en-GB" : "vi-VN").format(rec.price)}đ
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleAddSuggestionToCart(rec.productId)}
                                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-xs cursor-pointer px-3 flex items-center gap-1 shrink-0"
                                >
                                  <span>+</span>
                                  <span>{t("salesAssistant.addToCart")}</span>
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Bundle suggestions */}
                    {salesAssistantResult.bundleSuggestion && (
                      <div className="border-t border-slate-100 pt-3">
                        <Label className="text-xs font-bold text-slate-700">{t("salesAssistant.bundleSuggestion")}</Label>
                        <p className="mt-1 text-xs text-slate-600 font-semibold leading-relaxed bg-amber-50/30 border border-amber-100/50 rounded-xl p-3">
                          {salesAssistantResult.bundleSuggestion}
                        </p>
                      </div>
                    )}

                    {/* Cashier Tips */}
                    {salesAssistantResult.cashierTips && salesAssistantResult.cashierTips.length > 0 && (
                      <div className="border-t border-slate-100 pt-3">
                        <Label className="text-xs font-bold text-slate-700">{t("salesAssistant.cashierTips")}</Label>
                        <ul className="mt-1.5 space-y-1 text-xs text-slate-500 list-disc list-inside leading-relaxed font-bold">
                          {salesAssistantResult.cashierTips.map((tip, idx) => (
                            <li key={idx}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-center py-16 space-y-2">
                    <Sparkles className="h-10 w-10 text-slate-200" />
                    <p className="text-xs font-bold text-slate-400">{t("salesAssistant.empty")}</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {lastCompletedOrder ? (
        <PrintableInvoice
          order={lastCompletedOrder}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setting={setting as any}
          publicUrl={lastInvoicePublicUrl}
          className="hidden print:block"
        />
      ) : null}

      <CreateVatModal
        isOpen={isCreateVatOpen}
        onClose={() => setIsCreateVatOpen(false)}
        onSuccess={() => {
          setIsCreateVatOpen(false);
          toast.success(t("pos.vatRequestSuccess"));
        }}
        initialOrderCode={createVatInitialCode}
      />
    </RoleGuard>
  );
}











