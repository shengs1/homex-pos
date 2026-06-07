"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2, UserPlus } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { categoryService, customerService, orderService, productService } from "@/services/homex.service";
import type { Category, Customer, Order, PaymentMethod, Product } from "@/types/domain";

type CartItem = {
  product: Product;
  quantity: number;
};

const POS_RESUME_DRAFT_ORDER_ID_KEY = "homex_pos_resume_draft_order_id";

const paymentMethods: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "WALLET"];

function translateServerMessageToVietnamese(message: string) {
  const normalized = message.trim().toLowerCase();

  const rules: Array<{ keywords: string[]; message: string }> = [
    { keywords: ["draft", "created", "success"], message: "Tạo đơn hàng nháp thành công" },
    { keywords: ["draft", "updated", "success"], message: "Cập nhật đơn hàng nháp thành công" },
    { keywords: ["order", "completed"], message: "Thanh toán hóa đơn thành công" },
    { keywords: ["checkout", "success"], message: "Thanh toán hóa đơn thành công" },
    { keywords: ["cart", "empty"], message: "Vui lòng chọn sản phẩm trước khi thanh toán" },
    { keywords: ["product", "out of stock"], message: "Sản phẩm không đủ tồn kho" },
    { keywords: ["stock", "not enough"], message: "Số lượng tồn kho không đủ" },
    { keywords: ["unauthorized"], message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
    { keywords: ["forbidden"], message: "Bạn không có quyền thực hiện thao tác này" },
    { keywords: ["network"], message: "Không thể kết nối máy chủ. Vui lòng kiểm tra backend." },
    { keywords: ["server"], message: "Lỗi máy chủ. Vui lòng thử lại sau." },
  ];

  const matchedRule = rules.find((rule) => rule.keywords.every((keyword) => normalized.includes(keyword)));

  return matchedRule ? matchedRule.message : message;
}

function sortByIdAsc<T extends { id: number }>(items: T[]) {
  return [...items].sort((a, b) => a.id - b.id);
}

export default function PosPage() {
  const { language, t } = useLanguage();
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
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [quickCustomerEmail, setQuickCustomerEmail] = useState("");
  const [quickCustomerAddress, setQuickCustomerAddress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function showSuccess(message: string) {
    setErrorMessage("");
    setSuccessMessage(message);
  }

  function showError(message: string) {
    setSuccessMessage("");
    setErrorMessage(language === "vi" ? translateServerMessageToVietnamese(message) : message);
  }

  function showApiError(error: unknown) {
    showError(getApiErrorMessage(error));
  }

  const subtotal = useMemo(() => cart.reduce((total, item) => total + item.product.salePrice * item.quantity, 0), [cart]);
  const discountAmount = 0;
  const totalPayable = Math.max(subtotal - discountAmount, 0);

  async function loadCategories() {
    try {
      const data = await categoryService.list({ page: 1, limit: 200, status: "ACTIVE" });
      setCategories(sortByIdAsc(data.items));
    } catch (error) {
      showApiError(error);
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
      showApiError(error);
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
      showApiError(error);
    }
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
        showError(t("toast.pos.resumeDraftInvalid"));
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
              imageUrl: null,
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
      showSuccess(t("toast.pos.resumeDraftSuccess", { code: order.orderCode }));
    } catch (error) {
      showApiError(error);
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

  function addToCart(product: Product) {
    if (product.stockQuantity <= 0) return;

    setCart((currentCart) => {
      const found = currentCart.find((item) => item.product.id === product.id);
      if (found) {
        return currentCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stockQuantity) }
            : item
        );
      }

      return [...currentCart, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: number, delta: number) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.min(Math.max(item.quantity + delta, 1), item.product.stockQuantity) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: number) {
    setCart((currentCart) => currentCart.filter((item) => item.product.id !== productId));
  }

  function buildOrderBody() {
    return {
      customerId: customerId ? Number(customerId) : undefined,
      items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    };
  }

  async function createDraft() {
    if (cart.length === 0) {
      showError(t("toast.pos.emptyCart"));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      const data = await orderService.createDraft(buildOrderBody());
      setDraftOrder(data);
      showSuccess(t("toast.pos.draftCreated"));
    } catch (error) {
      showApiError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateDraft() {
    if (!draftOrder) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      const data = await orderService.updateDraft(draftOrder.id, buildOrderBody());
      setDraftOrder(data);
      showSuccess(t("toast.pos.draftUpdated"));
    } catch (error) {
      showApiError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function checkout() {
    if (!draftOrder) {
      showError(t("toast.pos.checkoutRequireDraft"));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await orderService.checkout(draftOrder.id, { paymentMethod });
      window.localStorage.removeItem(POS_RESUME_DRAFT_ORDER_ID_KEY);
      showSuccess(t("toast.pos.checkoutSuccess"));
      setCart([]);
      setDraftOrder(null);
      await loadProducts();
    } catch (error) {
      showApiError(error);
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
      showSuccess(t("toast.pos.customerCreated"));
    } catch (error) {
      showApiError(error);
    }
  }

  function handleProductSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadProducts();
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="space-y-6">
        <PageHeader title={t("pos.title")} description={t("pos.description")} />
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* Left: product search and product cards */}
          <div className="min-w-0 space-y-4">
            <Card>
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

                <div className="flex gap-2 overflow-x-auto pb-1">
                  <Button
                    type="button"
                    variant={selectedCategoryId === "" ? "default" : "outline"}
                    size="sm"
                    className="shrink-0"
                    onClick={() => setSelectedCategoryId("")}
                  >
                    {t("pos.allProducts")}
                  </Button>
                  {categories.map((category) => (
                    <Button
                      key={category.id}
                      type="button"
                      variant={selectedCategoryId === String(category.id) ? "default" : "outline"}
                      size="sm"
                      className="shrink-0"
                      onClick={() => setSelectedCategoryId(String(category.id))}
                    >
                      {category.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {isLoadingProducts ? <LoadingState /> : null}
            {!isLoadingProducts && products.length === 0 ? <EmptyState message={t("message.noProducts")} /> : null}

            <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {products.map((product) => {
                const isLowStock = product.stockQuantity <= product.minStock;
                return (
                  <Card key={product.id} className="min-w-0 overflow-hidden">
                    <div className="h-36 bg-muted">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                      ) : null}
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

          {/* Right: customer, scrollable cart, sticky payment summary */}
          <Card className="flex h-[calc(100vh-120px)] min-h-[640px] min-w-0 flex-col overflow-hidden xl:sticky xl:top-24 xl:self-start">
            <CardHeader className="shrink-0 border-b">
              <CardTitle>{t("pos.cart")}</CardTitle>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <div className="shrink-0 space-y-3 border-b p-4">
                <form onSubmit={searchCustomers} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    placeholder={t("pos.customerPlaceholder")}
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    {t("pos.find")}
                  </Button>
                  <Button type="button" variant="outline" size="icon" title={t("customers.quickAdd")} onClick={() => setIsCustomerDialogOpen(true)}>
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

              <div className="min-h-0 flex-1 max-h-[calc(100vh-320px)] overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {t("message.emptyCart")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.product.id} className="rounded-xl border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 font-medium">{item.product.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(item.product.salePrice)}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.product.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center rounded-lg border">
                            <Button variant="ghost" size="icon" onClick={() => changeQuantity(item.product.id, -1)}>
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="min-w-10 text-center font-semibold">{item.quantity}</span>
                            <Button variant="ghost" size="icon" onClick={() => changeQuantity(item.product.id, 1)}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="font-semibold">{formatCurrency(item.product.salePrice * item.quantity)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-10 shrink-0 border-t bg-card p-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
                <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
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

                <div className="mt-3 space-y-2">
                  <Label>{t("pos.paymentMethod")}</Label>
                  <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>{t(`paymentMethod.${method}`)}</option>
                    ))}
                  </Select>
                </div>

                {draftOrder ? <div className="mt-3 rounded-lg bg-muted p-2 text-sm">{t("pos.draftCode", { code: draftOrder.orderCode })}</div> : null}

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" disabled={isSubmitting || cart.length === 0} onClick={draftOrder ? updateDraft : createDraft}>
                    {draftOrder ? t("pos.updateDraft") : t("pos.createDraft")}
                  </Button>
                  <Button type="button" disabled={isSubmitting || !draftOrder} onClick={checkout}>
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
              <DialogTitle>{t("pos.quickCustomer")}</DialogTitle>
              <DialogDescription>{t("pos.quickCustomerDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={createQuickCustomer} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("customers.fullName")}</Label>
                <Input placeholder="Nguyễn Văn An" value={quickCustomerName} onChange={(event) => setQuickCustomerName(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t("common.phone")}</Label>
                <Input placeholder="0901234567" value={quickCustomerPhone} onChange={(event) => setQuickCustomerPhone(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t("common.email")}</Label>
                <Input placeholder="khachhang@example.com" value={quickCustomerEmail} onChange={(event) => setQuickCustomerEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("customers.address")}</Label>
                <Input placeholder="Số nhà, đường, phường/xã, quận/huyện" value={quickCustomerAddress} onChange={(event) => setQuickCustomerAddress(event.target.value)} />
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit">{t("common.create")}</Button>
                <Button type="button" variant="outline" onClick={() => setIsCustomerDialogOpen(false)}>{t("common.cancel")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
