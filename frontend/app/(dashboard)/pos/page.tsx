"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Download, Minus, Plus, Printer, QrCode, ReceiptText, Search, ShoppingCart, Trash2, UserPlus, XCircle, Smartphone, Link, Copy, Check, ArrowLeft, Info, User, CreditCard, FileText, Coins } from "lucide-react";
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
import { categoryService, customerService, orderService, posService, productService, settingService, shiftService } from "@/services/homex.service";
import { promotionService } from "@/services/promotion.service";
import type { Category, Customer, Order, PaymentMethod, Product, Setting, Shift } from "@/types/domain";
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
  const { settings: setting } = useSettings();
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH");
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [discountInput, setDiscountInput] = useState("");
  const [discountMessage, setDiscountMessage] = useState("");
  const [appliedDiscountAmount, setAppliedDiscountAmount] = useState(0);
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
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
  const [remoteScanOpen, setRemoteScanOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [isQrLoading, setIsQrLoading] = useState(true);
  const { t } = useLanguage();
  const cartScrollRef = useRef<HTMLDivElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const cashReceivedInputRef = useRef<HTMLInputElement | null>(null);
  const previousCartLengthRef = useRef(0);
  const barcodeBufferRef = useRef("");
  const barcodeTimerRef = useRef<number | null>(null);

  
  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.product.salePrice * item.quantity, 0);
  }, [cart]);

  const discountAmount = Math.min(Math.max(appliedDiscountAmount, 0), subtotal);
  const totalPayable = Math.max(subtotal - discountAmount, 0);
  const cashReceivedAmount = getMoneyInputAmount(cashReceivedInput);
  const changeAmount = paymentMethod === "CASH" ? Math.max(cashReceivedAmount - totalPayable, 0) : 0;
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
  const isBankConfigured = Boolean(setting?.bankName && setting?.bankAccountNumber && setting?.bankAccountName);
  const generateVietQRUrl = useCallback(() => {
    const bankId = "MB";
    const accountNo = setting?.bankAccountNumber || "";
    const amount = totalPayable;
    const memo = encodeURIComponent(transferContent);
    const rawAccountName = setting?.bankAccountName || "";
    const cleanAccountName = encodeURIComponent(
      rawAccountName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toUpperCase()
    );

    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${amount}&addInfo=${memo}&accountName=${cleanAccountName}`;
  }, [setting, totalPayable, transferContent]);

  const transferQrValue = buildVietQrDemoValue(setting, totalPayable, transferContent);
  const lastInvoicePublicUrl =
    lastCompletedOrder && typeof window !== "undefined"
      ? `${window.location.origin}/invoice/${lastCompletedOrder.orderCode}`
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
            const orderToPay = draftOrder
        ? await orderService.updateDraft(draftOrder.id, buildOrderBody())
        : await orderService.createDraft(buildOrderBody());
      setDraftOrder(orderToPay);
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
        setDiscountMessage(t("pos.voucherInvalid"));
        return;
      }

      setAppliedDiscountAmount(amount);
      setAppliedPromotionCode(code.toUpperCase());
      setDiscountMessage(t("toast.pos.voucherAppliedWithAmount", { code: code.toUpperCase(), amount: formatCurrency(amount) }));
    } catch (error) {
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
      setDiscountMessage(getApiErrorMessage(error) || t("pos.voucherInvalid"));
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
            <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-3 bg-white">
              <Button type="button" variant="outline" onClick={() => downloadReceipt(order)}>
                <Download className="h-4 w-4 mr-2" />
                {t("pos.downloadInvoice")}
              </Button>
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                {t("orders.printInvoice")}
              </Button>
              <Button type="button" onClick={startNewOrder}>{t("pos.newOrder")}</Button>
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
            
            <div className="flex items-center gap-2 flex-1 max-w-lg justify-end md:justify-start">
              <form onSubmit={handleProductSearch} className="flex-1 min-w-0">
                <div className="relative w-full">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="h-9 bg-slate-50 pl-8 pr-2.5 text-xs border-slate-200 focus:border-primary focus:bg-white transition-all rounded-lg w-full"
                    placeholder={t("pos.searchProduct")}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </div>
              </form>
              
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {setting?.enableBarcodeScanner !== false ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenRemoteScan}
                    className="h-9 px-2.5 border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-100/70 flex items-center gap-1 text-[11px] rounded-lg font-bold shadow-xs cursor-pointer shrink-0 animate-in fade-in duration-200"
                    title={t("barcode.remoteScanner")}
                  >
                    <span>{t("barcode.remoteScannerShort")}</span>
                  </Button>
                ) : null}

                <div className={cn(
                  "hidden md:flex rounded-lg px-2.5 py-1 text-[10px] font-bold shrink-0 border h-9 items-center justify-center transition-colors shadow-xs",
                  setting?.enableBarcodeScanner 
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                    : "bg-slate-50 text-slate-500 border-slate-200"
                )}>
                  {setting?.enableBarcodeScanner ? t("barcode.scannerEnabled") : t("barcode.scannerDisabled")}
                </div>
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
          <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border/50 bg-white shadow-sm overflow-hidden">
            <div className="shrink-0 px-4 py-2 border-b border-border/40 bg-slate-50/30">
              <style>{`
                .no-scrollbar::-webkit-scrollbar {
                  display: none;
                }
                .no-scrollbar {
                  -ms-overflow-style: none;
                  scrollbar-width: none;
                }
              `}</style>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                <button
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 border cursor-pointer",
                    selectedCategoryId === ""
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                  onClick={() => setSelectedCategoryId("")}
                >
                  {t("common.all")}
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={cn(
                      "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 border cursor-pointer",
                      selectedCategoryId === String(category.id)
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => setSelectedCategoryId(String(category.id))}
                  >
                    {formatCategoryName(category.name)}
                  </button>
                ))}
              </div>
            </div>

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
                    className="shrink-0 h-8 w-8 p-0"
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
                      {customer.fullName} - {customer.phone} - {t(`customerTier.${customer.tier || "NONE"}`)} ({formatNumber(customer.points)} pts)
                    </option>
                  ))}
                </Select>
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
                  <Select
                    value={appliedPromotionCode}
                    onChange={(event) => applyVoucher(event.target.value)}
                    disabled={cart.length === 0 || isSubmitting}
                    className="h-10 text-[11px] flex-[1.4] min-w-0"
                  >
                    <option value="">{t("pos.noVoucher")}</option>
                    {eligiblePromotions.map((p) => {
                      const tiersText = p.eligibleTiers === "ALL" || !p.eligibleTiers ? t("promotions.tierAll") : p.eligibleTiers.split(",").map(tier => getTierLabel(tier.trim(), t)).join(", ");
                      return (
                        <option key={p.id} value={p.code}>
                          {p.code} - {p.discountType === "PERCENT" ? `${p.discountValue}%` : formatCurrency(p.discountValue)} ({t("pos.minimumOrderLabel", { amount: formatCurrency(p.minOrderAmount) })} | {t("pos.tierLabel", { tiers: tiersText })})
                        </option>
                      );
                    })}
                  </Select>

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
          <DialogContent className={cn("max-h-[90vh] overflow-y-auto transition-all duration-300", checkoutStep === "qr" ? "max-w-4xl p-0" : "max-w-2xl")}>
            {checkoutStep !== "qr" ? (
              <DialogHeader>
                <DialogTitle>
                  {checkoutStep === "confirm" ? t("pos.confirmOrderTitle") : t("pos.cashCheckoutTitle")}
                </DialogTitle>
                <DialogDescription>
                  {checkoutStep === "confirm" ? t("pos.confirmOrderDescription") : t("pos.cashCheckoutDescription")}
                </DialogDescription>
              </DialogHeader>
            ) : null}

            <form
              className={cn(checkoutStep !== "qr" && "space-y-4")}
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
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="min-w-0 rounded-xl border border-slate-100">
                    <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {t("pos.orderItems")}
                    </div>
                    <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
                      {cart.map((item) => (
                        <div key={item.product.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-800">{item.product.name}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {item.product.sku} x {item.quantity}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-black text-slate-800">{formatCurrency(item.product.salePrice * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border bg-slate-50 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("customers.title")}</p>
                      <p className="truncate font-bold text-slate-800">{selectedCustomer?.fullName || t("customers.retail")}</p>
                      {selectedCustomer ? (
                        <p className="mt-1 text-[11px] font-bold text-amber-700">
                          {t(`customerTier.${selectedCustomer.tier || "SILVER"}`)} - {formatNumber(selectedCustomer.points)} {t("customers.points")}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("pos.paymentMethod")}</p>
                      <p className="truncate font-bold text-slate-800">{t(`paymentMethod.${paymentMethod}`)}</p>
                    </div>
                    <div className="space-y-2 border-t border-slate-200 pt-3">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">{t("pos.subtotal")}</span>
                        <span className="font-bold text-slate-800">{formatCurrency(subtotal)}</span>
                      </div>
                      {appliedPromotionCode ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-emerald-600 font-medium">Voucher ({appliedPromotionCode})</span>
                          <span className="font-bold text-emerald-700">-{formatCurrency(discountAmount)}</span>
                        </div>
                      ) : null}
                      {!appliedPromotionCode && discountAmount > 0 ? (
                        <div className="flex justify-between gap-4">
                          <span className="text-amber-600 font-medium">{t("pos.manualDiscount")}</span>
                          <span className="font-bold text-amber-700">-{formatCurrency(discountAmount)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base">
                        <span className="font-black text-slate-900">{t("pos.totalPayable")}</span>
                        <span className="font-black text-primary">{formatCurrency(totalPayable)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {checkoutStep === "cash" ? (
                <div className="grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pos-cash-received">{t("pos.cashReceived")}</Label>
                    <Input
                      id="pos-cash-received"
                      ref={cashReceivedInputRef}
                      inputMode="numeric"
                      value={cashReceivedInput}
                      onChange={(event) => setCashReceivedInput(formatMoneyInput(event.target.value))}
                      placeholder={t("pos.cashReceivedPlaceholder")}
                      className="h-12 text-lg font-semibold"
                      disabled={cart.length === 0 || isSubmitting}
                    />
                  </div>
                  <div className="flex flex-col justify-center rounded-xl bg-slate-50 p-3">
                    <span className="text-sm font-semibold text-muted-foreground">{t("pos.changeAmount")}</span>
                    <span className={cn("text-2xl font-black", isCashPaymentInvalid ? "text-destructive" : "text-green-700")}>{formatCurrency(changeAmount)}</span>
                    {isCashPaymentInvalid ? <p className="mt-2 text-sm text-destructive">{t("pos.cashNotEnough")}</p> : null}
                  </div>
                </div>
              ) : null}

              {checkoutStep === "qr" ? (
                <div className="flex flex-col min-h-0">
                  {/* Body with 2 columns */}
                  <div className="grid grid-cols-1 md:grid-cols-[40%_60%] lg:grid-cols-[45%_55%] min-h-[480px]">
                    
                    {/* Left Column: QR Area */}
                    <div className="bg-slate-50/80 p-8 flex flex-col items-center justify-between border-r border-slate-100 min-h-[450px]">
                      <div className="w-full text-center md:text-left space-y-2">
                        {/* Title & Subtitle */}
                        <div className="flex items-center gap-2 justify-center md:justify-start">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                            <QrCode className="h-4 w-4" />
                          </div>
                          <h3 className="text-base font-black tracking-tight text-slate-800 uppercase">
                            {t("pos.qrPaymentTitle")}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 font-medium pl-0 md:pl-9">
                          {t("pos.qrPaymentDescriptionShort")}
                        </p>
                      </div>

                      {/* QR Frame Container */}
                      <div className="relative my-3 flex items-center justify-center bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-[280px] h-[280px]">
                        {/* Scanner Corners [ ] */}
                        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-blue-600 rounded-tl z-10"></div>
                        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-blue-600 rounded-tr z-10"></div>
                        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-blue-600 rounded-bl z-10"></div>
                        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-blue-600 rounded-br z-10"></div>

                        {/* Loading Skeleton / Spinner */}
                        {isQrLoading ? (
                          <div className="absolute inset-2 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl animate-pulse space-y-2 z-0">
                            <div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                            <span className="text-[10px] font-bold text-slate-400">{t("pos.qrLoading")}</span>
                          </div>
                        ) : null}

                        {/* QR Code IMG */}
                        <img
                          src={generateVietQRUrl()}
                          alt="VietQR Payment Code"
                          className={cn("w-[264px] h-[264px] object-contain transition-opacity duration-300 z-0", isQrLoading ? "opacity-0" : "opacity-100")}
                          onLoad={() => setIsQrLoading(false)}
                        />
                      </div>

                      {/* Bottom scan label */}
                      <div className="text-center space-y-3">
                        <p className="text-[11px] text-slate-400 font-bold tracking-wide flex items-center justify-center gap-1">
                          <span className="inline-block animate-pulse w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                          {t("pos.scanToPay")}
                        </p>
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50/50 px-3 py-1 text-[10px] font-black uppercase text-blue-600 tracking-wider">
                          <Check className="h-3 w-3" /> NAPAS 247
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Info Area */}
                    <div className="p-8 flex flex-col justify-between space-y-6 bg-white min-h-[450px]">
                      {/* Close button space placeholder */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 font-black text-xs shrink-0">
                            {setting?.bankName?.substring(0, 2).toUpperCase() || "NH"}
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("pos.beneficiaryBank")}</p>
                            <p className="text-xs font-black text-slate-700">
                              {setting?.bankName || t("pos.bankNotConfiguredShort")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Transfer info boxes */}
                      <div className="space-y-3 flex-1 justify-center flex flex-col">
                        {[
                          {
                            id: "bankAccountNumber",
                            icon: CreditCard,
                            title: t("pos.bankAccountNumber"),
                            value: setting?.bankAccountNumber || "-",
                            copyValue: setting?.bankAccountNumber || "",
                          },
                          {
                            id: "bankAccountName",
                            icon: User,
                            title: t("pos.bankAccountName"),
                            value: setting?.bankAccountName || "-",
                            copyValue: setting?.bankAccountName || "",
                          },
                          {
                            id: "amount",
                            icon: Coins,
                            title: t("pos.paymentAmount"),
                            value: formatCurrency(totalPayable),
                            copyValue: String(totalPayable),
                          },
                          {
                            id: "content",
                            icon: FileText,
                            title: t("pos.transferMemo"),
                            value: transferContent,
                            copyValue: transferContent,
                            highlight: true,
                          },
                        ].map((box) => {
                          const BoxIcon = box.icon;
                          return (
                            <div
                              key={box.id}
                              className={cn(
                                "flex items-center justify-between rounded-xl border p-3.5 transition-all",
                                box.highlight
                                  ? "bg-orange-50/80 border-orange-200 shadow-sm"
                                  : "bg-slate-50/50 border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                                  box.highlight ? "bg-orange-100 text-orange-600" : "bg-blue-50 text-blue-600"
                                )}>
                                  <BoxIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{box.title}</p>
                                  <p className={cn(
                                    "font-black tracking-tight truncate",
                                    box.highlight ? "text-orange-700 text-sm" : "text-slate-800 text-xs"
                                  )}>
                                    {box.value}
                                  </p>
                                </div>
                              </div>
                              
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  void navigator.clipboard.writeText(box.copyValue);
                                  toast.success(t("pos.copiedField", { field: box.title.toLowerCase() }));
                                }}
                                className={cn(
                                  "h-8 w-8 hover:bg-slate-100 rounded-lg cursor-pointer",
                                  box.highlight ? "hover:bg-orange-100 text-orange-600" : "text-slate-400 hover:text-slate-600"
                                )}
                                title={t("common.copyField", { field: box.title })}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Warning/Alert */}
                      <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-3 flex items-start gap-2.5">
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-semibold text-blue-700 leading-normal">
                          {t("pos.transferMemoWarning")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer (Action buttons) */}
                  <div className="border-t border-slate-100 p-4 bg-white flex flex-col sm:flex-row gap-3 rounded-b-2xl">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 px-6 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 rounded-xl"
                      onClick={() => setCheckoutStep("confirm")}
                      disabled={isSubmitting}
                    >
                      <ArrowLeft className="h-4 w-4" /> {t("common.back")}
                    </Button>
                    <Button
                      type="submit"
                      className="h-12 flex-1 bg-teal-700 hover:bg-teal-800 text-white rounded-xl shadow-md transition duration-200 cursor-pointer flex flex-col items-center justify-center relative py-1"
                      disabled={isSubmitting}
                    >
                      <span className="font-bold text-sm">{t("pos.confirmReceivedTransfer")}</span>
                      <span className="text-[9px] font-medium opacity-80 mt-0.5">{t("pos.f9ConfirmHint")}</span>
                    </Button>
                  </div>
                </div>
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
          <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-white rounded-3xl p-6">
            <DialogHeader className="text-center flex flex-col items-center">
              <div className="mx-auto rounded-full bg-blue-500/10 p-3 text-blue-400 mb-2 border border-blue-500/20">
                <Smartphone className="h-6 w-6" />
              </div>
              <DialogTitle className="text-lg font-extrabold uppercase tracking-wide text-white">
                {t("barcode.connectPhoneScanner")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 max-w-xs text-center leading-relaxed">
                {t("barcode.remoteScannerDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="my-6 flex flex-col items-center justify-center gap-4">
              {/* Pairing Code */}
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                  {t("barcode.pairingCode")}
                </span>
                <span className="text-3xl font-black text-blue-400 tracking-[0.2em] font-mono select-all">
                  {sessionId}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={handleResetRemoteScanSession} className="mt-3 h-8 rounded-xl border-slate-700 bg-slate-800 text-xs text-white hover:bg-slate-700">
                  {t("barcode.newPairingCode")}
                </Button>
              </div>

              {/* QR Code Container */}
              <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-800/20">
                <QRCodeSVG value={mobileScanUrl} size={180} level="M" />
              </div>

              {/* Link copy container */}
              <div className="w-full flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl p-2 pl-3 mt-2">
                <Link className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="text-xs font-mono text-slate-400 truncate flex-1 select-all">
                  {mobileScanUrl}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCopyLink}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl h-8 px-3 shrink-0 flex items-center gap-1.5 transition-all cursor-pointer"
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
            </div>

            {/* Instruction Help & Polling Status */}
            <div className="space-y-4 pt-4 border-t border-slate-800/80">
              <div className="text-[11px] text-slate-400 leading-relaxed space-y-1">
                <p>{t("barcode.remoteInstruction1")}</p>
                <p>{t("barcode.remoteInstruction2")}</p>
                <p>{t("barcode.remoteInstruction3")}</p>
                <p>{t("barcode.remoteInstruction4")}</p>
              </div>

              <div className="flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></span>
                <span>{t("barcode.waitingForScan")}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {lastCompletedOrder ? (
        <PrintableInvoice
          order={lastCompletedOrder}
          setting={setting as any}
          publicUrl={lastInvoicePublicUrl}
          className="hidden print:block"
        />
      ) : null}
    </RoleGuard>
  );
}











