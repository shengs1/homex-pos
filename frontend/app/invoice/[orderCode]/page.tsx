"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useToast } from "@/contexts/toast-context";
import { ErrorState, LoadingState } from "@/components/shared/message-state";
import { PrintableInvoice } from "@/components/shared/printable-invoice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { publicInvoiceService } from "@/services/homex.service";
import type { PublicInvoice } from "@/types/domain";

export default function PublicInvoicePage() {
  const params = useParams<{ orderCode: string }>();
  const orderCode = String(params.orderCode || "");
  const { t } = useLanguage();
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadInvoice() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await publicInvoiceService.detail(orderCode);
      setInvoice(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (orderCode) {
      loadInvoice();
    }
  }, [orderCode]);

  async function submitVatRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      await publicInvoiceService.requestVat(orderCode, {
        companyName,
        taxCode,
        companyAddress,
        buyerEmail,
        note,
      });
      toast.success(t("vat.requestSent"));
      await loadInvoice();
    } catch (error) {
      toast.error(getApiErrorMessage(error) || t("toast.error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6 print:hidden no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("invoice.publicTitle")}</h1>
            <p className="text-sm text-muted-foreground">{orderCode}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.print()} disabled={!invoice}>
            <Printer className="h-4 w-4" />
            {t("invoices.printInvoice")}
          </Button>
        </div>

        <ErrorState message={errorMessage} />
        {isLoading ? <LoadingState /> : null}

        {invoice ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader>
                <CardTitle>{t("invoices.invoiceTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-2 md:grid-cols-2">
                  <p>{t("orders.orderCode")}: <span className="font-semibold">{invoice.orderCode}</span></p>
                  <p>{t("common.createdAt")}: {formatDateTime(invoice.createdAt)}</p>
                  <p>{t("orders.cashier")}: {invoice.cashierName || "-"}</p>
                  <p>{t("orders.total")}: <span className="font-semibold">{formatCurrency(invoice.totalAmount)}</span></p>
                </div>
                <PrintableInvoice order={invoice} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("vat.requestTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                {invoice.vatInvoiceRequest ? (
                  <div className="space-y-2 text-sm">
                    <p>{t("common.status")}: {t(`status.${invoice.vatInvoiceRequest.status}`)}</p>
                    {invoice.vatInvoiceRequest.redInvoiceCode ? <p>{t("vat.redInvoiceCode")}: {invoice.vatInvoiceRequest.redInvoiceCode}</p> : null}
                  </div>
                ) : (
                  <form onSubmit={submitVatRequest} className="space-y-3">
                    <div className="space-y-2">
                      <Label>{t("vat.companyName")}</Label>
                      <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("vat.taxCode")}</Label>
                      <Input value={taxCode} onChange={(event) => setTaxCode(event.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("vat.companyAddress")}</Label>
                      <Textarea value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.email")}</Label>
                      <Input value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.note")}</Label>
                      <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={isSubmitting}>{t("vat.submitRequest")}</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {invoice ? <PrintableInvoice order={invoice} className="hidden print:block" /> : null}
    </main>
  );
}
