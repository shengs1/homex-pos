"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingCart, Trash2, UserPlus, XCircle } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { useLanguage } from "@/contexts/language-context";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import { REAL_PRODUCT_FALLBACK_IMAGE } from "@/lib/demo-products";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { categoryService, customerService, orderService, productService } from "@/services/homex.service";
import { promotionService } from "@/services/promotion.service";
import type { Category, Customer, Order, PaymentMethod, Product } from "@/types/domain";

type CartItem = {
  product: Product;
  quantity: number;
};

const POS_RESUME_DRAFT_ORDER_ID_KEY = "homex_pos_resume_draft_order_id";
const paymentMethods: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "WALLET"];

function sortByIdAsc<T extends { id: number }>(items: T[]) {
  return [...items].sort((a, b) => a.id - b.id);
}

function getProductImage(product: Product) {
  const extendedProduct = product as Product & { image?: string | null };
  return extendedProduct.image || product.imageUrl || REAL_PRODUCT_FALLBACK_IMAGE;
}

function getPaymentMethodLabel(method: PaymentMethod) {
  const labels: Record<PaymentMethod, string> = {
    CASH: "Tiền mặt",
    CARD: "Quẹt thẻ",
    TRANSFER: "Chuyển khoản ngân hàng",
    WALLET: "Ví điện tử",
  };

  return labels[method];
}

export default function PosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftOrder, setDraftOrder] = useState<Order | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discountInput, setDiscountInput] = useState("");
  const [discountMessage, setDiscountMessage] = useState("");
  const [appliedDiscountAmount, setAppliedDiscountAmount] = useState(0);
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [isCancelDraftDialogOpen, setIsCancelDraftDialogOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [quickCustomerEmail, setQuickCustomerEmail] = useState("");
  const [quickCustomerAddress, setQuickCustomerAddress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const { t } = useLanguage();
  const cartScrollRef = useRef<HTMLDivElement | null>(null);
  const previousCartLengthRef = useRef(0);

  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.product.salePrice * item.quantity, 0);
  }, [cart]);

  const discountAmount = Math.min(Math.max(appliedDiscountAmount, 0), subtotal);
  const totalPayable = Math.max(subtotal - discountAmount, 0);

  async function loadCategories() {
    try {
      const data = await categoryService.list({ page: 1, limit: 200, status: "ACTIVE" });
      setCategories(sortByIdAsc(data.items));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function loadProducts() {
    try {
      setIsLoadingProducts(true);
      setErrorMessage("");
      const data = await productService.list({
        page: 1,
        limit: 80,
        search: productSearch,
        status: "ACTIVE",
        categoryId: selectedCategoryId,
      });
      setProducts(sortByIdAsc(data.items));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoadingProducts(false);
    }
  }

  async function searchCustomers(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    try {
      setErrorMessage("");
      const data = await customerService.list({ page: 1, limit: 30, search: customerSearch, status: "ACTIVE" });
      setCustomers(sortByIdAsc(data.items));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function resetPosState() {
    window.localStorage.removeItem(POS_RESUME_DRAFT_ORDER_ID_KEY);
    setCart([]);
    setDraftOrder(null);
    setCustomerId("");
    setCustomerSearch("");
    setPaymentMethod("CASH");
    setDiscountInput("");
    setDiscountMessage("");
    setAppliedDiscountAmount(0);
    setAppliedPromotionCode("");
  }

  async function restoreDraftOrderFromStorage() {
    const storedOrderId = window.localStorage.getItem(POS_RESUME_DRAFT_ORDER_ID_KEY);

    if (!storedOrderId) return;

    window.localStorage.removeItem(POS_RESUME_DRAFT_ORDER_ID_KEY);

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const order = await orderService.detail(Number(storedOrderId));

      if (order.status !== "DRAFT") {
        setErrorMessage(t("toast.pos.resumeDraftInvalid"));
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
              name: detail.product?.name || `Sản phẩm #${detail.productId}`,
              description: null,
              categoryId: 0,
              supplierId: 0,
              costPrice: detail.unitPrice,
              salePrice: detail.unitPrice,
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
      setSuccessMessage(t("toast.pos.resumeDraftSuccess", { code: order.orderCode }));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    loadCategories();
    loadProducts();
    searchCustomers();
    restoreDraftOrderFromStorage();
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
    const scrollContainer = cartScrollRef.current;
    const previousLength = previousCartLengthRef.current;

    if (scrollContainer && cart.length > previousLength) {
      window.requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }

    previousCartLengthRef.current = cart.length;
  }, [cart.length]);

  function addToCart(product: Product) {
    if (product.stockQuantity <= 0) return;

    setCart((currentCart) => {
      const found = currentCart.find((item) => item.product.id === product.id);

      if (found) {
        return currentCart.map((item) => {
          if (item.product.id !== product.id) return item;
          return { ...item, quantity: Math.min(item.quantity + 1, product.stockQuantity) };
        });
      }

      return [...currentCart, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: number, delta: number) {
    setCart((currentCart) => {
      return currentCart
        .map((item) => {
          if (item.product.id !== productId) return item;
          return {
            ...item,
            quantity: Math.min(Math.max(item.quantity + delta, 1), item.product.stockQuantity),
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
      setErrorMessage(t("toast.pos.emptyCart"));
      return null;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      const data = await orderService.createDraft(buildOrderBody());
      setDraftOrder(data);
      setSuccessMessage(t("toast.pos.draftCreated"));
      return data;
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function checkout() {
    if (cart.length === 0) {
      setErrorMessage(t("toast.pos.emptyCart"));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const orderToCheckout = draftOrder
        ? await orderService.updateDraft(draftOrder.id, buildOrderBody())
        : await orderService.createDraft(buildOrderBody());

      await orderService.checkout(orderToCheckout.id, {
        paymentMethod,
        promotionCode: appliedPromotionCode || undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
      });
      resetPosState();
      setSuccessMessage(t("toast.pos.checkoutSuccess"));
      router.refresh();
      await loadProducts();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancelDraftOrder() {
    if (!draftOrder) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await orderService.cancel(draftOrder.id);
      resetPosState();
      setIsCancelDraftDialogOpen(false);
      setSuccessMessage(t("toast.pos.cancelDraftSuccess"));
      await loadProducts();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }


  async function applyDiscount() {
    const rawValue = discountInput.trim();

    if (cart.length === 0) {
      setDiscountMessage(t("pos.discountNeedCart"));
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
      return;
    }

    if (!rawValue) {
      setDiscountMessage(t("pos.discountEmpty"));
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
      return;
    }

    const normalizedValue = rawValue.replace(/\s+/g, "");
    const isPercent = /^\d+(\.\d+)?%$/.test(normalizedValue);
    const isAmount = /^\d+$/.test(normalizedValue);

    if (isPercent) {
      const percent = Number(normalizedValue.replace("%", ""));
      if (percent <= 0 || percent > 100) {
        setDiscountMessage(t("pos.discountPercentInvalid"));
        setAppliedDiscountAmount(0);
        setAppliedPromotionCode("");
        return;
      }

      const amount = Math.floor((subtotal * percent) / 100);
      setAppliedDiscountAmount(amount);
      setAppliedPromotionCode("");
      setDiscountMessage(t("pos.discountApplied", { amount: formatCurrency(amount) }));
      return;
    }

    if (isAmount) {
      const amount = Math.min(Number(normalizedValue), subtotal);
      if (amount <= 0) {
        setDiscountMessage(t("pos.discountAmountInvalid"));
        setAppliedDiscountAmount(0);
        setAppliedPromotionCode("");
        return;
      }

      setAppliedDiscountAmount(amount);
      setAppliedPromotionCode("");
      setDiscountMessage(t("pos.discountApplied", { amount: formatCurrency(amount) }));
      return;
    }

    try {
      setIsSubmitting(true);
      setDiscountMessage("");
      const result = await promotionService.validate({ code: rawValue.toUpperCase(), subtotal });
      const amount = Math.min(Number(result.discountAmount || 0), subtotal);

      if (amount <= 0) {
        setAppliedDiscountAmount(0);
        setAppliedPromotionCode("");
        setDiscountMessage(t("pos.voucherInvalid"));
        return;
      }

      setAppliedDiscountAmount(amount);
      setAppliedPromotionCode(rawValue.toUpperCase());
      setDiscountMessage(t("pos.discountApplied", { amount: formatCurrency(amount) }));
    } catch (error) {
      setAppliedDiscountAmount(0);
      setAppliedPromotionCode("");
      setDiscountMessage(getApiErrorMessage(error) || t("pos.voucherInvalid"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createQuickCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setErrorMessage("");
      setSuccessMessage("");
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
      setSuccessMessage(t("toast.pos.customerCreated"));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function handleProductSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadProducts();
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="flex h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] min-h-0 flex-col overflow-hidden">
        {/* Header cố định trong vùng POS */}
        <div className="shrink-0 space-y-2 pb-3">
          <PageHeader title={t("pos.title")} description={t("pos.description")} />
          <ErrorState message={errorMessage} />
          {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}
        </div>

        {/* Main POS workspace: chỉ phần này chiếm phần còn lại của màn hình */}
        <div className="grid min-h-0 flex-1 min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Cột trái: tìm kiếm và danh sách sản phẩm */}
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <Card className="shrink-0">
              <CardContent className="space-y-4 pt-6">
                <form onSubmit={handleProductSearch} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    placeholder={t("pos.searchProduct")}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                  <Button type="submit">
                    <Search className="h-4 w-4" />
                    {t("common.search")}
                  </Button>
                </form>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={selectedCategoryId === "" ? "default" : "outline"}
                    onClick={() => setSelectedCategoryId("")}
                  >
                    {t("common.all")}
                  </Button>
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      type="button"
                      variant={selectedCategoryId === String(category.id) ? "default" : "outline"}
                      onClick={() => setSelectedCategoryId(String(category.id))}
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:bg-transparent">
              {isLoadingProducts ? <LoadingState /> : null}
              {!isLoadingProducts && products.length === 0 ? <EmptyState message={t("message.noProducts")} /> : null}

              <div className="grid min-w-0 gap-4 pb-4 md:grid-cols-2 2xl:grid-cols-3">
                {products.map((product) => {
                  const isLowStock = product.stockQuantity <= product.minStock;

                  return (
                    <Card key={product.id} className="min-w-0 overflow-hidden">
                      <div className="h-36 bg-muted">
                        <img
                          src={getProductImage(product)}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = REAL_PRODUCT_FALLBACK_IMAGE;
                          }}
                        />
                      </div>
                      <CardHeader className="pb-2">
                        <CardTitle className="line-clamp-2 text-base">{product.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-primary">{formatCurrency(product.salePrice)}</span>
                          <span className={cn(isLowStock ? "font-bold text-destructive" : "text-muted-foreground")}>
                            {t("products.stock")}: {product.stockQuantity}
                          </span>
                        </div>
                        <Button className="w-full" disabled={product.stockQuantity <= 0} onClick={() => addToCart(product)}>
                          <ShoppingCart className="h-4 w-4" />
                          {product.stockQuantity <= 0 ? t("pos.outOfStock") : t("pos.addToCart")}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cột phải: giỏ hàng cố định đúng chiều cao màn hình */}
          <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b px-4 py-3">
              <CardTitle className="text-2xl font-bold">{t("pos.cart")}</CardTitle>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              {/* Vùng khách hàng */}
              <div className="shrink-0 space-y-2 border-b px-3 py-2.5">
                <form onSubmit={searchCustomers} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    placeholder={t("pos.customerPlaceholder")}
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    {t("common.search")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={t("customers.quickAdd")}
                    onClick={() => setIsCustomerDialogOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </form>

                <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">{t("customers.retail")}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.fullName} - {customer.phone}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Vùng danh sách sản phẩm trong giỏ: thiết kế dòng phẳng tối giản, cuộn nội bộ */}
              <div
                ref={cartScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-3 py-2 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:bg-transparent"
              >
                {cart.length === 0 ? (
                  <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 text-center">
                    <ShoppingCart className="mb-3 h-9 w-9 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">{t("message.emptyCart")}</p>
                    <p className="mt-1 text-xs text-gray-400">{t("pos.emptyCartHint")}</p>
                  </div>
                ) : (
                  <div>
                    {cart.map((item) => {
                      const lineTotal = item.product.salePrice * item.quantity;

                      return (
                        <div
                          key={item.product.id}
                          className="mb-2 border-b border-gray-100 pb-2 last:mb-0 last:border-0 last:pb-0"
                        >
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium leading-6 text-gray-800" title={item.product.name}>
                              {item.product.name}
                            </p>

                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                              title={t("common.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div className="flex h-8 items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <button
                                type="button"
                                onClick={() => changeQuantity(item.product.id, -1)}
                                className="flex h-8 w-8 items-center justify-center text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={item.quantity <= 1}
                                title={t("pos.decreaseQuantity")}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>

                              <span className="flex h-8 min-w-9 items-center justify-center border-x border-gray-100 px-2 text-sm font-semibold text-gray-900">
                                {item.quantity}
                              </span>

                              <button
                                type="button"
                                onClick={() => changeQuantity(item.product.id, 1)}
                                className="flex h-8 w-8 items-center justify-center text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={item.quantity >= item.product.stockQuantity}
                                title={t("pos.increaseQuantity")}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="min-w-0 flex-1 text-right">
                              <p className="truncate text-xs text-gray-500">
                                {item.quantity} x {formatCurrency(item.product.salePrice)}
                              </p>
                              <p className="text-sm font-semibold text-gray-900">{formatCurrency(lineTotal)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Vùng đáy cố định: mã giảm giá + tiền + phương thức + nút hành động */}
              <div className="shrink-0 border-t border-gray-100 bg-card px-3 py-2.5 shadow-[0_-8px_20px_rgba(15,23,42,0.05)]">
                <div className="mb-1.5 space-y-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Input
                      value={discountInput}
                      onChange={(event) => setDiscountInput(event.target.value)}
                      placeholder={t("pos.discountInputPlaceholder")}
                      className="h-9 text-sm"
                      disabled={cart.length === 0 || isSubmitting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 px-3"
                      disabled={cart.length === 0 || isSubmitting}
                      onClick={applyDiscount}
                    >
                      {t("pos.applyDiscount")}
                    </Button>
                  </div>
                  {discountMessage ? (
                    <p className={cn("text-xs", discountAmount > 0 ? "text-green-600" : "text-destructive")}>
                      {discountMessage}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("pos.subtotal")}</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t("pos.discount")}</span>
                    <span className="font-medium">-{formatCurrency(discountAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t pt-2 text-base font-bold">
                    <span>{t("pos.totalPayable")}</span>
                    <span className="text-primary">{formatCurrency(totalPayable)}</span>
                  </div>
                </div>

                <div className="mt-1.5 space-y-1">
                  <Label>{t("pos.paymentMethod")}</Label>
                  <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {t(`paymentMethod.${method}`)}
                      </option>
                    ))}
                  </Select>
                </div>

                {draftOrder ? (
                  <div className="mt-1.5 truncate rounded-lg bg-muted px-2.5 py-1.5 text-xs sm:text-sm">
                    {t("pos.processingDraft")}: <span className="font-semibold">{draftOrder.orderCode}</span>
                  </div>
                ) : null}

                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {draftOrder ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      disabled={isSubmitting}
                      onClick={() => setIsCancelDraftDialogOpen(true)}
                    >
                      <XCircle className="h-4 w-4" />
                      {t("pos.cancelOrder")}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" disabled={isSubmitting || cart.length === 0} onClick={createDraft}>
                      {t("pos.createDraft")}
                    </Button>
                  )}

                  <Button type="button" disabled={isSubmitting || cart.length === 0} onClick={checkout}>
                    {t("pos.checkout")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
    </RoleGuard>
  );
}
