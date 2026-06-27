"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Download, Minus, Plus, Printer, QrCode, ReceiptText, Search, ShoppingCart, Trash2, UserPlus, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import { categoryService, customerService, orderService, productService, settingService, shiftService } from "@/services/homex.service";
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

export default function PosPage() {
  const router = useRouter();
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
  const [isOnline, setIsOnline] = useState(true);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
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
    loadCategories();
    loadProducts();
    searchCustomers();
    loadPromotions();
    loadCurrentShift();
    restoreDraftOrderFromStorage();
    focusBarcodeInput();
  }, []);

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
      toast.error("Voucher đã bị gỡ do thay đổi khách hàng");
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
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) {
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
  }, []);

  useEffect(() => {
    if (paymentMethod !== "CASH") {
      setCashReceivedInput("");
    }
  }, [paymentMethod]);

  function addToCart(product: Product) {
    if (!setting?.allowOversell && product.stockQuantity <= 0) {
      toast.error(t("settings.stockNotEnough") || "Không đủ tồn kho");
      return;
    }

    setCart((currentCart) => {
      const found = currentCart.find((item) => item.product.id === product.id);

      if (found) {
        return currentCart.map((item) => {
          if (item.product.id !== product.id) return item;
          const newQty = item.quantity + 1;
          if (!setting?.allowOversell && newQty > product.stockQuantity) {
            toast.warning(t("settings.stockNotEnough") || "Không đủ tồn kho");
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

    try {
            const product = await productService.findByBarcode(barcode);
      if (!setting?.allowOversell && product.stockQuantity <= 0) {
        toast.error(t("settings.stockNotEnough") || "Không đủ tồn kho");
        return;
      }
      addToCart(product);
      toast.success(t("pos.barcodeAdded", { sku: product.sku }));
    } catch (error) {
      toast.error(getApiErrorMessage(error) || t("pos.barcodeNotFound"));
    } finally {
      focusBarcodeInput();
    }
  }

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
        toast.error(t("settings.customerPhoneRequired") || "Vui lòng nhập SĐT khách hàng");
        return;
      }
      const c = customers.find(x => String(x.id) === customerId);
      if (!c?.phone) {
        toast.error(t("settings.customerPhoneRequired") || "Khách hàng phải có SĐT");
        return;
      }
    }

    if (Number(setting?.maxDiscount) > 0 && discountAmount > Number(setting?.maxDiscount)) {
      toast.error(t("settings.discountLimitExceeded") || "Giảm giá vượt giới hạn");
      return;
    }

    if (setting?.confirmBeforeCheckout === false) {
      if (paymentMethod === "CASH") {
        setCheckoutStep("cash");
      } else {
        void prepareTransferCheckout();
        return; // Don't open dialog yet, wait for prepareTransferCheckout to open it? No, prepareTransferCheckout expects it to be open.
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
        }, 500);
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
        {/* Header cố định trong vùng POS */}
        <div className="shrink-0 flex items-center justify-between">
          <PageHeader title={t("pos.title")} description={t("pos.description")} />
          {user?.role === "CASHIER" && !currentShift ? (
            <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 shadow-sm animate-in fade-in">
              <span className="font-semibold">{t("pos.shiftRequired")}</span>
            </div>
          ) : null}
        </div>

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
            <div className="shrink-0 p-4 space-y-3 border-b border-border/40">
              <form onSubmit={handleProductSearch} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="h-12 bg-slate-50 pl-12 text-base border-border/60"
                    placeholder={t("pos.searchProduct")}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </div>
                <Button type="submit" className="h-12 px-6">
                  {t("common.search")}
                </Button>
              </form>

              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 rounded-full px-5 py-2 text-xs font-bold uppercase"
                  variant={selectedCategoryId === "" ? "default" : "outline"}
                  onClick={() => setSelectedCategoryId("")}
                >
                  {t("common.all")}
                </Button>
                {categories.map((category) => (
                  <Button
                    key={category.id}
                    type="button"
                    size="sm"
                    className="shrink-0 rounded-full px-5 py-2 text-xs font-bold uppercase"
                    variant={selectedCategoryId === String(category.id) ? "default" : "outline"}
                    onClick={() => setSelectedCategoryId(String(category.id))}
                  >
                    {category.name}
                  </Button>
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
                    <Card key={product.id} className="group flex min-w-0 cursor-pointer flex-col overflow-hidden border-border/40 transition-all duration-300 hover:scale-[1.02] hover:border-primary/30 hover:shadow-md" onClick={() => product.stockQuantity > 0 && addToCart(product)}>
                      <div className="relative h-28 overflow-hidden bg-slate-100">
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
                            "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black shadow-sm backdrop-blur-md",
                            isLowStock ? "bg-destructive/90 text-white" : "bg-white/90 text-slate-700"
                          )}
                        >
                          {product.stockQuantity <= 0 ? t("pos.outOfStock") : formatNumber(product.stockQuantity)}
                        </div>
                        {product.stockQuantity <= 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                            <span className="rounded-full bg-destructive px-3 py-1 text-[10px] font-black uppercase text-white shadow-sm">
                              {t("pos.outOfStock")}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col flex-1 p-3">
                        <h3 className="line-clamp-2 text-xs font-bold text-slate-800 leading-tight mb-2 flex-1">{product.name}</h3>
                        <div className="flex items-end justify-between mt-auto">
                          <div>
                            {product.originalPrice && product.originalPrice > product.salePrice ? (
                              <div className="text-[10px] font-semibold text-muted-foreground line-through mb-0.5">{formatCurrency(product.originalPrice)}</div>
                            ) : <div className="h-4"></div>}
                            <div className="font-black text-primary text-sm leading-none">{formatCurrency(product.salePrice)}</div>
                          </div>
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
                          {p.code} - {p.discountType === "PERCENT" ? `${p.discountValue}%` : formatCurrency(p.discountValue)} (Tối thiểu: {formatCurrency(p.minOrderAmount)} | Hạng: {tiersText})
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
                    const PaymentIcon = method === "CASH" ? Banknote : QrCode;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-bold transition",
                          paymentMethod === method
                            ? "border-primary bg-primary text-white shadow-sm"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <PaymentIcon className="h-3.5 w-3.5" />
                        <span>{t(`paymentMethod.${method}`)}</span>
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
                      className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-lg h-10 px-3 text-xs"
                      disabled={isSubmitting}
                      onClick={() => setIsCancelDraftDialogOpen(true)}
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      {t("pos.cancelOrder")}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="rounded-lg h-10 px-3 text-xs shrink-0" disabled={isSubmitting || cart.length === 0} onClick={createDraft}>
                      {t("pos.createDraft")}
                    </Button>
                  )}
                  <Button type="button" className="flex-1 rounded-lg bg-accent text-sm font-black uppercase tracking-wider text-white shadow-md hover:bg-accent/90 h-10" disabled={isCheckoutDisabled} onClick={startCheckout}>
                    {t("pos.checkout")}
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
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {checkoutStep === "confirm" ? t("pos.confirmOrderTitle") : checkoutStep === "qr" ? t("pos.qrPaymentTitle") : t("pos.cashCheckoutTitle")}
              </DialogTitle>
              <DialogDescription>
                {checkoutStep === "confirm" ? t("pos.confirmOrderDescription") : checkoutStep === "qr" ? t("pos.qrPaymentDescription") : t("pos.cashCheckoutDescription")}
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
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
                <div className="grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="mx-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <QRCodeSVG value={transferQrValue} size={150} />
                  </div>
                  <div className="min-w-0 space-y-3 text-sm">
                    {!isBankConfigured ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                        {t("pos.bankNotConfigured")}
                        {user?.role === "ADMIN" ? (
                          <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={() => router.push("/settings")}>
                            {t("settings.title")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("pos.beneficiary")}</p>
                      <p className="truncate font-black text-slate-800">{setting?.bankAccountName || "-"}</p>
                      <p className="truncate font-semibold text-slate-600">{setting?.bankName || "-"} - {setting?.bankAccountNumber || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("pos.transferContent")}</p>
                      <p className="truncate font-black text-primary">{transferContent}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("orders.total")}</p>
                      <p className="text-xl font-black text-slate-900">{formatCurrency(totalPayable)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

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
                    : checkoutStep === "qr"
                      ? t("pos.confirmReceivedTransfer")
                      : t("pos.confirmPayment")}
                </Button>
              </div>
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

