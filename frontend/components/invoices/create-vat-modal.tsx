"use client";

import { useState, useRef, useEffect } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { vatInvoiceService, orderService } from "@/services/homex.service";
import { formatCurrency } from "@/lib/format";
import { getApiErrorMessage } from "@/lib/api";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";

type CreateVatModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialOrderCode?: string;
};

export function CreateVatModal({ isOpen, onClose, onSuccess, initialOrderCode }: CreateVatModalProps) {
  const [orderCode, setOrderCode] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [note, setNote] = useState("");

  const [isCheckingOrder, setIsCheckingOrder] = useState(false);
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [orderError, setOrderError] = useState("");

  const [isLookingUpTax, setIsLookingUpTax] = useState(false);
  const [taxError, setTaxError] = useState("");

  const { t } = useLanguage();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialOrderCode) {
        setOrderCode(initialOrderCode);
        void checkOrderCode(initialOrderCode);
      }
    } else {
      setOrderCode("");
      setTaxCode("");
      setCompanyName("");
      setCompanyAddress("");
      setBuyerEmail("");
      setNote("");
      setOrderInfo(null);
      setOrderError("");
      setTaxError("");
    }
  }, [isOpen, initialOrderCode]);

  async function checkOrderCode(targetCode: string) {
    if (!targetCode.trim()) return;

    setIsCheckingOrder(true);
    setOrderError("");
    setOrderInfo(null);

    try {
      const order = await orderService.getByCode(targetCode.trim());
      if (order.status === "CANCELLED") {
        setOrderError(t("vat.orderCancelled"));
      } else if (order.status !== "COMPLETED") {
        setOrderError(t("vat.orderNotCompleted"));
      } else if ((order as any).vatInvoiceRequest) {
        const existingReq = (order as any).vatInvoiceRequest;
        if (existingReq.status === "PENDING") {
          setOrderError(t("vat.pendingRequestExists"));
        } else if (existingReq.status === "APPROVED") {
          setOrderError(t("vat.alreadyIssued"));
        }
      } else {
        setOrderInfo(order);
        if (order.customer?.email && !buyerEmail) {
          setBuyerEmail(order.customer.email);
        }
      }
    } catch (error) {
      setOrderError(t("vat.orderNotFound"));
    } finally {
      setIsCheckingOrder(false);
    }
  }

  async function handleCheckOrder() {
    await checkOrderCode(orderCode);
  }

  async function handleTaxCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setTaxCode(value);
    setTaxError("");

    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);

    if (value.length >= 10 && value.length <= 14) {
      lookupTimeoutRef.current = setTimeout(async () => {
        setIsLookingUpTax(true);
        try {
          // taxLookup returns the raw data from the endpoint because getData unwraps it
          // The endpoint returns { taxCode, companyName, companyAddress, source } as `data`
          const res = await vatInvoiceService.taxLookup(value);
          setCompanyName(res.companyName);
          setCompanyAddress(res.companyAddress);
        } catch (err) {
          setTaxError(t("vat.taxLookupFailed"));
        } finally {
          setIsLookingUpTax(false);
        }
      }, 800);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderInfo || !companyName.trim() || !taxCode.trim()) return;

    setIsSubmitting(true);

    try {
      await vatInvoiceService.create({
        orderCode: orderInfo.orderCode,
        companyName,
        taxCode,
        companyAddress,
        buyerEmail,
        note,
      });

      toast.success(t("vat.requestSent"));
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>{t("vat.requestVat")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form id="vat-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Order Check Section */}
            <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
              <Label className="font-semibold text-slate-700">{t("vat.invoiceInfoSection")}</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder={t("vat.orderCodePlaceholder")} 
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  className="bg-white"
                />
                <Button type="button" onClick={handleCheckOrder} disabled={isCheckingOrder || !orderCode.trim()}>
                  {isCheckingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                  {t("common.check")}
                </Button>
              </div>

              {orderError && <div className="text-sm text-red-600 font-medium">{orderError}</div>}
              
              {orderInfo && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <div className="flex justify-between font-medium text-emerald-800">
                    <span>{t("vat.validInvoice", { code: orderInfo.orderCode })}</span>
                    <span>{formatCurrency(orderInfo.totalAmount)}</span>
                  </div>
                  <div className="text-emerald-600 mt-1">
                    {t("orders.customer")}: {orderInfo.customer?.fullName || t("customers.retail")}
                  </div>
                </div>
              )}
            </div>

            {/* Tax Section */}
            <div className={`space-y-4 rounded-xl border p-4 transition-opacity ${!orderInfo ? 'opacity-50 pointer-events-none' : ''}`}>
              <Label className="font-semibold text-slate-700">{t("vat.issueInfoSection")}</Label>
              
              <div className="space-y-1.5">
                <Label>{t("vat.taxCode")} <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input 
                    value={taxCode}
                    onChange={handleTaxCodeChange}
                    placeholder={t("vat.taxCodePlaceholder")}
                    required
                  />
                  {isLookingUpTax && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
                {taxError && <p className="text-xs text-orange-600 font-medium">{taxError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>{t("vat.companyBuyer")} <span className="text-red-500">*</span></Label>
                <Input 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t("vat.companyNamePlaceholder")}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("vat.companyAddress")}</Label>
                <Textarea 
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder={t("vat.companyAddressPlaceholder")}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("vat.invoiceEmail")}</Label>
                  <Input 
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="email@company.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("common.note")}</Label>
                  <Input 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("vat.notePlaceholder")}
                  />
                </div>
              </div>


            </div>

          </form>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0 bg-slate-50/50">
          <Button variant="outline" onClick={onClose} type="button">{t("common.cancel")}</Button>
          <Button 
            type="submit" 
            form="vat-form" 
            disabled={!orderInfo || !companyName.trim() || !taxCode.trim() || isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("vat.submitRequest")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
