"use client";

import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "@/contexts/language-context";
import { formatCurrency, formatDateTime } from "@/lib/format";
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

export function PrintableInvoice({ order, setting, publicUrl, className }: PrintableInvoiceProps) {
  const { t } = useLanguage();
  const invoiceSetting = getSetting(order, setting);

  return (
    <div className={className}>
      <div className="mx-auto max-w-[780px] bg-white p-6 text-sm text-black print:max-w-none print:p-0">
        <div className="text-center">
          <h2 className="text-lg font-bold">{invoiceSetting?.storeName || "Homex POS"}</h2>
          {invoiceSetting?.storeAddress ? <p>{invoiceSetting.storeAddress}</p> : null}
          {invoiceSetting?.storeHotline ? <p>{t("invoice.hotline")}: {invoiceSetting.storeHotline}</p> : null}
          <div className="mt-3 border-t border-dashed border-black pt-3">
            <h1 className="text-xl font-bold">{t("invoice.title")}</h1>
          </div>
        </div>

        <div className="mt-4 grid gap-1">
          <p>{t("orders.orderCode")}: <span className="font-semibold">{order.orderCode}</span></p>
          <p>{t("common.createdAt")}: {formatDateTime(order.createdAt)}</p>
          <p>{t("orders.cashier")}: {getCashierName(order)}</p>
          <p>{t("orders.customer")}: {getCustomerName(order)}</p>
        </div>

        <table className="mt-4 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-y border-black">
              <th className="py-2 pr-2">{t("products.product")}</th>
              <th className="py-2 text-center">{t("reports.quantity")}</th>
              <th className="py-2 text-right">{t("orders.unitPrice")}</th>
              <th className="py-2 text-right">{t("orders.lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {order.orderDetails.map((detail) => (
              <tr key={detail.id} className="border-b border-dashed border-gray-400">
                <td className="py-2 pr-2">
                  <div className="font-medium">{detail.product?.name || `#${detail.productId}`}</div>
                  <div>{detail.product?.sku || ""}</div>
                </td>
                <td className="py-2 text-center">{detail.quantity}</td>
                <td className="py-2 text-right">{formatCurrency(detail.unitPrice)}</td>
                <td className="py-2 text-right">{formatCurrency(detail.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 space-y-1 border-b border-dashed border-black pb-4 text-right">
          <p>{t("orders.total")}: <span className="font-bold">{formatCurrency(order.totalAmount)}</span></p>
          {order.payment ? <p>{t("payments.method")}: {t(`paymentMethod.${order.payment.method}`)}</p> : null}
          {order.payment?.cashReceived !== null && order.payment?.cashReceived !== undefined ? (
            <p>{t("pos.cashReceived")}: {formatCurrency(order.payment.cashReceived)}</p>
          ) : null}
          {order.payment?.changeAmount !== null && order.payment?.changeAmount !== undefined ? (
            <p>{t("pos.changeAmount")}: {formatCurrency(order.payment.changeAmount)}</p>
          ) : null}
        </div>

        {publicUrl ? (
          <div className="mt-4 flex flex-col items-center gap-2 text-center">
            <QRCodeSVG value={publicUrl} size={116} />
            <p className="text-xs">{t("invoice.scanPublic")}</p>
          </div>
        ) : null}

        <p className="mt-5 text-center text-xs">{t("invoice.thankYou")}</p>
      </div>
    </div>
  );
}
