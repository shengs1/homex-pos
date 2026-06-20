import { redirect } from "next/navigation";

export default function PurchaseOrdersRedirectPage() {
  redirect("/suppliers?tab=purchaseOrders");
}
