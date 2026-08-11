import { redirect } from "next/navigation";

export default function PurchaseOrdersRedirectPage() {
  redirect("/inventory?tab=import");
}
