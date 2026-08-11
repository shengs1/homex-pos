"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "@/contexts/language-context";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order, PublicInvoice, Setting } from "@/types/domain";

type PrintableInvoiceProps = {
  order: Order | PublicInvoice;
  setting?: Setting | null;
  publicUrl?: string;
  className?: string;
};

function getCashierName(order: Order | PublicInvoice) {
  if ("cashierName" in order) return order.cashierName || "-";
  return order.user?.fullName || "-";
}

function getCustomerName(order: Order | PublicInvoice) {
  return order.customer?.fullName || "-";
}

function getSetting(order: Order | PublicInvoice, setting?: Setting | null) {
  if (setting) return setting;
  if ("setting" in order) return order.setting;
  return null;
}

function truncateProductName(name: string, maxLen: number = 38) {
  if (!name) return "";
  return name.length > maxLen ? `${name.substring(0, maxLen)}...` : name;
}

export function PrintableInvoice({ order, setting, publicUrl, className }: PrintableInvoiceProps) {
  const { t } = useLanguage();
  const invoiceSetting = getSetting(order, setting);
  const isK80 = (invoiceSetting?.printPaperSize || "K80").toUpperCase() === "K80";
  const paperClassName = isK80
    ? "mx-auto w-[80mm] max-w-[80mm] bg-white px-[3mm] py-[4mm] text-[11px] leading-snug text-black print:w-[80mm] print:max-w-[80mm] print:p-[3mm]"
    : "mx-auto max-w-[210mm] bg-white p-6 text-sm text-black print:max-w-[210mm] print:p-0";

  const getPublicBaseUrl = () => {
    if (typeof window === "undefined") return "https://disparate-sizable-brick.ngrok-free.dev";
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "https://disparate-sizable-brick.ngrok-free.dev";
    }
    return window.location.origin;
  };

  const baseUrl = getPublicBaseUrl();
  const qrCodeValue = publicUrl || `${baseUrl}/tra-cuu-bao-hanh?code=${order.orderCode}`;

  return (
    <div className={cn("print-area", className)}>
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
      <div className={paperClassName}>
        {/* Header Store Info */}
        <div className="text-center">
          <h2 className="text-base font-black uppercase tracking-tight">{invoiceSetting?.storeName || "Homex POS"}</h2>
          {invoiceSetting?.storeAddress ? <p className="text-[10px] text-gray-700">{invoiceSetting.storeAddress}</p> : null}
          {invoiceSetting?.storeHotline ? <p className="text-[10px] text-gray-700">Hotline: {invoiceSetting.storeHotline}</p> : null}
          <div className="mt-2 border-t border-dashed border-black pt-2">
            <h1 className="text-lg font-black tracking-wide uppercase">{t("invoices.invoiceTitle")}</h1>
          </div>
        </div>

        {/* Order Details Meta */}
        <div className="mt-2.5 grid gap-0.5 text-[10px]">
          <p><span className="font-bold">{t("invoice.orderCode")}:</span> <span className="font-black">{order.orderCode}</span></p>
          <p><span className="font-bold">{t("invoice.createdDate")}:</span> {formatDateTime(order.createdAt)}</p>
          <p><span className="font-bold">{t("invoice.cashier")}:</span> {getCashierName(order)}</p>
          <p><span className="font-bold">{t("invoice.customer")}:</span> {getCustomerName(order)}</p>
        </div>

        {/* Products Table */}
        <table className={`mt-3 w-full border-collapse text-left ${isK80 ? "text-[10px]" : "text-xs"}`}>
          <thead>
            <tr className="border-y border-black font-bold">
              <th className="py-1.5 pr-1">{t("products.product")}</th>
              <th className="py-1.5 text-center px-1">{t("invoice.quantityShort")}</th>
              <th className="py-1.5 text-right px-1">{t("invoice.unitPrice")}</th>
              <th className="py-1.5 text-right pl-1">{t("invoice.lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {order.orderDetails.map((detail) => {
              const rawName = detail.product?.name || `#${detail.productId}`;
              const displayName = truncateProductName(rawName, isK80 ? 38 : 50);
              return (
                <tr key={detail.id} className="border-b border-dashed border-gray-300">
                  <td className="py-1.5 pr-1 align-top">
                    <div className="font-semibold leading-tight">{displayName}</div>
                    {detail.product?.sku ? <div className="text-[9px] text-gray-500 font-mono">{detail.product.sku}</div> : null}
                  </td>
                  <td className="py-1.5 text-center px-1 align-top font-bold">{detail.quantity}</td>
                  <td className="py-1.5 text-right px-1 align-top font-semibold whitespace-nowrap">{formatNumber(detail.unitPrice)}</td>
                  <td className="py-1.5 text-right pl-1 align-top font-black whitespace-nowrap">{formatNumber(detail.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Financial Summary */}
        <div className="mt-3 space-y-1 border-t border-b border-dashed border-black py-2.5 text-right text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-600">{t("pos.subtotal")}:</span>
            <span className="font-semibold">{formatCurrency(order.totalAmount)}</span>
          </div>
          {order.payment && order.payment.amount < order.totalAmount ? (
            <div className="flex justify-between text-emerald-700">
              <span>{t("pos.discount")}:</span>
              <span className="font-semibold">-{formatCurrency(Number(order.totalAmount) - Number(order.payment.amount))}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-xs font-black pt-1 border-t border-slate-100">
            <span>{t("pos.totalPayable")}:</span>
            <span>{formatCurrency(order.payment?.amount || order.totalAmount)}</span>
          </div>
          {order.payment ? (
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-600">{t("pos.paymentMethod")}:</span>
              <span className="font-semibold">{t(`paymentMethod.${order.payment.method}`)}</span>
            </div>
          ) : null}
          {order.payment?.cashReceived !== null && order.payment?.cashReceived !== undefined ? (
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-600">{t("invoice.amountPaid")}:</span>
              <span className="font-semibold">{formatCurrency(order.payment.cashReceived)}</span>
            </div>
          ) : null}
          {order.payment?.changeAmount !== null && order.payment?.changeAmount !== undefined ? (
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-600">{t("invoice.changeReturned")}:</span>
              <span className="font-bold text-emerald-800">{formatCurrency(order.payment.changeAmount)}</span>
            </div>
          ) : null}
        </div>

        {/* QR Code Section */}
        <div className="mt-3 flex flex-col items-center gap-1 text-center">
          <QRCodeSVG value={qrCodeValue} size={isK80 ? 88 : 110} />
          <p className="text-[10px] font-bold text-gray-700 mt-0.5">{t("invoice.lookupQrHint")}</p>
        </div>

        {/* Return & Warranty Policy Notice */}
        <div className="mt-3 border-t border-dashed border-black pt-2 text-center space-y-1 text-[10px]">
          <p className="font-semibold text-gray-700 leading-tight">
            {t("invoice.returnPolicy")}
          </p>
          <p className="font-black text-black text-[11px] pt-1">
            {t("invoice.thankYou")}
          </p>
        </div>
      </div>
    </div>
  );
}

